import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

type ProfileRow = {
  id?: string | null;
  user_id?: string | null;
  full_name?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
};

type ProfileMap = Record<
  string,
  {
    user_id: string | null;
    full_name: string | null;
    name: string | null;
    phone: string | null;
    mobile: string | null;
    avatar_url: string | null;
    photo_url: string | null;
    profile_photo: string | null;
    image_url: string | null;
  }
>;

function mapProfiles(rows: ProfileRow[] = []): ProfileMap {
  const map: ProfileMap = {};
  for (const row of rows || []) {
    const key = String(row?.user_id || row?.id || "").trim();
    if (!key) continue;
    map[key] = {
      user_id: row?.user_id || row?.id || null,
      full_name: row?.full_name || null,
      name: row?.full_name || null,
      phone: row?.phone || null,
      mobile: row?.phone || null,
      avatar_url: row?.avatar_url || null,
      photo_url: row?.avatar_url || null,
      profile_photo: row?.avatar_url || null,
      image_url: row?.avatar_url || null,
    };
  }
  return map;
}

export async function POST(req: Request) {
  try {
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ success: false, message: "Missing server env" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const ids = Array.from(
      new Set(((body as { ids?: unknown[] } | null)?.ids || []).map((id: unknown) => String(id || "").trim()).filter(Boolean))
    );

    if (!ids.length) {
      return NextResponse.json({ success: true, profiles: {} });
    }

    const profileSelect = "user_id, full_name, phone, avatar_url";

    const byUserId = await supabaseAdmin.from("profiles").select(profileSelect).in("user_id", ids);
    if (byUserId.error) {
      return NextResponse.json({ success: false, message: byUserId.error.message }, { status: 500 });
    }

    const userMap = mapProfiles((byUserId.data || []) as ProfileRow[]);
    const missingIds = ids.filter((id) => !userMap[id]);

    if (!missingIds.length) {
      return NextResponse.json({ success: true, profiles: userMap });
    }

    const byId = await supabaseAdmin
      .from("profiles")
      .select(`id, ${profileSelect}`)
      .in("id", missingIds);

    if (byId.error) {
      return NextResponse.json({
        success: true,
        profiles: userMap,
      });
    }

    return NextResponse.json({
      success: true,
      profiles: {
        ...userMap,
        ...mapProfiles((byId.data || []) as ProfileRow[]),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || "Unexpected server error" },
      { status: 500 }
    );
  }
}
