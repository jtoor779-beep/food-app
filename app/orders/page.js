"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import supabase from "@/lib/supabase";
import { fetchReviewsByOrderIds, isReviewableStatus } from "@/lib/reviews";

// ✅ SSR-safe dynamic import (leaflet must run client-side only)
const CustomerTrackingMap = dynamic(() => import("@/components/CustomerTrackingMap.jsx"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        height: 320,
        borderRadius: 16,
        border: "1px solid rgba(0,0,0,0.12)",
        background: "rgba(255,255,255,0.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 900,
        color: "rgba(17,24,39,0.7)",
      }}
    >
      Loading map…
    </div>
  ),
});

function normalizeRole(r) {
  return String(r || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

/* =========================================================
   ✅ CURRENCY SUPPORT (DB + localStorage, SAFE)
   - Source of truth: public.system_settings.default_currency
   - We keep localStorage "foodapp_currency" for speed,
     but ALWAYS sync it from DB on page load.
   ========================================================= */

const DEFAULT_CURRENCY = "INR";

function normalizeCurrency(c) {
  const v = String(c || "").trim().toUpperCase();
  if (v === "USD") return "USD";
  if (v === "INR") return "INR";
  return DEFAULT_CURRENCY;
}

function money(v, currency = DEFAULT_CURRENCY) {
  const n = Number(v || 0);
  const cur = normalizeCurrency(currency);

  if (!isFinite(n)) {
    return cur === "USD" ? "$0.00" : "₹0";
  }

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
  return isFinite(n) ? n : fallback;
}

function isMissingColumnError(msg) {
  const m = String(msg || "").toLowerCase();
  return m.includes("column") && m.includes("does not exist");
}

function safeItemImage(src) {
  const s = String(src || "").trim();
  if (!s) return "";
  if (s.startsWith("http://") || s.startsWith("https://") || s.startsWith("/")) return s;
  return s.startsWith("uploads/") ? `/${s}` : s;
}

const itemThumbWrap = {
  width: 52,
  height: 52,
  borderRadius: 14,
  overflow: "hidden",
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.9)",
  flex: "0 0 auto",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const itemThumbImg = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
};

const itemThumbPh = {
  fontWeight: 1000,
  color: "rgba(17,24,39,0.55)",
  fontSize: 12,
};

function ItemThumb({ src, name }) {
  const [broken, setBroken] = useState(false);
  const safeSrc = safeItemImage(src);
  if (!safeSrc || broken) {
    return (
      <div style={itemThumbWrap} aria-label="No image">
        <div style={itemThumbPh}>{String(name || "Item").trim().charAt(0).toUpperCase() || "I"}</div>
      </div>
    );
  }
  return (
    <div style={itemThumbWrap}>
      <img
        src={safeSrc}
        alt={String(name || "Item")}
        style={itemThumbImg}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
      />
    </div>
  );
}

async function loadMenuItemImagesSafe(menuItemIds) {
  const ids = Array.isArray(menuItemIds) ? Array.from(new Set(menuItemIds.filter(Boolean))) : [];
  if (ids.length === 0) return {};

  const selects = [
    "id, image_url",
    "id, image",
    "id, photo_url",
    "id, photo",
    "id, item_image",
    "id, product_image",
    "id, thumbnail_url",
    "id",
  ];

  for (const sel of selects) {
    try {
      const { data, error } = await supabase.from("menu_items").select(sel).in("id", ids);
      if (!error) {
        const map = {};
        for (const row of data || []) {
          map[row.id] =
            row?.image_url ||
            row?.image ||
            row?.photo_url ||
            row?.photo ||
            row?.item_image ||
            row?.product_image ||
            row?.thumbnail_url ||
            "";
        }
        return map;
      }
    } catch {
      // ignore and try next
    }
  }

  return {};
}

/**
 * ✅ Read currency from DB (system_settings)
 * We support multiple schemas:
 * - column: default_currency
 * - JSON: value_json.default_currency
 * - optional key-based row ("global"), but also works if you store just 1 row
 */
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

    // Prefer "global" row if exists, else latest row
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

function formatTime(ts) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts || "");
  }
}

function initials(name) {
  const s = String(name || "").trim();
  if (!s) return "DP";
  const parts = s.split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] || "";
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] : "";
  return (a + b).toUpperCase() || "DP";
}

/* =========================================================
   ✅ NEW: Clean "Instructions" display (UI only)
   Removes: deliveryFee/tax/pay/platform/currency/etc junk
   Keeps customer’s real note like: "give in hand..."
   ========================================================= */
function cleanCustomerInstructions(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";

  const keywords = [
    "deliveryfee",
    "delivery_fee",
    "platform%",
    "platformfee",
    "platform_fee",
    "taxnote",
    "tax_note",
    "tax:",
    "gst",
    "currency",
    "pay:",
    "payment",
  ];

  let out = s;

  // 1) Remove any parentheses chunk that contains those keywords
  out = out.replace(/\(([^)]*)\)/g, (full, inner) => {
    const low = String(inner || "").toLowerCase();
    if (keywords.some((k) => low.includes(k))) return "";
    return full;
  });

  // 2) If it’s pipe-separated without parentheses, cut before the junk
  const lowAll = out.toLowerCase();
  const hitIndex = lowAll.search(/\b(deliveryfee|platform%|platformfee|taxnote|tax:|currency|pay:)\b/);
  if (hitIndex > 0) {
    const lastPipeBefore = out.lastIndexOf("|", hitIndex);
    out = (lastPipeBefore >= 0 ? out.slice(0, lastPipeBefore) : out.slice(0, hitIndex)).trim();
  }

  // 3) Cleanup leftovers
  out = out
    .replace(/\s+\|\s*$/g, "")
    .replace(/\|\s*\|/g, "|")
    .replace(/\s{2,}/g, " ")
    .replace(/\(\s*$/g, "")
    .trim();

  return out;
}

