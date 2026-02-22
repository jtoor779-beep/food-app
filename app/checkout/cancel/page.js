"use client";

import Link from "next/link";

export default function CheckoutCancelPage() {
  return (
    <main style={pageBg}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <div style={card}>
          <div style={badge}>Payment Cancelled</div>
          <h1 style={title}>No worries 🙂</h1>
          <p style={sub}>
            Your payment was cancelled. You can go back to your cart and try again anytime.
          </p>

          <div style={actions}>
            <Link href="/cart" style={btnPrimary}>
              Back to Cart
            </Link>

            <Link href="/" style={btnGhost}>
              Home
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

const pageBg = {
  minHeight: "calc(100vh - 64px)",
  padding: 20,
  background:
    "radial-gradient(1200px 600px at 20% 10%, rgba(255,140,0,0.16), transparent 62%), radial-gradient(900px 520px at 80% 18%, rgba(80,160,255,0.16), transparent 58%), linear-gradient(180deg, #f7f7fb, #ffffff)",
};

const card = {
  borderRadius: 22,
  padding: 18,
  background: "rgba(255,255,255,0.82)",
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 16px 52px rgba(0,0,0,0.10)",
  backdropFilter: "blur(10px)",
};

const badge = {
  display: "inline-flex",
  padding: "8px 12px",
  borderRadius: 999,
  border: "1px solid rgba(239,68,68,0.22)",
  background: "rgba(254,242,242,0.95)",
  color: "#7f1d1d",
  fontWeight: 950,
  fontSize: 12,
};

const title = {
  margin: "12px 0 0 0",
  fontSize: 34,
  fontWeight: 1000,
  color: "#0b1220",
  letterSpacing: -0.2,
};

const sub = {
  marginTop: 10,
  fontWeight: 850,
  color: "rgba(17,24,39,0.72)",
  lineHeight: "22px",
};

const actions = {
  marginTop: 16,
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const btnPrimary = {
  padding: "12px 14px",
  borderRadius: 14,
  border: "1px solid rgba(17,24,39,0.95)",
  background: "rgba(17,24,39,0.95)",
  color: "#fff",
  textDecoration: "none",
  fontWeight: 950,
  boxShadow: "0 12px 26px rgba(17,24,39,0.16)",
};

const btnGhost = {
  padding: "12px 14px",
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.90)",
  color: "#0b1220",
  textDecoration: "none",
  fontWeight: 950,
};