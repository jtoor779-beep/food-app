"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import supabase from "@/lib/supabase";

/* =========================
   Helpers
   ========================= */
function clean(v) {
  return String(v || "").trim();
}
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
function fmtDt(d) {
  try {
    const x = d ? new Date(d) : null;
    if (!x || Number.isNaN(x.getTime())) return "-";
    return x.toLocaleString();
  } catch {
    return "-";
  }
}
function safeArr(v) {
  return Array.isArray(v) ? v : [];
}

function buildAddressFromRow(o) {
  const a1 = clean(o?.delivery_address || o?.address || o?.address_line1 || "");
  const a2 = clean(o?.address_line2 || "");
  const lm = clean(o?.landmark || "");
  const parts = [a1, a2, lm].filter(Boolean);
  return parts.join(", ") || "-";
}

function getPhoneFromRow(o) {
  return clean(o?.customer_phone || o?.phone || o?.mobile || "");
}

/* =========================
   Safe table detection (NO CRASH)
   ========================= */

// ✅ IMPORTANT: do NOT fallback to restaurant "orders" table here
const ORDER_TABLE_CANDIDATES = ["grocery_orders", "orders_grocery"];
const STORE_ID_COL_CANDIDATES = ["store_id", "grocery_store_id"];

// items table candidates
const ORDER_ITEMS_TABLE_CANDIDATES = ["grocery_order_items", "order_items_grocery", "grocery_items_order"];
const ORDER_ID_COL_CANDIDATES = ["order_id", "grocery_order_id"];

// item id candidates inside order_items table
const ITEM_ID_COL_CANDIDATES = ["grocery_item_id", "item_id", "product_id"];

// qty candidates inside order_items table
const QTY_COL_CANDIDATES = ["qty", "quantity", "count"];

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

/**
 * Try select from table + storeIdCol
 */
async function tryLoadOrders(table, storeIdCol, sid) {
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .eq(storeIdCol, sid)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return safeArr(data);
}

/**
 * Finds the first working (table, storeIdCol) pair.
 * Returns: { table, storeIdCol, orders }
 */
async function loadOrdersAuto(sid) {
  let lastErr = null;

  for (const table of ORDER_TABLE_CANDIDATES) {
    for (const storeIdCol of STORE_ID_COL_CANDIDATES) {
      try {
        const orders = await tryLoadOrders(table, storeIdCol, sid);
        return { table, storeIdCol, orders };
      } catch (e) {
        lastErr = e;
        const msg = e?.message || String(e);

        // If table doesn't exist, skip to next table
        if (isMissingTableError(msg)) {
          break; // next table
        }

        // If column doesn't exist, try next storeIdCol
        if (isMissingColumnError(msg)) {
          continue;
        }

        // Other errors: keep trying
        continue;
      }
    }
  }

  throw lastErr || new Error("No grocery order table found.");
}

/**
 * Load order items in bulk and attach to orders as order_items[]
 * This fixes your "No items array found" problem.
 */
async function loadOrderItemsAuto(orderIds) {
  const ids = safeArr(orderIds).filter(Boolean);
  if (ids.length === 0) return { itemsTable: "", orderIdCol: "", itemIdCol: "", qtyCol: "", rows: [] };

  let lastErr = null;

  for (const itemsTable of ORDER_ITEMS_TABLE_CANDIDATES) {
    // try each possible order id column
    for (const orderIdCol of ORDER_ID_COL_CANDIDATES) {
      // try each possible item id column + qty column
      for (const itemIdCol of ITEM_ID_COL_CANDIDATES) {
        for (const qtyCol of QTY_COL_CANDIDATES) {
          try {
            // select minimal fields (safe)
            const { data, error } = await supabase
              .from(itemsTable)
              .select("*")
              .in(orderIdCol, ids);

            if (error) throw error;

            const rows = safeArr(data);
            return { itemsTable, orderIdCol, itemIdCol, qtyCol, rows };
          } catch (e) {
            lastErr = e;
            const msg = e?.message || String(e);

            if (isMissingTableError(msg)) {
              // next items table
              break;
            }
            if (isMissingColumnError(msg)) {
              // try next column combo
              continue;
            }
            continue;
          }
        }
      }
    }
  }

  // not fatal; orders can still load
  return { itemsTable: "", orderIdCol: "", itemIdCol: "", qtyCol: "", rows: [] };
}

