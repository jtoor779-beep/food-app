import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

/**
 * Build base URL safely:
 * - Prefer NEXT_PUBLIC_BASE_URL if present
 * - Otherwise derive from request headers (works in dev + prod)
 */
function getBaseUrl(req: Request) {
  const envUrl = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (envUrl) return envUrl.replace(/\/+$/, "");

  const host =
    req.headers.get("x-forwarded-host") ||
    req.headers.get("host") ||
    "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") || "http";
  return `${proto}://${host}`.replace(/\/+$/, "");
}

function safeStr(v: any) {
  const s = v === undefined || v === null ? "" : String(v);
  return s.trim();
}

function toNumber(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function pickFirst(...vals: any[]) {
  for (const v of vals) {
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (s !== "") return v;
  }
  return undefined;
}

function pickMoney(meta: any, keys: string[]) {
  for (const k of keys) {
    const v = meta?.[k];
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

/** ✅ NEW: pick string from meta using multiple keys */
function pickMetaStr(meta: any, keys: string[]) {
  for (const k of keys) {
    const v = meta?.[k];
    const s = safeStr(v);
    if (s) return s;
  }
  return "";
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return null;

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

export async function POST(req: Request) {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { error: "Missing STRIPE_SECRET_KEY in .env.local" },
        { status: 500 }
      );
    }

    const baseUrl = getBaseUrl(req);

    // ✅ IMPORTANT: no apiVersion to avoid TS error with older stripe package
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

    const body = await req.json().catch(() => ({}));

    const items = Array.isArray(body?.items) ? body.items : [];
    if (items.length === 0) {
      return NextResponse.json({ error: "No items provided" }, { status: 400 });
    }

    // ✅ supports body.meta too
    const meta = body?.meta && typeof body.meta === "object" ? body.meta : {};

    // ✅ order id (this is what lets us write stripe_session_id to DB)
    const orderId = safeStr(
      pickFirst(body?.order_id, body?.orderId, meta?.order_id, meta?.orderId)
    );

    // currency: default USD (you can keep USD for Stripe)
    const currency = safeStr(pickFirst(body?.currency, meta?.currency, "USD")).toLowerCase();

    const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = items.map(
      (it: any) => ({
        quantity: Math.max(1, Number(it?.quantity || 1)),
        price_data: {
          currency,
          product_data: { name: String(it?.name || "Item") },
          unit_amount: Math.round(toNumber(it?.price, 0) * 100),
        },
      })
    );

    // ✅ Read order_type/store/restaurant from multiple possible keys
    const orderTypeRaw = safeStr(
      pickFirst(
        body?.order_type,
        body?.orderType,
        body?.cart_mode,
        body?.cartMode,
        meta?.order_type,
        meta?.orderType,
        meta?.cart_mode,
        meta?.cartMode
      )
    );

    const restaurantId = safeStr(
      pickFirst(
        body?.restaurant_id,
        body?.restaurantId,
        meta?.restaurant_id,
        meta?.restaurantId
      )
    );

    const storeId = safeStr(
      pickFirst(
        body?.store_id,
        body?.storeId,
        body?.grocery_store_id,
        body?.groceryStoreId,
        meta?.store_id,
        meta?.storeId,
        meta?.grocery_store_id,
        meta?.groceryStoreId
      )
    );

    const successRedirect = safeStr(
      pickFirst(
        body?.success_redirect,
        body?.successRedirect,
        body?.redirect_to,
        body?.redirectTo,
        meta?.success_redirect,
        meta?.successRedirect,
        meta?.redirect_to,
        meta?.redirectTo
      )
    );

    // ✅ FEES: accept BOTH old cart keys AND new keys
    const deliveryFee = pickMoney(meta, ["delivery_fee", "deliveryFee", "delivery_fee_amount"]);
    const tax = pickMoney(meta, ["tax", "gst", "gst_amount", "tax_amount"]);
    const platformFee = pickMoney(meta, ["platform_fee", "platform_fee_amount", "platformFee"]);
    const tip = pickMoney(meta, ["tip", "tip_amount", "tipAmount"]);

    // ✅ Add fee line items (only when > 0)
    const addFeeItem = (name: string, amount: number) => {
      const cents = Math.round(toNumber(amount, 0) * 100);
      if (cents <= 0) return;
      line_items.push({
        quantity: 1,
        price_data: {
          currency,
          product_data: { name },
          unit_amount: cents,
        },
      });
    };

    addFeeItem("Delivery fee", deliveryFee);
    addFeeItem("Platform fee", platformFee);
    addFeeItem("Tax", tax);
    addFeeItem("Tip", tip);

    /* =========================================================
       ✅ NEW: capture customer/address fields from meta
       (so DB will not be null + success page can read from Stripe metadata)
       ========================================================= */

    const customerName = pickMetaStr(meta, ["customer_name", "customerName", "name", "full_name", "fullName"]);
    const customerPhone = pickMetaStr(meta, ["phone", "customer_phone", "customerPhone", "mobile", "mobile_number"]);
    const addressLine1 = pickMetaStr(meta, ["address_line1", "addressLine1", "address1", "address"]);
    const addressLine2 = pickMetaStr(meta, ["address_line2", "addressLine2", "address2"]);
    const landmark = pickMetaStr(meta, ["landmark"]);
    const instructions = pickMetaStr(meta, ["instructions", "delivery_instructions", "deliveryInstructions", "note", "notes"]);

    // ✅ metadata (still useful)
    const metadata: Record<string, string> = {
      order_id: orderId,
      order_type: orderTypeRaw,
      restaurant_id: restaurantId,
      store_id: storeId,
      success_redirect: successRedirect,
      cart_mode: safeStr(
        pickFirst(body?.cart_mode, body?.cartMode, meta?.cart_mode, meta?.cartMode)
      ),

      // ✅ NEW: make invoice page + DB save reliable
      customer_name: customerName,
      customer_phone: customerPhone,
      address_line1: addressLine1,
      address_line2: addressLine2,
      landmark,
      instructions,

      // ✅ NEW: fees also in metadata (helps invoice page if needed)
      platform_fee: String(platformFee || 0),
      delivery_fee: String(deliveryFee || 0),
      tax_amount: String(tax || 0),
      tip_amount: String(tip || 0),
    };

    // Remove empty values
    for (const k of Object.keys(metadata)) {
      if (!metadata[k]) delete metadata[k];
    }

    // ✅ HARD FIX: DO NOT use URLSearchParams for session_id token
    const qp: string[] = [];
    qp.push(`session_id={CHECKOUT_SESSION_ID}`);

    if (orderTypeRaw) qp.push(`order_type=${encodeURIComponent(orderTypeRaw)}`);
    if (storeId) qp.push(`store_id=${encodeURIComponent(storeId)}`);
    if (restaurantId) qp.push(`restaurant_id=${encodeURIComponent(restaurantId)}`);
    if (successRedirect) qp.push(`success_redirect=${encodeURIComponent(successRedirect)}`);
    if (orderId) qp.push(`order_id=${encodeURIComponent(orderId)}`);

    const successUrl = `${baseUrl}/payment/success?${qp.join("&")}`;
    const cancelUrl = `${baseUrl}/payment/cancel`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      metadata: Object.keys(metadata).length ? metadata : undefined,
      client_reference_id: orderId || storeId || restaurantId || undefined,
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    /**
     * ✅ THE FIX:
     * Save stripe_session_id in public.orders so invoice/order page can show PAID later.
     * Also save customer details server-side (so they don't end up null).
     * This must use SERVICE ROLE key because it’s server-side.
     */
    if (orderId) {
      const sb = getSupabaseAdmin();
      if (sb) {
        // Keep this update conservative (won’t break if some columns don’t exist)
        const patch: any = {
          stripe_session_id: session.id,
        };

        patch.payment_method = "stripe";
        patch.payment_status = "pending";

        // ✅ NEW: store address details server-side (best effort)
        if (customerName) patch.customer_name = customerName;
        if (customerPhone) patch.phone = customerPhone;
        if (addressLine1) patch.address_line1 = addressLine1;
        if (addressLine2) patch.address_line2 = addressLine2;
        if (landmark) patch.landmark = landmark;
        if (instructions) patch.instructions = instructions;

        // ✅ NEW: store fees server-side (best effort)
        if (Number.isFinite(Number(deliveryFee))) patch.delivery_fee = deliveryFee;
        if (Number.isFinite(Number(platformFee))) patch.platform_fee = platformFee;
        if (Number.isFinite(Number(tax))) patch.tax_amount = tax;
        if (Number.isFinite(Number(tip))) patch.tip_amount = tip;

        await sb.from("orders").update(patch).eq("id", orderId);
      }
    }

    return NextResponse.json({
      url: session.url,
      session_id: session.id,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Stripe error" },
      { status: 500 }
    );
  }
}