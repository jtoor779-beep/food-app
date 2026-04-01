import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

/**
 * Build base URL safely:
 * - Prefer NEXT_PUBLIC_BASE_URL if present
 * - Otherwise derive from request headers (works in dev + prod)
 */
function getBaseUrl(req: Request) {
  const host =
    req.headers.get("x-forwarded-host") ||
    req.headers.get("host") ||
    "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") || "http";
  const requestUrl = `${proto}://${host}`.replace(/\/+$/, "");

  const envUrl = (
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    ""
  ).trim();

  if (!envUrl) return requestUrl;

  try {
    const env = new URL(envUrl);
    const reqUrl = new URL(requestUrl);
    const isLocalEnv = /^(localhost|127\.0\.0\.1)$/i.test(env.hostname);
    const isLocalReq = /^(localhost|127\.0\.0\.1)$/i.test(reqUrl.hostname);
    const isPrivateReq =
      /^192\.168\./.test(reqUrl.hostname) ||
      /^10\./.test(reqUrl.hostname) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(reqUrl.hostname);

    if (isLocalEnv && isLocalReq && env.host !== reqUrl.host) {
      return requestUrl;
    }

    if (isLocalEnv && isPrivateReq) {
      return requestUrl;
    }
  } catch {
    return requestUrl;
  }

  return envUrl.replace(/\/+$/, "");
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

function pickMetaStr(meta: any, keys: string[]) {
  for (const k of keys) {
    const v = meta?.[k];
    const s = safeStr(v);
    if (s) return s;
  }
  return "";
}

function resolveReturnUrl(baseUrl: string, rawUrl: any, fallbackUrl: string) {
  const value = safeStr(rawUrl);
  if (!value) return fallbackUrl;

  const isAppScheme = /^homyfodcustomer:\/\//i.test(value);
  const isExpoScheme = /^(exp|exps):\/\//i.test(value);
  if (isAppScheme || isExpoScheme) return value;

  try {
    const parsed = new URL(value);
    const base = new URL(baseUrl);
    if (parsed.origin === base.origin) return value;
  } catch {
    // ignore invalid URL
  }

  return fallbackUrl;
}

