"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import supabase from "@/lib/supabase";

/* =========================
   PREMIUM THEME (match your orders page)
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
  minWidth: 160,
  padding: "12px 14px",
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
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
};

const btnLight = {
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.9)",
  color: "#111",
  fontWeight: 950,
  padding: "10px 14px",
  borderRadius: 999,
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
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

const grid2 = {
  display: "grid",
  gridTemplateColumns: "1.2fr 0.8fr",
  gap: 14,
  marginTop: 14,
};

const grid3 = {
  display: "grid",
  gridTemplateColumns: "repeat(4, 1fr)",
  gap: 12,
  marginTop: 12,
};

const gridSide = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: 14,
};

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.9)",
  outline: "none",
  fontWeight: 850,
};

const selectStyle = {
  ...inputStyle,
  cursor: "pointer",
};

const tabRow = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginTop: 12,
};

const tabBtn = (active) => ({
  ...btnLight,
  padding: "8px 12px",
  borderRadius: 999,
  border: active ? "1px solid rgba(17,24,39,0.9)" : "1px solid rgba(0,0,0,0.12)",
  background: active ? "rgba(17,24,39,0.92)" : "rgba(255,255,255,0.9)",
  color: active ? "#fff" : "#111",
});

const tableWrap = {
  marginTop: 12,
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.08)",
  overflow: "hidden",
  background: "rgba(255,255,255,0.8)",
};

const table = {
  width: "100%",
  borderCollapse: "collapse",
};

const th = {
  textAlign: "left",
  fontSize: 12,
  fontWeight: 1000,
  color: "rgba(17,24,39,0.75)",
  padding: "10px 12px",
  borderBottom: "1px solid rgba(0,0,0,0.07)",
  background: "rgba(247,247,251,0.9)",
  position: "sticky",
  top: 0,
  zIndex: 2,
};

const td = {
  padding: "10px 12px",
  borderBottom: "1px solid rgba(0,0,0,0.06)",
  fontSize: 12,
  color: "rgba(17,24,39,0.85)",
  verticalAlign: "top",
};

const miniTag = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(255,255,255,0.86)",
  fontWeight: 950,
  fontSize: 12,
  color: "rgba(17,24,39,0.8)",
};

function pick(obj, keys, fallback = null) {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null && String(obj[k]).trim() !== "") return obj[k];
  }
  return fallback;
}

function moneyINR(v) {
  const n = Number(v || 0);
  if (!isFinite(n)) return "₹0";
  return `₹${n.toFixed(0)}`;
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

function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function dayKey(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function safeNumber(v, fallback = 0) {
  const n = Number(v);
  return isFinite(n) ? n : fallback;
}

function toText(v) {
  return String(v || "").trim();
}

// simple beep (no extra libraries)
function beepOnce() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.value = 0.06;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    setTimeout(() => {
      o.stop();
      ctx.close();
    }, 180);
  } catch {
    // ignore
  }
}

function buildCSV(rows) {
  const esc = (s) => `"${String(s ?? "").replaceAll('"', '""')}"`;
  const header = [
    "order_id",
    "order_number",
    "created_at",
    "status",
    "customer_name",
    "customer_phone",
    "customer_address",
    "total",
    "items",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        esc(r.id),
        esc(r.order_number),
        esc(r.created_at),
        esc(r.status),
        esc(r.customer_name),
        esc(r.customer_phone),
        esc(r.customer_address),
        esc(r.total),
        esc(r.items_text),
      ].join(",")
    );
  }
  return lines.join("\n");
}

function buildKitchenTicketHTML(order, prepEtaMins) {
  const esc = (s) => String(s ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const items = order.items || [];
  const rows = items
    .map((it) => {
      const name = esc(pick(it, ["item_name", "name", "title"], "Item"));
      const qty = esc(pick(it, ["qty", "quantity"], 1));
      return `<tr><td style="padding:6px 0;border-bottom:1px dashed #ddd;"><b>${name}</b><div style="color:#666;font-size:12px;">Qty: ${qty}</div></td></tr>`;
    })
    .join("");

  const orderNo = esc(pick(order, ["order_number", "orderNo", "order_no", "id"], "—"));
  const when = esc(pick(order, ["created_at", "createdAt", "created"], ""));
  const customerName = esc(pick(order, ["customer_name", "name", "full_name"], "-"));
  const customerPhone = esc(pick(order, ["customer_phone", "phone", "mobile", "customer_mobile"], "-"));
  const addr = esc(pick(order, ["customer_address", "address", "delivery_address", "address_line1"], "") || "");
  const note = esc(pick(order, ["instructions", "note", "delivery_instructions"], "") || "");

  return `
  <html>
    <head>
      <meta charset="utf-8"/>
      <title>Kitchen Ticket</title>
      <style>
        body{font-family:Arial, sans-serif; padding:16px;}
        .h{font-size:18px;font-weight:800;}
        .sub{color:#555;margin-top:6px;}
        .box{border:1px solid #ddd;border-radius:10px;padding:12px;margin-top:12px;}
        .muted{color:#666;font-size:12px;}
        table{width:100%;border-collapse:collapse;margin-top:10px;}
      </style>
    </head>
    <body>
      <div class="h">KITCHEN TICKET</div>
      <div class="sub">Order #${orderNo}</div>
      <div class="muted">${when ? `Placed: ${when}` : ""} ${prepEtaMins ? `• Prep ETA: ${prepEtaMins} mins` : ""}</div>

      <div class="box">
        <div><b>Customer:</b> ${customerName}</div>
        <div class="muted">${customerPhone}</div>
        ${addr ? `<div style="margin-top:8px;"><b>Address:</b><div class="muted">${addr}</div></div>` : ""}
        ${note ? `<div style="margin-top:8px;"><b>Notes:</b><div class="muted">${note}</div></div>` : ""}
      </div>

      <div class="box">
        <div><b>Items</b></div>
        <table>${rows || `<tr><td class="muted">No items found</td></tr>`}</table>
      </div>

      <script>window.onload = () => { window.print(); };</script>
    </body>
  </html>
  `;
}

export default function RestaurantOwnerDashboard() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [role, setRole] = useState("");
  const [restaurantName, setRestaurantName] = useState("");
  const [restaurantId, setRestaurantId] = useState("");

  // ✅ NEW: multi-restaurant switch
  const [ownerRestaurants, setOwnerRestaurants] = useState([]); // full rows
  const [activeRestaurantId, setActiveRestaurantId] = useState(""); // selected

  const [orders, setOrders] = useState([]); // merged orders with items

  // dashboard controls
  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("newest"); // newest | oldest | highest | lowest
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [soundOnNew, setSoundOnNew] = useState(true);

  // extra premium controls
  const [chartMode, setChartMode] = useState("revenue"); // revenue | orders
  const [kitchenView, setKitchenView] = useState(false); // quick compact view
  const [onlyLate, setOnlyLate] = useState(false); // show only late orders
  const [lastRefreshed, setLastRefreshed] = useState("");

  // Restaurant operational toggles (safe fallback if columns not exist)
  const [acceptingOrders, setAcceptingOrders] = useState(true);
  const [busyMode, setBusyMode] = useState(false);
  const [extraPrepMins, setExtraPrepMins] = useState(0);
  const [prepTimeMins, setPrepTimeMins] = useState(20);
  const [restaurantSettingsNote, setRestaurantSettingsNote] = useState("");

  // ✅ keep one realtime channel only (prevents duplicates)
  const channelRef = useRef(null);
  const currentRealtimeRidRef = useRef("");

  // track new orders
  const knownOrderIdsRef = useRef(new Set());
  const justNewIdsRef = useRef(new Set()); // highlight
  const refreshTimerRef = useRef(null);

  async function tryUpdateRestaurantField(rid, fieldCandidates, value) {
    for (const field of fieldCandidates) {
      try {
        const { error } = await supabase.from("restaurants").update({ [field]: value }).eq("id", rid);
        if (!error) return true;
      } catch {
        // ignore
      }
    }
    return false;
  }

  // ✅ NEW: fetch all restaurants for owner (so we can switch)
  async function fetchOwnerRestaurantsList(userId) {
    const res = await supabase
      .from("restaurants")
      .select("*")
      .eq("owner_user_id", userId)
      .order("created_at", { ascending: false });

    if (res.error) throw res.error;
    return res.data || [];
  }

  // ✅ NEW: safely fetch profile role even if duplicate rows exist
  async function fetchProfileRoleSafe(userId) {
    const firstTry = await supabase.from("profiles").select("role").eq("user_id", userId).maybeSingle();
    if (!firstTry?.error) return firstTry.data || null;

    const msg = String(firstTry.error?.message || "");
    const isMultiple = msg.toLowerCase().includes("multiple") || msg.toLowerCase().includes("json object requested");

    if (!isMultiple) return null;

    const fallback = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (fallback.error) return null;
    return fallback.data && fallback.data[0] ? fallback.data[0] : null;
  }

  function applyRestaurantRow(r) {
    if (!r?.id) return;

    setRestaurantId(r.id);
    setRestaurantName(r.name || "");
    setActiveRestaurantId(r.id);

    // read restaurant toggles if your table already has columns (otherwise fallback)
    const accepting = pick(r, ["accepting_orders", "is_accepting_orders", "is_open", "open", "active"], null);
    if (accepting !== null) setAcceptingOrders(!!accepting);

    const busy = pick(r, ["busy_mode", "is_busy", "busy"], null);
    if (busy !== null) setBusyMode(!!busy);

    const extraPrep = pick(r, ["extra_prep_mins", "extra_prep_minutes", "busy_extra_mins"], null);
    if (extraPrep !== null) setExtraPrepMins(safeNumber(extraPrep, 0));

    const prep = pick(r, ["prep_time_mins", "prep_minutes", "default_prep_mins"], null);
    if (prep !== null) setPrepTimeMins(safeNumber(prep, 20));
  }

  function setupRealtime(rid) {
    if (!rid) return;

    // ✅ if restaurant changed, remove old channel and create new one
    if (currentRealtimeRidRef.current && currentRealtimeRidRef.current !== rid && channelRef.current) {
      try {
        supabase.removeChannel(channelRef.current);
      } catch {
        // ignore
      }
      channelRef.current = null;
      currentRealtimeRidRef.current = "";
    }

    if (channelRef.current) return;

    const ch = supabase
      .channel(`owner_dash_${rid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${rid}` }, () => {
        load();
      })
      .subscribe();

    channelRef.current = ch;
    currentRealtimeRidRef.current = rid;
  }

  async function loadOrdersForRestaurant(rid) {
    // orders
    const { data: o, error: oErr } = await supabase
      .from("orders")
      .select("*")
      .eq("restaurant_id", rid)
      .order("created_at", { ascending: false });

    if (oErr) throw oErr;

    const baseOrders = o || [];
    const orderIds = baseOrders.map((x) => x.id).filter(Boolean);

    // Try to attach items (safe: if table missing, it will fail but dashboard still works)
    let itemsByOrder = {};
    if (orderIds.length > 0) {
      try {
        const { data: items, error: iErr } = await supabase.from("order_items").select("*").in("order_id", orderIds);
        if (!iErr && items) {
          itemsByOrder = items.reduce((acc, it) => {
            const oid = it.order_id;
            if (!oid) return acc;
            acc[oid] = acc[oid] || [];
            acc[oid].push(it);
            return acc;
          }, {});
        }
      } catch {
        // ignore
      }
    }

    const merged = baseOrders.map((ord) => ({
      ...ord,
      items: itemsByOrder[ord.id] || [],
    }));

    // detect NEW orders
    const known = knownOrderIdsRef.current;
    const newIds = [];
    for (const ord of merged) {
      if (ord?.id && !known.has(ord.id)) newIds.push(ord.id);
    }
    known.clear();
    for (const ord of merged) if (ord?.id) known.add(ord.id);

    justNewIdsRef.current = new Set(newIds);

    setOrders(merged);

    const nowTxt = new Date().toLocaleTimeString();
    setLastRefreshed(nowTxt);

    if (newIds.length > 0 && soundOnNew) beepOnce();

    setupRealtime(rid);
  }

  async function load() {
    setErr("");
    setInfo("");
    setRestaurantSettingsNote("");
    setLoading(true);

    const { data } = await supabase.auth.getSession();
    const session = data?.session;

    if (!session?.user) {
      setErr("Not logged in.");
      setLoading(false);
      return;
    }

    setOwnerEmail(session.user.email || "");

    // ✅ role
    const prof = await fetchProfileRoleSafe(session.user.id);
    setRole(prof?.role || "restaurant_owner");

    // ✅ fetch all restaurants for switch dropdown
    let list = [];
    try {
      list = await fetchOwnerRestaurantsList(session.user.id);
    } catch (e) {
      setErr(e?.message || String(e));
      setLoading(false);
      return;
    }

    setOwnerRestaurants(list);

    if (!list || list.length === 0) {
      setErr("No restaurant found for this owner.");
      setLoading(false);
      return;
    }

    // ✅ decide active restaurant:
    // 1) if activeRestaurantId exists and still in list, keep it
    // 2) else pick latest (list[0])
    const stillExists = activeRestaurantId && list.some((r) => r.id === activeRestaurantId);
    const activeRow = stillExists ? list.find((r) => r.id === activeRestaurantId) : list[0];

    applyRestaurantRow(activeRow);

    if (list.length > 1) {
      setInfo("Select restaurant from dropdown ✅");
    }

    try {
      await loadOrdersForRestaurant(activeRow.id);
      setLoading(false);
      const nowTxt = new Date().toLocaleTimeString();
      setInfo((prev) => prev || `Updated ✅ (${nowTxt})`);
    } catch (e) {
      setErr(e?.message || String(e));
      setLoading(false);
      return;
    }
  }

  // ✅ when user changes restaurant from dropdown
  async function switchRestaurant(nextId) {
    setErr("");
    setInfo("");
    setRestaurantSettingsNote("");
    setLoading(true);

    const row = ownerRestaurants.find((r) => r.id === nextId);
    if (!row) {
      setErr("Restaurant not found in list.");
      setLoading(false);
      return;
    }

    // clear new-order highlight for new restaurant context
    knownOrderIdsRef.current = new Set();
    justNewIdsRef.current = new Set();

    applyRestaurantRow(row);

    try {
      await loadOrdersForRestaurant(row.id);
      setLoading(false);
      const nowTxt = new Date().toLocaleTimeString();
      setInfo(`Switched ✅ (${nowTxt})`);
    } catch (e) {
      setErr(e?.message || String(e));
      setLoading(false);
    }
  }

  useEffect(() => {
    load();

    return () => {
      if (channelRef.current) {
        try {
          supabase.removeChannel(channelRef.current);
        } catch {
          // ignore
        }
        channelRef.current = null;
      }
      currentRealtimeRidRef.current = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto refresh timer
  useEffect(() => {
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }

    if (!autoRefresh) return;

    refreshTimerRef.current = setInterval(() => {
      load();
    }, 15000); // 15 seconds

    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, soundOnNew, activeRestaurantId]);

  async function updateStatus(orderId, newStatus) {
    setErr("");
    const { error } = await supabase.from("orders").update({ status: newStatus }).eq("id", orderId);
    if (error) {
      setErr(error.message);
      return;
    }
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o)));
  }

  async function bulkUpdateStatus(ids, newStatus) {
    if (!ids || ids.length === 0) return;
    setErr("");
    try {
      const { error } = await supabase.from("orders").update({ status: newStatus }).in("id", ids);
      if (error) throw error;
      setOrders((prev) => prev.map((o) => (ids.includes(o.id) ? { ...o, status: newStatus } : o)));
      setInfo(`Bulk updated ${ids.length} orders → ${newStatus} ✅`);
    } catch (e) {
      setErr(e?.message || String(e));
    }
  }

  async function toggleAccepting(next) {
    setRestaurantSettingsNote("");
    setAcceptingOrders(next);

    if (!restaurantId) return;

    const ok = await tryUpdateRestaurantField(
      restaurantId,
      ["accepting_orders", "is_accepting_orders", "is_open", "open", "active"],
      next
    );

    if (!ok) {
      setRestaurantSettingsNote(
        "Note: Your restaurants table does not have a column for Open/Close yet. Dashboard will still show the toggle, but it won’t save until you add a column."
      );
    }
  }

  async function toggleBusy(next) {
    setRestaurantSettingsNote("");
    setBusyMode(next);

    if (!restaurantId) return;

    const ok = await tryUpdateRestaurantField(restaurantId, ["busy_mode", "is_busy", "busy"], next);
    if (!ok) {
      setRestaurantSettingsNote(
        "Note: Your restaurants table does not have a column for Busy Mode yet. Dashboard will still show the toggle, but it won’t save until you add a column."
      );
    }
  }

  async function savePrepTimes() {
    setRestaurantSettingsNote("");
    if (!restaurantId) return;

    const pOk = await tryUpdateRestaurantField(restaurantId, ["prep_time_mins", "prep_minutes", "default_prep_mins"], prepTimeMins);
    const eOk = await tryUpdateRestaurantField(
      restaurantId,
      ["extra_prep_mins", "extra_prep_minutes", "busy_extra_mins"],
      extraPrepMins
    );

    if (!pOk || !eOk) {
      setRestaurantSettingsNote(
        "Note: Your restaurants table does not have prep time columns yet. Add columns to save prep times permanently."
      );
    } else {
      setRestaurantSettingsNote("Saved ✅");
      setTimeout(() => setRestaurantSettingsNote(""), 1500);
    }
  }

  function printKitchenTicket(order) {
    try {
      const eta = prepTimeMins + (busyMode ? extraPrepMins : 0);
      const html = buildKitchenTicketHTML(order, eta);
      const w = window.open("", "_blank");
      if (!w) {
        setErr("Popup blocked. Please allow popups for printing.");
        return;
      }
      w.document.open();
      w.document.write(html);
      w.document.close();
    } catch (e) {
      setErr(e?.message || String(e));
    }
  }

  // ---- KPIs + chart + analytics ----
  const derived = useMemo(() => {
    const now = Date.now();
    const todayStart = startOfDay(now);

    const totals = {
      all: orders.length,
      pending: 0,
      preparing: 0,
      ready: 0,
      delivering: 0,
      picked_up: 0,
      on_the_way: 0,
      delivered: 0,
      rejected: 0,
      todayOrders: 0,
      todayRevenue: 0,
      weekRevenue: 0,
      weekOrders: 0,
      avgOrderValueToday: 0,
      avgOrderValueWeek: 0,
      peakHourToday: "-",
      lateCount: 0,
      cancelRate: 0,
      repeatCustomers7d: 0,
    };

    // build last 7 days buckets
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const key = d.toISOString().slice(0, 10);
      days.push({ key, label: d.toLocaleDateString(undefined, { weekday: "short" }), revenue: 0, orders: 0 });
    }
    const dayMap = Object.fromEntries(days.map((x) => [x.key, x]));

    const hourCount = {};
    let rejectedOrCancelled = 0;

    const itemAgg = {};
    const itemAggWeek = {};
    const phoneCount7d = {};

    const eta = safeNumber(prepTimeMins, 20) + (busyMode ? safeNumber(extraPrepMins, 0) : 0);

    for (const o of orders) {
      const s = String(o.status || "").toLowerCase();
      if (totals[s] !== undefined) totals[s] += 1;
      if (s === "rejected" || s === "cancelled" || s === "canceled") rejectedOrCancelled += 1;

      const created = o.created_at || o.createdAt || o.created;
      const createdMs = created ? new Date(created).getTime() : null;

      const items = o.items || [];
      const calcTotal = items.reduce((sum, it) => {
        const price = safeNumber(pick(it, ["price", "item_price", "unit_price"], 0), 0);
        const qty = safeNumber(pick(it, ["qty", "quantity"], 0), 0);
        return sum + price * qty;
      }, 0);

      const amtRaw = pick(o, ["total", "total_amount", "total_price", "amount", "grand_total", "payable_total"], calcTotal);
      const amt = safeNumber(amtRaw, 0);

      if (createdMs && createdMs >= todayStart) {
        totals.todayOrders += 1;
        totals.todayRevenue += amt;

        const h = String(new Date(createdMs).getHours());
        hourCount[h] = (hourCount[h] || 0) + 1;

        for (const it of items) {
          const name = toText(pick(it, ["item_name", "name", "title"], "Item"));
          const qty = safeNumber(pick(it, ["qty", "quantity"], 0), 0);
          const price = safeNumber(pick(it, ["price", "item_price", "unit_price"], 0), 0);
          if (!itemAgg[name]) itemAgg[name] = { qty: 0, revenue: 0 };
          itemAgg[name].qty += qty;
          itemAgg[name].revenue += qty * price;
        }
      }

      if (createdMs) {
        const k = dayKey(createdMs);
        if (dayMap[k]) {
          dayMap[k].revenue += amt;
          dayMap[k].orders += 1;
          totals.weekRevenue += amt;
          totals.weekOrders += 1;

          const ph = toText(pick(o, ["customer_phone", "phone", "mobile", "customer_mobile"], ""));
          if (ph) phoneCount7d[ph] = (phoneCount7d[ph] || 0) + 1;

          for (const it of items) {
            const name = toText(pick(it, ["item_name", "name", "title"], "Item"));
            const qty = safeNumber(pick(it, ["qty", "quantity"], 0), 0);
            const price = safeNumber(pick(it, ["price", "item_price", "unit_price"], 0), 0);
            if (!itemAggWeek[name]) itemAggWeek[name] = { qty: 0, revenue: 0 };
            itemAggWeek[name].qty += qty;
            itemAggWeek[name].revenue += qty * price;
          }
        }

        if ((s === "pending" || s === "preparing") && eta > 0) {
          const ageMins = (now - createdMs) / 60000;
          if (ageMins > eta) totals.lateCount += 1;
        }
      }
    }

    totals.avgOrderValueToday = totals.todayOrders > 0 ? totals.todayRevenue / totals.todayOrders : 0;
    totals.avgOrderValueWeek = totals.weekOrders > 0 ? totals.weekRevenue / totals.weekOrders : 0;
    totals.cancelRate = totals.all > 0 ? Math.round((rejectedOrCancelled / totals.all) * 100) : 0;

    let bestH = null;
    let bestC = 0;
    for (const k of Object.keys(hourCount)) {
      if (hourCount[k] > bestC) {
        bestC = hourCount[k];
        bestH = k;
      }
    }
    if (bestH !== null) totals.peakHourToday = `${bestH}:00`;

    totals.repeatCustomers7d = Object.values(phoneCount7d).filter((c) => c >= 2).length;

    const maxRevenue = Math.max(1, ...days.map((d) => d.revenue));
    const maxOrders = Math.max(1, ...days.map((d) => d.orders));

    const topItemsToday = Object.entries(itemAgg)
      .map(([name, v]) => ({ name, qty: v.qty, revenue: v.revenue }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 6);

    const topItemsWeek = Object.entries(itemAggWeek)
      .map(([name, v]) => ({ name, qty: v.qty, revenue: v.revenue }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 6);

    return { totals, days, maxRevenue, maxOrders, topItemsToday, topItemsWeek };
  }, [orders, prepTimeMins, extraPrepMins, busyMode]);

  const filteredOrders = useMemo(() => {
    let rows = [...orders];

    if (onlyLate) {
      const now = Date.now();
      const eta = safeNumber(prepTimeMins, 20) + (busyMode ? safeNumber(extraPrepMins, 0) : 0);
      rows = rows.filter((o) => {
        const s = String(o.status || "").toLowerCase();
        if (!(s === "pending" || s === "preparing")) return false;
        const created = o.created_at || o.createdAt || o.created;
        const createdMs = created ? new Date(created).getTime() : 0;
        const ageMins = createdMs ? (now - createdMs) / 60000 : 0;
        return ageMins > eta;
      });
    }

    if (filterStatus !== "all") {
      rows = rows.filter((o) => String(o.status || "").toLowerCase() === filterStatus);
    }

    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter((o) => {
        const id = String(o.id || "").toLowerCase();
        const no = String(pick(o, ["order_number", "orderNo", "order_no"], "") || "").toLowerCase();
        const custName = String(pick(o, ["customer_name", "name", "full_name"], "") || "").toLowerCase();
        const phone = String(pick(o, ["customer_phone", "phone", "mobile", "customer_mobile"], "") || "").toLowerCase();
        return id.includes(q) || no.includes(q) || custName.includes(q) || phone.includes(q);
      });
    }

    rows.sort((a, b) => {
      const aTime = new Date(a.created_at || a.createdAt || a.created || 0).getTime() || 0;
      const bTime = new Date(b.created_at || b.createdAt || b.created || 0).getTime() || 0;

      const aItems = a.items || [];
      const bItems = b.items || [];

      const aCalc = aItems.reduce((sum, it) => {
        const price = safeNumber(pick(it, ["price", "item_price", "unit_price"], 0), 0);
        const qty = safeNumber(pick(it, ["qty", "quantity"], 0), 0);
        return sum + price * qty;
      }, 0);

      const bCalc = bItems.reduce((sum, it) => {
        const price = safeNumber(pick(it, ["price", "item_price", "unit_price"], 0), 0);
        const qty = safeNumber(pick(it, ["qty", "quantity"], 0), 0);
        return sum + price * qty;
      }, 0);

      const aAmt = safeNumber(pick(a, ["total", "total_amount", "total_price", "amount", "grand_total", "payable_total"], aCalc), 0);
      const bAmt = safeNumber(pick(b, ["total", "total_amount", "total_price", "amount", "grand_total", "payable_total"], bCalc), 0);

      if (sortBy === "newest") return bTime - aTime;
      if (sortBy === "oldest") return aTime - bTime;
      if (sortBy === "highest") return bAmt - aAmt;
      if (sortBy === "lowest") return aAmt - bAmt;
      return bTime - aTime;
    });

    if (kitchenView) {
      const priority = (s) => {
        const st = String(s || "").toLowerCase();
        if (st === "pending") return 1;
        if (st === "preparing") return 2;
        if (st === "ready") return 3;
        if (st === "on_the_way" || st === "delivering" || st === "picked_up") return 4;
        if (st === "delivered") return 5;
        return 6;
      };
      rows.sort((a, b) => priority(a.status) - priority(b.status));
    }

    return rows;
  }, [orders, filterStatus, search, sortBy, onlyLate, prepTimeMins, extraPrepMins, busyMode, kitchenView]);

  function downloadCSV() {
    const rows = filteredOrders.map((o) => {
      const items = o.items || [];
      const itemsText = items
        .map((it) => {
          const name = toText(pick(it, ["item_name", "name", "title"], ""));
          const qty = safeNumber(pick(it, ["qty", "quantity"], 0), 0);
          return `${name} x${qty}`;
        })
        .filter(Boolean)
        .join(" | ");

      const calcTotal = items.reduce((sum, it) => {
        const price = safeNumber(pick(it, ["price", "item_price", "unit_price"], 0), 0);
        const qty = safeNumber(pick(it, ["qty", "quantity"], 0), 0);
        return sum + price * qty;
      }, 0);

      const total = safeNumber(pick(o, ["total", "total_amount", "total_price", "amount", "grand_total", "payable_total"], calcTotal), 0);

      return {
        id: o.id || "",
        order_number: pick(o, ["order_number", "orderNo", "order_no"], ""),
        created_at: o.created_at || o.createdAt || o.created || "",
        status: o.status || "",
        customer_name: pick(o, ["customer_name", "name", "full_name"], ""),
        customer_phone: pick(o, ["customer_phone", "phone", "mobile", "customer_mobile"], ""),
        customer_address: pick(o, ["customer_address", "address", "delivery_address"], ""),
        total,
        items_text: itemsText,
      };
    });

    const csv = buildCSV(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `restaurant_orders_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const statusTabs = useMemo(() => {
    const t = derived.totals;
    return [
      { key: "all", label: `All (${t.all})` },
      { key: "pending", label: `Pending (${t.pending})` },
      { key: "preparing", label: `Preparing (${t.preparing})` },
      { key: "ready", label: `Ready (${t.ready})` },
      { key: "on_the_way", label: `On The Way (${t.on_the_way})` },
      { key: "delivered", label: `Delivered (${t.delivered})` },
      { key: "rejected", label: `Rejected (${t.rejected})` },
    ];
  }, [derived.totals]);

  const quickIdsForBulk = useMemo(() => {
    const ids = filteredOrders
      .filter((o) => ["pending", "preparing"].includes(String(o.status || "").toLowerCase()))
      .slice(0, 20)
      .map((o) => o.id)
      .filter(Boolean);
    return ids;
  }, [filteredOrders]);

  return (
    <main style={pageBg}>
      <div style={{ width: "100%", margin: 0 }}>
        {/* HERO */}
        <div style={heroGlass}>
          <div style={{ minWidth: 260 }}>
            <div style={pill}>Owner</div>
            <h1 style={heroTitle}>Dashboard</h1>
            <div style={subText}>Overview • Live orders • Earnings • Controls</div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <Link href="/restaurants/orders" style={btnLight}>
              Full Orders Page
            </Link>
            <Link href="/restaurants/menu" style={btnLight}>
              Manage Menu
            </Link>
            <button onClick={load} style={btnDark}>
              Refresh
            </button>
          </div>
        </div>

        {/* Identity */}
        <div style={{ ...cardGlass, marginTop: 12 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <span style={pill}>Owner: {ownerEmail || "-"}</span>
            <span style={pill}>Role: {role || "-"}</span>

            {/* ✅ NEW: Restaurant switch dropdown (shows only if multiple) */}
            {ownerRestaurants.length > 1 ? (
              <span style={{ ...pill, gap: 10 }}>
                Restaurant:
                <select
                  value={activeRestaurantId || ""}
                  onChange={(e) => switchRestaurant(e.target.value)}
                  style={{ ...selectStyle, padding: "6px 10px", borderRadius: 999, width: 260 }}
                >
                  {ownerRestaurants.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name || "Unnamed Restaurant"} ({String(r.id).slice(0, 6)}…)
                    </option>
                  ))}
                </select>
              </span>
            ) : (
              <span style={pill}>Restaurant: {restaurantName || "-"}</span>
            )}

            <span style={pill}>Restaurant ID: {restaurantId || "-"}</span>
            <span style={miniTag}>Last refreshed: {lastRefreshed || "-"}</span>
            <span style={miniTag}>Late: {derived.totals.lateCount}</span>
            <span style={miniTag}>Cancel/Reject: {derived.totals.cancelRate}%</span>
            <span style={miniTag}>Repeat (7d): {derived.totals.repeatCustomers7d}</span>
          </div>

          {err ? <div style={alertErr}>{err}</div> : null}
          {info ? <div style={alertInfo}>{info}</div> : null}
        </div>

        {/* KPI CARDS */}
        <div style={grid3}>
          <div style={statCard}>
            <div style={statNum}>{derived.totals.todayOrders}</div>
            <div style={statLabel}>Today Orders</div>
          </div>

          <div style={statCard}>
            <div style={statNum}>{moneyINR(derived.totals.todayRevenue)}</div>
            <div style={statLabel}>Today Revenue</div>
          </div>

          <div style={statCard}>
            <div style={statNum}>{moneyINR(derived.totals.avgOrderValueToday)}</div>
            <div style={statLabel}>Avg Order Value (Today)</div>
          </div>

          <div style={statCard}>
            <div style={statNum}>{derived.totals.pending + derived.totals.preparing + derived.totals.ready}</div>
            <div style={statLabel}>In Progress (P+Pr+R)</div>
          </div>
        </div>

        {/* MAIN GRID */}
        <div style={grid2}>
          {/* LEFT: Orders + Table */}
          <div style={cardGlass}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 1000, color: "#0b1220", fontSize: 14 }}>Orders Management</div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={downloadCSV} style={{ ...btnLight, padding: "8px 12px" }}>
                  Download CSV
                </button>
                <button
                  onClick={() => {
                    setSearch("");
                    setFilterStatus("all");
                    setSortBy("newest");
                    setOnlyLate(false);
                    setKitchenView(false);
                  }}
                  style={{ ...btnLight, padding: "8px 12px" }}
                >
                  Reset
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div style={tabRow}>
              {statusTabs.map((t) => (
                <button key={t.key} onClick={() => setFilterStatus(t.key)} style={tabBtn(filterStatus === t.key)}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Search + Sort + Toggles */}
            <div style={{ display: "grid", gridTemplateColumns: "1.3fr 0.7fr", gap: 12, marginTop: 12 }}>
              <div>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={inputStyle}
                  placeholder="Search by order id / order number / customer / phone"
                />
              </div>

              <div>
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={selectStyle}>
                  <option value="newest">Sort: Newest</option>
                  <option value="oldest">Sort: Oldest</option>
                  <option value="highest">Sort: Highest Amount</option>
                  <option value="lowest">Sort: Lowest Amount</option>
                </select>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12, alignItems: "center" }}>
              <button onClick={() => setAutoRefresh((v) => !v)} style={{ ...btnLight, padding: "8px 12px" }}>
                Auto Refresh: {autoRefresh ? "ON" : "OFF"}
              </button>
              <button onClick={() => setSoundOnNew((v) => !v)} style={{ ...btnLight, padding: "8px 12px" }}>
                New Order Sound: {soundOnNew ? "ON" : "OFF"}
              </button>
              <button onClick={() => setKitchenView((v) => !v)} style={{ ...btnLight, padding: "8px 12px" }}>
                Kitchen View: {kitchenView ? "ON" : "OFF"}
              </button>
              <button onClick={() => setOnlyLate((v) => !v)} style={{ ...btnLight, padding: "8px 12px" }}>
                Late Only: {onlyLate ? "ON" : "OFF"}
              </button>
              <div style={{ ...pill, background: "rgba(255,255,255,0.85)" }}>
                Peak Hour Today: <span style={{ fontWeight: 1000 }}>{derived.totals.peakHourToday}</span>
              </div>
            </div>

            {/* Bulk actions */}
            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <span style={miniTag}>Bulk (Pending+Preparing): {quickIdsForBulk.length}</span>
              <button
                onClick={() => bulkUpdateStatus(quickIdsForBulk, "preparing")}
                style={{ ...btnLight, padding: "8px 12px" }}
                disabled={quickIdsForBulk.length === 0}
              >
                Mark Preparing
              </button>
              <button
                onClick={() => bulkUpdateStatus(quickIdsForBulk, "ready")}
                style={{ ...btnLight, padding: "8px 12px" }}
                disabled={quickIdsForBulk.length === 0}
              >
                Mark Ready
              </button>
            </div>

            {/* Table */}
            {loading ? (
              <div style={{ marginTop: 12, color: "rgba(17,24,39,0.7)", fontWeight: 900 }}>Loading…</div>
            ) : filteredOrders.length === 0 ? (
              <div style={emptyBox}>No orders match your filters/search.</div>
            ) : (
              <div style={tableWrap}>
                <div style={{ maxHeight: 420, overflow: "auto" }}>
                  <table style={table}>
                    <thead>
                      <tr>
                        <th style={th}>Status</th>
                        <th style={th}>Order</th>
                        <th style={th}>Customer</th>
                        <th style={th}>Items</th>
                        <th style={th}>Total</th>
                        <th style={th}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOrders.slice(0, 50).map((o) => {
                        const sc = statusColor(o.status);
                        const orderNo = pick(o, ["order_number", "orderNo", "order_no", "id"], "—");
                        const when = pick(o, ["created_at", "createdAt", "created"], null);

                        const items = o.items || [];
                        const itemsText = items
                          .map((it) => {
                            const name = toText(pick(it, ["item_name", "name", "title"], ""));
                            const qty = safeNumber(pick(it, ["qty", "quantity"], 0), 0);
                            return name ? `${name} x${qty}` : "";
                          })
                          .filter(Boolean)
                          .join(", ");

                        const calcTotal = items.reduce((sum, it) => {
                          const price = safeNumber(pick(it, ["price", "item_price", "unit_price"], 0), 0);
                          const qty = safeNumber(pick(it, ["qty", "quantity"], 0), 0);
                          return sum + price * qty;
                        }, 0);

                        const total = safeNumber(
                          pick(o, ["total", "total_amount", "total_price", "amount", "grand_total", "payable_total"], calcTotal),
                          0
                        );

                        const customerName = pick(o, ["customer_name", "name", "full_name"], "-");
                        const customerPhone = pick(o, ["customer_phone", "phone", "mobile", "customer_mobile"], "-");
                        const customerAddress = pick(o, ["customer_address", "address", "delivery_address"], "");

                        const isNew = justNewIdsRef.current?.has?.(o.id);

                        const eta = prepTimeMins + (busyMode ? extraPrepMins : 0);
                        const createdMs = when ? new Date(when).getTime() : 0;
                        const ageMins = createdMs ? (Date.now() - createdMs) / 60000 : 0;
                        const isLate =
                          (String(o.status || "").toLowerCase() === "pending" || String(o.status || "").toLowerCase() === "preparing") &&
                          eta > 0 &&
                          ageMins > eta;

                        return (
                          <tr
                            key={o.id}
                            style={{
                              background: isNew ? "rgba(236,253,245,0.7)" : isLate ? "rgba(254,243,199,0.6)" : "transparent",
                            }}
                          >
                            <td style={td}>
                              <span
                                style={{
                                  display: "inline-flex",
                                  padding: "6px 10px",
                                  borderRadius: 999,
                                  background: sc.bg,
                                  border: `1px solid ${sc.border}`,
                                  color: sc.text,
                                  fontWeight: 950,
                                  fontSize: 12,
                                  textTransform: "capitalize",
                                }}
                              >
                                {String(o.status || "pending").replaceAll("_", " ")}
                              </span>
                              <div style={{ marginTop: 6, color: "rgba(17,24,39,0.65)", fontWeight: 850 }}>
                                {when ? formatWhen(when) : "-"}
                              </div>
                              {isLate ? (
                                <div style={{ marginTop: 6, fontWeight: 950, color: "#92400e" }}>
                                  ⚠️ Late ({Math.round(ageMins)}m)
                                </div>
                              ) : null}
                            </td>

                            <td style={td}>
                              <div style={{ fontWeight: 1000, color: "#0b1220" }}>#{String(orderNo).slice(0, 10)}</div>
                              <div style={{ marginTop: 6, color: "rgba(17,24,39,0.65)", fontWeight: 850, wordBreak: "break-all" }}>
                                {String(o.id || "").slice(0, 24)}
                              </div>
                            </td>

                            <td style={td}>
                              <div style={{ fontWeight: 1000, color: "#0b1220" }}>{customerName}</div>
                              <div style={{ marginTop: 4, color: "rgba(17,24,39,0.7)", fontWeight: 850 }}>{customerPhone}</div>
                              {customerAddress ? (
                                <div style={{ marginTop: 6, color: "rgba(17,24,39,0.62)", fontWeight: 850 }}>{customerAddress}</div>
                              ) : null}
                            </td>

                            <td style={td}>
                              <div style={{ fontWeight: 950, color: "rgba(17,24,39,0.85)" }}>{itemsText || "-"}</div>
                              {items.length ? (
                                <div style={{ marginTop: 6, color: "rgba(17,24,39,0.62)", fontWeight: 850 }}>
                                  Items: {items.reduce((s, it) => s + safeNumber(pick(it, ["qty", "quantity"], 0), 0), 0)}
                                </div>
                              ) : null}
                            </td>

                            <td style={td}>
                              <div style={{ fontWeight: 1000, color: "#0b1220" }}>{moneyINR(total)}</div>
                              <div style={{ marginTop: 6, color: "rgba(17,24,39,0.62)", fontWeight: 850 }}>
                                Prep ETA: {prepTimeMins + (busyMode ? extraPrepMins : 0)} mins
                              </div>
                            </td>

                            <td style={td}>
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                <button onClick={() => updateStatus(o.id, "preparing")} style={{ ...btnLight, padding: "8px 10px", fontWeight: 950 }}>
                                  Preparing
                                </button>
                                <button onClick={() => updateStatus(o.id, "ready")} style={{ ...btnLight, padding: "8px 10px", fontWeight: 950 }}>
                                  Ready
                                </button>

                                {/* ✅ Removed Delivered action button as you asked */}
                                <button onClick={() => updateStatus(o.id, "rejected")} style={{ ...btnLight, padding: "8px 10px", fontWeight: 950 }}>
                                  Reject
                                </button>
                                <button onClick={() => printKitchenTicket(o)} style={{ ...btnLight, padding: "8px 10px", fontWeight: 950 }}>
                                  Print
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{ padding: 10, fontSize: 12, fontWeight: 900, color: "rgba(17,24,39,0.65)" }}>
                  Showing {Math.min(50, filteredOrders.length)} of {filteredOrders.length} orders (Dashboard view).
                </div>
              </div>
            )}
          </div>

          {/* RIGHT SIDE */}
          <div style={gridSide}>
            {/* Restaurant Controls */}
            <div style={cardGlass}>
              <div style={{ fontWeight: 1000, color: "#0b1220", fontSize: 14 }}>Restaurant Controls</div>
              <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button onClick={() => toggleAccepting(!acceptingOrders)} style={{ ...btnLight, padding: "8px 12px" }}>
                  Accepting Orders: {acceptingOrders ? "OPEN ✅" : "CLOSED ⛔"}
                </button>

                <button onClick={() => toggleBusy(!busyMode)} style={{ ...btnLight, padding: "8px 12px" }}>
                  Busy Mode: {busyMode ? "ON 🔥" : "OFF"}
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 950, color: "rgba(17,24,39,0.72)", marginBottom: 6 }}>Prep Time (mins)</div>
                  <input
                    value={prepTimeMins}
                    onChange={(e) => setPrepTimeMins(safeNumber(e.target.value, 20))}
                    style={inputStyle}
                    type="number"
                    min="0"
                  />
                </div>

                <div>
                  <div style={{ fontSize: 12, fontWeight: 950, color: "rgba(17,24,39,0.72)", marginBottom: 6 }}>Busy Extra (mins)</div>
                  <input
                    value={extraPrepMins}
                    onChange={(e) => setExtraPrepMins(safeNumber(e.target.value, 0))}
                    style={inputStyle}
                    type="number"
                    min="0"
                  />
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
                <button onClick={savePrepTimes} style={{ ...btnDark, padding: "10px 12px" }}>
                  Save
                </button>
                <Link href="/restaurants/settings" style={{ ...btnLight, padding: "10px 12px" }}>
                  Full Settings
                </Link>
              </div>

              {restaurantSettingsNote ? (
                <div style={{ marginTop: 10, fontSize: 12, fontWeight: 900, color: "rgba(17,24,39,0.72)" }}>{restaurantSettingsNote}</div>
              ) : null}
            </div>

            {/* Weekly Earnings + Orders Chart */}
            <div style={cardGlass}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div>
                  <div style={{ fontWeight: 1000, color: "#0b1220", fontSize: 14 }}>
                    Weekly {chartMode === "revenue" ? "Earnings" : "Orders"}
                  </div>
                  <div style={{ marginTop: 6, color: "rgba(17,24,39,0.65)", fontWeight: 850, fontSize: 12 }}>
                    {chartMode === "revenue" ? <>Total: {moneyINR(derived.totals.weekRevenue)}</> : <>Total: {derived.totals.weekOrders}</>}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button onClick={() => setChartMode("revenue")} style={chartMode === "revenue" ? btnDark : btnLight}>
                    Revenue
                  </button>
                  <button onClick={() => setChartMode("orders")} style={chartMode === "orders" ? btnDark : btnLight}>
                    Orders
                  </button>
                </div>
              </div>

              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                {derived.days.map((d) => {
                  const baseMax = chartMode === "revenue" ? derived.maxRevenue : derived.maxOrders;
                  const value = chartMode === "revenue" ? d.revenue : d.orders;
                  const pct = Math.max(3, Math.round((value / baseMax) * 100));
                  return (
                    <div key={d.key} style={{ display: "grid", gridTemplateColumns: "46px 1fr 90px", gap: 10, alignItems: "center" }}>
                      <div style={{ fontWeight: 950, color: "rgba(17,24,39,0.75)", fontSize: 12 }}>{d.label}</div>
                      <div
                        style={{
                          height: 10,
                          borderRadius: 999,
                          border: "1px solid rgba(0,0,0,0.08)",
                          background: "rgba(255,255,255,0.7)",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${pct}%`,
                            height: "100%",
                            borderRadius: 999,
                            background: "rgba(17,24,39,0.9)",
                          }}
                        />
                      </div>
                      <div style={{ textAlign: "right", fontWeight: 950, color: "#0b1220", fontSize: 12 }}>
                        {chartMode === "revenue" ? moneyINR(value) : value}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Best Sellers */}
            <div style={cardGlass}>
              <div style={{ fontWeight: 1000, color: "#0b1220", fontSize: 14 }}>Best Sellers</div>
              <div style={{ marginTop: 8, color: "rgba(17,24,39,0.65)", fontWeight: 850, fontSize: 12 }}>
                (Works best when you have `order_items` table)
              </div>

              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 1000, color: "rgba(17,24,39,0.75)" }}>Today</div>
                {derived.topItemsToday.length === 0 ? (
                  <div style={{ marginTop: 8, color: "rgba(17,24,39,0.7)", fontWeight: 850 }}>No item data yet.</div>
                ) : (
                  <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                    {derived.topItemsToday.map((it) => (
                      <div
                        key={it.name}
                        style={{
                          border: "1px solid rgba(0,0,0,0.08)",
                          borderRadius: 14,
                          padding: 10,
                          background: "rgba(255,255,255,0.75)",
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 10,
                        }}
                      >
                        <div style={{ fontWeight: 1000, color: "#0b1220" }}>{it.name}</div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontWeight: 950, color: "rgba(17,24,39,0.75)" }}>Qty: {it.qty}</div>
                          <div style={{ fontWeight: 1000, color: "#0b1220" }}>{moneyINR(it.revenue)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 1000, color: "rgba(17,24,39,0.75)" }}>This Week</div>
                {derived.topItemsWeek.length === 0 ? (
                  <div style={{ marginTop: 8, color: "rgba(17,24,39,0.7)", fontWeight: 850 }}>No item data yet.</div>
                ) : (
                  <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                    {derived.topItemsWeek.map((it) => (
                      <div
                        key={it.name}
                        style={{
                          border: "1px solid rgba(0,0,0,0.08)",
                          borderRadius: 14,
                          padding: 10,
                          background: "rgba(255,255,255,0.75)",
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 10,
                        }}
                      >
                        <div style={{ fontWeight: 1000, color: "#0b1220" }}>{it.name}</div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontWeight: 950, color: "rgba(17,24,39,0.75)" }}>Qty: {it.qty}</div>
                          <div style={{ fontWeight: 1000, color: "#0b1220" }}>{moneyINR(it.revenue)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div style={cardGlass}>
              <div style={{ fontWeight: 1000, color: "#0b1220", fontSize: 14 }}>Quick Actions</div>
              <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Link href="/restaurants/orders" style={{ ...btnLight, padding: "10px 12px" }}>
                  Manage Orders
                </Link>
                <Link href="/restaurants/menu" style={{ ...btnLight, padding: "10px 12px" }}>
                  Manage Menu
                </Link>
                <Link href="/restaurants/settings" style={{ ...btnLight, padding: "10px 12px" }}>
                  Settings
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div style={{ height: 20 }} />
      </div>
    </main>
  );
}