/**
 * Optional: get grocery item names in bulk
 */
async function loadGroceryItemNamesAuto(itemIds) {
  const ids = safeArr(itemIds).filter(Boolean);
  if (ids.length === 0) return new Map();

  // your table name is grocery_items (seen in your Supabase sidebar)
  try {
    const { data, error } = await supabase
      .from("grocery_items")
      .select("id, name")
      .in("id", ids);

    if (error) throw error;

    const map = new Map();
    safeArr(data).forEach((r) => map.set(String(r.id), r.name || "Item"));
    return map;
  } catch {
    return new Map();
  }
}

/**
 * Update status safely with detected table.
 * Tries update by id; if fails, tries order_id.
 */
async function updateOrderStatusAuto({ table, orderId, nextStatus }) {
  if (!table) throw new Error("Orders table not detected yet.");

  // First try: update by id
  {
    const { error } = await supabase
      .from(table)
      .update({ status: nextStatus })
      .eq("id", orderId);

    if (!error) return true;
  }

  // Second try: update by order_id
  {
    const { error } = await supabase
      .from(table)
      .update({ status: nextStatus })
      .eq("order_id", orderId);

    if (error) throw error;
    return true;
  }
}

/* =========================
   UI helpers (NO logic change)
   ========================= */
function clampText(s, max = 22) {
  const str = String(s ?? "");
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + "…";
}
function countItems(order) {
  const items = safeArr(order?.order_items || order?.items);
  if (!items.length) return 0;
  let total = 0;
  items.forEach((it) => {
    const q = Number(it?.qty ?? it?.quantity ?? 1);
    total += isFinite(q) ? q : 1;
  });
  return total;
}
function stepIndexFromStatus(st) {
  const s = normalizeRole(st || "pending");
  // progress line is: Placed -> Preparing -> On the way -> Delivered
  if (s === "delivered") return 3;
  if (s === "on_the_way") return 2;
  if (s === "ready") return 2; // ready is basically before on_the_way, but show progress up to "On the way" soon
  if (s === "preparing") return 1;
  if (s === "rejected" || s === "cancelled") return 0;
  return 0; // pending/placed
}

/* =========================
   Page
   ========================= */
