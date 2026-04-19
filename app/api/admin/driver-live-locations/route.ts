import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
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
  if (!role || !["admin", "sub_admin"].includes(role)) {
    throw new Error("Admin access required.");
  }

  return user;
}

export async function POST(req: Request) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ ok: false, error: "Missing Supabase envs" }, { status: 500 });
    }

    await requireAdminUser(req);

    const body = await req.json().catch(() => ({}));
    const userIds = Array.isArray(body?.userIds)
      ? body.userIds.map((value: any) => clean(value)).filter(Boolean)
      : [];

    if (!userIds.length) {
      return NextResponse.json({ ok: true, rows: [] });
    }

    const lookbackHoursRaw = Number(body?.lookbackHours);
    const lookbackHours = Number.isFinite(lookbackHoursRaw)
      ? Math.max(1, Math.min(48, Math.floor(lookbackHoursRaw)))
      : 6;
    const sinceIso = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabaseAdmin
      .from("delivery_events")
      .select("delivery_user_id, lat, lng, created_at, event_type")
      .in("delivery_user_id", userIds)
      .in("event_type", ["gps", "gps_test"])
      .not("lat", "is", null)
      .not("lng", "is", null)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(12000);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message || "Unable to load live driver locations." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      rows: Array.isArray(data) ? data : [],
      lookbackHours,
      since: sinceIso,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Unable to load live driver locations." },
      { status: 500 }
    );
  }
}
