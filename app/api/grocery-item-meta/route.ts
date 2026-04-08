import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabaseAdmin =
  supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
    : null;

const PREFIX = "grocery_item_meta:";

function clean(value: unknown) {
  return String(value || "").trim();
}

function safeNumber(value: unknown, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function normalizeVariant(row: any, index: number) {
  const originalPrice = safeNumber(row?.original_price ?? row?.price, 0);
  const discountPrice = safeNumber(row?.discount_price, 0);
  const effectivePrice = discountPrice > 0 ? discountPrice : originalPrice;
  return {
    id: clean(row?.id) || `variant_${index + 1}`,
    label: clean(row?.label),
    unit: clean(row?.unit) || null,
    value: row?.value == null ? null : safeNumber(row?.value, 0),
    price: effectivePrice,
    original_price: originalPrice,
    discount_price: discountPrice > 0 ? discountPrice : null,
    discount_percent:
      originalPrice > effectivePrice ? Math.max(1, Math.round(((originalPrice - effectivePrice) / originalPrice) * 100)) : 0,
    in_stock: row?.in_stock !== false,
    is_default: row?.is_default === true,
    sort_order: row?.sort_order == null ? index : safeNumber(row?.sort_order, index),
  };
}

function normalizeMeta(input: any) {
  const originalPrice = safeNumber(input?.original_price ?? input?.price, 0);
  const discountPrice = safeNumber(input?.discount_price, 0);
  const effectivePrice = discountPrice > 0 ? discountPrice : originalPrice;
  const variants = Array.isArray(input?.variants)
    ? input.variants.map((row: any, index: number) => normalizeVariant(row, index)).filter((row: any) => !!row.label)
    : [];
  if (variants.length > 0 && !variants.some((row: any) => row.is_default)) variants[0].is_default = true;
  return {
    original_price: originalPrice,
    discount_price: discountPrice > 0 ? discountPrice : null,
    discount_percent:
      originalPrice > effectivePrice ? Math.max(1, Math.round(((originalPrice - effectivePrice) / originalPrice) * 100)) : 0,
    variants,
  };
}

async function readMeta(itemIds: string[]) {
  if (!supabaseAdmin || itemIds.length === 0) return {};
  const keys = itemIds.map((id) => `${PREFIX}${id}`);
  const { data, error } = await supabaseAdmin.from("system_settings").select("key, value_json").in("key", keys).limit(Math.max(20, keys.length));
  if (error) throw error;
  const map: Record<string, any> = {};
  (data || []).forEach((row: any) => {
    const itemId = clean(row?.key).replace(PREFIX, "");
    if (!itemId) return;
    map[itemId] = normalizeMeta(row?.value_json || {});
  });
  return map;
}

async function requireOwnerOrAdmin(req: Request, itemId: string) {
  const authHeader = clean(req.headers.get("authorization"));
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token || !supabaseAdmin) throw new Error("Missing access token.");

  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user?.id) throw new Error("Invalid session.");

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("user_id, role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profileError) throw profileError;

  const role = clean(profile?.role).toLowerCase();
  if (role === "admin" || role === "sub_admin") return user.id;
  if (role !== "grocery_owner") throw new Error("Owner access required.");

  const { data: item, error: itemError } = await supabaseAdmin
    .from("grocery_items")
    .select("id, store_id")
    .eq("id", itemId)
    .maybeSingle();
  if (itemError || !item?.store_id) throw new Error("Grocery item not found.");

  const { data: store, error: storeError } = await supabaseAdmin
    .from("grocery_stores")
    .select("id, owner_user_id")
    .eq("id", item.store_id)
    .maybeSingle();
  if (storeError) throw storeError;
  if (clean(store?.owner_user_id) !== user.id) throw new Error("This grocery item does not belong to your store.");

  return user.id;
}

async function saveMeta(itemId: string, value_json: any) {
  const key = `${PREFIX}${itemId}`;
  const { error } = await supabaseAdmin!
    .from("system_settings")
    .upsert({ key, value_json }, { onConflict: "key" });
  if (error) throw error;
}

export async function GET(req: Request) {
  try {
    if (!supabaseAdmin) return NextResponse.json({ ok: false, error: "Missing Supabase envs" }, { status: 500 });
    const url = new URL(req.url);
    const singleId = clean(url.searchParams.get("item_id"));
    const itemIds = [
      singleId,
      ...clean(url.searchParams.get("item_ids"))
        .split(",")
        .map((value) => clean(value))
        .filter(Boolean),
    ].filter(Boolean);
    const uniqueIds = Array.from(new Set(itemIds));
    const map = await readMeta(uniqueIds);
    return NextResponse.json({ ok: true, items: map });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Unable to load grocery item meta." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    if (!supabaseAdmin) return NextResponse.json({ ok: false, error: "Missing Supabase envs" }, { status: 500 });
    const body = await req.json().catch(() => ({}));
    const itemId = clean(body?.itemId);
    if (!itemId) return NextResponse.json({ ok: false, error: "Missing item id." }, { status: 400 });

    await requireOwnerOrAdmin(req, itemId);
    const normalized = normalizeMeta(body?.meta || {});
    await saveMeta(itemId, normalized);
    return NextResponse.json({ ok: true, itemId, meta: normalized });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Unable to save grocery item meta." }, { status: 500 });
  }
}
