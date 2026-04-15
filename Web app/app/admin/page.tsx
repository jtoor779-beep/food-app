
"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import supabase from "@/lib/supabase";

function startOfTodayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function daysAgoISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}
async function safeCount(table: string, filters?: (q: any) => any) {
  let q = supabase.from(table).select("*", { count: "exact", head: true });
  if (filters) q = filters(q);
  const { count, error } = await q;
  if (error) return 0;
  return count || 0;
}

async function safeCountRoles(roles: string[]) {
  const { count, error } = await supabase.from("profiles").select("*", { count: "exact", head: true }).in("role", roles);
  if (error) return 0;
  return count || 0;
}

async function safeCountStatus(statuses: string[], fromISO?: string) {
  let q = supabase.from("orders").select("*", { count: "exact", head: true }).in("status", statuses);
  if (fromISO) q = q.gte("created_at", fromISO);
  const { count, error } = await q;
  if (error) return 0;
  return count || 0;
}

const TOTAL_COLS = ["total_amount", "total", "grand_total", "amount", "order_total", "total_price"];

function pickTotal(row: any) {
  for (const c of TOTAL_COLS) {
    const v = row?.[c];
    if (v !== null && v !== undefined && v !== "") return Number(v || 0);
  }
  return 0;
}

function formatDayLabel(d: Date) {
  return d.toLocaleDateString(undefined, { weekday: "short" });
}

function dayKey(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString().slice(0, 10);
}

const COMPLETED_STATUSES = new Set(["delivered", "completed", "complete"]);
type ChartChannel = "all" | "restaurant" | "grocery";
type ChartStatus = "all" | "completed";

