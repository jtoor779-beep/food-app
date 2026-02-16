"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import supabase from "@/lib/supabase";

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

function formatMoney(v) {
  const n = Number(v || 0);
  return `₹${n.toFixed(0)}`;
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

// ✅ new bill box for coupon summary
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
   CUSTOMER LIVE STATUS MESSAGE (A)
   ========================= */

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

export default function OrdersPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState("");

  const [user, setUser] = useState(null);
  const [role, setRole] = useState("");
  const [orders, setOrders] = useState([]);

  // ✅ delivery profile map: { [delivery_user_id]: { full_name, avatar_url, phone } }
  const [deliveryProfiles, setDeliveryProfiles] = useState({});

  // ✅ restaurant coords map: { [restaurant_id]: { lat, lng } }
  const [restaurantCoords, setRestaurantCoords] = useState({});

  // ✅ live driver GPS per order: { [orderId]: { lat, lng, ts, source } }
  const [liveGpsByOrderId, setLiveGpsByOrderId] = useState({});

  const [lastRealtimeHit, setLastRealtimeHit] = useState("");
  const channelRef = useRef(null);

  const gpsPollRef = useRef(null);

  const orderItemsByOrderId = useMemo(() => {
    const map = {};
    for (const o of orders) {
      map[o.id] = Array.isArray(o.order_items) ? o.order_items : [];
    }
    return map;
  }, [orders]);

  const totalOrders = useMemo(() => orders.length, [orders]);

  // ✅ UPDATED: prefer new total_amount column first
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
    // ✅ UPDATED: prefer new total_amount column first
    const fromNew = Number(order.total_amount || 0);
    if (fromNew > 0) return fromNew;

    const items = orderItemsByOrderId[order.id] || [];
    const fromDb = Number(order.total || 0);
    if (fromDb > 0) return fromDb;

    return items.reduce((sum, it) => sum + Number(it.qty || 0) * Number(it.price_each || 0), 0);
  }

  // ✅ NEW: calc subtotal from column or fallback
  function calcOrderSubtotal(order) {
    const fromCol = Number(order.subtotal_amount || 0);
    if (fromCol > 0) return fromCol;

    const items = orderItemsByOrderId[order.id] || [];
    return items.reduce((s, it) => s + Number(it.qty || 0) * Number(it.price_each || 0), 0);
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

  // ✅ schema-safe restaurant coords loader (tries different column sets)
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
      // if table/columns don’t exist, keep empty (NO fallback coords)
      setRestaurantCoords({});
    }
  }

  async function loadOrders(currentUserId) {
    // ✅ Added: coupon_code, discount_amount, subtotal_amount, total_amount
    const { data, error } = await supabase
      .from("orders")
      .select(
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
      `
      )
      .eq("user_id", currentUserId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const list = Array.isArray(data) ? data : [];
    setOrders(list);

    // load dependent data (safe)
    await loadDeliveryProfilesFromOrders(list);
    await loadRestaurantCoordsFromOrders(list);
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
        await loadOrders(userId);
      })
      .subscribe();
  }

  // ✅ Fetch latest GPS for ONE order (fast view first, then fallback table)
  async function fetchLatestGpsForOrder(orderId) {
    if (!orderId) return null;

    // Try view: delivery_latest_location
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

    // Fallback: query delivery_events directly
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
      if (r === "delivery_partner") {
        router.push("/delivery");
        return;
      }

      await loadOrders(u.id);
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

  return (
    <main style={pageBg}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        {/* HERO */}
        <div style={heroGlass}>
          <div style={{ minWidth: 260 }}>
            <div style={pill}>Customer</div>
            <h1 style={heroTitle}>My Orders</h1>
            <div style={subText}>Track your orders & status updates (Realtime)</div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div style={statCard}>
              <div style={statNum}>{totalOrders}</div>
              <div style={statLabel}>Total Orders</div>
            </div>

            <div style={statCard}>
              <div style={statNum}>{formatMoney(totalSpend)}</div>
              <div style={statLabel}>Total Spend</div>
            </div>

            <Link href="/restaurants" style={pill}>
              ← Restaurants
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
            No orders yet.{" "}
            <Link href="/restaurants" style={{ color: "#111827", fontWeight: 1000 }}>
              Browse restaurants →
            </Link>
          </div>
        ) : null}

        {!loading && orders.length > 0 ? (
          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
            {orders.map((o) => {
              const items = orderItemsByOrderId[o.id] || [];
              const total = calcOrderTotal(o);
              const subtotalAmt = calcOrderSubtotal(o);
              const discountAmt = Math.max(0, Number(o.discount_amount || 0));
              const code = String(o.coupon_code || "").trim();
              const badge = statusBadge(o.status);

              const dp = o.delivery_user_id ? deliveryProfiles[o.delivery_user_id] : null;
              const dpName = dp?.full_name || dp?.name || "";

              // ✅ FIX: NO INDIA fallback coords
              const pickup = restaurantCoords[o.restaurant_id] || null;
              const drop = pickLatLng(o) || null;

              // ✅ live driver gps (if available)
              const live = liveGpsByOrderId[o.id] || null;
              const liveOk = live?.lat != null && live?.lng != null && isActiveDeliveryStatus(o.status);

              const liveLabel = !isActiveDeliveryStatus(o.status)
                ? "Live GPS available during delivery"
                : liveOk
                ? `Live GPS connected ✅ (updated: ${formatTime(live.ts)})`
                : "Waiting for driver GPS…";

              const hasAnyMapPoint = !!pickup || !!drop || (liveOk && live);

              return (
                <div key={o.id} style={cardGlass}>
                  <div style={row}>
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

                      <span style={{ color: "rgba(17,24,39,0.65)", fontWeight: 900, fontSize: 12 }}>{formatTime(o.created_at)}</span>

                      <span style={{ color: "rgba(17,24,39,0.65)", fontWeight: 900, fontSize: 12 }}>
                        Order ID: <span style={{ color: "#0b1220" }}>{o.id}</span>
                      </span>
                    </div>

                    <div style={{ fontWeight: 1000, color: "#0b1220" }}>Total: {formatMoney(total)}</div>
                  </div>

                  {/* ✅ A: Live customer message */}
                  <StatusMessageCard status={o.status} deliveryPartnerName={dpName} />

                  {/* ✅ NEW: Bill summary with coupon */}
                  <div style={billBox}>
                    <div style={{ fontWeight: 1000, color: "#0b1220" }}>Bill Summary</div>

                    <div style={billLine}>
                      <span>Subtotal</span>
                      <span style={{ color: "#0b1220" }}>{formatMoney(subtotalAmt)}</span>
                    </div>

                    <div style={{ ...billLine, borderBottom: "none" }}>
                      <span>
                        Discount{code ? ` (${code})` : ""}
                      </span>
                      <span style={{ color: discountAmt > 0 ? "#065f46" : "#0b1220" }}>
                        {discountAmt > 0 ? `- ${formatMoney(discountAmt)}` : formatMoney(0)}
                      </span>
                    </div>

                    <div style={billTotal}>
                      <span>Total Payable</span>
                      <span>{formatMoney(total)}</span>
                    </div>
                  </div>

                  {/* ✅ MAP: Customer tracking */}
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

                  {/* Delivery partner name + photo */}
                  {o.delivery_user_id ? <DeliveryPerson dp={dp || { full_name: "Delivery Partner" }} /> : null}

                  {/* Delivery info */}
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
                          <b>Instructions:</b> {o.instructions}
                        </div>
                      ) : null}
                    </div>

                    {/* Items */}
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
                            <div style={{ fontWeight: 950, color: "#0b1220" }}>{it.menu_items?.name || "Item"}</div>
                            <div style={{ color: "rgba(17,24,39,0.72)", fontWeight: 900 }}>
                              Qty {it.qty}
                              <span style={{ marginLeft: 10 }}>{formatMoney(Number(it.qty || 0) * Number(it.price_each || 0))}</span>
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
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </main>
  );
}
