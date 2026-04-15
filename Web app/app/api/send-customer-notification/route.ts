import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

function clean(value: unknown) {
  return String(value || "").trim();
}

function cleanLower(value: unknown) {
  return clean(value).toLowerCase();
}

function isSchemaMismatchError(error: any) {
  const msg = cleanLower(error?.message);
  return (
    msg.includes("does not exist") ||
    msg.includes("schema cache") ||
    msg.includes("could not find")
  );
}

function extractMissingColumnName(error: any) {
  const msg = clean(error?.message);
  const match = msg.match(/'([^']+)'/);
  if (!match?.[1]) return "";
  const raw = match[1];
  if (!raw.includes(".")) return raw.trim();
  const parts = raw.split(".");
  return String(parts[parts.length - 1] || "").trim();
}

function isLikelyExpoPushToken(token: string) {
  return (
    token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken[")
  );
}

async function collectCustomerExpoTokens(userId: string) {
  const tables = [
    { table: "customer_push_tokens", roleFilter: null },
    { table: "push_tokens", roleFilter: "customer" },
  ];

  const tokens = new Set<string>();
  for (const entry of tables) {
    try {
      let query = supabaseAdmin
        .from(entry.table)
        .select("expo_push_token")
        .eq("user_id", userId);
      if (entry.roleFilter) query = query.eq("role", entry.roleFilter);
      const { data, error } = await query;
      if (error) continue;
      ((data as any[]) || []).forEach((row) => {
        const token = clean(row?.expo_push_token);
        if (token && isLikelyExpoPushToken(token)) tokens.add(token);
      });
    } catch {
      // ignore incompatible table shapes
    }
  }
  return Array.from(tokens);
}

async function insertNotificationRowAuto(payload: Record<string, any>) {
  const nextPayload = { ...payload };

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const { error } = await supabaseAdmin.from("notifications").insert(nextPayload);
    if (!error) return true;
    if (!isSchemaMismatchError(error)) throw error;
    const missing = extractMissingColumnName(error);
    if (!missing || !(missing in nextPayload)) throw error;
    delete nextPayload[missing];
  }

  throw new Error("Unable to insert notification row with the current schema.");
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const userId = clean(body?.user_id || body?.userId);
    const title = clean(body?.title || "Homyfod update");
    const message = clean(body?.body || body?.message || "There is a new update in your account.");
    const type = clean(body?.type || "order") || "order";
    const link = clean(body?.link || "/notifications") || "/notifications";
    const orderId = clean(body?.orderId || body?.order_id) || null;
    const orderType = clean(body?.orderType || body?.order_type) || null;
    const status = clean(body?.status) || null;
    const driverName = clean(body?.driverName || body?.driver_name) || null;
    const subtitle = clean(body?.subtitle) || null;
    const channelId = type === "live_tracking" ? "live-delivery" : "default";

    if (!userId) {
      return NextResponse.json(
        { success: false, message: "Missing user id." },
        { status: 400 }
      );
    }

    await insertNotificationRowAuto({
      user_id: userId,
      title,
      body: message,
      type,
      link,
      order_id: orderId,
      order_type: orderType,
      status,
      subtitle,
      driver_name: driverName,
      is_read: false,
    });

    const tokens = await collectCustomerExpoTokens(userId);
    if (tokens.length) {
      const messages = tokens.map((token) => ({
        to: token,
        sound: "default",
        title,
        body: message,
        subtitle: subtitle || undefined,
        priority: "high",
        ttl: 3600,
        badge: 1,
        mutableContent: true,
        interruptionLevel: "time-sensitive",
        channelId,
        data: {
          type,
          link,
          orderId,
          orderType,
          status,
          driverName,
        },
      }));

      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(messages),
      });
    }

    return NextResponse.json({ success: true, sent: tokens.length });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || "Unable to send customer notification." },
      { status: 500 }
    );
  }
}
