"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import supabase from "@/lib/supabase";

/* =========================
   HELPERS
   ========================= */

function money(v) {
  const n = Number(v || 0);
  return `₹${n.toFixed(0)}`;
}

function safeStr(v) {
  return String(v ?? "").trim();
}

function formatTime(ts) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts || "");
  }
}

function ymdd(ts) {
  try {
    const d = ts ? new Date(ts) : new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}${m}${day}`;
  } catch {
    return "00000000";
  }
}

function initials(name) {
  const s = safeStr(name);
  if (!s) return "HF";
  const parts = s.split(" ").filter(Boolean);
  const a = (parts[0] || "").slice(0, 1).toUpperCase();
  const b = (parts[1] || "").slice(0, 1).toUpperCase();
  return (a + b) || "HF";
}

function safeNum(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

/* =========================
   ✅ FIX FOR NEXT BUILD:
   Wrap useSearchParams() in Suspense boundary
   ========================= */

export default function GroceryInvoicePage() {
  return (
    <Suspense fallback={<div style={{ padding: 20, fontWeight: 900 }}>Loading invoice…</div>}>
      <GroceryInvoiceInner />
    </Suspense>
  );
}

/* =========================
   PAGE (OLD LOGIC 100% KEPT)
   ========================= */

function GroceryInvoiceInner() {
  const router = useRouter();
  const sp = useSearchParams();

  const id = sp.get("id") || "";
  const autoPrint = sp.get("print") === "1";

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [user, setUser] = useState(null);

  const [order, setOrder] = useState(null);
  const [store, setStore] = useState(null);

  const items = useMemo(() => {
    const arr = order?.grocery_order_items;
    return Array.isArray(arr) ? arr : [];
  }, [order]);

  const subtotal = useMemo(() => {
    return (items || []).reduce((s, it) => {
      const qty = safeNum(it?.quantity ?? it?.qty, 0);
      const unit = safeNum(it?.unit_price ?? it?.price_each, 0);
      const line = safeNum(it?.line_total, qty * unit);
      return s + safeNum(line, 0);
    }, 0);
  }, [items]);

  const deliveryFee = useMemo(() => safeNum(order?.delivery_fee, 0), [order]);
  const tip = useMemo(() => safeNum(order?.tip_amount, 0), [order]);

  // GST/Tax: schema-safe (0 default). If you add column later it auto shows.
  const gst = useMemo(() => {
    const candidates = [order?.gst_amount, order?.tax_amount, order?.taxes, order?.gst, order?.tax];
    for (const c of candidates) {
      const n = Number(c);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return 0;
  }, [order]);

  const discount = useMemo(() => {
    const candidates = [order?.discount_amount, order?.discount, order?.coupon_discount];
    for (const c of candidates) {
      const n = Number(c);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return 0;
  }, [order]);

  const grandTotal = useMemo(() => {
    const t = safeNum(order?.total_amount, 0);
    if (t > 0) return t;
    const computed = subtotal + deliveryFee + tip + gst - discount;
    return Math.max(0, computed);
  }, [order, subtotal, deliveryFee, tip, gst, discount]);

  const invoiceNo = useMemo(() => {
    const short = safeStr(order?.id).slice(0, 6).toUpperCase();
    return `INV-${ymdd(order?.created_at)}-${short || "XXXXXX"}`;
  }, [order]);

  const orderRefShort = useMemo(() => {
    const s = safeStr(order?.id);
    if (!s) return "—";
    return `${s.slice(0, 6)}…${s.slice(-4)}`;
  }, [order]);

  async function fetchItems(orderId) {
    // ✅ IMPORTANT: Your DB has "item_name" column
    const tries = [
      "id, order_id, item_name, name, quantity, unit_price, line_total",
      "id, order_id, item_name, quantity, unit_price, line_total",
      "id, order_id, item_name, quantity",
      "id, order_id, name, quantity, unit_price, line_total",
      "id, order_id, name, quantity",
    ];

    for (const sel of tries) {
      const r = await supabase.from("grocery_order_items").select(sel).eq("order_id", orderId);
      if (!r.error) return Array.isArray(r.data) ? r.data : [];
    }

    return [];
  }

  async function load() {
    setLoading(true);
    setErr("");

    try {
      if (!id) {
        setErr("Missing order id.");
        setLoading(false);
        return;
      }

      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;

      const u = userData?.user;
      if (!u) {
        router.push("/login");
        return;
      }
      setUser(u);

      // Try with embedded items (but include item_name not product_name)
      const baseSelect = `
        id,
        customer_user_id,
        store_id,
        status,
        total_amount,
        delivery_fee,
        tip_amount,
        created_at,
        updated_at,
        customer_name,
        customer_phone,
        delivery_address,
        instructions,
        grocery_order_items (
          id,
          order_id,
          item_name,
          name,
          quantity,
          unit_price,
          line_total
        )
      `;

      const altSelect = `
        id,
        customer_user_id,
        store_id,
        status,
        total_amount,
        delivery_fee,
        tip_amount,
        created_at,
        updated_at,
        customer_name,
        customer_phone,
        delivery_address,
        instructions
      `;

      let o = null;

      const r1 = await supabase
        .from("grocery_orders")
        .select(baseSelect)
        .eq("id", id)
        .eq("customer_user_id", u.id)
        .maybeSingle();

      if (!r1.error && r1.data) {
        o = r1.data;
      } else {
        const r2 = await supabase
          .from("grocery_orders")
          .select(altSelect)
          .eq("id", id)
          .eq("customer_user_id", u.id)
          .maybeSingle();

        if (r2.error) throw r2.error;
        o = r2.data;
      }

      if (!o) {
        setErr("Invoice not found for this account.");
        setLoading(false);
        return;
      }

      // If items missing, fetch from grocery_order_items using order_id
      if (!Array.isArray(o.grocery_order_items) || o.grocery_order_items.length === 0) {
        o.grocery_order_items = await fetchItems(o.id);
      }

      setOrder(o);

      // ✅ Fetch store info (best-effort / column-safe)
      let sRow = null;
      try {
        const tries = ["id, name, address, phone", "id, store_name, address, phone", "id, name"];
        for (const sel of tries) {
          const { data: s, error: sErr } = await supabase.from("grocery_stores").select(sel).eq("id", o.store_id).maybeSingle();
          if (!sErr && s) {
            sRow = s;
            break;
          }
        }
      } catch {
        sRow = null;
      }
      setStore(sRow);

      if (autoPrint) {
        setTimeout(() => {
          try {
            window.print();
          } catch {}
        }, 600);
      }
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const storeName = safeStr(store?.name) || safeStr(store?.store_name) || "Grocery Store";
  const storePhone = safeStr(store?.phone);
  const storeAddr = safeStr(store?.address);

  const custName = safeStr(order?.customer_name) || safeStr(user?.email) || "Customer";
  const custPhone = safeStr(order?.customer_phone);
  const custAddr = safeStr(order?.delivery_address);

  const status = safeStr(order?.status) || "pending";

  const itemCount = useMemo(() => {
    return (items || []).reduce((s, it) => s + safeNum(it?.quantity ?? it?.qty, 0), 0) || (items || []).length || 0;
  }, [items]);

  return (
    <main style={pageBg}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        {/* HERO */}
        <div style={heroGlass}>
          <div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <div style={pill}>Invoice • Grocery</div>
              <div style={{ ...chip, ...statusChipStyle(status) }}>{status.toUpperCase()}</div>
              <div style={chip}>{invoiceNo}</div>
            </div>

            <h1 style={title}>Grocery Invoice</h1>
            <div style={sub}>{loading ? "Loading invoice…" : err ? "Invoice error" : `Order #${String(order?.id || "").slice(0, 8)}…`}</div>

            {!loading && !err && order ? (
              <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <div style={miniChip}>
                  <span style={miniLabel}>Invoice No</span>
                  <span style={miniValue}>{invoiceNo}</span>
                </div>
                <div style={miniChip}>
                  <span style={miniLabel}>Order Ref</span>
                  <span style={miniValue}>{orderRefShort}</span>
                </div>
                <div style={miniChip}>
                  <span style={miniLabel}>Items</span>
                  <span style={miniValue}>{itemCount}</span>
                </div>
              </div>
            ) : null}
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <Link href="/groceries/orders" style={btnGhost}>
              ← Back to Grocery Orders
            </Link>
            <button onClick={() => window.print()} style={btnPrimary}>
              Print / Save PDF
            </button>
          </div>
        </div>

        {err ? <div style={alertErr}>{err}</div> : null}

        {!loading && !err && order ? (
          <div style={{ marginTop: 12, ...cardGlass }}>
            {/* TOP STRIP */}
            <div style={topStrip}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div style={avatar}>{initials(storeName)}</div>
                <div>
                  <div style={{ fontWeight: 1000, color: "#0b1220" }}>{storeName}</div>
                  <div style={{ marginTop: 2, fontWeight: 850, color: "rgba(17,24,39,0.62)", fontSize: 12 }}>
                    Thank you for ordering with HomyFod • Food + Groceries
                  </div>
                </div>
              </div>

              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 900, color: "rgba(17,24,39,0.60)", fontSize: 12 }}>Invoice Total</div>
                <div style={{ fontWeight: 1100, color: "#0b1220", fontSize: 22 }}>{money(grandTotal)}</div>
                <div style={{ marginTop: 2, fontWeight: 850, color: "rgba(17,24,39,0.60)", fontSize: 12 }}>Generated: {formatTime(new Date())}</div>
              </div>
            </div>

            {/* Header boxes */}
            <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={box}>
                <div style={boxTitle}>Billed From</div>
                <div style={boxStrong}>{storeName}</div>
                {storeAddr ? <div style={boxText}>{storeAddr}</div> : null}
                {storePhone ? <div style={boxText}>Phone: {storePhone}</div> : null}
                {order?.store_id ? <div style={boxText}>Store ID: {order.store_id}</div> : null}
              </div>

              <div style={box}>
                <div style={boxTitle}>Billed To</div>
                <div style={boxStrong}>{custName}</div>
                {custPhone ? <div style={boxText}>Phone: {custPhone}</div> : null}
                {custAddr ? <div style={boxText}>{custAddr}</div> : null}
                {order?.instructions ? <div style={boxText}>Instructions: {String(order.instructions)}</div> : null}
              </div>

              <div style={box}>
                <div style={boxTitle}>Invoice Details</div>
                <div style={boxText}>
                  <b>Invoice No:</b> {invoiceNo}
                </div>
                <div style={boxText}>
                  <b>Order ID:</b> {order.id}
                </div>
                <div style={boxText}>
                  <b>Date:</b> {formatTime(order.created_at)}
                </div>
                <div style={boxText}>
                  <b>Status:</b> {status}
                </div>
                <div style={boxText}>
                  <b>Payment:</b> ONLINE <span style={{ marginLeft: 8, ...miniPill }}>{status.toUpperCase()}</span>
                </div>
              </div>
            </div>

            {/* Items */}
            <div style={{ marginTop: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 1000, color: "#0b1220" }}>Items</div>
                <div style={{ fontWeight: 850, color: "rgba(17,24,39,0.62)", fontSize: 12 }}>
                  {items.length} item(s) • {status}
                </div>
              </div>

              <div style={{ marginTop: 10, ...table }}>
                <div style={{ ...tRow, ...tHead }}>
                  <div>Item</div>
                  <div style={{ textAlign: "right" }}>Qty</div>
                  <div style={{ textAlign: "right" }}>Unit</div>
                  <div style={{ textAlign: "right" }}>Total</div>
                </div>

                {items.length === 0 ? (
                  <div style={{ padding: 12, fontWeight: 900, color: "rgba(17,24,39,0.65)" }}>No items found</div>
                ) : (
                  items.map((it) => {
                    // ✅ IMPORTANT: Use item_name first (your DB), fallback to name
                    const name = safeStr(it?.item_name) || safeStr(it?.name) || "Item";
                    const qty = safeNum(it?.quantity ?? it?.qty, 0);
                    const unit = safeNum(it?.unit_price ?? it?.price_each, 0);
                    const line = safeNum(it?.line_total, qty * unit);

                    return (
                      <div key={it.id} style={tRow}>
                        <div style={{ fontWeight: 950, color: "#0b1220" }}>{name}</div>
                        <div style={{ textAlign: "right", fontWeight: 900, color: "rgba(17,24,39,0.75)" }}>{qty}</div>
                        <div style={{ textAlign: "right", fontWeight: 900, color: "rgba(17,24,39,0.75)" }}>{money(unit)}</div>
                        <div style={{ textAlign: "right", fontWeight: 1000, color: "#0b1220" }}>{money(line)}</div>
                      </div>
                    );
                  })
                )}
              </div>

              {order?.instructions ? (
                <div style={{ marginTop: 12, ...noteBox }}>
                  <div style={{ fontWeight: 1000 }}>Customer Instructions</div>
                  <div style={{ marginTop: 6, fontWeight: 850, color: "rgba(17,24,39,0.72)", lineHeight: 1.45 }}>
                    {String(order.instructions)}
                  </div>
                </div>
              ) : null}
            </div>

            {/* Totals */}
            <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
              <div style={totalsBox}>
                <div style={line}>
                  <span>Subtotal</span>
                  <span style={{ color: "#0b1220" }}>{money(subtotal)}</span>
                </div>
                <div style={line}>
                  <span>Delivery Fee</span>
                  <span style={{ color: "#0b1220" }}>{money(deliveryFee)}</span>
                </div>
                <div style={line}>
                  <span>Tip</span>
                  <span style={{ color: "#0b1220" }}>{money(tip)}</span>
                </div>
                <div style={line}>
                  <span>Taxes / GST</span>
                  <span style={{ color: "#0b1220" }}>{money(gst)}</span>
                </div>
                <div style={line}>
                  <span>Discount</span>
                  <span style={{ color: discount > 0 ? "#065f46" : "#0b1220" }}>{discount > 0 ? `- ${money(discount)}` : money(0)}</span>
                </div>
                <div style={{ ...line, borderBottom: "none" }}>
                  <span style={{ fontWeight: 1000, color: "#0b1220" }}>Grand Total</span>
                  <span style={{ fontWeight: 1000, color: "#0b1220" }}>{money(grandTotal)}</span>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 12, ...tiny }}>
              This invoice is generated automatically for your grocery order. Use “Print / Save PDF” to download.
            </div>
          </div>
        ) : null}
      </div>

      <style>{printCss}</style>
    </main>
  );
}

