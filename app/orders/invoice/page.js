"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import supabase from "@/lib/supabase";

/* =========================================================
   ✅ CURRENCY SUPPORT (DB + localStorage, SAFE)
   - Source of truth: public.system_settings.default_currency
   - Cache: localStorage "foodapp_currency"
   ========================================================= */

const DEFAULT_CURRENCY = "USD"; // ✅ keep USD for your app

function normalizeCurrency(c) {
  const v = String(c || "").trim().toUpperCase();
  if (v === "USD") return "USD";
  if (v === "INR") return "INR";
  return DEFAULT_CURRENCY;
}

function money(v, currency = DEFAULT_CURRENCY) {
  const n = Number(v || 0);
  const cur = normalizeCurrency(currency);

  if (!isFinite(n)) return cur === "USD" ? "$0.00" : "₹0";

  const fractionDigits = cur === "INR" ? 0 : 2;

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: cur,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(n);
  } catch {
    const fixed = n.toFixed(fractionDigits);
    return cur === "USD" ? `$${fixed}` : `₹${Number(fixed).toFixed(0)}`;
  }
}

function safeNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function isMissingColumnError(msg) {
  const m = String(msg || "").toLowerCase();
  return m.includes("column") && m.includes("does not exist");
}

async function fetchCurrencyFromDB() {
  try {
    const { data, error } = await supabase
      .from("system_settings")
      .select("key, default_currency, value_json, updated_at")
      .order("updated_at", { ascending: false })
      .limit(10);

    if (error) return DEFAULT_CURRENCY;

    const rows = Array.isArray(data) ? data : [];
    if (rows.length === 0) return DEFAULT_CURRENCY;

    const globalRow = rows.find((r) => String(r?.key || "").toLowerCase() === "global");
    const row = globalRow || rows[0];

    const col = row?.default_currency;
    if (col) return normalizeCurrency(col);

    const jsonCur = row?.value_json?.default_currency;
    if (jsonCur) return normalizeCurrency(jsonCur);

    return DEFAULT_CURRENCY;
  } catch {
    return DEFAULT_CURRENCY;
  }
}

function safeStr(v) {
  return String(v ?? "").trim();
}

/**
 * ✅ Clean customer instructions
 * Removes the extra debug/metadata part like:
 * (deliveryFee:... | tax:... | pay:... | platform%:... | ... | currency:USD)
 * Keeps ONLY the real instruction text.
 */
function cleanInstructions(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";

  // Primary cut markers (most reliable)
  const markers = [
    "(deliveryFee:",
    " (deliveryFee:",
    "(tax:",
    " (tax:",
    "(pay:",
    " (pay:",
    "(platform%:",
    " (platform%:",
    "(platformFee:",
    " (platformFee:",
    "(taxNote:",
    " (taxNote:",
    "(currency:",
    " (currency:",
  ];

  const low = s.toLowerCase();
  for (const mk of markers) {
    const i = low.indexOf(mk.toLowerCase());
    if (i !== -1) {
      return s.slice(0, i).trim();
    }
  }

  // Secondary: if it ends with (...) and inside contains known metadata keys
  const m = s.match(/\s*\(([^)]{0,500})\)\s*$/);
  if (m) {
    const inside = String(m[1] || "").toLowerCase();
    const looksLikeMeta =
      inside.includes("deliveryfee") ||
      inside.includes("platformfee") ||
      inside.includes("platform%") ||
      inside.includes("taxnote") ||
      inside.includes("currency") ||
      inside.includes("pay:") ||
      inside.includes("tax:");

    if (looksLikeMeta) {
      return s.slice(0, s.length - m[0].length).trim();
    }
  }

  return s;
}

function formatTime(ts) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts || "");
  }
}

function initials(name) {
  const s = String(name || "").trim();
  if (!s) return "R";
  const parts = s.split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] || "";
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] : "";
  return (a + b).toUpperCase() || "R";
}

function yyyymmdd(d) {
  try {
    const dt = new Date(d || Date.now());
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const day = String(dt.getDate()).padStart(2, "0");
    return `${y}${m}${day}`;
  } catch {
    return "00000000";
  }
}

