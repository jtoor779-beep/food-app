"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import supabase from "@/lib/supabase";

function normalizeRole(r) {
  return String(r || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

/* =========================================================
   ✅ CURRENCY SUPPORT (SAFE, NO OLD LOGIC CHANGED)
   - Default stays INR unless Admin sets default_currency
   - If localStorage "foodapp_currency" is set to "USD",
     this page will format prices in USD.
   ========================================================= */

const DEFAULT_CURRENCY = "INR"; // preserve old behavior

function normalizeCurrency(c) {
  const v = String(c || "").trim().toUpperCase();
  if (v === "USD") return "USD";
  if (v === "INR") return "INR";
  return DEFAULT_CURRENCY;
}

function money(v, currency = DEFAULT_CURRENCY) {
  const n = Number(v || 0);
  if (!isFinite(n)) return currency === "USD" ? "$0.00" : "₹0";

  const cur = normalizeCurrency(currency);

  // Preserve OLD look: INR had no decimals (₹123)
  const fractionDigits = cur === "INR" ? 0 : 2;

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: cur,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(n);
  } catch {
    // Fallback if Intl fails for any reason
    const fixed = n.toFixed(fractionDigits);
    return cur === "USD" ? `$${fixed}` : `₹${Number(fixed).toFixed(0)}`;
  }
}

/* =========================================================
   ✅ CART STORAGE FIX (NO FREEZE)
   - NO "storage" event dispatch inside READ functions
   - Uses custom event: "foodapp_cart_updated"
   ========================================================= */

const CART_EVT = "foodapp_cart_updated";
const MAX_SAFE_QTY = 20;

function safeParse(raw) {
  try {
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function clampMoney(v, min, max, fallback) {
  const n = Number(v);
  if (!isFinite(n)) return fallback;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function sanitizeQty(qty) {
  const n = Number(qty);
  if (!isFinite(n)) return 1;
  const i = Math.floor(n);
  if (i <= 0) return 1;
  if (i > MAX_SAFE_QTY) return 1;
  return i;
}

/* ✅ local bool helper (kept here to avoid dependencies) */
function asBoolLocal(v, fallback = true) {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v === 1;
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return fallback;
  if (s === "true" || s === "1" || s === "yes") return true;
  if (s === "false" || s === "0" || s === "no") return false;
  return fallback;
}

function normalizeCartShape(arr) {
  const list = Array.isArray(arr) ? arr : [];
  return list
    .map((x) => ({
      menu_item_id: x?.menu_item_id,
      restaurant_id: x?.restaurant_id,
      name: x?.name,
      price_each: clampMoney(x?.price_each, 0, 100000, 0),
      qty: sanitizeQty(x?.qty),
      image_url: x?.image_url || null,
      note: x?.note || "",

      /* =========================================================
         ✅ NEW (SAFE): taxable flag support
         - if missing → defaults TRUE (old behavior)
         - if saved as is_taxable false → tax won’t apply
         ========================================================= */
      is_taxable: asBoolLocal(x?.is_taxable, true),
    }))
    .filter((x) => x.menu_item_id && x.restaurant_id && x.qty > 0);
}

function stableStringify(obj) {
  try {
    return JSON.stringify(obj);
  } catch {
    return "";
  }
}

function mergePreferMax(a, b) {
  const map = new Map();

  for (const it of a) map.set(String(it.menu_item_id), { ...it });

  for (const it of b) {
    const key = String(it.menu_item_id);
    const existing = map.get(key);
    if (!existing) map.set(key, { ...it });
    else {
      map.set(key, {
        ...existing,
        qty: Math.max(Number(existing.qty || 1), Number(it.qty || 1)),
        name: existing.name || it.name,
        image_url: existing.image_url || it.image_url,
        price_each: existing.price_each || it.price_each,
        note: existing.note || it.note || "",

        // ✅ keep taxable flag if already present
        is_taxable:
          typeof existing.is_taxable === "boolean"
            ? existing.is_taxable
            : asBoolLocal(it.is_taxable, true),
      });
    }
  }

  return Array.from(map.values());
}

/**
 * READ only (no writes, no events) — prevents freeze
 */
function readRestaurantCartRaw() {
  const rawA = safeParse(localStorage.getItem("cart_items"));
  const rawB = safeParse(localStorage.getItem("foodapp_cart"));
  const a = normalizeCartShape(rawA);
  const b = normalizeCartShape(rawB);

  if (a.length === 0 && b.length === 0) return [];

  if (a.length > 0 && b.length > 0 && stableStringify(a) === stableStringify(b)) return a;

  const merged = mergePreferMax(a, b);
  const rid = merged[0]?.restaurant_id;
  const cleaned = merged.filter((x) => x.restaurant_id === rid);
  return cleaned;
}

/**
 * One-time repair/sync (safe to call only on init)
 */
function repairRestaurantCartToBothKeys(items) {
  try {
    localStorage.setItem("cart_items", JSON.stringify(items));
    localStorage.setItem("foodapp_cart", JSON.stringify(items));
  } catch {}
}

function setCartCompat(items) {
  const cleaned = normalizeCartShape(items);
  try {
    localStorage.setItem("cart_items", JSON.stringify(cleaned));
    localStorage.setItem("foodapp_cart", JSON.stringify(cleaned));
    window.dispatchEvent(new Event(CART_EVT));
  } catch {}
}

/* =========================================================
   ✅ GROCERY CART (SEPARATE KEY)
   + ALSO SUPPORT groceries that were written into "cart_items"
   ========================================================= */

const GROCERY_CART_KEY = "grocery_cart_items";
const GROCERY_FALLBACK_KEY = "grocery_cart";
const CART_ITEMS_KEY = "cart_items";

/* =========================================================
   ✅ NEW (SAFE): grocery unit price helper
   - Prefer unit_price (variant-selected)
   - Fallback to price (old behavior)
   ========================================================= */
function getGroceryUnitPrice(x) {
  const up = Number(x?.unit_price);
  if (isFinite(up) && up > 0) return up;
  const p = Number(x?.price);
  if (isFinite(p) && p >= 0) return p;
  return 0;
}

function normalizeGroceryCartShape(arr) {
  const list = Array.isArray(arr) ? arr : [];
  return list
    .map((x) => {
      const rawId = x?.id || x?.grocery_item_id || x?.item_id || null;
      const unit_price = clampMoney(
        x?.unit_price ?? x?.price_each ?? x?.price,
        0,
        100000,
        0
      );

      return {
        // ✅ supports BOTH old grocery cart shape and new homepage shape
        id: rawId, // grocery_items.id
        grocery_item_id: rawId, // keep explicit id too for compatibility
        store_id: x?.store_id, // grocery_stores.id
        name: x?.name,
        // ✅ keep old field for backward compatibility
        price: clampMoney(x?.price ?? x?.price_each, 0, 100000, unit_price),
        // ✅ preferred price for calculations
        unit_price,
        // ✅ keep homepage field too so nothing breaks after sync
        price_each: unit_price,
        qty: sanitizeQty(x?.qty),
        image_url: x?.image_url || "",
        category: x?.category || "General",
        item_type: x?.item_type || "grocery",

        // ✅ show selected variant/weight label if saved
        variant_label: String(x?.variant_label || x?.variant || x?.weight_label || "").trim(),

        // ✅ stable key if you saved it (safe optional)
        cart_key:
          String(
            x?.cart_key ||
              x?.key ||
              (rawId && x?.variant_label ? `${rawId}__${String(x.variant_label).trim()}` : "")
          ).trim() || null,

        /* ✅ optional future: grocery taxable */
        is_taxable: asBoolLocal(x?.is_taxable, true),
      };
    })
    .filter((x) => x.id && x.store_id && x.qty > 0);
}

/**
 * EXTRA: read groceries from cart_items (because groceries page / homepage may write there too)
 * We accept both old shape (id) and new homepage shape (grocery_item_id).
 */
function readGroceryFromCartItemsKey() {
  const raw = safeParse(localStorage.getItem(CART_ITEMS_KEY));
  if (!Array.isArray(raw) || raw.length === 0) return [];

  const maybeGrocery = raw.filter((x) => {
    if (!x) return false;
    const hasGroceryMarker = String(x?.item_type || "").toLowerCase() === "grocery";
    const looksGroceryOld = !!x?.id && !!x?.store_id && !x?.menu_item_id && !x?.restaurant_id;
    const looksGroceryNew = !!x?.grocery_item_id && !!x?.store_id && !x?.menu_item_id && !x?.restaurant_id;
    return hasGroceryMarker || looksGroceryOld || looksGroceryNew;
  });

  return normalizeGroceryCartShape(maybeGrocery);
}

/**
 * READ only (no writes, no events)
 */
function readGroceryCartRaw() {
  const rawA = safeParse(localStorage.getItem(GROCERY_CART_KEY));
  const rawB = safeParse(localStorage.getItem(GROCERY_FALLBACK_KEY));

  const a = normalizeGroceryCartShape(rawA);
  const b = normalizeGroceryCartShape(rawB);

  // ✅ NEW: if both grocery keys empty, try groceries inside cart_items
  const c = a.length === 0 && b.length === 0 ? readGroceryFromCartItemsKey() : [];

  if (a.length === 0 && b.length === 0 && c.length === 0) return [];

  const chosen = a.length > 0 ? a : b.length > 0 ? b : c;

  const sid = chosen[0]?.store_id;
  const cleaned = chosen.filter((x) => x.store_id === sid);
  return cleaned;
}

/**
 * One-time repair/sync (safe to call only on init)
 */
function repairGroceryCartToBothKeys(items) {
  try {
    localStorage.setItem(GROCERY_CART_KEY, JSON.stringify(items));
    localStorage.setItem(GROCERY_FALLBACK_KEY, JSON.stringify(items));
  } catch {}
}

function setGroceryCart(items) {
  const cleaned = normalizeGroceryCartShape(items);
  try {
    localStorage.setItem(GROCERY_CART_KEY, JSON.stringify(cleaned));
    localStorage.setItem(GROCERY_FALLBACK_KEY, JSON.stringify(cleaned));
    window.dispatchEvent(new Event(CART_EVT));
  } catch {}
}

/* =========================
   ✅ REAL GEOCODING HELPERS
   ========================= */

function buildFullAddress({ address_line1, address_line2, landmark }) {
  return [address_line1, address_line2, landmark]
    .filter(Boolean)
    .map((s) => String(s).trim())
    .filter(Boolean)
    .join(", ");
}

async function geocodeAddressClient(q) {
  try {
    const address = String(q || "").trim();
    if (!address) return null;

    const r = await fetch("/api/geocode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: address }),
    });

    const j = await r.json().catch(() => null);
    if (!j || !j.ok) return null;

    const lat = Number(j.lat);
    const lng = Number(j.lng);
    if (!isFinite(lat) || !isFinite(lng)) return null;

    return { lat, lng, display_name: j.display_name || "" };
  } catch {
    return null;
  }
}

/* =========================
   ✅ COUPON HELPERS (DB)
   ========================= */

function normCode(code) {
  return String(code || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}
function toNum(v, fallback = 0) {
  const n = Number(v);
  return isFinite(n) ? n : fallback;
}
function parseDateMaybe(v) {
  if (!v) return null;
  const d = new Date(v);
  return isFinite(d.getTime()) ? d : null;
}
function asBool(v) {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "").toLowerCase();
  return s === "true" || s === "1" || s === "yes";
}

async function countRows(table, filters = []) {
  try {
    let q = supabase.from(table).select("id", { count: "exact", head: true });
    for (const f of filters) {
      if (!f || !f.col || !f.op) continue;
      q = q[f.op](f.col, f.val);
    }
    const { count, error } = await q;
    if (error) return null;
    return typeof count === "number" ? count : null;
  } catch {
    return null;
  }
}

// ✅ UPDATED: accept currency for better user-facing messages (default stays INR)
async function validateCouponFromDb({ code, subtotal, userId, currency = DEFAULT_CURRENCY }) {
  const clean = normCode(code);
  if (!clean) return { ok: false, reason: "Enter coupon code." };

  try {
    const { data: c, error } = await supabase
      .from("coupons")
      .select(
        "id, code, type, value, is_active, min_order_amount, max_discount, starts_at, expires_at, usage_limit_total, usage_limit_per_user"
      )
      .eq("code", clean)
      .maybeSingle();

    if (error) return { ok: false, reason: error.message || "Coupon lookup failed." };
    if (!c) return { ok: false, reason: "Invalid coupon code." };

    const active = asBool(c.is_active);
    if (!active) return { ok: false, reason: "This coupon is not active." };

    const starts = parseDateMaybe(c.starts_at);
    const ends = parseDateMaybe(c.expires_at);
    const now = new Date();

    if (starts && now < starts) return { ok: false, reason: "Coupon not started yet." };
    if (ends && now > ends) return { ok: false, reason: "Coupon expired." };

    const minOrder = toNum(c.min_order_amount, 0);
    if (minOrder > 0 && subtotal < minOrder) {
      return { ok: false, reason: `Minimum order ${money(minOrder, currency)} required for this coupon.` };
    }

    const usageLimit = toNum(c.usage_limit_total, 0);
    const perUserLimit = toNum(c.usage_limit_per_user, 0);

    if (usageLimit > 0) {
      const totalUsed = await countRows("coupon_redemptions", [{ col: "coupon_id", op: "eq", val: c.id }]);
      if (typeof totalUsed === "number" && totalUsed >= usageLimit) {
        return { ok: false, reason: "Coupon usage limit reached." };
      }
    }

    if (perUserLimit > 0 && userId) {
      const userUsed = await countRows("coupon_redemptions", [
        { col: "coupon_id", op: "eq", val: c.id },
        { col: "user_id", op: "eq", val: userId },
      ]);
      if (typeof userUsed === "number" && userUsed >= perUserLimit) {
        return { ok: false, reason: "You already used this coupon." };
      }
    }

    const type = String(c.type || "").toLowerCase();
    const value = toNum(c.value, 0);

    let discount = 0;
    if (type === "flat") {
      discount = Math.min(subtotal, Math.max(0, value));
    } else if (type === "percent") {
      const pct = Math.min(100, Math.max(0, value));
      discount = Math.round((subtotal * pct) / 100);
    } else {
      return { ok: false, reason: "Coupon type invalid." };
    }

    const maxDisc = toNum(c.max_discount, 0);
    if (maxDisc > 0) discount = Math.min(discount, maxDisc);

    return {
      ok: true,
      coupon: {
        id: c.id,
        code: clean,
        type: type === "percent" ? "percent" : "flat",
        value,
        max_discount: maxDisc || 0,
        min_order_amount: minOrder || 0,
      },
      discount,
    };
  } catch (e) {
    return { ok: false, reason: e?.message || String(e) };
  }
}

/* =========================================================
   ✅ Grocery checkout DB helpers (AUTO column-safe)
   Tables:
   - grocery_orders
   - grocery_order_items  (plural)
   ========================================================= */

function isMissingColumnError(msg) {
  const m = String(msg || "").toLowerCase();
  return m.includes("column") && m.includes("does not exist");
}

async function insertGroceryOrderAuto(payload) {
  const attempts = [
    { ...payload, store_id: payload.store_id },
    (() => {
      const x = { ...payload };
      delete x.store_id;
      return x;
    })(),
  ];

  let lastErr = null;

  for (const body of attempts) {
    const { data, error } = await supabase.from("grocery_orders").insert(body).select("id").single();
    if (!error) return data;
    lastErr = error;

    const msg = error?.message || String(error);
    if (isMissingColumnError(msg)) continue;
    throw error;
  }

  throw lastErr || new Error("Failed to create grocery order.");
}

async function insertGroceryOrderItemsAuto(rows) {
  const candidates = [
    (r) => ({
      order_id: r.order_id,
      grocery_item_id: r.item_id,
      qty: r.qty,
      price_each: r.price_each,
      item_name: r.name,
    }),
    (r) => ({
      order_id: r.order_id,
      item_id: r.item_id,
      qty: r.qty,
      price: r.price_each,
      name: r.name,
    }),
    (r) => ({
      order_id: r.order_id,
      item_id: r.item_id,
      qty: r.qty,
    }),
    (r) => ({
      order_id: r.order_id,
      grocery_item_id: r.item_id,
      quantity: r.qty,
    }),
  ];

  let lastErr = null;

  for (const build of candidates) {
    const attemptRows = rows.map(build);

    const { error } = await supabase.from("grocery_order_items").insert(attemptRows);
    if (!error) return true;

    lastErr = error;
    const msg = error?.message || String(error);

    if (isMissingColumnError(msg)) continue;
    throw error;
  }

  throw lastErr || new Error("Failed to create grocery order items.");
}

/* =========================================================
   ✅ PLATFORM SETTINGS (FROM ADMIN /system_settings key=platform)
   ========================================================= */

const PLATFORM_DEFAULTS = {
  commission_percent: "10",
  delivery_fee_base: "20",
  delivery_fee_per_km: "0",
  delivery_free_over: "499",
  gst_percent: "5",
  default_currency: DEFAULT_CURRENCY,
  tax_note: "Taxes will be configured later as per country/state rules.",
};

function safeNumStr(v, fallbackStr) {
  const s = String(v ?? "").trim();
  if (!s) return fallbackStr;
  const cleaned = s.replace(/[^\d.]/g, "");
  return cleaned || fallbackStr;
}

function safeStr(v, fallbackStr) {
  const s = String(v ?? "").trim();
  return s ? s : fallbackStr;
}

async function loadPlatformSettingsSafe() {
  try {
    const { data, error } = await supabase
      .from("system_settings")
      .select("key, value_json, default_currency, updated_at")
      .eq("key", "platform")
      .maybeSingle();

    if (error) return { ...PLATFORM_DEFAULTS };

    const v = data?.value_json;
    const json = v && typeof v === "object" ? v : {};

    const dcFromColumn = data?.default_currency;
    const dcFromJson = json?.default_currency;

    const resolvedCurrency = normalizeCurrency(dcFromColumn || dcFromJson || PLATFORM_DEFAULTS.default_currency);

    return {
      ...PLATFORM_DEFAULTS,
      commission_percent: safeNumStr(json?.commission_percent, PLATFORM_DEFAULTS.commission_percent),
      delivery_fee_base: safeNumStr(json?.delivery_fee_base, PLATFORM_DEFAULTS.delivery_fee_base),
      delivery_fee_per_km: safeNumStr(json?.delivery_fee_per_km, PLATFORM_DEFAULTS.delivery_fee_per_km),
      delivery_free_over: safeNumStr(json?.delivery_free_over, PLATFORM_DEFAULTS.delivery_free_over),
      gst_percent: safeNumStr(json?.gst_percent, PLATFORM_DEFAULTS.gst_percent),
      default_currency: safeStr(resolvedCurrency, PLATFORM_DEFAULTS.default_currency),
      tax_note: String(json?.tax_note ?? PLATFORM_DEFAULTS.tax_note),
    };
  } catch {
    return { ...PLATFORM_DEFAULTS };
  }
}

/* =========================================================
   ✅ ORDERS INSERT (AUTO column-safe)
   ========================================================= */

async function insertRestaurantOrderAuto(payload) {
  const attempts = [];

  // Attempt 1: include everything (if columns exist)
  attempts.push({ ...payload });

  // Attempt 2: remove extra columns if missing
  attempts.push((() => {
    const x = { ...payload };
    // keep safe keys for YOUR schema
    delete x.delivery_fee;
    delete x.tax_amount;
    delete x.tip_amount;
    delete x.payment_method;
    delete x.currency;
    delete x.platform_fee;
    return x;
  })());

  // Attempt 3: ultra-minimal fallback (original shape core)
  attempts.push((() => {
    const x = { ...payload };
    const keep = [
      "user_id",
      "restaurant_id",
      "status",
      "total",
      "subtotal_amount",
      "discount_amount",
      "total_amount",
      "coupon_id",
      "coupon_code",
      "customer_name",
      "phone",
      "address_line1",
      "address_line2",
      "landmark",
      "instructions",
      "customer_lat",
      "customer_lng",
      "restaurant_lat",
      "restaurant_lng",
    ];
    const slim = {};
    for (const k of keep) if (k in x) slim[k] = x[k];
    return slim;
  })());

  let lastErr = null;

  for (const body of attempts) {
    const { data, error } = await supabase.from("orders").insert(body).select("id").single();
    if (!error) return data;
    lastErr = error;

    const msg = error?.message || String(error);
    if (isMissingColumnError(msg)) continue;
    throw error;
  }

  throw lastErr || new Error("Failed to create restaurant order.");
}

/* =========================
   ✅ PREMIUM THEME (UNCHANGED)
   ========================= */

const pageBg = {
  minHeight: "calc(100vh - 64px)",
  padding: 20,
  background:
    "radial-gradient(1200px 600px at 20% 10%, rgba(255,140,0,0.22), transparent 62%), radial-gradient(900px 520px at 80% 18%, rgba(80,160,255,0.20), transparent 58%), linear-gradient(180deg, #f7f7fb, #ffffff)",
};

const heroGlass = {
  borderRadius: 20,
  padding: 18,
  background: "rgba(255,255,255,0.78)",
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 14px 44px rgba(0,0,0,0.09)",
  backdropFilter: "blur(10px)",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const pill = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 12px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.7)",
  fontSize: 12,
  fontWeight: 900,
  color: "rgba(17,24,39,0.85)",
  textDecoration: "none",
};

const heroTitle = {
  margin: "10px 0 0 0",
  fontSize: 34,
  fontWeight: 1000,
  color: "#0b1220",
  letterSpacing: -0.2,
};

const statCard = {
  minWidth: 130,
  padding: "10px 12px",
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.7)",
};

const statNum = {
  fontSize: 18,
  fontWeight: 1000,
  color: "#0b1220",
};

const statLabel = {
  marginTop: 2,
  fontSize: 12,
  fontWeight: 800,
  color: "rgba(17,24,39,0.65)",
};

const cardGlass = {
  borderRadius: 18,
  padding: 14,
  background: "rgba(255,255,255,0.78)",
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 14px 44px rgba(0,0,0,0.08)",
  backdropFilter: "blur(10px)",
};

const sectionTitle = {
  margin: 0,
  fontSize: 16,
  fontWeight: 1000,
  color: "#0b1220",
  letterSpacing: -0.2,
};

const helperText = {
  marginTop: 6,
  fontSize: 12,
  fontWeight: 800,
  color: "rgba(17,24,39,0.65)",
};

const inputLabel = {
  fontSize: 12,
  fontWeight: 900,
  color: "rgba(17,24,39,0.75)",
  marginBottom: 6,
};

const input = {
  width: "100%",
  padding: "12px 12px",
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(255,255,255,0.85)",
  outline: "none",
  fontWeight: 800,
  fontSize: 13,
};

const btnSmallPrimary = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: "10px 12px",
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "#0b1220",
  color: "#fff",
  fontWeight: 950,
  cursor: "pointer",
};