/* =========================
   PREMIUM INLINE STYLES
   ========================= */

const pageBg = {
  minHeight: "calc(100vh - 64px)",
  padding: 20,
  background:
    "radial-gradient(1200px 600px at 20% 10%, rgba(34,197,94,0.18), transparent 62%), radial-gradient(900px 520px at 80% 18%, rgba(59,130,246,0.14), transparent 58%), linear-gradient(180deg, #f7f7fb, #ffffff)",
};

const heroGlass = {
  borderRadius: 22,
  padding: 18,
  background: "rgba(255,255,255,0.82)",
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 16px 52px rgba(0,0,0,0.10)",
  backdropFilter: "blur(10px)",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-end",
  gap: 14,
  flexWrap: "wrap",
};

const pill = {
  display: "inline-flex",
  padding: "8px 12px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(255,255,255,0.80)",
  color: "rgba(17,24,39,0.78)",
  fontWeight: 950,
  fontSize: 12,
};

const chip = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "7px 10px",
  borderRadius: 999,
  border: "1px dashed rgba(0,0,0,0.14)",
  background: "rgba(255,255,255,0.86)",
  fontWeight: 950,
  fontSize: 12,
  color: "rgba(17,24,39,0.78)",
};

function statusChipStyle(status) {
  const s = String(status || "").toLowerCase();
  if (s === "delivered")
    return { background: "rgba(236,253,245,0.92)", border: "1px solid rgba(16,185,129,0.25)", color: "#065f46" };
  if (s === "cancelled" || s === "rejected")
    return { background: "rgba(254,242,242,0.92)", border: "1px solid rgba(239,68,68,0.25)", color: "#7f1d1d" };
  if (s === "on_the_way" || s === "picked_up" || s === "delivering")
    return { background: "rgba(239,246,255,0.92)", border: "1px solid rgba(59,130,246,0.22)", color: "#1e40af" };
  return { background: "rgba(255,247,237,0.92)", border: "1px solid rgba(249,115,22,0.22)", color: "#9a3412" };
}

