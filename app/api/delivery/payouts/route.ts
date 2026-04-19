import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabaseAdmin =
  supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
    : null;

const PAYOUT_TABLE = "delivery_payout_requests";
const BANK_TABLE = "delivery_payout_bank_accounts";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function nnum(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeReqStatus(value: unknown) {
  const s = clean(value).toLowerCase();
  if (s === "processing") return "processing";
  if (s === "paid") return "paid";
  if (s === "failed") return "failed";
  return "requested";
}

async function readSnapshot(deliveryUserId: string) {
  let requests: Record<string, unknown>[] = [];
  let bank: Record<string, unknown> | null = null;

  const reqRes = await supabaseAdmin!
    .from(PAYOUT_TABLE)
    .select("id, delivery_user_id, status, source, range, order_ids, order_keys, total_amount, count, created_at")
    .eq("delivery_user_id", deliveryUserId)
    .order("created_at", { ascending: false });
  if (!reqRes.error && Array.isArray(reqRes.data)) requests = reqRes.data as Record<string, unknown>[];

  let bankRes = await supabaseAdmin!
    .from(BANK_TABLE)
    .select("*")
    .eq("delivery_user_id", deliveryUserId)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (bankRes.error && /updated_at/i.test(clean(bankRes.error.message))) {
    bankRes = await supabaseAdmin!
      .from(BANK_TABLE)
      .select("*")
      .eq("delivery_user_id", deliveryUserId)
      .order("created_at", { ascending: false })
      .limit(1);
  }

  if (!bankRes.error && Array.isArray(bankRes.data) && bankRes.data.length > 0) {
    bank = bankRes.data[0] as Record<string, unknown>;
  }

  return { requests, bank };
}

export async function GET(req: Request) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ success: false, message: "Missing Supabase envs" }, { status: 500 });
    }

    const url = new URL(req.url);
    const deliveryUserId = clean(url.searchParams.get("deliveryUserId"));
    if (!deliveryUserId) {
      return NextResponse.json({ success: false, message: "Missing delivery user id." }, { status: 400 });
    }

    const snapshot = await readSnapshot(deliveryUserId);
    return NextResponse.json({ success: true, requests: snapshot.requests, bank: snapshot.bank });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || "Unable to load payout snapshot." },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ success: false, message: "Missing Supabase envs" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const type = clean(body?.type).toLowerCase();
    const deliveryUserId = clean(body?.delivery_user_id || body?.deliveryUserId);

    if (!deliveryUserId) {
      return NextResponse.json({ success: false, message: "Missing delivery user id." }, { status: 400 });
    }

    if (type === "save_bank") {
      const accountHolderName = clean(body?.account_holder_name);
      const bankName = clean(body?.bank_name);
      const accountNumber = clean(body?.account_number).replace(/\s+/g, "");
      const routingCode = clean(body?.routing_code).replace(/\s+/g, "");
      const country = clean(body?.country || "US").toUpperCase() || "US";
      const currency = clean(body?.currency || "USD").toUpperCase() || "USD";

      if (!accountHolderName || !bankName || !accountNumber || !routingCode) {
        return NextResponse.json({ success: false, message: "Missing bank details." }, { status: 400 });
      }
      if (accountNumber.length < 6 || routingCode.length < 4) {
        return NextResponse.json({ success: false, message: "Invalid bank account or routing code." }, { status: 400 });
      }

      const nowIso = new Date().toISOString();
      const baseRow = {
        delivery_user_id: deliveryUserId,
        account_holder_name: accountHolderName,
        bank_name: bankName,
        account_number_last4: accountNumber.slice(-4),
        routing_code_last4: routingCode.slice(-4),
        country,
        currency,
        status: "pending_verification",
        updated_at: nowIso,
      };
      const fullRow = {
        ...baseRow,
        account_number_full: accountNumber,
        routing_code_full: routingCode,
      };

      let upsert = await supabaseAdmin.from(BANK_TABLE).upsert([fullRow], { onConflict: "delivery_user_id" });
      if (upsert.error) {
        upsert = await supabaseAdmin.from(BANK_TABLE).upsert([baseRow], { onConflict: "delivery_user_id" });
      }
      if (upsert.error) {
        return NextResponse.json(
          { success: false, message: upsert.error.message || "Unable to save bank details." },
          { status: 500 },
        );
      }

      const snapshot = await readSnapshot(deliveryUserId);
      return NextResponse.json({ success: true, bank: snapshot.bank });
    }

    if (type === "request_payout") {
      const requestId = clean(body?.id) || `REQ-${Date.now()}`;
      const source = clean(body?.source || "all").toLowerCase() || "all";
      const range = clean(body?.range || "all").toLowerCase() || "all";
      const orderIds = Array.isArray(body?.order_ids)
        ? body.order_ids.map((x: unknown) => clean(x)).filter(Boolean)
        : [];
      const orderKeys = Array.isArray(body?.order_keys)
        ? body.order_keys.map((x: unknown) => clean(x)).filter(Boolean)
        : [];
      const totalAmount = nnum(body?.total_amount, 0);
      const count = Math.max(0, nnum(body?.count, Math.max(orderIds.length, orderKeys.length)));
      const createdAt = clean(body?.created_at) || new Date().toISOString();

      if (orderIds.length === 0 && orderKeys.length === 0) {
        return NextResponse.json({ success: false, message: "No orders found for payout request." }, { status: 400 });
      }
      if (!(totalAmount > 0)) {
        return NextResponse.json({ success: false, message: "Payout amount must be greater than zero." }, { status: 400 });
      }

      const row = {
        id: requestId,
        created_at: createdAt,
        delivery_user_id: deliveryUserId,
        status: normalizeReqStatus(body?.status),
        source,
        range,
        order_ids: orderIds,
        order_keys: orderKeys,
        total_amount: totalAmount,
        count,
      };

      let insert = await supabaseAdmin.from(PAYOUT_TABLE).insert([row]);
      if (insert.error && /duplicate key|already exists/i.test(clean(insert.error.message))) {
        insert = await supabaseAdmin.from(PAYOUT_TABLE).insert([{ ...row, id: `REQ-${Date.now()}` }]);
      }
      if (insert.error) {
        return NextResponse.json(
          { success: false, message: insert.error.message || "Unable to create payout request." },
          { status: 500 },
        );
      }

      return NextResponse.json({ success: true, request: row });
    }

    return NextResponse.json({ success: false, message: "Unsupported payout action." }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error?.message || "Unable to process payout action." },
      { status: 500 },
    );
  }
}
