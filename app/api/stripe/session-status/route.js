import Stripe from "stripe";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-06-20",
});

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const sessionId = String(url.searchParams.get("session_id") || "").trim();

    if (!sessionId) {
      return Response.json({ ok: false, error: "Missing session_id" }, { status: 400 });
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return Response.json({ ok: false, error: "Missing STRIPE_SECRET_KEY env var" }, { status: 500 });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    // payment_status: 'paid' | 'unpaid' | 'no_payment_required'
    // status: 'open' | 'complete' | 'expired'
    return Response.json({
      ok: true,
      id: session.id,
      status: session.status,
      payment_status: session.payment_status,
      amount_total: session.amount_total,
      currency: session.currency,
      payment_intent: session.payment_intent,
      customer_email: session.customer_details?.email || session.customer_email || null,
    });
  } catch (e) {
    return Response.json(
      { ok: false, error: e?.message || String(e) },
      { status: 500 }
    );
  }
}