const title = {
  margin: "10px 0 0 0",
  fontSize: 34,
  fontWeight: 1000,
  color: "#0b1220",
  letterSpacing: -0.2,
};

const sub = {
  marginTop: 8,
  fontWeight: 850,
  color: "rgba(17,24,39,0.70)",
};

const btnPrimary = {
  padding: "12px 14px",
  borderRadius: 14,
  border: "1px solid rgba(17,24,39,0.95)",
  background: "rgba(17,24,39,0.95)",
  color: "#fff",
  fontWeight: 950,
  cursor: "pointer",
  boxShadow: "0 12px 26px rgba(17,24,39,0.16)",
};

const btnGhost = {
  padding: "12px 14px",
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.92)",
  color: "#111827",
  textDecoration: "none",
  fontWeight: 950,
  cursor: "pointer",
};

const alertErr = {
  marginTop: 12,
  padding: 12,
  borderRadius: 16,
  border: "1px solid rgba(239,68,68,0.25)",
  background: "rgba(254,242,242,0.9)",
  color: "#7f1d1d",
  fontWeight: 900,
};

const cardGlass = {
  borderRadius: 18,
  padding: 14,
  background: "rgba(255,255,255,0.78)",
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 12px 36px rgba(0,0,0,0.08)",
  backdropFilter: "blur(10px)",
};

