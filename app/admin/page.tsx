"use client";

import React, { useEffect, useMemo, useState } from "react";
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
function money(v: any) {
  const n = Number(v || 0);
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

async function safeCount(table: string, filters?: (q: any) => any) {
  let q = supabase.from(table).select("*", { count: "exact", head: true });
  if (filters) q = filters(q);
  const { count, error } = await q;
  if (error) return 0;
  return count || 0;
}

async function safeCountRoles(roles: string[]) {
  const { count, error } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .in("role", roles);
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

/** ✅ Light theme mini bar chart */
function MiniBarChart({
  title,
  subtitle,
  values,
  labels,
}: {
  title: string;
  subtitle?: string;
  values: number[];
  labels: string[];
}) {
  const max = Math.max(1, ...values);

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
      <div style={{ fontSize: 13, fontWeight: 900, color: "#0F172A" }}>{title}</div>
      {subtitle ? <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>{subtitle}</div> : null}

      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", marginTop: 14, height: 120 }}>
        {values.map((v, i) => {
          const h = Math.max(6, Math.round((v / max) * 120));
          return (
            <div key={i} style={{ flex: 1, minWidth: 22, textAlign: "center" }}>
              <div
                title={`${labels[i]}: ${v}`}
                style={{
                  height: h,
                  borderRadius: 12,
                  background: "linear-gradient(180deg, rgba(255,140,0,0.95), rgba(255,220,160,0.95))",
                  border: "1px solid rgba(255,140,0,0.25)",
                  boxShadow: "0 10px 26px rgba(255,140,0,0.12)",
                }}
              />
              <div style={{ marginTop: 8, fontSize: 11, opacity: 0.7 }}>{labels[i]}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  const [loading, setLoading] = useState(true);

  const [totRestaurants, setTotRestaurants] = useState(0);
  const [totOwners, setTotOwners] = useState(0);
  const [totCustomers, setTotCustomers] = useState(0);
  const [totDelivery, setTotDelivery] = useState(0);

  // ✅ Delivery Partner Admin Management stats
  const [deliveryPending, setDeliveryPending] = useState(0);
  const [deliveryApproved, setDeliveryApproved] = useState(0);
  const [deliveryDisabled, setDeliveryDisabled] = useState(0);

  const [ordersToday, setOrdersToday] = useState(0);
  const [ordersWeek, setOrdersWeek] = useState(0);

  const [revToday, setRevToday] = useState(0);
  const [revWeek, setRevWeek] = useState(0);

  const [pending, setPending] = useState(0);
  const [delivered, setDelivered] = useState(0);
  const [cancelled, setCancelled] = useState(0);

  const [newOwners7d, setNewOwners7d] = useState(0);
  const [newCustomers7d, setNewCustomers7d] = useState(0);

  // Charts (7 days)
  const [orders7, setOrders7] = useState<number[]>([0, 0, 0, 0, 0, 0, 0]);
  const [rev7, setRev7] = useState<number[]>([0, 0, 0, 0, 0, 0, 0]);
  const [labels7, setLabels7] = useState<string[]>(["", "", "", "", "", "", ""]);

  async function load() {
    let alive = true;

    try {
      setLoading(true);

      const todayISO = startOfTodayISO();
      const weekISO = daysAgoISO(7);

      // Prepare 7-day buckets (including today)
      const days: Date[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        d.setHours(0, 0, 0, 0);
        days.push(d);
      }
      const keys = days.map(dayKey);
      const labels = days.map(formatDayLabel);
      setLabels7(labels);

      // One query for recent orders to compute charts + revenue sum
      const orderSelectCols = ["created_at", "status", ...TOTAL_COLS].join(",");
      const { data: recentOrders, error: recentErr } = await supabase
        .from("orders")
        .select(orderSelectCols)
        .gte("created_at", weekISO)
        .limit(5000);

      const safeRecent = !recentErr && Array.isArray(recentOrders) ? recentOrders : [];

      const orderCountByDay: Record<string, number> = {};
      const revByDay: Record<string, number> = {};
      for (const k of keys) {
        orderCountByDay[k] = 0;
        revByDay[k] = 0;
      }

      let weekSum = 0;
      let todaySum = 0;

      const todayKey = dayKey(new Date());

      // ✅ ONLY FIX HERE: TS safe cast so build passes on Vercel
      for (const row of safeRecent as any[]) {
        const created = row?.created_at ? new Date(row.created_at) : null;
        if (!created) continue;
        const k = dayKey(created);
        if (orderCountByDay[k] !== undefined) orderCountByDay[k] += 1;

        const amt = pickTotal(row);
        if (revByDay[k] !== undefined) revByDay[k] += amt;

        weekSum += amt;
        if (k === todayKey) todaySum += amt;
      }

      const chartOrders = keys.map((k) => orderCountByDay[k] || 0);
      const chartRev = keys.map((k) => Math.round(revByDay[k] || 0));

      const [
        restaurantsCount,
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

        // ✅ delivery partner management counts (safe even if columns not exist yet)
        deliveryPendingCount,
        deliveryApprovedCount,
        deliveryDisabledCount,
      ] = await Promise.all([
        safeCount("restaurants"),

        // owners can be "owner" or "restaurant_owner"
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

        // Delivery partner pending/approved/disabled (will be 0 if columns not created yet)
        safeCount("profiles", (q) =>
          q.in("role", ["delivery", "delivery_partner"]).eq("delivery_status", "pending")
        ),
        safeCount("profiles", (q) =>
          q.in("role", ["delivery", "delivery_partner"]).eq("delivery_status", "approved")
        ),
        safeCount("profiles", (q) =>
          q.in("role", ["delivery", "delivery_partner"]).eq("delivery_disabled", true)
        ),
      ]);

      if (!alive) return;

      setTotRestaurants(restaurantsCount);
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

      setRevToday(todaySum);
      setRevWeek(weekSum);

      setOrders7(chartOrders);
      setRev7(chartRev);

      setDeliveryPending(deliveryPendingCount);
      setDeliveryApproved(deliveryApprovedCount);
      setDeliveryDisabled(deliveryDisabledCount);
    } finally {
      if (alive) setLoading(false);
    }

    return () => {
      alive = false;
    };
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grid: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(12, 1fr)",
    gap: 14,
  };

  // ✅ Light theme card
  const card = (span: number): React.CSSProperties => ({
    gridColumn: `span ${span}`,
    padding: 16,
    borderRadius: 18,
    background: "#FFFFFF",
    border: "1px solid rgba(15, 23, 42, 0.10)",
    boxShadow: "0 14px 36px rgba(15, 23, 42, 0.08)",
  });

  // ✅ Better font sizes
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
          <div style={{ fontSize: 13, opacity: 0.75, marginTop: 4, lineHeight: 1.5 }}>
            Total system overview + today/week performance + charts (last 7 days).
          </div>
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
        <div style={card(3)}>
          <div style={title}>Total Restaurants</div>
          <div style={value}>{totRestaurants}</div>
        </div>

        <div style={card(3)}>
          <div style={title}>Total Owners</div>
          <div style={value}>{totOwners}</div>
          <div style={{ fontSize: 12, opacity: 0.65, marginTop: 6 }}>owner + restaurant_owner</div>
        </div>

        <div style={card(3)}>
          <div style={title}>Total Customers</div>
          <div style={value}>{totCustomers}</div>
        </div>

        <div style={card(3)}>
          <div style={title}>Delivery Partners</div>
          <div style={value}>{totDelivery}</div>
          <div style={{ fontSize: 12, opacity: 0.65, marginTop: 6 }}>delivery + delivery_partner</div>
        </div>

        {/* ✅ Delivery partner management quick stats */}
        <div style={card(4)}>
          <div style={title}>Delivery Pending</div>
          <div style={value}>{deliveryPending}</div>
          <div style={{ fontSize: 12, opacity: 0.65, marginTop: 6 }}>Needs approval (delivery_status=pending)</div>
        </div>

        <div style={card(4)}>
          <div style={title}>Delivery Approved</div>
          <div style={value}>{deliveryApproved}</div>
          <div style={{ fontSize: 12, opacity: 0.65, marginTop: 6 }}>delivery_status=approved</div>
        </div>

        <div style={card(4)}>
          <div style={title}>Delivery Disabled</div>
          <div style={value}>{deliveryDisabled}</div>
          <div style={{ fontSize: 12, opacity: 0.65, marginTop: 6 }}>delivery_disabled=true</div>
        </div>

        <div style={card(6)}>
          <div style={title}>Orders (Today / Week)</div>
          <div style={{ ...value, display: "flex", gap: 14, alignItems: "baseline" }}>
            <span>{ordersToday}</span>
            <span style={{ fontSize: 14, fontWeight: 900, opacity: 0.7 }}>/ {ordersWeek}</span>
          </div>
          <div style={{ fontSize: 12, opacity: 0.72, marginTop: 6 }}>Based on orders.created_at</div>
        </div>

        <div style={card(6)}>
          <div style={title}>Revenue (Today / Week)</div>
          <div style={{ ...value, display: "flex", gap: 14, alignItems: "baseline" }}>
            <span>{money(revToday)}</span>
            <span style={{ fontSize: 14, fontWeight: 900, opacity: 0.7 }}>/ {money(revWeek)}</span>
          </div>
          <div style={{ fontSize: 12, opacity: 0.72, marginTop: 6 }}>
            Auto-detected total column from: {TOTAL_COLS.join(", ")}
          </div>
        </div>

        <div style={card(4)}>
          <div style={title}>Pending Orders</div>
          <div style={value}>{pending}</div>
          <div style={{ fontSize: 12, opacity: 0.65, marginTop: 6 }}>pending / placed / new</div>
        </div>

        <div style={card(4)}>
          <div style={title}>Delivered Orders</div>
          <div style={value}>{delivered}</div>
          <div style={{ fontSize: 12, opacity: 0.65, marginTop: 6 }}>delivered / completed</div>
        </div>

        <div style={card(4)}>
          <div style={title}>Cancelled Orders</div>
          <div style={value}>{cancelled}</div>
          <div style={{ fontSize: 12, opacity: 0.65, marginTop: 6 }}>cancelled / rejected</div>
        </div>

        <div style={card(6)}>
          <div style={title}>New Signups (Last 7 Days)</div>

          <div style={{ display: "flex", gap: 14, marginTop: 10, flexWrap: "wrap" }}>
            <div
              style={{
                flex: 1,
                minWidth: 240,
                padding: 14,
                borderRadius: 16,
                background: "rgba(255,140,0,0.08)",
                border: "1px solid rgba(255,140,0,0.20)",
              }}
            >
              <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 900 }}>Owners</div>
              <div style={{ fontSize: 24, fontWeight: 950, marginTop: 6 }}>{newOwners7d}</div>
            </div>

            <div
              style={{
                flex: 1,
                minWidth: 240,
                padding: 14,
                borderRadius: 16,
                background: "rgba(0,128,255,0.08)",
                border: "1px solid rgba(0,128,255,0.18)",
              }}
            >
              <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 900 }}>Customers</div>
              <div style={{ fontSize: 24, fontWeight: 950, marginTop: 6 }}>{newCustomers7d}</div>
            </div>
          </div>

          <div style={{ fontSize: 12, opacity: 0.72, marginTop: 10 }}>Based on profiles.created_at</div>
        </div>

        {/* ✅ Charts */}
        <div style={{ gridColumn: "span 6" }}>
          <MiniBarChart title="Orders (Last 7 Days)" subtitle="Daily order volume" values={orders7} labels={labels7} />
        </div>

        <div style={{ gridColumn: "span 6" }}>
          <MiniBarChart title="Revenue (Last 7 Days)" subtitle="Daily revenue sum" values={rev7} labels={labels7} />
        </div>

        <div style={card(12)}>
          <div style={title}>Next: Admin Pages</div>
          <div style={{ marginTop: 10, fontSize: 13, opacity: 0.85, lineHeight: 1.7 }}>
            Next we build:
            <br />• <b>Restaurants</b>: search/filter, approve/reject, enable/disable, edit info, force close
            <br />• <b>Orders</b>: all orders table, status/restaurant/date filters, view details, force status
            <br />• <b>Settings</b>: commission %, delivery fee rules, tax note, feature toggles
            <br />• <b>Delivery Partners</b>: approve/reject, disable/enable, edit details ✅
          </div>
        </div>
      </div>
    </div>
  );
}
