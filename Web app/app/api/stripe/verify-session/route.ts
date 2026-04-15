import { NextResponse } from "next/server";
import Stripe from "stripe";

function pickMeta(md: Record<string, any> | null | undefined, keys: string[]) {
  if (!md) return "";
  for (const k of keys) {
    const v = md[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v);
  }
  return "";
}

function safeNum(n: any) {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

function centsToMoney(cents: number) {
  // Returns dollars for USD etc (keep formatting in UI)
  return Math.round(safeNum(cents)) / 100;
}

export async function GET(req: Request) {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { ok: false, error: "Missing STRIPE_SECRET_KEY in .env.local" },
        { status: 500 }
      );
    }

    const url = new URL(req.url);
    const session_id = url.searchParams.get("session_id") || "";

    if (!session_id) {
      return NextResponse.json({ ok: false, error: "Missing session_id" }, { status: 400 });
    }

    // ✅ IMPORTANT: do NOT set apiVersion here (avoids TS error)
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ["customer_details", "payment_intent"],
    });

    // ✅ NEW: fetch line items so we can build correct breakdown (delivery/platform/tax/etc)
    let line_items: Array<{
      id: string;
      description: string;
      quantity: number;
      amount_subtotal_cents: number;
      amount_total_cents: number;
      currency: string;
      price_id: string;
      product_id: string;
    }> = [];

    try {
      const li = await stripe.checkout.sessions.listLineItems(session_id, { limit: 100 });
      const cur = String(session.currency || "").toUpperCase();

      line_items = (li?.data || []).map((x: any) => ({
        id: String(x?.id || ""),
        description: String(x?.description || x?.price?.product?.name || ""),
        quantity: safeNum(x?.quantity) || 0,
        amount_subtotal_cents: safeNum(x?.amount_subtotal),
        amount_total_cents: safeNum(x?.amount_total),
        currency: String(x?.currency || cur || "").toUpperCase(),
        price_id: String(x?.price?.id || ""),
        product_id: String(x?.price?.product || ""),
      }));
    } catch {
      line_items = [];
    }

    const amount_total = typeof session.amount_total === "number" ? session.amount_total : 0;

    const amount_subtotal =
      typeof (session as any).amount_subtotal === "number" ? (session as any).amount_subtotal : 0;

    const currency = String(session.currency || "").toUpperCase();
    const payment_status = String(session.payment_status || "unpaid");
    const status = String(session.status || "open");

    const email =
      (session.customer_details as any)?.email || (session.customer_email as any) || "";

    const paid = payment_status === "paid";

    // ✅ NEW: build fee breakdown from Stripe (best source of truth)
    const td: any = (session as any)?.total_details || {};
    const tax_cents = safeNum(td?.amount_tax);
    const discount_cents = safeNum(td?.amount_discount);

    // Classify line items by name (your setup uses “Delivery fee”, “Platform fee”, “Tax”)
    const buckets = {
      items_subtotal_cents: 0,
      delivery_fee_cents: 0,
      platform_fee_cents: 0,
      tip_cents: 0,
      tax_lineitem_cents: 0,
      other_cents: 0,
    };

    for (const it of line_items) {
      const name = String(it.description || "").toLowerCase();
      const amt = safeNum(it.amount_total_cents);

      const isDelivery = name.includes("delivery");
      const isPlatform = name.includes("platform") || name.includes("service fee");
      const isTip = name.includes("tip");
      const isTax = name === "tax" || name.includes(" tax");

      if (isDelivery) buckets.delivery_fee_cents += amt;
      else if (isPlatform) buckets.platform_fee_cents += amt;
      else if (isTip) buckets.tip_cents += amt;
      else if (isTax) buckets.tax_lineitem_cents += amt;
      else if (name) buckets.items_subtotal_cents += amt;
      else buckets.other_cents += amt;
    }

    const breakdown = {
      // cents
      amount_total_cents: safeNum(amount_total),
      amount_subtotal_cents: safeNum(amount_subtotal),
      tax_cents: tax_cents || buckets.tax_lineitem_cents,
      discount_cents,
      delivery_fee_cents: buckets.delivery_fee_cents,
      platform_fee_cents: buckets.platform_fee_cents,
      tip_cents: buckets.tip_cents,
      items_subtotal_cents: buckets.items_subtotal_cents,

      // money (dollars for USD)
      amount_total: centsToMoney(amount_total),
      amount_subtotal: centsToMoney(amount_subtotal),
      tax_amount: centsToMoney(tax_cents || buckets.tax_lineitem_cents),
      discount_amount: centsToMoney(discount_cents),
      delivery_fee: centsToMoney(buckets.delivery_fee_cents),
      platform_fee: centsToMoney(buckets.platform_fee_cents),
      tip_amount: centsToMoney(buckets.tip_cents),
      items_subtotal: centsToMoney(buckets.items_subtotal_cents),

      currency,
      source: "stripe",
    };

    // ✅ Extract metadata safely (for grocery vs restaurant routing)
    const md = (session.metadata || {}) as Record<string, any>;

    const order_type_raw = pickMeta(md, [
      "order_type",
      "orderType",
      "type",
      "category",
      "flow",
      "source",
    ]).toLowerCase();

    const order_type =
      order_type_raw.includes("groc")
        ? "grocery"
        : order_type_raw.includes("rest")
          ? "restaurant"
          : order_type_raw || "";

    const restaurant_id = pickMeta(md, ["restaurant_id", "restaurantId", "rest_id", "restId"]);

    const store_id = pickMeta(md, ["store_id", "storeId", "grocery_store_id", "groceryStoreId"]);

    const success_redirect = pickMeta(md, [
      "success_redirect",
      "successRedirect",
      "redirect",
      "redirect_to",
      "redirectTo",
    ]);

    const client_reference_id = session.client_reference_id
      ? String(session.client_reference_id)
      : "";

    return NextResponse.json({
      ok: true,
      session_id: session.id,
      paid,
      status,
      payment_status,

      amount_total, // cents (kept for backward compatibility)
      currency,
      email,

      // ✅ NEW (non-breaking additions)
      amount_subtotal, // cents
      line_items,
      breakdown,

      order_type,
      restaurant_id,
      store_id,
      success_redirect,
      client_reference_id,
      metadata: md,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Verify session error" },
      { status: 500 }
    );
  }
}