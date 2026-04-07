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

async function listIds(table: string, filterColumn: string, filterValue: string) {
  try {
    const { data, error } = await supabaseAdmin!
      .from(table)
      .select("id")
      .eq(filterColumn, filterValue)
      .limit(5000);
    if (error) {
      if (isIgnorableError(error)) return [] as string[];
      throw error;
    }
    return Array.isArray(data)
      ? data.map((row: any) => clean(row?.id)).filter(Boolean)
      : [];
  } catch (error: any) {
    if (isIgnorableError(error)) return [] as string[];
    throw error;
  }
}

async function deleteByEq(table: string, column: string, value: string) {
  try {
    const { error } = await supabaseAdmin!.from(table).delete().eq(column, value);
    if (error && !isIgnorableError(error)) throw error;
  } catch (error: any) {
    if (!isIgnorableError(error)) throw error;
  }
}

async function deleteByIn(table: string, column: string, values: string[]) {
  const filtered = values.map((value) => clean(value)).filter(Boolean);
  if (!filtered.length) return;
  try {
    const { error } = await supabaseAdmin!.from(table).delete().in(column, filtered);
    if (error && !isIgnorableError(error)) throw error;
  } catch (error: any) {
    if (!isIgnorableError(error)) throw error;
  }
}

async function deleteRestaurantEntity(restaurantId: string) {
  const orderIds = await listIds("orders", "restaurant_id", restaurantId);

  await Promise.allSettled([
    deleteByEq("menu_items", "restaurant_id", restaurantId),
    deleteByEq("order_reviews", "target_id", restaurantId),
    deleteByEq("public_reviews", "target_id", restaurantId),
    deleteByEq("home_featured_items", "restaurant_id", restaurantId),
  ]);

  await Promise.allSettled([
    deleteByIn("order_items", "order_id", orderIds),
    deleteByIn("delivery_events", "order_id", orderIds),
    deleteByIn("order_chat_messages", "order_id", orderIds),
    deleteByIn("notifications", "order_id", orderIds),
  ]);

  await deleteByEq("orders", "restaurant_id", restaurantId);
  await deleteByEq("restaurants", "id", restaurantId);
}

async function deleteGroceryEntity(storeId: string) {
  const orderIds = await listIds("grocery_orders", "store_id", storeId);

  await Promise.allSettled([
    deleteByEq("grocery_items", "store_id", storeId),
    deleteByEq("grocery_categories", "store_id", storeId),
    deleteByEq("grocery_subcategories", "store_id", storeId),
    deleteByEq("order_reviews", "target_id", storeId),
    deleteByEq("public_reviews", "target_id", storeId),
    deleteByEq("home_featured_items", "store_id", storeId),
  ]);

  await Promise.allSettled([
    deleteByIn("grocery_order_items", "grocery_order_id", orderIds),
    deleteByIn("grocery_order_items", "order_id", orderIds),
    deleteByIn("delivery_events", "order_id", orderIds),
    deleteByIn("order_chat_messages", "order_id", orderIds),
    deleteByIn("notifications", "order_id", orderIds),
  ]);

  await deleteByEq("grocery_orders", "store_id", storeId);
  await deleteByEq("grocery_stores", "id", storeId);
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
      await deleteRestaurantEntity(entityId);
    } else {
      await deleteGroceryEntity(entityId);
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Unable to delete entity." },
      { status: 500 }
    );
  }
}
