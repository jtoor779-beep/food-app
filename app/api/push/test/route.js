import { NextResponse } from "next/server";

export async function GET() {
  // Simple health check for Push API env configuration (server-side only)
  const hasSupabaseUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
  const hasServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  const hasVapidPublic = !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const hasVapidPrivate = !!process.env.VAPID_PRIVATE_KEY;

  return NextResponse.json({
    ok: true,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: hasSupabaseUrl,
      SUPABASE_SERVICE_ROLE_KEY: hasServiceRole,
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: hasVapidPublic,
      VAPID_PRIVATE_KEY: hasVapidPrivate,
    },
  });
}
