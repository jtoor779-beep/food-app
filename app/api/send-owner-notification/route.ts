import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import webpush from "web-push";

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

function shortId(id: unknown) {
  return clean(id).slice(0, 8);
}

function ownerNotificationDefaults(input: {
  type?: string | null;
  status?: string | null;
  orderId?: string | null;
  orderType?: string | null;
}) {
  const type = cleanLower(input.type);
  const status = cleanLower(input.status);
  const orderLabel = cleanLower(input.orderType).includes("groc") ? "grocery order" : "order";
  const sid = shortId(input.orderId);
  const withId = sid ? ` #${sid}` : "";

  if (type === "order") {
    if (status === "accepted" || status === "confirmed") {
      return {
        title: "Order confirmed",
        body: `You confirmed ${orderLabel}${withId}.`,
      };
    }
    if (status === "preparing") {
      return {
        title: "Order moved to preparing",
        body: `${orderLabel.charAt(0).toUpperCase() + orderLabel.slice(1)}${withId} is now preparing.`,
      };
    }
    if (status === "ready") {
      return {
        title: "Order marked ready",
        body: `${orderLabel.charAt(0).toUpperCase() + orderLabel.slice(1)}${withId} is ready for pickup or driver confirmation.`,
      };
    }
    if (status === "delivered") {
      return {
        title: "Order delivered",
        body: `${orderLabel.charAt(0).toUpperCase() + orderLabel.slice(1)}${withId} was delivered successfully.`,
      };
    }
    if (status === "rejected") {
      return {
        title: "Order rejected",
        body: `You rejected ${orderLabel}${withId}.`,
      };
    }
    if (status === "pending") {
      return {
        title: cleanLower(input.orderType).includes("groc") ? "New grocery order received" : "New order received",
        body: `A new ${orderLabel}${withId} is waiting for your action.`,
      };
    }
  }

  return {
    title: "Homyfod owner update",
    body: "There is a new update in your store.",
  };
}

async function resolveOwnerUserIdFromOrder(orderId: string, orderType: string | null) {
  const normalizedType = cleanLower(orderType);
  const isGrocery = normalizedType.includes("groc");
  const orderTable = isGrocery ? "grocery_orders" : "orders";
  const ownerTable = isGrocery ? "grocery_stores" : "restaurants";
  const ownerIdColumn = isGrocery ? "store_id" : "restaurant_id";

  const { data: orderRow, error: orderError } = await supabaseAdmin
    .from(orderTable)
    .select(`id, ${ownerIdColumn}`)
    .eq("id", orderId)
    .maybeSingle();

  const ownerEntityId = clean((orderRow as Record<string, unknown> | null)?.[ownerIdColumn]);
  if (orderError || !ownerEntityId) return "";

  const { data: ownerRow, error: ownerError } = await supabaseAdmin
    .from(ownerTable)
    .select("owner_user_id, owner_id, user_id, created_by, owner")
    .eq("id", ownerEntityId)
    .maybeSingle();

  if (ownerError) return "";

  return clean(
    ownerRow?.owner_user_id ||
      ownerRow?.owner_id ||
      ownerRow?.user_id ||
      ownerRow?.created_by ||
      ownerRow?.owner,
  );
}

async function collectOwnerExpoTokens(userId: string) {
  const tables = [
    { table: "owner_push_tokens", roleFilter: null },
    { table: "push_tokens", roleFilter: "restaurant_owner" },
    { table: "push_tokens", roleFilter: "grocery_owner" },
    { table: "push_tokens", roleFilter: "owner" },
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

  throw new Error("Unable to insert owner notification row with the current schema.");
}

function configureWebPush() {
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || "";
  if (!vapidPublicKey || !vapidPrivateKey) return false;

  webpush.setVapidDetails("mailto:admin@homyfod.com", vapidPublicKey, vapidPrivateKey);
  return true;
}

async function sendOwnerWebPush(
  userId: string,
  payload: { title: string; body: string; url: string },
) {
  if (!configureWebPush()) return 0;

  try {
    const { data: subs, error } = await supabaseAdmin
      .from("push_subscriptions")
      .select("endpoint,p256dh,auth")
      .eq("user_id", userId);

    if (error || !subs?.length) return 0;

    let sent = 0;
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          {
            endpoint: String(sub?.endpoint || ""),
            keys: {
              p256dh: String(sub?.p256dh || ""),
              auth: String(sub?.auth || ""),
            },
          },
          JSON.stringify({
            title: payload.title,
            body: payload.body,
            url: payload.url,
          }),
        );
        sent += 1;
      } catch {
        // best effort only
      }
    }

    return sent;
  } catch {
    return 0;
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const type = clean(body?.type || "order") || "order";
    const link = clean(body?.link || "/orders") || "/orders";
    const webUrl = clean(body?.url || body?.webUrl || link) || link;
    const orderId = clean(body?.orderId || body?.order_id) || null;
    const orderType = clean(body?.orderType || body?.order_type) || null;
    const status = clean(body?.status) || null;
    const userId =
      clean(body?.user_id || body?.userId) ||
      (orderId ? await resolveOwnerUserIdFromOrder(orderId, orderType) : "");
    const defaults = ownerNotificationDefaults({ type, status, orderId, orderType });
    const title = clean(body?.title || defaults.title);
    const message = clean(body?.body || body?.message || defaults.body);

    if (!userId) {
      return NextResponse.json(
        { success: false, message: "Missing user id." },
        { status: 400 },
      );
    }

    await insertNotificationRowAuto({
      user_id: userId,
      title,
      body: message,
      type,
      link: webUrl,
      order_id: orderId,
      order_type: orderType,
      status,
      is_read: false,
    });

    const [webSent, tokens] = await Promise.all([
      sendOwnerWebPush(userId, { title, body: message, url: webUrl }),
      collectOwnerExpoTokens(userId),
    ]);

    if (tokens.length) {
      const messages = tokens.map((token) => ({
        to: token,
        sound: "default",
        title,
        body: message,
        priority: "high",
        ttl: 3600,
        badge: 1,
        mutableContent: true,
        interruptionLevel: "time-sensitive",
        data: {
          type,
          link,
          orderId,
          orderType,
          status,
          url: webUrl,
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

    return NextResponse.json({
      success: true,
      webSent,
      expoSent: tokens.length,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || "Unable to send owner notification." },
      { status: 500 },
    );
  }
}