export default function GroceryOwnerOrdersPage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);

  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState("");

  const [stores, setStores] = useState([]);
  const [storeId, setStoreId] = useState("");

  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  const [errMsg, setErrMsg] = useState("");
  const [infoMsg, setInfoMsg] = useState("");

  // NEW: detected orders source
  const [ordersSource, setOrdersSource] = useState({
    table: "",
    storeIdCol: "",
  });

  // NEW: detected items source (helpful for debugging)
  const [itemsSource, setItemsSource] = useState({
    table: "",
    orderIdCol: "",
  });

  // filters
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");

  // UI only: expand/collapse order details (keeps old work)
  const [openOrderId, setOpenOrderId] = useState(null);

  const canAccess = useMemo(() => role === "grocery_owner" || role === "admin", [role]);

  async function loadSessionAndRole() {
    setChecking(true);
    setErrMsg("");
    setInfoMsg("");

    try {
      const { data: sess, error: sessErr } = await supabase.auth.getSession();
      if (sessErr) throw sessErr;

      const user = sess?.session?.user;
      if (!user) {
        router.push("/login");
        return;
      }

      setUserId(user.id);
      setEmail(user.email || "");

      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profErr) throw profErr;

      const r = normalizeRole(prof?.role);
      setRole(r);

      if (r !== "grocery_owner" && r !== "admin") {
        router.push("/");
        return;
      }

      await loadMyStores(user.id);
    } catch (e) {
      setErrMsg(e?.message || String(e));
    } finally {
      setChecking(false);
    }
  }

  async function loadMyStores(uid) {
    const { data, error } = await supabase
      .from("grocery_stores")
      .select("id, name, city, approval_status, is_disabled, accepting_orders, created_at")
      .eq("owner_user_id", uid)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const list = safeArr(data);
    setStores(list);

    if (!storeId && list.length > 0) setStoreId(list[0].id);
  }

  // ✅ FIXED: Auto-detect orders table + storeId col + attach items
  async function loadOrders(sid) {
    if (!sid) {
      setOrders([]);
      return;
    }
    setLoadingOrders(true);
    setErrMsg("");

    try {
      // 1) load orders
      const res = await loadOrdersAuto(sid);
      setOrdersSource({ table: res.table, storeIdCol: res.storeIdCol });

      // 2) load order items (bulk) and attach
      const orderIds = safeArr(res.orders).map((o) => o?.id).filter(Boolean);
      const itemsRes = await loadOrderItemsAuto(orderIds);

      setItemsSource({ table: itemsRes.itemsTable || "", orderIdCol: itemsRes.orderIdCol || "" });

      let merged = [...safeArr(res.orders)];

      if (itemsRes.rows && itemsRes.rows.length > 0 && itemsRes.orderIdCol) {
        const orderIdCol = itemsRes.orderIdCol;

        // collect item ids to lookup names
        const itemIds = [];
        for (const row of itemsRes.rows) {
          const foundItemId =
            row?.grocery_item_id ?? row?.item_id ?? row?.product_id ?? row?.menu_item_id ?? null;
          if (foundItemId) itemIds.push(foundItemId);
        }

        const namesMap = await loadGroceryItemNamesAuto([...new Set(itemIds.map(String))]);

        // group by order id
        const byOrder = new Map();
        itemsRes.rows.forEach((row) => {
          const oid = row?.[orderIdCol];
          if (!oid) return;

          const itemId =
            row?.grocery_item_id ?? row?.item_id ?? row?.product_id ?? row?.menu_item_id ?? null;

          const qty = row?.qty ?? row?.quantity ?? row?.count ?? 1;

          const nameFromDb = itemId ? namesMap.get(String(itemId)) : null;

          const line = {
            id: row?.id ?? null,
            grocery_item_id: itemId ?? null,
            name: row?.name || row?.item_name || nameFromDb || "Item",
            qty: Number(qty || 1),
          };

          if (!byOrder.has(String(oid))) byOrder.set(String(oid), []);
          byOrder.get(String(oid)).push(line);
        });

        merged = merged.map((o) => ({
          ...o,
          // attach as order_items so your existing UI works
          order_items: byOrder.get(String(o.id)) || safeArr(o.order_items || o.items),
        }));
      }

      setOrders(merged);
    } catch (e) {
      const msg = e?.message || String(e);
      setErrMsg(
        msg +
          "  |  I tried grocery_orders / orders_grocery with store_id or grocery_store_id + tried grocery_order_items for items."
      );
      setOrders([]);
      setOrdersSource({ table: "", storeIdCol: "" });
      setItemsSource({ table: "", orderIdCol: "" });
    } finally {
      setLoadingOrders(false);
    }
  }

  // ✅ FIXED: Update status using detected table
  async function updateOrderStatus(orderId, nextStatus) {
    if (!orderId) return;
    setBusy(true);
    setErrMsg("");
    setInfoMsg("");

    try {
      if (!ordersSource.table) {
        throw new Error("Orders table not detected yet. Click Refresh once.");
      }

      await updateOrderStatusAuto({
        table: ordersSource.table,
        orderId,
        nextStatus,
      });

      setInfoMsg("✅ Status updated");
      await loadOrders(storeId);
    } catch (e) {
      setErrMsg(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    loadSessionAndRole();

    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") router.push("/login");
    });
    return () => data?.subscription?.unsubscribe?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (storeId) loadOrders(storeId);
    else setOrders([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  useEffect(() => {
    if (stores.length > 0 && storeId) {
      const exists = stores.some((s) => s.id === storeId);
      if (!exists) setStoreId(stores[0].id);
    }
    if (stores.length > 0 && !storeId) setStoreId(stores[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stores]);

  const activeStore = useMemo(() => stores.find((s) => s.id === storeId) || null, [stores, storeId]);

  const normalizedOrders = useMemo(() => {
    return safeArr(orders).map((o) => ({
      ...o,
      _status: normalizeRole(o?.status || "pending"),
    }));
  }, [orders]);

  const counts = useMemo(() => {
    const c = {
      all: normalizedOrders.length,
      pending: 0,
      preparing: 0,
      ready: 0,
      on_the_way: 0,
      delivered: 0,
      rejected: 0,
      cancelled: 0,
    };
    normalizedOrders.forEach((o) => {
      const s = o._status;
      if (c[s] !== undefined) c[s] += 1;
    });
    return c;
  }, [normalizedOrders]);

  const filteredOrders = useMemo(() => {
    let list = [...normalizedOrders];

    if (activeTab !== "all") {
      list = list.filter((o) => o._status === activeTab);
    }

    const q = clean(search).toLowerCase();
    if (q) {
      list = list.filter((o) => {
        const id = clean(o?.id).toLowerCase();
        const name = clean(o?.customer_name || o?.name || "").toLowerCase();
        const phone = getPhoneFromRow(o).toLowerCase();
        const addr = buildAddressFromRow(o).toLowerCase();
        return id.includes(q) || name.includes(q) || phone.includes(q) || addr.includes(q);
      });
    }

    return list;
  }, [normalizedOrders, activeTab, search]);

  if (checking) {
    return (
      <main style={{ padding: 24 }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", fontWeight: 900 }}>Checking…</div>
      </main>
    );
  }

  if (!canAccess) return null;

  return (
    <main style={pageBg}>
      <div style={{ width: "100%", margin: "0 auto" }}>
        {/* HERO */}
        <div style={heroGlass}>
          <div>
            <div style={pill}>Grocery Owner</div>
            <h1 style={heroTitle}>Grocery Orders</h1>
            <div style={subText}>Owner dashboard • View & update order status • Multi-store supported</div>

            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link href="/groceries/owner/dashboard" style={btnPillLight}>
                Home
              </Link>
              <Link href="/groceries/owner/items" style={btnPillLight}>
                Manage Menu
              </Link>
              <Link href="/groceries/owner/settings" style={btnPillLight}>
                Grocery Settings
              </Link>
            </div>

            {/* show detected source */}
            {ordersSource.table ? (
              <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span style={tag}>Orders table: {ordersSource.table}</span>
                <span style={tag}>Store id col: {ordersSource.storeIdCol}</span>
                {itemsSource.table ? <span style={tag}>Items table: {itemsSource.table}</span> : null}
              </div>
            ) : null}
          </div>

          <div style={controlsGlass}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ fontWeight: 950, color: "#0b1220" }}>Owner:</div>
              <div style={{ color: "rgba(17,24,39,0.72)", fontWeight: 900 }}>{email || "-"}</div>
              <div style={{ width: 12 }} />
              <button onClick={() => loadOrders(storeId)} style={btnSmallOutline} disabled={busy || !storeId}>
                Refresh
              </button>
            </div>

            <div style={{ marginTop: 10 }}>
              <div style={{ fontWeight: 950, color: "#0b1220", marginBottom: 6 }}>Select Store</div>
              <select value={storeId} onChange={(e) => setStoreId(e.target.value)} style={input} disabled={busy}>
                <option value="">-- Select --</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.city ? `(${s.city})` : ""}
                  </option>
                ))}
              </select>

              {activeStore ? (
                <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span style={tag}>{clean(activeStore.approval_status) || "pending"}</span>
                  <span style={tag}>{activeStore.is_disabled ? "Disabled" : "Enabled"}</span>
                  <span style={tag}>{activeStore.accepting_orders ? "Accepting orders" : "Not accepting"}</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {errMsg ? <div style={alertErr}>{errMsg}</div> : null}
        {infoMsg ? <div style={alertOk}>{infoMsg}</div> : null}

        {/* FILTERS (Restaurant Orders style) */}
        <div style={panelGlass}>
          <div style={filtersRow}>
            <div style={chipsWrap} className="hf-chips">
              <button onClick={() => setActiveTab("all")} style={activeTab === "all" ? chipOn : chipOff}>
                All: {counts.all}
              </button>
              <button onClick={() => setActiveTab("pending")} style={activeTab === "pending" ? chipOn : chipOff}>
                Pending: {counts.pending}
              </button>
              <button onClick={() => setActiveTab("preparing")} style={activeTab === "preparing" ? chipOn : chipOff}>
                Preparing: {counts.preparing}
              </button>
              <button onClick={() => setActiveTab("ready")} style={activeTab === "ready" ? chipOn : chipOff}>
                Ready: {counts.ready}
              </button>
              <button
                onClick={() => setActiveTab("on_the_way")}
                style={activeTab === "on_the_way" ? chipOn : chipOff}
              >
                On The Way: {counts.on_the_way}
              </button>
              <button onClick={() => setActiveTab("delivered")} style={activeTab === "delivered" ? chipOn : chipOff}>
                Delivered: {counts.delivered}
              </button>
              <button onClick={() => setActiveTab("rejected")} style={activeTab === "rejected" ? chipOn : chipOff}>
                Rejected: {counts.rejected}
              </button>
              <button
                onClick={() => setActiveTab("cancelled")}
                style={activeTab === "cancelled" ? chipOn : chipOff}
              >
                Cancelled: {counts.cancelled}
              </button>
            </div>

            <div style={searchWrap}>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={searchInput}
                placeholder="Search name / phone / address / id"
              />
              <button onClick={() => setSearch("")} style={btnSmallOutline}>
                Clear
              </button>
            </div>
          </div>
        </div>

        {/* LIST */}
        <div style={panelGlass}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <div style={{ fontWeight: 1000, fontSize: 16, color: "#0b1220" }}>
              Orders <span style={tag}>Showing: {filteredOrders.length}</span>
            </div>
            <button onClick={() => loadOrders(storeId)} style={btnSmallOutline} disabled={busy || !storeId}>
              Refresh
            </button>
          </div>

          {loadingOrders ? (
            <div style={{ marginTop: 12, fontWeight: 900, color: "rgba(17,24,39,0.7)" }}>Loading orders…</div>
          ) : null}

          {!loadingOrders && filteredOrders.length === 0 ? (
            <div style={emptyBox}>No orders found for selected store / filters.</div>
          ) : null}

          {!loadingOrders && filteredOrders.length > 0 ? (
            <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
              {filteredOrders.map((o) => {
                const phone = getPhoneFromRow(o);
                const addr = buildAddressFromRow(o);
                const items = safeArr(o.order_items || o.items);
                const itemsCount = countItems(o);
                const isOpen = openOrderId === o.id;
                const stepIdx = stepIndexFromStatus(o._status);

                return (
                  <div key={o.id} style={orderShell}>
                    {/* TOP COMPACT ROW (restaurant style) */}
                    <div style={orderTopRow}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <span style={statusPill(o._status)}>{o._status || "pending"}</span>
                        <div style={orderMetaStrong}>Order • {clampText(o.id, 18)}</div>
                        <div style={orderMetaDim}>{fmtDt(o.created_at)}</div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <div style={orderTotal}>{money(o.total_amount ?? o.total ?? 0)}</div>
                        <button
                          onClick={() => setOpenOrderId((cur) => (cur === o.id ? null : o.id))}
                          style={viewBtn}
                        >
                          {isOpen ? "Hide details ←" : "View details →"}
                        </button>
                      </div>
                    </div>

                    {/* SUB ROW (like restaurant list info) */}
                    <div style={orderSubRow}>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                        <span style={miniTag}>Customer: {o.customer_name || "-"}</span>
                        <span style={miniTag}>Items: {itemsCount}</span>
                        <span style={miniTag}>Store: {activeStore?.name || "-"}</span>
                      </div>

                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                        {phone ? <span style={miniTag}>Phone: {phone}</span> : null}
                      </div>
                    </div>

                    {/* PROGRESS TRACKER (restaurant style) */}
                    <div style={trackWrap}>
                      <div style={trackItem}>
                        <div style={trackDot(stepIdx >= 0)}>{stepIdx >= 0 ? "✓" : ""}</div>
                        <div style={trackLabel}>Placed</div>
                      </div>
                      <div style={trackLine(stepIdx >= 1)} />
                      <div style={trackItem}>
                        <div style={trackDot(stepIdx >= 1)}>{stepIdx >= 1 ? "✓" : ""}</div>
                        <div style={trackLabel}>Preparing</div>
                      </div>
                      <div style={trackLine(stepIdx >= 2)} />
                      <div style={trackItem}>
                        <div style={trackDot(stepIdx >= 2)}>{stepIdx >= 2 ? "✓" : ""}</div>
                        <div style={trackLabel}>On the way</div>
                      </div>
                      <div style={trackLine(stepIdx >= 3)} />
                      <div style={trackItem}>
                        <div style={trackDot(stepIdx >= 3)}>{stepIdx >= 3 ? "✓" : ""}</div>
                        <div style={trackLabel}>Delivered</div>
                      </div>
                    </div>

                    {/* DETAILS (your old full card UI preserved) */}
                    {isOpen ? (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                          <div style={miniBox}>
                            <div style={miniTitle}>Customer</div>
                            <div style={miniText}>{o.customer_name || "-"}</div>
                            <div style={miniLine}>
                              <span style={miniLabel}>Phone:</span> {phone || "-"}
                            </div>

                            <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                              {phone ? (
                                <>
                                  <a href={`tel:${phone}`} style={btnPillLight}>
                                    Call
                                  </a>
                                  <a
                                    href={`https://wa.me/${String(phone).replace(/[^\d]/g, "")}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={btnPillLight}
                                  >
                                    WhatsApp
                                  </a>
                                </>
                              ) : null}
                            </div>
                          </div>

                          <div style={miniBox}>
                            <div style={miniTitle}>Delivery Address</div>
                            <div style={miniText}>{addr}</div>

                            {addr && addr !== "-" ? (
                              <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                                <a
                                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={btnPillLight}
                                >
                                  Maps
                                </a>
                                <button
                                  onClick={() => {
                                    try {
                                      navigator.clipboard.writeText(addr);
                                      setInfoMsg("✅ Address copied");
                                    } catch {}
                                  }}
                                  style={btnPillLight}
                                >
                                  Copy Address
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </div>

                        {o.instructions ? (
                          <div style={{ marginTop: 12 }}>
                            <div style={miniTitle}>Instructions</div>
                            <div style={noteBox}>{o.instructions}</div>
                          </div>
                        ) : null}

                        {/* Items */}
                        <div style={{ marginTop: 12 }}>
                          <div style={miniTitle}>Items</div>
                          <div style={noteBox}>
                            {items.length === 0 ? (
                              <div style={{ fontWeight: 850, color: "rgba(17,24,39,0.6)" }}>
                                No items found for this order.
                              </div>
                            ) : (
                              <ul style={{ margin: 0, paddingLeft: 18 }}>
                                {items.map((it, idx) => (
                                  <li key={idx} style={{ marginBottom: 6 }}>
                                    <b>{it?.name || it?.item_name || "Item"}</b>{" "}
                                    <span style={{ color: "rgba(17,24,39,0.65)", fontWeight: 850 }}>
                                      Qty {it?.qty ?? it?.quantity ?? 1}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>

                        {/* Status dropdown */}
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
                          <div style={{ fontWeight: 900, color: "rgba(17,24,39,0.7)" }}>
                            Store: {activeStore?.name || "-"}
                          </div>

                          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                            <div style={{ fontWeight: 950, color: "#0b1220" }}>Change Status:</div>
                            <select
                              value={o._status}
                              onChange={(e) => updateOrderStatus(o.id, e.target.value)}
                              style={{ ...input, width: 220 }}
                              disabled={busy}
                            >
                              <option value="pending">pending</option>
                              <option value="preparing">preparing</option>
                              <option value="ready">ready</option>
                              <option value="on_the_way">on_the_way</option>
                              <option value="delivered">delivered</option>
                              <option value="rejected">rejected</option>
                              <option value="cancelled">cancelled</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

        <div style={{ marginTop: 12, fontSize: 12, fontWeight: 850, color: "rgba(17,24,39,0.6)" }}>
          If it still shows empty, send screenshot of these tables/columns: <b>grocery_orders</b> +{" "}
          <b>grocery_order_items</b>.
        </div>
      </div>

      {/* UI-only scrollbar hide for chips */}
      <style jsx global>{`
        .hf-chips::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </main>
  );
}

/* =========================
   Premium inline styles
   ========================= */
const pageBg = {
  minHeight: "calc(100vh - 64px)",
  padding: 20,
  background:
    "radial-gradient(1200px 600px at 20% 10%, rgba(255,140,0,0.18), transparent 62%), radial-gradient(900px 520px at 80% 18%, rgba(80,160,255,0.18), transparent 58%), linear-gradient(180deg, #f7f7fb, #ffffff)",
};

const heroGlass = {
  borderRadius: 20,
  padding: 18,
  background: "rgba(255,255,255,0.78)",
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 14px 44px rgba(0,0,0,0.09)",
  backdropFilter: "blur(10px)",
  display: "flex",
  alignItems: "flex-start",
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

const controlsGlass = {
  borderRadius: 18,
  padding: 14,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 12px 36px rgba(0,0,0,0.07)",
  backdropFilter: "blur(10px)",
  display: "flex",
  flexDirection: "column",
  gap: 10,
  minWidth: 340,
};

const panelGlass = {
  marginTop: 14,
  borderRadius: 18,
  padding: 14,
  background: "rgba(255,255,255,0.74)",
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 12px 36px rgba(0,0,0,0.07)",
  backdropFilter: "blur(10px)",
};

const input = {
  width: "100%",
  padding: 10,
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.9)",
  outline: "none",
  fontWeight: 800,
};

const btnSmallOutline = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.9)",
  cursor: "pointer",
  fontWeight: 950,
};

const btnPillLight = {
  padding: "10px 14px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.85)",
  cursor: "pointer",
  fontWeight: 950,
  color: "#111827",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
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

const alertOk = {
  marginTop: 12,
  padding: 12,
  border: "1px solid #bbf7d0",
  background: "rgba(236,253,245,0.92)",
  borderRadius: 14,
  color: "#065f46",
  fontWeight: 900,
};

const emptyBox = {
  marginTop: 12,
  padding: 14,
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.75)",
  color: "rgba(17,24,39,0.7)",
  fontWeight: 800,
};

const tag = {
  fontSize: 12,
  padding: "5px 10px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.7)",
  color: "rgba(17,24,39,0.8)",
  fontWeight: 900,
};

const miniBox = {
  borderRadius: 16,
  padding: 12,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.75)",
};

const miniTitle = {
  fontSize: 12,
  fontWeight: 950,
  color: "rgba(17,24,39,0.75)",
  marginBottom: 8,
};

const miniText = {
  fontWeight: 1000,
  color: "#0b1220",
};

const miniLine = {
  marginTop: 6,
  fontSize: 12,
  fontWeight: 850,
  color: "rgba(17,24,39,0.7)",
};

const miniLabel = {
  fontWeight: 950,
  color: "rgba(17,24,39,0.8)",
};

const noteBox = {
  borderRadius: 14,
  padding: 12,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.85)",
  fontWeight: 850,
  color: "rgba(17,24,39,0.78)",
};

function statusPill(s) {
  const base = {
    padding: "4px 10px",
    borderRadius: 999,
    fontWeight: 950,
    fontSize: 12,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "rgba(255,255,255,0.75)",
    color: "rgba(17,24,39,0.85)",
    textTransform: "capitalize",
    whiteSpace: "nowrap",
  };

  if (s === "delivered")
    return {
      ...base,
      border: "1px solid rgba(16,185,129,0.30)",
      background: "rgba(236,253,245,0.90)",
      color: "#065f46",
    };
  if (s === "rejected" || s === "cancelled")
    return {
      ...base,
      border: "1px solid rgba(239,68,68,0.25)",
      background: "rgba(254,242,242,0.90)",
      color: "#7f1d1d",
    };
  if (s === "on_the_way")
    return {
      ...base,
      border: "1px solid rgba(59,130,246,0.25)",
      background: "rgba(239,246,255,0.85)",
      color: "#1d4ed8",
    };
  if (s === "ready")
    return {
      ...base,
      border: "1px solid rgba(245,158,11,0.25)",
      background: "rgba(255,251,235,0.90)",
      color: "#92400e",
    };
  return base;
}

/* ===== Restaurant orders look styles (UI only) ===== */
const filtersRow = {
  display: "flex",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
};

const chipsWrap = {
  flex: 1,
  display: "flex",
  gap: 10,
  alignItems: "center",
  overflowX: "auto",
  whiteSpace: "nowrap",
  WebkitOverflowScrolling: "touch",
  msOverflowStyle: "none",
  scrollbarWidth: "none",
  paddingBottom: 2,
};

const searchWrap = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  justifyContent: "flex-end",
  flexWrap: "wrap",
};

const searchInput = {
  ...input,
  maxWidth: 320,
};

const chipOn = {
  padding: "10px 14px",
  borderRadius: 999,
  border: "1px solid rgba(17,24,39,0.18)",
  background: "rgba(17,24,39,0.92)",
  color: "#fff",
  fontWeight: 950,
  cursor: "pointer",
  boxShadow: "0 12px 26px rgba(17,24,39,0.12)",
  flexShrink: 0,
};

const chipOff = {
  padding: "10px 14px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.9)",
  color: "#111827",
  fontWeight: 950,
  cursor: "pointer",
  flexShrink: 0,
};

const orderShell = {
  borderRadius: 18,
  padding: 14,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.78)",
  boxShadow: "0 12px 36px rgba(0,0,0,0.07)",
};

const orderTopRow = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  flexWrap: "wrap",
  alignItems: "center",
};

const orderSubRow = {
  marginTop: 10,
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  flexWrap: "wrap",
  alignItems: "center",
};

const orderMetaStrong = {
  fontWeight: 1000,
  color: "#0b1220",
};

const orderMetaDim = {
  fontSize: 12,
  fontWeight: 850,
  color: "rgba(17,24,39,0.55)",
};

const orderTotal = {
  fontWeight: 1000,
  color: "#0b1220",
  fontSize: 16,
};

const viewBtn = {
  padding: "10px 14px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(17,24,39,0.92)",
  color: "#fff",
  fontWeight: 950,
  cursor: "pointer",
  boxShadow: "0 12px 26px rgba(17,24,39,0.12)",
};

const miniTag = {
  fontSize: 12,
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.75)",
  color: "rgba(17,24,39,0.80)",
  fontWeight: 900,
};

/* Progress tracker */
const trackWrap = {
  marginTop: 12,
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
};

const trackItem = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const trackDot = (on) => ({
  width: 22,
  height: 22,
  borderRadius: 999,
  display: "grid",
  placeItems: "center",
  fontSize: 12,
  fontWeight: 1000,
  border: "1px solid rgba(0,0,0,0.12)",
  background: on ? "rgba(17,24,39,0.92)" : "rgba(255,255,255,0.9)",
  color: on ? "#fff" : "rgba(17,24,39,0.45)",
});

const trackLabel = {
  fontSize: 12,
  fontWeight: 900,
  color: "rgba(17,24,39,0.75)",
};

const trackLine = (on) => ({
  height: 2,
  width: 46,
  borderRadius: 999,
  background: on ? "rgba(17,24,39,0.80)" : "rgba(17,24,39,0.16)",
});
