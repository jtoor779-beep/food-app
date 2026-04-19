import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabaseAdmin =
  supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
    : null;

function clean(value: unknown) {
  return String(value || "").trim();
}

function normalizeOrderType(value: unknown) {
  return clean(value).toLowerCase().includes("groc") ? "grocery" : "restaurant";
}

function buildFallbackVariants(base: Record<string, unknown>, optionalKeys: string[]) {
  const variants: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  let current = { ...base };

  function pushVariant(value: Record<string, unknown>) {
    const key = JSON.stringify(Object.keys(value).sort().map((entry) => [entry, (value as any)[entry]]));
    if (seen.has(key)) return;
    seen.add(key);
    variants.push({ ...value });
  }

  pushVariant(current);
  for (const optionalKey of optionalKeys) {
    if (!(optionalKey in current)) continue;
    const next = { ...current };
    delete next[optionalKey];
    current = next;
    pushVariant(current);
  }

  return variants;
}

async function updateWithFallback(table: string, orderId: string, storeKey: string, storeId: string, patch: Record<string, unknown>) {
  const variants = buildFallbackVariants(patch, [
    "updated_at",
    "owner_reject_reason",
    "cancel_reason",
    "rejection_reason",
    "reject_reason",
  ]);

  let lastError: any = null;
  for (const variant of variants) {
    const { data, error } = await supabaseAdmin!
      .from(table)
      .update(variant)
      .eq("id", orderId)
      .eq(storeKey, storeId)
      .select("id, status")
      .maybeSingle();
    if (!error && data?.id) return data;
    if (!error && !data?.id) {
      lastError = new Error("Order row was not updated.");
      continue;
    }
    lastError = error;
  }

  throw lastError || new Error("Unable to update order status.");
}

async function sendJson(req: Request, path: string, payload: Record<string, unknown>) {
  try {
    const response = await fetch(new URL(path, req.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ success: false, message: "Missing Supabase envs" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const orderId = clean(body?.orderId);
    const storeId = clean(body?.storeId);
    const ownerUserId = clean(body?.ownerUserId);
    const orderType = normalizeOrderType(body?.orderType);
    const nextStatus = clean(body?.status).toLowerCase();
    const rejectReason = clean(body?.rejectReason);

    if (!orderId || !storeId || !ownerUserId || !nextStatus) {
      return NextResponse.json({ success: false, message: "Missing order status payload." }, { status: 400 });
    }

    const isGrocery = orderType === "grocery";
    const table = isGrocery ? "grocery_orders" : "orders";
    const storeTable = isGrocery ? "grocery_stores" : "restaurants";
    const storeKey = isGrocery ? "store_id" : "restaurant_id";

    const { data: storeRow, error: storeError } = await supabaseAdmin
      .from(storeTable)
      .select("id, name, owner_user_id")
      .eq("id", storeId)
      .maybeSingle();

    if (storeError || !storeRow?.id) {
      return NextResponse.json({ success: false, message: "Store not found." }, { status: 404 });
    }
    if (clean(storeRow.owner_user_id) !== ownerUserId) {
      return NextResponse.json({ success: false, message: "Store ownership mismatch." }, { status: 403 });
    }

    const patch: Record<string, unknown> = { status: nextStatus, updated_at: new Date().toISOString() };
    if (nextStatus === "rejected") {
      if (!rejectReason) {
        return NextResponse.json({ success: false, message: "Reject reason is required." }, { status: 400 });
      }
      Object.assign(patch, {
        reject_reason: rejectReason,
        rejection_reason: rejectReason,
        cancel_reason: rejectReason,
        owner_reject_reason: rejectReason,
      });
    }

    const updated = await updateWithFallback(table, orderId, storeKey, storeId, patch);

    if (nextStatus === "accepted") {
      void sendJson(req, "/api/send-order-email", {
        eventType: "owner_order_confirmed",
        orderType,
        orderId,
      });
    }

    if (nextStatus === "rejected") {
      void sendJson(req, "/api/send-order-email", {
        eventType: "owner_order_rejected",
        orderType,
        orderId,
      });
    }

    let driverNotificationSent: boolean | null = null;
    if (nextStatus === "ready") {
      driverNotificationSent = await sendJson(req, "/api/send-driver-notification", {
        orderId,
        restaurantName: clean(storeRow.name) || "Store",
      });
    }

    return NextResponse.json({
      success: true,
      status: clean(updated?.status) || nextStatus,
      driverNotificationSent,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || "Unable to update owner order status." },
      { status: 500 },
    );
  }
}
