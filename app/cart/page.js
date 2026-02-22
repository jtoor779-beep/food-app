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

function money(v) {
  const n = Number(v || 0);
  if (!isFinite(n)) return "₹0";
  return `₹${n.toFixed(0)}`;
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
   ========================================================= */

const GROCERY_CART_KEY = "grocery_cart_items";
const GROCERY_FALLBACK_KEY = "grocery_cart";

function normalizeGroceryCartShape(arr) {
  const list = Array.isArray(arr) ? arr : [];
  return list
    .map((x) => ({
      id: x?.id, // grocery_items.id
      store_id: x?.store_id, // grocery_stores.id
      name: x?.name,
      price: clampMoney(x?.price, 0, 100000, 0),
      qty: sanitizeQty(x?.qty),
      image_url: x?.image_url || "",
      category: x?.category || "General",
    }))
    .filter((x) => x.id && x.store_id && x.qty > 0);
}

/**
 * READ only (no writes, no events)
 */
function readGroceryCartRaw() {
  const rawA = safeParse(localStorage.getItem(GROCERY_CART_KEY));
  const rawB = safeParse(localStorage.getItem(GROCERY_FALLBACK_KEY));
  const a = normalizeGroceryCartShape(rawA);
  const b = normalizeGroceryCartShape(rawB);

  if (a.length === 0 && b.length === 0) return [];
  const chosen = a.length > 0 ? a : b;

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
  return String(code || "").trim().toUpperCase().replace(/\s+/g, "");
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

async function validateCouponFromDb({ code, subtotal, userId }) {
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
      return { ok: false, reason: `Minimum order ${money(minOrder)} required for this coupon.` };
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
  // try with store_id first (needed for owner filters)
  const attempts = [
    {
      ...payload,
      store_id: payload.store_id,
    },
    // fallback if store_id column doesn't exist
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
    if (isMissingColumnError(msg)) continue; // try next
    throw error;
  }

  throw lastErr || new Error("Failed to create grocery order.");
}

async function insertGroceryOrderItemsAuto(rows) {
  // We don’t know your exact columns, so we try a few shapes safely.
  // Table name is PLURAL: grocery_order_items
  const candidates = [
    // common: order_id + grocery_item_id + qty + price_each
    (r) => ({
      order_id: r.order_id,
      grocery_item_id: r.item_id,
      qty: r.qty,
      price_each: r.price_each,
      item_name: r.name,
    }),
    // common: order_id + item_id + qty + price
    (r) => ({
      order_id: r.order_id,
      item_id: r.item_id,
      qty: r.qty,
      price: r.price_each,
      name: r.name,
    }),
    // minimal: order_id + item_id + qty
    (r) => ({
      order_id: r.order_id,
      item_id: r.item_id,
      qty: r.qty,
    }),
    // minimal alt: order_id + grocery_item_id + quantity
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

    // missing column → try next shape
    if (isMissingColumnError(msg)) continue;

    // any other error → stop
    throw error;
  }

  throw lastErr || new Error("Failed to create grocery order items.");
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

  // Delivery fields
  const [customer_name, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [address_line1, setAddress1] = useState("");
  const [address_line2, setAddress2] = useState("");
  const [landmark, setLandmark] = useState("");
  const [instructions, setInstructions] = useState("");

  // Premium fields (restaurant only)
  const [coupon, setCoupon] = useState("");
  const [couponApplied, setCouponApplied] = useState(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponDiscountValue, setCouponDiscountValue] = useState(0);

  const [tip, setTip] = useState(0);

  // ✅ CHANGED: default to card (removed cod/up i)
  const [paymentMethod, setPaymentMethod] = useState("card");

  const [saveAddress, setSaveAddress] = useState(true);

  const activeItems = useMemo(() => (cartMode === "grocery" ? gItems : items), [cartMode, gItems, items]);

  const subtotal = useMemo(() => {
    if (cartMode === "grocery") {
      return (gItems || []).reduce((s, x) => s + Number(x.qty || 0) * Number(x.price || 0), 0);
    }
    return (items || []).reduce((s, x) => s + Number(x.qty || 0) * Number(x.price_each || 0), 0);
  }, [cartMode, gItems, items]);

  const itemCount = useMemo(() => (activeItems || []).reduce((s, x) => s + Number(x.qty || 0), 0), [activeItems]);

  const deliveryFee = useMemo(() => {
    if (!activeItems || activeItems.length === 0) return 0;
    const base = 25;
    return subtotal >= 499 ? 0 : base;
  }, [activeItems, subtotal]);

  const gst = useMemo(() => Math.round(subtotal * 0.05), [subtotal]);

  const discount = useMemo(() => {
    if (cartMode !== "restaurant") return 0;
    if (!couponApplied) return 0;
    return Math.max(0, Number(couponDiscountValue || 0));
  }, [cartMode, couponApplied, couponDiscountValue]);

  const payable = useMemo(() => {
    const p = subtotal + deliveryFee + gst + Number(tip || 0) - discount;
    return Math.max(0, p);
  }, [subtotal, deliveryFee, gst, tip, discount]);

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

        // READ carts (no freeze)
        const rCart = readRestaurantCartRaw();
        const gCart = readGroceryCartRaw();

        // one-time repair/sync so both keys stay aligned (NO events)
        repairRestaurantCartToBothKeys(rCart);
        repairGroceryCartToBothKeys(gCart);

        if (!cancelled) {
          setItemsState(Array.isArray(rCart) ? rCart : []);
          setGItemsState(Array.isArray(gCart) ? gCart : []);

          if ((rCart || []).length > 0) setCartMode("restaurant");
          else if ((gCart || []).length > 0) setCartMode("grocery");
          else setCartMode("restaurant");
        }

        // Load saved address
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

        const { data: prof, error: profErr } = await supabase
          .from("profiles")
          .select("role")
          .eq("user_id", user.id)
          .maybeSingle();

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

    // native storage (other tabs) + custom event (same tab)
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
  }, [subtotal, cartMode]);

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
      });

      if (!res.ok) {
        setCouponApplied(null);
        setCouponDiscountValue(0);
        setErrMsg(res.reason || "Invalid coupon.");
        return;
      }

      setCouponApplied(res.coupon);
      setCouponDiscountValue(res.discount || 0);
      setInfoMsg(`✅ Coupon ${res.coupon.code} applied. Discount: ${money(res.discount || 0)}`);
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
     ✅ STRIPE CHECKOUT (NEW) - only triggers when paymentMethod="card"
     Uses existing API route: /api/stripe/checkout
     ========================================================= */
  function buildStripeItems() {
    if (cartMode === "grocery") {
      return (gItems || []).map((it) => ({
        name: it?.name || "Grocery Item",
        price: Number(it?.price || 0),
        quantity: sanitizeQty(Number(it?.qty || 1)),
      }));
    }

    return (items || []).map((it) => ({
      name: it?.name || "Menu Item",
      price: Number(it?.price_each || 0),
      quantity: sanitizeQty(Number(it?.qty || 1)),
    }));
  }

  async function payWithStripe() {
    setErrMsg("");
    setInfoMsg("");

    if (!isAuthed) {
      setErrMsg("Please login or sign up to pay.");
      router.push("/login?next=/cart");
      return;
    }

    if (!customer_name.trim()) return setErrMsg("Please enter customer name.");
    if (!phone.trim()) return setErrMsg("Please enter phone.");
    if (!address_line1.trim()) return setErrMsg("Please enter address line 1.");

    if (!activeItems || activeItems.length === 0) {
      return setErrMsg("Cart is empty.");
    }

    // grocery single-store rule (keep same logic)
    if (cartMode === "grocery") {
      const store_id = gItems[0]?.store_id;
      if (!store_id) return setErrMsg("Grocery cart items missing store_id. Please re-add items.");
      const multi = gItems.some((x) => x.store_id !== store_id);
      if (multi) return setErrMsg("Please order from one grocery store at a time.");
    }

    // restaurant single-restaurant rule (keep same logic)
    if (cartMode === "restaurant") {
      const restaurant_id = items[0]?.restaurant_id;
      if (!restaurant_id) return setErrMsg("Cart items missing restaurant_id. Please re-add items.");
      const multi = items.some((x) => x.restaurant_id !== restaurant_id);
      if (multi) return setErrMsg("Please order from one restaurant at a time.");
    }

    if (saveAddress) saveAddressToLocal();

    setPlacing(true);
    try {
      const restaurant_id = cartMode === "restaurant" ? (items[0]?.restaurant_id || "") : "";
      const store_id = cartMode === "grocery" ? (gItems[0]?.store_id || "") : "";

      // ✅ NEW: tell Stripe which flow this is, so /payment/success can save to correct tables
      const order_type = cartMode === "grocery" ? "grocery" : "restaurant";

      // ✅ NEW: where should success page redirect
      // If you don't have /groceries/orders yet, you can change to "/orders"
      const success_redirect = cartMode === "grocery" ? "/groceries/orders" : "/orders";

      const payload = {
        items: buildStripeItems(),

        // ✅ NEW (works with updated /api/stripe/checkout route)
        order_type,
        restaurant_id: restaurant_id || undefined,
        store_id: store_id || undefined,
        success_redirect,

        // keep old meta (doesn't break anything)
        meta: {
          cartMode,
          customer_name: customer_name.trim(),
          phone: phone.trim(),
          address: buildFullAddress({
            address_line1: address_line1.trim(),
            address_line2: address_line2.trim() || "",
            landmark: landmark.trim() || "",
          }),
          instructions: (instructions || "").trim() || "",
          tip: Number(tip || 0),
          deliveryFee: Number(deliveryFee || 0),
          gst: Number(gst || 0),
          discount: Number(discount || 0),
          payable: Number(payable || 0),
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

      // Expecting API returns: { url } (or similar)
      const url = j?.url || j?.checkoutUrl || j?.sessionUrl;
      if (!url) throw new Error("Stripe did not return a checkout URL.");

      // Redirect to Stripe
      window.location.href = url;
    } catch (e) {
      setErrMsg(e?.message || String(e));
    } finally {
      setPlacing(false);
    }
  }

  async function placeOrder() {
    setErrMsg("");
    setInfoMsg("");

    if (!isAuthed) {
      setErrMsg("Please login or sign up to place an order.");
      router.push("/login?next=/cart");
      return;
    }

    // shared validations
    if (!customer_name.trim()) return setErrMsg("Please enter customer name.");
    if (!phone.trim()) return setErrMsg("Please enter phone.");
    if (!address_line1.trim()) return setErrMsg("Please enter address line 1.");

    // ✅ Grocery checkout (NOW WIRED)
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

        const total_amount = Math.max(
          0,
          Number(subtotal || 0) + Number(deliveryFee || 0) + Number(gst || 0) + Number(tip || 0)
        );

        // Your grocery_orders columns (from screenshot):
        // customer_user_id, customer_name, customer_phone, delivery_address,
        // instructions, status, total_amount
        const orderPayload = {
          customer_user_id: user.id,
          store_id, // will auto-fallback if column not exists
          customer_name: customer_name.trim(),
          customer_phone: phone.trim(),
          delivery_address: fullAddr,
          instructions: (instructions || "").trim() || null,
          status: "pending",
          total_amount,
          // optional (if you add these later): customer_lat, customer_lng
          customer_lat: geo?.lat ?? null,
          customer_lng: geo?.lng ?? null,
        };

        // some DBs won’t have customer_lat/lng yet → remove safely if needed
        let orderRow = null;
        try {
          orderRow = await insertGroceryOrderAuto(orderPayload);
        } catch (e) {
          const msg = e?.message || String(e);
          if (isMissingColumnError(msg)) {
            // retry without lat/lng if those columns don't exist
            const slim = { ...orderPayload };
            delete slim.customer_lat;
            delete slim.customer_lng;
            orderRow = await insertGroceryOrderAuto(slim);
          } else {
            throw e;
          }
        }

        // insert items
        const rows = gItems.map((it) => ({
          order_id: orderRow.id,
          item_id: it.id,
          qty: sanitizeQty(Number(it.qty || 1)),
          price_each: clampMoney(Number(it.price || 0), 0, 100000, 0),
          name: it.name || "Item",
        }));

        await insertGroceryOrderItemsAuto(rows);

        // clear grocery cart
        setGroceryItems([]);
        setTip(0);

        setInfoMsg("✅ Grocery order placed successfully!");
        // optional redirect if you have a grocery orders page:
        // router.push("/groceries/orders");
        router.refresh();
      } catch (e) {
        setErrMsg(e?.message || String(e));
      } finally {
        setPlacing(false);
      }
      return;
    }

    // ✅ Restaurant logic (unchanged)
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
        gst ? `gst:${gst}` : "",
        paymentMethod ? `pay:${paymentMethod}` : "",
      ]
        .filter(Boolean)
        .join(" | ");

      const finalInstructions = [instructions?.trim() || "", extraMeta ? `(${extraMeta})` : ""]
        .filter(Boolean)
        .join(" ");

      const fullAddr = buildFullAddress({
        address_line1: address_line1.trim(),
        address_line2: address_line2.trim() || "",
        landmark: landmark.trim() || "",
      });

      const geo = await geocodeAddressClient(fullAddr);

      let restLat = null;
      let restLng = null;
      try {
        const { data: rest, error: restErr } = await supabase
          .from("restaurants")
          .select("lat, lng")
          .eq("id", restaurant_id)
          .maybeSingle();

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
      const total_amount = Math.max(
        0,
        subtotal_amount + Number(deliveryFee || 0) + Number(gst || 0) + Number(tip || 0) - discount_amount
      );

      const { data: orderRow, error: orderErr } = await supabase
        .from("orders")
        .insert({
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
        })
        .select("id")
        .single();

      if (orderErr) throw orderErr;

      const order_items_rows = items.map((it) => ({
        order_id: orderRow.id,
        menu_item_id: it.menu_item_id,
        qty: sanitizeQty(Number(it.qty || 1)),
        price_each: clampMoney(Number(it.price_each || 0), 0, 100000, 0),
      }));

      const { error: oiErr } = await supabase.from("order_items").insert(order_items_rows);
      if (oiErr) throw oiErr;

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

      router.push("/orders");
      router.refresh();
    } catch (e) {
      setErrMsg(e?.message || String(e));
    } finally {
      setPlacing(false);
    }
  }

  const wrap = {
    Width: "100",
    margin: "0 auto",
    paddingBottom: isMobile ? 140 : 90,
  };

  const hero = {
    ...heroGlass,
    padding: isMobile ? 14 : heroGlass.padding,
    alignItems: isMobile ? "stretch" : heroGlass.alignItems,
  };

  const heroTitleR = {
    ...heroTitle,
    fontSize: isMobile ? 26 : heroTitle.fontSize,
    lineHeight: isMobile ? "30px" : "40px",
  };

  const gridMain = {
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : "1.4fr 0.9fr",
    gap: 12,
    marginTop: 12,
  };

  const itemCard = {
    borderRadius: 16,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "rgba(255,255,255,0.82)",
    padding: 12,
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr" : "1fr auto",
    gap: 10,
  };

  const itemActions = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    justifyContent: isMobile ? "space-between" : "flex-start",
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
              <div style={statNum}>{money(subtotal)}</div>
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
                  ? gItems.map((it, ix) => (
                      <div key={`${it.id}-${ix}`} style={itemCard}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 1000, color: "#0b1220", fontSize: isMobile ? 15 : 16 }}>
                            {it.name || "Item"}
                          </div>
                          <div style={{ marginTop: 6, color: "rgba(17,24,39,0.65)", fontWeight: 850, fontSize: 13 }}>
                            {money(it.price)} each • Line: <b>{money(Number(it.qty || 0) * Number(it.price || 0))}</b>
                          </div>
                        </div>

                        <div style={itemActions}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <button onClick={() => decQty(ix)} style={btnSmallGhost}>
                              −
                            </button>
                            <div style={{ minWidth: 34, textAlign: "center", fontWeight: 1000 }}>{it.qty}</div>
                            <button onClick={() => incQty(ix)} style={btnSmallGhost}>
                              +
                            </button>
                          </div>

                          <button onClick={() => removeItem(ix)} style={{ ...btnSmallGhost, width: isMobile ? "100%" : "auto" }}>
                            Remove
                          </button>
                        </div>
                      </div>
                    ))
                  : items.map((it, ix) => (
                      <div key={`${it.menu_item_id}-${ix}`} style={itemCard}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 1000, color: "#0b1220", fontSize: isMobile ? 15 : 16 }}>
                            {it.name || "Item"}
                          </div>
                          <div style={{ marginTop: 6, color: "rgba(17,24,39,0.65)", fontWeight: 850, fontSize: 13 }}>
                            {money(it.price_each)} each • Line: <b>{money(Number(it.qty || 0) * Number(it.price_each || 0))}</b>
                          </div>
                          {it.note ? (
                            <div style={{ marginTop: 6, color: "rgba(17,24,39,0.62)", fontWeight: 850, fontSize: 12 }}>
                              Note: {it.note}
                            </div>
                          ) : null}
                        </div>

                        <div style={itemActions}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <button onClick={() => decQty(ix)} style={btnSmallGhost}>
                              −
                            </button>
                            <div style={{ minWidth: 34, textAlign: "center", fontWeight: 1000 }}>{it.qty}</div>
                            <button onClick={() => incQty(ix)} style={btnSmallGhost}>
                              +
                            </button>
                          </div>

                          <button onClick={() => removeItem(ix)} style={{ ...btnSmallGhost, width: isMobile ? "100%" : "auto" }}>
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
                    <button
                      onClick={applyCoupon}
                      style={{ ...btnSmallPrimary, width: isMobile ? "100%" : "auto" }}
                      disabled={couponLoading}
                    >
                      {couponLoading ? "Checking…" : "Apply"}
                    </button>
                  </div>

                  {couponApplied ? (
                    <div style={{ marginTop: 10, ...alertInfo }}>
                      ✅ Coupon <b>{couponApplied.code}</b> applied. Discount: <b>{money(discount)}</b>
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
                        {t === 0 ? "No tip" : `₹${t}`}
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
                  {/* ✅ CHANGED: removed "(demo)" word */}
                  <div style={inputLabel}>Payment Method</div>

                  {/* ✅ CHANGED: removed COD + UPI buttons, keep Card only */}
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button onClick={() => setPaymentMethod("card")} style={paymentMethod === "card" ? chipActive : chip}>
                      Card
                    </button>
                  </div>

                  {/* ✅ Stripe hint button (only shows when Card is selected) */}
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
                    <span style={{ color: "#0b1220" }}>{money(subtotal)}</span>
                  </div>

                  <div style={rowLight}>
                    <span>Delivery fee</span>
                    <span style={{ color: "#0b1220" }}>{deliveryFee === 0 ? "FREE" : money(deliveryFee)}</span>
                  </div>

                  {/* Leaving GST line untouched except you asked only payment demo removal */}
                  <div style={rowLight}>
                    <span>GST (demo 5%)</span>
                    <span style={{ color: "#0b1220" }}>{money(gst)}</span>
                  </div>

                  {tip ? (
                    <div style={rowLight}>
                      <span>Tip</span>
                      <span style={{ color: "#0b1220" }}>{money(tip)}</span>
                    </div>
                  ) : null}

                  {discount ? (
                    <div style={rowLight}>
                      <span>Discount</span>
                      <span style={{ color: "#0b1220" }}>- {money(discount)}</span>
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
                    <span>{money(payable)}</span>
                  </div>

                  {/* ✅ IMPORTANT: If Card is selected -> Pay with Stripe, else normal Place Order */}
                  <button
                    onClick={paymentMethod === "card" ? payWithStripe : placeOrder}
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
                    {placing
                      ? "Processing…"
                      : !isAuthed
                      ? "Login to Place Order"
                      : paymentMethod === "card"
                      ? "Pay with Stripe"
                      : "Place Order"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeItems.length > 0 ? (
          <div style={sticky}>
            <div style={{ fontWeight: 1000 }}>
              {itemCount} item{itemCount === 1 ? "" : "s"} • Payable <b>{money(payable)}</b>
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