const topStrip = {
  borderRadius: 18,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.86)",
  padding: 14,
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
  alignItems: "center",
};

const avatar = {
  width: 40,
  height: 40,
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(17,24,39,0.04)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 1100,
  color: "rgba(17,24,39,0.72)",
};

const box = {
  minWidth: 260,
  flex: 1,
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.85)",
  padding: 12,
};

const boxTitle = {
  fontSize: 12,
  fontWeight: 950,
  color: "rgba(17,24,39,0.65)",
};

const boxStrong = {
  marginTop: 8,
  fontWeight: 1000,
  color: "#0b1220",
};

const boxText = {
  marginTop: 6,
  fontWeight: 850,
  color: "rgba(17,24,39,0.72)",
  lineHeight: 1.4,
};

const table = {
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.85)",
  overflow: "hidden",
};

const tRow = {
  display: "grid",
  gridTemplateColumns: "1.7fr 0.4fr 0.6fr 0.7fr",
  gap: 10,
  padding: "10px 12px",
  borderBottom: "1px solid rgba(0,0,0,0.06)",
  alignItems: "center",
};

const tHead = {
  background: "rgba(17,24,39,0.04)",
  fontWeight: 1000,
  color: "rgba(17,24,39,0.75)",
};

const totalsBox = {
  width: 360,
  maxWidth: "100%",
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.85)",
  padding: 12,
};

const line = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  padding: "8px 0",
  borderBottom: "1px dashed rgba(0,0,0,0.10)",
  fontWeight: 900,
  color: "rgba(17,24,39,0.72)",
};

const noteBox = {
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.85)",
  padding: 12,
};

const tiny = {
  marginTop: 12,
  fontSize: 12,
  fontWeight: 850,
  color: "rgba(17,24,39,0.65)",
  lineHeight: "18px",
};

const miniChip = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 10px",
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(255,255,255,0.82)",
};

const miniLabel = {
  fontWeight: 950,
  fontSize: 12,
  color: "rgba(17,24,39,0.60)",
};

const miniValue = {
  fontWeight: 1000,
  fontSize: 12,
  color: "#0b1220",
};

const miniPill = {
  display: "inline-flex",
  padding: "3px 8px",
  borderRadius: 999,
  border: "1px solid rgba(249,115,22,0.24)",
  background: "rgba(255,247,237,0.95)",
  color: "#9a3412",
  fontWeight: 950,
  fontSize: 12,
};

const printCss = `
@media print {
  body { background: white !important; }
  main { padding: 0 !important; }
  a, button { display: none !important; }
}
`;