"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import supabase from "@/lib/supabase";

/* =========================
   Premium theme (same vibe)
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

const cardGlass = {
  borderRadius: 18,
  padding: 16,
  background: "rgba(255,255,255,0.78)",
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 12px 36px rgba(0,0,0,0.08)",
  backdropFilter: "blur(10px)",
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
  fontSize: 32,
  fontWeight: 1000,
  color: "#0b1220",
  letterSpacing: -0.2,
};

const subText = {
  marginTop: 8,
  color: "rgba(17,24,39,0.7)",
  fontWeight: 800,
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

const miniBtn = {
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(255,255,255,0.95)",
  color: "#111",
  fontWeight: 950,
  padding: "8px 10px",
  borderRadius: 999,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
};

const miniBtnDark = {
  ...miniBtn,
  border: "1px solid rgba(17,24,39,0.95)",
  background: "rgba(17,24,39,0.95)",
  color: "#fff",
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

const topTabsWrap = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  alignItems: "center",
};

const tab = (active) => ({
  padding: "10px 14px",
  borderRadius: 999,
  border: active
    ? "1px solid rgba(0,0,0,0.18)"
    : "1px solid rgba(0,0,0,0.10)",
  background: active ? "rgba(17,24,39,0.92)" : "rgba(255,255,255,0.9)",
  color: active ? "#fff" : "#111",
  fontWeight: 950,
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
});

const statGrid = {
  marginTop: 12,
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 12,
};

const statCard = {
  ...cardGlass,
  padding: 14,
};

const statValue = {
  fontSize: 22,
  fontWeight: 1000,
  color: "#0b1220",
  marginTop: 6,
};

const statLabel = {
  fontSize: 12,
  fontWeight: 900,
  color: "rgba(17,24,39,0.65)",
};

const twoCol = {
  marginTop: 12,
  display: "grid",
  gridTemplateColumns: "1.15fr 0.85fr",
  gap: 12,
};

const boxTitle = {
  fontSize: 14,
  fontWeight: 1000,
  color: "#0b1220",
};

const sectionTitleRow = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  flexWrap: "wrap",
};

const chipRow = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
};

const input = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 14,
  border: "1px solid rgba(15,23,42,0.14)",
  outline: "none",
  background: "rgba(255,255,255,0.9)",
  fontSize: 13,
  fontWeight: 850,
  color: "#0b1220",
};

const select = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 14,
  border: "1px solid rgba(15,23,42,0.14)",
  outline: "none",
  background: "rgba(255,255,255,0.9)",
  fontSize: 13,
  fontWeight: 900,
  color: "#0b1220",
};

const tableWrap = {
  marginTop: 12,
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.10)",
  overflow: "hidden",
  background: "rgba(255,255,255,0.78)",
};

const table = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
  fontSize: 13,
};

const th = {
  textAlign: "left",
  padding: "10px 12px",
  fontSize: 12,
  fontWeight: 1000,
  color: "rgba(15,23,42,0.72)",
  borderBottom: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(248,250,252,0.9)",
};

const td = {
  padding: "10px 12px",
  borderBottom: "1px solid rgba(0,0,0,0.06)",
  verticalAlign: "top",
  fontWeight: 850,
  color: "#0b1220",
};

const badge = (tone = "neutral") => {
  const map = {
    neutral: {
      bg: "rgba(15,23,42,0.06)",
      br: "rgba(15,23,42,0.14)",
      tx: "rgba(15,23,42,0.85)",
    },
    ok: {
      bg: "rgba(16,185,129,0.12)",
      br: "rgba(16,185,129,0.22)",
      tx: "rgba(6,95,70,1)",
    },
    warn: {
      bg: "rgba(245,158,11,0.14)",
      br: "rgba(245,158,11,0.26)",
      tx: "rgba(146,64,14,1)",
    },
    bad: {
      bg: "rgba(239,68,68,0.12)",
      br: "rgba(239,68,68,0.22)",
      tx: "rgba(127,29,29,1)",
    },
  };
  const t = map[tone] || map.neutral;
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 10px",
    borderRadius: 999,
    border: `1px solid ${t.br}`,
    background: t.bg,
    color: t.tx,
    fontSize: 12,
    fontWeight: 1000,
    whiteSpace: "nowrap",
  };
};

function normalizeRole(r) {
  return String(r || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function safeNum(v) {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n : 0;
}

function fmtMoney(v) {
  const n = safeNum(v);
  return n.toFixed(0);
}

function statusTone(s) {
  const x = String(s || "").toLowerCase();
  if (["delivered", "completed"].includes(x)) return "ok";
  if (["ready", "accepted", "confirmed", "processing", "preparing"].includes(x)) return "neutral";
  if (["pending", "placed", "new"].includes(x)) return "warn";
  if (["rejected", "cancelled", "canceled", "failed"].includes(x)) return "bad";
  return "neutral";
}

function fmtWhen(d) {
  try {
    const x = d ? new Date(d) : null;
    if (!x || Number.isNaN(x.getTime())) return "-";
    return x.toLocaleString();
  } catch {
    return "-";
  }
}

function cleanStr(v) {
  return String(v || "").trim();
}

/* =========================
   ✅ FIX: auto-detect grocery orders table + store id column
   (dashboard was using only store_id before)
   ========================= */

