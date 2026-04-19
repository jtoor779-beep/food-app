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

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean(value));
}

function normalizeRole(value: unknown) {
  const role = lower(value);
  if (!role) return "";
  if (["delivery_partner", "delivery", "rider", "driver"].includes(role)) return "delivery_partner";
  if (["restaurant_owner", "grocery_owner", "owner"].includes(role)) return role === "owner" ? "restaurant_owner" : role;
  return role;
}

function allowedRolesForSlug(slug: string) {
  if (slug === "driver_contract") return ["delivery_partner"];
  if (slug === "owner_contract") return ["restaurant_owner", "grocery_owner"];
  return [] as string[];
}

function isRoleAllowedForSlug(slug: string, role: string) {
  return allowedRolesForSlug(slug).includes(normalizeRole(role));
}

function safeObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getAuthUserWithRetry(userId: string, attempts = 8, delayMs = 700) {
  if (!supabaseAdmin) return null;
  for (let index = 0; index < attempts; index += 1) {
    try {
      const result = await supabaseAdmin.auth.admin.getUserById(userId);
      const user = result?.data?.user || null;
      if (user?.id) return user;
    } catch {
      // Continue retries for eventual consistency windows.
    }
    if (index < attempts - 1) await sleep(delayMs);
  }
  return null;
}

async function getProfileRole(userId: string) {
  if (!supabaseAdmin) return "";
  try {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();
    return normalizeRole(data?.role);
  } catch {
    return "";
  }
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

async function saveContractStore(valueJson: Record<string, any>) {
  const existing = await supabaseAdmin!
    .from("system_settings")
    .select("key")
    .eq("key", CONTRACT_KEY)
    .limit(1);

  if (existing.error) throw existing.error;

  if (Array.isArray(existing.data) && existing.data.length > 0) {
    const updated = await supabaseAdmin!
      .from("system_settings")
      .update({ value_json: valueJson })
      .eq("key", CONTRACT_KEY);
    if (updated.error) throw updated.error;
    return;
  }

  const inserted = await supabaseAdmin!.from("system_settings").insert({
    key: CONTRACT_KEY,
    value_json: valueJson,
  });
  if (inserted.error) throw inserted.error;
}

export async function POST(req: Request) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ ok: false, error: "Missing Supabase envs" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const userId = clean(body?.userId || body?.user_id);
    const slug = normalizeSlug(body?.slug);
    const accepted = body?.accepted !== false;

    if (!userId || !isUuid(userId)) {
      return NextResponse.json({ ok: false, error: "Invalid user id." }, { status: 400 });
    }
    if (!["driver_contract", "owner_contract"].includes(slug)) {
      return NextResponse.json({ ok: false, error: "Invalid contract slug." }, { status: 400 });
    }
    if (!accepted) {
      return NextResponse.json({ ok: false, error: "Acceptance flag must be true." }, { status: 400 });
    }

    const authUser = await getAuthUserWithRetry(userId);
    if (!authUser?.id) {
      return NextResponse.json({ ok: false, error: "User not found for contract acceptance." }, { status: 400 });
    }

    const roleFromBody = normalizeRole(body?.role);
    const roleFromMeta = normalizeRole(authUser?.user_metadata?.role);
    const roleFromProfile = await getProfileRole(userId);
    const role = roleFromMeta || roleFromProfile || roleFromBody;

    if (!role) {
      return NextResponse.json({ ok: false, error: "Unable to resolve account role." }, { status: 400 });
    }
    if (!isRoleAllowedForSlug(slug, role)) {
      return NextResponse.json(
        {
          ok: false,
          error: `Role ${role} is not allowed to accept ${slug}.`,
        },
        { status: 400 }
      );
    }

    const acceptedAt = new Date().toISOString();
    const store = await loadContractStore();
    const scoped = safeObject(store[slug]);

    scoped[userId] = {
      user_id: userId,
      slug,
      role,
      accepted: true,
      accepted_at: acceptedAt,
      checkbox_label: clean(body?.checkboxLabel || body?.contractCheckboxLabel),
      contract_title: clean(body?.contractTitle || body?.title),
      source: clean(body?.source || "mobile_app"),
      updated_at: acceptedAt,
    };

    const nextStore = {
      ...store,
      [slug]: scoped,
    };

    await saveContractStore(nextStore);

    return NextResponse.json({
      ok: true,
      acceptance: scoped[userId],
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Unable to record contract acceptance." },
      { status: 500 }
    );
  }
}