const btnSmallGhost = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: "10px 12px",
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(255,255,255,0.85)",
  color: "#0b1220",
  fontWeight: 950,
  cursor: "pointer",
};

const alertErr = {
  padding: 12,
  borderRadius: 16,
  border: "1px solid rgba(239,68,68,0.25)",
  background: "rgba(254,242,242,0.9)",
  color: "#7f1d1d",
  fontWeight: 900,
  marginTop: 12,
};

const alertInfo = {
  padding: 12,
  borderRadius: 16,
  border: "1px solid rgba(16,185,129,0.25)",
  background: "rgba(236,253,245,0.95)",
  color: "#065f46",
  fontWeight: 900,
  marginTop: 12,
};

const emptyBox = {
  padding: 14,
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.75)",
  color: "rgba(17,24,39,0.7)",
  fontWeight: 750,
};

const chip = {
  padding: "10px 12px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.8)",
  cursor: "pointer",
  fontWeight: 900,
  color: "rgba(17,24,39,0.85)",
};

const chipActive = {
  ...chip,
  border: "1px solid rgba(17,24,39,0.9)",
  background: "rgba(17,24,39,0.92)",
  color: "#fff",
};

const stickyBar = {
  position: "fixed",
  left: 0,
  right: 0,
  bottom: 0,
  padding: 14,
  borderTop: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(255,255,255,0.95)",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  zIndex: 9999,
};