function appendQueryParams(url: string, params: Record<string, any>) {
  const value = safeStr(url);
  if (!value) return value;

  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && String(v).trim() !== ""
  );

  if (entries.length === 0) return value;

  const isAppScheme =
    /^[a-z][a-z0-9+\-.]*:\/\//i.test(value) && !/^https?:\/\//i.test(value);

  if (isAppScheme) {
    const hasQuery = value.includes("?");
    const query = entries
      .map(([k, v]) => {
        const key = encodeURIComponent(k);
        const rawValue = String(v);

        // Keep Stripe placeholder raw so Stripe can replace it correctly
        const nextValue =
          rawValue === "{CHECKOUT_SESSION_ID}"
            ? "{CHECKOUT_SESSION_ID}"
            : encodeURIComponent(rawValue);

        return `${key}=${nextValue}`;
      })
      .join("&");

    return `${value}${hasQuery ? "&" : "?"}${query}`;
  }

  try {
    const parsed = new URL(value);
    for (const [k, v] of entries) {
      parsed.searchParams.set(k, String(v));
    }
    return parsed.toString();
  } catch {
    const hasQuery = value.includes("?");
    const query = entries
      .map(
        ([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`
      )
      .join("&");
    return `${value}${hasQuery ? "&" : "?"}${query}`;
  }
}

function buildStripeReturnUrl(
  baseUrl: string,
  rawUrl: any,
  fallbackUrl: string,
  extraParams: Record<string, any>
) {
  const resolved = resolveReturnUrl(baseUrl, rawUrl, fallbackUrl);
  return appendQueryParams(resolved, extraParams);
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return null;

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

function schemaMismatchMessage(error: any) {
  const msg = safeStr(error?.message).toLowerCase();
  return (
    msg.includes("does not exist") ||
    msg.includes("schema cache") ||
    msg.includes("could not find") ||
    msg.includes("relation")
  );
}

function extractMissingColumn(error: any) {
  const msg = safeStr(error?.message);
  const quoted = msg.match(/'([^']+)'/);
  if (!quoted?.[1]) return "";
  const raw = quoted[1];
  if (!raw.includes(".")) return raw.trim();
  const parts = raw.split(".");
  return safeStr(parts[parts.length - 1]);
}

async function updateOrderSafely(
  sb: any,
  table: string,
  orderId: string,
  patch: Record<string, any>
) {
  const attempts: Record<string, any>[] =
    table === "grocery_orders"
      ? [
          { ...patch },
          (() => {
            const next: Record<string, any> = { ...patch };
            delete next.payment_method;
            delete next.payment_status;
            return next;
          })(),
          (() => {
            const next: Record<string, any> = { ...patch };
            delete next.payment_method;
            delete next.payment_status;
            delete next.delivery_fee;
            delete next.platform_fee;
            delete next.tax_amount;
            delete next.tip_amount;
            return next;
          })(),
          { stripe_session_id: patch.stripe_session_id },
        ]
      : [
          { ...patch },
          (() => {
            const next: Record<string, any> = { ...patch };
            delete next.platform_fee;
            return next;
          })(),
          { stripe_session_id: patch.stripe_session_id },
        ];

  let lastError: any = null;

  for (const body of attempts) {
    const nextBody: Record<string, any> = { ...body };
    const removed = new Set<string>();

    for (let i = 0; i < 10; i += 1) {
      const { error } = await sb.from(table).update(nextBody).eq("id", orderId);

      if (!error) return;

      lastError = error;
      if (!schemaMismatchMessage(error)) throw error;

      const missingColumn = extractMissingColumn(error);
      if (
        missingColumn &&
        missingColumn in nextBody &&
        !removed.has(missingColumn)
      ) {
        removed.add(missingColumn);
        delete nextBody[missingColumn];
        continue;
      }

      break;
    }
  }

  if (lastError) throw lastError;
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
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

    const body = await req.json().catch(() => ({}));

    const items = Array.isArray(body?.items) ? body.items : [];
    if (items.length === 0) {
      return NextResponse.json({ error: "No items provided" }, { status: 400 });
    }

    const meta = body?.meta && typeof body.meta === "object" ? body.meta : {};

    const orderId = safeStr(
      pickFirst(body?.order_id, body?.orderId, meta?.order_id, meta?.orderId)
    );

    const currency = safeStr(
      pickFirst(body?.currency, meta?.currency, "USD")
    ).toLowerCase();

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

    const cancelRedirect = safeStr(
      pickFirst(
        body?.cancel_redirect,
        body?.cancelRedirect,
        meta?.cancel_redirect,
        meta?.cancelRedirect
      )
    );

    const deliveryFee = pickMoney(meta, [
      "delivery_fee",
      "deliveryFee",
      "delivery_fee_amount",
    ]);
    const tax = pickMoney(meta, ["tax", "gst", "gst_amount", "tax_amount"]);
    const platformFee = pickMoney(meta, [
      "platform_fee",
      "platform_fee_amount",
      "platformFee",
    ]);
    const tip = pickMoney(meta, ["tip", "tip_amount", "tipAmount"]);

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

    const customerName = pickMetaStr(meta, [
      "customer_name",
      "customerName",
      "name",
      "full_name",
      "fullName",
    ]);
    const customerPhone = pickMetaStr(meta, [
      "phone",
      "customer_phone",
      "customerPhone",
      "mobile",
      "mobile_number",
    ]);
    const addressLine1 = pickMetaStr(meta, [
      "address_line1",
      "addressLine1",
      "address1",
      "address",
    ]);
    const addressLine2 = pickMetaStr(meta, [
      "address_line2",
      "addressLine2",
      "address2",
    ]);
    const landmark = pickMetaStr(meta, ["landmark"]);
    const instructions = pickMetaStr(meta, [
      "instructions",
      "delivery_instructions",
      "deliveryInstructions",
      "note",
      "notes",
    ]);

    const customerLatStr = pickMetaStr(meta, [
      "customer_lat",
      "customerLat",
      "lat",
    ]);
    const customerLngStr = pickMetaStr(meta, [
      "customer_lng",
      "customerLng",
      "lng",
    ]);

    const customerLat = customerLatStr ? Number(customerLatStr) : null;
    const customerLng = customerLngStr ? Number(customerLngStr) : null;

    const metadata: Record<string, string> = {
      order_id: orderId,
      order_type: orderTypeRaw,
      restaurant_id: restaurantId,
      store_id: storeId,
      success_redirect: successRedirect,
      customer_lat: customerLatStr,
      customer_lng: customerLngStr,
      cart_mode: safeStr(
        pickFirst(
          body?.cart_mode,
          body?.cartMode,
          meta?.cart_mode,
          meta?.cartMode
        )
      ),
      customer_name: customerName,
      customer_phone: customerPhone,
      address_line1: addressLine1,
      address_line2: addressLine2,
      landmark,
      instructions,
      platform_fee: String(platformFee || 0),
      delivery_fee: String(deliveryFee || 0),
      tax_amount: String(tax || 0),
      tip_amount: String(tip || 0),
    };

    for (const k of Object.keys(metadata)) {
      if (!metadata[k]) delete metadata[k];
    }

    const defaultSuccessUrl = `${baseUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}${
      orderTypeRaw ? `&order_type=${encodeURIComponent(orderTypeRaw)}` : ""
    }${storeId ? `&store_id=${encodeURIComponent(storeId)}` : ""}${
      restaurantId ? `&restaurant_id=${encodeURIComponent(restaurantId)}` : ""
    }${successRedirect ? `&success_redirect=${encodeURIComponent(successRedirect)}` : ""}${
      orderId ? `&order_id=${encodeURIComponent(orderId)}` : ""
    }`;

    const defaultCancelUrl = `${baseUrl}/payment/cancel${
      orderId || orderTypeRaw
        ? `?${[
            orderId ? `order_id=${encodeURIComponent(orderId)}` : "",
            orderTypeRaw ? `order_type=${encodeURIComponent(orderTypeRaw)}` : "",
          ]
            .filter(Boolean)
            .join("&")}`
        : ""
    }`;
const successUrl = buildStripeReturnUrl(
  baseUrl,
  "homyfodcustomer://payment/success",
  defaultSuccessUrl,
  {
    session_id: "{CHECKOUT_SESSION_ID}",
    order_type: orderTypeRaw,
    store_id: storeId,
    restaurant_id: restaurantId,
    order_id: orderId,
  }
);
  
    const cancelUrl = buildStripeReturnUrl(
      baseUrl,
      pickFirst(
        body?.cancel_url,
        body?.cancelUrl,
        meta?.cancel_url,
        meta?.cancelUrl,
        cancelRedirect
      ),
      defaultCancelUrl,
      {
        order_type: orderTypeRaw,
        store_id: storeId,
        restaurant_id: restaurantId,
        order_id: orderId,
      }
    );

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      metadata: Object.keys(metadata).length ? metadata : undefined,
      client_reference_id: orderId || storeId || restaurantId || undefined,
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    if (orderId) {
      const sb = getSupabaseAdmin();
      if (sb) {
        const patch: Record<string, any> = {
          stripe_session_id: session.id,
          payment_method: "stripe",
          payment_status: "pending",
        };

        if (customerLat !== null && Number.isFinite(customerLat))
          patch.customer_lat = customerLat;
        if (customerLng !== null && Number.isFinite(customerLng))
          patch.customer_lng = customerLng;

        if (customerName) patch.customer_name = customerName;
        if (customerPhone) patch.phone = customerPhone;
        if (addressLine1) patch.address_line1 = addressLine1;
        if (addressLine2) patch.address_line2 = addressLine2;
        if (landmark) patch.landmark = landmark;
        if (instructions) patch.instructions = instructions;

        if (Number.isFinite(Number(deliveryFee))) patch.delivery_fee = deliveryFee;
        if (Number.isFinite(Number(platformFee))) patch.platform_fee = platformFee;
        if (Number.isFinite(Number(tax))) patch.tax_amount = tax;
        if (Number.isFinite(Number(tip))) patch.tip_amount = tip;

        const normalizedOrderType = String(orderTypeRaw || "").toLowerCase();
        const orderTable = normalizedOrderType.includes("groc")
          ? "grocery_orders"
          : "orders";

        await updateOrderSafely(sb, orderTable, orderId, patch);
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