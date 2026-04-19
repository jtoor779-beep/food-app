"use client";

import React, { useEffect, useState } from "react";
import supabase from "@/lib/supabase";

function tone(status: string) {
  const next = String(status || "pending_verification").toLowerCase();
  if (next === "approved") return { bg: "#dcfce7", color: "#166534" };
  if (next === "rejected") return { bg: "#fee2e2", color: "#b91c1c" };
  return { bg: "#fef3c7", color: "#92400e" };
}

async function adminFetch(path: string, init?: RequestInit) {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;

  const token = String(session?.access_token || "").trim();
  if (!token) throw new Error("Admin session expired. Please sign in again.");

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    ...(init?.headers || {}),
  };

  const response = await fetch(path, { ...init, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(String(payload?.error || payload?.message || `Request failed (${response.status}).`));
  }
  return payload;
}

export default function AdminStoreBankAccountsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try {
      setError("");
      setLoading(true);
      const payload = await adminFetch("/api/admin/store-bank-accounts", { method: "GET" });
      setRows(Array.isArray(payload?.rows) ? payload.rows : []);
    } catch (err: any) {
      setRows([]);
      setError(String(err?.message || "Unable to load store bank accounts."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function updateStatus(row: any, status: string) {
    try {
      const id = String(row?.id || "");
      if (!id) throw new Error("Missing bank account id.");
      setBusyId(id);
      await adminFetch("/api/admin/store-bank-accounts", {
        method: "POST",
        body: JSON.stringify({ id, status }),
      });
      await load();
    } catch (err: any) {
      setError(String(err?.message || "Unable to update bank status."));
    } finally {
      setBusyId("");
    }
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={card}>
        <div style={title}>Store Bank Accounts</div>
        <div style={sub}>Owner-submitted bank details from the manager app appear here for approval.</div>
      </div>

      {error ? <div style={errorBox}>{error}</div> : null}

      <div style={card}>
        {loading ? (
          <div style={sub}>Loading...</div>
        ) : rows.length === 0 ? (
          <div style={sub}>No bank account records found.</div>
        ) : (
          <div style={tableWrap}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Owner", "Role", "Bank", "Account", "Routing", "Country", "Status", "Actions"].map((label) => (
                    <th key={label} style={th}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const rowId = String(row?.id || "");
                  const statusTone = tone(String(row?.status || ""));
                  return (
                    <tr key={rowId}>
                      <td style={td}>{String(row?.owner_user_id || "").slice(0, 8)}</td>
                      <td style={td}>{row?.owner_role || "-"}</td>
                      <td style={td}>{row?.bank_name || "-"}</td>
                      <td style={td}>{row?.account_number_full || row?.account_number_last4 || "-"}</td>
                      <td style={td}>{row?.routing_code_full || row?.routing_code_last4 || "-"}</td>
                      <td style={td}>{row?.country || "-"}</td>
                      <td style={td}>
                        <span style={{ padding: "6px 10px", borderRadius: 999, background: statusTone.bg, color: statusTone.color, fontWeight: 900 }}>
                          {row?.status || "pending_verification"}
                        </span>
                      </td>
                      <td style={td}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button style={btn} disabled={busyId === rowId} onClick={() => updateStatus(row, "approved")}>Approve</button>
                          <button style={btn} disabled={busyId === rowId} onClick={() => updateStatus(row, "rejected")}>Reject</button>
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
