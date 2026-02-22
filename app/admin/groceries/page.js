"use client";

import React, { useEffect, useMemo, useState } from "react";
import supabase from "@/lib/supabase";

function clean(v) {
  return String(v ?? "").trim();
}

function statusBadgeStyle(status) {
  const s = clean(status).toLowerCase();
  if (s === "approved") {
    return {
      padding: "6px 10px",
      borderRadius: 999,
      border: "1px solid rgba(16,185,129,0.35)",
      background: "rgba(236,253,245,0.92)",
      color: "#065f46",
      fontWeight: 950,
      fontSize: 12,
    };
  }
  if (s === "rejected") {
    return {
      padding: "6px 10px",
      borderRadius: 999,
      border: "1px solid rgba(239,68,68,0.30)",
      background: "rgba(254,242,242,0.92)",
      color: "#7f1d1d",
      fontWeight: 950,
      fontSize: 12,
    };
  }
  // pending / unknown
  return {
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,140,0,0.28)",
    background: "rgba(255,247,237,0.95)",
    color: "#7c2d12",
    fontWeight: 950,
    fontSize: 12,
  };
}

export default function AdminGroceriesPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");

  const [tab, setTab] = useState("pending"); // all | pending | approved | rejected
  const [q, setQ] = useState("");

  async function load() {
    setErr("");
    setInfo("");
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("grocery_stores")
        .select(
          "id, owner_user_id, name, city, image_url, approval_status, is_disabled, accepting_orders, created_at"
        )
        .order("created_at", { ascending: false });

      if (error) throw error;

      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setErr(e?.message || String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function patch(id, changes, successMsg) {
    if (!id) return;
    setErr("");
    setInfo("");
    setBusyId(id);
    try {
      const { error } = await supabase.from("grocery_stores").update(changes).eq("id", id);
      if (error) throw error;

      setInfo(successMsg || "✅ Updated");
      await load();
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setBusyId("");
    }
  }

  useEffect(() => {
    load();
  }, []);

  const counts = useMemo(() => {
    const c = { all: rows.length, pending: 0, approved: 0, rejected: 0 };
    for (const r of rows) {
      const s = clean(r?.approval_status).toLowerCase();
      if (s === "approved") c.approved++;
      else if (s === "rejected") c.rejected++;
      else c.pending++;
    }
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const qq = clean(q).toLowerCase();

    return rows.filter((r) => {
      const s = clean(r?.approval_status).toLowerCase();

      if (tab !== "all") {
        if (tab === "approved" && s !== "approved") return false;
        if (tab === "rejected" && s !== "rejected") return false;
        if (tab === "pending" && (s === "approved" || s === "rejected")) return false;
      }

      if (!qq) return true;
      const hay = `${clean(r?.name)} ${clean(r?.city)} ${clean(r?.owner_user_id)}`.toLowerCase();
      return hay.includes(qq);
    });
  }, [rows, tab, q]);

  return (
    <div style={pageBg}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={pill}>Admin • Groceries</div>
          <div style={title}>Grocery Store Requests</div>
          <div style={sub}>Approve / Reject stores, Enable/Disable, Accepting Orders.</div>
        </div>

        <div style={topActions}>
          <button onClick={load} style={btn} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {err ? <div style={alertErr}>{err}</div> : null}
      {info ? <div style={alertOk}>{info}</div> : null}

      <div style={panel}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button onClick={() => setTab("pending")} style={tabBtn(tab === "pending")}>
            Pending ({counts.pending})
          </button>
          <button onClick={() => setTab("approved")} style={tabBtn(tab === "approved")}>
            Approved ({counts.approved})
          </button>
          <button onClick={() => setTab("rejected")} style={tabBtn(tab === "rejected")}>
            Rejected ({counts.rejected})
          </button>
          <button onClick={() => setTab("all")} style={tabBtn(tab === "all")}>
            All ({counts.all})
          </button>

          <div style={{ flex: 1 }} />

          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, city, owner uid..."
            style={search}
          />
        </div>

        <div style={{ marginTop: 12 }}>
          {loading ? (
            <div style={muted}>Loading grocery stores…</div>
          ) : filtered.length === 0 ? (
            <div style={empty}>No stores found for this filter.</div>
          ) : (
            <div style={grid}>
              {filtered.map((r) => {
                const id = r?.id;
                const status = clean(r?.approval_status) || "pending";
                const disabled = !!r?.is_disabled;
                const accepting = !!r?.accepting_orders;

                return (
                  <div key={id} style={card}>
                    <div style={imgWrap}>
                      {r?.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.image_url} alt={clean(r?.name) || "Store"} style={img} />
                      ) : (
                        <div style={imgPh}>No Image</div>
                      )}

                      <div style={badgesTop}>
                        <span style={statusBadgeStyle(status)}>{status}</span>
                        <span style={miniTag}>{disabled ? "Disabled" : "Enabled"}</span>
                      </div>
                    </div>

                    <div style={{ padding: 12 }}>
                      <div style={{ fontWeight: 1000, fontSize: 16, color: "#0b1220" }}>
                        {clean(r?.name) || "Unnamed Store"}
                      </div>

                      <div style={metaLine}>
                        City: <span style={metaStrong}>{clean(r?.city) || "-"}</span>
                      </div>
                      <div style={metaLine}>
                        Owner UID: <span style={metaStrong}>{clean(r?.owner_user_id) || "-"}</span>
                      </div>

                      <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <span style={accepting ? openPill : closedPill}>
                          {accepting ? "Accepting orders" : "Not accepting"}
                        </span>
                        <span style={disabled ? closedPill : openPill}>
                          {disabled ? "Disabled" : "Enabled"}
                        </span>
                      </div>

                      <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button
                          style={btnPrimary}
                          disabled={busyId === id || loading}
                          onClick={() => patch(id, { approval_status: "approved" }, "✅ Store approved")}
                        >
                          {busyId === id ? "Working…" : "Approve"}
                        </button>

                        <button
                          style={btnDanger}
                          disabled={busyId === id || loading}
                          onClick={() => patch(id, { approval_status: "rejected" }, "⛔ Store rejected")}
                        >
                          Reject
                        </button>

                        <button
                          style={btn}
                          disabled={busyId === id || loading}
                          onClick={() =>
                            patch(
                              id,
                              { is_disabled: !disabled },
                              disabled ? "✅ Enabled" : "⛔ Disabled"
                            )
                          }
                        >
                          {disabled ? "Enable" : "Disable"}
                        </button>

                        <button
                          style={btn}
                          disabled={busyId === id || loading}
                          onClick={() =>
                            patch(
                              id,
                              { accepting_orders: !accepting },
                              !accepting ? "✅ Accepting orders" : "🛑 Stopped accepting"
                            )
                          }
                        >
                          {accepting ? "Stop Orders" : "Accept Orders"}
                        </button>
                      </div>

                      <div style={{ marginTop: 10, fontSize: 11, color: "rgba(17,24,39,0.60)", fontWeight: 800 }}>
                        Store ID: {id}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {err ? (
          <div style={{ marginTop: 12, fontSize: 12, color: "rgba(17,24,39,0.70)", fontWeight: 800 }}>
            If you see an RLS error here, send me the exact error text and I’ll give the correct SQL policy.
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ===== Premium inline styles ===== */

const pageBg = { minHeight: "calc(100vh - 60px)", padding: 6 };

const pill = {
  display: "inline-flex",
  alignItems: "center",
  padding: "6px 12px",
  borderRadius: 999,
  border: "1px solid rgba(255,140,0,0.25)",
  background: "rgba(255,140,0,0.10)",
  fontSize: 12,
  fontWeight: 950,
  color: "#0B1220",
};

const title = { marginTop: 10, fontSize: 26, fontWeight: 1000, letterSpacing: -0.2, color: "#0B1220" };

const sub = { marginTop: 6, fontSize: 13, color: "rgba(15,23,42,0.70)", fontWeight: 800 };

const topActions = { display: "flex", gap: 10, alignItems: "center" };

const panel = {
  marginTop: 14,
  borderRadius: 20,
  border: "1px solid rgba(15,23,42,0.10)",
  background: "rgba(255,255,255,0.92)",
  boxShadow: "0 18px 60px rgba(15,23,42,0.08)",
  padding: 14,
};

const btn = {
  padding: "10px 12px",
  borderRadius: 14,
  border: "1px solid rgba(15,23,42,0.12)",
  background: "#fff",
  fontWeight: 900,
  cursor: "pointer",
  color: "#0F172A",
};

const btnPrimary = { ...btn, border: "1px solid rgba(16,185,129,0.30)", background: "rgba(236,253,245,0.95)", color: "#065f46" };

const btnDanger = { ...btn, border: "1px solid rgba(239,68,68,0.30)", background: "rgba(254,242,242,0.95)", color: "#7f1d1d" };

const tabBtn = (active) => ({
  padding: "10px 12px",
  borderRadius: 999,
  border: active ? "1px solid rgba(255,140,0,0.35)" : "1px solid rgba(15,23,42,0.12)",
  background: active ? "rgba(255,140,0,0.14)" : "rgba(255,255,255,0.9)",
  fontWeight: 950,
  cursor: "pointer",
  color: "#0B1220",
});

const search = {
  width: 320,
  maxWidth: "100%",
  padding: "10px 12px",
  borderRadius: 14,
  border: "1px solid rgba(15,23,42,0.12)",
  background: "rgba(255,255,255,0.95)",
  outline: "none",
  fontWeight: 800,
};

const alertErr = {
  marginTop: 12,
  padding: 12,
  borderRadius: 16,
  border: "1px solid rgba(239,68,68,0.30)",
  background: "rgba(254,242,242,0.95)",
  color: "#7f1d1d",
  fontWeight: 900,
};

const alertOk = {
  marginTop: 12,
  padding: 12,
  borderRadius: 16,
  border: "1px solid rgba(16,185,129,0.30)",
  background: "rgba(236,253,245,0.95)",
  color: "#065f46",
  fontWeight: 900,
};

const muted = { marginTop: 12, fontWeight: 900, color: "rgba(17,24,39,0.65)" };

const empty = {
  marginTop: 12,
  padding: 14,
  borderRadius: 16,
  border: "1px solid rgba(15,23,42,0.10)",
  background: "rgba(255,255,255,0.90)",
  fontWeight: 900,
  color: "rgba(17,24,39,0.70)",
};

const grid = { marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 };

const card = { borderRadius: 20, overflow: "hidden", border: "1px solid rgba(15,23,42,0.10)", background: "rgba(255,255,255,0.92)", boxShadow: "0 14px 40px rgba(15,23,42,0.08)" };

const imgWrap = { height: 190, position: "relative", background: "rgba(15,23,42,0.04)", borderBottom: "1px solid rgba(15,23,42,0.10)", display: "flex", alignItems: "center", justifyContent: "center" };

const img = { width: "100%", height: "100%", objectFit: "cover" };

const imgPh = { fontWeight: 950, color: "rgba(15,23,42,0.35)", fontSize: 12 };

const badgesTop = { position: "absolute", top: 10, left: 10, right: 10, display: "flex", justifyContent: "space-between", gap: 10, pointerEvents: "none" };

const miniTag = { padding: "6px 10px", borderRadius: 999, border: "1px solid rgba(15,23,42,0.12)", background: "rgba(255,255,255,0.85)", fontWeight: 950, fontSize: 12, color: "rgba(15,23,42,0.80)" };

const openPill = { padding: "6px 10px", borderRadius: 999, border: "1px solid rgba(16,185,129,0.30)", background: "rgba(236,253,245,0.92)", color: "#065f46", fontWeight: 950, fontSize: 12 };

const closedPill = { padding: "6px 10px", borderRadius: 999, border: "1px solid rgba(239,68,68,0.25)", background: "rgba(254,242,242,0.92)", color: "#7f1d1d", fontWeight: 950, fontSize: 12 };

const metaLine = { marginTop: 6, color: "rgba(17,24,39,0.72)", fontWeight: 800, fontSize: 12 };

const metaStrong = { fontWeight: 950 };