/**
 * ✅ Order loader (COLUMN-SAFE)
 * Your DB has: platform_fee, delivery_fee, tax_amount, tip_amount
 * Older code sometimes had: commission_amount, gst_amount
 * We try “full select” first, then fallback if any column is missing.
 */
async function fetchOrderForInvoice({ id, userId }) {
  const base = `
    id,
    user_id,
    restaurant_id,
    status,
    created_at,
    total,
    subtotal_amount,
    discount_amount,
    total_amount,
    coupon_code,
    customer_name,
    phone,
    address_line1,
    address_line2,
    landmark,
    instructions,
    stripe_session_id,
    stripe_payment_intent_id,
    payment_status,
    paid_at,
    payment_method,
    currency,
    order_items (
      id,
      qty,
      price_each,
      menu_item_id,
      menu_items ( id, name, price )
    )
  `;

  const selects = [
    // ✅ new schema (your current)
    `
      ${base},
      platform_fee,
      delivery_fee,
      tax_amount,
      tip_amount
    `,
    // fallback: maybe commission_amount is used instead of platform_fee
    `
      ${base},
      commission_amount,
      delivery_fee,
      tax_amount,
      tip_amount
    `,
    // fallback: older GST schema
    `
      ${base},
      platform_fee,
      delivery_fee,
      gst_amount,
      tip_amount
    `,
    // minimal fallback
    `${base}`,
  ];

  let lastErr = null;

  for (const sel of selects) {
    const { data, error } = await supabase
      .from("orders")
      .select(sel)
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();

    if (!error) return data || null;

    lastErr = error;
    const msg = error?.message || String(error);
    if (isMissingColumnError(msg)) continue;
    throw error;
  }

  throw lastErr;
}

