import { supabase } from "@/lib/supabase";

export type OwnerRole = "restaurant_owner" | "grocery_owner";

export type ManagerContext = {
  user: any;
  role: OwnerRole;
  storeType: "restaurant" | "grocery";
  activeStore: any;
};

function clean(value: unknown) {
  return String(value || "").trim();
}

function normalizeRole(value: unknown): OwnerRole | null {
  const role = clean(value).toLowerCase();
  if (role === "restaurant_owner" || role === "grocery_owner") return role;
  return null;
}

export async function getCurrentManagerUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user || null;
}

export async function signInManager(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({
    email: clean(email),
    password: clean(password),
  });
  if (error) throw error;
  return true;
}

export async function signOutManager() {
  await supabase.auth.signOut();
}

export async function getManagerContext(): Promise<ManagerContext> {
  const user = await getCurrentManagerUser();
  if (!user?.id) throw new Error("Please login first.");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("user_id, role, full_name, phone, active_restaurant_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) throw profileError;

  const role = normalizeRole(profile?.role);
  if (!role) throw new Error("This account is not an owner account.");

  if (role === "restaurant_owner") {
    const { data: restaurants, error } = await supabase
      .from("restaurants")
      .select("id, name, city, approval_status, accepting_orders, opens_at_time, closes_at_time, timezone, manual_next_open_at")
      .eq("owner_user_id", user.id)
      .order("name", { ascending: true });

    if (error) throw error;
    const activeStore =
      (restaurants || []).find((row) => row.id === clean(profile?.active_restaurant_id)) ||
      (restaurants || [])[0];

    if (!activeStore) throw new Error("No restaurant found for this owner.");

    return {
      user,
      role,
      storeType: "restaurant",
      activeStore,
    };
  }

  const { data: stores, error } = await supabase
    .from("grocery_stores")
    .select("id, name, city, approval_status, accepting_orders, opens_at_time, closes_at_time, timezone, manual_next_open_at")
    .eq("owner_user_id", user.id)
    .order("name", { ascending: true });

  if (error) throw error;
  const activeStore = (stores || [])[0];

  if (!activeStore) throw new Error("No grocery store found for this owner.");

  return {
    user,
    role,
    storeType: "grocery",
    activeStore,
  };
}

export async function fetchDashboardData() {
  const ctx = await getManagerContext();
  const table = ctx.storeType === "restaurant" ? "orders" : "grocery_orders";
  const foreignKey = ctx.storeType === "restaurant" ? "restaurant_id" : "store_id";

  const { data: orders, error } = await supabase
    .from(table)
    .select("*")
    .eq(foreignKey, ctx.activeStore.id)
    .order("created_at", { ascending: false })
    .limit(12);

  if (error) throw error;

  const rows = orders || [];
  const completed = rows.filter((row) => {
    const status = clean(row?.status).toLowerCase();
    return status === "completed" || status === "delivered";
  });

  return {
    context: ctx,
    orders: rows,
    summary: {
      totalOrders: rows.length,
      activeOrders: rows.filter((row) => !["completed", "delivered", "canceled", "cancelled", "rejected"].includes(clean(row?.status).toLowerCase())).length,
      completedOrders: completed.length,
      sales: completed.reduce((sum, row) => sum + Number(row?.total_amount || row?.total || 0), 0),
    },
  };
}

export async function fetchOwnerOrders() {
  const ctx = await getManagerContext();
  const table = ctx.storeType === "restaurant" ? "orders" : "grocery_orders";
  const foreignKey = ctx.storeType === "restaurant" ? "restaurant_id" : "store_id";

  const { data, error } = await supabase
    .from(table)
    .select("*")
    .eq(foreignKey, ctx.activeStore.id)
    .order("created_at", { ascending: false })
    .limit(40);

  if (error) throw error;
  return { context: ctx, orders: data || [] };
}

export async function fetchOwnerItems() {
  const ctx = await getManagerContext();

  if (ctx.storeType === "restaurant") {
    const { data, error } = await supabase
      .from("menu_items")
      .select("id, name, price, cuisine, category, image_url, is_available, in_stock, is_best_seller, is_recommended")
      .eq("restaurant_id", ctx.activeStore.id)
      .order("name", { ascending: true });

    if (error) throw error;
    return { context: ctx, items: data || [] };
  }

  const { data, error } = await supabase
    .from("grocery_items")
    .select("id, name, price, category, subcategory, image_url, is_available, in_stock, is_best_seller, is_recommended")
    .eq("store_id", ctx.activeStore.id)
    .order("name", { ascending: true });

  if (error) throw error;
  return { context: ctx, items: data || [] };
}

export async function updateStoreOpenState(nextOpen: boolean) {
  const ctx = await getManagerContext();
  const table = ctx.storeType === "restaurant" ? "restaurants" : "grocery_stores";

  const { error } = await supabase
    .from(table)
    .update({
      accepting_orders: nextOpen,
      manual_next_open_at: nextOpen ? null : ctx.activeStore.manual_next_open_at || null,
    })
    .eq("id", ctx.activeStore.id);

  if (error) throw error;
  return true;
}
