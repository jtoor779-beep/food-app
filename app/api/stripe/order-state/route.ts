import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabaseAdmin =
  supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
    : null;

function shortId(id: string) {
  return String(id || "").slice(0, 8);
}

function normalizeOrderType(v: unknown) {
  const s = String(v || "").trim().toLowerCase();
  return s.includes("groc") ? "grocery" : "restaurant";
}

function tableNames(orderType: string) {
  return orderType === "grocery"
    ? {
        orderTable: "grocery_orders",
        itemTable: "grocery_order_items",
        ownerTable: "grocery_stores",
        ownerOrdersLink: "/groceries/owner/orders",
        customerOrdersLink: "/groceries/orders",
      }
    : {
        orderTable: "orders",
        itemTable: "order_items",
        ownerTable: "restaurants",
        ownerOrdersLink: "/restaurants/orders",
        customerOrdersLink: "/orders",
      };
}

async function selectSingleWithFallback(table: string, orderId: string, selects: string[]) {
  let lastError: any = null;
  for (const select of selects) {
    const { data, error } = await supabaseAdmin!
      .from(table)
      .select(select)
      .eq("id", orderId)
      .maybeSingle();
    if (!error) return data;
    lastError = error;
    if (!String(error?.message || "").toLowerCase().includes("does not exist")) throw error;
  }
  if (lastError) throw lastError;
  return null;
}

async function updateOrderWithFallback(table: string, orderId: string, patches: Array<Record<string, unknown>>) {
  let lastError: any = null;
  for (const patch of patches) {
    const nextPatch = { ...patch };
    const removed = new Set<string>();

    for (let i = 0; i < 10; i += 1) {
      const { error } = await supabaseAdmin!.from(table).update(nextPatch).eq("id", orderId);
      if (!error) return true;
      lastError = error;
      const msg = String(error?.message || "").toLowerCase();
      if (!msg.includes("does not exist") && !msg.includes("schema cache") && !msg.includes("could not find")) {
        throw error;
      }

      const quoted = String(error?.message || "").match(/'([^']+)'/);
      const rawColumn = quoted?.[1] || "";
      const missingColumn = rawColumn.includes(".")
        ? rawColumn.split(".").slice(-1)[0].trim()
        : rawColumn.trim();

      if (missingColumn && missingColumn in nextPatch && !removed.has(missingColumn)) {
        removed.add(missingColumn);
        delete (nextPatch as any)[missingColumn];
        continue;
      }

      break;
    }
  }
  if (lastError) throw lastError;
  return false;
}

async function deleteNotificationsForOrder(orderId: string) {
  const sid = shortId(orderId);
  if (!sid) return;

  try {
    await supabaseAdmin!
      .from("notifications")
      .delete()
      .eq("type", "order")
      .ilike("body", `%${sid}%`);
  } catch {
    // best effort only
  }
}

async function sendOwnerNotification(
  req: Request,
  payload: {
    userId: string | null;
    title: string;
    body: string;
    webUrl: string;
    orderId: string;
    orderType: string;
    status?: string;
  },
) {
  if (!payload.userId) return;

  try {
    await fetch(new URL("/api/send-owner-notification", req.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: payload.userId,
        title: payload.title,
        body: payload.body,
        type: "order",
        link: "/orders",
        url: payload.webUrl,
        orderId: payload.orderId,
        orderType: payload.orderType,
        status: payload.status || "pending",
      }),
    });
  } catch {
    // best effort only
  }
}

async function sendOwnerNewOrderEmail(req: Request, orderType: string, orderId: string) {
  try {
    await fetch(new URL("/api/send-order-email", req.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType: "owner_new_order_received",
        orderType,
        orderId,
      }),
    });
  } catch {
    // best effort only
  }
}

