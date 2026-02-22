import { NextResponse } from "next/server";
import Stripe from "stripe";

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

export async function POST(req: Request) {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { error: "Missing STRIPE_SECRET_KEY in .env.local" },
        { status: 500 }
      );
    }

    const baseUrl = getBaseUrl(req);

    // ✅ IMPORTANT: remove apiVersion to avoid TS error with older stripe package
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

    const body = await req.json().catch(() => ({}));

    // body.items should be like:
    // [{ name: "Product name", price: 12.5, quantity: 2 }]
    const items = Array.isArray(body?.items) ? body.items : [];

    if (items.length === 0) {
      return NextResponse.json({ error: "No items provided" }, { status: 400 });
    }

    const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = items.map(
      (it: any) => ({
        quantity: Math.max(1, Number(it?.quantity || 1)),
        price_data: {
          currency: "usd",
          product_data: {
            name: String(it?.name || "Item"),
          },
          unit_amount: Math.round(Number(it?.price || 0) * 100), // dollars -> cents
        },
      })
    );

    /**
     * ✅ NEW: Metadata (non-breaking)
     * We’ll pass these so /api/stripe/verify-session can return them,
     * and your shared /payment/success page can decide:
     * - save to grocery tables OR restaurant tables
     *
     * You can send ANY of these from the client:
     * body.order_type = "grocery" | "restaurant"
     * body.restaurant_id = "<uuid>"
     * body.store_id = "<uuid>"
     * body.success_redirect = "/orders" or "/groceries/orders"
     * body.cart_mode = "grocery" | "restaurant" etc (optional)
     *
     * ✅ UPDATE: We ALSO support body.meta.* because your cart sends payload.meta now.
     */
    const meta = body?.meta && typeof body.meta === "object" ? body.meta : {};

    const orderTypeRaw = safeStr(
      body?.order_type ||
        body?.orderType ||
        body?.cart_mode ||
        body?.cartMode ||
        meta?.order_type ||
        meta?.orderType ||
        meta?.cart_mode ||
        meta?.cartMode
    );

    const metadata: Record<string, string> = {
      order_type: orderTypeRaw, // we'll normalize in verify-session

      // restaurant id (supports body + meta)
      restaurant_id: safeStr(
        body?.restaurant_id ||
          body?.restaurantId ||
          meta?.restaurant_id ||
          meta?.restaurantId
      ),

      // store id (supports body + meta)
      store_id: safeStr(
        body?.store_id ||
          body?.storeId ||
          body?.grocery_store_id ||
          body?.groceryStoreId ||
          meta?.store_id ||
          meta?.storeId ||
          meta?.grocery_store_id ||
          meta?.groceryStoreId
      ),

      // redirect (supports body + meta)
      success_redirect: safeStr(
        body?.success_redirect ||
          body?.successRedirect ||
          body?.redirect_to ||
          body?.redirectTo ||
          meta?.success_redirect ||
          meta?.successRedirect ||
          meta?.redirect_to ||
          meta?.redirectTo
      ),

      // cart mode (supports body + meta)
      cart_mode: safeStr(body?.cart_mode || body?.cartMode || meta?.cart_mode || meta?.cartMode),
    };

    // Remove empty values (Stripe metadata values must be strings, best to keep clean)
    for (const k of Object.keys(metadata)) {
      if (!metadata[k]) delete metadata[k];
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,

      // ✅ NEW (safe): attach metadata so we can identify restaurant vs grocery later
      metadata: Object.keys(metadata).length ? metadata : undefined,

      success_url: `${baseUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/payment/cancel`,
    });

    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Stripe error" },
      { status: 500 }
    );
  }
}