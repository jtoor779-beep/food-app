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

function cleanLower(value: unknown) {
  return clean(value).toLowerCase();
}

function isIgnorableError(error: any) {
  const msg = cleanLower(error?.message);
  return (
    msg.includes("does not exist") ||
    msg.includes("schema cache") ||
    msg.includes("could not find") ||
    msg.includes("column") ||
    msg.includes("relation")
  );
}

async function requireAdminUser(req: Request) {
  const authHeader = clean(req.headers.get("authorization"));
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Missing access token.");

  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin!.auth.getUser(token);

  if (authError || !user?.id) throw new Error("Invalid session.");

  const { data: profile, error: profileError } = await supabaseAdmin!
    .from("profiles")
    .select("user_id, role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) throw profileError;

  const role = cleanLower(profile?.role);
  if (!["admin", "sub_admin"].includes(role)) {
    throw new Error("Admin access required.");
  }

  return user;
}

async function deleteByEq(table: string, column: string, value: string) {
  try {
    const { error } = await supabaseAdmin!.from(table).delete().eq(column, value);
    if (error && !isIgnorableError(error)) throw error;
  } catch (error: any) {
    if (!isIgnorableError(error)) throw error;
  }
}

async function updateWithVariants(table: string, matchColumn: string, matchValue: string, variants: Record<string, any>[]) {
  let lastError: any = null;
  for (const patch of variants) {
    try {
      const { error } = await supabaseAdmin!.from(table).update(patch).eq(matchColumn, matchValue);
      if (error) throw error;
      return;
    } catch (error: any) {
      lastError = error;
      if (!isIgnorableError(error)) continue;
    }
  }
  if (lastError && !isIgnorableError(lastError)) throw lastError;
}

async function archiveRestaurantEntity(restaurantId: string) {
  const archivedAt = new Date().toISOString();

  await Promise.allSettled([
    updateWithVariants("restaurants", "id", restaurantId, [
      { is_disabled: true, accepting_orders: false, approval_status: "deleted", deleted_at: archivedAt, is_archived: true },
      { is_disabled: true, accepting_orders: false, approval_status: "deleted", deleted_at: archivedAt },
      { is_disabled: true, accepting_orders: false, approval_status: "deleted", is_archived: true },
      { is_disabled: true, accepting_orders: false, approval_status: "deleted" },
    ]),
    updateWithVariants("menu_items", "restaurant_id", restaurantId, [
      { in_stock: false, is_available: false, is_archived: true, deleted_at: archivedAt },
      { in_stock: false, is_available: false, deleted_at: archivedAt },
      { in_stock: false, is_available: false, is_archived: true },
      { in_stock: false, is_available: false },
      { in_stock: false },
    ]),
    deleteByEq("home_featured_items", "restaurant_id", restaurantId),
  ]);
}

async function archiveGroceryEntity(storeId: string) {
  const archivedAt = new Date().toISOString();

  await Promise.allSettled([
    updateWithVariants("grocery_stores", "id", storeId, [
      { is_disabled: true, accepting_orders: false, approval_status: "deleted", deleted_at: archivedAt, is_archived: true },
      { is_disabled: true, accepting_orders: false, approval_status: "deleted", deleted_at: archivedAt },
      { is_disabled: true, accepting_orders: false, approval_status: "deleted", is_archived: true },
      { is_disabled: true, accepting_orders: false, approval_status: "deleted" },
    ]),
    updateWithVariants("grocery_items", "store_id", storeId, [
      { in_stock: false, is_available: false, is_archived: true, deleted_at: archivedAt },
      { in_stock: false, is_available: false, deleted_at: archivedAt },
      { in_stock: false, is_available: false, is_archived: true },
      { in_stock: false, is_available: false },
      { in_stock: false },
    ]),
    updateWithVariants("grocery_categories", "store_id", storeId, [
      { is_active: false, is_archived: true, deleted_at: archivedAt },
      { is_active: false, deleted_at: archivedAt },
      { is_active: false },
    ]),
    updateWithVariants("grocery_subcategories", "store_id", storeId, [
      { is_active: false, is_archived: true, deleted_at: archivedAt },
      { is_active: false, deleted_at: archivedAt },
      { is_active: false },
    ]),
    deleteByEq("home_featured_items", "store_id", storeId),
  ]);
}

export async function POST(req: Request) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ ok: false, error: "Missing Supabase envs" }, { status: 500 });
    }

    await requireAdminUser(req);

    const body = await req.json().catch(() => ({}));
    const entityType = cleanLower(body?.entityType);
    const entityId = clean(body?.entityId);

    if (!entityId || !["restaurant", "grocery"].includes(entityType)) {
      return NextResponse.json({ ok: false, error: "Missing or invalid delete payload." }, { status: 400 });
    }

    if (entityType === "restaurant") {
      await archiveRestaurantEntity(entityId);
    } else {
      await archiveGroceryEntity(entityId);
    }

    return NextResponse.json({ ok: true, mode: "archived" });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Unable to delete entity." },
      { status: 500 }
    );
  }
}