const rowLight = {
  display: "flex",
  justifyContent: "space-between",
  padding: "10px 0",
  borderBottom: "1px solid rgba(0,0,0,0.08)",
  color: "rgba(17,24,39,0.65)",
  fontWeight: 900,
  fontSize: 13,
};

const variantPill = {
  display: "inline-flex",
  alignItems: "center",
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(255,255,255,0.9)",
  color: "rgba(17,24,39,0.85)",
  fontWeight: 950,
  fontSize: 12,
  marginTop: 8,
};

/* =========================================================
   ✅ NEW (SAFE): Cart item image UI helpers
   ========================================================= */

const thumbWrap = {
  width: 58,
  height: 58,
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(255,255,255,0.85)",
  overflow: "hidden",
  flex: "0 0 auto",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const thumbImg = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

const thumbPlaceholder = {
  width: "100%",
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 1000,
  color: "rgba(17,24,39,0.55)",
  fontSize: 12,
};

function safeImgSrc(src) {
  const s = String(src || "").trim();
  if (!s) return "";
  if (s.startsWith("http://") || s.startsWith("https://") || s.startsWith("/")) return s;
  return s.startsWith("uploads/") ? `/${s}` : s;
}

function ItemThumb({ src, name }) {
  const [broken, setBroken] = useState(false);
  const s = safeImgSrc(src);

  if (!s || broken) {
    const letter = String(name || "Item").trim().charAt(0).toUpperCase() || "I";
    return (
      <div style={thumbWrap} aria-label="No image">
        <div style={thumbPlaceholder}>{letter}</div>
      </div>
    );
  }

  return (
    <div style={thumbWrap}>
      <img
        src={s}
        alt={String(name || "Item")}
        style={thumbImg}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
      />
    </div>
  );
}

// ✅ Mobile responsive hook (pure JS)
function useIsMobile(breakpoint = 860) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const apply = () => setIsMobile(!!mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    mq.addListener?.(apply);
    return () => {
      mq.removeEventListener?.("change", apply);
      mq.removeListener?.(apply);
    };
  }, [breakpoint]);

  return isMobile;
}