const ORDER_TABLE_CANDIDATES = ["grocery_orders", "orders_grocery"];
const STORE_ID_COL_CANDIDATES = ["store_id", "grocery_store_id"];

function isMissingTableError(msg) {
  const m = String(msg || "").toLowerCase();
  return (
    m.includes("could not find the table") ||
    m.includes("schema cache") ||
    m.includes("does not exist") ||
    (m.includes("relation") && m.includes("does not exist"))
  );
}

function isMissingColumnError(msg) {
  const m = String(msg || "").toLowerCase();
  return m.includes("column") && m.includes("does not exist");
}

// Try select rows from a table with a detected store id column
async function selectOrdersAuto(selectStr, sid, applyExtras) {
  let lastErr = null;

  for (const table of ORDER_TABLE_CANDIDATES) {
    for (const storeIdCol of STORE_ID_COL_CANDIDATES) {
      try {
        let q = supabase.from(table).select(selectStr).eq(storeIdCol, sid);
        if (applyExtras) q = applyExtras(q);
        const { data, error } = await q;
        if (error) throw error;
        return { table, storeIdCol, rows: Array.isArray(data) ? data : [] };
      } catch (e) {
        lastErr = e;
        const msg = e?.message || String(e);
        if (isMissingTableError(msg)) break; // next table
        if (isMissingColumnError(msg)) continue; // next storeIdCol
        continue;
      }
    }
  }

  // fallback empty (don’t crash dashboard)
  return { table: null, storeIdCol: null, rows: [] };
}

// Try count from a detected orders table/column (head=true)
async function countOrdersAuto(sid, applyExtras) {
  let lastErr = null;

  for (const table of ORDER_TABLE_CANDIDATES) {
    for (const storeIdCol of STORE_ID_COL_CANDIDATES) {
      try {
        let q = supabase.from(table).select("*", { count: "exact", head: true }).eq(storeIdCol, sid);
        if (applyExtras) q = applyExtras(q);
        const { count, error } = await q;
        if (error) throw error;
        return { table, storeIdCol, count: safeNum(count) };
      } catch (e) {
        lastErr = e;
        const msg = e?.message || String(e);
        if (isMissingTableError(msg)) break;
        if (isMissingColumnError(msg)) continue;
        continue;
      }
    }
  }

  return { table: null, storeIdCol: null, count: 0, error: lastErr };
}

// Keep your existing product counting safe (no change)
async function countFromAnyTable(tables, filterFn) {
  for (const t of tables) {
    try {
      let q = supabase.from(t).select("*", { count: "exact", head: true });
      if (filterFn) q = filterFn(q);
      const { count, error } = await q;
      if (!error) return safeNum(count);
    } catch {
      // ignore
    }
  }
  return 0;
}

// Try updating store table safely
async function updateStoreSafe(storeId, patch) {
  const { error } = await supabase.from("grocery_stores").update(patch).eq("id", storeId);
  if (error) throw error;
  return true;
}

