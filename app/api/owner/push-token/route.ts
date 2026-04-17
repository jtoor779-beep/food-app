import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

function clean(value: unknown) {
  return String(value || "").trim();
}

function isLikelyExpoPushToken(token: string) {
  return token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken[");
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const userId = clean(body?.user_id || body?.userId);
    const expoPushToken = clean(body?.expo_push_token || body?.expoPushToken);
    const devicePlatform = clean(body?.device_platform || body?.devicePlatform) || "expo";

    if (!userId || !expoPushToken) {
      return NextResponse.json({ success: false, message: "Missing user_id or expo_push_token." }, { status: 400 });
    }

    if (!isLikelyExpoPushToken(expoPushToken)) {
      return NextResponse.json({ success: false, message: "Invalid Expo push token." }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from("owner_push_tokens").upsert(
      {
        user_id: userId,
        expo_push_token: expoPushToken,
        device_platform: devicePlatform,
      },
      { onConflict: "user_id,expo_push_token" }
    );

    if (error) {
      return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || "Unable to save owner push token." },
      { status: 500 }
    );
  }
}
