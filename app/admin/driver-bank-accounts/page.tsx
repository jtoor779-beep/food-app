"use client";

import React, { useEffect, useMemo, useState } from "react";
import supabase from "@/lib/supabase";

type AnyRow = Record<string, any>;
type BankStatus = "pending_verification" | "approved" | "rejected";

const BANK_TABLE = "delivery_payout_bank_accounts";

function fmtWhen(v: unknown) {
  try {
    if (!v) return "-";
    const d = new Date(String(v));
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleString();
  } catch {
    return String(v || "-");
  }
}

function statusNorm(v: unknown): BankStatus {
  const s = String(v || "").trim().toLowerCase();
  if (s === "approved") return "approved";
  if (s === "rejected" || s === "failed") return "rejected";
  return "pending_verification";
}

function fullAccount(v: unknown, fallbackLast4: unknown) {
  const full = String(v || "").trim();
  if (full) return full;
  const last4 = String(fallbackLast4 || "").trim();
  if (!last4) return "-";
  return `****${last4} (last4 only)`;
}

export default function AdminDriverBankAccountsPage() {
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [errMsg, setErrMsg] = useState("");
  const [okMsg, setOkMsg] = useState("");

  const [rows, setRows] = useState<AnyRow[]>([]);
  const [driverMap, setDriverMap] = useState<Record<string, { name: string; email: string; phone: string }>>({});

  const [statusFilter, setStatusFilter] = useState<"all" | BankStatus>("all");
  const [search, setSearch] = useState("");

  async function loadAll() {
    setLoading(true);
    setErrMsg("");
    setOkMsg("");
    try {
      const { data, error } = await supabase.from(BANK_TABLE).select("*").order("updated_at", { ascending: false }).limit(2000);
      if (error) throw error;
      const list = Array.isArray(data) ? data : [];
      setRows(list);

      const userIds = Array.from(
        new Set(
          list
            .map((r) => String(r?.delivery_user_id || r?.user_id || "").trim())
            .filter(Boolean)
        )
      );

      if (userIds.length === 0) {
        setDriverMap({});
        return;
      }

      const map: Record<string, { name: string; email: string; phone: string }> = {};

      const { data: profilesByUserId } = await supabase
        .from("profiles")
        .select("id, user_id, full_name, name, email, phone")
        .in("user_id", userIds);

      for (const p of profilesByUserId || []) {
        const uid = String((p as AnyRow)?.user_id || "").trim();
        if (!uid) continue;
        map[uid] = {
          name: String((p as AnyRow)?.full_name || (p as AnyRow)?.name || (p as AnyRow)?.email || `Driver ${uid.slice(0, 8)}`),
          email: String((p as AnyRow)?.email || "-"),
          phone: String((p as AnyRow)?.phone || "-"),
        };
      }

      const unresolved = userIds.filter((uid) => !map[uid]);
      if (unresolved.length > 0) {
        const { data: profilesById } = await supabase
          .from("profiles")
          .select("id, user_id, full_name, name, email, phone")
          .in("id", unresolved);

        for (const p of profilesById || []) {
          const uid = String((p as AnyRow)?.id || (p as AnyRow)?.user_id || "").trim();
          if (!uid) continue;
          map[uid] = {
            name: String((p as AnyRow)?.full_name || (p as AnyRow)?.name || (p as AnyRow)?.email || `Driver ${uid.slice(0, 8)}`),
            email: String((p as AnyRow)?.email || "-"),
            phone: String((p as AnyRow)?.phone || "-"),
          };
        }
      }

      for (const uid of userIds) {
        if (!map[uid]) map[uid] = { name: `Driver ${uid.slice(0, 8)}`, email: "-", phone: "-" };
      }

      setDriverMap(map);
    } catch (e: any) {
      setRows([]);
      setDriverMap({});
      setErrMsg(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function updateStatus(row: AnyRow, next: BankStatus) {
    const id = String(row?.id || "").trim();
    if (!id) return;
    setBusyId(id);
    setErrMsg("");
    setOkMsg("");
    try {
      const { error } = await supabase.from(BANK_TABLE).update({ status: next }).eq("id", id);
      if (error) throw error;

      setRows((prev) => prev.map((r) => (String(r?.id || "") === id ? { ...r, status: next, updated_at: new Date().toISOString() } : r)));
      setOkMsg(`Updated ${id.slice(0, 8)} to ${next.toUpperCase()}`);
    } catch (e: any) {
      setErrMsg(e?.message || String(e));
    } finally {
      setBusyId("");
    }
  }

  const filtered = useMemo(() => {
    const q = String(search || "").trim().toLowerCase();
    return (rows || []).filter((r) => {
      const st = statusNorm(r?.status);
      if (statusFilter !== "all" && st !== statusFilter) return false;
      if (!q) return true;

      const uid = String(r?.delivery_user_id || r?.user_id || "").trim();
      const dm = driverMap[uid];
      const txt = [
        r?.id,
        uid,
        r?.account_holder_name,
        r?.bank_name,
        r?.account_number_full,
        r?.routing_code_full,
        r?.account_number_last4,
        r?.routing_code_last4,
        r?.country,
        r?.currency,
        dm?.name || "",
        dm?.email || "",
        dm?.phone || "",
        st,
      ]
        .map((x) => String(x || "").toLowerCase())
        .join(" ");
      return txt.includes(q);
    });
  }, [rows, statusFilter, search, driverMap]);

  const card: React.CSSProperties = {
    padding: 16,
    borderRadius: 18,
    background: "#FFFFFF",
    border: "1px solid rgba(15, 23, 42, 0.10)",
    boxShadow: "0 14px 36px rgba(15, 23, 42, 0.08)",
  };

  const tableWrap: React.CSSProperties = {
    overflowX: "auto",
    borderRadius: 14,
    border: "1px solid rgba(15, 23, 42, 0.10)",
    background: "rgba(255,255,255,0.92)",
  };

  const th: React.CSSProperties = {
    textAlign: "left",
    padding: "10px 10px",
    fontSize: 12,
    color: "rgba(15,23,42,0.75)",
    borderBottom: "1px solid rgba(15,23,42,0.10)",
    whiteSpace: "nowrap",
  };

  const td: React.CSSProperties = {
    padding: "10px 10px",
    fontSize: 13,
    borderBottom: "1px solid rgba(15,23,42,0.08)",
    verticalAlign: "top",
    whiteSpace: "nowrap",
  };

  const ghostBtn: React.CSSProperties = {
    border: "1px solid rgba(15,23,42,0.14)",
    background: "rgba(255,255,255,0.92)",
    borderRadius: 10,
    padding: "8px 10px",
    fontWeight: 800,
    cursor: "pointer",
  };

  const okBtn: React.CSSProperties = {
    ...ghostBtn,
    border: "1px solid rgba(16,185,129,0.35)",
    color: "#065f46",
    background: "rgba(236,253,245,0.9)",
  };

  const rejectBtn: React.CSSProperties = {
    ...ghostBtn,
    border: "1px solid rgba(239,68,68,0.35)",
    color: "#7f1d1d",
    background: "rgba(254,242,242,0.92)",
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 950, letterSpacing: -0.3 }}>Driver Bank Accounts</div>
          <div style={{ opacity: 0.75, marginTop: 4, fontSize: 13 }}>
            Review payout bank details and approve/reject before payout releases.
          </div>
        </div>
        <button onClick={loadAll} style={ghostBtn}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {errMsg ? (
        <div style={{ ...card, border: "1px solid rgba(239,68,68,0.35)", background: "rgba(254,242,242,0.9)", color: "#7f1d1d", marginBottom: 10 }}>
          {errMsg}
        </div>
      ) : null}
      {okMsg ? (
        <div style={{ ...card, border: "1px solid rgba(16,185,129,0.35)", background: "rgba(236,253,245,0.9)", color: "#065f46", marginBottom: 10 }}>
          {okMsg}
        </div>
      ) : null}

      <div style={card}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "all" | BankStatus)} style={ghostBtn}>
            <option value="all">All statuses</option>
            <option value="pending_verification">Pending verification</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search driver / bank / last4 / status..."
            style={{ ...ghostBtn, minWidth: 260 }}
          />
          <span style={{ marginLeft: "auto", fontSize: 12, opacity: 0.75 }}>
            Total: <b>{filtered.length}</b>
          </span>
        </div>

        <div style={tableWrap}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Driver</th>
                <th style={th}>Contact</th>
                <th style={th}>Bank</th>
                <th style={th}>A/C Full</th>
                <th style={th}>Route Full</th>
                <th style={th}>A/C Last4</th>
                <th style={th}>Route Last4</th>
                <th style={th}>Country</th>
                <th style={th}>Currency</th>
                <th style={th}>Status</th>
                <th style={th}>Updated</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td style={td} colSpan={12}>
                    Loading...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td style={td} colSpan={12}>
                    No bank account records found.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const id = String(r?.id || "");
                  const uid = String(r?.delivery_user_id || r?.user_id || "");
                  const st = statusNorm(r?.status);
                  const dm = driverMap[uid] || { name: `Driver ${uid.slice(0, 8)}`, email: "-", phone: "-" };
                  const disabled = busyId === id;
                  return (
                    <tr key={id}>
                      <td style={td}>
                        <div style={{ fontWeight: 900 }}>{dm.name}</div>
                        <div style={{ opacity: 0.65, fontSize: 12 }}>{uid || "-"}</div>
                      </td>
                      <td style={td}>
                        <div>{dm.email}</div>
                        <div style={{ opacity: 0.75, fontSize: 12 }}>{dm.phone}</div>
                      </td>
                      <td style={td}>
                        <div style={{ fontWeight: 800 }}>{String(r?.bank_name || "-")}</div>
                        <div style={{ opacity: 0.7, fontSize: 12 }}>{String(r?.account_holder_name || "-")}</div>
                      </td>
                      <td style={td}>{fullAccount(r?.account_number_full ?? r?.account_number, r?.account_number_last4)}</td>
                      <td style={td}>{fullAccount(r?.routing_code_full ?? r?.routing_code, r?.routing_code_last4)}</td>
                      <td style={td}>{String(r?.account_number_last4 || "-")}</td>
                      <td style={td}>{String(r?.routing_code_last4 || "-")}</td>
                      <td style={td}>{String(r?.country || "-")}</td>
                      <td style={td}>{String(r?.currency || "-")}</td>
                      <td style={td}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "6px 10px",
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 900,
                            border:
                              st === "approved"
                                ? "1px solid rgba(16,185,129,0.35)"
                                : st === "rejected"
                                ? "1px solid rgba(239,68,68,0.35)"
                                : "1px solid rgba(245,158,11,0.35)",
                            background:
                              st === "approved"
                                ? "rgba(236,253,245,0.9)"
                                : st === "rejected"
                                ? "rgba(254,242,242,0.92)"
                                : "rgba(254,243,199,0.85)",
                            color: st === "approved" ? "#065f46" : st === "rejected" ? "#7f1d1d" : "#92400e",
                          }}
                        >
                          {st.replace(/_/g, " ").toUpperCase()}
                        </span>
                      </td>
                      <td style={td}>{fmtWhen(r?.updated_at || r?.created_at)}</td>
                      <td style={td}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button
                            style={okBtn}
                            disabled={disabled || st === "approved"}
                            onClick={() => updateStatus(r, "approved")}
                          >
                            {disabled ? "Saving..." : "Approve"}
                          </button>
                          <button
                            style={rejectBtn}
                            disabled={disabled || st === "rejected"}
                            onClick={() => updateStatus(r, "rejected")}
                          >
                            {disabled ? "Saving..." : "Reject"}
                          </button>
                          <button
                            style={ghostBtn}
                            disabled={disabled || st === "pending_verification"}
                            onClick={() => updateStatus(r, "pending_verification")}
                          >
                            {disabled ? "Saving..." : "Set Pending"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
