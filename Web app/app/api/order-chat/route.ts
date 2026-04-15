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
  const quoted = msg.match(/'([^']+)'/);
  if (!quoted?.[1]) return "";
  const column = quoted[1];
  if (!column.includes(".")) return column.trim();
  const parts = column.split(".");
  return String(parts[parts.length - 1] || "").trim();
}

function getOrderTable(orderType: string) {
  return orderType === "grocery" ? "grocery_orders" : "orders";
}

async function loadOrder(orderType: string, orderId: string) {
  const table = getOrderTable(orderType);
  const { data, error } = await supabaseAdmin
    .from(table)
    .select("id, user_id, customer_user_id, delivery_user_id")
    .eq("id", orderId)
    .maybeSingle();

  if (error) throw error;
  return data as
    | {
        id?: string | null;
        user_id?: string | null;
        customer_user_id?: string | null;
        delivery_user_id?: string | null;
      }
    | null;
}

async function insertChatMessageAuto(payload: Record<string, any>) {
  const body = { ...payload };
  const removed = new Set<string>();

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data, error } = await supabaseAdmin
      .from("order_chat_messages")
      .insert(body)
      .select("*")
      .maybeSingle();

    if (!error) return data;
    if (!isSchemaMismatchError(error)) throw error;

    const missing = extractMissingColumnName(error);
    if (missing && missing in body && !removed.has(missing)) {
      removed.add(missing);
      delete body[missing];
      continue;
    }

    break;
  }

  throw new Error("Unable to save order chat message.");
}

export async function GET(req: Request) {
  try {
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { success: false, message: "Missing server env" },
        { status: 500 }
      );
    }

    const url = new URL(req.url);
    const orderId = clean(url.searchParams.get("order_id"));
    const orderType = cleanLower(url.searchParams.get("order_type")) === "grocery" ? "grocery" : "restaurant";
    const viewerUserId = clean(url.searchParams.get("viewer_user_id"));

    if (!orderId || !viewerUserId) {
      return NextResponse.json(
        { success: false, message: "Missing order or viewer info." },
        { status: 400 }
      );
    }

    const order = await loadOrder(orderType, orderId);
    if (!order?.id) {
      return NextResponse.json(
        { success: false, message: "Order not found." },
        { status: 404 }
      );
    }

    const customerUserId = clean(order.user_id || order.customer_user_id);
    const driverUserId = clean(order.delivery_user_id);
    if (viewerUserId !== customerUserId && viewerUserId !== driverUserId) {
      return NextResponse.json(
        { success: false, message: "You do not have access to this chat." },
        { status: 403 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("order_chat_messages")
      .select("*")
      .eq("order_id", orderId)
      .eq("order_type", orderType)
      .order("created_at", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ success: true, messages: data || [] });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || "Unable to load order chat." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { success: false, message: "Missing server env" },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const orderId = clean(body?.order_id);
    const orderType = cleanLower(body?.order_type) === "grocery" ? "grocery" : "restaurant";
    const senderRole = cleanLower(body?.sender_role);
    const senderUserId = clean(body?.sender_user_id);
    const message = clean(body?.message);

    if (!orderId || !senderRole || !senderUserId || !message) {
      return NextResponse.json(
        { success: false, message: "Missing chat payload." },
        { status: 400 }
      );
    }

    const order = await loadOrder(orderType, orderId);
    if (!order?.id) {
      return NextResponse.json(
        { success: false, message: "Order not found." },
        { status: 404 }
      );
    }

    const customerUserId = clean(order.user_id || order.customer_user_id);
    const driverUserId = clean(order.delivery_user_id);

    if (senderRole === "customer" && senderUserId !== customerUserId) {
      return NextResponse.json(
        { success: false, message: "Customer chat access denied." },
        { status: 403 }
      );
    }

    if (senderRole === "driver" && senderUserId !== driverUserId) {
      return NextResponse.json(
        { success: false, message: "Driver chat access denied." },
        { status: 403 }
      );
    }

    const row = await insertChatMessageAuto({
      order_id: orderId,
      order_type: orderType,
      customer_user_id: customerUserId || null,
      driver_user_id: driverUserId || null,
      sender_user_id: senderUserId,
      sender_role: senderRole,
      message,
      attachment_url: clean(body?.attachment_url) || null,
      attachment_name: clean(body?.attachment_name) || null,
      attachment_type: clean(body?.attachment_type) || null,
    });

    const recipientRole = senderRole === "customer" ? "driver" : "customer";
    const recipientUserId = senderRole === "customer" ? driverUserId : customerUserId;

    if (recipientUserId) {
      try {
        const origin = new URL(req.url).origin;
        await fetch(`${origin}/api/send-chat-notification`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId,
            orderType,
            recipientRole,
            recipientUserId,
            senderRole,
            senderName: senderRole === "customer" ? "Customer" : "Driver",
            preview: message,
          }),
        });
      } catch {
        // Best-effort notification only.
      }
    }

    return NextResponse.json({ success: true, message: row });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || "Unable to send order chat message." },
      { status: 500 }
    );
  }
}