function InvoiceInner() {
  const router = useRouter();
  const sp = useSearchParams();

  const id = sp.get("id") || "";
  const autoPrint = sp.get("print") === "1";

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [user, setUser] = useState(null);

  const [order, setOrder] = useState(null);
  const [restaurant, setRestaurant] = useState(null);

  // ✅ currency
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);

  const items = useMemo(() => {
    const arr = order?.order_items;
    return Array.isArray(arr) ? arr : [];
  }, [order]);

  const itemsCount = useMemo(() => {
    return items.reduce((s, it) => s + Number(it?.qty || 0), 0);
  }, [items]);

  // ✅ fee breakdown (matches Cart)
  const subtotal = useMemo(() => {
    const fromCol = safeNum(order?.subtotal_amount, 0);
    if (fromCol > 0) return fromCol;
    return items.reduce((s, it) => s + safeNum(it?.qty, 0) * safeNum(it?.price_each, 0), 0);
  }, [order, items]);

  const discount = useMemo(() => Math.max(0, safeNum(order?.discount_amount, 0)), [order]);

  const platformFee = useMemo(() => {
    // your DB uses platform_fee
    const pf = safeNum(order?.platform_fee, 0);
    if (pf > 0) return pf;
    // fallback older
    const cm = safeNum(order?.commission_amount, 0);
    return Math.max(0, cm);
  }, [order]);

  const deliveryFee = useMemo(() => Math.max(0, safeNum(order?.delivery_fee, 0)), [order]);

  const tax = useMemo(() => {
    // your DB uses tax_amount now
    const t = safeNum(order?.tax_amount, 0);
    if (t > 0) return t;
    // fallback older
    const gst = safeNum(order?.gst_amount, 0);
    return Math.max(0, gst);
  }, [order]);

  const tip = useMemo(() => Math.max(0, safeNum(order?.tip_amount, 0)), [order]);

  const computedTotal = useMemo(() => {
    const val = subtotal + platformFee + deliveryFee + tax + tip - discount;
    return Math.max(0, Number(val.toFixed(2)));
  }, [subtotal, platformFee, deliveryFee, tax, tip, discount]);

  // ✅ stored total from DB (if present)
  const storedTotal = useMemo(() => {
    const t1 = safeNum(order?.total_amount, 0);
    if (t1 > 0) return t1;
    const t2 = safeNum(order?.total, 0);
    if (t2 > 0) return t2;
    return 0;
  }, [order]);

  // ✅ final shown total (prefer stored if exists, else computed)
  const total = useMemo(() => {
    return storedTotal > 0 ? storedTotal : computedTotal;
  }, [storedTotal, computedTotal]);

  // ✅ show adjustment ONLY if mismatch exists (this helps debug bad order writes)
  const adjustment = useMemo(() => {
    if (!(storedTotal > 0)) return 0;
    const diff = Number((storedTotal - computedTotal).toFixed(2));
    // ignore tiny float noise
    if (Math.abs(diff) < 0.01) return 0;
    return diff;
  }, [storedTotal, computedTotal]);

  async function load() {
    setLoading(true);
    setErr("");

    try {
      // ✅ Currency bootstrap
      (async () => {
        try {
          const c = localStorage.getItem("foodapp_currency");
          setCurrency(normalizeCurrency(c));
        } catch {
          setCurrency(DEFAULT_CURRENCY);
        }

        const dbCur = await fetchCurrencyFromDB();
        const normalized = normalizeCurrency(dbCur);

        setCurrency(normalized);
        try {
          localStorage.setItem("foodapp_currency", normalized);
        } catch {}
      })();

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

      // ✅ fetch order (column-safe)
      const o = await fetchOrderForInvoice({ id, userId: u.id });
      if (!o) {
        setErr("Invoice not found for this account.");
        setLoading(false);
        return;
      }

      setOrder(o);

      // ✅ fetch restaurant (best effort: column-safe)
      let rRow = null;
      try {
        const tries = [
          "id, name, address, phone",
          "id, restaurant_name, address, phone",
          "id, name, address_line1, address_line2, phone",
          "id, name",
        ];

        for (const sel of tries) {
          const { data: r, error: rErr } = await supabase
            .from("restaurants")
            .select(sel)
            .eq("id", o.restaurant_id)
            .maybeSingle();
          if (!rErr && r) {
            rRow = r;
            break;
          }
        }
      } catch {
        rRow = null;
      }

      setRestaurant(rRow);

      // auto print
      if (autoPrint) {
        setTimeout(() => {
          try {
            window.print();
          } catch {}
        }, 650);
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

  const restName = safeStr(restaurant?.name) || safeStr(restaurant?.restaurant_name) || "Restaurant";

  const restPhone = safeStr(restaurant?.phone);
  const restAddr =
    safeStr(restaurant?.address) ||
    [safeStr(restaurant?.address_line1), safeStr(restaurant?.address_line2)]
      .filter(Boolean)
      .join(", ");

  const custName = safeStr(order?.customer_name) || safeStr(user?.email) || "Customer";
  const custPhone = safeStr(order?.phone);
  const custAddr = [safeStr(order?.address_line1), safeStr(order?.address_line2)].filter(Boolean).join(", ");

  const coupon = safeStr(order?.coupon_code);

  // ✅ Payment logic
  const paymentStatus = safeStr(order?.payment_status).toLowerCase();
  const paidAt = order?.paid_at ? new Date(order.paid_at) : null;

  const isPaid =
    paymentStatus === "paid" ||
    paymentStatus === "succeeded" ||
    paymentStatus === "complete" ||
    !!paidAt ||
    !!order?.stripe_session_id ||
    !!order?.stripe_payment_intent_id;

  const methodRaw = safeStr(order?.payment_method) || (order?.stripe_session_id ? "stripe" : "online");
  const method = methodRaw || "online";
  const payLabel = isPaid ? "PAID" : "PENDING";

  // ✅ invoice number
  const invoiceNo = useMemo(() => {
    const dt = yyyymmdd(order?.created_at || Date.now());
    const short = String(order?.id || id || "")
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 6)
      .toUpperCase();
    return `INV-${dt}-${short || "000000"}`;
  }, [order, id]);

  const orderRefShort = useMemo(() => {
    const raw = String(order?.id || id || "");
    return raw.length > 12 ? `${raw.slice(0, 6)}…${raw.slice(-4)}` : raw;
  }, [order, id]);

  return (
    <main style={pageBg}>
      <style>{printCss}</style>

      <div style={{ maxWidth: 1040, margin: "0 auto" }}>
        <div style={heroGlass}>
          <div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div style={pill}>Invoice • Restaurant</div>
              <div style={{ ...(isPaid ? pillPaid : pillPending) }}>{payLabel}</div>
              <div style={pill}>Currency: {currency}</div>
            </div>

            <h1 style={title}>Order Invoice</h1>
            <div style={sub}>
              {loading ? "Loading invoice…" : err ? "Invoice error" : `Order #${String(order?.id || "").slice(0, 8)}…`}
            </div>

            {!loading && !err && order ? (
              <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <div style={chip}>
                  <span style={chipK}>Invoice No</span>
                  <span style={chipV}>{invoiceNo}</span>
                </div>
                <div style={chip}>
                  <span style={chipK}>Order Ref</span>
                  <span style={chipV}>{orderRefShort}</span>
                </div>
                <div style={chip}>
                  <span style={chipK}>Items</span>
                  <span style={chipV}>{itemsCount}</span>
                </div>
              </div>
            ) : null}
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }} className="no-print">
            <Link href="/orders" style={btnGhost}>
              ← Back to Orders
            </Link>
            <button onClick={() => window.print()} style={btnPrimary}>
              Print / Save PDF
            </button>
          </div>
        </div>

        {err ? <div style={alertErr}>{err}</div> : null}

        {loading ? <div style={{ marginTop: 14, fontWeight: 900, color: "rgba(17,24,39,0.7)" }}>Loading…</div> : null}

        {!loading && !err && order ? (
          <div style={{ marginTop: 12, ...cardGlass }}>
            <div style={brandRow}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div style={brandBadge} title={restName}>
                  {initials(restName)}
                </div>
                <div>
                  <div style={brandTitle}>{restName}</div>
                  <div style={brandSub}>Thank you for ordering with HomyFood • Food + Groceries</div>
                </div>
              </div>

              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 1000, color: "#0b1220", fontSize: 13 }}>Invoice Total</div>
                <div style={{ fontWeight: 1100, color: "#0b1220", fontSize: 22 }}>{money(total, currency)}</div>
                <div style={{ marginTop: 6, fontWeight: 900, color: "rgba(17,24,39,0.60)", fontSize: 12 }}>
                  Generated: {formatTime(new Date())}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
              <div style={box}>
                <div style={boxTitle}>Billed From</div>
                <div style={boxStrong}>{restName}</div>
                {restAddr ? <div style={boxText}>{restAddr}</div> : null}
                {restPhone ? <div style={boxText}>Phone: {restPhone}</div> : null}
              </div>

              <div style={box}>
                <div style={boxTitle}>Billed To</div>
                <div style={boxStrong}>{custName}</div>
                {custPhone ? <div style={boxText}>Phone: {custPhone}</div> : null}
                {custAddr ? <div style={boxText}>{custAddr}</div> : null}
                {order?.landmark ? <div style={boxText}>Landmark: {order.landmark}</div> : null}
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
                  <b>Status:</b> {safeStr(order.status) || "—"}
                </div>
                <div style={boxText}>
                  <b>Payment:</b>{" "}
                  <span style={{ fontWeight: 1000, color: "#0b1220" }}>{String(method || "online").toUpperCase()}</span>{" "}
                  <span style={{ marginLeft: 6, ...(isPaid ? paidDot : pendingDot) }}>{isPaid ? "Paid" : "Pending"}</span>
                </div>

                {paidAt ? (
                  <div style={boxText}>
                    <b>Paid at:</b> {formatTime(paidAt)}
                  </div>
                ) : null}

                {coupon ? (
                  <div style={boxText}>
                    <b>Coupon:</b> {coupon}
                  </div>
                ) : null}

                {order?.stripe_session_id ? (
                  <div style={boxText}>
                    <b>Stripe:</b> {String(order.stripe_session_id).slice(0, 18)}…
                  </div>
                ) : null}

                {paymentStatus ? (
                  <div style={boxText}>
                    <b>Payment status:</b> {paymentStatus}
                  </div>
                ) : null}
              </div>
            </div>

            {/* Items */}
            <div style={{ marginTop: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <div style={{ fontWeight: 1000, color: "#0b1220" }}>Items</div>
                <div style={{ fontWeight: 900, color: "rgba(17,24,39,0.65)", fontSize: 12 }}>
                  {itemsCount} item(s) • {safeStr(order.status) || "pending"}
                </div>
              </div>

              <div style={{ marginTop: 10, ...table }}>
                <div style={{ ...tRow, ...tHead }}>
                  <div>Item</div>
                  <div style={{ textAlign: "right" }}>Qty</div>
                  <div style={{ textAlign: "right" }}>Price</div>
                  <div style={{ textAlign: "right" }}>Total</div>
                </div>

                {items.map((it) => {
                  const name = it?.menu_items?.name || "Item";
                  const qty = safeNum(it?.qty, 0);
                  const priceEach = safeNum(it?.price_each, 0);
                  return (
                    <div key={it.id} style={tRowHover}>
                      <div style={{ fontWeight: 950, color: "#0b1220" }}>{name}</div>
                      <div style={{ textAlign: "right", fontWeight: 900, color: "rgba(17,24,39,0.75)" }}>{qty}</div>
                      <div style={{ textAlign: "right", fontWeight: 900, color: "rgba(17,24,39,0.75)" }}>{money(priceEach, currency)}</div>
                      <div style={{ textAlign: "right", fontWeight: 1000, color: "#0b1220" }}>{money(qty * priceEach, currency)}</div>
                    </div>
                  );
                })}
              </div>

              {order?.instructions ? (
                <div style={{ marginTop: 12, ...noteBox }}>
                  <div style={{ fontWeight: 1000 }}>Customer Instructions</div>
                  <div style={{ marginTop: 6, fontWeight: 850, color: "rgba(17,24,39,0.72)", lineHeight: 1.45 }}>
                    {cleanInstructions(order.instructions)}
                  </div>
                </div>
              ) : null}
            </div>

            {/* Totals (MATCH CART) */}
            <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
              <div style={totalsBox}>
                <div style={line}>
                  <span>Subtotal</span>
                  <span style={{ color: "#0b1220" }}>{money(subtotal, currency)}</span>
                </div>

                <div style={line}>
                  <span>Platform fee</span>
                  <span style={{ color: "#0b1220" }}>{platformFee > 0 ? money(platformFee, currency) : money(0, currency)}</span>
                </div>

                <div style={line}>
                  <span>Delivery fee</span>
                  <span style={{ color: "#0b1220" }}>{deliveryFee === 0 ? "FREE" : money(deliveryFee, currency)}</span>
                </div>

                <div style={line}>
                  <span>Tax</span>
                  <span style={{ color: "#0b1220" }}>{money(tax, currency)}</span>
                </div>

                {tip > 0 ? (
                  <div style={line}>
                    <span>Tip</span>
                    <span style={{ color: "#0b1220" }}>{money(tip, currency)}</span>
                  </div>
                ) : null}

                <div style={line}>
                  <span>Discount{coupon ? ` (${coupon})` : ""}</span>
                  <span style={{ color: discount > 0 ? "#065f46" : "#0b1220" }}>
                    {discount > 0 ? `- ${money(discount, currency)}` : money(0, currency)}
                  </span>
                </div>

                {/* ✅ Only show when mismatch exists */}
                {adjustment !== 0 ? (
                  <div style={line}>
                    <span title="Stored total doesn’t match computed breakdown. This indicates the order was saved with missing/incorrect fee fields.">
                      Adjustment
                    </span>
                    <span style={{ color: adjustment < 0 ? "#7f1d1d" : "#065f46", fontWeight: 1000 }}>
                      {adjustment < 0 ? `- ${money(Math.abs(adjustment), currency)}` : money(adjustment, currency)}
                    </span>
                  </div>
                ) : null}

                <div style={{ ...line, borderBottom: "none" }}>
                  <span style={{ fontWeight: 1000, color: "#0b1220" }}>Total</span>
                  <span style={{ fontWeight: 1100, color: "#0b1220" }}>{money(total, currency)}</span>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 14, ...footerBox }}>
              <div style={{ fontWeight: 1000, color: "#0b1220" }}>Need help?</div>
              <div style={{ marginTop: 6, fontWeight: 900, color: "rgba(17,24,39,0.70)", lineHeight: 1.5 }}>
                support@homyfood.com
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}

