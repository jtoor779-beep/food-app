import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

function clean(value: unknown) {
  return String(value || '').trim();
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const userId = clean(body?.userId || body?.user_id);
    const orderId = clean(body?.orderId || body?.order_id);
    const orderType = clean(body?.orderType || body?.order_type).toLowerCase();
    const pushToken = clean(body?.pushToken || body?.push_token);

    if (!userId || !orderId || !pushToken || !['restaurant', 'grocery'].includes(orderType)) {
      return NextResponse.json({ ok: false, message: 'Missing live activity token data.' }, { status: 400 });
    }

    const key = `live_activity_token:${orderType}:${orderId}:${userId}`;
    const valueJson = {
      user_id: userId,
      order_id: orderId,
      order_type: orderType,
      push_token: pushToken,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabaseAdmin.from('system_settings').insert({
      key,
      value_json: valueJson,
    });

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, message: error?.message || 'Unable to save live activity token.' },
      { status: 500 }
    );
  }
}
