import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabaseAdmin =
  supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
    : null;

const CONTRACT_KEY = "contract_acceptance_log";

function clean(value: unknown) {
  return String(value || "").trim();
}

function lower(value: unknown) {
  return clean(value).toLowerCase();
}

function normalizeSlug(value: unknown) {
  return lower(value)
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function cleanLower(value: unknown) {
  return clean(value).toLowerCase();
}

function safeObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

function rolesForSlug(slug: string) {
  if (slug === "driver_contract") return ["delivery_partner", "delivery", "driver", "rider"];
  if (slug === "owner_contract") return ["restaurant_owner", "grocery_owner", "owner"];
  return [] as string[];
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
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) throw profileError;

  const role = cleanLower(profile?.role);
  if (!["admin", "sub_admin"].includes(role)) {
    throw new Error("Admin access required.");
  }

  return user;
}

async function loadContractStore() {
  const { data, error } = await supabaseAdmin!
    .from("system_settings")
    .select("key, value_json")
    .eq("key", CONTRACT_KEY)
    .limit(20);

  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  const latest = rows[rows.length - 1];
  return safeObject(latest?.value_json);
}

export async function GET(req: Request) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ ok: false, error: "Missing Supabase envs" }, { status: 500 });
    }

    await requireAdminUser(req);

    const url = new URL(req.url);
    const slug = normalizeSlug(url.searchParams.get("slug"));
    if (!["driver_contract", "owner_contract"].includes(slug)) {
      return NextResponse.json({ ok: false, error: "Invalid contract slug." }, { status: 400 });
    }

    const roles = rolesForSlug(slug);
    const { data: profileRows, error: profileError } = await supabaseAdmin!
      .from("profiles")
      .select("*")
      .in("role", roles)
      .order("created_at", { ascending: false })
      .limit(3000);

    if (profileError) throw profileError;

    const store = await loadContractStore();
    const acceptedMap = safeObject(store[slug]);

    const rows = Array.isArray(profileRows) ? profileRows : [];
    const merged = rows.map((row: any) => {
      const userId = clean(row?.user_id);
      const accepted = safeObject(acceptedMap[userId]);
      const acceptedAt = clean(accepted?.accepted_at);
      return {
        user_id: userId,
        role: clean(row?.role),
        full_name: clean(row?.full_name),
        email: clean(row?.email),
        phone: clean(row?.phone),
        created_at: clean(row?.created_at),
        accepted: Boolean(acceptedAt),
        accepted_at: acceptedAt,
        source: clean(accepted?.source),
        checkbox_label: clean(accepted?.checkbox_label),
      };
    });

    const existingIds = new Set(merged.map((row: any) => row.user_id).filter(Boolean));
    const orphanAcceptedRows = Object.values(acceptedMap)
      .map((entry: any) => safeObject(entry))
      .filter((entry: any) => clean(entry?.user_id) && !existingIds.has(clean(entry?.user_id)))
      .map((entry: any) => ({
        user_id: clean(entry?.user_id),
        role: clean(entry?.role) || (slug === "driver_contract" ? "delivery_partner" : "owner"),
        full_name: "",
        email: "",
        phone: "",
        created_at: "",
        accepted: true,
        accepted_at: clean(entry?.accepted_at),
        source: clean(entry?.source),
        checkbox_label: clean(entry?.checkbox_label),
      }));

    const items = [...merged, ...orphanAcceptedRows].sort((a, b) => {
      if (a.accepted !== b.accepted) return a.accepted ? -1 : 1;
      const at = new Date(a.accepted_at || a.created_at || 0).getTime();
      const bt = new Date(b.accepted_at || b.created_at || 0).getTime();
      return bt - at;
    });

    const acceptedCount = items.filter((item) => item.accepted).length;

    return NextResponse.json({
      ok: true,
      slug,
      summary: {
        total: items.length,
        accepted: acceptedCount,
        pending: Math.max(items.length - acceptedCount, 0),
      },
      items,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Unable to load contract acceptance." },
      { status: 500 }
    );
  }
}
