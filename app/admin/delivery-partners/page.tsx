"use client";

import React, { useEffect, useMemo, useState } from "react";
import supabase from "@/lib/supabase";

type AnyRow = Record<string, any>;

function normalize(s: any) {
  return String(s || "").trim().toLowerCase();
}

function fmtDate(v: any) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}

function safeVal(v: any, fallback = "—") {
  const s = String(v ?? "").trim();
  return s ? s : fallback;
}

const rolesDelivery = ["delivery_partner", "delivery"];

export default function AdminDeliveryPartnersPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<AnyRow[]>([]);
  const [errMsg, setErrMsg] = useState<string>("");

  // filters
  const [tab, setTab] = useState<"pending" | "approved" | "rejected" | "disabled" | "all">("pending");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest" | "name">("newest");

  // edit modal
  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState<AnyRow | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setErrMsg("");

    // We use select("*") so it won't break if some optional columns aren't created yet.
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .in("role", rolesDelivery)
      .limit(2000);

    if (error) {
      setRows([]);
      setErrMsg(error.message || "Failed to load delivery partners.");
      setLoading(false);
      return;
    }

    setRows(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    let list = [...rows];

    // tab filter
    if (tab === "disabled") {
      list = list.filter((r) => r?.delivery_disabled === true);
    } else if (tab !== "all") {
      // delivery_status may not exist yet; treat missing as "pending"
      list = list.filter((r) => {
        const status = String(r?.delivery_status ?? "pending");
        const disabled = r?.delivery_disabled === true;
        if (disabled) return false; // disabled has its own tab
        return status === tab;
      });
    }

    // search
    const nq = normalize(q);
    if (nq) {
      list = list.filter((r) => {
        const hay = [
          r?.full_name,
          r?.phone,
          r?.email,
          r?.address_line1,
          r?.address_line2,
          r?.user_id,
        ]
          .map((x) => normalize(x))
          .join(" ");
        return hay.includes(nq);
      });
    }

    // sort
    list.sort((a, b) => {
      if (sort === "name") return normalize(a?.full_name).localeCompare(normalize(b?.full_name));
      const ta = new Date(a?.created_at || 0).getTime();
      const tb = new Date(b?.created_at || 0).getTime();
      return sort === "newest" ? tb - ta : ta - tb;
    });

    return list;
  }, [rows, tab, q, sort]);

  async function updatePartner(user_id: string, patch: AnyRow) {
    setSaving(true);
    setErrMsg("");

    const { error } = await supabase.from("profiles").update(patch).eq("user_id", user_id);

    if (error) {
      setErrMsg(error.message || "Update failed");
      setSaving(false);
      return false;
    }

    // Update local state (no reload needed but we still can reload safely)
    setRows((prev) => prev.map((r) => (r?.user_id === user_id ? { ...r, ...patch } : r)));
    setSaving(false);
    return true;
  }

  async function approve(r: AnyRow) {
    const ok = await updatePartner(r.user_id, {
      delivery_status: "approved",
      delivery_approved: true,
      delivery_disabled: false,
    });
    return ok;
  }

  async function reject(r: AnyRow) {
    const reason = prompt("Reject reason (optional):") || "";
    const ok = await updatePartner(r.user_id, {
      delivery_status: "rejected",
      delivery_approved: false,
      delivery_disabled: false,
      admin_note: reason || null,
    });
    return ok;
  }

  async function disable(r: AnyRow) {
    const reason = prompt("Disable reason (optional):") || "";
    const ok = await updatePartner(r.user_id, {
      delivery_disabled: true,
      is_delivery_online: false, // force offline (if column exists)
      admin_note: reason || r?.admin_note || null,
    });
    return ok;
  }

  async function enable(r: AnyRow) {
    const ok = await updatePartner(r.user_id, {
      delivery_disabled: false,
      // keep status as is; if rejected, admin can set approved separately
    });
    return ok;
  }

  function openEdit(r: AnyRow) {
    setEditRow({
      ...r,
      full_name: r?.full_name ?? "",
      phone: r?.phone ?? "",
      address_line1: r?.address_line1 ?? "",
      address_line2: r?.address_line2 ?? "",
      vehicle_type: r?.vehicle_type ?? "",
      license_number: r?.license_number ?? "",
      admin_note: r?.admin_note ?? "",
    });
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!editRow?.user_id) return;
    const patch: AnyRow = {
      full_name: editRow.full_name || null,
      phone: editRow.phone || null,
      address_line1: editRow.address_line1 || null,
      address_line2: editRow.address_line2 || null,
      vehicle_type: editRow.vehicle_type || null,
      license_number: editRow.license_number || null,
      admin_note: editRow.admin_note || null,
    };

    const ok = await updatePartner(editRow.user_id, patch);
    if (ok) setEditOpen(false);
  }

  const pageWrap: React.CSSProperties = {
    padding: 20,
  };

  const headerRow: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    alignItems: "center",
    marginBottom: 14,
  };

  const h1: React.CSSProperties = {
    fontSize: 24,
    fontWeight: 950,
    letterSpacing: -0.3,
  };

  const sub: React.CSSProperties = {
    fontSize: 13,
    opacity: 0.75,
    marginTop: 4,
    lineHeight: 1.5,
  };

  const card: React.CSSProperties = {
    padding: 16,
    borderRadius: 18,
    background: "#FFFFFF",
    border: "1px solid rgba(15, 23, 42, 0.10)",
    boxShadow: "0 14px 36px rgba(15, 23, 42, 0.08)",
  };

  const btn: React.CSSProperties = {
    padding: "10px 12px",
    borderRadius: 14,
    background: "rgba(255,255,255,0.90)",
    border: "1px solid rgba(15, 23, 42, 0.12)",
    color: "#0B1220",
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: "0 10px 26px rgba(15,23,42,0.06)",
  };

  const btnPrimary: React.CSSProperties = {
    ...btn,
    background: "linear-gradient(135deg, rgba(255,140,0,1), rgba(255,220,160,0.95))",
    border: "1px solid rgba(255,140,0,0.35)",
    fontWeight: 950,
  };

  const tabBtn = (active: boolean): React.CSSProperties => ({
    ...btn,
    background: active ? "rgba(255,140,0,0.12)" : "rgba(255,255,255,0.90)",
    border: active ? "1px solid rgba(255,140,0,0.35)" : "1px solid rgba(15, 23, 42, 0.12)",
  });

  const tableWrap: React.CSSProperties = {
    overflowX: "auto",
    borderRadius: 16,
    border: "1px solid rgba(15, 23, 42, 0.10)",
  };

  const th: React.CSSProperties = {
    textAlign: "left",
    padding: "10px 12px",
    fontSize: 12,
    fontWeight: 950,
    background: "rgba(248,250,252,1)",
    borderBottom: "1px solid rgba(15, 23, 42, 0.10)",
    whiteSpace: "nowrap",
  };

  const td: React.CSSProperties = {
    padding: "10px 12px",
    fontSize: 13,
    borderBottom: "1px solid rgba(15, 23, 42, 0.06)",
    verticalAlign: "top",
    whiteSpace: "nowrap",
  };

  const badge = (bg: string, bd: string): React.CSSProperties => ({
    padding: "6px 10px",
    borderRadius: 999,
    background: bg,
    border: `1px solid ${bd}`,
    fontSize: 12,
    fontWeight: 950,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  });

  function statusBadge(r: AnyRow) {
    const disabled = r?.delivery_disabled === true;
    if (disabled) return <span style={badge("rgba(148,163,184,0.18)", "rgba(148,163,184,0.35)")}>Disabled</span>;

    const st = String(r?.delivery_status ?? "pending");
    if (st === "approved") return <span style={badge("rgba(34,197,94,0.12)", "rgba(34,197,94,0.25)")}>Approved</span>;
    if (st === "rejected") return <span style={badge("rgba(239,68,68,0.12)", "rgba(239,68,68,0.25)")}>Rejected</span>;
    return <span style={badge("rgba(255,140,0,0.12)", "rgba(255,140,0,0.25)")}>Pending</span>;
  }

  return (
    <div style={pageWrap}>
      <div style={headerRow}>
        <div>
          <div style={h1}>Delivery Partners</div>
          <div style={sub}>
            Approve / Reject / Disable / Edit delivery partners. (Auto-mode stays — no manual assignment.)
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button style={btnPrimary} onClick={load}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>

          <select value={sort} onChange={(e) => setSort(e.target.value as any)} style={{ ...btn, padding: "10px 12px" }}>
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="name">Name</option>
          </select>

          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name / phone / email / address"
            style={{
              padding: "10px 12px",
              borderRadius: 14,
              border: "1px solid rgba(15, 23, 42, 0.12)",
              background: "rgba(255,255,255,0.90)",
              minWidth: 280,
              fontWeight: 800,
              outline: "none",
            }}
          />
        </div>
      </div>

      {errMsg ? (
        <div
          style={{
            ...card,
            borderColor: "rgba(239,68,68,0.25)",
            background: "rgba(239,68,68,0.06)",
            marginBottom: 12,
          }}
        >
          <div style={{ fontWeight: 950, color: "#B91C1C" }}>Error</div>
          <div style={{ marginTop: 6, opacity: 0.9 }}>{errMsg}</div>
        </div>
      ) : null}

      <div style={{ ...card, marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button style={tabBtn(tab === "pending")} onClick={() => setTab("pending")}>Pending</button>
          <button style={tabBtn(tab === "approved")} onClick={() => setTab("approved")}>Approved</button>
          <button style={tabBtn(tab === "rejected")} onClick={() => setTab("rejected")}>Rejected</button>
          <button style={tabBtn(tab === "disabled")} onClick={() => setTab("disabled")}>Disabled</button>
          <button style={tabBtn(tab === "all")} onClick={() => setTab("all")}>All</button>
        </div>

        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
          Tip: If your new columns are not added yet, “delivery_status” will be treated as <b>pending</b>.
        </div>
      </div>

      <div style={{ ...card }}>
        <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 900, marginBottom: 10 }}>
          Showing {filtered.length} delivery partners
        </div>

        <div style={tableWrap}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr>
                <th style={th}>Name</th>
                <th style={th}>Phone</th>
                <th style={th}>Role</th>
                <th style={th}>Status</th>
                <th style={th}>Online</th>
                <th style={th}>Address</th>
                <th style={th}>Joined</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td style={td} colSpan={8}>Loading…</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td style={td} colSpan={8}>No delivery partners found.</td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const online = r?.is_delivery_online === true;
                  return (
                    <tr key={r.user_id}>
                      <td style={td}>
                        <div style={{ fontWeight: 950 }}>{safeVal(r?.full_name, "No name")}</div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>{String(r?.user_id || "").slice(0, 10)}…</div>
                        {r?.admin_note ? (
                          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
                            <b>Note:</b> {String(r.admin_note)}
                          </div>
                        ) : null}
                      </td>

                      <td style={td}>{safeVal(r?.phone)}</td>
                      <td style={td}>{safeVal(r?.role)}</td>
                      <td style={td}>{statusBadge(r)}</td>

                      <td style={td}>
                        {online ? (
                          <span style={badge("rgba(34,197,94,0.12)", "rgba(34,197,94,0.25)")}>● Online</span>
                        ) : (
                          <span style={badge("rgba(148,163,184,0.18)", "rgba(148,163,184,0.35)")}>● Offline</span>
                        )}
                        {r?.last_seen_at ? (
                          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>Last seen: {fmtDate(r.last_seen_at)}</div>
                        ) : null}
                      </td>

                      <td style={td}>
                        <div style={{ fontWeight: 900 }}>{safeVal(r?.address_line1)}</div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>{safeVal(r?.address_line2, "")}</div>
                      </td>

                      <td style={td}>{fmtDate(r?.created_at)}</td>

                      <td style={td}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button style={btn} disabled={saving} onClick={() => openEdit(r)}>Edit</button>

                          <button
                            style={btnPrimary}
                            disabled={saving}
                            onClick={() => approve(r)}
                            title="Approve delivery partner"
                          >
                            Approve
                          </button>

                          <button style={btn} disabled={saving} onClick={() => reject(r)}>
                            Reject
                          </button>

                          {r?.delivery_disabled === true ? (
                            <button style={btn} disabled={saving} onClick={() => enable(r)}>
                              Enable
                            </button>
                          ) : (
                            <button style={btn} disabled={saving} onClick={() => disable(r)}>
                              Disable
                            </button>
                          )}
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

      {/* Edit modal */}
      {editOpen && editRow ? (
        <div
          onClick={() => !saving && setEditOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 50,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(720px, 96vw)",
              borderRadius: 18,
              background: "#fff",
              border: "1px solid rgba(15,23,42,0.12)",
              boxShadow: "0 26px 70px rgba(15,23,42,0.22)",
              padding: 16,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 950 }}>Edit Delivery Partner</div>
                <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>{editRow.user_id}</div>
              </div>
              <button style={btn} disabled={saving} onClick={() => setEditOpen(false)}>
                Close
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 12, marginTop: 14 }}>
              <Field label="Full Name" span={6}>
                <input
                  value={editRow.full_name}
                  onChange={(e) => setEditRow({ ...editRow, full_name: e.target.value })}
                  style={inputStyle}
                />
              </Field>

              <Field label="Phone" span={6}>
                <input
                  value={editRow.phone}
                  onChange={(e) => setEditRow({ ...editRow, phone: e.target.value })}
                  style={inputStyle}
                />
              </Field>

              <Field label="Address line 1" span={12}>
                <input
                  value={editRow.address_line1}
                  onChange={(e) => setEditRow({ ...editRow, address_line1: e.target.value })}
                  style={inputStyle}
                />
              </Field>

              <Field label="Address line 2" span={12}>
                <input
                  value={editRow.address_line2}
                  onChange={(e) => setEditRow({ ...editRow, address_line2: e.target.value })}
                  style={inputStyle}
                />
              </Field>

              <Field label="Vehicle type (optional)" span={6}>
                <input
                  value={editRow.vehicle_type}
                  onChange={(e) => setEditRow({ ...editRow, vehicle_type: e.target.value })}
                  style={inputStyle}
                />
              </Field>

              <Field label="License number (optional)" span={6}>
                <input
                  value={editRow.license_number}
                  onChange={(e) => setEditRow({ ...editRow, license_number: e.target.value })}
                  style={inputStyle}
                />
              </Field>

              <Field label="Admin note (optional)" span={12}>
                <textarea
                  value={editRow.admin_note}
                  onChange={(e) => setEditRow({ ...editRow, admin_note: e.target.value })}
                  style={{ ...inputStyle, height: 90, resize: "vertical" as any }}
                />
              </Field>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
              <button style={btn} disabled={saving} onClick={() => setEditOpen(false)}>
                Cancel
              </button>
              <button style={btnPrimary} disabled={saving} onClick={saveEdit}>
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, span, children }: { label: string; span: number; children: React.ReactNode }) {
  return (
    <div style={{ gridColumn: `span ${span}` }}>
      <div style={{ fontSize: 12, fontWeight: 950, opacity: 0.8, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 14,
  border: "1px solid rgba(15, 23, 42, 0.12)",
  background: "rgba(255,255,255,0.98)",
  fontWeight: 800,
  outline: "none",
};