function MiniTrendCompare({
  title,
  subtitle,
  labels,
  orders,
  revenue,
  ordersTotal,
  revenueTotal,
  chartDays,
  chartChannel,
  chartStatus,
  onDaysChange,
  onChannelChange,
  onStatusChange,
}: {
  title: string;
  subtitle?: string;
  labels: string[];
  orders: number[];
  revenue: number[];
  ordersTotal: number;
  revenueTotal: number;
  chartDays: number;
  chartChannel: ChartChannel;
  chartStatus: ChartStatus;
  onDaysChange: (v: number) => void;
  onChannelChange: (v: ChartChannel) => void;
  onStatusChange: (v: ChartStatus) => void;
}) {
  const w = 560;
  const h = 170;
  const p = 22;
  const innerW = w - p * 2;
  const innerH = h - p * 2;
  const n = Math.max(orders.length, revenue.length, 1);
  const maxY = Math.max(1, ...orders, ...revenue);

  const toPoints = (arr: number[]) =>
    arr
      .map((v, i) => {
        const x = p + (i * innerW) / Math.max(1, n - 1);
        const y = p + innerH - (Math.max(0, Number(v || 0)) / maxY) * innerH;
        return `${x},${y}`;
      })
      .join(" ");

  const orderPts = toPoints(orders);
  const revenuePts = toPoints(revenue);
  const fillPts = `${p},${h - p} ${revenuePts} ${w - p},${h - p}`;

  return (
    <div
      style={{
        padding: 16,
        borderRadius: 18,
        background: "#FFFFFF",
        border: "1px solid rgba(15, 23, 42, 0.10)",
        boxShadow: "0 14px 36px rgba(15, 23, 42, 0.08)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 900, color: "#0F172A" }}>{title}</div>
          {subtitle ? <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>{subtitle}</div> : null}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select
            value={chartDays}
            onChange={(e) => onDaysChange(Number(e.target.value))}
            style={{ borderRadius: 10, padding: "8px 10px", border: "1px solid rgba(15,23,42,0.14)", fontSize: 12, fontWeight: 700, background: "#fff" }}
          >
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
          </select>

          <select
            value={chartChannel}
            onChange={(e) => onChannelChange(e.target.value as ChartChannel)}
            style={{ borderRadius: 10, padding: "8px 10px", border: "1px solid rgba(15,23,42,0.14)", fontSize: 12, fontWeight: 700, background: "#fff" }}
          >
            <option value="all">All sources</option>
            <option value="restaurant">Restaurants</option>
            <option value="grocery">Groceries</option>
          </select>

          <select
            value={chartStatus}
            onChange={(e) => onStatusChange(e.target.value as ChartStatus)}
            style={{ borderRadius: 10, padding: "8px 10px", border: "1px solid rgba(15,23,42,0.14)", fontSize: 12, fontWeight: 700, background: "#fff" }}
          >
            <option value="all">All statuses</option>
            <option value="completed">Completed only</option>
          </select>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, fontWeight: 900, color: "rgba(0,128,255,0.95)", background: "rgba(0,128,255,0.09)", border: "1px solid rgba(0,128,255,0.2)", borderRadius: 999, padding: "5px 10px" }}>
          Orders: {ordersTotal}
        </div>
        <div style={{ fontSize: 12, fontWeight: 900, color: "rgba(255,140,0,0.95)", background: "rgba(255,140,0,0.12)", border: "1px solid rgba(255,140,0,0.26)", borderRadius: 999, padding: "5px 10px" }}>
          Revenue: ${revenueTotal.toLocaleString()}
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: 170, display: "block" }}>
          <line x1={p} y1={p + innerH * 0.25} x2={w - p} y2={p + innerH * 0.25} stroke="rgba(15,23,42,0.08)" strokeWidth="1" />
          <line x1={p} y1={p + innerH * 0.5} x2={w - p} y2={p + innerH * 0.5} stroke="rgba(15,23,42,0.08)" strokeWidth="1" />
          <line x1={p} y1={p + innerH * 0.75} x2={w - p} y2={p + innerH * 0.75} stroke="rgba(15,23,42,0.08)" strokeWidth="1" />
          <line x1={p} y1={h - p} x2={w - p} y2={h - p} stroke="rgba(15,23,42,0.18)" strokeWidth="1" />
          <line x1={p} y1={p} x2={p} y2={h - p} stroke="rgba(15,23,42,0.12)" strokeWidth="1" />

          <polygon points={fillPts} fill="rgba(255,140,0,0.09)" />
          <polyline fill="none" stroke="rgba(0,128,255,0.95)" strokeWidth="3" points={orderPts} />
          <polyline fill="none" stroke="rgba(255,140,0,0.95)" strokeWidth="3" points={revenuePts} />
        </svg>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, gap: 8 }}>
          {labels.map((lb, i) => (
            <div key={i} style={{ flex: 1, textAlign: "center", fontSize: 11, opacity: 0.7 }}>
              {lb}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 14, marginTop: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, fontWeight: 900, color: "rgba(0,128,255,0.95)" }}>Orders trend</div>
        <div style={{ fontSize: 12, fontWeight: 900, color: "rgba(255,140,0,0.95)" }}>Revenue trend</div>
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  const [loading, setLoading] = useState(true);

  const [totRestaurants, setTotRestaurants] = useState(0);
  const [totGroceryStores, setTotGroceryStores] = useState(0);
  const [totOwners, setTotOwners] = useState(0);
  const [totCustomers, setTotCustomers] = useState(0);
  const [totDelivery, setTotDelivery] = useState(0);

  const [deliveryPending, setDeliveryPending] = useState(0);
  const [deliveryApproved, setDeliveryApproved] = useState(0);
  const [deliveryDisabled, setDeliveryDisabled] = useState(0);

  const [ordersToday, setOrdersToday] = useState(0);
  const [ordersWeek, setOrdersWeek] = useState(0);

  const [pending, setPending] = useState(0);
  const [delivered, setDelivered] = useState(0);
  const [cancelled, setCancelled] = useState(0);

  const [newOwners7d, setNewOwners7d] = useState(0);
  const [newCustomers7d, setNewCustomers7d] = useState(0);

  const [orders7, setOrders7] = useState<number[]>([0, 0, 0, 0, 0, 0, 0]);
  const [rev7, setRev7] = useState<number[]>([0, 0, 0, 0, 0, 0, 0]);
  const [labels7, setLabels7] = useState<string[]>(["", "", "", "", "", "", ""]);
  const [chartDays, setChartDays] = useState(7);
  const [chartChannel, setChartChannel] = useState<ChartChannel>("all");
  const [chartStatus, setChartStatus] = useState<ChartStatus>("all");
  const [chartOrdersTotal, setChartOrdersTotal] = useState(0);
  const [chartRevenueTotal, setChartRevenueTotal] = useState(0);

  function load() {
    let alive = true;

    (async () => {
      try {
        setLoading(true);

        const todayISO = startOfTodayISO();
        const weekISO = daysAgoISO(7);
        const chartFromISO = daysAgoISO(Math.max(0, chartDays - 1));

        const days: Date[] = [];
        for (let i = chartDays - 1; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          d.setHours(0, 0, 0, 0);
          days.push(d);
        }
        const keys = days.map(dayKey);
        const labels = days.map(formatDayLabel);
        setLabels7(labels);

        const [ordersRes, groceryOrdersRes] = await Promise.all([
          chartChannel === "grocery"
            ? Promise.resolve({ data: [], error: null as any })
            : supabase.from("orders").select("*").gte("created_at", chartFromISO).limit(5000),
          chartChannel === "restaurant"
            ? Promise.resolve({ data: [], error: null as any })
            : supabase.from("grocery_orders").select("*").gte("created_at", chartFromISO).limit(5000),
        ]);

        const safeRestaurantRecent = !ordersRes.error && Array.isArray(ordersRes.data) ? ordersRes.data : [];
        const safeGroceryRecent = !groceryOrdersRes.error && Array.isArray(groceryOrdersRes.data) ? groceryOrdersRes.data : [];
        const safeRecent = [...safeRestaurantRecent, ...safeGroceryRecent];

        const orderCountByDay: Record<string, number> = {};
        const revByDay: Record<string, number> = {};
        for (const k of keys) {
          orderCountByDay[k] = 0;
          revByDay[k] = 0;
        }

        for (const row of safeRecent as any[]) {
          const created = row?.created_at ? new Date(row.created_at) : null;
          if (!created) continue;
          if (chartStatus === "completed" && !COMPLETED_STATUSES.has(String(row?.status || "").toLowerCase())) continue;
          const k = dayKey(created);
          if (orderCountByDay[k] !== undefined) orderCountByDay[k] += 1;

          const amt = pickTotal(row);
          if (revByDay[k] !== undefined) revByDay[k] += amt;
        }

        const chartOrders = keys.map((k) => orderCountByDay[k] || 0);
        const chartRev = keys.map((k) => Math.round(revByDay[k] || 0));
        const totalOrdersForChart = chartOrders.reduce((a, b) => a + b, 0);
        const totalRevenueForChart = chartRev.reduce((a, b) => a + b, 0);

        const [
          restaurantsCount,
          groceryStoresCount,
          ownersCount,
          customersCount,
          deliveryCount,
          ordersTodayCount,
          ordersWeekCount,
          pendingCount,
          deliveredCount,
          cancelledCount,
          newOwnersCount,
          newCustomersCount,
          deliveryPendingCount,
          deliveryApprovedCount,
          deliveryDisabledCount,
        ] = await Promise.all([
          safeCount("restaurants"),
          safeCount("grocery_stores"),
          safeCountRoles(["owner", "restaurant_owner"]),
          safeCountRoles(["customer"]),
          safeCountRoles(["delivery", "delivery_partner"]),
          safeCount("orders", (q) => q.gte("created_at", todayISO)),
          safeCount("orders", (q) => q.gte("created_at", weekISO)),
          safeCountStatus(["pending", "placed", "new"]),
          safeCountStatus(["delivered", "completed", "complete"]),
          safeCountStatus(["cancelled", "canceled", "rejected"]),
          safeCount("profiles", (q) => q.in("role", ["owner", "restaurant_owner"]).gte("created_at", weekISO)),
          safeCount("profiles", (q) => q.eq("role", "customer").gte("created_at", weekISO)),
          safeCount("profiles", (q) => q.in("role", ["delivery", "delivery_partner"]).eq("delivery_status", "pending")),
          safeCount("profiles", (q) => q.in("role", ["delivery", "delivery_partner"]).eq("delivery_status", "approved")),
          safeCount("profiles", (q) => q.in("role", ["delivery", "delivery_partner"]).eq("delivery_disabled", true)),
        ]);

        if (!alive) return;

        setTotRestaurants(restaurantsCount);
        setTotGroceryStores(groceryStoresCount);
        setTotOwners(ownersCount);
        setTotCustomers(customersCount);
        setTotDelivery(deliveryCount);
        setOrdersToday(ordersTodayCount);
        setOrdersWeek(ordersWeekCount);
        setPending(pendingCount);
        setDelivered(deliveredCount);
        setCancelled(cancelledCount);
        setNewOwners7d(newOwnersCount);
        setNewCustomers7d(newCustomersCount);
        setOrders7(chartOrders);
        setRev7(chartRev);
        setChartOrdersTotal(totalOrdersForChart);
        setChartRevenueTotal(totalRevenueForChart);
        setDeliveryPending(deliveryPendingCount);
        setDeliveryApproved(deliveryApprovedCount);
        setDeliveryDisabled(deliveryDisabledCount);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartDays, chartChannel, chartStatus]);

  const grid: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(12, 1fr)",
    gap: 14,
  };

  const card = (span: number): React.CSSProperties => ({
    gridColumn: `span ${span}`,
    padding: 16,
    borderRadius: 18,
    background: "#FFFFFF",
    border: "1px solid rgba(15, 23, 42, 0.10)",
    boxShadow: "0 14px 36px rgba(15, 23, 42, 0.08)",
  });

  const title: React.CSSProperties = { fontSize: 12, opacity: 0.72, fontWeight: 800 };
  const value: React.CSSProperties = { fontSize: 28, fontWeight: 950, marginTop: 6, letterSpacing: -0.3 };

  const btnPrimary: React.CSSProperties = {
    padding: "10px 14px",
    borderRadius: 14,
    background: "linear-gradient(135deg, rgba(255,140,0,1), rgba(255,220,160,0.95))",
    border: "1px solid rgba(255,140,0,0.35)",
    color: "#0B1220",
    fontWeight: 950,
    cursor: "pointer",
    boxShadow: "0 14px 36px rgba(255,140,0,0.14)",
  };

  const btnGhost: React.CSSProperties = {
    padding: "10px 12px",
    borderRadius: 14,
    background: "rgba(255,255,255,0.85)",
    border: "1px solid rgba(15, 23, 42, 0.12)",
    color: "#0B1220",
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: "0 10px 26px rgba(15,23,42,0.06)",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  };

  const pill: React.CSSProperties = {
    padding: "10px 12px",
    borderRadius: 16,
    background: "rgba(255,255,255,0.88)",
    border: "1px solid rgba(15, 23, 42, 0.10)",
    fontSize: 12,
    fontWeight: 900,
    opacity: 0.9,
    height: "fit-content",
    boxShadow: "0 10px 26px rgba(15,23,42,0.06)",
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 950, letterSpacing: -0.3 }}>Dashboard</div>
          <div style={{ fontSize: 13, opacity: 0.75, marginTop: 4, lineHeight: 1.5 }}>Total system overview + today/week performance + charts (last 7 days).</div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={() => load()} style={btnPrimary}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>

          <Link href="/admin/delivery-partners" style={btnGhost}>
            🚚 Delivery Partners
          </Link>

          <div style={pill}>{loading ? "Loading stats…" : "Live stats ✅"}</div>
        </div>
      </div>

      <div style={grid}>
        <div style={card(3)}><div style={title}>Total Restaurants</div><div style={value}>{totRestaurants}</div></div>
        <div style={card(3)}><div style={title}>Total Grocery Stores</div><div style={value}>{totGroceryStores}</div><div style={{ fontSize: 12, opacity: 0.65, marginTop: 6 }}>From grocery_stores</div></div>
        <div style={card(2)}><div style={title}>Total Owners</div><div style={value}>{totOwners}</div><div style={{ fontSize: 12, opacity: 0.65, marginTop: 6 }}>owner + restaurant_owner</div></div>
        <div style={card(2)}><div style={title}>Total Customers</div><div style={value}>{totCustomers}</div></div>
        <div style={card(2)}><div style={title}>Delivery Partners</div><div style={value}>{totDelivery}</div><div style={{ fontSize: 12, opacity: 0.65, marginTop: 6 }}>delivery + delivery_partner</div></div>

        <div style={card(4)}><div style={title}>Delivery Driver Pending</div><div style={value}>{deliveryPending}</div><div style={{ fontSize: 12, opacity: 0.65, marginTop: 6 }}>Needs approval (delivery_status=pending)</div></div>
        <div style={card(4)}><div style={title}>Delivery Driver Approved</div><div style={value}>{deliveryApproved}</div><div style={{ fontSize: 12, opacity: 0.65, marginTop: 6 }}>delivery_status=approved</div></div>
        <div style={card(4)}><div style={title}>Delivery Disabled</div><div style={value}>{deliveryDisabled}</div><div style={{ fontSize: 12, opacity: 0.65, marginTop: 6 }}>delivery_disabled=true</div></div>

        <div style={card(6)}>
          <div style={title}>Orders (Today / Week)</div>
          <div style={{ ...value, display: "flex", gap: 14, alignItems: "baseline" }}>
            <span>{ordersToday}</span>
            <span style={{ fontSize: 14, fontWeight: 900, opacity: 0.7 }}>/ {ordersWeek}</span>
          </div>
        </div>

        <div style={{ gridColumn: "span 6" }}>
          <MiniTrendCompare
            title={`Orders + Revenue Trend (Last ${chartDays} Days)`}
            subtitle="Connected to live data from orders + grocery_orders."
            labels={labels7}
            orders={orders7}
            revenue={rev7}
            ordersTotal={chartOrdersTotal}
            revenueTotal={chartRevenueTotal}
            chartDays={chartDays}
            chartChannel={chartChannel}
            chartStatus={chartStatus}
            onDaysChange={setChartDays}
            onChannelChange={setChartChannel}
            onStatusChange={setChartStatus}
          />
        </div>

        <div style={card(4)}><div style={title}>Pending Orders</div><div style={value}>{pending}</div><div style={{ fontSize: 12, opacity: 0.65, marginTop: 6 }}>pending / placed / new</div></div>
        <div style={card(4)}><div style={title}>Delivered Orders</div><div style={value}>{delivered}</div><div style={{ fontSize: 12, opacity: 0.65, marginTop: 6 }}>delivered / completed</div></div>
        <div style={card(4)}><div style={title}>Cancelled Orders</div><div style={value}>{cancelled}</div><div style={{ fontSize: 12, opacity: 0.65, marginTop: 6 }}>cancelled / rejected</div></div>

        <div style={card(6)}>
          <div style={title}>New Signups (Last 7 Days)</div>
          <div style={{ display: "flex", gap: 14, marginTop: 10, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 240, padding: 14, borderRadius: 16, background: "rgba(255,140,0,0.08)", border: "1px solid rgba(255,140,0,0.20)" }}>
              <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 900 }}>Owners</div>
              <div style={{ fontSize: 24, fontWeight: 950, marginTop: 6 }}>{newOwners7d}</div>
            </div>
            <div style={{ flex: 1, minWidth: 240, padding: 14, borderRadius: 16, background: "rgba(0,128,255,0.08)", border: "1px solid rgba(0,128,255,0.18)" }}>
              <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 900 }}>Customers</div>
              <div style={{ fontSize: 24, fontWeight: 950, marginTop: 6 }}>{newCustomers7d}</div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

