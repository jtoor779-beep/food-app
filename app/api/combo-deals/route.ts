import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabaseAdmin =
  supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
    : null;

type ComboKind = "restaurant" | "grocery";

function clean(value: unknown) {
  return String(value || "").trim();
}

function safeNumber(value: unknown, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function normalizeKind(value: unknown): ComboKind | "" {
  const kind = clean(value).toLowerCase();
  if (kind === "restaurant" || kind === "grocery") return kind;
  return "";
}

function settingKey(kind: ComboKind, entityId: string) {
  return `${kind}_combo_deals:${entityId}`;
}

async function requireAuthorizedEntity(req: Request, kind: ComboKind, entityId: string) {
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

  const table = kind === "restaurant" ? "restaurants" : "grocery_stores";
  const expectedRole = kind === "restaurant" ? "restaurant_owner" : "grocery_owner";
  if (role !== expectedRole) throw new Error("Owner access required.");

  const { data: entity, error: entityError } = await supabaseAdmin
    .from(table)
    .select("id, owner_user_id")
    .eq("id", entityId)
    .maybeSingle();
  if (entityError) throw entityError;
  if (!entity?.id) throw new Error("Store not found.");
  if (clean(entity?.owner_user_id) !== user.id) throw new Error("This store does not belong to you.");

  return user.id;
}

async function fetchAllowedItems(kind: ComboKind, entityId: string, itemIds: string[]) {
  const ids = Array.from(new Set((itemIds || []).map((itemId) => clean(itemId)).filter(Boolean)));
  if (!ids.length || !supabaseAdmin) return new Map<string, any>();

  const table = kind === "restaurant" ? "menu_items" : "grocery_items";
  const entityColumn = kind === "restaurant" ? "restaurant_id" : "store_id";
  const { data, error } = await supabaseAdmin
    .from(table)
    .select("id, name, image_url")
    .eq(entityColumn, entityId)
    .in("id", ids);

  if (error) throw error;

  const map = new Map<string, any>();
  (data || []).forEach((row: any) => {
    map.set(clean(row?.id), row);
  });
  return map;
}

function normalizeDeals(kind: ComboKind, entityId: string, rawDeals: any[], allowedItems: Map<string, any>) {
  const deals = Array.isArray(rawDeals) ? rawDeals : [];

  return deals
    .map((deal, index) => {
      const itemIds = Array.isArray(deal?.items)
        ? deal.items
            .map((item: any) => clean(item?.item_id || item?.id))
            .filter(Boolean)
        : [];

      const items = itemIds
        .map((itemId: string) => {
          const allowed = allowedItems.get(itemId);
          const inputItem = Array.isArray(deal?.items)
            ? deal.items.find((row: any) => clean(row?.item_id || row?.id) === itemId)
            : null;
          if (!allowed) return null;
          return {
            item_id: itemId,
            name: clean(allowed?.name) || "Item",
            image_url: clean(allowed?.image_url) || null,
            quantity: 1,
            selected_variant_label: clean(inputItem?.selected_variant_label || inputItem?.variant_label) || null,
          };
        })
        .filter(Boolean);

      if (!items.length) return null;

      const title = clean(deal?.title || deal?.name);
      if (!title) return null;

      const discountPrice = safeNumber(deal?.discount_price ?? deal?.discountPrice ?? deal?.price, 0);
      const originalCandidate = safeNumber(deal?.original_price ?? deal?.originalPrice, 0);
      const effectivePrice = discountPrice > 0 ? discountPrice : originalCandidate;
      if (!(effectivePrice > 0)) return null;

      const originalPrice = originalCandidate > effectivePrice ? originalCandidate : effectivePrice;
      const imageUrl = clean(deal?.image_url || deal?.imageUrl || items[0]?.image_url);

      return {
        id: clean(deal?.id) || randomUUID(),
        kind,
        entity_id: entityId,
        title,
        subtitle: clean(deal?.subtitle) || null,
        image_url: imageUrl || null,
        price: effectivePrice,
        original_price: originalPrice,
        discount_price: originalPrice > effectivePrice ? effectivePrice : null,
        discount_percent:
          originalPrice > effectivePrice
            ? Math.max(1, Math.round(((originalPrice - effectivePrice) / originalPrice) * 100))
            : 0,
        items,
        sort_order: safeNumber(deal?.sort_order, index),
      };
    })
    .filter(Boolean)
    .sort((a, b) => safeNumber(a?.sort_order, 0) - safeNumber(b?.sort_order, 0))
    .slice(0, 24);
}

async function readDeals(kind: ComboKind, entityId: string) {
  const key = settingKey(kind, entityId);
  const { data, error } = await supabaseAdmin!
    .from("system_settings")
    .select("key, value_json")
    .eq("key", key)
    .limit(20);
  if (error) throw error;
  return Array.isArray(data) ? data[data.length - 1] || data[0] || null : null;
}

async function saveDeals(kind: ComboKind, entityId: string, combos: any[]) {
  const key = settingKey(kind, entityId);
  const { error } = await supabaseAdmin!
    .from("system_settings")
    .upsert({ key, value_json: { combos } }, { onConflict: "key" });
  if (error) throw error;

  const { data: mobileHomeRows, error: mobileHomeError } = await supabaseAdmin!
    .from("system_settings")
    .select("key, value_json")
    .eq("key", "mobile_home")
    .limit(20);
  if (mobileHomeError) throw mobileHomeError;

  const mobileHomeRow = Array.isArray(mobileHomeRows) ? mobileHomeRows[mobileHomeRows.length - 1] || mobileHomeRows[0] : null;
  const currentJson = mobileHomeRow?.value_json && typeof mobileHomeRow.value_json === "object" ? mobileHomeRow.value_json : {};
  const fieldName = kind === "restaurant" ? "restaurant_combo_deals" : "grocery_combo_deals";
  const currentMap = currentJson?.[fieldName] && typeof currentJson[fieldName] === "object" ? currentJson[fieldName] : {};
  const nextJson = {
    ...currentJson,
    [fieldName]: {
      ...currentMap,
      [entityId]: combos,
    },
  };

  const { error: mirrorError } = await supabaseAdmin!
    .from("system_settings")
    .upsert({ key: "mobile_home", value_json: nextJson }, { onConflict: "key" });
  if (mirrorError) throw mirrorError;
}

export async function GET(req: Request) {
  try {
    if (!supabaseAdmin) return NextResponse.json({ ok: false, error: "Missing Supabase envs" }, { status: 500 });

    const url = new URL(req.url);
    const kind = normalizeKind(url.searchParams.get("kind"));
    const entityId = clean(url.searchParams.get("entity_id"));
    if (!kind || !entityId) {
      return NextResponse.json({ ok: false, error: "Missing kind or entity_id." }, { status: 400 });
    }

    const row = await readDeals(kind, entityId);
    return NextResponse.json({ ok: true, combos: Array.isArray(row?.value_json?.combos) ? row.value_json.combos : [] });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Unable to load combo deals." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    if (!supabaseAdmin) return NextResponse.json({ ok: false, error: "Missing Supabase envs" }, { status: 500 });

    const body = await req.json().catch(() => ({}));
    const kind = normalizeKind(body?.kind);
    const entityId = clean(body?.entityId || body?.entity_id);
    if (!kind || !entityId) {
      return NextResponse.json({ ok: false, error: "Missing kind or entity id." }, { status: 400 });
    }

    await requireAuthorizedEntity(req, kind, entityId);

    const requestedItemIds = Array.isArray(body?.combos)
      ? body.combos.flatMap((deal: any) =>
          Array.isArray(deal?.items)
            ? deal.items.map((item: any) => clean(item?.item_id || item?.id)).filter(Boolean)
            : []
        )
      : [];

    const allowedItems = await fetchAllowedItems(kind, entityId, requestedItemIds);
    const combos = normalizeDeals(kind, entityId, body?.combos || [], allowedItems);

    await saveDeals(kind, entityId, combos);
    return NextResponse.json({ ok: true, combos });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Unable to save combo deals." }, { status: 500 });
  }
}