/* =========================
   PREMIUM THEME
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
  fontWeight: 950,
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

const subText = {
  marginTop: 8,
  color: "rgba(17,24,39,0.7)",
  fontWeight: 800,
};

const cardGlass = {
  borderRadius: 18,
  padding: 14,
  background: "rgba(255,255,255,0.78)",
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 12px 36px rgba(0,0,0,0.08)",
  backdropFilter: "blur(10px)",
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
  fontWeight: 900,
  color: "rgba(17,24,39,0.65)",
};

const alertErr = {
  marginTop: 12,
  padding: 12,
  border: "1px solid #fecaca",
  background: "rgba(254,242,242,0.9)",
  borderRadius: 14,
  color: "#7f1d1d",
  fontWeight: 900,
};

const emptyBox = {
  marginTop: 14,
  padding: 14,
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.75)",
  color: "rgba(17,24,39,0.72)",
  fontWeight: 850,
};

const row = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  flexWrap: "wrap",
  alignItems: "center",
};

// ✅ bill box for coupon summary
const billBox = {
  marginTop: 12,
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.80)",
  padding: 12,
};

const billLine = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  fontWeight: 900,
  color: "rgba(17,24,39,0.72)",
  fontSize: 13,
  padding: "6px 0",
  borderBottom: "1px dashed rgba(0,0,0,0.08)",
};

const billTotal = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  fontWeight: 1000,
  color: "#0b1220",
  fontSize: 15,
  paddingTop: 10,
};

function statusBadge(status) {
  const s = String(status || "").toLowerCase();

  // red
  if (s === "rejected" || s === "cancelled") {
    return {
      background: "rgba(254,242,242,0.9)",
      border: "1px solid rgba(239,68,68,0.25)",
      color: "#7f1d1d",
    };
  }

  // green
  if (s === "ready" || s === "delivered") {
    return {
      background: "rgba(236,253,245,0.9)",
      border: "1px solid rgba(16,185,129,0.25)",
      color: "#065f46",
    };
  }

  // blue (delivery in progress)
  if (s === "delivering" || s === "picked_up" || s === "on_the_way") {
    return {
      background: "rgba(239,246,255,0.95)",
      border: "1px solid rgba(59,130,246,0.22)",
      color: "#1e40af",
    };
  }

  // pending/default
  return {
    background: "rgba(255,247,237,0.95)",
    border: "1px solid rgba(249,115,22,0.20)",
    color: "#9a3412",
  };
}

/* =========================
   CUSTOMER LIVE STATUS MESSAGE (Restaurant)
   ========================= */

function renderStars(rating) {
  const value = Math.max(1, Math.min(5, Math.round(Number(rating || 0))));
  return `${"*".repeat(value)}${"-".repeat(5 - value)}`;
}

function friendlyStatus(status) {
  const s = String(status || "").toLowerCase();
  if (s === "pending") return "Pending";
  if (s === "accepted" || s === "confirmed") return "Confirmed";
  if (s === "preparing") return "Preparing";
  if (s === "ready") return "Ready";
  if (s === "delivering") return "Out for delivery";
  if (s === "picked_up") return "Picked up";
  if (s === "on_the_way") return "On the way";
  if (s === "delivered") return "Delivered";
  if (s === "rejected" || s === "cancelled") return "Rejected";
  return s ? s : "Pending";
}

function statusMessage(status, deliveryPartnerName) {
  const s = String(status || "").toLowerCase();
  const dp = (deliveryPartnerName || "").trim();

  if (s === "rejected" || s === "cancelled") {
    return {
      title: "Order cancelled ❌",
      text: "This order was cancelled/rejected. If you already paid, please contact support.",
      tone: "danger",
    };
  }

  if (s === "delivered") {
    return {
      title: "Delivered successfully ✅",
      text: "Enjoy your meal! Thank you for ordering.",
      tone: "success",
    };
  }

  if (s === "on_the_way") {
    return {
      title: "Your order is on the way 🚚",
      text: dp
        ? `${dp} is bringing your food. Please keep your phone nearby.`
        : "Your delivery partner is bringing your food. Please keep your phone nearby.",
      tone: "info",
    };
  }

  if (s === "picked_up") {
    return {
      title: "Picked up 🛵",
      text: dp ? `${dp} picked up your order from the restaurant.` : "Your delivery partner picked up your order from the restaurant.",
      tone: "info",
    };
  }

  if (s === "delivering") {
    return {
      title: "Out for delivery 🚀",
      text: dp ? `${dp} accepted your order and is heading to you.` : "A delivery partner accepted your order and is heading to you.",
      tone: "info",
    };
  }

  if (s === "ready") {
    return {
      title: "Order is ready ✅",
      text: "Restaurant marked your order as ready. Finding delivery partner now…",
      tone: "successSoft",
    };
  }

  if (s === "preparing" || s === "accepted" || s === "confirmed") {
    return {
      title: "Restaurant is preparing 🍳",
      text: "Your food is being prepared. We will notify you when it’s ready.",
      tone: "infoSoft",
    };
  }

  // pending / default
  return {
    title: "Order placed 🧾",
    text: "We received your order. Restaurant will start preparing soon.",
    tone: "warnSoft",
  };
}

function messageBoxStyle(tone) {
  if (tone === "danger") {
    return {
      background: "rgba(254,242,242,0.92)",
      border: "1px solid rgba(239,68,68,0.25)",
      color: "#7f1d1d",
    };
  }
  if (tone === "success") {
    return {
      background: "rgba(236,253,245,0.92)",
      border: "1px solid rgba(16,185,129,0.22)",
      color: "#065f46",
    };
  }
  if (tone === "successSoft") {
    return {
      background: "rgba(236,253,245,0.82)",
      border: "1px solid rgba(16,185,129,0.18)",
      color: "rgba(6,95,70,0.95)",
    };
  }
  if (tone === "info" || tone === "infoSoft") {
    return {
      background: "rgba(239,246,255,0.92)",
      border: "1px solid rgba(59,130,246,0.20)",
      color: "#1e40af",
    };
  }
  // warnSoft default
  return {
    background: "rgba(255,247,237,0.92)",
    border: "1px solid rgba(249,115,22,0.18)",
    color: "#9a3412",
  };
}

function StatusMessageCard({ status, deliveryPartnerName }) {
  const m = statusMessage(status, deliveryPartnerName);
  const st = messageBoxStyle(m.tone);

  return (
    <div
      style={{
        marginTop: 10,
        borderRadius: 16,
        padding: 12,
        ...st,
        boxShadow: "0 10px 28px rgba(0,0,0,0.06)",
      }}
    >
      <div style={{ fontWeight: 1000, letterSpacing: -0.1 }}>{m.title}</div>
      <div style={{ marginTop: 6, fontWeight: 850, opacity: 0.9, fontSize: 13, lineHeight: 1.45 }}>{m.text}</div>
    </div>
  );
}

/* =========================
   Delivery Partner Card
   ========================= */

