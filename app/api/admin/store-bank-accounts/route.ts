import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabaseAdmin =
  supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
    : null;

const TABLE = "owner_payout_bank_accounts";

function clean(value: unknown) {
  return String(value || "").trim();
}

function lower(value: unknown) {
  return clean(value).toLowerCase();
}

function isMissingColumnError(error: any) {
  const msg = lower(error?.message);
  return msg.includes("column") && msg.includes("does not exist");
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

  const role = lower(profile?.role);
  if (!["admin", "sub_admin"].includes(role)) {
    throw new Error("Admin access required.");
  }
}

async function listRows() {
  const orderColumns = ["updated_at", "created_at"];
  for (const col of orderColumns) {
    const res = await supabaseAdmin!.from(TABLE).select("*").order(col, { ascending: false }).limit(1000);
    if (!res.error) return Array.isArray(res.data) ? res.data : [];
    if (!isMissingColumnError(res.error)) throw res.error;
  }

  const fallback = await supabaseAdmin!.from(TABLE).select("*").limit(1000);
  if (fallback.error) throw fallback.error;
  return Array.isArray(fallback.data) ? fallback.data : [];
}

function buildPatchVariants(base: Record<string, unknown>) {
  const variants: Record<string, unknown>[] = [];
  variants.push({ ...base });
  if ("updated_at" in base) {
    const copy = { ...base };
    delete copy.updated_at;
    variants.push(copy);
  }
  return variants;
}

export async function GET(req: Request) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ ok: false, error: "Missing Supabase envs" }, { status: 500 });
    }
    await requireAdminUser(req);
    const rows = await listRows();
    return NextResponse.json({ ok: true, rows });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Unable to load store bank accounts." },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ ok: false, error: "Missing Supabase envs" }, { status: 500 });
    }
    await requireAdminUser(req);

    const body = await req.json().catch(() => ({}));
    const id = clean(body?.id);
    const status = lower(body?.status);

    if (!id || !["approved", "rejected", "pending_verification"].includes(status)) {
      return NextResponse.json({ ok: false, error: "Missing or invalid update payload." }, { status: 400 });
    }

    const basePatch: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };

    let updated: any = null;
    let lastError: any = null;

    for (const patch of buildPatchVariants(basePatch)) {
      const res = await supabaseAdmin!
        .from(TABLE)
        .update(patch)
        .eq("id", id)
        .select("id, status")
        .maybeSingle();

      if (!res.error && res.data?.id) {
        updated = res.data;
        break;
      }
      lastError = res.error;
      if (res.error && !isMissingColumnError(res.error)) break;
    }

    if (!updated) {
      if (lastError) throw lastError;
      return NextResponse.json({ ok: false, error: "Bank account record not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, row: updated });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Unable to update bank account status." },
      { status: 500 },
    );
  }
}
