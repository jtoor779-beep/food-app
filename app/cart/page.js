"use client";

import { useEffect, useMemo, useState } from "react";
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
   ✅ CART STORAGE FIX (SUPER IMPORTANT)
   Supports BOTH keys:
   - "foodapp_cart"
   - "cart_items"
   + protects against corrupted qty/price (99 issue)
   + FIXES "1 item becomes 2" (dedupe logic)
   ========================================================= */

const MAX_SAFE_QTY = 20; // anything above = corrupted, reset to 1

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
  if (i > MAX_SAFE_QTY) return 1; // ✅ stops 99/999 corruption
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

/**
 * ✅ KEY FIX:
 * If both keys contain the same items, DO NOT SUM.
 * If they differ, we dedupe by taking MAX qty per menu_item_id (not sum).
 */
function mergePreferMax(a, b) {
  const map = new Map();

  for (const it of a) {
    map.set(String(it.menu_item_id), { ...it });
  }

  for (const it of b) {
    const key = String(it.menu_item_id);
    const existing = map.get(key);
    if (!existing) map.set(key, { ...it });
    else {
      map.set(key, {
        ...existing,
        // ✅ DO NOT SUM — take the max (prevents 1->2 bug)
        qty: Math.max(Number(existing.qty || 1), Number(it.qty || 1)),
        // prefer existing fields, but fill missing
        name: existing.name || it.name,
        image_url: existing.image_url || it.image_url,
        price_each: existing.price_each || it.price_each,
        note: existing.note || it.note || "",
      });
    }
  }

  return Array.from(map.values());
}

function getCartCompat() {
  const rawA = safeParse(localStorage.getItem("cart_items"));
  const rawB = safeParse(localStorage.getItem("foodapp_cart"));

  const a = normalizeCartShape(rawA);
  const b = normalizeCartShape(rawB);

  if (a.length === 0 && b.length === 0) return [];

  // If both are identical, just use one
  if (a.length > 0 && b.length > 0 && stableStringify(a) === stableStringify(b)) {
    try {
      localStorage.setItem("cart_items", JSON.stringify(a));
      localStorage.setItem("foodapp_cart", JSON.stringify(a));
      window.dispatchEvent(new Event("storage"));
    } catch {}
    return a;
  }

  const merged = mergePreferMax(a, b);

  // enforce one-restaurant cart
  const rid = merged[0]?.restaurant_id;
  const cleaned = merged.filter((x) => x.restaurant_id === rid);

  // ✅ always write back cleaned cart (auto-fix corruption + keep keys synced)
  try {
    localStorage.setItem("cart_items", JSON.stringify(cleaned));
    localStorage.setItem("foodapp_cart", JSON.stringify(cleaned));
    window.dispatchEvent(new Event("storage"));
  } catch {}

  return cleaned;
}

