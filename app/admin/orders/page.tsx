"use client";

import React, { useEffect, useMemo, useState } from "react";
import supabase from "@/lib/supabase";

type AnyRow = Record<string, any>;

function normalizeStatus(s: any) {
  const raw = String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (raw === "on_the_way" || raw === "delivering" || raw === "picked_up") return "out_for_delivery";
  if (raw === "confirmed") return "accepted";
  if (raw === "rejected") return "cancelled";
  return raw;
}

function formatMoney(v: any) {
  const n = Number(v || 0);
  if (Number.isNaN(n)) return "$0";
  return `$${n.toFixed(0)}`;
}

function formatDateTime(v: any) {
  if (!v) return "-";
  try {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleString();
  } catch {
    return String(v);
  }
}

function clampText(s: any, max = 28) {
  const str = String(s ?? "");
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + "…";
}

function ownerRejectReason(row: AnyRow | null | undefined) {
  return String(
    row?.reject_reason ||
      row?.rejection_reason ||
      row?.cancel_reason ||
      row?.owner_reject_reason ||
      ""
  ).trim();
}

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "accepted", label: "Accepted" },
  { value: "preparing", label: "Preparing" },
  { value: "out_for_delivery", label: "Out for delivery" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
];

const FORCE_STATUS_BUTTONS = [
  { value: "pending", label: "Pending" },
  { value: "accepted", label: "Accepted" },
  { value: "preparing", label: "Preparing" },
  { value: "out_for_delivery", label: "Out for delivery" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
];

export default function AdminOrdersPage() {
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [orders, setOrders] = useState<AnyRow[]>([]);
  const [restaurants, setRestaurants] = useState<AnyRow[]>([]);

  const [statusFilter, setStatusFilter] = useState("");
  const [restaurantFilter, setRestaurantFilter] = useState("");
  const [dateFrom, setDateFrom] = useState(""); // yyyy-mm-dd
  const [dateTo, setDateTo] = useState(""); // yyyy-mm-dd
  const [search, setSearch] = useState("");

  const [selected, setSelected] = useState<AnyRow | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [orderItems, setOrderItems] = useState<AnyRow[] | null>(null);
  const [itemImageMap, setItemImageMap] = useState<Record<string, string>>({});
  const [showRawData, setShowRawData] = useState(false);

  /* =========================
     PREMIUM ADMIN THEME (match dashboard)
     ONLY COLOR + FONT CHANGES
     ========================= */
  const styles = useMemo(() => {
    const pageText = "#0b0f17";
    const muted = "rgba(15, 23, 42, 0.70)";

    const card: React.CSSProperties = {
      padding: 14,
      borderRadius: 18,
      background: "#FFFFFF",
      border: "1px solid rgba(15, 23, 42, 0.10)",
      boxShadow: "0 14px 36px rgba(15, 23, 42, 0.08)",
      color: pageText,
    };

    const input: React.CSSProperties = {
      width: "100%",
      padding: "11px 12px",
      borderRadius: 14,
      border: "1px solid rgba(15, 23, 42, 0.14)",
      background: "rgba(255,255,255,0.95)",
      color: pageText,
      outline: "none",
      fontSize: 13,
      fontWeight: 700,
    };

    const btn: React.CSSProperties = {
      padding: "10px 12px",
      borderRadius: 14,
      border: "1px solid rgba(15, 23, 42, 0.12)",
      background: "rgba(255,255,255,0.92)",
      color: pageText,
      fontWeight: 900,
      cursor: "pointer",
      fontSize: 12,
      whiteSpace: "nowrap",
      boxShadow: "0 10px 22px rgba(15, 23, 42, 0.06)",
    };

    const btnPrimary: React.CSSProperties = {
      ...btn,
      background: "linear-gradient(135deg, rgba(255,140,0,1), rgba(255,220,160,0.95))",
      border: "1px solid rgba(255,200,120,0.55)",
      color: "#0b0f17",
      boxShadow: "0 14px 30px rgba(255,140,0,0.22)",
    };

    const badge = (v: string): React.CSSProperties => {
      const s = normalizeStatus(v);
      const common: React.CSSProperties = {
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 950,
        border: "1px solid rgba(15, 23, 42, 0.12)",
        background: "rgba(15, 23, 42, 0.04)",
        color: pageText,
      };

      if (s === "delivered")
        return {
          ...common,
          background: "rgba(0, 200, 120, 0.10)",
          border: "1px solid rgba(0, 200, 120, 0.22)",
        };

      if (s === "cancelled")
        return {
          ...common,
          background: "rgba(255, 0, 90, 0.10)",
          border: "1px solid rgba(255, 0, 90, 0.22)",
        };

      if (s === "pending")
        return {
          ...common,
          background: "rgba(255, 180, 0, 0.12)",
          border: "1px solid rgba(255, 180, 0, 0.26)",
        };

      if (s === "accepted" || s === "preparing" || s === "out_for_delivery")
        return {
          ...common,
          background: "rgba(0, 140, 255, 0.10)",
          border: "1px solid rgba(0, 140, 255, 0.22)",
        };

      return { ...common, color: muted };
    };

    const pageBg: React.CSSProperties = {
      padding: 16,
      borderRadius: 18,
      background:
        "radial-gradient(1200px 600px at 20% 10%, rgba(255,140,0,0.18), transparent 55%), radial-gradient(900px 520px at 85% 0%, rgba(255,220,160,0.18), transparent 60%), linear-gradient(180deg, rgba(248,250,252,1), rgba(241,245,249,1))",
      color: pageText,
      border: "1px solid rgba(15, 23, 42, 0.06)",
    };

    return { card, input, btn, btnPrimary, badge, pageBg, pageText, muted };
  }, []);

  async function loadRestaurants() {
    // Outlet list for filter dropdown (restaurants + groceries)
    try {
      const [restRes, storeRes] = await Promise.allSettled([
        supabase.from("restaurants").select("id, name").order("name", { ascending: true }),
        supabase.from("grocery_stores").select("id, name").order("name", { ascending: true }),
      ]);

      const outletRows: AnyRow[] = [];

      if (restRes.status === "fulfilled" && !restRes.value.error) {
        for (const r of restRes.value.data || []) {
          if (!r?.id) continue;
          outletRows.push({ id: `restaurant:${r.id}`, rawId: String(r.id), name: String(r?.name || "Restaurant"), type: "restaurant" });
        }
      } else if (restRes.status === "fulfilled" && restRes.value.error) {
        console.log("Restaurants load error:", restRes.value.error);
      }

      if (storeRes.status === "fulfilled" && !storeRes.value.error) {
        for (const s of storeRes.value.data || []) {
          if (!s?.id) continue;
          outletRows.push({ id: `grocery:${s.id}`, rawId: String(s.id), name: String(s?.name || "Grocery Store"), type: "grocery" });
        }
      } else if (storeRes.status === "fulfilled" && storeRes.value.error) {
        console.log("Grocery stores load error:", storeRes.value.error);
      }

      setRestaurants(outletRows);
    } catch (e) {
      console.log("Outlets load crashed:", e);
      setRestaurants([]);
    }
  }

  async function loadOrders() {
    setLoading(true);
    setError(null);

    try {
      const rawFilter = String(restaurantFilter || "");
      const selectedType = rawFilter ? (rawFilter.includes(":") ? rawFilter.split(":")[0] : "restaurant") : "";
      const selectedId = rawFilter ? (rawFilter.includes(":") ? rawFilter.split(":").slice(1).join(":") : rawFilter) : "";

      const storeMap: Record<string, string> = {};
      try {
        const storeRes = await supabase.from("grocery_stores").select("id,name").limit(2000);
        if (!storeRes.error) {
          for (const s of storeRes.data || []) {
            const sid = String((s as AnyRow)?.id || "").trim();
            if (!sid) continue;
            storeMap[sid] = String((s as AnyRow)?.name || "Grocery Store");
          }
        }
      } catch {}

      const mergedRows: AnyRow[] = [];
      const errors: string[] = [];

      if (!selectedType || selectedType === "restaurant") {
        let q: any = supabase.from("orders").select("*, restaurants(name)");
        if (statusFilter) q = q.eq("status", statusFilter);
        if (selectedType === "restaurant" && selectedId) q = q.eq("restaurant_id", selectedId);
        if (dateFrom) q = q.gte("created_at", `${dateFrom}T00:00:00`);
        if (dateTo) q = q.lte("created_at", `${dateTo}T23:59:59`);
        q = q.order("created_at", { ascending: false }).limit(200);

        let { data, error } = await q;
        if (error) {
          console.log("Orders load (with restaurants) error:", error);
          let q2: any = supabase.from("orders").select("*");
          if (statusFilter) q2 = q2.eq("status", statusFilter);
          if (selectedType === "restaurant" && selectedId) q2 = q2.eq("restaurant_id", selectedId);
          if (dateFrom) q2 = q2.gte("created_at", `${dateFrom}T00:00:00`);
          if (dateTo) q2 = q2.lte("created_at", `${dateTo}T23:59:59`);
          q2 = q2.order("created_at", { ascending: false }).limit(200);
          const r2 = await q2;
          data = r2.data;
          error = r2.error;
        }
        if (error) {
          errors.push(`orders: ${error.message || "Unknown error"}`);
        } else {
          for (const o of (data || []) as AnyRow[]) {
            mergedRows.push({
              ...o,
              __source: "restaurant",
              __key: `restaurant:${String(o?.id || "")}`,
              __outletName: String(o?.restaurants?.name || o?.restaurant_name || o?.restaurant_id || "Restaurant"),
            });
          }
        }
      }

      if (!selectedType || selectedType === "grocery") {
        let gq: any = supabase.from("grocery_orders").select("*");
        if (statusFilter) gq = gq.eq("status", statusFilter);
        if (selectedType === "grocery" && selectedId) gq = gq.eq("store_id", selectedId);
        if (dateFrom) gq = gq.gte("created_at", `${dateFrom}T00:00:00`);
        if (dateTo) gq = gq.lte("created_at", `${dateTo}T23:59:59`);
        gq = gq.order("created_at", { ascending: false }).limit(200);

        const gr = await gq;
        if (gr.error) {
          errors.push(`grocery_orders: ${gr.error.message || "Unknown error"}`);
        } else {
          for (const o of (gr.data || []) as AnyRow[]) {
            const sid = String(o?.store_id || o?.grocery_store_id || "").trim();
            const outletName = String(
              o?.store_name ||
                o?.grocery_store_name ||
                o?.shop_name ||
                o?.mart_name ||
                (sid ? storeMap[sid] : "") ||
                "Grocery Store"
            );
            mergedRows.push({
              ...o,
              __source: "grocery",
              __key: `grocery:${String(o?.id || "")}`,
              __outletName: outletName,
            });
          }
        }
      }

      mergedRows.sort((a, b) => {
        const ad = new Date(a?.created_at || 0).getTime();
        const bd = new Date(b?.created_at || 0).getTime();
        return bd - ad;
      });

      if (errors.length) setError(`Orders fetch issue: ${errors.join(" | ")}`);
      setOrders(mergedRows);
    } catch (e: any) {
      console.log(e);
      setError("Orders fetch crashed. Open console and share error.");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRestaurants();
    // Initial load
    loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload when filters change (small debounce)
  useEffect(() => {
    const t = setTimeout(() => loadOrders(), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, restaurantFilter, dateFrom, dateTo]);

  const filteredOrders = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return orders;

    return orders.filter((o) => {
      const id = String(o?.id ?? "").toLowerCase();
      const status = String(o?.status ?? "").toLowerCase();
      const email = String(o?.customer_email ?? o?.email ?? "").toLowerCase();
      const phone = String(o?.customer_phone ?? o?.phone ?? "").toLowerCase();
      const restName = String(o?.__outletName ?? o?.restaurants?.name ?? o?.restaurant_name ?? o?.store_name ?? "").toLowerCase();
      return id.includes(s) || status.includes(s) || email.includes(s) || phone.includes(s) || restName.includes(s);
    });
  }, [orders, search]);

  const stats = useMemo(() => {
    const total = filteredOrders.length;
    let pending = 0;
    let delivered = 0;
    let cancelled = 0;

    for (const o of filteredOrders) {
      const st = normalizeStatus(o?.status);
      if (st === "pending") pending++;
      if (st === "delivered") delivered++;
      if (st === "cancelled") cancelled++;
    }
    return { total, pending, delivered, cancelled };
  }, [filteredOrders]);

  async function openDetails(order: AnyRow) {
    setSelected(order);
    setOrderItems(null);
    setItemImageMap({});
    setShowRawData(false);
    setDetailsError(null);
    setDetailsLoading(true);

    try {
      const source = order?.__source === "grocery" ? "grocery" : "restaurant";
      const itemTable = source === "grocery" ? "grocery_order_items" : "order_items";
      const parseLegacyItems = (value: any): AnyRow[] => {
        if (!value) return [];
        let v = value;
        if (typeof v === "string") {
          try {
            v = JSON.parse(v);
          } catch {
            return [];
          }
        }
        if (!Array.isArray(v)) {
          if (Array.isArray(v?.items)) v = v.items;
          else if (v && typeof v === "object") v = Object.values(v);
          else return [];
        }
        return (v as AnyRow[])
          .map((it) => {
            const name =
              it?.item_name ||
              it?.name ||
              it?.title ||
              it?.product_name ||
              it?.menu_item_name ||
              it?.display_name ||
              "";
            const menuId = it?.menu_item_id || it?.menuItemId || it?.item_id || it?.id || "";
            const qty = Number(it?.qty ?? it?.quantity ?? it?.count ?? 1) || 1;
            const nestedUnitAmount = Number(it?.price_data?.unit_amount ?? it?.unit_amount ?? 0);
            const nestedUnitPrice = nestedUnitAmount > 0 ? nestedUnitAmount / 100 : 0;
            const price = Number(it?.price_each ?? it?.unit_price ?? it?.price ?? it?.amount ?? nestedUnitPrice ?? 0) || 0;
            const image =
              it?.image_url ||
              it?.item_image ||
              it?.img ||
              it?.product_image ||
              it?.menu_item_image ||
              "";
            if (!name && !menuId) return null;
            return {
              ...it,
              menu_item_id: menuId || undefined,
              item_name: name || "Item",
              qty,
              price_each: price,
              image_url: image || "",
            };
          })
          .filter(Boolean) as AnyRow[];
      };

      const attempts =
        source === "grocery"
          ? [
              { select: "*", col: "order_id" },
              { select: "*", col: "orderId" },
            ]
          : [
              { select: "*, menu_items(id,name,price,image_url)", col: "order_id" },
              { select: "*", col: "order_id" },
              { select: "*", col: "orderId" },
              { select: "*", col: "restaurant_order_id" },
            ];

      let loaded: AnyRow[] = [];
      let lastErr: any = null;

      for (const a of attempts) {
        const r = await supabase.from(itemTable).select(a.select).eq(a.col, order.id);
        if (r.error) {
          lastErr = r.error;
          const msg = String(r.error?.message || "").toLowerCase();
          if (msg.includes("column") && msg.includes("does not exist")) continue;
          continue;
        }
        loaded = (r.data || []) as AnyRow[];
        if (loaded.length > 0) break;
      }

      if (loaded.length === 0 && source === "restaurant") {
        const fallbackKeys = ["items", "order_items", "cart_items", "products", "line_items"];
        for (const k of fallbackKeys) {
          const legacy = parseLegacyItems(order?.[k]);
          if (legacy.length > 0) {
            loaded = legacy;
            break;
          }
        }
      }

      // Deep fallback: fetch this order with nested order_items in case list query omitted item payload fields.
      if (loaded.length === 0 && source === "restaurant") {
        try {
          const deep = await supabase
            .from("orders")
            .select("id, items, order_items, cart_items, products, line_items, order_items(*, menu_items(id,name,price,image_url))")
            .eq("id", order.id)
            .maybeSingle();
          if (!deep.error && deep.data) {
            const nested = Array.isArray((deep.data as AnyRow)?.order_items) ? ((deep.data as AnyRow).order_items as AnyRow[]) : [];
            if (nested.length > 0) {
              loaded = nested;
            } else {
              const deepKeys = ["items", "order_items", "cart_items", "products", "line_items"];
              for (const k of deepKeys) {
                const legacy = parseLegacyItems((deep.data as AnyRow)?.[k]);
                if (legacy.length > 0) {
                  loaded = legacy;
                  break;
                }
              }
            }
          }
        } catch {}
      }

      if (loaded.length === 0 && lastErr) {
        console.log("Order items load error:", lastErr);
      }

      const items: AnyRow[] = loaded.map((it) => {
        const menuRel = it?.menu_items || {};
        return {
          ...it,
          item_name: it?.item_name || it?.name || menuRel?.name || "",
          price_each: it?.price_each ?? it?.price ?? it?.unit_price ?? menuRel?.price ?? 0,
          image_url: it?.image_url || it?.item_image || menuRel?.image_url || "",
        };
      });
      setOrderItems(items);

      const ids = Array.from(
        new Set(
          items
            .map((it) => String(it?.menu_item_id || it?.grocery_item_id || it?.item_id || "").trim())
            .filter(Boolean)
        )
      );

      const nextMap: Record<string, string> = {};
      if (ids.length > 0) {
        if (source === "grocery") {
          const g = await supabase.from("grocery_items").select("id,image_url").in("id", ids);
          if (!g.error) {
            for (const row of (g.data || []) as AnyRow[]) {
              const id = String(row?.id || "").trim();
              const img = String(row?.image_url || "").trim();
              if (id && img) nextMap[id] = img;
            }
          }
        } else {
          const m = await supabase.from("menu_items").select("id,image_url").in("id", ids);
          if (!m.error) {
            for (const row of (m.data || []) as AnyRow[]) {
              const id = String(row?.id || "").trim();
              const img = String(row?.image_url || "").trim();
              if (id && img) nextMap[id] = img;
            }
          }
        }
      }
      setItemImageMap(nextMap);
    } catch (e: any) {
      console.log(e);
      setDetailsError("Failed to load order details. Check console.");
      setItemImageMap({});
    } finally {
      setDetailsLoading(false);
    }
  }

  async function forceStatus(order: AnyRow, newStatus: string) {
    const id = order?.id;
    if (!id) return;
    const rowKey = String(order?.__key || id);

    setBusyId(rowKey);
    setError(null);

    try {
      const table = order?.__source === "grocery" ? "grocery_orders" : "orders";
      const { error } = await supabase.from(table).update({ status: newStatus }).eq("id", id);

      if (error) {
        setError(`Update failed: ${error.message || "Unknown error"}`);
        return;
      }

      // Update locally
      setOrders((prev) =>
        prev.map((x) => {
          const xKey = String(x?.__key || x?.id || "");
          return xKey === rowKey ? { ...x, status: newStatus } : x;
        })
      );

      // Update selected also
      setSelected((prev) => {
        if (!prev) return prev;
        if (String(prev?.__key || prev?.id || "") !== rowKey) return prev;
        return { ...prev, status: newStatus };
      });
    } catch (e: any) {
      console.log(e);
      setError("Update crashed. Check console.");
    } finally {
      setBusyId(null);
    }
  }

  const headerRow: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1.2fr 1.1fr 1fr 0.9fr 0.8fr 1.1fr 1fr",
    gap: 10,
    padding: "11px 12px",
    borderRadius: 14,
    background: "#FFFFFF",
    border: "1px solid rgba(15, 23, 42, 0.10)",
    boxShadow: "0 12px 26px rgba(15, 23, 42, 0.06)",
    fontSize: 12,
    fontWeight: 950,
    color: styles.pageText,
  };

  const rowStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1.2fr 1.1fr 1fr 0.9fr 0.8fr 1.1fr 1fr",
    gap: 10,
    padding: "12px 12px",
    borderRadius: 14,
    background: "#FFFFFF",
    border: "1px solid rgba(15, 23, 42, 0.08)",
    boxShadow: "0 12px 26px rgba(15, 23, 42, 0.05)",
    cursor: "pointer",
    color: styles.pageText,
  };

  const modalOverlay: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "rgba(2,6,23,0.55)",
    backdropFilter: "blur(8px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
    zIndex: 9999,
  };

  const modalCard: React.CSSProperties = {
    width: "min(980px, 100%)",
    maxHeight: "90vh",
    overflow: "auto",
    borderRadius: 20,
    background: "#FFFFFF",
    border: "1px solid rgba(15, 23, 42, 0.12)",
    boxShadow: "0 30px 120px rgba(2,6,23,0.35)",
    padding: 16,
    color: styles.pageText,
  };

  return (
    <div style={styles.pageBg}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 950, letterSpacing: -0.2 }}>Orders</div>
          <div style={{ fontSize: 13, color: styles.muted, marginTop: 6, fontWeight: 700 }}>
            All orders across restaurants + groceries — filter, view details, and force status updates.
          </div>
        </div>

        <button onClick={() => loadOrders()} style={styles.btnPrimary} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12, marginTop: 14 }}>
        <div style={styles.card}>
          <div style={{ fontSize: 12, color: styles.muted, fontWeight: 900 }}>Total (filtered)</div>
          <div style={{ fontSize: 28, fontWeight: 950, marginTop: 6 }}>{stats.total}</div>
        </div>
        <div style={styles.card}>
          <div style={{ fontSize: 12, color: styles.muted, fontWeight: 900 }}>Pending</div>
          <div style={{ fontSize: 28, fontWeight: 950, marginTop: 6 }}>{stats.pending}</div>
        </div>
        <div style={styles.card}>
          <div style={{ fontSize: 12, color: styles.muted, fontWeight: 900 }}>Delivered</div>
          <div style={{ fontSize: 28, fontWeight: 950, marginTop: 6 }}>{stats.delivered}</div>
        </div>
        <div style={styles.card}>
          <div style={{ fontSize: 12, color: styles.muted, fontWeight: 900 }}>Cancelled</div>
          <div style={{ fontSize: 28, fontWeight: 950, marginTop: 6 }}>{stats.cancelled}</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ ...styles.card, marginTop: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 950, letterSpacing: -0.1 }}>Filters</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginTop: 10 }}>
          <div>
            <div style={{ fontSize: 12, color: styles.muted, marginBottom: 6, fontWeight: 900 }}>Status</div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ ...styles.input, paddingRight: 34 }}>
              {STATUS_OPTIONS.map((x) => (
                <option key={x.value} value={x.value}>
                  {x.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div style={{ fontSize: 12, color: styles.muted, marginBottom: 6, fontWeight: 900 }}>Outlet</div>
            <select value={restaurantFilter} onChange={(e) => setRestaurantFilter(e.target.value)} style={{ ...styles.input, paddingRight: 34 }}>
              <option value="">All outlets</option>
              {restaurants.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.type === "grocery" ? `Grocery • ${r.name}` : `Restaurant • ${r.name}`}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div style={{ fontSize: 12, color: styles.muted, marginBottom: 6, fontWeight: 900 }}>From</div>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={styles.input} />
          </div>

          <div>
            <div style={{ fontSize: 12, color: styles.muted, marginBottom: 6, fontWeight: 900 }}>To</div>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={styles.input} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 12, color: styles.muted, marginBottom: 6, fontWeight: 900 }}>Search</div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by order id / status / email / outlet…"
              style={styles.input}
            />
          </div>

          <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
            <button
              style={styles.btn}
              onClick={() => {
                setStatusFilter("");
                setRestaurantFilter("");
                setDateFrom("");
                setDateTo("");
                setSearch("");
              }}
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* Error */}
      {error ? (
        <div style={{ ...styles.card, marginTop: 12, border: "1px solid rgba(255,0,90,0.25)", background: "rgba(255,0,90,0.06)" }}>
          <div style={{ fontWeight: 950 }}>Error</div>
          <div style={{ marginTop: 6, fontSize: 13, opacity: 0.95 }}>{error}</div>
          <div style={{ marginTop: 8, fontSize: 12, color: styles.muted, fontWeight: 700 }}>
            If this says “permission denied / RLS”, we need admin policies for orders + order_items (I’ll guide you).
          </div>
        </div>
      ) : null}

      {/* Table */}
      <div style={{ marginTop: 12 }}>
        <div style={headerRow}>
          <div>Order</div>
          <div>Outlet</div>
          <div>Status</div>
          <div>Total</div>
          <div>Items</div>
          <div>Created</div>
          <div>Actions</div>
        </div>

        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
          {loading ? (
            <div style={styles.card}>Loading orders…</div>
          ) : filteredOrders.length === 0 ? (
            <div style={styles.card}>No orders found.</div>
          ) : (
            filteredOrders.map((o) => {
              const id = o?.id ?? "-";
              const restName = o?.__outletName ?? o?.restaurants?.name ?? o?.restaurant_name ?? o?.store_name ?? o?.restaurant_id ?? o?.store_id ?? "-";
              const status = o?.status ?? "pending";
              const total = o?.total_amount ?? o?.total ?? o?.grand_total ?? 0;
              const itemCount = o?.items_count ?? o?.item_count ?? o?.quantity_total ?? "-";
              const created = o?.created_at ?? o?.createdAt ?? o?.created_on;

              return (
                <div key={String(o?.__key || id)} style={rowStyle} onClick={() => openDetails(o)} title="Click to view details">
                  <div style={{ fontWeight: 950 }}>
                    #{clampText(id, 20)}
                    <div style={{ fontSize: 12, color: styles.muted, marginTop: 2, fontWeight: 700 }}>
                      {o?.customer_email ? clampText(o.customer_email, 36) : ""}
                      {o?.__source ? `${o?.customer_email ? " • " : ""}${o.__source === "grocery" ? "Grocery" : "Restaurant"}` : ""}
                    </div>
                  </div>

                  <div style={{ fontWeight: 950, opacity: 0.98 }}>{clampText(restName, 28)}</div>

                  <div>
                    <span style={styles.badge(status)}>{normalizeStatus(status) || "pending"}</span>
                  </div>

                  <div style={{ fontWeight: 950 }}>{formatMoney(total)}</div>

                  <div style={{ color: styles.muted, fontWeight: 800 }}>{String(itemCount)}</div>

                  <div style={{ color: styles.muted, fontWeight: 700 }}>{formatDateTime(created)}</div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} onClick={(e) => e.stopPropagation()}>
                    <button style={styles.btn} disabled={busyId === String(o?.__key || id)} onClick={() => forceStatus(o, "delivered")}>
                      Deliver
                    </button>
                    <button style={styles.btn} disabled={busyId === String(o?.__key || id)} onClick={() => forceStatus(o, "cancelled")}>
                      Cancel
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Details Modal */}
      {selected ? (
        <div style={modalOverlay} onClick={() => setSelected(null)}>
          <div style={modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 950, letterSpacing: -0.2 }}>Order #{String(selected?.id ?? "")}</div>
                <div style={{ fontSize: 13, color: styles.muted, marginTop: 4, fontWeight: 700 }}>
                  {selected?.__source === "grocery"
                    ? selected?.__outletName
                      ? `Grocery Store: ${selected.__outletName}`
                      : selected?.store_id
                      ? `Store ID: ${selected.store_id}`
                      : ""
                    : selected?.restaurants?.name
                    ? `Restaurant: ${selected.restaurants.name}`
                    : selected?.restaurant_id
                    ? `Restaurant ID: ${selected.restaurant_id}`
                    : ""}
                </div>
              </div>

              <button style={styles.btn} onClick={() => setSelected(null)}>
                Close
              </button>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
              {FORCE_STATUS_BUTTONS.map((b) => (
                <button
                  key={b.value}
                  style={b.value === normalizeStatus(selected?.status) ? styles.btnPrimary : styles.btn}
                  disabled={busyId === String(selected?.__key || selected?.id || "")}
                  onClick={() => forceStatus(selected, b.value)}
                >
                  {b.label}
                </button>
              ))}
            </div>

            <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ ...styles.card, background: "rgba(15, 23, 42, 0.03)" }}>
                <div style={{ fontSize: 13, fontWeight: 950 }}>Order & Customer</div>
                <div style={{ marginTop: 10, fontSize: 13, opacity: 0.95, lineHeight: 1.7 }}>
                  <div>
                    <b>Status:</b> {String(selected?.status ?? "-")}
                  </div>
                  <div>
                    <b>Total:</b> {formatMoney(selected?.total_amount ?? selected?.total ?? selected?.grand_total ?? 0)}
                  </div>
                  <div>
                    <b>Created:</b> {formatDateTime(selected?.created_at)}
                  </div>
                  <div>
                    <b>Customer:</b>{" "}
                    {String(selected?.customer_name || selected?.customer_email || selected?.email || "Customer")}
                  </div>
                  <div>
                    <b>Email:</b> {String(selected?.customer_email || selected?.email || "-")}
                  </div>
                  <div>
                    <b>Phone:</b> {String(selected?.customer_phone || selected?.phone || "-")}
                  </div>
                  <div>
                    <b>Payment:</b> {String(selected?.payment_method || selected?.payment_status || "Unknown")}
                  </div>
                  {ownerRejectReason(selected) ? (
                    <div
                      style={{
                        marginTop: 10,
                        padding: "12px 14px",
                        borderRadius: 14,
                        background: "rgba(255, 0, 90, 0.08)",
                        border: "1px solid rgba(255, 0, 90, 0.18)",
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 950, color: "#9f1239", textTransform: "uppercase", letterSpacing: 0.3 }}>
                        Owner rejection note
                      </div>
                      <div style={{ marginTop: 6, fontSize: 14, fontWeight: 700, color: styles.pageText }}>
                        {ownerRejectReason(selected)}
                      </div>
                    </div>
                  ) : null}
                  <div>
                    <b>Address:</b>{" "}
                    {String(
                      selected?.delivery_address ||
                        [selected?.address_line1, selected?.address_line2, selected?.landmark].filter(Boolean).join(", ") ||
                        "-"
                    )}
                  </div>
                  {selected?.instructions ? (
                    <div>
                      <b>Instructions:</b> {String(selected.instructions)}
                    </div>
                  ) : null}
                </div>
              </div>

              <div style={{ ...styles.card, background: "rgba(15, 23, 42, 0.03)" }}>
                <div style={{ fontSize: 13, fontWeight: 950 }}>Items</div>

                {detailsLoading ? (
                  <div style={{ marginTop: 10, color: styles.muted, fontWeight: 700 }}>Loading items…</div>
                ) : detailsError ? (
                  <div style={{ marginTop: 10, opacity: 0.95 }}>{detailsError}</div>
                ) : orderItems && orderItems.length > 0 ? (
                  <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                    {orderItems.map((it, idx) => {
                      const itemId = String(it?.menu_item_id || it?.grocery_item_id || it?.item_id || "").trim();
                      const directImage = String(it?.image_url || it?.item_image || it?.menu_items?.image_url || "").trim();
                      const mappedImage = itemId ? String(itemImageMap[itemId] || "").trim() : "";
                      const imageUrl = directImage || mappedImage;
                      const name = it?.name || it?.item_name || it?.menu_item_name || it?.menu_items?.name || `Item ${idx + 1}`;
                      const qty = Number(it?.qty ?? it?.quantity ?? 1) || 1;
                      const unitPrice = Number(it?.price ?? it?.unit_price ?? it?.price_each ?? it?.menu_items?.price ?? it?.amount ?? 0) || 0;
                      const lineTotal = Number(it?.line_total ?? qty * unitPrice) || 0;

                      return (
                        <div
                          key={idx}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "56px 1fr",
                            gap: 10,
                            alignItems: "center",
                            padding: 10,
                            borderRadius: 14,
                            background: "rgba(15, 23, 42, 0.03)",
                            border: "1px solid rgba(15, 23, 42, 0.10)",
                          }}
                        >
                          {imageUrl ? (
                            <img
                              src={imageUrl}
                              alt={String(name)}
                              style={{
                                width: 56,
                                height: 56,
                                borderRadius: 10,
                                objectFit: "cover",
                                border: "1px solid rgba(15, 23, 42, 0.12)",
                                background: "#fff",
                              }}
                            />
                          ) : (
                            <div
                              style={{
                                width: 56,
                                height: 56,
                                borderRadius: 10,
                                border: "1px solid rgba(15, 23, 42, 0.12)",
                                background: "rgba(15, 23, 42, 0.05)",
                                display: "grid",
                                placeItems: "center",
                                fontWeight: 950,
                                color: styles.muted,
                              }}
                            >
                              {String(name).slice(0, 1).toUpperCase()}
                            </div>
                          )}

                          <div>
                            <div style={{ fontWeight: 950 }}>{name}</div>
                            <div style={{ fontSize: 12, color: styles.muted, marginTop: 4, fontWeight: 700 }}>
                              Qty: {qty} • Unit: {formatMoney(unitPrice)} • Line: {formatMoney(lineTotal)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ marginTop: 10, color: styles.muted, fontWeight: 700 }}>
                    No items found (or order items table not linked yet).
                  </div>
                )}
              </div>
            </div>

            <div style={{ ...styles.card, marginTop: 12, background: "rgba(15, 23, 42, 0.03)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ fontSize: 13, fontWeight: 950 }}>Debug Data</div>
                <button style={styles.btn} onClick={() => setShowRawData((v) => !v)}>
                  {showRawData ? "Hide Raw JSON" : "Show Raw JSON"}
                </button>
              </div>
              {showRawData ? (
                <pre
                  style={{
                    marginTop: 10,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    fontSize: 12,
                    opacity: 0.9,
                    color: styles.pageText,
                  }}
                >
{JSON.stringify(selected, null, 2)}
                </pre>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