export default function GroceryOwnerDashboardPage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);

  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");

  const [userEmail, setUserEmail] = useState("");
  const [role, setRole] = useState("");
  const [store, setStore] = useState(null);

  // Stats
  const [totalProducts, setTotalProducts] = useState(0);
  const [ordersToday, setOrdersToday] = useState(0);
  const [pendingOrders, setPendingOrders] = useState(0);
  const [delivered7d, setDelivered7d] = useState(0);

  // Pro dashboard sections
  const [ordersTableName, setOrdersTableName] = useState(null);
  const [ordersStoreIdCol, setOrdersStoreIdCol] = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  const [ordersTab, setOrdersTab] = useState("all"); // all | pending | preparing | ready | delivered | rejected
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState("newest"); // newest | oldest

  // Customer view inside Orders Management (NO breaking existing)
  const [ordersViewMode, setOrdersViewMode] = useState("orders"); // "orders" | "customers"
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customersTableName, setCustomersTableName] = useState(null);
  const [customersStoreIdCol, setCustomersStoreIdCol] = useState(null);
  const [customers, setCustomers] = useState([]); // aggregated
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerKey, setSelectedCustomerKey] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedCustomerOrders, setSelectedCustomerOrders] = useState([]);

  // Store controls (local UI state)
  const [acceptingOrders, setAcceptingOrders] = useState(false);
  const [busyMode, setBusyMode] = useState(false);
  const [prepMins, setPrepMins] = useState(20);
  const [busyExtraMins, setBusyExtraMins] = useState(0);
  const [savingControls, setSavingControls] = useState(false);
  const [controlsMsg, setControlsMsg] = useState("");

  // Weekly earnings
  const [weekMode, setWeekMode] = useState("revenue"); // revenue | orders
  const [weekData, setWeekData] = useState([
    { d: "Mon", v: 0 },
    { d: "Tue", v: 0 },
    { d: "Wed", v: 0 },
    { d: "Thu", v: 0 },
    { d: "Fri", v: 0 },
    { d: "Sat", v: 0 },
    { d: "Sun", v: 0 },
  ]);

  const storeId = useMemo(() => store?.id || "", [store]);

  const approval = String(store?.approval_status || "pending").toLowerCase();
  const isApproved = approval === "approved";
  const isDisabled = !!store?.is_disabled;

  const todayISO = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, []);

  const since7dISO = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString();
  }, []);

  // Orders tab mapping
  const tabStatusMap = useMemo(() => {
    return {
      all: null,
      pending: ["pending", "placed", "new", "confirmed"],
      preparing: ["preparing", "processing", "packing"],
      ready: ["ready", "out_for_delivery", "on_the_way"],
      delivered: ["delivered", "completed"],
      rejected: ["rejected", "cancelled", "canceled", "failed"],
    };
  }, []);

  // ✅ FIXED: Orders preview uses auto-detected store id column now
  async function loadOrdersPreview(sid) {
    if (!sid) return;
    setOrdersLoading(true);
    setControlsMsg("");
    try {
      const statuses = tabStatusMap[ordersTab];
      const baseSelect =
        "id, order_id, status, created_at, total, total_amount, amount, customer_phone, phone, customer_name, name, customer_user_id";

      const { table: t, storeIdCol, rows } = await selectOrdersAuto(baseSelect, sid, (qq) => {
        let q = qq;

        if (statuses && statuses.length) {
          q = q.in("status", statuses);
        }

        const s = search.trim();
        if (s) {
          q = q.or(
            `id.ilike.%${s}%,order_id.ilike.%${s}%,customer_phone.ilike.%${s}%,phone.ilike.%${s}%,customer_name.ilike.%${s}%,name.ilike.%${s}%`
          );
        }

        q = q.order("created_at", { ascending: sortMode === "oldest" });
        return q.limit(8);
      });

      setOrdersTableName(t);
      setOrdersStoreIdCol(storeIdCol);
      setRecentOrders(rows || []);
    } catch {
      setRecentOrders([]);
    } finally {
      setOrdersLoading(false);
    }
  }

  // Customers aggregation (best-effort, safe)
  async function loadCustomersIndex(sid) {
    if (!sid) return;
    setCustomersLoading(true);
    setCustomers([]);
    setSelectedCustomer(null);
    setSelectedCustomerKey("");
    setSelectedCustomerOrders([]);
    try {
      const baseSelect =
        "id, order_id, status, created_at, total, total_amount, amount, customer_user_id, customer_name, name, customer_phone, phone";

      const { table: t, storeIdCol, rows } = await selectOrdersAuto(baseSelect, sid, (q) =>
        q.order("created_at", { ascending: false }).limit(500)
      );

      setCustomersTableName(t);
      setCustomersStoreIdCol(storeIdCol);

      const list = Array.isArray(rows) ? rows : [];
      const group = new Map();

      for (const o of list) {
        const uid = cleanStr(o?.customer_user_id);
        const ph = cleanStr(o?.customer_phone || o?.phone);
        const nm = cleanStr(o?.customer_name || o?.name);

        const key = uid || (ph ? `phone:${ph}` : nm ? `name:${nm}` : `unknown:${String(o?.id || "")}`);

        if (!group.has(key)) {
          group.set(key, {
            key,
            customer_user_id: uid || "",
            name: nm || (ph ? ph : "Customer"),
            phone: ph || "",
            avatar_url: "",
            orders_count: 0,
            delivered_count: 0,
            rejected_count: 0,
            revenue_total: 0,
            last_order_at: null,
            first_order_at: null,
            _orders: [],
          });
        }

        const g = group.get(key);
        g.orders_count += 1;

        const st = String(o?.status || "").toLowerCase();
        if (["delivered", "completed"].includes(st)) g.delivered_count += 1;
        if (["rejected", "cancelled", "canceled", "failed"].includes(st)) g.rejected_count += 1;

        const m = safeNum(o?.total ?? o?.total_amount ?? o?.amount ?? 0);
        if (!["rejected", "cancelled", "canceled", "failed"].includes(st)) {
          g.revenue_total += m;
        }

        const ca = o?.created_at ? new Date(o.created_at) : null;
        if (ca && !Number.isNaN(ca.getTime())) {
          if (!g.last_order_at || ca > new Date(g.last_order_at)) g.last_order_at = ca.toISOString();
          if (!g.first_order_at || ca < new Date(g.first_order_at)) g.first_order_at = ca.toISOString();
        }

        g._orders.push(o);
        group.set(key, g);
      }

      const aggregated = Array.from(group.values()).sort((a, b) => {
        const ad = a.last_order_at ? new Date(a.last_order_at).getTime() : 0;
        const bd = b.last_order_at ? new Date(b.last_order_at).getTime() : 0;
        return bd - ad;
      });

      const ids = aggregated.map((c) => cleanStr(c.customer_user_id)).filter(Boolean);

      if (ids.length > 0) {
        try {
          const { data, error } = await supabase
            .from("profiles")
            .select("user_id, avatar_url, full_name, name")
            .in("user_id", Array.from(new Set(ids)).slice(0, 500));

          if (!error && Array.isArray(data)) {
            const byId = new Map();
            data.forEach((r) => byId.set(String(r.user_id), r));
            aggregated.forEach((c) => {
              const p = c.customer_user_id ? byId.get(String(c.customer_user_id)) : null;
              if (p?.avatar_url) c.avatar_url = p.avatar_url;
              const pname = cleanStr(p?.full_name || p?.name);
              if ((!cleanStr(c.name) || c.name === c.phone) && pname) c.name = pname;
            });
          }
        } catch {
          // ignore
        }
      }

      setCustomers(aggregated);
    } catch {
      setCustomers([]);
      setCustomersTableName(null);
      setCustomersStoreIdCol(null);
    } finally {
      setCustomersLoading(false);
    }
  }

  function openOrderInFullPage(orderId) {
    const oid = cleanStr(orderId);
    if (!oid) return;
    router.push(`/groceries/owner/orders?order=${encodeURIComponent(oid)}`);
  }

  function pickCustomer(c) {
    if (!c) return;
    setSelectedCustomerKey(c.key);
    setSelectedCustomer(c);
    const ords = Array.isArray(c._orders) ? c._orders : [];
    setSelectedCustomerOrders(ords);
  }

  // ✅ FIXED: weekly uses auto-detected store id column too
  async function loadWeekly(sid) {
    if (!sid) return;

    try {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - 6);
      const startISO = start.toISOString();

      const baseSelect = "created_at, status, total, total_amount, amount";

      const { rows } = await selectOrdersAuto(baseSelect, sid, (q) =>
        q.gte("created_at", startISO).order("created_at", { ascending: true })
      );

      const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const by = new Map();
      for (const d of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) {
        by.set(d, { revenue: 0, orders: 0 });
      }

      for (const r of rows || []) {
        const dt = new Date(r.created_at);
        const label = days[dt.getDay()];
        const slot = by.get(label) || { revenue: 0, orders: 0 };

        const st = String(r.status || "").toLowerCase();
        if (!["rejected", "cancelled", "canceled", "failed"].includes(st)) {
          slot.orders += 1;
          const m = safeNum(r.total ?? r.total_amount ?? r.amount ?? 0);
          slot.revenue += m;
        }
        by.set(label, slot);
      }

      const ordered = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => {
        const s = by.get(d) || { revenue: 0, orders: 0 };
        return { d, v: weekMode === "orders" ? s.orders : s.revenue };
      });

      setWeekData(ordered);
    } catch {
      // keep default zeros
    }
  }

  async function loadAll() {
    setErr("");
    setInfo("");
    setLoading(true);

    try {
      const { data: sess } = await supabase.auth.getSession();
      const user = sess?.session?.user;

      if (!user) {
        router.push("/login");
        return;
      }

      setUserEmail(user.email || "");

      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profErr) throw profErr;

      const r = normalizeRole(prof?.role);
      setRole(r);

      if (r !== "grocery_owner") {
        setErr("Access denied: This page is only for Grocery Owners.");
        return;
      }

      // Load store (latest)
      const { data: s, error: sErr } = await supabase
        .from("grocery_stores")
        .select("*")
        .eq("owner_user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (sErr) throw sErr;

      if (!s?.id) {
        setStore(null);
        setInfo("You don’t have a grocery store yet. Create one in Settings first.");
        return;
      }

      setStore(s);

      setAcceptingOrders(!!s.accepting_orders);
      setBusyMode(!!s.busy_mode);
      setPrepMins(safeNum(s.prep_time_mins ?? 20));
      setBusyExtraMins(safeNum(s.busy_extra_mins ?? 0));

      // Products stats (unchanged)
      const productsCount = await countFromAnyTable(["grocery_items", "grocery_products"], (q) =>
        q.eq("store_id", s.id)
      );

      // ✅ FIXED: Orders stats use auto-detected storeId col now
      const ordersTodayRes = await countOrdersAuto(s.id, (q) => q.gte("created_at", todayISO));
      const pendingRes = await countOrdersAuto(s.id, (q) =>
        q.in("status", ["pending", "placed", "new", "confirmed"])
      );
      const delivered7dRes = await countOrdersAuto(s.id, (q) =>
        q.gte("created_at", since7dISO).in("status", ["delivered", "completed"])
      );

      setTotalProducts(productsCount);
      setOrdersToday(ordersTodayRes.count);
      setPendingOrders(pendingRes.count);
      setDelivered7d(delivered7dRes.count);

      await loadOrdersPreview(s.id);
      await loadWeekly(s.id);

      if (ordersViewMode === "customers") {
        await loadCustomersIndex(s.id);
      }
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
      setChecking(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!storeId) return;

    if (ordersViewMode === "orders") {
      loadOrdersPreview(storeId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, ordersTab, sortMode, ordersViewMode]);

  useEffect(() => {
    if (!storeId) return;
    if (ordersViewMode === "customers") {
      loadCustomersIndex(storeId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, ordersViewMode]);

  useEffect(() => {
    if (!storeId) return;
    loadWeekly(storeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, weekMode]);

  async function handleSaveControls() {
    setControlsMsg("");
    setErr("");
    if (!storeId) return;

    setSavingControls(true);
    try {
      const patch = {
        accepting_orders: !!acceptingOrders,
        busy_mode: !!busyMode,
        prep_time_mins: safeNum(prepMins),
        busy_extra_mins: safeNum(busyExtraMins),
      };

      await updateStoreSafe(storeId, patch);

      setControlsMsg("✅ Saved.");
      await loadAll();
    } catch (e) {
      setControlsMsg("");
      setErr(e?.message || String(e));
    } finally {
      setSavingControls(false);
    }
  }

  function onSearchKey(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (storeId) loadOrdersPreview(storeId);
    }
  }

  function onCustomerSearchKey(e) {
    if (e.key === "Enter") {
      e.preventDefault();
    }
  }

  const filteredCustomers = useMemo(() => {
    const q = cleanStr(customerSearch).toLowerCase();
    const list = Array.isArray(customers) ? customers : [];
    if (!q) return list;

    return list.filter((c) => {
      const nm = cleanStr(c?.name).toLowerCase();
      const ph = cleanStr(c?.phone).toLowerCase();
      const uid = cleanStr(c?.customer_user_id).toLowerCase();
      return nm.includes(q) || ph.includes(q) || uid.includes(q);
    });
  }, [customers, customerSearch]);

  const selectedOrdersSorted = useMemo(() => {
    const list = Array.isArray(selectedCustomerOrders) ? selectedCustomerOrders : [];
    return [...list].sort((a, b) => {
      const ad = a?.created_at ? new Date(a.created_at).getTime() : 0;
      const bd = b?.created_at ? new Date(b.created_at).getTime() : 0;
      return bd - ad;
    });
  }, [selectedCustomerOrders]);

  if (checking) {
    return (
      <main style={pageBg}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>Checking session…</div>
      </main>
    );
  }

  const maxWeek = Math.max(1, ...weekData.map((x) => safeNum(x.v)));

  return (
    <main style={pageBg}>
      <div style={{ width: "100%", margin: "0 auto" }}>
        <div style={heroGlass}>
          <div style={{ minWidth: 260 }}>
            <div style={pill}>Grocery Owner</div>
            <h1 style={heroTitle}>Dashboard</h1>
            <div style={subText}>Overview • Orders • Products • Controls</div>
          </div>

          <div style={topTabsWrap}>
            <button onClick={loadAll} style={btnLight} disabled={loading}>
              {loading ? "Refreshing…" : "Refresh"}
            </button>

            <button
              onClick={() => router.push("/groceries/owner/items")}
              style={btnDark}
              disabled={!storeId || !isApproved || isDisabled}
              title={
                !storeId
                  ? "Create a store first"
                  : !isApproved
                  ? "Admin must approve your store first"
                  : isDisabled
                  ? "Store disabled by admin"
                  : "Manage products"
              }
            >
              Manage Menu
            </button>
          </div>
        </div>

        <div style={{ ...cardGlass, marginTop: 12 }}>
          <div style={topTabsWrap}>
            <a href="/groceries/owner/dashboard" style={tab(true)}>
              Home
            </a>
            <a href="/groceries/owner/orders" style={tab(false)}>
              Grocery Orders
            </a>
            <a href="/groceries/owner/items" style={tab(false)}>
              Manage Menu
            </a>
            <a href="/groceries/owner/settings" style={tab(false)}>
              Grocery Settings
            </a>
          </div>

          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span style={pill}>Owner: {userEmail || "-"}</span>
            <span style={pill}>Role: {role || "-"}</span>
            <span style={pill}>Store: {store?.name || "Not created yet"}</span>
            <span style={pill}>Store ID: {storeId || "-"}</span>
          </div>

          {err ? <div style={alertErr}>{err}</div> : null}
          {info ? <div style={alertInfo}>{info}</div> : null}

          {store ? (
            <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <span style={pill}>Status: {String(store?.approval_status || "pending")}</span>
              <span style={pill}>Disabled: {String(!!store?.is_disabled)}</span>
              <span style={pill}>Accepting orders: {String(!!store?.accepting_orders)}</span>

              {/* helpful debug, won’t break UI */}
              {ordersTableName ? (
                <span style={pill}>
                  Orders source: {ordersTableName}
                  {ordersStoreIdCol ? ` (${ordersStoreIdCol})` : ""}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        <div style={statGrid}>
          <div style={statCard}>
            <div style={statLabel}>Total Products</div>
            <div style={statValue}>{totalProducts}</div>
          </div>
          <div style={statCard}>
            <div style={statLabel}>Orders Today</div>
            <div style={statValue}>{ordersToday}</div>
          </div>
          <div style={statCard}>
            <div style={statLabel}>Pending Orders</div>
            <div style={statValue}>{pendingOrders}</div>
          </div>
          <div style={statCard}>
            <div style={statLabel}>Delivered (Last 7 Days)</div>
            <div style={statValue}>{delivered7d}</div>
          </div>
        </div>

        {/* ========= PRO DASHBOARD AREA ========= */}
        <div style={twoCol}>
          {/* LEFT: Orders management preview */}
          <div style={cardGlass}>
            <div style={sectionTitleRow}>
              <div>
                <div style={boxTitle}>Orders Management</div>
                <div style={{ marginTop: 6, color: "rgba(17,24,39,0.62)", fontWeight: 900, fontSize: 12 }}>
                  {ordersViewMode === "orders"
                    ? ordersTableName
                      ? `Source: ${ordersTableName}${ordersStoreIdCol ? ` (${ordersStoreIdCol})` : ""}`
                      : "Source: auto"
                    : customersTableName
                    ? `Customers source: ${customersTableName}${customersStoreIdCol ? ` (${customersStoreIdCol})` : ""}`
                    : "Customers source: auto"}
                </div>
              </div>

              <div style={chipRow}>
                <button
                  style={ordersViewMode === "orders" ? miniBtnDark : miniBtn}
                  onClick={() => {
                    setOrdersViewMode("orders");
                    setSelectedCustomer(null);
                    setSelectedCustomerKey("");
                    setSelectedCustomerOrders([]);
                  }}
                >
                  Orders View
                </button>
                <button
                  style={ordersViewMode === "customers" ? miniBtnDark : miniBtn}
                  onClick={() => {
                    setOrdersViewMode("customers");
                    setSearch("");
                  }}
                  disabled={!storeId}
                  title={!storeId ? "Create store first" : "Customers grouped by customer id"}
                >
                  Customers View
                </button>

                <div style={{ width: 8 }} />

                <button
                  style={miniBtn}
                  onClick={() => {
                    setSearch("");
                    setOrdersTab("all");
                    setSortMode("newest");
                    setCustomerSearch("");
                    setSelectedCustomer(null);
                    setSelectedCustomerKey("");
                    setSelectedCustomerOrders([]);
                    if (storeId) {
                      if (ordersViewMode === "orders") loadOrdersPreview(storeId);
                      else loadCustomersIndex(storeId);
                    }
                  }}
                  disabled={!storeId}
                >
                  Reset
                </button>

                <button
                  style={miniBtnDark}
                  onClick={() => {
                    if (!storeId) return;
                    if (ordersViewMode === "orders") loadOrdersPreview(storeId);
                    else loadCustomersIndex(storeId);
                  }}
                  disabled={!storeId || ordersLoading || customersLoading}
                  title={!storeId ? "Create store first" : "Refresh"}
                >
                  {(ordersViewMode === "orders" && ordersLoading) || (ordersViewMode === "customers" && customersLoading)
                    ? "Loading…"
                    : "Refresh"}
                </button>

                <button style={miniBtn} onClick={() => router.push("/groceries/owner/orders")} disabled={!storeId}>
                  Full Orders
                </button>
              </div>
            </div>

            {/* ORDERS VIEW */}
            {ordersViewMode === "orders" ? (
              <>
                <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button style={tab(ordersTab === "all")} onClick={() => setOrdersTab("all")}>
                    All
                  </button>
                  <button style={tab(ordersTab === "pending")} onClick={() => setOrdersTab("pending")}>
                    Pending
                  </button>
                  <button style={tab(ordersTab === "preparing")} onClick={() => setOrdersTab("preparing")}>
                    Preparing
                  </button>
                  <button style={tab(ordersTab === "ready")} onClick={() => setOrdersTab("ready")}>
                    Ready
                  </button>
                  <button style={tab(ordersTab === "delivered")} onClick={() => setOrdersTab("delivered")}>
                    Delivered
                  </button>
                  <button style={tab(ordersTab === "rejected")} onClick={() => setOrdersTab("rejected")}>
                    Rejected
                  </button>
                </div>

                <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 220px", gap: 10 }}>
                  <div>
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      onKeyDown={onSearchKey}
                      placeholder="Search by order id / phone / name (press Enter)"
                      style={input}
                    />
                  </div>
                  <div>
                    <select value={sortMode} onChange={(e) => setSortMode(e.target.value)} style={select}>
                      <option value="newest">Sort: Newest</option>
                      <option value="oldest">Sort: Oldest</option>
                    </select>
                  </div>
                </div>

                <div style={tableWrap}>
                  <table style={table}>
                    <thead>
                      <tr>
                        <th style={th}>Status</th>
                        <th style={th}>Order</th>
                        <th style={th}>Customer</th>
                        <th style={th}>Total</th>
                        <th style={th}>Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ordersLoading ? (
                        <tr>
                          <td style={td} colSpan={5}>
                            Loading orders…
                          </td>
                        </tr>
                      ) : !storeId ? (
                        <tr>
                          <td style={td} colSpan={5}>
                            Create your store in <b>Grocery Settings</b> first.
                          </td>
                        </tr>
                      ) : recentOrders?.length ? (
                        recentOrders.map((o) => {
                          const st = String(o.status || "pending");
                          const ord = o.order_id || o.id || "-";
                          const cust = o.customer_name || o.name || o.customer_phone || o.phone || "-";
                          const total = safeNum(o.total ?? o.total_amount ?? o.amount ?? 0);
                          const created = o.created_at ? new Date(o.created_at).toLocaleString() : "-";

                          return (
                            <tr key={String(o.id || ord)}>
                              <td style={td}>
                                <span style={badge(statusTone(st))}>{st}</span>
                              </td>
                              <td style={{ ...td, fontWeight: 1000 }}>{String(ord).slice(0, 10)}</td>
                              <td style={td}>{String(cust).slice(0, 26)}</td>
                              <td style={td}>{fmtMoney(total)}</td>
                              <td style={{ ...td, color: "rgba(15,23,42,0.72)" }}>{created}</td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td style={td} colSpan={5}>
                            No orders found for this filter.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {!storeId ? null : !isApproved ? (
                  <div style={alertInfo}>⏳ Store is <b>pending</b>. Admin must approve before taking orders.</div>
                ) : isDisabled ? (
                  <div style={alertErr}>🚫 Store is <b>disabled</b> by admin.</div>
                ) : null}
              </>
            ) : (
              /* CUSTOMERS VIEW */
              <>
                <div
                  style={{
                    marginTop: 12,
                    display: "grid",
                    gridTemplateColumns: selectedCustomer ? "1fr 160px" : "1fr 220px",
                    gap: 10,
                  }}
                >
                  <div>
                    <input
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      onKeyDown={onCustomerSearchKey}
                      placeholder="Search customer by name / phone / id"
                      style={input}
                    />
                  </div>

                  {selectedCustomer ? (
                    <button
                      style={miniBtn}
                      onClick={() => {
                        setSelectedCustomer(null);
                        setSelectedCustomerKey("");
                        setSelectedCustomerOrders([]);
                      }}
                    >
                      ← Back
                    </button>
                  ) : (
                    <button style={miniBtn} onClick={() => setCustomerSearch("")}>
                      Clear
                    </button>
                  )}
                </div>

                {!storeId ? (
                  <div style={{ marginTop: 12, fontWeight: 900, color: "rgba(17,24,39,0.7)" }}>
                    Create your store in <b>Grocery Settings</b> first.
                  </div>
                ) : customersLoading ? (
                  <div style={{ marginTop: 12, fontWeight: 900, color: "rgba(17,24,39,0.7)" }}>
                    Loading customers…
                  </div>
                ) : !selectedCustomer ? (
                  <div style={tableWrap}>
                    <table style={table}>
                      <thead>
                        <tr>
                          <th style={th}>Customer</th>
                          <th style={th}>Orders</th>
                          <th style={th}>Delivered</th>
                          <th style={th}>Revenue</th>
                          <th style={th}>Last Order</th>
                          <th style={th}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredCustomers.length ? (
                          filteredCustomers.map((c) => {
                            const img = cleanStr(c.avatar_url);
                            const name = cleanStr(c.name) || "Customer";
                            const phone = cleanStr(c.phone);

                            return (
                              <tr key={c.key}>
                                <td style={td}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                    <div
                                      style={{
                                        width: 34,
                                        height: 34,
                                        borderRadius: 999,
                                        border: "1px solid rgba(0,0,0,0.10)",
                                        background: "rgba(15,23,42,0.06)",
                                        overflow: "hidden",
                                        display: "grid",
                                        placeItems: "center",
                                        flexShrink: 0,
                                      }}
                                      title={c.customer_user_id ? `ID: ${c.customer_user_id}` : c.key}
                                    >
                                      {img ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                          src={img}
                                          alt="avatar"
                                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                        />
                                      ) : (
                                        <span style={{ fontWeight: 1000, color: "rgba(15,23,42,0.75)" }}>
                                          {String(name || "C").slice(0, 1).toUpperCase()}
                                        </span>
                                      )}
                                    </div>

                                    <div style={{ minWidth: 0 }}>
                                      <div style={{ fontWeight: 1000, color: "#0b1220", lineHeight: 1.1 }}>{name}</div>
                                      <div
                                        style={{
                                          marginTop: 3,
                                          fontSize: 12,
                                          fontWeight: 900,
                                          color: "rgba(15,23,42,0.62)",
                                        }}
                                      >
                                        {phone
                                          ? phone
                                          : c.customer_user_id
                                          ? String(c.customer_user_id).slice(0, 12) + "…"
                                          : "No phone"}
                                      </div>
                                    </div>
                                  </div>
                                </td>

                                <td style={td}>{safeNum(c.orders_count)}</td>
                                <td style={td}>{safeNum(c.delivered_count)}</td>
                                <td style={td}>{fmtMoney(c.revenue_total)}</td>
                                <td style={{ ...td, color: "rgba(15,23,42,0.72)" }}>{fmtWhen(c.last_order_at)}</td>

                                <td style={td}>
                                  <button style={miniBtnDark} onClick={() => pickCustomer(c)} title="View this customer's orders">
                                    View Orders →
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td style={td} colSpan={6}>
                              No customers found.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <>
                    <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                      <span style={pill}>
                        Customer: <b style={{ marginLeft: 6 }}>{cleanStr(selectedCustomer?.name) || "Customer"}</b>
                      </span>
                      {cleanStr(selectedCustomer?.phone) ? <span style={pill}>Phone: {selectedCustomer.phone}</span> : null}
                      {cleanStr(selectedCustomer?.customer_user_id) ? (
                        <span style={pill}>ID: {String(selectedCustomer.customer_user_id).slice(0, 14)}…</span>
                      ) : null}
                      <span style={pill}>Total Orders: {safeNum(selectedCustomer?.orders_count)}</span>
                      <span style={pill}>Delivered: {safeNum(selectedCustomer?.delivered_count)}</span>
                    </div>

                    <div style={tableWrap}>
                      <table style={table}>
                        <thead>
                          <tr>
                            <th style={th}>Status</th>
                            <th style={th}>Order</th>
                            <th style={th}>Total</th>
                            <th style={th}>Created</th>
                            <th style={th}>Open</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedOrdersSorted.length ? (
                            selectedOrdersSorted.slice(0, 50).map((o) => {
                              const st = String(o.status || "pending");
                              const ord = o.order_id || o.id || "-";
                              const total = safeNum(o.total ?? o.total_amount ?? o.amount ?? 0);
                              const created = o.created_at ? new Date(o.created_at).toLocaleString() : "-";

                              return (
                                <tr key={String(o.id || ord)}>
                                  <td style={td}>
                                    <span style={badge(statusTone(st))}>{st}</span>
                                  </td>
                                  <td style={{ ...td, fontWeight: 1000 }}>{String(ord).slice(0, 14)}</td>
                                  <td style={td}>{fmtMoney(total)}</td>
                                  <td style={{ ...td, color: "rgba(15,23,42,0.72)" }}>{created}</td>
                                  <td style={td}>
                                    <button style={miniBtn} onClick={() => openOrderInFullPage(o.id || o.order_id)} title="Open in full orders page">
                                      Open →
                                    </button>
                                  </td>
                                </tr>
                              );
                            })
                          ) : (
                            <tr>
                              <td style={td} colSpan={5}>
                                No orders found for this customer.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <button style={miniBtnDark} onClick={() => router.push("/groceries/owner/orders")}>
                        Open Full Orders Page
                      </button>
                      <button
                        style={miniBtn}
                        onClick={() => {
                          try {
                            const id = cleanStr(selectedCustomer?.customer_user_id || selectedCustomer?.phone || "");
                            if (id) navigator.clipboard.writeText(id);
                          } catch {}
                        }}
                      >
                        Copy Customer ID/Phone
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          {/* RIGHT: Controls + Weekly */}
          <div style={{ display: "grid", gap: 12 }}>
            <div style={cardGlass}>
              <div style={boxTitle}>Store Controls</div>

              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <span style={{ fontWeight: 1000, color: "#0b1220" }}>Accepting Orders</span>
                  <button
                    style={acceptingOrders ? miniBtnDark : miniBtn}
                    onClick={() => setAcceptingOrders((v) => !v)}
                    disabled={!storeId}
                    title={!storeId ? "Create store first" : ""}
                  >
                    {acceptingOrders ? "OPEN ✅" : "CLOSED ⛔"}
                  </button>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <span style={{ fontWeight: 1000, color: "#0b1220" }}>Busy Mode</span>
                  <button style={busyMode ? miniBtnDark : miniBtn} onClick={() => setBusyMode((v) => !v)} disabled={!storeId}>
                    {busyMode ? "ON" : "OFF"}
                  </button>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 1000, color: "rgba(15,23,42,0.75)", marginBottom: 6 }}>
                      Prep Time (mins)
                    </div>
                    <input style={input} value={String(prepMins)} onChange={(e) => setPrepMins(e.target.value)} inputMode="numeric" />
                  </div>

                  <div>
                    <div style={{ fontSize: 12, fontWeight: 1000, color: "rgba(15,23,42,0.75)", marginBottom: 6 }}>
                      Busy Extra (mins)
                    </div>
                    <input style={input} value={String(busyExtraMins)} onChange={(e) => setBusyExtraMins(e.target.value)} inputMode="numeric" />
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button style={miniBtnDark} onClick={handleSaveControls} disabled={!storeId || savingControls}>
                    {savingControls ? "Saving…" : "Save"}
                  </button>
                  <button style={miniBtn} onClick={() => router.push("/groceries/owner/settings")}>
                    Full Settings
                  </button>
                </div>

                {controlsMsg ? <div style={alertInfo}>{controlsMsg}</div> : null}
              </div>
            </div>

            <div style={cardGlass}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div style={boxTitle}>Weekly Earnings</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={weekMode === "revenue" ? miniBtnDark : miniBtn} onClick={() => setWeekMode("revenue")}>
                    Revenue
                  </button>
                  <button style={weekMode === "orders" ? miniBtnDark : miniBtn} onClick={() => setWeekMode("orders")}>
                    Orders
                  </button>
                </div>
              </div>

              <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                {weekData.map((x) => {
                  const w = Math.max(6, Math.round((safeNum(x.v) / maxWeek) * 180));
                  return (
                    <div key={x.d} style={{ display: "grid", gridTemplateColumns: "34px 1fr 50px", gap: 10, alignItems: "center" }}>
                      <div style={{ fontSize: 12, fontWeight: 1000, color: "rgba(15,23,42,0.75)" }}>{x.d}</div>
                      <div style={{ height: 10, borderRadius: 999, background: "rgba(15,23,42,0.08)", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: w, borderRadius: 999, background: "rgba(17,24,39,0.85)" }} />
                      </div>
                      <div style={{ textAlign: "right", fontSize: 12, fontWeight: 1000, color: "#0b1220" }}>
                        {weekMode === "orders" ? safeNum(x.v) : fmtMoney(x.v)}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ marginTop: 10, color: "rgba(15,23,42,0.62)", fontWeight: 850, fontSize: 12 }}>
                Tip: This chart is best-effort (it reads totals from orders table if available).
              </div>
            </div>
          </div>
        </div>

        <div style={{ height: 18 }} />
      </div>
    </main>
  );
}