export default function RestaurantInvoicePage() {
  return (
    <Suspense
      fallback={
        <main style={pageBg}>
          <style>{printCss}</style>
          <div style={{ maxWidth: 1040, margin: "0 auto" }}>
            <div style={heroGlass}>
              <div>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={pill}>Invoice • Restaurant</div>
                  <div style={{ ...pillPending }}>LOADING</div>
                  <div style={pill}>Currency: {DEFAULT_CURRENCY}</div>
                </div>
                <h1 style={title}>Order Invoice</h1>
                <div style={sub}>Preparing invoice…</div>
              </div>

              <div className="no-print" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <Link href="/orders" style={btnGhost}>
                  ← Back to Orders
                </Link>
              </div>
            </div>

            <div style={{ marginTop: 12, ...cardGlass }}>
              <div style={{ fontWeight: 950, color: "rgba(17,24,39,0.75)" }}>Loading…</div>
            </div>
          </div>
        </main>
      }
    >
      <InvoiceInner />
    </Suspense>
  );
}

/* ===== Premium inline styles ===== */

const pageBg = {
  minHeight: "calc(100vh - 64px)",
  padding: 20,
  background:
    "radial-gradient(1200px 600px at 20% 10%, rgba(255,140,0,0.22), transparent 62%), radial-gradient(900px 520px at 80% 18%, rgba(80,160,255,0.20), transparent 58%), linear-gradient(180deg, #f7f7fb, #ffffff)",
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

const pillPaid = {
  display: "inline-flex",
  padding: "8px 12px",
  borderRadius: 999,
  border: "1px solid rgba(16,185,129,0.22)",
  background: "rgba(236,253,245,0.95)",
  color: "#065f46",
  fontWeight: 1000,
  fontSize: 12,
};

const pillPending = {
  display: "inline-flex",
  padding: "8px 12px",
  borderRadius: 999,
  border: "1px solid rgba(245,158,11,0.22)",
  background: "rgba(255,251,235,0.95)",
  color: "#92400e",
  fontWeight: 1000,
  fontSize: 12,
};

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

const chip = {
  display: "inline-flex",
  alignItems: "center",
  gap: 10,
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(255,255,255,0.78)",
  padding: "8px 12px",
};

const chipK = {
  fontSize: 12,
  fontWeight: 950,
  color: "rgba(17,24,39,0.60)",
};

const chipV = {
  fontSize: 12,
  fontWeight: 1000,
  color: "#0b1220",
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

const brandRow = {
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.88)",
  padding: 12,
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
  alignItems: "center",
};

const brandBadge = {
  width: 44,
  height: 44,
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(17,24,39,0.06)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 1100,
  color: "rgba(17,24,39,0.85)",
  letterSpacing: 0.2,
};

const brandTitle = {
  fontWeight: 1100,
  color: "#0b1220",
  fontSize: 16,
};

const brandSub = {
  marginTop: 4,
  fontWeight: 850,
  color: "rgba(17,24,39,0.62)",
  fontSize: 12,
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

const paidDot = {
  display: "inline-flex",
  padding: "2px 8px",
  borderRadius: 999,
  border: "1px solid rgba(16,185,129,0.22)",
  background: "rgba(236,253,245,0.95)",
  color: "#065f46",
  fontWeight: 950,
  fontSize: 11,
};

const pendingDot = {
  display: "inline-flex",
  padding: "2px 8px",
  borderRadius: 999,
  border: "1px solid rgba(245,158,11,0.22)",
  background: "rgba(255,251,235,0.95)",
  color: "#92400e",
  fontWeight: 950,
  fontSize: 11,
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

const tRowHover = {
  ...tRow,
  transition: "background 120ms ease",
  background: "rgba(255,255,255,0.98)",
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

const footerBox = {
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.85)",
  padding: 12,
};

const printCss = `
@media print {
  body { background: #fff !important; }
  .no-print { display: none !important; }
  main { padding: 0 !important; }
}
`;