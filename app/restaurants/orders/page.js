"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import supabase from "@/lib/supabase";
import { DEFAULT_APP_CURRENCY, formatAppMoney, getStoredAppCurrency, syncAppCurrency } from "@/lib/appCurrency";

/* =========================
   PREMIUM THEME (same as other UI)
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
};

const pillBtn = (active) => ({
  ...pill,
  cursor: "pointer",
  userSelect: "none",
  background: active ? "rgba(17,24,39,0.92)" : "rgba(255,255,255,0.7)",
  color: active ? "#fff" : "rgba(17,24,39,0.85)",
  border: active ? "1px solid rgba(17,24,39,0.75)" : "1px solid rgba(0,0,0,0.08)",
});

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
  minWidth: 140,
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

const btnDark = {
  border: "1px solid rgba(17,24,39,0.95)",
  background: "rgba(17,24,39,0.95)",
  color: "#fff",
  fontWeight: 950,
  padding: "10px 14px",
  borderRadius: 999,
  cursor: "pointer",
  boxShadow: "0 12px 30px rgba(17,24,39,0.18)",
};

const btnGhost = {
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.85)",
  color: "#0b1220",
  fontWeight: 950,
  padding: "10px 14px",
  borderRadius: 999,
  cursor: "pointer",
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

const alertInfo = {
  marginTop: 12,
  padding: 12,
  border: "1px solid rgba(16,185,129,0.25)",
  background: "rgba(236,253,245,0.95)",
  borderRadius: 14,
  color: "#065f46",
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

const styles = {
  select: {
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.12)",
    fontWeight: 900,
    background: "rgba(255,255,255,0.85)",
    boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
    outline: "none",
    cursor: "pointer",
    minWidth: 220,
  },

  input: {
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.12)",
    fontWeight: 900,
    background: "rgba(255,255,255,0.9)",
    boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
    outline: "none",
    minWidth: 240,
  },

  smallMuted: { color: "rgba(17,24,39,0.65)", fontSize: 12, fontWeight: 850 },
};

function money(value, currency = DEFAULT_APP_CURRENCY) {
  return formatAppMoney(value, currency);
}

/* =========================
   HELPERS (your existing logic kept)
   ========================= */

function pick(obj, keys, fallback = "-") {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null && String(obj[k]).trim() !== "") return obj[k];
  }
  return fallback;
}

function formatWhen(d) {
  try {
    return new Date(d).toLocaleString();
  } catch {
    return d || "-";
  }
}

function statusColor(status) {
  const s = String(status || "").toLowerCase();

  if (s === "pending") return { bg: "rgba(255,247,237,0.95)", border: "rgba(249,115,22,0.22)", text: "#9a3412" };
  if (s === "preparing") return { bg: "rgba(239,246,255,0.95)", border: "rgba(59,130,246,0.22)", text: "#1e40af" };

  if (s === "ready") return { bg: "rgba(236,253,245,0.95)", border: "rgba(16,185,129,0.22)", text: "#065f46" };

  if (s === "delivering") return { bg: "rgba(239,246,255,0.95)", border: "rgba(59,130,246,0.22)", text: "#1e40af" };
  if (s === "picked_up") return { bg: "rgba(255,247,237,0.95)", border: "rgba(249,115,22,0.22)", text: "#9a3412" };
  if (s === "on_the_way") return { bg: "rgba(254,243,199,0.95)", border: "rgba(245,158,11,0.28)", text: "#92400e" };

  if (s === "delivered") return { bg: "rgba(236,253,245,0.95)", border: "rgba(16,185,129,0.22)", text: "#065f46" };
  if (s === "rejected") return { bg: "rgba(254,242,242,0.95)", border: "rgba(239,68,68,0.25)", text: "#7f1d1d" };

  return { bg: "rgba(255,255,255,0.85)", border: "rgba(0,0,0,0.12)", text: "#0b1220" };
}

/* âœ… FIX: real address fields (matches your cart/order insert)
   orders.address_line1, address_line2, landmark
   fallback: older schemas if any
*/
function buildFullAddress(o) {
  const a1 = pick(o, ["address_line1"], "");
  const a2 = pick(o, ["address_line2"], "");
  const lm = pick(o, ["landmark"], "");

  const parts = [a1, a2, lm]
    .map((x) => String(x || "").trim())
    .filter((x) => x && x !== "-");

  const joined = parts.join(", ");
  if (joined) return joined;

  return pick(o, ["customer_address", "address", "delivery_address"], "-");
}

function safeNum(v, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
}