async function insertPaidNotifications(req: Request, orderType: string, orderId: string) {
  const names = tableNames(orderType);

  if (orderType === "grocery") {
    const { data: orderRow } = await supabaseAdmin!
      .from("grocery_orders")
      .select("id, customer_user_id, store_id")
      .eq("id", orderId)
      .maybeSingle();

    if (!orderRow) return;

    const { data: storeRow } = await supabaseAdmin!
      .from(names.ownerTable)
      .select("id, name, owner_user_id")
      .eq("id", orderRow.store_id)
      .maybeSingle();

    const ownerUserId = storeRow?.owner_user_id || null;

    const storeName = storeRow?.name || "Grocery Store";
    const sid = shortId(orderId);

    if (ownerUserId) {
      const title = "New grocery order received";
      const body = `New grocery order ${sid ? "#" + sid : ""} received for ${storeName}. Tap to view.`;
      await sendOwnerNotification(req, {
        userId: ownerUserId,
        title,
        body,
        webUrl: names.ownerOrdersLink,
        orderId,
        orderType,
        status: "pending",
      });
      await sendOwnerNewOrderEmail(req, orderType, orderId);
    }

    if (orderRow.customer_user_id) {
      await supabaseAdmin!.from("notifications").insert({
        user_id: orderRow.customer_user_id,
        title: "Grocery order placed",
        body: `Your grocery order ${sid ? "#" + sid : ""} was placed successfully.`,
        type: "order",
        link: names.customerOrdersLink,
        is_read: false,
      });
    }

    return;
  }

  const { data: orderRow } = await supabaseAdmin!
    .from("orders")
    .select("id, user_id, restaurant_id")
    .eq("id", orderId)
    .maybeSingle();

  if (!orderRow) return;

  const { data: restRow } = await supabaseAdmin!
    .from(names.ownerTable)
    .select("id, name, owner_user_id")
    .eq("id", orderRow.restaurant_id)
    .maybeSingle();

  const ownerUserId = restRow?.owner_user_id || null;

  const restName = restRow?.name || "Restaurant";
  const sid = shortId(orderId);

  if (ownerUserId) {
    const title = "New order received";
    const body = `New order ${sid ? "#" + sid : ""} received for ${restName}. Tap to view.`;
    await sendOwnerNotification(req, {
      userId: ownerUserId,
      title,
      body,
      webUrl: names.ownerOrdersLink,
      orderId,
      orderType,
      status: "pending",
    });
    await sendOwnerNewOrderEmail(req, orderType, orderId);
  }

  if (orderRow.user_id) {
    await supabaseAdmin!.from("notifications").insert({
      user_id: orderRow.user_id,
      title: "Order placed",
      body: `Your order ${sid ? "#" + sid : ""} for ${restName} was placed successfully.`,
      type: "order",
      link: names.customerOrdersLink,
      is_read: false,
    });
  }
}

export async function POST(req: Request) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ ok: false, error: "Missing Supabase envs" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "").trim().toLowerCase();
    const orderId = String(body?.orderId || "").trim();
    const orderType = normalizeOrderType(body?.orderType);
    const sessionId = String(body?.sessionId || "").trim();
    const names = tableNames(orderType);

    if (!action || !orderId) {
      return NextResponse.json({ ok: false, error: "Missing action or orderId" }, { status: 400 });
    }

    if (action === "cancel_unpaid") {
      const orderRow: any = await selectSingleWithFallback(names.orderTable, orderId, [
        "id, payment_status, stripe_session_id",
        "id, stripe_session_id",
        "id",
      ]);
      if (!orderRow) return NextResponse.json({ ok: true, removed: false, reason: "not_found" });

      const paymentStatus = String(orderRow.payment_status || "").trim().toLowerCase();
      const stripeSessionId = String(orderRow.stripe_session_id || "").trim();
      const isPaid = paymentStatus === "paid" || paymentStatus === "succeeded" || paymentStatus === "complete";

      if (isPaid) return NextResponse.json({ ok: true, removed: false, reason: "already_paid" });
      if (sessionId && stripeSessionId && stripeSessionId !== sessionId) {
        return NextResponse.json({ ok: true, removed: false, reason: "session_mismatch" });
      }

      await supabaseAdmin.from(names.itemTable).delete().eq("order_id", orderId);
      await deleteNotificationsForOrder(orderId);
      await supabaseAdmin.from(names.orderTable).delete().eq("id", orderId);

      return NextResponse.json({ ok: true, removed: true });
    }

    if (action === "mark_paid") {
      const patch: Record<string, unknown> = {
        payment_status: "paid",
        payment_method: "stripe",
        paid_at: new Date().toISOString(),
      };

      if (sessionId) patch.stripe_session_id = sessionId;

      const { data: beforeRow } = await supabaseAdmin
        .from(names.orderTable)
        .select("id, status")
        .eq("id", orderId)
        .maybeSingle();

      const existingStatus = String(beforeRow?.status || "").trim().toLowerCase();
      if (!existingStatus || existingStatus === "payment_pending" || existingStatus === "pending_payment" || existingStatus === "draft") {
        patch.status = "pending";
      }

      const patchAttempts: Array<Record<string, unknown>> =
        orderType === "grocery"
          ? [
              patch,
              Object.fromEntries(Object.entries(patch).filter(([key]) => key !== "payment_method")),
              Object.fromEntries(Object.entries(patch).filter(([key]) => !["payment_method", "payment_status", "paid_at"].includes(key))),
            ]
          : [patch];

      await updateOrderWithFallback(names.orderTable, orderId, patchAttempts);

      await deleteNotificationsForOrder(orderId);
      await insertPaidNotifications(req, orderType, orderId);

      return NextResponse.json({ ok: true, updated: true });
    }

    return NextResponse.json({ ok: false, error: "Unsupported action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Order state update failed" }, { status: 500 });
  }
}