function DeliveryPerson({ dp }) {
  if (!dp) return null;

  const avatar = dp.avatar_url || dp.photo_url || dp.profile_photo || dp.image_url || "";
  const name = dp.full_name || dp.name || "Delivery Partner";
  const phone = dp.phone || dp.mobile || "";

  return (
    <div
      style={{
        marginTop: 10,
        borderRadius: 16,
        border: "1px solid rgba(0,0,0,0.08)",
        background: "rgba(255,255,255,0.85)",
        padding: 12,
        display: "flex",
        gap: 12,
        alignItems: "center",
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 999,
          border: "1px solid rgba(0,0,0,0.10)",
          background: "rgba(17,24,39,0.06)",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 1000,
          color: "rgba(17,24,39,0.85)",
          flexShrink: 0,
        }}
        title={name}
      >
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          initials(name)
        )}
      </div>

      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 1000, color: "#0b1220" }}>{name}</div>
        <div style={{ marginTop: 4, color: "rgba(17,24,39,0.68)", fontWeight: 850, fontSize: 13 }}>
          Assigned delivery partner{phone ? ` • ${phone}` : ""}
        </div>
      </div>
    </div>
  );
}

/* =========================
   MAP HELPERS (SAFE + COMPAT)
   ========================= */

function num(v) {
  const n = Number(v);
  return isFinite(n) ? n : null;
}

function pickLatLng(obj) {
  if (!obj) return null;

  const candidates = [
    ["lat", "lng"],
    ["latitude", "longitude"],
    ["location_lat", "location_lng"],
    ["pickup_lat", "pickup_lng"],
    ["restaurant_lat", "restaurant_lng"],
    ["customer_lat", "customer_lng"],
    ["drop_lat", "drop_lng"],
  ];

  for (const [a, b] of candidates) {
    const la = num(obj?.[a]);
    const lo = num(obj?.[b]);
    if (la !== null && lo !== null) return { lat: la, lng: lo };
  }

  return null;
}

/* =========================
   LIVE GPS (Customer)
   ========================= */

function isActiveDeliveryStatus(status) {
  const s = String(status || "").toLowerCase();
  return s === "delivering" || s === "picked_up" || s === "on_the_way";
}

/* =========================
   STATUS STEPS (UI)
   ========================= */

function statusStepInfo(status) {
  const s = String(status || "").toLowerCase();

  if (s === "rejected" || s === "cancelled") {
    return { mode: "cancelled", currentIndex: 0 };
  }

  if (s === "delivered") return { mode: "normal", currentIndex: 3 };
  if (s === "on_the_way" || s === "picked_up" || s === "delivering") return { mode: "normal", currentIndex: 2 };
  if (s === "ready" || s === "preparing" || s === "accepted" || s === "confirmed") return { mode: "normal", currentIndex: 1 };
  return { mode: "normal", currentIndex: 0 };
}

function StatusSteps({ status }) {
  const { mode, currentIndex } = statusStepInfo(status);

  if (mode === "cancelled") {
    return (
      <div style={{ marginTop: 10, borderRadius: 14, padding: 12, border: "1px solid rgba(239,68,68,0.25)", background: "rgba(254,242,242,0.90)" }}>
        <div style={{ fontWeight: 1000, color: "#7f1d1d" }}>Order Cancelled</div>
        <div style={{ marginTop: 6, fontWeight: 850, color: "rgba(127,29,29,0.85)", fontSize: 13 }}>
          This order was cancelled/rejected.
        </div>
      </div>
    );
  }

  const steps = ["Placed", "Preparing", "On the way", "Delivered"];

  return (
    <div style={stepsWrap}>
      {steps.map((t, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        return (
          <div key={t} style={stepItem}>
            <div style={{ ...stepDot, ...(done ? stepDotDone : active ? stepDotActive : stepDotTodo) }}>{done ? "✓" : i + 1}</div>
            <div style={{ ...stepLabel, opacity: done || active ? 1 : 0.65 }}>{t}</div>
            {i !== steps.length - 1 ? <div style={{ ...stepLine, ...(done ? stepLineDone : stepLineTodo) }} /> : null}
          </div>
        );
      })}
    </div>
  );
}

/* =========================
   PAGE
   ========================= */