function ownerOrderSubtotal(order) {
  const items = Array.isArray(order?.order_items || order?.items) ? order.order_items || order.items : [];
  const calcSubtotal = items.reduce((sum, it) => {
    const qty = safeNum(pick(it, ["qty", "quantity"], 1), 1) || 1;
    const unit = safeNum(pick(it, ["price", "item_price", "unit_price"], 0), 0);
    const line = safeNum(pick(it, ["line_total"], Number.NaN), Number.NaN);
    return sum + (Number.isFinite(line) && line > 0 ? line : qty * unit);
  }, 0);
  const stored = safeNum(
    pick(order, ["subtotal_amount", "subtotal", "item_total", "items_total"], Number.NaN),
    Number.NaN
  );
  return Number.isFinite(stored) && stored > 0 ? stored : calcSubtotal;
}

function ownerOrderTax(order) {
  return safeNum(pick(order, ["tax_amount", "tax", "gst_amount", "gst", "tax_total"], 0), 0);
}

function ownerOrderEarnings(order) {
  return ownerOrderSubtotal(order) + ownerOrderTax(order);
}

async function copyText(txt) {
  try {
    await navigator.clipboard.writeText(String(txt || ""));
    return true;
  } catch {
    return false;
  }
}

function mapsUrlFromOrder(o) {
  const lat = Number(pick(o, ["customer_lat", "drop_lat", "delivery_lat"], NaN));
  const lng = Number(pick(o, ["customer_lng", "drop_lng", "delivery_lng"], NaN));
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  const addr = buildFullAddress(o);
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(String(addr || "").trim())}`;
}

/* =========================
   âœ… NEW (SAFE): image URL normalizer + placeholder
   ========================= */

function safeImgUrl(u) {
  const s = String(u || "").trim();
  if (!s) return "";
  return s;
}

const itemThumb = {
  width: 54,
  height: 54,
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.10)",
  overflow: "hidden",
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

const itemThumbPlaceholder = {
  width: "100%",
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 1000,
  color: "rgba(17,24,39,0.55)",
  fontSize: 12,
};

/* =========================
   CUSTOMER-LIKE UI PIECES (for owner page)
   ========================= */

function friendlyStatus(status) {
  const s = String(status || "").toLowerCase();
  if (s === "pending") return "Pending";
  if (s === "preparing") return "Preparing";
  if (s === "ready") return "Ready";
  if (s === "delivering") return "Out for delivery";
  if (s === "picked_up") return "Picked up";
  if (s === "on_the_way") return "On the way";
  if (s === "delivered") return "Delivered";
  if (s === "rejected" || s === "cancelled") return "Rejected";
  return s ? s : "Pending";
}

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
      <div
        style={{
          marginTop: 10,
          borderRadius: 14,
          padding: 12,
          border: "1px solid rgba(239,68,68,0.25)",
          background: "rgba(254,242,242,0.90)",
        }}
      >
        <div style={{ fontWeight: 1000, color: "#7f1d1d" }}>Order Cancelled</div>
        <div style={{ marginTop: 6, fontWeight: 850, color: "rgba(127,29,29,0.85)", fontSize: 13 }}>This order was cancelled/rejected.</div>
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
            <div style={{ ...stepDot, ...(done ? stepDotDone : active ? stepDotActive : stepDotTodo) }}>{done ? "OK" : i + 1}</div>
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

export default function RestaurantOrdersPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");

  const [ownerEmail, setOwnerEmail] = useState("");
  const [role, setRole] = useState("");

  // âœ… Multi-restaurant support
  const [restaurants, setRestaurants] = useState([]); // [{id,name}]
  const [restaurantId, setRestaurantId] = useState("");
  const [restaurantName, setRestaurantName] = useState("");

  const [orders, setOrders] = useState([]);
  const [currency, setCurrency] = useState(DEFAULT_APP_CURRENCY);

  // Pro controls
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchText, setSearchText] = useState("");

  // âœ… keep one realtime channel only
  const channelRef = useRef(null);
  const knownOrderIdsRef = useRef(new Set());
  const audioReadyRef = useRef(false);
  const audioCtxRef = useRef(null);
  const warnedSoundRef = useRef(false);
  const popupTimerRef = useRef(null);

  // âœ… NEW: customer-like behavior (list view + one open detail)
  const [openOrderId, setOpenOrderId] = useState(null);
  const [liveOrderPopup, setLiveOrderPopup] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadCurrency() {
      if (typeof window !== "undefined") {
        setCurrency(getStoredAppCurrency(DEFAULT_APP_CURRENCY));
      }

      const nextCurrency = await syncAppCurrency(DEFAULT_APP_CURRENCY);
      if (!cancelled) setCurrency(nextCurrency);
    }

    loadCurrency();
    return () => {
      cancelled = true;
    };
  }, []);

  function unlockAudioIfNeeded() {
    if (audioReadyRef.current) return true;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return false;
      const ctx = audioCtxRef.current || new AudioCtx();
      audioCtxRef.current = ctx;
      if (ctx.state === "suspended" && typeof ctx.resume === "function") {
        ctx.resume().catch(() => {});
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(0);
      osc.stop(0.01);
      audioReadyRef.current = true;
      return true;
    } catch {
      return false;
    }
  }

  function playNewOrderBeep() {
    if (typeof window === "undefined") return;
    if (!unlockAudioIfNeeded()) return;

    try {
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.14, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } catch {
      // ignore audio errors
    }
  }

  useEffect(() => {
    function onFirstGesture() {
      unlockAudioIfNeeded();
      window.removeEventListener("pointerdown", onFirstGesture);
      window.removeEventListener("touchstart", onFirstGesture);
      window.removeEventListener("mousedown", onFirstGesture);
      window.removeEventListener("keydown", onFirstGesture);
    }

    window.addEventListener("pointerdown", onFirstGesture, { passive: true });
    window.addEventListener("touchstart", onFirstGesture, { passive: true });
    window.addEventListener("mousedown", onFirstGesture, { passive: true });
    window.addEventListener("keydown", onFirstGesture);

    return () => {
      window.removeEventListener("pointerdown", onFirstGesture);
      window.removeEventListener("touchstart", onFirstGesture);
      window.removeEventListener("mousedown", onFirstGesture);
      window.removeEventListener("keydown", onFirstGesture);
      if (popupTimerRef.current) clearTimeout(popupTimerRef.current);
      if (audioCtxRef.current?.close) {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  function announceNewOrders(nextOrders) {
    const prevIds = knownOrderIdsRef.current;
    const nextIds = new Set((nextOrders || []).map((o) => String(o?.id || "")).filter(Boolean));
    const freshOrders = (nextOrders || []).filter((o) => {
      const id = String(o?.id || "").trim();
      return id && !prevIds.has(id);
    });

    knownOrderIdsRef.current = nextIds;
    if (prevIds.size === 0 || freshOrders.length === 0) return;

    const latest = freshOrders[0];
    const short = String(latest?.id || "").slice(0, 8);
    setLiveOrderPopup({
      id: latest?.id || "",
      title: "New order received",
      body: `Order ${short ? "#" + short : ""} just came in for ${restaurantName || "your restaurant"}.`,
    });
    if (popupTimerRef.current) clearTimeout(popupTimerRef.current);
    popupTimerRef.current = setTimeout(() => setLiveOrderPopup(null), 12000);
    playNewOrderBeep();

    if (!audioReadyRef.current && !warnedSoundRef.current) {
      warnedSoundRef.current = true;
      setInfo("New order received. Tap once anywhere to enable sound alerts.");
      setTimeout(() => setInfo(""), 2600);
    }
  }

  async function initOwner() {
    setErr("");
    setInfo("");
    setLoading(true);

    const { data } = await supabase.auth.getSession();
    const session = data?.session;

    if (!session?.user) {
      setErr("Not logged in.");
      setLoading(false);
      return;
    }

    setOwnerEmail(session.user.email || "");

    // role
    const { data: prof, error: pErr } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (pErr) {
      setErr(pErr.message);
      setLoading(false);
      return;
    }
    setRole(prof?.role || "restaurant_owner");

    // âœ… fetch ALL restaurants (no .single/.maybeSingle)
    const { data: rs, error: rErr } = await supabase
      .from("restaurants")
      .select("id,name,owner_user_id")
      .eq("owner_user_id", session.user.id)
      .order("created_at", { ascending: true });

    if (rErr) {
      setErr(rErr.message);
      setLoading(false);
      return;
    }

    const list = Array.isArray(rs) ? rs : [];
    setRestaurants(list.map((x) => ({ id: x.id, name: x.name || "Restaurant" })));

    if (!list.length) {
      setRestaurantId("");
      setRestaurantName("");
      setOrders([]);
      setErr("No restaurant found for this owner.");
      setLoading(false);
      return;
    }

    // default pick first unless already selected
    const current = restaurantId ? list.find((x) => x.id === restaurantId) : null;
    const first = current || list[0];

    setRestaurantId(first.id);
    setRestaurantName(first.name || "");
    setLoading(false);
  }

  async function loadOrdersForRestaurant(rid) {
    if (!rid) {
      setOrders([]);
      setOpenOrderId(null);
      return;
    }

    setErr("");
    setInfo("");

    const { data: o, error: oErr } = await supabase
      .from("orders")
      .select("*")
      .eq("restaurant_id", rid)
      .order("created_at", { ascending: false });

    if (oErr) {
      setErr(oErr.message);
      return;
    }

    const orderIds = (o || []).map((x) => x.id).filter(Boolean);
    let itemsByOrder = {};
    let metaByMenuId = {}; // âœ… name/price/image map

    if (orderIds.length > 0) {
      const { data: items, error: iErr } = await supabase.from("order_items").select("*").in("order_id", orderIds);

      if (!iErr && items) {
        const menuIds = Array.from(new Set(items.map((it) => it.menu_item_id).filter(Boolean)));

        if (menuIds.length > 0) {
          // âœ… UPDATED: also select image_url so we can show pictures
          const { data: menus, error: mErr } = await supabase.from("menu_items").select("id,name,price,image_url").in("id", menuIds);

          if (!mErr && menus) {
            metaByMenuId = (menus || []).reduce((acc, mi) => {
              acc[String(mi.id)] = { name: mi.name || "Item", price: mi.price, image_url: mi.image_url || "" };
              return acc;
            }, {});
          }
        }

        itemsByOrder = items.reduce((acc, it) => {
          const oid = it.order_id;
          if (!oid) return acc;

          const mid = it.menu_item_id ? String(it.menu_item_id) : "";

          const fallbackName = pick(it, ["item_name", "name", "title"], "");
          const resolvedName = metaByMenuId[mid]?.name || fallbackName || "Item";

          const qty = safeNum(pick(it, ["qty", "quantity"], 1), 1);
          const price = safeNum(pick(it, ["price_each", "price", "item_price", "unit_price"], NaN), NaN) ?? NaN;

          const resolvedPrice = Number.isFinite(price)
            ? price
            : Number.isFinite(safeNum(metaByMenuId[mid]?.price, NaN))
            ? safeNum(metaByMenuId[mid]?.price, 0)
            : 0;

          // âœ… NEW (SAFE): image url resolution (order_items may have it, else menu_items.image_url)
          const imgFromItem = safeImgUrl(pick(it, ["image_url", "img", "photo_url", "picture_url"], ""));
          const imgFromMenu = safeImgUrl(metaByMenuId[mid]?.image_url || "");
          const image_url = imgFromItem || imgFromMenu || "";

          const clean = {
            ...it,
            item_name: resolvedName,
            qty,
            price_each: resolvedPrice,
            line_total: Math.round(qty * resolvedPrice),

            // âœ… attach for UI
            image_url,
          };

          acc[oid] = acc[oid] || [];
          acc[oid].push(clean);
          return acc;
        }, {});
      }
    }

    const merged = (o || []).map((ord) => ({
      ...ord,
      items: itemsByOrder[ord.id] || [],
    }));

    announceNewOrders(merged);
    setOrders(merged);

    // âœ… if open order no longer exists, close it safely
    if (openOrderId && !merged.find((x) => x.id === openOrderId)) {
      setOpenOrderId(null);
    }
  }

  function setupRealtime(rid) {
    if (!rid) return;

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const ch = supabase
      .channel(`owner_orders_${rid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${rid}` }, () => {
        loadOrdersForRestaurant(rid);
      })
      .subscribe();

    channelRef.current = ch;
  }

  useEffect(() => {
    initOwner();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!restaurantId) return;
    knownOrderIdsRef.current = new Set();
    setLiveOrderPopup(null);
    loadOrdersForRestaurant(restaurantId);
    setupRealtime(restaurantId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);


  async function notifyDriversOrderReady(orderId) {
    if (!orderId) return;

    try {
      const res = await fetch("/api/send-driver-notification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          restaurantName: restaurantName || "Restaurant",
        }),
      });

      let payload = null;
      try {
        payload = await res.json();
      } catch {}

      if (!res.ok || !payload?.success || Number(payload?.sent || 0) < 1) {
        console.warn("[driver-push] notification not sent", { orderId, status: res.status, payload });
      }
    } catch (err) {
      // best effort only - do not block existing status workflow
      console.warn("[driver-push] request failed", { orderId, err });
    }
  }

  async function notifyCustomerOrderStatus(orderId, nextStatus) {
    if (!orderId) return;

    try {
      const { data: orderRow, error: orderErr } = await supabase
        .from("orders")
        .select("id, user_id, status")
        .eq("id", orderId)
        .maybeSingle();

      if (orderErr) throw orderErr;

      const customerUserId = orderRow?.user_id || null;
      if (!customerUserId) return;

      const shortId = String(orderRow?.id || orderId).slice(0, 8);
      const status = String(nextStatus || orderRow?.status || "").toLowerCase();

      let title = "Order update";
      let body = `Your order ${shortId ? "#" + shortId : ""} has a new update.`;

      if (status === "accepted") {
        title = "Order accepted";
        body = `Your order ${shortId ? "#" + shortId : ""} was accepted by the restaurant.`;
      } else if (["pending", "confirmed", "preparing"].includes(status)) {
        title = "Restaurant is preparing";
        body = `Your order ${shortId ? "#" + shortId : ""} is now being prepared.`;
      } else if (status === "ready") {
        title = "Order is ready";
        body = `Your order ${shortId ? "#" + shortId : ""} is ready and waiting for delivery.`;
      } else if (["delivering", "on_the_way", "picked_up"].includes(status)) {
        title = "Out for delivery";
        body = `Your order ${shortId ? "#" + shortId : ""} is on the way.`;
      } else if (status === "delivered") {
        title = "Order delivered";
        body = `Your order ${shortId ? "#" + shortId : ""} was delivered.`;
      }

      const link = `/order/restaurant/${encodeURIComponent(String(orderRow?.id || orderId))}`;

      try {
        await fetch("/api/send-customer-notification", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: customerUserId,
            title,
            body,
            subtitle: String(orderRow?.restaurant_name || "Live food delivery"),
            type: "live_tracking",
            link,
            orderId: String(orderRow?.id || orderId),
            orderType: "restaurant",
            status,
          }),
        });
      } catch {
        await supabase.from("notifications").insert({
          user_id: customerUserId,
          title,
          body,
          type: "order",
          link,
          is_read: false,
        });
      }
    } catch (err) {
      console.warn("[customer-notify:restaurant] failed", { orderId, nextStatus, err });
    }
  }

  async function updateStatus(orderId, newStatus) {
    setErr("");
    setInfo("");

    const { error } = await supabase.from("orders").update({ status: newStatus }).eq("id", orderId);
    if (error) {
      setErr(error.message);
      return;
    }

    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o)));

    await notifyCustomerOrderStatus(orderId, newStatus);

    if (String(newStatus || "").toLowerCase() === "ready") {
      await notifyDriversOrderReady(orderId);
    }
    setInfo(`Status updated to "${newStatus}"`);
    setTimeout(() => setInfo(""), 1800);
  }

  const totals = useMemo(() => {
    const t = {
      pending: 0,
      preparing: 0,
      ready: 0,
      delivering: 0,
      picked_up: 0,
      on_the_way: 0,
      delivered: 0,
      rejected: 0,
      all: orders.length,
    };
    for (const o of orders) {
      const s = String(o.status || "").toLowerCase();
      if (t[s] !== undefined) t[s] += 1;
    }
    return t;
  }, [orders]);

  const visibleOrders = useMemo(() => {
    let list = [...(orders || [])];

    if (statusFilter !== "all") {
      list = list.filter((o) => String(o.status || "").toLowerCase() === statusFilter);
    }

    const q = String(searchText || "").trim().toLowerCase();
    if (q) {
      list = list.filter((o) => {
        const customerName = pick(o, ["customer_name", "name", "full_name"], "");
        const customerPhone = pick(o, ["phone", "customer_phone", "mobile", "customer_mobile"], "");
        const addr = buildFullAddress(o);
        const id = pick(o, ["id"], "");
        const itemsText = (o.items || [])
          .map((it) => String(it.item_name || it.name || it.title || ""))
          .join(" ");

        return `${customerName} ${customerPhone} ${addr} ${id} ${itemsText}`.toLowerCase().includes(q);
      });
    }

    return list;
  }, [orders, statusFilter, searchText]);

  const openOrder = useMemo(() => {
    if (!openOrderId) return null;
    return (orders || []).find((x) => x.id === openOrderId) || null;
  }, [orders, openOrderId]);

  return (
    <main style={pageBg}>
      <div style={{ width: "100%", margin: "0 auto" }}>
        {/* HERO */}
        <div style={heroGlass}>
          <div style={{ minWidth: 260 }}>
            <div style={pill}>Owner</div>
            <h1 style={heroTitle}>Restaurant Orders</h1>
            <div style={subText}>Owner dashboard (owner only) - View and update order status - Multi-restaurant supported</div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div style={statCard}>
              <div style={statNum}>{visibleOrders.length}</div>
              <div style={statLabel}>Showing</div>
            </div>

            <button
              onClick={async () => {
                await initOwner();
                if (restaurantId) await loadOrdersForRestaurant(restaurantId);
              }}
              style={btnDark}
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Controls (keep your existing logic) */}
        <div style={{ ...cardGlass, marginTop: 12 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <span style={pill}>Owner: {ownerEmail || "-"}</span>
            <span style={pill}>Role: {role || "-"}</span>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <span style={pill}>Restaurant:</span>
              <select
                value={restaurantId || ""}
                onChange={(e) => {
                  const rid = e.target.value;
                  setRestaurantId(rid);
                  const found = (restaurants || []).find((x) => String(x.id) === String(rid));
                  setRestaurantName(found?.name || "");
                  setOpenOrderId(null); // âœ… close details when switching restaurants
                }}
                style={styles.select}
              >
                {(restaurants || []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            <span style={pill}>Restaurant ID: {restaurantId || "-"}</span>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12, alignItems: "center" }}>
            <span style={pillBtn(statusFilter === "all")} onClick={() => setStatusFilter("all")}>
              All: {totals.all}
            </span>
            <span style={pillBtn(statusFilter === "pending")} onClick={() => setStatusFilter("pending")}>
              Pending: {totals.pending}
            </span>
            <span style={pillBtn(statusFilter === "preparing")} onClick={() => setStatusFilter("preparing")}>
              Preparing: {totals.preparing}
            </span>
            <span style={pillBtn(statusFilter === "ready")} onClick={() => setStatusFilter("ready")}>
              Ready: {totals.ready}
            </span>
            <span style={pillBtn(statusFilter === "delivering")} onClick={() => setStatusFilter("delivering")}>
              Delivering: {totals.delivering}
            </span>
            <span style={pillBtn(statusFilter === "picked_up")} onClick={() => setStatusFilter("picked_up")}>
              Picked Up: {totals.picked_up}
            </span>
            <span style={pillBtn(statusFilter === "on_the_way")} onClick={() => setStatusFilter("on_the_way")}>
              On The Way: {totals.on_the_way}
            </span>
            <span style={pillBtn(statusFilter === "delivered")} onClick={() => setStatusFilter("delivered")}>
              Delivered: {totals.delivered}
            </span>
            <span style={pillBtn(statusFilter === "rejected")} onClick={() => setStatusFilter("rejected")}>
              Rejected: {totals.rejected}
            </span>

            <div style={{ marginLeft: "auto", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <input
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Search name / phone / address / item / order ID..."
                style={styles.input}
              />
              <button
                onClick={() => {
                  setSearchText("");
                  setStatusFilter("all");
                }}
                style={btnGhost}
              >
                Clear
              </button>
            </div>
          </div>

          {err ? <div style={alertErr}>{err}</div> : null}
          {info ? <div style={alertInfo}>{info}</div> : null}
        </div>

        {loading ? (
          <div style={{ marginTop: 14, color: "rgba(17,24,39,0.7)", fontWeight: 900 }}>Loading...</div>
        ) : !restaurantId ? (
          <div style={emptyBox}>No restaurant selected.</div>
        ) : visibleOrders.length === 0 ? (
          <div style={emptyBox}>No orders found for current filter/search.</div>
        ) : null}

        {/* =========================
            CLEAN LIST VIEW (customer-like)
           ========================= */}
        {!loading && visibleOrders.length > 0 && !openOrder ? (
          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
            {visibleOrders.map((o) => {
              const items = o.items || [];

              const ownerEarnings = ownerOrderEarnings(o);
              const ownerTax = ownerOrderTax(o);

              const badge = statusColor(o.status);

              const firstItemName = items?.[0]?.item_name || items?.[0]?.name || items?.[0]?.title || "Items";
              const itemsCount = items.reduce((s, it) => s + Number(it.qty || it.quantity || 0), 0);

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
                          background: badge.bg,
                          border: `1px solid ${badge.border}`,
                          color: badge.text,
                        }}
                      >
                        {friendlyStatus(o.status).toUpperCase()}
                      </span>

                      <div style={{ fontWeight: 1000, color: "#0b1220" }}>
                        Order - <span style={{ opacity: 0.7 }}>{String(o.id).slice(0, 8)}...</span>
                      </div>

                      <div style={{ color: "rgba(17,24,39,0.65)", fontWeight: 900, fontSize: 12 }}>{formatWhen(o.created_at || o.createdAt)}</div>
                    </div>

                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 1000, color: "#0b1220" }}>{money(ownerEarnings || 0, currency)}</div>
                        <div style={{ color: "rgba(17,24,39,0.55)", fontWeight: 850, fontSize: 12 }}>Tax {money(ownerTax || 0, currency)}</div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenOrderId(o.id);
                        }}
                        style={btnView}
                      >
                        View details
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
                    <div style={{ color: "rgba(17,24,39,0.55)", fontWeight: 850, fontSize: 12 }}>Click to open full details + items</div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {/* =========================
            DETAIL VIEW (ONLY ONE ORDER) - owner keeps status change
           ========================= */}
        {!loading && visibleOrders.length > 0 && openOrder ? (
          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
            {(() => {
              const o = openOrder;

              const items = o.items || [];
              const ownerSubtotal = ownerOrderSubtotal(o);
              const ownerTax = ownerOrderTax(o);
              const ownerEarnings = ownerOrderEarnings(o);

              const badge = statusColor(o.status);

              const customerName = pick(o, ["customer_name", "name", "full_name"]);
              const customerPhone = pick(o, ["phone", "customer_phone", "mobile", "customer_mobile"]);
              const customerAddress = buildFullAddress(o);
              const customerInstructions = pick(o, ["instructions", "customer_instructions", "note", "notes"], "-");

              const telUrl = `tel:${String(customerPhone || "").replace(/\s+/g, "")}`;
              const waUrl = `https://wa.me/${String(customerPhone || "").replace(/[^\d]/g, "")}`;
              const mapsUrl = mapsUrlFromOrder(o);

              return (
                <div style={cardGlass}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <button onClick={() => setOpenOrderId(null)} style={btnBack}>
                      Back to all orders
                    </button>

                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <span
                        style={{
                          padding: "6px 10px",
                          borderRadius: 999,
                          fontWeight: 1000,
                          fontSize: 12,
                          background: badge.bg,
                          border: `1px solid ${badge.border}`,
                          color: badge.text,
                        }}
                      >
                        {friendlyStatus(o.status).toUpperCase()}
                      </span>

                      <div style={{ color: "rgba(17,24,39,0.65)", fontWeight: 900, fontSize: 12 }}>{formatWhen(o.created_at || o.createdAt)}</div>

                      <div style={{ color: "rgba(17,24,39,0.65)", fontWeight: 900, fontSize: 12 }}>
                        Order ID: <span style={{ color: "#0b1220" }}>{o.id}</span>
                      </div>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 1000, color: "#0b1220" }}>Owner earnings: {money(ownerEarnings || 0, currency)}</div>
                      <div style={{ marginTop: 4, color: "rgba(17,24,39,0.65)", fontWeight: 850, fontSize: 12 }}>
                        Items subtotal: {money(ownerSubtotal || 0, currency)} • Tax: {money(ownerTax || 0, currency)}
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <StatusSteps status={o.status} />
                  </div>

                  {/* Owner tools + status update */}
                  <div
                    style={{
                      marginTop: 12,
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      flexWrap: "wrap",
                      alignItems: "center",
                    }}
                  >
                    <div style={styles.smallMuted}>
                      Restaurant: <span style={{ color: "#0b1220", fontWeight: 950 }}>{restaurantName || "-"}</span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 950, fontSize: 13, color: "#0b1220" }}>Change Status:</span>
                      <select value={String(o.status || "pending")} onChange={(e) => updateStatus(o.id, e.target.value)} style={styles.select}>
                        <option value="pending">pending</option>
                        <option value="accepted">accepted</option>
                        <option value="preparing">preparing</option>
                        <option value="ready">ready</option>

                        <option value="delivering">delivering</option>
                        <option value="picked_up">picked_up</option>
                        <option value="on_the_way">on_the_way</option>

                        <option value="delivered">delivered</option>
                        <option value="rejected">rejected</option>
                      </select>
                    </div>
                  </div>

                  {/* Two boxes like customer details */}
                  <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div
                      style={{
                        borderRadius: 16,
                        border: "1px solid rgba(0,0,0,0.08)",
                        background: "rgba(255,255,255,0.75)",
                        padding: 12,
                      }}
                    >
                      <div style={{ fontWeight: 1000, color: "#0b1220" }}>Customer</div>

                      <div style={{ marginTop: 8, color: "rgba(17,24,39,0.72)", fontWeight: 850 }}>
                        <b>Name:</b> {customerName || "-"}
                      </div>
                      <div style={{ marginTop: 4, color: "rgba(17,24,39,0.72)", fontWeight: 850 }}>
                        <b>Phone:</b> {customerPhone || "-"}
                      </div>
                      <div style={{ marginTop: 4, color: "rgba(17,24,39,0.72)", fontWeight: 850 }}>
                        <b>Address:</b> {customerAddress || "-"}
                      </div>
                      {String(customerInstructions || "").trim() && customerInstructions !== "-" ? (
                        <div style={{ marginTop: 4, color: "rgba(17,24,39,0.72)", fontWeight: 850 }}>
                          <b>Instructions:</b> {customerInstructions}
                        </div>
                      ) : null}

                      <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <a href={telUrl} style={{ ...btnGhost, textDecoration: "none" }}>
                          Call
                        </a>
                        <a href={waUrl} target="_blank" rel="noreferrer" style={{ ...btnGhost, textDecoration: "none" }}>
                          WhatsApp
                        </a>
                        <button
                          type="button"
                          style={btnGhost}
                          onClick={async () => {
                            const ok = await copyText(customerPhone);
                            setInfo(ok ? "Phone copied" : "Copy failed");
                            setTimeout(() => setInfo(""), 1400);
                          }}
                        >
                          Copy Phone
                        </button>
                      </div>
                    </div>

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
                        <b>Maps:</b>{" "}
                        <a href={mapsUrl} target="_blank" rel="noreferrer" style={{ color: "#111827", fontWeight: 1000 }}>
                          Open
                        </a>
                      </div>

                      <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <a href={mapsUrl} target="_blank" rel="noreferrer" style={{ ...btnGhost, textDecoration: "none" }}>
                          Maps
                        </a>
                        <button
                          type="button"
                          style={btnGhost}
                          onClick={async () => {
                            const ok = await copyText(customerAddress);
                            setInfo(ok ? "Address copied" : "Copy failed");
                            setTimeout(() => setInfo(""), 1400);
                          }}
                        >
                          Copy Address
                        </button>
                      </div>

                      <div style={{ marginTop: 10, color: "rgba(17,24,39,0.65)", fontWeight: 850, fontSize: 12 }}>
                        Order created: <span style={{ color: "#0b1220" }}>{formatWhen(o.created_at || o.createdAt)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Items block like customer */}
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontWeight: 1000, color: "#0b1220" }}>Items</div>

                    <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                      {items.length ? (
                        items.map((it, idx) => {
                          const itemName = pick(it, ["item_name", "name", "title"], "Item");
                          const qty = safeNum(pick(it, ["qty", "quantity"], 1), 1);
                          const price = safeNum(pick(it, ["price_each", "price", "item_price", "unit_price"], 0), 0);
                          const line = Math.round(qty * price);
                          const img = safeImgUrl(it?.image_url);

                          return (
                            <div
                              key={it.id || idx}
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
                                <div style={itemThumb}>
                                  {img ? (
                                    <img
                                      src={img}
                                      alt={String(itemName || "Item")}
                                      style={itemThumbImg}
                                      onError={(e) => {
                                        // âœ… if broken image url, show placeholder (no crash)
                                        e.currentTarget.style.display = "none";
                                      }}
                                    />
                                  ) : (
                                    <div style={itemThumbPlaceholder}>No image</div>
                                  )}
                                </div>

                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontWeight: 950, color: "#0b1220" }}>{itemName}</div>
                                  <div style={{ marginTop: 4, color: "rgba(17,24,39,0.62)", fontWeight: 850, fontSize: 12 }}>
                                    {money(price || 0, currency)} each
                                  </div>
                                </div>
                              </div>

                              <div style={{ color: "rgba(17,24,39,0.72)", fontWeight: 900 }}>
                                Qty {qty}
                                <span style={{ marginLeft: 10 }}>{money(line, currency)}</span>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div style={{ ...emptyBox, marginTop: 8 }}>
                          No items found for this order. (If this keeps happening, check that order_items.menu_item_id is filled.)
                        </div>
                      )}
                    </div>

                    <div style={{ marginTop: 10, color: "rgba(17,24,39,0.65)", fontWeight: 850, fontSize: 12 }}>
                      Restaurant ID: <span style={{ color: "#0b1220" }}>{o.restaurant_id || restaurantId}</span>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        ) : null}
      </div>
      {liveOrderPopup ? (
        <div
          style={{
            position: "fixed",
            right: 20,
            bottom: 20,
            width: "min(360px, calc(100vw - 32px))",
            zIndex: 1200,
            borderRadius: 20,
            border: "1px solid rgba(16,185,129,0.24)",
            background: "rgba(255,255,255,0.96)",
            boxShadow: "0 24px 60px rgba(15,23,42,0.2)",
            padding: 16,
            backdropFilter: "blur(12px)",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 1000, color: "#15803d", letterSpacing: "0.08em" }}>LIVE ORDER ALERT</div>
          <div style={{ marginTop: 8, fontSize: 20, fontWeight: 1000, color: "#0b1220" }}>{liveOrderPopup.title}</div>
          <div style={{ marginTop: 8, color: "rgba(17,24,39,0.72)", fontWeight: 850, lineHeight: 1.5 }}>{liveOrderPopup.body}</div>
          <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
            <button
              type="button"
              style={btnDark}
              onClick={() => {
                setStatusFilter("all");
                setSearchText("");
                setOpenOrderId(liveOrderPopup.id);
                setLiveOrderPopup(null);
              }}
            >
              Open order
            </button>
            <button type="button" style={btnGhost} onClick={() => setLiveOrderPopup(null)}>
              Dismiss
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}

/* =========================
   EXTRA STYLES (LIST + STEPS) - copied from customer style
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