function setCartCompat(items) {
  const cleaned = normalizeCartShape(items);
  try {
    localStorage.setItem("cart_items", JSON.stringify(cleaned));
    localStorage.setItem("foodapp_cart", JSON.stringify(cleaned));
    window.dispatchEvent(new Event("storage"));
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
   ✅ MATCHES YOUR REAL TABLE:
   id, code, type, value, min_order_amount, max_discount,
   starts_at, expires_at, is_active, usage_limit_total, usage_limit_per_user
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
  // filters: [{col, op, val}]  op used as method: "eq", "in", etc
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
    // ✅ UPDATED SELECT to match your actual coupons table
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

    // Optional limits (best-effort, won’t block if your redemptions schema differs)
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

    // Calculate discount on SUBTOTAL ONLY ✅ (Option A)
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

/* =========================
   ✅ PREMIUM THEME
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

export default function CartPage() {
  const router = useRouter();

  const [isAuthed, setIsAuthed] = useState(false);
  const [userRole, setUserRole] = useState("");

  const [items, setItemsState] = useState([]);
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

  // Premium fields
  const [coupon, setCoupon] = useState("");
  const [couponApplied, setCouponApplied] = useState(null); // { id, code, type, value, max_discount, min_order_amount }
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponDiscountValue, setCouponDiscountValue] = useState(0);

  const [tip, setTip] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("cod"); // cod | upi | card (demo)
  const [saveAddress, setSaveAddress] = useState(true);

  const subtotal = useMemo(() => {
    return (items || []).reduce((s, x) => s + Number(x.qty || 0) * Number(x.price_each || 0), 0);
  }, [items]);

  const itemCount = useMemo(() => (items || []).reduce((s, x) => s + Number(x.qty || 0), 0), [items]);

  const deliveryFee = useMemo(() => {
    if (!items || items.length === 0) return 0;
    const base = 25;
    return subtotal >= 499 ? 0 : base;
  }, [items, subtotal]);

  const gst = useMemo(() => Math.round(subtotal * 0.05), [subtotal]);

  // ✅ Option A: discount applies ONLY on SUBTOTAL (already ensured in validation)
  const discount = useMemo(() => {
    if (!couponApplied) return 0;
    return Math.max(0, Number(couponDiscountValue || 0));
  }, [couponApplied, couponDiscountValue]);

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

        const c = getCartCompat();
        if (!cancelled) setItemsState(Array.isArray(c) ? c : []);

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

    const onStorage = () => {
      const c = getCartCompat();
      setItemsState(Array.isArray(c) ? c : []);
    };

    window.addEventListener("storage", onStorage);

    return () => {
      cancelled = true;
      window.removeEventListener("storage", onStorage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ If subtotal changed after coupon applied, we re-check quietly (best effort)
  useEffect(() => {
    let cancelled = false;

    async function recheck() {
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
      } catch {
        // ignore background recheck errors
      }
    }

    recheck();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal]);

  function setItems(next) {
    setItemsState(next);
    setCartCompat(next);
  }

  function incQty(ix) {
    const next = [...items];
    next[ix] = { ...next[ix], qty: sanitizeQty(Number(next[ix].qty || 0) + 1) };
    setItems(next);
  }

  function decQty(ix) {
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
    const next = [...items];
    next.splice(ix, 1);
    setItems(next);
  }

  function clearCart() {
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

  async function placeOrder() {
    setErrMsg("");
    setInfoMsg("");

    if (!isAuthed) {
      setErrMsg("Please login or sign up to place an order.");
      router.push("/login?next=/cart");
      return;
    }

    if (!items || items.length === 0) return setErrMsg("Cart is empty.");
    if (!customer_name.trim()) return setErrMsg("Please enter customer name.");
    if (!phone.trim()) return setErrMsg("Please enter phone.");
    if (!address_line1.trim()) return setErrMsg("Please enter address line 1.");

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

      // ✅ Before placing, re-validate coupon (so nobody can fake discount)
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

      // ✅ REAL GEOCODING: convert address -> lat/lng
      const fullAddr = buildFullAddress({
        address_line1: address_line1.trim(),
        address_line2: address_line2.trim() || "",
        landmark: landmark.trim() || "",
      });

      // We try geocode, but we never block order if geocode fails.
      const geo = await geocodeAddressClient(fullAddr);

      // ✅ NEW: Fetch restaurant lat/lng from restaurants table
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

      // ✅ totals breakdown to store in DB
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

          // ✅ keep old column so nothing breaks
          total: total_amount,

          // ✅ new totals columns
          subtotal_amount,
          discount_amount,
          total_amount,

          // ✅ coupon columns
          coupon_id: finalCoupon?.id ?? null,
          coupon_code: finalCoupon?.code ?? null,

          customer_name: customer_name.trim(),
          phone: phone.trim(),
          address_line1: address_line1.trim(),
          address_line2: address_line2.trim() || null,
          landmark: landmark.trim() || null,
          instructions: finalInstructions || null,

          // ✅ drop coordinates
          customer_lat: geo?.lat ?? null,
          customer_lng: geo?.lng ?? null,

          // ✅ pickup coordinates
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

      // ✅ best-effort coupon redemption log (won’t break if schema different)
      if (finalCoupon?.id) {
        try {
          await supabase.from("coupon_redemptions").insert({
            coupon_id: finalCoupon.id,
            user_id: user.id,
            order_id: orderRow.id,
            coupon_code: finalCoupon.code,
          });
        } catch {
          // ignore
        }
      }

      setItems([]);
      setCoupon("");
      setCouponApplied(null);
      setCouponDiscountValue(0);
      setTip(0);

      // Optional info
      const notes = [];
      if (!geo) notes.push("Address geocode failed (drop location missing)");
      if (!restLat || !restLng) notes.push("Restaurant location missing (pickup location missing)");

      if (notes.length) {
        setInfoMsg(`✅ Order placed successfully! (Note: ${notes.join(" • ")})`);
      } else {
        setInfoMsg("✅ Order placed successfully! (Pickup + drop locations saved)");
      }

      router.push("/orders");
      router.refresh();
    } catch (e) {
      setErrMsg(e?.message || String(e));
    } finally {
      setPlacing(false);
    }
  }

  return (
    <main style={pageBg}>
      <div style={{ maxWidth: 1120, margin: "0 auto", paddingBottom: 90 }}>
        <div style={heroGlass}>
          <div style={{ minWidth: 260 }}>
            <div style={pill}>Customer</div>
            <h1 style={heroTitle}>Cart</h1>
            <div style={{ marginTop: 6, color: "rgba(17,24,39,0.65)", fontWeight: 800 }}>
              Review items + delivery details
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div style={statCard}>
              <div style={statNum}>{itemCount}</div>
              <div style={statLabel}>Items</div>
            </div>

            <div style={statCard}>
              <div style={statNum}>{money(subtotal)}</div>
              <div style={statLabel}>Subtotal</div>
            </div>

            <Link href="/menu" style={pill}>
              ← Back to Menu
            </Link>
          </div>
        </div>

        {errMsg ? <div style={alertErr}>{errMsg}</div> : null}
        {infoMsg ? <div style={alertInfo}>{infoMsg}</div> : null}

        {loading ? (
          <div style={{ marginTop: 14, color: "rgba(17,24,39,0.7)", fontWeight: 900 }}>Loading…</div>
        ) : items.length === 0 ? (
          <div style={{ marginTop: 12, ...emptyBox }}>
            Cart is empty.
            <div style={{ marginTop: 8 }}>
              <Link href="/menu" style={pill}>
                Browse Menu →
              </Link>
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.9fr", gap: 12, marginTop: 12 }}>
            {/* LEFT: Items + Offers */}
            <div style={cardGlass}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div>
                  <h2 style={sectionTitle}>Items</h2>
                  <div style={helperText}>Adjust quantities or remove items.</div>
                </div>

                <button onClick={clearCart} style={btnSmallGhost}>
                  Clear Cart
                </button>
              </div>

              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                {items.map((it, ix) => (
                  <div
                    key={`${it.menu_item_id}-${ix}`}
                    style={{
                      borderRadius: 16,
                      border: "1px solid rgba(0,0,0,0.08)",
                      background: "rgba(255,255,255,0.82)",
                      padding: 12,
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      gap: 10,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 1000, color: "#0b1220" }}>{it.name || "Item"}</div>
                      <div style={{ marginTop: 4, color: "rgba(17,24,39,0.65)", fontWeight: 850, fontSize: 13 }}>
                        {money(it.price_each)} each • Line:{" "}
                        <b>{money(Number(it.qty || 0) * Number(it.price_each || 0))}</b>
                      </div>
                      {it.note ? (
                        <div style={{ marginTop: 6, color: "rgba(17,24,39,0.62)", fontWeight: 850, fontSize: 12 }}>
                          Note: {it.note}
                        </div>
                      ) : null}
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <button onClick={() => decQty(ix)} style={btnSmallGhost}>
                        −
                      </button>
                      <div style={{ minWidth: 34, textAlign: "center", fontWeight: 1000 }}>{it.qty}</div>
                      <button onClick={() => incQty(ix)} style={btnSmallGhost}>
                        +
                      </button>

                      <button onClick={() => removeItem(ix)} style={btnSmallGhost}>
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Offers */}
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(0,0,0,0.08)" }}>
                <div>
                  <div style={sectionTitle}>Offers</div>
                  <div style={helperText}>Enter your coupon code</div>
                </div>

                <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
                  <input
                    value={coupon}
                    onChange={(e) => setCoupon(e.target.value)}
                    placeholder="Enter coupon code"
                    style={input}
                  />
                  <button onClick={applyCoupon} style={btnSmallPrimary} disabled={couponLoading}>
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
                        style={btnSmallGhost}
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
            </div>

            {/* RIGHT: Delivery Details + Summary */}
            <div style={cardGlass}>
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
                  <div style={inputLabel}>Payment Method (demo)</div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button onClick={() => setPaymentMethod("cod")} style={paymentMethod === "cod" ? chipActive : chip}>
                      Cash on Delivery
                    </button>
                    <button onClick={() => setPaymentMethod("upi")} style={paymentMethod === "upi" ? chipActive : chip}>
                      UPI
                    </button>
                    <button
                      onClick={() => setPaymentMethod("card")}
                      style={paymentMethod === "card" ? chipActive : chip}
                    >
                      Card
                    </button>
                  </div>
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
                    {placing ? "Placing…" : !isAuthed ? "Login to Place Order" : "Place Order"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {items.length > 0 ? (
          <div style={stickyBar}>
            <div style={{ fontWeight: 1000 }}>
              {itemCount} item{itemCount === 1 ? "" : "s"} • Payable <b>{money(payable)}</b>
            </div>
            <button
              onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" })}
              style={btnSmallPrimary}
            >
              Checkout →
            </button>
          </div>
        ) : null}
      </div>
    </main>
  );
}
