"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function SuccessInner() {
  const sp = useSearchParams();
  const sessionId = sp.get("session_id");

  return (
    <main style={pageBg}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <div style={card}>
          <div style={badgeOk}>Payment Successful</div>

          <h1 style={title}>Thank you! 🎉</h1>
          <p style={sub}>
            Your payment has been completed successfully. We’re preparing your order now.
          </p>

          {sessionId ? (
            <div style={sessionBox}>
              <div style={sessionLabel}>Stripe Session</div>
              <div style={sessionIdStyle}>{sessionId}</div>
              <div style={hint}>Keep this for reference if you contact support.</div>
            </div>
          ) : (
            <div style={sessionBox}>
              <div style={hint}>
                (No session_id found in URL — still okay, but we can wire verification next.)
              </div>
            </div>
          )}

          <div style={actions}>
            <Link href="/orders" style={btnPrimary}>
              View My Orders
            </Link>

            <Link href="/" style={btnGhost}>
              Back to Home
            </Link>

            <Link href="/cart" style={btnGhost}>
              Back to Cart
            </Link>
          </div>

          <div style={footerNote}>
            If you want, next step we can **verify payment** using the session_id and show
            the exact paid amount + order number.
          </div>
        </div>
      </div>
    </main>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense
      fallback={
        <main style={pageBg}>
          <div style={{ maxWidth: 980, margin: "0 auto" }}>
            <div style={card}>
              <div style={badgeOk}>Payment Successful</div>
              <h1 style={title}>Loading…</h1>
              <p style={sub}>Preparing your confirmation details.</p>
            </div>
          </div>
        </main>
      }
    >
      <SuccessInner />
    </Suspense>
  );
}

/* ===== Premium inline styles ===== */

const pageBg = {
  minHeight: "calc(100vh - 64px)",
  padding: 20,
  background:
    "radial-gradient(1200px 600px at 20% 10%, rgba(16,185,129,0.18), transparent 62%), radial-gradient(900px 520px at 80% 18%, rgba(80,160,255,0.18), transparent 58%), linear-gradient(180deg, #f7f7fb, #ffffff)",
};

const card = {
  borderRadius: 22,
  padding: 18,
  background: "rgba(255,255,255,0.82)",
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 16px 52px rgba(0,0,0,0.10)",
  backdropFilter: "blur(10px)",
};

const badgeOk = {
  display: "inline-flex",
  padding: "8px 12px",
  borderRadius: 999,
  border: "1px solid rgba(16,185,129,0.22)",
  background: "rgba(236,253,245,0.95)",
  color: "#065f46",
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

const sessionBox = {
  marginTop: 14,
  padding: 14,
  borderRadius: 18,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.70)",
};

const sessionLabel = {
  fontSize: 12,
  fontWeight: 950,
  color: "rgba(17,24,39,0.70)",
};

const sessionIdStyle = {
  marginTop: 8,
  fontWeight: 950,
  color: "#0b1220",
  fontSize: 13,
  wordBreak: "break-all",
};

const hint = {
  marginTop: 8,
  fontSize: 12,
  fontWeight: 850,
  color: "rgba(17,24,39,0.65)",
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

const footerNote = {
  marginTop: 14,
  fontSize: 12,
  fontWeight: 850,
  color: "rgba(17,24,39,0.65)",
};