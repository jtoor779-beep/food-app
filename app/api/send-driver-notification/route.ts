import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type DriverPushTokenRow = {
  user_id: string;
  expo_push_token: string;
  device_platform: string | null;
};

type ProfileRow = {
  user_id: string;
};

type ExpoTicket = {
  status?: string;
  details?: {
    error?: string;
    [k: string]: any;
  };
  [k: string]: any;
};

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";

const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error(
    "Missing SUPABASE envs: NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
  );
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

const ORDER_NOTIFY_COOLDOWN_MS = Number(process.env.DRIVER_PUSH_COOLDOWN_MS || 8_000);
const orderLastNotifiedAt = new Map<string, number>();

function normalizeDriverIds(rows: ProfileRow[] | null | undefined): string[] {
  return (rows || [])
    .map((row) => String(row?.user_id || "").trim())
    .filter(Boolean);
}

function isLikelyExpoPushToken(token: string): boolean {
  return (
    token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken[")
  );
}

function isOnCooldown(orderId: string): boolean {
  const now = Date.now();
  const last = orderLastNotifiedAt.get(orderId) || 0;
  if (now - last < ORDER_NOTIFY_COOLDOWN_MS) {
    return true;
  }
  orderLastNotifiedAt.set(orderId, now);
  return false;
}

async function cleanupInvalidTokens(tokens: string[]) {
  if (!tokens.length) return;

  try {
    const { error } = await supabaseAdmin
      .from("driver_push_tokens")
      .delete()
      .in("expo_push_token", tokens);

    if (error) {
      console.error("driver_push_tokens cleanup error:", error);
    }
  } catch (err) {
    console.error("driver_push_tokens cleanup exception:", err);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const orderId = String(body?.orderId || "").trim();
    const restaurantName = String(body?.restaurantName || "Restaurant").trim();

    if (!orderId) {
      return NextResponse.json(
        { success: false, message: "Missing orderId" },
        { status: 400 }
      );
    }

    if (ORDER_NOTIFY_COOLDOWN_MS > 0 && isOnCooldown(orderId)) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: "cooldown_active",
        cooldownMs: ORDER_NOTIFY_COOLDOWN_MS,
        sent: 0,
      });
    }

    // Push should reach every approved driver device, not only the subset
    // currently marked online, because drivers can still open available orders
    // and accept them even if that online flag is stale.
    const { data: approvedDrivers, error: approvedDriversError } =
      await supabaseAdmin
        .from("profiles")
        .select("user_id")
        .eq("role", "delivery_partner")
        .eq("delivery_approved", true)
        .eq("delivery_disabled", false);

    if (approvedDriversError) {
      console.error("profiles approved query error:", approvedDriversError);
      return NextResponse.json(
        { success: false, message: approvedDriversError.message },
        { status: 500 }
      );
    }

    let audience: "approved" | "token_fallback_all" = "approved";
    const driverIds = normalizeDriverIds(approvedDrivers as ProfileRow[]);

    if (!driverIds.length) {
      return NextResponse.json({
        success: true,
        message: "No eligible drivers found.",
        audience,
        sent: 0,
      });
    }

    // 3) Get push tokens for selected drivers.
    const { data: tokenRows, error: tokensError } = await supabaseAdmin
      .from("driver_push_tokens")
      .select("user_id, expo_push_token, device_platform")
      .in("user_id", driverIds);

    if (tokensError) {
      console.error("driver_push_tokens query error:", tokensError);
      return NextResponse.json(
        { success: false, message: tokensError.message },
        { status: 500 }
      );
    }

    const allTokens = (tokenRows || [])
      .map((row: DriverPushTokenRow) => String(row?.expo_push_token || "").trim())
      .filter(Boolean);

    let validTokens = Array.from(new Set(allTokens.filter(isLikelyExpoPushToken)));

    // 3b) Last-resort fallback: if targeted selection has no valid token,
    // send to all known driver push tokens.
    if (!validTokens.length) {
      const { data: allTokenRows, error: allTokensError } = await supabaseAdmin
        .from("driver_push_tokens")
        .select("expo_push_token");

      if (allTokensError) {
        console.error("driver_push_tokens fallback query error:", allTokensError);
        return NextResponse.json(
          { success: false, message: allTokensError.message },
          { status: 500 }
        );
      }

      const fallbackTokens = Array.from(
        new Set(
          (allTokenRows || [])
            .map((row: any) => String(row?.expo_push_token || "").trim())
            .filter((token: string) => token && isLikelyExpoPushToken(token))
        )
      );

      validTokens = fallbackTokens;
      audience = "token_fallback_all";
    }

    if (!validTokens.length) {
      return NextResponse.json({
        success: true,
        message: "No valid Expo push tokens found.",
        audience,
        sent: 0,
        diagnostics: {
          eligibleDrivers: driverIds.length,
          tokenRows: (tokenRows || []).length,
          nonEmptyTokens: allTokens.length,
        },
      });
    }

    // 4) Build push messages.
    const messages = validTokens.map((token) => ({
      to: token,
      sound: "default",
      title: "New Delivery Order",
      body: `${restaurantName} has a new order ready to accept.`,
      priority: "high",
      ttl: 3600,
      badge: 1,
      mutableContent: true,
      interruptionLevel: "time-sensitive",
      data: {
        type: "available_order",
        orderId,
        restaurantName,
        screen: "/available-orders",
      },
    }));

    // 5) Send to Expo push service.
    const expoRes = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });

    const expoJson = await expoRes.json();

    if (!expoRes.ok) {
      return NextResponse.json(
        {
          success: false,
          message: "Expo push service request failed.",
          audience,
          sent: 0,
          expo: expoJson,
        },
        { status: 502 }
      );
    }

    // 6) Cleanup tokens that Expo explicitly marked unregistered.
    const tickets: ExpoTicket[] = Array.isArray(expoJson?.data) ? expoJson.data : [];
    const invalidTokens = tickets
      .map((ticket, index) => {
        const err = ticket?.details?.error;
        if (ticket?.status === "error" && err === "DeviceNotRegistered") {
          return validTokens[index] || "";
        }
        return "";
      })
      .filter(Boolean);

    if (invalidTokens.length) {
      await cleanupInvalidTokens(Array.from(new Set(invalidTokens)));
    }

    return NextResponse.json({
      success: true,
      message: "Push notification request processed.",
      audience,
      sent: validTokens.length,
      invalidTokensRemoved: invalidTokens.length,
      diagnostics: {
        eligibleDrivers: driverIds.length,
        tokenRows: (tokenRows || []).length,
        validTokens: validTokens.length,
      },
    });
  } catch (error: any) {
    console.error("send-driver-notification API error:", error);

    return NextResponse.json(
      {
        success: false,
        message: error?.message || "Unexpected server error",
      },
      { status: 500 }
    );
  }
}
