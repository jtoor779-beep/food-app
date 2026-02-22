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
      return NextResponse.json(
        { ok: false, error: "Missing session_id" },
        { status: 400 }
      );
    }

    // ✅ IMPORTANT: do NOT set apiVersion here (avoids TS error)
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ["customer_details", "payment_intent"],
    });

    const amount_total =
      typeof session.amount_total === "number" ? session.amount_total : 0;
    const currency = String(session.currency || "").toUpperCase();

    const payment_status = String(session.payment_status || "unpaid");
    const status = String(session.status || "open");

    const email =
      (session.customer_details as any)?.email ||
      (session.customer_email as any) ||
      "";

    const paid = payment_status === "paid";

    // ✅ NEW: Extract metadata safely (for grocery vs restaurant routing)
    const md = (session.metadata || {}) as Record<string, any>;

    // We'll support MANY possible key names so you don’t have to refactor checkout immediately.
    // You can standardize later (recommended: order_type = "grocery" | "restaurant")
    const order_type_raw = pickMeta(md, [
      "order_type",
      "orderType",
      "type",
      "category",
      "flow",
      "source",
    ]).toLowerCase();

    // Normalize a little (doesn't break anything)
    const order_type =
      order_type_raw.includes("groc") ? "grocery" :
      order_type_raw.includes("rest") ? "restaurant" :
      order_type_raw || "";

    const restaurant_id = pickMeta(md, [
      "restaurant_id",
      "restaurantId",
      "rest_id",
      "restId",
    ]);

    const store_id = pickMeta(md, [
      "store_id",
      "storeId",
      "grocery_store_id",
      "groceryStoreId",
    ]);

    // Optional: if you store where to redirect after success
    const success_redirect = pickMeta(md, [
      "success_redirect",
      "successRedirect",
      "redirect",
      "redirect_to",
      "redirectTo",
    ]);

    // Optional: pass through client_reference_id if you ever use it
    const client_reference_id = session.client_reference_id
      ? String(session.client_reference_id)
      : "";

    return NextResponse.json({
      ok: true,
      session_id: session.id,
      paid,
      status,
      payment_status,
      amount_total, // cents
      currency,
      email,

      // ✅ NEW (non-breaking additions)
      order_type,              // "grocery" | "restaurant" | ""
      restaurant_id,           // may be ""
      store_id,                // may be ""
      success_redirect,        // may be ""
      client_reference_id,     // may be ""
      metadata: md,            // raw metadata (useful for debugging)
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Verify session error" },
      { status: 500 }
    );
  }
}