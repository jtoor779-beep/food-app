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
  // keeping your existing style (₹)
  return `₹${n.toFixed(0)}`;
}

function formatTime(ts) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts || "");
  }
}

function clampText(s, max = 140) {
  const str = String(s ?? "");
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + "…";
}

function safeNum(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

/* =========================
   PREMIUM THEME (match your style)
   ========================= */

const pageBg = {
  minHeight: "calc(100vh - 64px)",
  padding: 20,
  background:
    "radial-gradient(1200px 600px at 20% 10%, rgba(34,197,94,0.18), transparent 62%), radial-gradient(900px 520px at 80% 18%, rgba(59,130,246,0.14), transparent 58%), linear-gradient(180deg, #f7f7fb, #ffffff)",
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

function statusBadge(status) {
  const s = String(status || "").toLowerCase();

  if (s === "rejected" || s === "cancelled") {
    return {
      background: "rgba(254,242,242,0.9)",
      border: "1px solid rgba(239,68,68,0.25)",
      color: "#7f1d1d",
    };
  }

  if (s === "ready" || s === "delivered") {
    return {
      background: "rgba(236,253,245,0.9)",
      border: "1px solid rgba(16,185,129,0.25)",
      color: "#065f46",
    };
  }

  if (s === "delivering" || s === "picked_up" || s === "on_the_way") {
    return {
      background: "rgba(239,246,255,0.95)",
      border: "1px solid rgba(59,130,246,0.22)",
      color: "#1e40af",
    };
  }

  return {
    background: "rgba(255,247,237,0.95)",
    border: "1px solid rgba(249,115,22,0.20)",
    color: "#9a3412",
  };
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
  if (tone === "info") {
    return {
      background: "rgba(239,246,255,0.92)",
      border: "1px solid rgba(59,130,246,0.20)",
      color: "#1e40af",
    };
  }
  return {
    background: "rgba(255,247,237,0.92)",
    border: "1px solid rgba(249,115,22,0.18)",
    color: "#9a3412",
  };
}

function groceryStatusMessage(status) {
  const s = String(status || "").toLowerCase();

  if (s === "rejected" || s === "cancelled") {
    return { title: "Order cancelled ❌", text: "This grocery order was cancelled/rejected.", tone: "danger" };
  }
  if (s === "delivered") {
    return { title: "Delivered successfully ✅", text: "Thanks! Your groceries are delivered.", tone: "success" };
  }
  if (s === "on_the_way") {
    return { title: "On the way 🚚", text: "Your groceries are on the way.", tone: "info" };
  }
  if (s === "picked_up" || s === "delivering") {
    return { title: "Out for delivery 🛵", text: "A delivery partner is bringing your groceries.", tone: "info" };
  }
  if (s === "ready") {
    return { title: "Order is ready ✅", text: "Store marked your order ready. Delivery will start soon.", tone: "success" };
  }
  if (s === "preparing" || s === "accepted" || s === "confirmed") {
    return { title: "Preparing 🧺", text: "Store is preparing your grocery order.", tone: "info" };
  }
  return { title: "Order placed 🧾", text: "We received your grocery order. Store will confirm soon.", tone: "warn" };
}

function StatusMessageCard({ status }) {
  const m = groceryStatusMessage(status);
  const st = messageBoxStyle(m.tone);
  return (
    <div style={{ marginTop: 10, borderRadius: 16, padding: 12, ...st, boxShadow: "0 10px 28px rgba(0,0,0,0.06)" }}>
      <div style={{ fontWeight: 1000, letterSpacing: -0.1 }}>{m.title}</div>
      <div style={{ marginTop: 6, fontWeight: 850, opacity: 0.9, fontSize: 13, lineHeight: 1.45 }}>{m.text}</div>
    </div>
  );
}

/* =========================
   STEPS (same clean style)
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
   MAP HELPERS (SAFE + COMPAT)
   ========================= */

function numOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pickLatLng(obj) {
  if (!obj) return null;

  const candidates = [
    ["lat", "lng"],
    ["latitude", "longitude"],
    ["location_lat", "location_lng"],
    ["store_lat", "store_lng"],
    ["customer_lat", "customer_lng"],
    ["drop_lat", "drop_lng"],
  ];

  for (const [a, b] of candidates) {
    const la = numOrNull(obj?.[a]);
    const lo = numOrNull(obj?.[b]);
    if (la !== null && lo !== null) return { lat: la, lng: lo };
  }

  return null;
}

function isActiveDeliveryStatus(status) {
  const s = String(status || "").toLowerCase();
  return s === "delivering" || s === "picked_up" || s === "on_the_way";
}

export default function GroceryOrdersPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState("");

  const [user, setUser] = useState(null);
  const [role, setRole] = useState("");
  const [orders, setOrders] = useState([]);

  const [lastRealtimeHit, setLastRealtimeHit] = useState("");
  const channelRef = useRef(null);

  // ✅ store coords map: { [store_id]: { lat, lng } }
  const [storeCoords, setStoreCoords] = useState({});

  // ✅ live driver GPS per order: { [orderId]: { lat, lng, ts, source } }
  const [liveGpsByOrderId, setLiveGpsByOrderId] = useState({});
  const gpsPollRef = useRef(null);

  // ✅ details view toggle
  const [openOrderId, setOpenOrderId] = useState(null);

  const totalOrders = useMemo(() => orders.length, [orders]);

  const totalSpend = useMemo(() => {
    return (orders || []).reduce((sum, o) => sum + Number(o.total_amount || o.total || 0), 0);
  }, [orders]);

  const openOrder = useMemo(() => {
    if (!openOrderId) return null;
    return (orders || []).find((x) => x.id === openOrderId) || null;
  }, [orders, openOrderId]);

  function cleanupRealtime() {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }

  function stopGpsPolling() {
    if (gpsPollRef.current) {
      clearInterval(gpsPollRef.current);
      gpsPollRef.current = null;
    }
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

  function startGpsPolling(activeOrders) {
    stopGpsPolling();

    const active = (activeOrders || []).filter((o) => isActiveDeliveryStatus(o.status));
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

  // ✅ schema-safe store coords loader (tries different column sets)
  async function loadStoreCoordsFromOrders(ordersList) {
    try {
      const ids = Array.from(new Set((ordersList || []).map((o) => o.store_id).filter(Boolean)));
      if (ids.length === 0) {
        setStoreCoords({});
        return;
      }

      const tries = ["id, lat, lng", "id, latitude, longitude", "id, location_lat, location_lng"];

      let rows = null;
      for (const sel of tries) {
        const { data, error } = await supabase.from("grocery_stores").select(sel).in("id", ids);
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
      setStoreCoords(map);
    } catch {
      setStoreCoords({});
    }
  }

  async function loadGroceryOrders(customerId) {
    // main select (expected schema)
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
      customer_lat,
      customer_lng,
      grocery_order_items (
        id,
        order_id,
        product_name,
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
      instructions,
      customer_lat,
      customer_lng
    `;

    let data = null;
    let error = null;

    const r1 = await supabase
      .from("grocery_orders")
      .select(baseSelect)
      .eq("customer_user_id", customerId)
      .order("created_at", { ascending: false });

    if (!r1.error) {
      data = r1.data;
    } else {
      const r2 = await supabase
        .from("grocery_orders")
        .select(altSelect)
        .eq("customer_user_id", customerId)
        .order("created_at", { ascending: false });

      data = r2.data;
      error = r2.error;
    }

    if (error) throw error;

    const list = Array.isArray(data) ? data : [];
    const hasEmbedded = list.some((o) => Array.isArray(o.grocery_order_items));
    if (!hasEmbedded && list.length > 0) {
      const ids = list.map((o) => o.id).filter(Boolean);
      const { data: itemsData } = await supabase
        .from("grocery_order_items")
        .select("id, order_id, product_name, quantity, unit_price, line_total")
        .in("order_id", ids);

      const byOrder = {};
      for (const it of itemsData || []) {
        const k = it.order_id;
        if (!byOrder[k]) byOrder[k] = [];
        byOrder[k].push(it);
      }

      for (const o of list) {
        o.grocery_order_items = byOrder[o.id] || [];
      }
    }

    setOrders(list);
    await loadStoreCoordsFromOrders(list);

    // ✅ If open order removed, close safely
    if (openOrderId && !list.find((x) => x.id === openOrderId)) {
      setOpenOrderId(null);
    }
  }

  async function setupRealtime(customerId) {
    cleanupRealtime();

    channelRef.current = supabase
      .channel(`realtime-customer-grocery-orders-${customerId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "grocery_orders", filter: `customer_user_id=eq.${customerId}` }, async () => {
        setLastRealtimeHit(new Date().toLocaleTimeString());
        await loadGroceryOrders(customerId);
      })
      .subscribe();
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

      // redirect non-customer roles away
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

      await loadGroceryOrders(u.id);
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

  // ✅ Invoice action: open PREMIUM invoice page in SAME TAB (like restaurant invoice)
  function goToInvoicePage(order) {
    if (!order?.id) return;
    router.push(`/groceries/orders/invoice?id=${order.id}`);
  }

  return (
    <main style={pageBg}>
      <div style={{ width: "100%", margin: 0 }}>
        {/* HERO */}
        <div style={heroGlass}>
          <div style={{ minWidth: 260 }}>
            <div style={pill}>Customer • Grocery</div>
            <h1 style={heroTitle}>Grocery Orders</h1>
            <div style={subText}>Track your grocery orders & status updates (Realtime)</div>
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

            <Link href="/groceries" style={pill}>
              ← Groceries
            </Link>
            <Link href="/orders" style={pill}>
              Restaurant Orders →
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
            No grocery orders yet.{" "}
            <Link href="/groceries" style={{ color: "#111827", fontWeight: 1000 }}>
              Browse groceries →
            </Link>
          </div>
        ) : null}

        {/* =========================
            CLEAN LIST VIEW (NO MAPS)
           ========================= */}
        {!loading && orders.length > 0 && !openOrder ? (
          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
            {orders.map((o) => {
              const badge = statusBadge(o.status);
              const items = Array.isArray(o.grocery_order_items) ? o.grocery_order_items : [];
              const total = Number(o.total_amount || o.total || 0);

              const firstItemName = items?.[0]?.product_name || "Items";
              const qtyCount = items.reduce((s, it) => s + Number(it.quantity || 0), 0);

              return (
                <div key={o.id} style={listCard} onClick={() => setOpenOrderId(o.id)} title="Click to view details">
                  <div style={row}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ padding: "6px 10px", borderRadius: 999, fontWeight: 1000, fontSize: 12, ...badge }}>
                        {friendlyStatus(o.status).toUpperCase()}
                      </span>

                      <div style={{ fontWeight: 1000, color: "#0b1220" }}>
                        Grocery Order • <span style={{ opacity: 0.7 }}>{String(o.id).slice(0, 8)}…</span>
                      </div>

                      <span style={{ color: "rgba(17,24,39,0.65)", fontWeight: 900, fontSize: 12 }}>{formatTime(o.created_at)}</span>
                    </div>

                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <div style={{ fontWeight: 1000, color: "#0b1220" }}>{formatMoney(total)}</div>
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
                      {qtyCount > 1 ? (
                        <span style={{ marginLeft: 8, color: "rgba(17,24,39,0.55)", fontWeight: 900, fontSize: 12 }}>
                          + {qtyCount - 1} more
                        </span>
                      ) : null}
                    </div>

                    <div style={{ color: "rgba(17,24,39,0.55)", fontWeight: 850, fontSize: 12 }}>
                      Click to open tracking + items
                    </div>
                  </div>

                  <StatusMessageCard status={o.status} />
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
              const badge = statusBadge(o.status);
              const items = Array.isArray(o.grocery_order_items) ? o.grocery_order_items : [];
              const total = Number(o.total_amount || o.total || 0);

              // ✅ map points
              const pickup = o.store_id ? storeCoords[o.store_id] || null : null;
              const drop = pickLatLng({ customer_lat: o.customer_lat, customer_lng: o.customer_lng }) || null;

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
                <div style={cardGlass}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <button onClick={() => setOpenOrderId(null)} style={btnBack}>
                      ← Back to all grocery orders
                    </button>

                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ padding: "6px 10px", borderRadius: 999, fontWeight: 1000, fontSize: 12, ...badge }}>
                        {friendlyStatus(o.status).toUpperCase()}
                      </span>

                      <span style={{ color: "rgba(17,24,39,0.65)", fontWeight: 900, fontSize: 12 }}>{formatTime(o.created_at)}</span>

                      <span style={{ color: "rgba(17,24,39,0.65)", fontWeight: 900, fontSize: 12 }}>
                        Order ID: <span style={{ color: "#0b1220" }}>{o.id}</span>
                      </span>
                    </div>

                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <div style={{ fontWeight: 1000, color: "#0b1220" }}>Total: {formatMoney(total)}</div>

                      {/* ✅ INVOICE BUTTON (same tab) */}
                      <button
                        style={btnInvoice}
                        onClick={() => goToInvoicePage(o)}
                        title="Open invoice page"
                      >
                        Invoice / Print
                      </button>
                    </div>
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <StatusSteps status={o.status} />
                  </div>

                  <StatusMessageCard status={o.status} />

                  {/* ✅ LIVE TRACKING ONLY IN DETAILS */}
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

                    {!pickup ? (
                      <div style={{ marginTop: 6, color: "rgba(17,24,39,0.60)", fontWeight: 800, fontSize: 12 }}>
                        Note: Store pickup coordinates not found yet. Add lat/lng to <b>grocery_stores</b> to show pickup point.
                      </div>
                    ) : null}
                  </div>

                  <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {/* Delivery */}
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
                        <b>Phone:</b> {o.customer_phone || "—"}
                      </div>
                      <div style={{ marginTop: 4, color: "rgba(17,24,39,0.72)", fontWeight: 850 }}>
                        <b>Address:</b> {o.delivery_address || "—"}
                      </div>
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
                        {items.length === 0 ? (
                          <div style={{ color: "rgba(17,24,39,0.65)", fontWeight: 850, fontSize: 13 }}>Items will appear here.</div>
                        ) : (
                          items.map((it) => (
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
                              <div style={{ fontWeight: 950, color: "#0b1220" }}>{it.product_name || "Item"}</div>
                              <div style={{ color: "rgba(17,24,39,0.72)", fontWeight: 900 }}>
                                Qty {Number(it.quantity || 0)}
                                <span style={{ marginLeft: 10 }}>
                                  {formatMoney(Number(it.line_total || 0) || Number(it.quantity || 0) * Number(it.unit_price || 0))}
                                </span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      {o.store_id ? (
                        <div style={{ marginTop: 10, color: "rgba(17,24,39,0.65)", fontWeight: 850, fontSize: 12 }}>
                          Store ID: <span style={{ color: "#0b1220" }}>{o.store_id}</span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        ) : null}
      </div>
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

const btnInvoice = {
  padding: "10px 12px",
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.90)",
  color: "#111827",
  fontWeight: 1000,
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