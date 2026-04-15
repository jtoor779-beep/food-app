import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabaseAdmin =
  supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
    : null;

const supabaseAuth =
  supabaseUrl && anonKey
    ? createClient(supabaseUrl, anonKey, { auth: { persistSession: false } })
    : null;

function clean(value: unknown) {
  return String(value || "").trim();
}

function normalizeOrderType(value: unknown) {
  const s = clean(value).toLowerCase();
  return s.includes("groc") ? "grocery" : "restaurant";
}

function parseEmbeddedItems(row: any) {
  const keys = ["items", "order_items", "cart_items", "products", "line_items"];
  for (const key of keys) {
    const value = row?.[key];
    if (Array.isArray(value)) return value;
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // ignore bad legacy payloads
      }
    }
  }
  return [];
}

function buildItemDetails(row: any, meta?: any) {
  const parts = [
    clean(row?.selected_variant_label || row?.variant_label || row?.variant || row?.size_label),
    clean(row?.selected_spice_level || row?.spice_level),
    clean(row?.special_note || row?.note || row?.instructions || row?.customer_note),
  ].filter(Boolean);

  if (parts.length) return parts.join(" • ");

  return (
    clean(row?.description || row?.details || row?.item_description) ||
    clean(meta?.description || meta?.details)
  );
}

function normalizeItem(row: any, meta?: any, fallbackId?: string) {
  return {
    id: clean(row?.id || fallbackId || row?.menu_item_id || row?.grocery_item_id || row?.item_id),
    itemRefId: clean(row?.menu_item_id || row?.grocery_item_id || row?.item_id || row?.product_id) || null,
    name:
      clean(row?.item_name || row?.product_name || row?.name || row?.title) ||
      clean(meta?.name) ||
      "Item",
    quantity: Math.max(1, Number(row?.qty || row?.quantity || row?.count || 1) || 1),
    priceEach: Number.isFinite(Number(row?.price_each ?? row?.price ?? row?.unit_price))
      ? Number(row?.price_each ?? row?.price ?? row?.unit_price)
      : Number.isFinite(Number(meta?.price))
        ? Number(meta?.price)
        : null,
    imageUrl:
      clean(row?.image_url || row?.img || row?.photo_url || row?.picture_url) ||
      clean(meta?.image_url) ||
      null,
    details: buildItemDetails(row, meta) || null,
  };
}

async function loadOrderItems(orderType: "restaurant" | "grocery", orderId: string, orderRow: any) {
  if (!supabaseAdmin) return [];

  const itemTable = orderType === "grocery" ? "grocery_order_items" : "order_items";
  const metaTable = orderType === "grocery" ? "grocery_items" : "menu_items";
  let itemRows: any[] = [];

  try {
    const { data, error } = await supabaseAdmin.from(itemTable).select("*").eq("order_id", orderId);
    if (error) throw error;
    itemRows = Array.isArray(data) ? data : [];
  } catch {
    itemRows = [];
  }

  if (!itemRows.length && orderType === "grocery") {
    try {
      const { data, error } = await supabaseAdmin
        .from(itemTable)
        .select("*")
        .eq("grocery_order_id", orderId);
      if (error) throw error;
      itemRows = Array.isArray(data) ? data : [];
    } catch {
      itemRows = [];
    }
  }

  if (!itemRows.length) {
    itemRows = parseEmbeddedItems(orderRow);
  }

  const refIds = Array.from(
    new Set(
      itemRows
        .map((row) =>
          clean(
            orderType === "grocery"
              ? row?.grocery_item_id || row?.item_id || row?.product_id
              : row?.menu_item_id || row?.item_id
          )
        )
        .filter(Boolean)
    )
  );

  const metaById = new Map<string, any>();
  if (refIds.length) {
    try {
      const { data, error } = await supabaseAdmin
        .from(metaTable)
        .select("id, name, price, image_url, description")
        .in("id", refIds);
      if (!error) {
        for (const row of data || []) metaById.set(String(row.id), row);
      }
    } catch {
      // ignore meta failures
    }
  }

  return itemRows.map((row, index) =>
    normalizeItem(
      row,
      metaById.get(
        clean(
          orderType === "grocery"
            ? row?.grocery_item_id || row?.item_id || row?.product_id
            : row?.menu_item_id || row?.item_id
        )
      ),
      `${orderId}-${orderType}-${index}`
    )
  );
}

export async function POST(req: Request) {
  try {
    if (!supabaseAdmin || !supabaseAuth) {
      return NextResponse.json({ ok: false, error: "Missing Supabase envs" }, { status: 500 });
    }

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) {
      return NextResponse.json({ ok: false, error: "Missing auth token" }, { status: 401 });
    }

    const {
      data: { user },
      error: userError,
    } = await supabaseAuth.auth.getUser(token);

    if (userError || !user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const orderId = clean(body?.orderId);
    const orderType = normalizeOrderType(body?.orderType) as "restaurant" | "grocery";

    if (!orderId) {
      return NextResponse.json({ ok: false, error: "Missing order id" }, { status: 400 });
    }

    const orderTable = orderType === "grocery" ? "grocery_orders" : "orders";
    const { data: orderRow, error: orderError } = await supabaseAdmin
      .from(orderTable)
      .select("*")
      .eq("id", orderId)
      .maybeSingle();

    if (orderError || !orderRow?.id) {
      return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 });
    }

    const { data: profileRow } = await supabaseAdmin
      .from("profiles")
      .select("role, delivery_approved, delivery_disabled")
      .eq("user_id", user.id)
      .maybeSingle();

    const role = clean(profileRow?.role).toLowerCase();
    const isDeliveryPartner = role === "delivery_partner" && !profileRow?.delivery_disabled;
    const isAssignedDriver = clean(orderRow?.delivery_user_id) === clean(user.id);
    const isReadyOffer = clean(orderRow?.status).toLowerCase() === "ready" && !orderRow?.delivery_user_id;

    if (!isAssignedDriver && !(isDeliveryPartner && isReadyOffer)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const items = await loadOrderItems(orderType, orderId, orderRow);
    return NextResponse.json({ ok: true, items });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Failed to load order items" },
      { status: 500 }
    );
  }
}