export default function OrdersPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState("");

  const [user, setUser] = useState(null);
  const [role, setRole] = useState("");
  const [orders, setOrders] = useState([]);

  // ✅ currency state (synced from DB like Home page)
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);

  // ✅ delivery profile map: { [delivery_user_id]: { full_name, avatar_url, phone } }
  const [deliveryProfiles, setDeliveryProfiles] = useState({});

  // ✅ restaurant coords map: { [restaurant_id]: { lat, lng } }
  const [restaurantCoords, setRestaurantCoords] = useState({});

  // ✅ live driver GPS per order: { [orderId]: { lat, lng, ts, source } }
  const [liveGpsByOrderId, setLiveGpsByOrderId] = useState({});

  const [lastRealtimeHit, setLastRealtimeHit] = useState("");
  const channelRef = useRef(null);

  const gpsPollRef = useRef(null);

  // ✅ NEW: open one order detail (clean list by default)
  const [openOrderId, setOpenOrderId] = useState(null);

  const [reviewByOrderId, setReviewByOrderId] = useState({});
  const [reviewModalOrder, setReviewModalOrder] = useState(null);
  const [reviewForm, setReviewForm] = useState({ rating: 5, title: "", comment: "" });
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewError, setReviewError] = useState("");

  const orderItemsByOrderId = useMemo(() => {
    const map = {};
    for (const o of orders) {
      map[o.id] = Array.isArray(o.order_items) ? o.order_items : [];
    }
    return map;
  }, [orders]);

  const totalOrders = useMemo(() => orders.length, [orders]);

  // ✅ prefer new total_amount column first
  const totalSpend = useMemo(() => {
    return (orders || []).reduce((sum, o) => {
      const fromNew = Number(o.total_amount || 0);
      if (fromNew > 0) return sum + fromNew;

      const fromDb = Number(o.total || 0);
      if (fromDb > 0) return sum + fromDb;

      const items = orderItemsByOrderId[o.id] || [];
      const calc = items.reduce((s, it) => s + Number(it.qty || 0) * Number(it.price_each || 0), 0);
      return sum + calc;
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, orderItemsByOrderId]);

  function calcOrderTotal(order) {
    const fromNew = Number(order.total_amount || 0);
    if (fromNew > 0) return fromNew;

    const items = orderItemsByOrderId[order.id] || [];
    const fromDb = Number(order.total || 0);
    if (fromDb > 0) return fromDb;

    return items.reduce((sum, it) => sum + Number(it.qty || 0) * Number(it.price_each || 0), 0);
  }

  function calcOrderSubtotal(order) {
    const fromCol = Number(order.subtotal_amount || 0);
    if (fromCol > 0) return fromCol;

    const items = orderItemsByOrderId[order.id] || [];
    return items.reduce((s, it) => s + Number(it.qty || 0) * Number(it.price_each || 0), 0);
  }

  function calcPlatformFee(order) {
    return Math.max(0, safeNum(order?.commission_amount, 0));
  }
  function calcDeliveryFee(order) {
    return Math.max(0, safeNum(order?.delivery_fee, 0));
  }
  function calcGst(order) {
    return Math.max(0, safeNum(order?.gst_amount, 0));
  }
  function calcTip(order) {
    return Math.max(0, safeNum(order?.tip_amount, 0));
  }

  async function loadDeliveryProfilesFromOrders(ordersList) {
    try {
      const ids = Array.from(new Set((ordersList || []).map((o) => o.delivery_user_id).filter(Boolean)));
      if (ids.length === 0) {
        setDeliveryProfiles({});
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, phone, avatar_url, photo_url, profile_photo, image_url")
        .in("user_id", ids);

      if (error) throw error;

      const map = {};
      for (const p of data || []) map[p.user_id] = p;
      setDeliveryProfiles(map);
    } catch {
      setDeliveryProfiles({});
    }
  }

  async function loadOwnReviews(userId, ordersList) {
    const reviewableOrderIds = (ordersList || [])
      .filter((order) => isReviewableStatus(order?.status) && order?.restaurant_id)
      .map((order) => order.id)
      .filter(Boolean);

    if (!userId || !reviewableOrderIds.length) {
      setReviewByOrderId({});
      return;
    }

    try {
      const rows = await fetchReviewsByOrderIds(supabase, { userId, orderIds: reviewableOrderIds });
      const map = {};
      for (const row of rows || []) {
        if (row?.order_id) map[row.order_id] = row;
      }
      setReviewByOrderId(map);
    } catch {
      setReviewByOrderId({});
    }
  }

  function openReviewModal(order) {
    const existing = reviewByOrderId?.[order?.id] || null;
    setReviewError("");
    setReviewModalOrder(order);
    setReviewForm({
      rating: Number(existing?.rating || 5) || 5,
      title: String(existing?.title || ""),
      comment: String(existing?.comment || ""),
    });
  }

  function closeReviewModal() {
    if (reviewSaving) return;
    setReviewModalOrder(null);
    setReviewError("");
  }

  async function saveReview() {
    if (!user?.id || !reviewModalOrder?.id || !reviewModalOrder?.restaurant_id) return;
    const rating = Math.max(1, Math.min(5, Number(reviewForm.rating || 0) || 0));
    if (!rating) {
      setReviewError("Please choose a rating.");
      return;
    }

    setReviewSaving(true);
    setReviewError("");

    const payload = {
      user_id: user.id,
      order_id: reviewModalOrder.id,
      target_type: "restaurant",
      target_id: reviewModalOrder.restaurant_id,
      rating,
      title: String(reviewForm.title || "").trim() || null,
      comment: String(reviewForm.comment || "").trim() || null,
      is_visible: true,
    };

    try {
      const existing = reviewByOrderId?.[reviewModalOrder.id];
      if (existing?.id) {
        const { error } = await supabase.from("reviews").update(payload).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("reviews").insert(payload);
        if (error) throw error;
      }
      await loadOwnReviews(user.id, orders);
      setReviewModalOrder(null);
    } catch (e) {
      setReviewError(e?.message || String(e));
    } finally {
      setReviewSaving(false);
    }
  }

  async function loadRestaurantCoordsFromOrders(ordersList) {
    try {
      const ids = Array.from(new Set((ordersList || []).map((o) => o.restaurant_id).filter(Boolean)));
      if (ids.length === 0) {
        setRestaurantCoords({});
        return;
      }

      const tries = ["id, lat, lng", "id, latitude, longitude", "id, location_lat, location_lng"];

      let rows = null;
      for (const sel of tries) {
        const { data, error } = await supabase.from("restaurants").select(sel).in("id", ids);
        if (!error) {
          rows = data || [];
          break;
        }
      }

      const map = {};
      for (const r of rows || []) {
        const ll = pickLatLng(r);
        if (ll) map[r.id] = ll;
      }
      setRestaurantCoords(map);
    } catch {
      setRestaurantCoords({});
    }
  }

  // ✅ column-safe order loader: tries fee columns first, falls back if DB doesn't have them
  async function loadOrders(currentUserId) {
    const selects = [
      `
        id,
        user_id,
        restaurant_id,
        status,
        total,
        subtotal_amount,
        discount_amount,
        total_amount,
        coupon_code,
        created_at,
        customer_name,
        phone,
        address_line1,
        address_line2,
        landmark,
        instructions,
        delivery_user_id,
        stripe_session_id,
        payment_method,
        currency,
        delivery_fee,
        gst_amount,
        tip_amount,
        commission_amount,
        order_items (
          id,
          qty,
          price_each,
          menu_item_id,
          menu_items ( id, name, price )
        )
      `,
      `
        id,
        user_id,
        restaurant_id,
        status,
        total,
        subtotal_amount,
        discount_amount,
        total_amount,
        coupon_code,
        created_at,
        customer_name,
        phone,
        address_line1,
        address_line2,
        landmark,
        instructions,
        delivery_user_id,
        order_items (
          id,
          qty,
          price_each,
          menu_item_id,
          menu_items ( id, name, price )
        )
      `,
    ];

    let lastErr = null;

    for (const sel of selects) {
      const { data, error } = await supabase
        .from("orders")
        .select(sel)
        .eq("user_id", currentUserId)
        .order("created_at", { ascending: false });

      if (!error) {
        let list = Array.isArray(data) ? data : [];

        const menuItemIds = list
          .flatMap((o) => (Array.isArray(o?.order_items) ? o.order_items : []))
          .map((it) => it?.menu_item_id)
          .filter(Boolean);

        const imageMap = await loadMenuItemImagesSafe(menuItemIds);

        list = list.map((o) => ({
          ...o,
          order_items: (Array.isArray(o?.order_items) ? o.order_items : []).map((it) => ({
            ...it,
            menu_items: {
              ...(it?.menu_items || {}),
              image_url:
                it?.menu_items?.image_url ||
                it?.menu_items?.image ||
                it?.menu_items?.photo_url ||
                it?.menu_items?.photo ||
                it?.menu_items?.item_image ||
                it?.menu_items?.product_image ||
                imageMap[it?.menu_item_id] ||
                "",
            },
          })),
        }));

        setOrders(list);
        return list;

        await loadDeliveryProfilesFromOrders(list);
        await loadRestaurantCoordsFromOrders(list);

        // ✅ If currently open order is gone (rare), close it safely
        if (openOrderId && !list.find((x) => x.id === openOrderId)) {
          setOpenOrderId(null);
        }
        return;
      }

      lastErr = error;
      const msg = error?.message || String(error);
      if (isMissingColumnError(msg)) continue;
      throw error;
    }

    throw lastErr;
  }

  function cleanupRealtime() {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }

  async function setupRealtime(userId) {
    cleanupRealtime();

    channelRef.current = supabase
      .channel(`realtime-customer-orders-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `user_id=eq.${userId}` }, async () => {
        setLastRealtimeHit(new Date().toLocaleTimeString());
        const list = await loadOrders(userId);
        await loadOwnReviews(userId, list);
      })
      .subscribe();
  }

  async function fetchLatestGpsForOrder(orderId) {
    if (!orderId) return null;

    try {
      const { data, error } = await supabase
        .from("delivery_latest_location")
        .select("order_id, lat, lng, created_at")
        .eq("order_id", orderId)
        .maybeSingle();

      if (!error && data?.lat != null && data?.lng != null) {
        return {
          lat: Number(data.lat),
          lng: Number(data.lng),
          ts: data.created_at,
          source: "view",
        };
      }
    } catch {}

    try {
      const { data, error } = await supabase
        .from("delivery_events")
        .select("lat,lng,created_at,event_type")
        .eq("order_id", orderId)
        .in("event_type", ["gps", "gps_test"])
        .not("lat", "is", null)
        .not("lng", "is", null)
        .order("created_at", { ascending: false })
        .limit(1);

      if (error) return null;
      const row = Array.isArray(data) ? data[0] : null;
      if (!row?.lat || !row?.lng) return null;

      return {
        lat: Number(row.lat),
        lng: Number(row.lng),
        ts: row.created_at,
        source: "events",
      };
    } catch {
      return null;
    }
  }

  function stopGpsPolling() {
    if (gpsPollRef.current) {
      clearInterval(gpsPollRef.current);
      gpsPollRef.current = null;
    }
  }

  function startGpsPolling(activeOrders) {
    stopGpsPolling();

    const active = (activeOrders || []).filter((o) => isActiveDeliveryStatus(o.status) && o.delivery_user_id);
    if (active.length === 0) return;

    const tick = async () => {
      try {
        for (const o of active) {
          const loc = await fetchLatestGpsForOrder(o.id);
          if (!loc) continue;

          setLiveGpsByOrderId((m) => {
            const prev = m[o.id];
            const same =
              prev &&
              String(prev.ts || "") === String(loc.ts || "") &&
              Number(prev.lat) === Number(loc.lat) &&
              Number(prev.lng) === Number(loc.lng);

            if (same) return m;
            return { ...(m || {}), [o.id]: loc };
          });
        }
      } catch {}
    };

    tick();
    gpsPollRef.current = setInterval(tick, 5000);
  }

  async function init() {
    setLoading(true);
    setErrMsg("");

    try {
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

      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;

      const u = userData?.user;
      if (!u) {
        router.push("/login");
        return;
      }

      setUser(u);

      const { data: prof, error: profErr } = await supabase.from("profiles").select("role").eq("user_id", u.id).maybeSingle();
      if (profErr) throw profErr;

      const r = normalizeRole(prof?.role);
      setRole(r);

      if (r === "restaurant_owner") {
        router.push("/restaurants/orders");
        return;
      }
      if (r === "grocery_owner") {
        router.push("/groceries/owner/orders");
        return;
      }
      if (r === "delivery_partner") {
        router.push("/delivery");
        return;
      }

      const loadedOrders = await loadOrders(u.id);
      await loadOwnReviews(u.id, loadedOrders);
      await setupRealtime(u.id);
    } catch (e) {
      setErrMsg(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    init();
    return () => {
      cleanupRealtime();
      stopGpsPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user) return;
    startGpsPolling(orders);
    return () => stopGpsPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, user]);

  const openOrder = useMemo(() => {
    if (!openOrderId) return null;
    return (orders || []).find((x) => x.id === openOrderId) || null;
  }, [orders, openOrderId]);

  return (
    <main style={pageBg}>
      <div style={{ width: "100%", margin: 0 }}>
        {/* HERO */}
        <div style={heroGlass}>
          <div style={{ minWidth: 260 }}>
            <div style={pill}>Customer • Restaurant</div>
            <h1 style={heroTitle}>Restaurant Orders</h1>
            <div style={subText}>Track your restaurant orders & status updates (Realtime)</div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div style={statCard}>
              <div style={statNum}>{totalOrders}</div>
              <div style={statLabel}>Total Orders</div>
            </div>

            <div style={statCard}>
              <div style={statNum}>{money(totalSpend, currency)}</div>
              <div style={statLabel}>Total Spend</div>
            </div>

            <span style={pill}>Currency: {currency}</span>

            <Link href="/restaurants" style={pill}>
              ← Restaurants
            </Link>

            <Link href="/groceries/orders" style={pill}>
              Grocery Orders →
            </Link>
          </div>
        </div>

        {errMsg ? <div style={alertErr}>{errMsg}</div> : null}

        {user ? (
          <div style={{ ...cardGlass, marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontWeight: 1000, color: "#0b1220" }}>Account</div>
                <div style={{ marginTop: 6, color: "rgba(17,24,39,0.72)", fontWeight: 850 }}>
                  <b>Email:</b> {user.email}
                </div>
                <div style={{ marginTop: 4, color: "rgba(17,24,39,0.72)", fontWeight: 850 }}>
                  <b>Role:</b> {role}
                </div>
              </div>

              <div style={{ minWidth: 220 }}>
                <div style={{ fontWeight: 1000, color: "#0b1220" }}>Realtime</div>
                <div style={{ marginTop: 6, color: "rgba(6,95,70,0.95)", fontWeight: 950 }}>
                  ON {lastRealtimeHit ? `(last event: ${lastRealtimeHit})` : ""}
                </div>
                <div style={{ marginTop: 6, color: "rgba(17,24,39,0.65)", fontWeight: 800, fontSize: 12 }}>
                  Status changes will update automatically.
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {loading ? <div style={{ marginTop: 14, color: "rgba(17,24,39,0.7)", fontWeight: 900 }}>Loading…</div> : null}

        {!loading && orders.length === 0 ? (
          <div style={emptyBox}>
            No restaurant orders yet.{" "}
            <Link href="/restaurants" style={{ color: "#111827", fontWeight: 1000 }}>
              Browse restaurants →
            </Link>{" "}
            <span style={{ opacity: 0.7 }}>or</span>{" "}
            <Link href="/groceries" style={{ color: "#111827", fontWeight: 1000 }}>
              browse groceries →
            </Link>
          </div>
        ) : null}

        {/* =========================
            CLEAN LIST VIEW
           ========================= */}
        {!loading && orders.length > 0 && !openOrder ? (
          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
            {orders.map((o) => {
              const items = orderItemsByOrderId[o.id] || [];
              const total = calcOrderTotal(o);
              const badge = statusBadge(o.status);

              const firstItemName = items?.[0]?.menu_items?.name || items?.[0]?.name || "Items";
              const itemsCount = items.reduce((s, it) => s + Number(it.qty || 0), 0);

              return (
                <div key={o.id} style={listCard} onClick={() => setOpenOrderId(o.id)} title="Click to view details">
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <span
                        style={{
                          padding: "6px 10px",
                          borderRadius: 999,
                          fontWeight: 1000,
                          fontSize: 12,
                          ...badge,
                        }}
                      >
                        {friendlyStatus(o.status).toUpperCase()}
                      </span>

                      <div style={{ fontWeight: 1000, color: "#0b1220" }}>
                        Order • <span style={{ opacity: 0.7 }}>{String(o.id).slice(0, 8)}…</span>
                      </div>

                      <div style={{ color: "rgba(17,24,39,0.65)", fontWeight: 900, fontSize: 12 }}>{formatTime(o.created_at)}</div>
                    </div>

                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <div style={{ fontWeight: 1000, color: "#0b1220" }}>{money(total, currency)}</div>

                      <Link
                        href={`/orders/invoice?id=${encodeURIComponent(String(o.id))}`}
                        onClick={(e) => e.stopPropagation()}
                        style={btnInvoiceLink}
                        title="View invoice"
                      >
                        Invoice
                      </Link>

                      {isReviewableStatus(o.status) ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openReviewModal(o);
                          }}
                          style={btnReview}
                        >
                          {reviewByOrderId?.[o.id] ? `Edit Review (${renderStars(reviewByOrderId[o.id].rating)})` : "Write Review"}
                        </button>
                      ) : null}

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenOrderId(o.id);
                        }}
                        style={btnView}
                      >
                        View details →
                      </button>
                    </div>
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <StatusSteps status={o.status} />
                  </div>

                  <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <div style={{ color: "rgba(17,24,39,0.72)", fontWeight: 900 }}>
                      {firstItemName}
                      {itemsCount > 1 ? (
                        <span style={{ marginLeft: 8, color: "rgba(17,24,39,0.55)", fontWeight: 900, fontSize: 12 }}>
                          + {itemsCount - 1} more
                        </span>
                      ) : null}
                    </div>
                    <div style={{ color: "rgba(17,24,39,0.55)", fontWeight: 850, fontSize: 12 }}>Click to open full tracking + items</div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {/* =========================
            DETAIL VIEW (ONLY ONE ORDER)
           ========================= */}
        {!loading && orders.length > 0 && openOrder ? (
          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
            {(() => {
              const o = openOrder;
              const items = orderItemsByOrderId[o.id] || [];
              const total = calcOrderTotal(o);
              const subtotalAmt = calcOrderSubtotal(o);
              const discountAmt = Math.max(0, Number(o.discount_amount || 0));
              const code = String(o.coupon_code || "").trim();
              const badge = statusBadge(o.status);

              // ✅ keep these for old logic / safety (even if UI not showing breakdown)
              const platformFee = calcPlatformFee(o);
              const deliveryFee = calcDeliveryFee(o);
              const gst = calcGst(o);
              const tip = calcTip(o);

              const dp = o.delivery_user_id ? deliveryProfiles[o.delivery_user_id] : null;
              const dpName = dp?.full_name || dp?.name || "";

              const pickup = restaurantCoords[o.restaurant_id] || null;
              const drop = pickLatLng(o) || null;

              const live = liveGpsByOrderId[o.id] || null;
              const liveOk = live?.lat != null && live?.lng != null && isActiveDeliveryStatus(o.status);

              const liveLabel = !isActiveDeliveryStatus(o.status)
                ? "Live GPS available during delivery"
                : liveOk
                ? `Live GPS connected ✅ (updated: ${formatTime(live.ts)})`
                : "Waiting for driver GPS…";

              const hasAnyMapPoint = !!pickup || !!drop || (liveOk && live);

              // ✅ clean the displayed instructions (UI only)
              const instructionsClean = cleanCustomerInstructions(o.instructions);

              return (
                <div style={cardGlass}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <button onClick={() => setOpenOrderId(null)} style={btnBack}>
                      ← Back to all orders
                    </button>

                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <span
                        style={{
                          padding: "6px 10px",
                          borderRadius: 999,
                          fontWeight: 1000,
                          fontSize: 12,
                          ...badge,
                        }}
                      >
                        {friendlyStatus(o.status).toUpperCase()}
                      </span>
                      <div style={{ color: "rgba(17,24,39,0.65)", fontWeight: 900, fontSize: 12 }}>{formatTime(o.created_at)}</div>
                      <div style={{ color: "rgba(17,24,39,0.65)", fontWeight: 900, fontSize: 12 }}>
                        Order ID: <span style={{ color: "#0b1220" }}>{o.id}</span>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                      <div style={{ fontWeight: 1000, color: "#0b1220" }}>Total: {money(total, currency)}</div>

                      <Link href={`/orders/invoice?id=${encodeURIComponent(String(o.id))}`} style={btnInvoiceLink} title="Open invoice">
                        View Invoice
                      </Link>

                      <button
                        onClick={() => window.open(`/orders/invoice?id=${encodeURIComponent(String(o.id))}&print=1`, "_blank")}
                        style={btnInvoicePrint}
                        title="Open invoice and print"
                      >
                        Print Invoice
                      </button>

                      {isReviewableStatus(o.status) ? (
                        <button onClick={() => openReviewModal(o)} style={btnReview}>
                          {reviewByOrderId?.[o.id] ? `Edit Review (${renderStars(reviewByOrderId[o.id].rating)})` : "Write Review"}
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <StatusSteps status={o.status} />
                  </div>

                  <StatusMessageCard status={o.status} deliveryPartnerName={dpName} />

                  {reviewByOrderId?.[o.id] ? (
                    <div style={reviewInfoBox}>
                      <div style={{ fontWeight: 1000, color: "#0b1220" }}>Your Review</div>
                      <div style={{ marginTop: 6, fontWeight: 900, color: "rgba(17,24,39,0.78)" }}>{renderStars(reviewByOrderId[o.id].rating)}</div>
                      {reviewByOrderId[o.id].title ? <div style={{ marginTop: 6, fontWeight: 900, color: "#0b1220" }}>{reviewByOrderId[o.id].title}</div> : null}
                      {reviewByOrderId[o.id].comment ? <div style={{ marginTop: 6, color: "rgba(17,24,39,0.72)", lineHeight: 1.45 }}>{reviewByOrderId[o.id].comment}</div> : null}
                    </div>
                  ) : null}

                  <div style={billBox}>
                    <div style={{ fontWeight: 1000, color: "#0b1220" }}>Total</div>

                    <div style={billTotal}>
                      <span>Total Payable</span>
                      <span>{money(total, currency)}</span>
                    </div>

                    <span style={{ display: "none" }}>
                      {subtotalAmt}-{discountAmt}-{code}-{platformFee}-{deliveryFee}-{gst}-{tip}
                    </span>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                      <div style={{ fontWeight: 1000, color: "#0b1220" }}>Live Tracking</div>
                      <div style={{ color: "rgba(17,24,39,0.65)", fontWeight: 850, fontSize: 12 }}>{liveLabel}</div>
                    </div>

                    <div style={{ marginTop: 10 }}>
                      {!hasAnyMapPoint ? (
                        <div
                          style={{
                            height: 320,
                            borderRadius: 16,
                            border: "1px solid rgba(0,0,0,0.12)",
                            background: "rgba(255,255,255,0.75)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: 900,
                            color: "rgba(17,24,39,0.7)",
                            textAlign: "center",
                            padding: 14,
                          }}
                        >
                          Location not available yet (pickup/drop not saved).
                          <br />
                          Tracking will appear when delivery starts.
                        </div>
                      ) : (
                        <CustomerTrackingMap
                          pickup={pickup}
                          drop={drop}
                          driver={liveOk ? { lat: live.lat, lng: live.lng } : null}
                          driverUpdatedAt={live?.ts || null}
                          status={o.status}
                          height={320}
                        />
                      )}
                    </div>

                    <div style={{ marginTop: 8, color: "rgba(17,24,39,0.65)", fontWeight: 800, fontSize: 12 }}>
                      {pickup ? (
                        <>
                          Pickup: {pickup?.lat?.toFixed?.(4)}, {pickup?.lng?.toFixed?.(4)}
                        </>
                      ) : (
                        <>Pickup: —</>
                      )}{" "}
                      •{" "}
                      {drop ? (
                        <>
                          Drop: {drop?.lat?.toFixed?.(4)}, {drop?.lng?.toFixed?.(4)}
                        </>
                      ) : (
                        <>Drop: —</>
                      )}
                      {liveOk ? (
                        <>
                          {" "}
                          • Driver: {Number(live.lat).toFixed(5)}, {Number(live.lng).toFixed(5)}
                        </>
                      ) : null}
                    </div>
                  </div>

                  {o.delivery_user_id ? <DeliveryPerson dp={dp || { full_name: "Delivery Partner" }} /> : null}

                  <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div
                      style={{
                        borderRadius: 16,
                        border: "1px solid rgba(0,0,0,0.08)",
                        background: "rgba(255,255,255,0.75)",
                        padding: 12,
                      }}
                    >
                      <div style={{ fontWeight: 1000, color: "#0b1220" }}>Delivery</div>

                      <div style={{ marginTop: 8, color: "rgba(17,24,39,0.72)", fontWeight: 850 }}>
                        <b>Name:</b> {o.customer_name || "—"}
                      </div>
                      <div style={{ marginTop: 4, color: "rgba(17,24,39,0.72)", fontWeight: 850 }}>
                        <b>Phone:</b> {o.phone || "—"}
                      </div>
                      <div style={{ marginTop: 4, color: "rgba(17,24,39,0.72)", fontWeight: 850 }}>
                        <b>Address:</b> {[o.address_line1, o.address_line2].filter(Boolean).join(", ") || "—"}
                      </div>
                      {o.landmark ? (
                        <div style={{ marginTop: 4, color: "rgba(17,24,39,0.72)", fontWeight: 850 }}>
                          <b>Landmark:</b> {o.landmark}
                        </div>
                      ) : null}
                      {o.instructions ? (
                        <div style={{ marginTop: 4, color: "rgba(17,24,39,0.72)", fontWeight: 850 }}>
                          <b>Instructions:</b> {instructionsClean || "—"}
                        </div>
                      ) : null}
                    </div>

                    <div
                      style={{
                        borderRadius: 16,
                        border: "1px solid rgba(0,0,0,0.08)",
                        background: "rgba(255,255,255,0.75)",
                        padding: 12,
                      }}
                    >
                      <div style={{ fontWeight: 1000, color: "#0b1220" }}>Items</div>

                      <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                        {items.map((it) => (
                          <div
                            key={it.id}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 10,
                              flexWrap: "wrap",
                              padding: "8px 10px",
                              borderRadius: 14,
                              border: "1px solid rgba(0,0,0,0.08)",
                              background: "rgba(255,255,255,0.85)",
                            }}
                          >
                            <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
                              <ItemThumb
                                src={
                                  it?.menu_items?.image_url ||
                                  it?.menu_items?.image ||
                                  it?.menu_items?.photo_url ||
                                  it?.menu_items?.photo ||
                                  it?.menu_items?.item_image ||
                                  it?.menu_items?.product_image ||
                                  ""
                                }
                                name={it?.menu_items?.name || "Item"}
                              />
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 950, color: "#0b1220" }}>{it.menu_items?.name || "Item"}</div>
                              </div>
                            </div>
                            <div style={{ color: "rgba(17,24,39,0.72)", fontWeight: 900 }}>
                              Qty {it.qty}
                              <span style={{ marginLeft: 10 }}>{money(Number(it.qty || 0) * Number(it.price_each || 0), currency)}</span>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div style={{ marginTop: 10, color: "rgba(17,24,39,0.65)", fontWeight: 850, fontSize: 12 }}>
                        Restaurant ID: <span style={{ color: "#0b1220" }}>{o.restaurant_id}</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <Link href="/restaurants" style={pill}>
                      Order again
                    </Link>
                    <Link href="/groceries/orders" style={pill}>
                      View grocery orders →
                    </Link>
                  </div>
                </div>
              );
            })()}
          </div>
        ) : null}
      </div>

      {reviewModalOrder ? (
        <div style={reviewModalBackdrop} onMouseDown={(e) => { if (e.target === e.currentTarget) closeReviewModal(); }}>
          <div style={reviewModalCard}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
              <div style={{ fontWeight: 1000, fontSize: 18, color: "#0b1220" }}>Rate your order</div>
              <button onClick={closeReviewModal} style={btnBack}>Close</button>
            </div>
            <div style={{ marginTop: 8, color: "rgba(17,24,39,0.7)", fontWeight: 800 }}>Order {String(reviewModalOrder.id).slice(0, 8)}?</div>
            <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  onClick={() => setReviewForm((prev) => ({ ...prev, rating: value }))}
                  style={Number(reviewForm.rating) === value ? reviewStarBtnActive : reviewStarBtn}
                >
                  {value} Star{value === 1 ? "" : "s"}
                </button>
              ))}
            </div>
            <input
              value={reviewForm.title}
              onChange={(e) => setReviewForm((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="Review title (optional)"
              style={{ ...inputBase, marginTop: 14, width: "100%" }}
            />
            <textarea
              value={reviewForm.comment}
              onChange={(e) => setReviewForm((prev) => ({ ...prev, comment: e.target.value }))}
              placeholder="Tell other customers about your experience"
              rows={5}
              style={{ ...inputBase, marginTop: 12, width: "100%", resize: "vertical", minHeight: 120 }}
            />
            {reviewError ? <div style={{ marginTop: 10, color: "#b42318", fontWeight: 900 }}>{reviewError}</div> : null}
            <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
              <button onClick={closeReviewModal} style={btnBack} disabled={reviewSaving}>Cancel</button>
              <button onClick={saveReview} style={btnReview} disabled={reviewSaving}>{reviewSaving ? "Saving..." : "Save Review"}</button>
            </div>
          </div>
        </div>
      ) : null}

    </main>
  );
}

/* =========================
   EXTRA STYLES (LIST + STEPS)
   ========================= */

const listCard = {
  ...cardGlass,
  cursor: "pointer",
  transition: "transform 120ms ease, box-shadow 120ms ease",
};

const btnView = {
  padding: "10px 12px",
  borderRadius: 14,
  border: "1px solid rgba(17,24,39,0.95)",
  background: "rgba(17,24,39,0.95)",
  color: "#fff",
  fontWeight: 950,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const btnBack = {
  padding: "10px 12px",
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.85)",
  color: "#111827",
  fontWeight: 950,
  cursor: "pointer",
};

const btnInvoiceLink = {
  padding: "10px 12px",
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.92)",
  color: "#111827",
  fontWeight: 950,
  cursor: "pointer",
  textDecoration: "none",
  whiteSpace: "nowrap",
};

const btnInvoicePrint = {
  padding: "10px 12px",
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.92)",
  color: "#111827",
  fontWeight: 950,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const stepsWrap = {
  display: "flex",
  gap: 0,
  alignItems: "center",
  flexWrap: "wrap",
};

const stepItem = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  position: "relative",
  paddingRight: 14,
};

const stepDot = {
  width: 28,
  height: 28,
  borderRadius: 999,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 1000,
  fontSize: 12,
  border: "1px solid rgba(0,0,0,0.12)",
};

const stepDotDone = {
  background: "rgba(17,24,39,0.95)",
  color: "#fff",
  border: "1px solid rgba(17,24,39,0.95)",
};

const stepDotActive = {
  background: "rgba(255,255,255,0.92)",
  color: "#111827",
  border: "1px solid rgba(17,24,39,0.35)",
};

const stepDotTodo = {
  background: "rgba(255,255,255,0.75)",
  color: "rgba(17,24,39,0.65)",
};

const stepLabel = {
  fontWeight: 950,
  fontSize: 12,
  color: "rgba(17,24,39,0.82)",
};

const stepLine = {
  width: 44,
  height: 2,
  borderRadius: 999,
  marginLeft: 10,
};

const stepLineDone = {
  background: "rgba(17,24,39,0.95)",
};

const stepLineTodo = {
  background: "rgba(0,0,0,0.10)",
};


const btnReview = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid rgba(255,140,0,0.35)",
  background: "linear-gradient(135deg, rgba(255,140,0,1), rgba(255,220,160,0.95))",
  color: "#0b1220",
  fontWeight: 950,
  cursor: "pointer",
  boxShadow: "0 10px 22px rgba(255,140,0,0.14)",
};

const reviewStarBtn = {
  padding: "9px 12px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.9)",
  color: "#0b1220",
  fontWeight: 900,
  cursor: "pointer",
};

const reviewStarBtnActive = {
  ...reviewStarBtn,
  border: "1px solid rgba(255,140,0,0.35)",
  background: "linear-gradient(135deg, rgba(255,140,0,1), rgba(255,220,160,0.95))",
  boxShadow: "0 10px 22px rgba(255,140,0,0.14)",
};

const reviewInfoBox = {
  marginTop: 12,
  padding: 14,
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.8)",
};

const reviewModalBackdrop = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,0.45)",
  display: "grid",
  placeItems: "center",
  padding: 16,
  zIndex: 9999,
};

const reviewModalCard = {
  width: "min(680px, 100%)",
  borderRadius: 18,
  padding: 18,
  background: "#fff",
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 20px 60px rgba(0,0,0,0.22)",
};

const inputBase = {
  padding: "12px 14px",
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.12)",
  outline: "none",
  fontWeight: 800,
  background: "rgba(255,255,255,0.94)",
};