import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabaseAdmin =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey, { auth: { persistSession: false } })
    : null;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function pendingProfilePayload(userId: string, body: any) {
  return {
    user_id: userId,
    role: "delivery_partner",
    account_type: "Delivery Partner",
    email: clean(body?.email).toLowerCase() || null,
    full_name: clean(body?.full_name) || null,
    phone: clean(body?.phone) || null,
    country: clean(body?.country) || null,
    address_line1: clean(body?.address_line1) || null,
    address_line2: clean(body?.address_line2) || null,
    city: clean(body?.city) || null,
    state: clean(body?.state) || null,
    postal_code: clean(body?.postal_code) || null,
    zip: clean(body?.postal_code) || null,
    delivery_approved: false,
    delivery_disabled: false,
    delivery_status: "pending",
  };
}

function fallbackPayload(full: ReturnType<typeof pendingProfilePayload>) {
  return {
    user_id: full.user_id,
    role: full.role,
    account_type: full.account_type,
    email: full.email,
    full_name: full.full_name,
    phone: full.phone,
    address_line1: full.address_line1,
    city: full.city,
    state: full.state,
    zip: full.zip,
    delivery_approved: full.delivery_approved,
    delivery_disabled: full.delivery_disabled,
    delivery_status: full.delivery_status,
  };
}

export async function POST(req: Request) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ ok: false, error: "Missing Supabase envs" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const userId = clean(body?.user_id);
    const email = clean(body?.email).toLowerCase();

    if (!userId || !email) {
      return NextResponse.json({ ok: false, error: "Missing user id or email" }, { status: 400 });
    }

    const authRes = await supabaseAdmin.auth.admin.getUserById(userId);
    const authUser = authRes?.data?.user || null;
    const authEmail = clean(authUser?.email).toLowerCase();
    const authRole = clean(authUser?.user_metadata?.role).toLowerCase();
    const authAccountType = clean(authUser?.user_metadata?.account_type).toLowerCase();

    if (!authUser || authEmail !== email) {
      return NextResponse.json({ ok: false, error: "Signup user not found" }, { status: 404 });
    }

    if (authRole !== "delivery_partner" && authAccountType !== "delivery partner") {
      return NextResponse.json({ ok: false, error: "User is not a driver signup" }, { status: 400 });
    }

    const full = pendingProfilePayload(userId, body);
    let result = await supabaseAdmin.from("profiles").upsert(full, { onConflict: "user_id" });

    if (
      result.error &&
      /column|schema cache|country|address_line2|postal_code/i.test(result.error.message || "")
    ) {
      result = await supabaseAdmin
        .from("profiles")
        .upsert(fallbackPayload(full), { onConflict: "user_id" });
    }

    if (result.error) {
      return NextResponse.json({ ok: false, error: result.error.message || "Profile upsert failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, userId });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Failed to create driver profile" },
      { status: 500 }
    );
  }
}