export default function CartPage() {
  const router = useRouter();
  const isMobile = useIsMobile(860);
  const deliveryRef = useRef(null);

  const [isAuthed, setIsAuthed] = useState(false);
  const [userRole, setUserRole] = useState("");

  const [items, setItemsState] = useState([]);
  const [gItems, setGItemsState] = useState([]);
  const [cartMode, setCartMode] = useState("restaurant");

  const [loading, setLoading] = useState(true);

  const [errMsg, setErrMsg] = useState("");
  const [infoMsg, setInfoMsg] = useState("");
  const [placing, setPlacing] = useState(false);

  // ✅ Currency state
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);

  // ✅ Platform settings state (from Admin panel)
  const [platform, setPlatform] = useState({ ...PLATFORM_DEFAULTS });

  // Delivery fields
  const [customer_name, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [address_line1, setAddress1] = useState("");
  const [address_line2, setAddress2] = useState("");
  const [city, setCity] = useState("");
  const [state_region, setStateRegion] = useState("");
  const [zip, setZip] = useState("");
  const [landmark, setLandmark] = useState("");
  const [instructions, setInstructions] = useState("");

  // Premium fields (restaurant only)
  const [coupon, setCoupon] = useState("");
  const [couponApplied, setCouponApplied] = useState(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponDiscountValue, setCouponDiscountValue] = useState(0);

  const [tip, setTip] = useState(0);

  // ✅ default to card
  const [paymentMethod, setPaymentMethod] = useState("card");

  const [saveAddress, setSaveAddress] = useState(true);

  const activeItems = useMemo(() => (cartMode === "grocery" ? gItems : items), [cartMode, gItems, items]);

  const subtotal = useMemo(() => {
    if (cartMode === "grocery") {
      return (gItems || []).reduce((s, x) => s + Number(x.qty || 0) * Number(getGroceryUnitPrice(x) || 0), 0);
    }
    return (items || []).reduce((s, x) => s + Number(x.qty || 0) * Number(x.price_each || 0), 0);
  }, [cartMode, gItems, items]);

  const taxableSubtotal = useMemo(() => {
    const isTaxable = (v) => {
      if (typeof v === "boolean") return v;
      if (typeof v === "number") return v === 1;
      const s = String(v ?? "").trim().toLowerCase();
      if (!s) return true;
      if (s === "false" || s === "0" || s === "no") return false;
      if (s === "true" || s === "1" || s === "yes") return true;
      return true;
    };

    if (cartMode === "grocery") {
      return (gItems || []).reduce((s, x) => {
        const line = Number(x.qty || 0) * Number(getGroceryUnitPrice(x) || 0);
        return s + (isTaxable(x?.is_taxable) ? line : 0);
      }, 0);
    }

    return (items || []).reduce((s, x) => {
      const line = Number(x.qty || 0) * Number(x.price_each || 0);
      return s + (isTaxable(x?.is_taxable) ? line : 0);
    }, 0);
  }, [cartMode, gItems, items]);

  const itemCount = useMemo(() => (activeItems || []).reduce((s, x) => s + Number(x.qty || 0), 0), [activeItems]);

  const deliveryFee = useMemo(() => {
    if (!activeItems || activeItems.length === 0) return 0;

    const baseFromAdmin = toNum(platform?.delivery_fee_base, 25);
    const base = Math.max(0, baseFromAdmin);

    const freeOver = Math.max(0, toNum(platform?.delivery_free_over, 499));
    return freeOver > 0 && subtotal >= freeOver ? 0 : base;
  }, [activeItems, subtotal, platform]);

  const gstPercent = useMemo(() => {
    const p = toNum(platform?.gst_percent, 5);
    return Math.max(0, Math.min(100, p));
  }, [platform]);

  // ✅ tax calculated on taxableSubtotal
  const gst = useMemo(() => Math.round(Number(taxableSubtotal || 0) * (gstPercent / 100)), [taxableSubtotal, gstPercent]);

  const discount = useMemo(() => {
    if (cartMode !== "restaurant") return 0;
    if (!couponApplied) return 0;
    return Math.max(0, Number(couponDiscountValue || 0));
  }, [cartMode, couponApplied, couponDiscountValue]);

  // ✅ commission calculations (used for display + platform fee)
  const commissionPercent = useMemo(() => {
    const p = toNum(platform?.commission_percent, 10);
    return Math.max(0, Math.min(100, p));
  }, [platform]);

  const commissionAmount = useMemo(() => {
    if (cartMode !== "restaurant") return 0;
    const amt = Math.round((Number(subtotal || 0) * Number(commissionPercent || 0)) / 100);
    return Math.max(0, amt);
  }, [cartMode, subtotal, commissionPercent]);

  const groceryPlatformFeeAmount = useMemo(() => {
    if (cartMode !== "grocery") return 0;
    const amt = Math.round((Number(subtotal || 0) * Number(commissionPercent || 0)) / 100);
    return Math.max(0, amt);
  }, [cartMode, subtotal, commissionPercent]);

  const payable = useMemo(() => {
    const platformFee =
      cartMode === "restaurant"
        ? Number(commissionAmount || 0)
        : cartMode === "grocery"
        ? Number(groceryPlatformFeeAmount || 0)
        : 0;

    const p = subtotal + deliveryFee + gst + Number(tip || 0) + platformFee - discount;
    return Math.max(0, p);
  }, [subtotal, deliveryFee, gst, tip, discount, cartMode, commissionAmount, groceryPlatformFeeAmount]);

  useEffect(() => {
    try {
      const c = localStorage.getItem("foodapp_currency");
      setCurrency(normalizeCurrency(c));
    } catch {
      setCurrency(DEFAULT_CURRENCY);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await loadPlatformSettingsSafe();
      if (cancelled) return;

      setPlatform(s);

      try {
        const forced = localStorage.getItem("foodapp_currency");
        if (!forced) setCurrency(normalizeCurrency(s?.default_currency));
      } catch {
        setCurrency(normalizeCurrency(s?.default_currency));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoading(true);
      setErrMsg("");
      setInfoMsg("");

      try {
        const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
        if (sessErr) throw sessErr;

        const user = sessionData?.session?.user || null;

        const rCart = readRestaurantCartRaw();
        const gCart = readGroceryCartRaw();

        repairRestaurantCartToBothKeys(rCart);
        repairGroceryCartToBothKeys(gCart);

        if (!cancelled) {
          setItemsState(Array.isArray(rCart) ? rCart : []);
          setGItemsState(Array.isArray(gCart) ? gCart : []);

          if ((rCart || []).length > 0) setCartMode("restaurant");
          else if ((gCart || []).length > 0) setCartMode("grocery");
          else setCartMode("restaurant");
        }

        try {
          const rawAddr = localStorage.getItem("foodapp_saved_address");
          if (rawAddr) {
            const a = JSON.parse(rawAddr);
            setCustomerName(a?.customer_name || "");
            setPhone(a?.phone || "");
            setAddress1(a?.address_line1 || "");
            setAddress2(a?.address_line2 || "");
            setLandmark(a?.landmark || "");
            setInstructions(a?.instructions || "");
          }
        } catch {}

        if (!user) {
          setIsAuthed(false);
          setUserRole("");
          return;
        }

        setIsAuthed(true);

        const { data: prof, error: profErr } = await supabase.from("profiles").select("role").eq("user_id", user.id).maybeSingle();
        if (profErr) throw profErr;

        const role = normalizeRole(prof?.role);
        setUserRole(role);

        if (role === "restaurant_owner") {
          router.push("/restaurants/orders");
          return;
        }
      } catch (e) {
        if (!cancelled) setErrMsg(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();

    const onAnyCartUpdate = () => {
      const rCart = readRestaurantCartRaw();
      const gCart = readGroceryCartRaw();
      setItemsState(Array.isArray(rCart) ? rCart : []);
      setGItemsState(Array.isArray(gCart) ? gCart : []);

      if (cartMode === "restaurant" && (rCart || []).length === 0 && (gCart || []).length > 0) setCartMode("grocery");
      if (cartMode === "grocery" && (gCart || []).length === 0 && (rCart || []).length > 0) setCartMode("restaurant");
    };

    window.addEventListener("storage", onAnyCartUpdate);
    window.addEventListener(CART_EVT, onAnyCartUpdate);

    return () => {
      cancelled = true;
      window.removeEventListener("storage", onAnyCartUpdate);
      window.removeEventListener(CART_EVT, onAnyCartUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function recheck() {
      if (cartMode !== "restaurant") return;
      if (!couponApplied?.code) return;
      try {
        const { data: userData } = await supabase.auth.getUser();
        const uid = userData?.user?.id || null;

        const res = await validateCouponFromDb({
          code: couponApplied.code,
          subtotal: Number(subtotal || 0),
          userId: uid,
          currency,
        });

        if (cancelled) return;

        if (!res.ok) {
          setCouponApplied(null);
          setCouponDiscountValue(0);
          setInfoMsg("");
          setErrMsg(res.reason || "Coupon invalid now.");
          return;
        }

        setCouponApplied(res.coupon);
        setCouponDiscountValue(res.discount || 0);
      } catch {}
    }

    recheck();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal, cartMode, currency]);

  function setItems(next) {
    setItemsState(next);
    setCartCompat(next);
  }

  function setGroceryItems(next) {
    setGItemsState(next);
    setGroceryCart(next);
  }

  function incQty(ix) {
    if (cartMode === "grocery") {
      const next = [...gItems];
      next[ix] = { ...next[ix], qty: sanitizeQty(Number(next[ix].qty || 0) + 1) };
      setGroceryItems(next);
      return;
    }
    const next = [...items];
    next[ix] = { ...next[ix], qty: sanitizeQty(Number(next[ix].qty || 0) + 1) };
    setItems(next);
  }

  function decQty(ix) {
    if (cartMode === "grocery") {
      const next = [...gItems];
      const q = Number(next[ix].qty || 0) - 1;
      if (q <= 0) {
        next.splice(ix, 1);
        setGroceryItems(next);
        return;
      }
      next[ix] = { ...next[ix], qty: sanitizeQty(q) };
      setGroceryItems(next);
      return;
    }

    const next = [...items];
    const q = Number(next[ix].qty || 0) - 1;
    if (q <= 0) {
      next.splice(ix, 1);
      setItems(next);
      return;
    }
    next[ix] = { ...next[ix], qty: sanitizeQty(q) };
    setItems(next);
  }

  function removeItem(ix) {
    if (cartMode === "grocery") {
      const next = [...gItems];
      next.splice(ix, 1);
      setGroceryItems(next);
      return;
    }
    const next = [...items];
    next.splice(ix, 1);
    setItems(next);
  }

  function clearCart() {
    if (cartMode === "grocery") {
      setGroceryItems([]);
      setTip(0);
      setInfoMsg("✅ Grocery cart cleared.");
      setErrMsg("");
      return;
    }

    setItems([]);
    setCoupon("");
    setCouponApplied(null);
    setCouponDiscountValue(0);
    setTip(0);
    setInfoMsg("✅ Cart cleared.");
    setErrMsg("");
  }

  async function applyCoupon() {
    setErrMsg("");
    setInfoMsg("");

    if (cartMode !== "restaurant") {
      setErrMsg("Coupons are currently available only for restaurant orders.");
      return;
    }

    const code = normCode(coupon);
    if (!code) return;

    setCouponLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id || null;

      const res = await validateCouponFromDb({
        code,
        subtotal: Number(subtotal || 0),
        userId: uid,
        currency,
      });

      if (!res.ok) {
        setCouponApplied(null);
        setCouponDiscountValue(0);
        setErrMsg(res.reason || "Invalid coupon.");
        return;
      }

      setCouponApplied(res.coupon);
      setCouponDiscountValue(res.discount || 0);
      setInfoMsg(`✅ Coupon ${res.coupon.code} applied. Discount: ${money(res.discount || 0, currency)}`);
    } finally {
      setCouponLoading(false);
    }
  }

  function saveAddressToLocal() {
    try {
      localStorage.setItem(
        "foodapp_saved_address",
        JSON.stringify({
          customer_name,
          phone,
          address_line1,
          address_line2,
          landmark,
          instructions,
        })
      );
    } catch {}
  }

  /* =========================================================
     ✅ STRIPE CHECKOUT
     ========================================================= */
  function buildStripeItems() {
    if (cartMode === "grocery") {
      return (gItems || []).map((it) => ({
        name: it?.name || "Grocery Item",
        price: Number(getGroceryUnitPrice(it) || 0),
        quantity: sanitizeQty(Number(it?.qty || 1)),
      }));
    }

    return (items || []).map((it) => ({
      name: it?.name || "Menu Item",
      price: Number(it?.price_each || 0),
      quantity: sanitizeQty(Number(it?.qty || 1)),
    }));
  }

  async function payWithStripe(orderId) {
    setErrMsg("");
    setInfoMsg("");

    if (!orderId) {
      // Safety: this should be called only AFTER we create DB order
      throw new Error("Stripe checkout requires orderId. Please click checkout again.");
    }

    if (!activeItems || activeItems.length === 0) {
      throw new Error("Cart is empty.");
    }

    const platformFee =
      cartMode === "restaurant"
        ? Number(commissionAmount || 0)
        : cartMode === "grocery"
        ? Number(groceryPlatformFeeAmount || 0)
        : 0;

    const restaurant_id = cartMode === "restaurant" ? (items[0]?.restaurant_id || "") : "";
    const store_id = cartMode === "grocery" ? (gItems[0]?.store_id || "") : "";

    const order_type = cartMode === "grocery" ? "grocery" : "restaurant";
    const success_redirect = cartMode === "grocery" ? "/groceries/orders" : "/orders";

    const payload = {
      order_id: orderId, // ✅ send orderId
      items: buildStripeItems(),
      order_type,
      restaurant_id: restaurant_id || undefined,
      store_id: store_id || undefined,
      success_redirect,
      meta: {
        cartMode,
        customer_name: customer_name.trim(),
        phone: phone.trim(),

        address_line1: address_line1.trim(),
        address_line2: (address_line2 || "").trim(),
        landmark: (landmark || "").trim(),
        instructions: (instructions || "").trim() || "",

        address: buildFullAddress({
          address_line1: address_line1.trim(),
          address_line2: (address_line2 || "").trim(),
          landmark: (landmark || "").trim(),
        }),

        tip: Number(tip || 0),

        delivery_fee: Number(deliveryFee || 0),
        platform_fee: Number(platformFee || 0),
        tax_amount: Number(gst || 0),
        discount_amount: Number(discount || 0),

        deliveryFee: Number(deliveryFee || 0),
        gst: Number(gst || 0),
        discount: Number(discount || 0),
        payable: Number(payable || 0),

        platform_fee_percent: Number(commissionPercent || 0),
        platform_fee_amount: Number(platformFee || 0),

        currency: normalizeCurrency(currency),
      },
    };

    const r = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const j = await r.json().catch(() => null);

    if (!r.ok) {
      throw new Error(j?.error || j?.message || "Stripe checkout failed.");
    }

    const url = j?.url || j?.checkoutUrl || j?.sessionUrl;
    if (!url) throw new Error("Stripe did not return a checkout URL.");

    window.location.href = url;
  }

  async function placeOrder() {
    setErrMsg("");
    setInfoMsg("");

    if (!isAuthed) {
      setErrMsg("Please login or sign up to place an order.");
      router.push("/login?next=/cart");
      return;
    }

    if (!customer_name.trim()) return setErrMsg("Please enter customer name.");
    if (!phone.trim()) return setErrMsg("Please enter phone.");
    if (!address_line1.trim()) return setErrMsg("Please enter address line 1.");

    // ✅ Grocery checkout (kept as-is)
    if (cartMode === "grocery") {
      if (!gItems || gItems.length === 0) return setErrMsg("Grocery cart is empty.");

      const store_id = gItems[0]?.store_id;
      if (!store_id) return setErrMsg("Grocery cart items missing store_id. Please re-add items.");

      const multi = gItems.some((x) => x.store_id !== store_id);
      if (multi) return setErrMsg("Please order from one grocery store at a time.");

      setPlacing(true);
      try {
        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr) throw userErr;
        const user = userData?.user;
        if (!user) throw new Error("Not logged in.");

        if (saveAddress) saveAddressToLocal();

        const fullAddr = buildFullAddress({
          address_line1: address_line1.trim(),
          address_line2: address_line2.trim() || "",
          landmark: landmark.trim() || "",
        });

        const geo = await geocodeAddressClient(fullAddr);

        const platformFee = Number(groceryPlatformFeeAmount || 0);

        const total_amount = Math.max(
          0,
          Number(subtotal || 0) + Number(deliveryFee || 0) + Number(gst || 0) + Number(tip || 0) + platformFee
        );

        const orderPayload = {
          customer_user_id: user.id,
          store_id,
          customer_name: customer_name.trim(),
          customer_phone: phone.trim(),
          delivery_address: fullAddr,
          instructions: (instructions || "").trim() || null,
          status: "pending",
          total_amount,
          customer_lat: geo?.lat ?? null,
          customer_lng: geo?.lng ?? null,
        };

        let orderRow = null;
        try {
          orderRow = await insertGroceryOrderAuto(orderPayload);
        } catch (e) {
          const msg = e?.message || String(e);
          if (isMissingColumnError(msg)) {
            const slim = { ...orderPayload };
            delete slim.customer_lat;
            delete slim.customer_lng;
            orderRow = await insertGroceryOrderAuto(slim);
          } else {
            throw e;
          }
        }

        const rows = gItems.map((it) => ({
          order_id: orderRow.id,
          item_id: it.id,
          qty: sanitizeQty(Number(it.qty || 1)),
          price_each: clampMoney(Number(getGroceryUnitPrice(it) || 0), 0, 100000, 0),
          name: it.name || "Item",
        }));

        await insertGroceryOrderItemsAuto(rows);

        // ✅ Grocery = ONLY Stripe (card)
        // Keep DB insert logic same, then redirect to Stripe checkout.
        // Note: we clear local cart like restaurant flow; state update is async so payWithStripe still has items.
        setGroceryItems([]);
        setTip(0);

        setInfoMsg("Redirecting to secure Stripe checkout…");
        await payWithStripe(orderRow.id);
        return;
      } catch (e) {
        setErrMsg(e?.message || String(e));
      } finally {
        setPlacing(false);
      }
      return;
    }

    // ✅ Restaurant checkout
    if (!items || items.length === 0) return setErrMsg("Cart is empty.");

    const restaurant_id = items[0]?.restaurant_id;
    if (!restaurant_id) return setErrMsg("Cart items missing restaurant_id. Please re-add items.");

    const multi = items.some((x) => x.restaurant_id !== restaurant_id);
    if (multi) return setErrMsg("Please order from one restaurant at a time.");

    setPlacing(true);
    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      const user = userData?.user;
      if (!user) throw new Error("Not logged in.");

      if (saveAddress) saveAddressToLocal();

      let finalCoupon = null;
      let finalDiscount = 0;

      if (couponApplied?.code) {
        const res = await validateCouponFromDb({
          code: couponApplied.code,
          subtotal: Number(subtotal || 0),
          userId: user.id,
          currency,
        });

        if (!res.ok) {
          setCouponApplied(null);
          setCouponDiscountValue(0);
          setCoupon("");
          throw new Error(res.reason || "Coupon invalid. Please apply again.");
        }

        finalCoupon = res.coupon;
        finalDiscount = Number(res.discount || 0);
        setCouponApplied(res.coupon);
        setCouponDiscountValue(res.discount || 0);
      }

      const extraMeta = [
        finalCoupon?.code ? `coupon:${finalCoupon.code}` : "",
        tip ? `tip:${tip}` : "",
        deliveryFee ? `deliveryFee:${deliveryFee}` : "",
        gst ? `tax:${gst}` : "",
        paymentMethod ? `pay:${paymentMethod}` : "",
        platform?.commission_percent ? `platform%:${commissionPercent}` : "",
        commissionAmount ? `platformFee:${commissionAmount}` : "",
        platform?.tax_note ? `taxNote:${String(platform.tax_note).slice(0, 80)}` : "",
        currency ? `currency:${normalizeCurrency(currency)}` : "",
      ]
        .filter(Boolean)
        .join(" | ");

      const finalInstructions = [instructions?.trim() || "", extraMeta ? `(${extraMeta})` : ""].filter(Boolean).join(" ");

      const fullAddr = buildFullAddress({
        address_line1: address_line1.trim(),
        address_line2: address_line2.trim() || "",
        landmark: landmark.trim() || "",
      });

      const geo = await geocodeAddressClient(fullAddr);

      let restLat = null;
      let restLng = null;
      try {
        const { data: rest, error: restErr } = await supabase.from("restaurants").select("lat, lng").eq("id", restaurant_id).maybeSingle();
        if (restErr) throw restErr;

        const la = Number(rest?.lat);
        const ln = Number(rest?.lng);
        restLat = isFinite(la) ? la : null;
        restLng = isFinite(ln) ? ln : null;
      } catch {
        restLat = null;
        restLng = null;
      }

      const subtotal_amount = Math.max(0, Number(subtotal || 0));
      const discount_amount = Math.max(0, Number(finalDiscount || 0));

      // ✅ YOUR DB uses platform_fee + tax_amount
      const platformFee = Number(commissionAmount || 0);

      const total_amount = Math.max(
        0,
        subtotal_amount +
          Number(deliveryFee || 0) +
          Number(gst || 0) +
          Number(tip || 0) +
          platformFee -
          discount_amount
      );

      // ✅ FIXED: match your orders table columns (NO commission_amount)
      const orderPayload = {
        user_id: user.id,
        restaurant_id,
        status: "pending",
        total: total_amount,
        subtotal_amount,
        discount_amount,
        total_amount,
        coupon_id: finalCoupon?.id ?? null,
        coupon_code: finalCoupon?.code ?? null,
        customer_name: customer_name.trim(),
        phone: phone.trim(),
        address_line1: address_line1.trim(),
        address_line2: address_line2.trim() || null,
        landmark: landmark.trim() || null,
        instructions: finalInstructions || null,
        customer_lat: geo?.lat ?? null,
        customer_lng: geo?.lng ?? null,
        restaurant_lat: restLat,
        restaurant_lng: restLng,

        delivery_fee: Number(deliveryFee || 0),
        tax_amount: Number(gst || 0),
        tip_amount: Number(tip || 0),
        platform_fee: platformFee,

        payment_method: paymentMethod === "card" ? "stripe" : (paymentMethod || "card"),
        currency: normalizeCurrency(currency),
      };

      const orderRow = await insertRestaurantOrderAuto(orderPayload);

      const order_items_rows = items.map((it) => ({
        order_id: orderRow.id,
        menu_item_id: it.menu_item_id,
        qty: sanitizeQty(Number(it.qty || 1)),
        price_each: clampMoney(Number(it.price_each || 0), 0, 100000, 0),
      }));

      const { error: oiErr } = await supabase.from("order_items").insert(order_items_rows);
      if (oiErr) throw oiErr;

      // ✅ NEW (SAFE): push test notification to delivery dashboard after a real restaurant order is created
      // Best-effort only: if push fails, checkout flow continues without breaking old logic.
      try {
        await fetch("/api/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: "322ca00b-a6f6-481e-9416-451b4be77f75",
            title: "New Order Assigned",
            body: `Order #${String(orderRow?.id || "").slice(0, 8)} placed from cart`,
            url: "/delivery",
          }),
        });
      } catch {}

      // ✅ AUTO NOTIFICATION (Option A): notify restaurant owner when a new order is placed
      // Safe: if owner/user columns differ or insert fails, we silently skip (no impact to checkout flow)
      try {
        const { data: restRow, error: restErr } = await supabase.from("restaurants").select("*").eq("id", restaurant_id).maybeSingle();
        if (restErr) throw restErr;

        const ownerUserId =
          restRow?.owner_user_id || restRow?.owner_id || restRow?.user_id || restRow?.created_by || restRow?.owner || null;

        if (ownerUserId) {
          const shortId = String(orderRow?.id || "").slice(0, 8);
          const restName = restRow?.name || restRow?.restaurant_name || "Restaurant";

          await supabase.from("notifications").insert({
            user_id: ownerUserId,
            title: "New order received",
            body: `New order ${shortId ? "#" + shortId : ""} received for ${restName}. Tap to view.`,
            type: "order",
            link: "/restaurants/orders",
            is_read: false,
          });
        }
      } catch {}

      if (finalCoupon?.id) {
        try {
          await supabase.from("coupon_redemptions").insert({
            coupon_id: finalCoupon.id,
            user_id: user.id,
            order_id: orderRow.id,
            coupon_code: finalCoupon.code,
          });
        } catch {}
      }

      setItems([]);
      setCoupon("");
      setCouponApplied(null);
      setCouponDiscountValue(0);
      setTip(0);

      const notes = [];
      if (!geo) notes.push("Address geocode failed (drop location missing)");
      if (!restLat || !restLng) notes.push("Restaurant location missing (pickup location missing)");

      if (notes.length) setInfoMsg(`✅ Order placed successfully! (Note: ${notes.join(" • ")})`);
      else setInfoMsg("✅ Order placed successfully! (Pickup + drop locations saved)");

      // ✅ Card payments -> Stripe after DB order exists
      if (paymentMethod === "card") {
        setInfoMsg("Redirecting to secure Stripe checkout…");
        await payWithStripe(orderRow.id);
        return;
      }

      router.push("/orders");
      router.refresh();
    } catch (e) {
      setErrMsg(e?.message || String(e));
    } finally {
      setPlacing(false);
    }
  }

  const wrap = {
    width: "100%",
    margin: "0 auto",
    paddingBottom: isMobile ? 150 : 90,
  };

  const hero = {
    ...heroGlass,
    padding: isMobile ? 14 : heroGlass.padding,
    alignItems: isMobile ? "stretch" : heroGlass.alignItems,
    borderRadius: isMobile ? 18 : heroGlass.borderRadius,
    gap: isMobile ? 10 : heroGlass.gap,
  };

  const heroTitleR = {
    ...heroTitle,
    fontSize: isMobile ? 26 : heroTitle.fontSize,
    lineHeight: isMobile ? "30px" : "40px",
    letterSpacing: isMobile ? -0.5 : heroTitle.letterSpacing,
  };

  const gridMain = {
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : "1.4fr 0.9fr",
    gap: 12,
    marginTop: 12,
  };

  const itemCard = {
    borderRadius: isMobile ? 18 : 16,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "rgba(255,255,255,0.82)",
    padding: isMobile ? 12 : 12,
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : "1fr auto",
    gap: isMobile ? 12 : 10,
    boxShadow: isMobile ? "0 10px 28px rgba(15,23,42,0.06)" : "none",
  };

  const itemHeadRow = {
    display: "flex",
    gap: 12,
    alignItems: isMobile ? "flex-start" : "center",
  };

  const itemTitleText = {
    fontWeight: 1000,
    color: "#0b1220",
    fontSize: isMobile ? 16 : 16,
    lineHeight: isMobile ? 1.15 : 1.2,
    letterSpacing: isMobile ? -0.25 : 0,
  };

  const itemMetaText = {
    marginTop: 6,
    color: "rgba(17,24,39,0.65)",
    fontWeight: 850,
    fontSize: isMobile ? 12 : 13,
    lineHeight: isMobile ? 1.35 : 1.3,
  };

  const itemNoteText = {
    marginTop: 6,
    color: "rgba(17,24,39,0.62)",
    fontWeight: 850,
    fontSize: 12,
    lineHeight: 1.35,
  };

  const itemActions = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: isMobile ? "space-between" : "flex-start",
  };

  const qtyGroup = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: isMobile ? "100%" : "auto",
    justifyContent: isMobile ? "space-between" : "flex-start",
  };

  const mobileRemoveBtn = {
    ...btnSmallGhost,
    width: isMobile ? "100%" : "auto",
    borderRadius: isMobile ? 12 : btnSmallGhost.borderRadius,
  };

  const offerRow = {
    marginTop: 10,
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : "1fr auto",
    gap: 10,
  };

  const sticky = {
    ...stickyBar,
    paddingBottom: "calc(14px + env(safe-area-inset-bottom))",
    flexDirection: isMobile ? "column" : "row",
    alignItems: isMobile ? "stretch" : "center",
    gap: isMobile ? 10 : stickyBar.gap,
  };

  function scrollToDelivery() {
    if (deliveryRef.current) {
      deliveryRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  }

  const backHref = cartMode === "grocery" ? "/groceries" : "/menu";
  const backLabel = cartMode === "grocery" ? "← Back to Groceries" : "← Back to Menu";

  const platformFeeToShow =
    cartMode === "restaurant"
      ? Number(commissionAmount || 0)
      : cartMode === "grocery"
      ? Number(groceryPlatformFeeAmount || 0)
      : 0;

  return (
    <main style={{ ...pageBg, padding: isMobile ? 12 : 20 }}>
      <div style={wrap}>
        <div style={hero}>
          <div style={{ minWidth: isMobile ? "100%" : 260 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <span style={pill}>Customer</span>
              <button onClick={() => setCartMode("restaurant")} style={cartMode === "restaurant" ? chipActive : chip}>
                Restaurant Cart ({(items || []).reduce((s, x) => s + Number(x.qty || 0), 0)})
              </button>
              <button onClick={() => setCartMode("grocery")} style={cartMode === "grocery" ? chipActive : chip}>
                Grocery Cart ({(gItems || []).reduce((s, x) => s + Number(x.qty || 0), 0)})
              </button>
            </div>

            <h1 style={heroTitleR}>Cart</h1>
            <div style={{ marginTop: 6, color: "rgba(17,24,39,0.65)", fontWeight: 800 }}>
              {cartMode === "grocery" ? "Review grocery items + delivery details" : "Review items + delivery details"}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end" }}>
            <div style={{ ...statCard, minWidth: isMobile ? 110 : statCard.minWidth }}>
              <div style={statNum}>{itemCount}</div>
              <div style={statLabel}>Items</div>
            </div>

            <div style={{ ...statCard, minWidth: isMobile ? 140 : statCard.minWidth }}>
              <div style={statNum}>{money(subtotal, currency)}</div>
              <div style={statLabel}>Subtotal</div>
            </div>

            <Link href={backHref} style={pill}>
              {backLabel}
            </Link>
          </div>
        </div>

        {errMsg ? <div style={alertErr}>{errMsg}</div> : null}
        {infoMsg ? <div style={alertInfo}>{infoMsg}</div> : null}

        {loading ? (
          <div style={{ marginTop: 14, color: "rgba(17,24,39,0.7)", fontWeight: 900 }}>Loading…</div>
        ) : activeItems.length === 0 ? (
          <div style={{ marginTop: 12, ...emptyBox }}>
            Cart is empty.
            <div style={{ marginTop: 8 }}>
              <Link href={backHref} style={pill}>
                Browse {cartMode === "grocery" ? "Groceries" : "Menu"} →
              </Link>
            </div>
          </div>
        ) : (
          <div style={gridMain}>
            <div style={cardGlass}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div>
                  <h2 style={sectionTitle}>Items</h2>
                  <div style={helperText}>Adjust quantities or remove items.</div>
                </div>

                <button onClick={clearCart} style={{ ...btnSmallGhost, width: isMobile ? "100%" : "auto" }}>
                  Clear Cart
                </button>
              </div>

              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                {cartMode === "grocery"
                  ? gItems.map((it, ix) => {
                      const unit = Number(getGroceryUnitPrice(it) || 0);
                      const line = Number(it.qty || 0) * unit;
                      return (
                        <div key={`${it.cart_key || it.id}-${ix}`} style={itemCard}>
                          <div style={{ minWidth: 0 }}>
                            <div style={itemHeadRow}>
                              <ItemThumb src={it?.image_url} name={it?.name} />
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={itemTitleText}>{it.name || "Item"}</div>

                                {it?.variant_label ? <div style={variantPill}>Option: {it.variant_label}</div> : null}

                                <div style={itemMetaText}>
                                  {money(unit, currency)} each • Line: <b>{money(line, currency)}</b>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div style={itemActions}>
                            <div style={qtyGroup}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <button onClick={() => decQty(ix)} style={btnSmallGhost}>
                                  −
                                </button>
                                <div style={{ minWidth: 34, textAlign: "center", fontWeight: 1000 }}>{it.qty}</div>
                                <button onClick={() => incQty(ix)} style={btnSmallGhost}>
                                  +
                                </button>
                              </div>
                            </div>

                            <button onClick={() => removeItem(ix)} style={mobileRemoveBtn}>
                              Remove
                            </button>
                          </div>
                        </div>
                      );
                    })
                  : items.map((it, ix) => (
                      <div key={`${it.menu_item_id}-${ix}`} style={itemCard}>
                        <div style={{ minWidth: 0 }}>
                          <div style={itemHeadRow}>
                            <ItemThumb src={it?.image_url} name={it?.name} />
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={itemTitleText}>{it.name || "Item"}</div>

                              <div style={itemMetaText}>
                                {money(it.price_each, currency)} each • Line:{" "}
                                <b>{money(Number(it.qty || 0) * Number(it.price_each || 0), currency)}</b>
                              </div>

                              {it.note ? <div style={itemNoteText}>Note: {it.note}</div> : null}
                            </div>
                          </div>
                        </div>

                        <div style={itemActions}>
                          <div style={qtyGroup}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <button onClick={() => decQty(ix)} style={btnSmallGhost}>
                                −
                              </button>
                              <div style={{ minWidth: 34, textAlign: "center", fontWeight: 1000 }}>{it.qty}</div>
                              <button onClick={() => incQty(ix)} style={btnSmallGhost}>
                                +
                              </button>
                            </div>
                          </div>

                          <button onClick={() => removeItem(ix)} style={mobileRemoveBtn}>
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
              </div>

              {cartMode === "restaurant" ? (
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(0,0,0,0.08)" }}>
                  <div>
                    <div style={sectionTitle}>Offers</div>
                    <div style={helperText}>Enter your coupon code</div>
                  </div>

                  <div style={offerRow}>
                    <input value={coupon} onChange={(e) => setCoupon(e.target.value)} placeholder="Enter coupon code" style={input} />
                    <button onClick={applyCoupon} style={{ ...btnSmallPrimary, width: isMobile ? "100%" : "auto" }} disabled={couponLoading}>
                      {couponLoading ? "Checking…" : "Apply"}
                    </button>
                  </div>

                  {couponApplied ? (
                    <div style={{ marginTop: 10, ...alertInfo }}>
                      ✅ Coupon <b>{couponApplied.code}</b> applied. Discount: <b>{money(discount, currency)}</b>
                      <div style={{ marginTop: 8 }}>
                        <button
                          onClick={() => {
                            setCouponApplied(null);
                            setCouponDiscountValue(0);
                            setCoupon("");
                            setInfoMsg("Coupon removed.");
                          }}
                          style={{ ...btnSmallGhost, width: isMobile ? "100%" : "auto" }}
                        >
                          Remove coupon
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <div style={{ fontWeight: 950, color: "rgba(17,24,39,0.75)" }}>Tip delivery partner:</div>
                    {[0, 10, 20, 30, 50].map((t) => (
                      <button key={t} onClick={() => setTip(t)} style={tip === t ? chipActive : chip}>
                        {t === 0 ? "No tip" : money(t, currency)}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(0,0,0,0.08)" }}>
                  <div style={helperText}>Grocery checkout is now wired ✅</div>
                </div>
              )}
            </div>

            <div ref={deliveryRef} style={cardGlass}>
              <h2 style={sectionTitle}>Delivery Details</h2>
              <div style={helperText}>Enter delivery details to place the order.</div>

              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                <div>
                  <div style={inputLabel}>Customer Name</div>
                  <input value={customer_name} onChange={(e) => setCustomerName(e.target.value)} style={input} />
                </div>

                <div>
                  <div style={inputLabel}>Phone</div>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} style={input} />
                </div>

                <div>
                  <div style={inputLabel}>Address Line 1</div>
                  <input value={address_line1} onChange={(e) => setAddress1(e.target.value)} style={input} />
                </div>

                <div>
                  <div style={inputLabel}>City</div>
                  <input value={city} onChange={(e) => setCity(e.target.value)} style={input} />
                </div>

                <div>
                  <div style={inputLabel}>State</div>
                  <input value={state_region} onChange={(e) => setStateRegion(e.target.value)} style={input} />
                </div>

                <div>
                  <div style={inputLabel}>Zip Code</div>
                  <input value={zip} onChange={(e) => setZip(e.target.value)} style={input} />
                </div>
                <div>
                  <div style={inputLabel}>Address Line 2 (optional)</div>
                  <input value={address_line2} onChange={(e) => setAddress2(e.target.value)} style={input} />
                </div>

                <div>
                  <div style={inputLabel}>Landmark (optional)</div>
                  <input value={landmark} onChange={(e) => setLandmark(e.target.value)} style={input} />
                </div>

                <div>
                  <div style={inputLabel}>Delivery Instructions (optional)</div>
                  <input value={instructions} onChange={(e) => setInstructions(e.target.value)} style={input} />
                </div>

                <div style={{ marginTop: 6 }}>
                  <div style={inputLabel}>Payment Method</div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button onClick={() => setPaymentMethod("card")} style={paymentMethod === "card" ? chipActive : chip}>
                      Card
                    </button>
                  </div>

                  {paymentMethod === "card" ? (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 12, fontWeight: 850, color: "rgba(17,24,39,0.65)" }}>
                        Card payments use Stripe Checkout.
                      </div>
                    </div>
                  ) : null}
                </div>

                <label style={{ display: "flex", gap: 10, alignItems: "center", fontWeight: 900, marginTop: 6 }}>
                  <input type="checkbox" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} />
                  Save this address on this device
                </label>

                <div
                  style={{
                    marginTop: 6,
                    paddingTop: 10,
                    borderTop: "1px solid rgba(0,0,0,0.08)",
                    fontWeight: 900,
                    color: "rgba(17,24,39,0.75)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0" }}>
                    <span>Total items</span>
                    <span style={{ color: "#0b1220" }}>{itemCount}</span>
                  </div>

                  <div style={rowLight}>
                    <span>Subtotal</span>
                    <span style={{ color: "#0b1220" }}>{money(subtotal, currency)}</span>
                  </div>

                  {platformFeeToShow > 0 ? (
                    <div style={rowLight}>
                      <span>Platform fee</span>
                      <span style={{ color: "#0b1220" }}>{money(platformFeeToShow, currency)}</span>
                    </div>
                  ) : null}

                  <div style={rowLight}>
                    <span>Delivery fee</span>
                    <span style={{ color: "#0b1220" }}>{deliveryFee === 0 ? "FREE" : money(deliveryFee, currency)}</span>
                  </div>

                  <div style={rowLight}>
                    <span>Tax</span>
                    <span style={{ color: "#0b1220" }}>{money(gst, currency)}</span>
                  </div>

                  {platform?.tax_note ? (
                    <div style={{ marginTop: 8, fontSize: 12, fontWeight: 850, color: "rgba(17,24,39,0.55)", lineHeight: 1.4 }}>
                      {platform.tax_note}
                    </div>
                  ) : null}

                  {tip ? (
                    <div style={rowLight}>
                      <span>Tip</span>
                      <span style={{ color: "#0b1220" }}>{money(tip, currency)}</span>
                    </div>
                  ) : null}

                  {discount ? (
                    <div style={rowLight}>
                      <span>Discount</span>
                      <span style={{ color: "#0b1220" }}>- {money(discount, currency)}</span>
                    </div>
                  ) : null}

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      paddingTop: 12,
                      fontWeight: 1000,
                      fontSize: 16,
                      color: "#0b1220",
                      borderTop: "1px solid rgba(0,0,0,0.08)",
                      marginTop: 10,
                      paddingBottom: 10,
                    }}
                  >
                    <span>Payable</span>
                    <span>{money(payable, currency)}</span>
                  </div>

                  {/* ✅ FIX: Always placeOrder (Stripe redirect happens inside after DB order) */}
                  <button
                    onClick={placeOrder}
                    disabled={placing || !isAuthed}
                    style={{
                      ...btnSmallPrimary,
                      width: "100%",
                      marginTop: 12,
                      opacity: placing || !isAuthed ? 0.65 : 1,
                      cursor: placing || !isAuthed ? "not-allowed" : "pointer",
                      padding: "12px 14px",
                      borderRadius: 14,
                      fontSize: 14,
                    }}
                  >
                    {placing ? "Processing…" : !isAuthed ? "Login to Place Order" : paymentMethod === "card" ? "Pay with Stripe" : "Place Order"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeItems.length > 0 ? (
          <div style={sticky}>
            <div style={{ fontWeight: 1000, textAlign: isMobile ? "center" : "left" }}>
              {itemCount} item{itemCount === 1 ? "" : "s"} • Payable <b>{money(payable, currency)}</b>
            </div>

            <button onClick={scrollToDelivery} style={{ ...btnSmallPrimary, width: isMobile ? "100%" : "auto" }}>
              Checkout →
            </button>
          </div>
        ) : null}
      </div>
    </main>
  );
}