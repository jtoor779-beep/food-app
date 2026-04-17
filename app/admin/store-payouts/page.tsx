"use client";

import React from "react";
import { useEffect, useState } from "react";
import supabase from "@/lib/supabase";

const TABLE = "owner_payout_requests";

function tone(status: string) {
  const next = String(status || "requested").toLowerCase();
  if (next === "paid") return { bg: "#dcfce7", color: "#166534" };
  if (next === "failed") return { bg: "#fee2e2", color: "#b91c1c" };
  if (next === "processing") return { bg: "#dbeafe", color: "#1d4ed8" };
  return { bg: "#fef3c7", color: "#92400e" };
}

function pickOrders(row: any) {
  if (Array.isArray(row?.batch_orders) && row.batch_orders.length) return row.batch_orders;
  if (Array.isArray(row?.settlement_snapshot?.orders) && row.settlement_snapshot.orders.length) return row.settlement_snapshot.orders;
  return [];
}

export default function AdminStorePayoutsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try {
      setError("");
      setLoading(true);
      const { data, error: nextError } = await supabase.from(TABLE).select("*").order("created_at", { ascending: false }).limit(500);
      if (nextError) throw nextError;
      setRows(data || []);
    } catch (err: any) {
      setRows([]);
      setError(String(err?.message || "Unable to load store payouts."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function updateStatus(row: any, status: string) {
    try {
      setBusyId(String(row?.id || ""));
      const { error: nextError } = await supabase.from(TABLE).update({ status }).eq("id", row.id);
      if (nextError) throw nextError;
      await load();
    } catch (err: any) {
      setError(String(err?.message || "Unable to update payout status."));
    } finally {
      setBusyId("");
    }
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={card}>
        <div style={title}>Store Payouts</div>
        <div style={sub}>Payout requests from store owners appear here after they submit them from the manager app.</div>
      </div>

      {error ? <div style={errorBox}>{error}</div> : null}

      <div style={card}>
        {loading ? (
          <div style={sub}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={sub}>No store payout requests found.</div>
        ) : (
          <div style={tableWrap}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Owner", "Role", "Store", "Settlement", "Batch", "Note", "Status", "Actions"].map((label) => (
                    <th key={label} style={th}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const statusTone = tone(String(row?.status || ""));
                  return (
                    <tr key={String(row.id)}>
                      <td style={td}>{String(row?.owner_user_id || "").slice(0, 8)}</td>
                      <td style={td}>{row?.owner_role || "-"}</td>
                      <td style={td}>{String(row?.store_id || "").slice(0, 8) || "-"}</td>
                      <td style={td}>
                        <div style={{ fontWeight: 900 }}>${Number(row?.amount || row?.settlement_total_amount || row?.settlement_snapshot?.settlement_total_amount || 0).toFixed(2)}</div>
                        <div style={subRow}>Sales ${Number(row?.item_subtotal_amount || row?.settlement_snapshot?.item_subtotal_amount || 0).toFixed(2)}</div>
                        <div style={subRow}>Tax ${Number(row?.tax_amount || row?.settlement_snapshot?.tax_amount || 0).toFixed(2)}</div>
                      </td>
                      <td style={td}>
                        {pickOrders(row).length ? (
                          <div style={{ display: "grid", gap: 6 }}>
                            <div style={{ fontWeight: 900 }}>{pickOrders(row).length} orders</div>
                            {pickOrders(row).slice(0, 6).map((order: any) => (
                              <div key={String(order?.order_id)} style={orderLine}>
                                <div>#{String(order?.order_id || "").slice(0, 8)} • {order?.customer_name || "Customer"}</div>
                                <div>Sales ${Number(order?.item_subtotal || 0).toFixed(2)} • Tax ${Number(order?.tax_amount || 0).toFixed(2)}</div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td style={td}>{row?.note || "-"}</td>
                      <td style={td}>
                        <span style={{ padding: "6px 10px", borderRadius: 999, background: statusTone.bg, color: statusTone.color, fontWeight: 900 }}>
                          {row?.status || "requested"}
                        </span>
                      </td>
                      <td style={td}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button style={btn} disabled={busyId === row.id} onClick={() => updateStatus(row, "processing")}>Processing</button>
                          <button style={btn} disabled={busyId === row.id} onClick={() => updateStatus(row, "paid")}>Paid</button>
                          <button style={btn} disabled={busyId === row.id} onClick={() => updateStatus(row, "failed")}>Failed</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const card: React.CSSProperties = { padding: 16, borderRadius: 18, background: "#fff", border: "1px solid rgba(15,23,42,0.10)", boxShadow: "0 14px 36px rgba(15,23,42,0.08)" };
const title: React.CSSProperties = { fontSize: 28, fontWeight: 950, color: "#0f172a" };
const sub: React.CSSProperties = { color: "rgba(15,23,42,0.68)", fontWeight: 700, marginTop: 6 };
const errorBox: React.CSSProperties = { padding: 12, borderRadius: 14, background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", fontWeight: 900 };
const tableWrap: React.CSSProperties = { overflowX: "auto", borderRadius: 14, border: "1px solid rgba(15,23,42,0.08)" };
const th: React.CSSProperties = { textAlign: "left", padding: 12, fontSize: 12, fontWeight: 900, color: "rgba(15,23,42,0.7)", borderBottom: "1px solid rgba(15,23,42,0.08)" };
const td: React.CSSProperties = { padding: 12, fontSize: 13, borderBottom: "1px solid rgba(15,23,42,0.06)", color: "#0f172a" };
const btn: React.CSSProperties = { padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(15,23,42,0.12)", background: "#fff", cursor: "pointer", fontWeight: 900 };
const subRow: React.CSSProperties = { color: "rgba(15,23,42,0.68)", fontSize: 12, fontWeight: 700, marginTop: 4 };
const orderLine: React.CSSProperties = { padding: 8, borderRadius: 10, background: "rgba(15,23,42,0.04)", fontSize: 12, fontWeight: 700, color: "#0f172a" };
