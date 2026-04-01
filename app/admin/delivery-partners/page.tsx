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

function safeVal(v: any, fallback = "-") {
  const s = String(v ?? "").trim();
  return s ? s : fallback;
}

function nnum(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function moneyUSD(v: any) {
  return `$${nnum(v).toFixed(2)}`;
}

function orderStatusNorm(v: any) {
  return String(v || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function isCompletedStatus(v: any) {
  const s = orderStatusNorm(v);
  return s === "delivered" || s === "completed" || s === "complete" || s === "done";
}

function isCanceledStatus(v: any) {
  const s = orderStatusNorm(v);
  return s === "canceled" || s === "cancelled" || s === "rejected" || s === "declined" || s === "failed";
}

function isActiveStatus(v: any) {
  const s = orderStatusNorm(v);
  if (!s) return false;
  if (isCompletedStatus(s) || isCanceledStatus(s)) return false;
  return true;
}

function orderCustomerName(o: AnyRow) {
  return safeVal(o?.customer_name || o?.name || o?.full_name || o?.customer_full_name, "Customer");
}

function orderCustomerPhone(o: AnyRow) {
  return safeVal(o?.phone || o?.customer_phone || o?.mobile || o?.customer_mobile, "-");
}

function orderAddress(o: AnyRow) {
  const parts = [o?.address_line1, o?.address_line2, o?.landmark, o?.city, o?.state, o?.zip_code]
    .map((x) => String(x || "").trim())
    .filter(Boolean);
  if (parts.length > 0) return parts.join(", ");
  return safeVal(o?.customer_address || o?.address || o?.delivery_address, "-");
}

function orderStoreName(o: AnyRow) {
  return safeVal(o?.restaurant_name || o?.store_name || o?.grocery_store_name || o?.shop_name, "-");
}

function orderTotal(o: AnyRow) {
  return nnum(o?.total_amount ?? o?.total ?? o?.amount ?? o?.grand_total ?? 0);
}

function orderDeliveryFee(o: AnyRow) {
  return nnum(o?.delivery_fee ?? 0);
}

function orderTip(o: AnyRow) {
  return nnum(o?.tip_amount ?? o?.tip ?? 0);
}

function orderPayout(o: AnyRow) {
  const payout = nnum(o?.delivery_payout, NaN);
  if (Number.isFinite(payout)) return payout;
  return orderDeliveryFee(o) + orderTip(o);
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

  // detail modal
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<AnyRow | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErr, setDetailErr] = useState("");
  const [detailOrders, setDetailOrders] = useState<AnyRow[]>([]);
  const [detailTab, setDetailTab] = useState<"all" | "active" | "completed" | "canceled">("all");
  const [expandedOrderKey, setExpandedOrderKey] = useState("");

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

  async function loadDriverOrders(userId: string, driverRow?: AnyRow) {
    const isMissingColumn = (msg: string) => {
      const m = String(msg || "").toLowerCase();
      return m.includes("column") && m.includes("does not exist");
    };

    const driverEmail = String(driverRow?.email || "").trim();
    const driverPhone = String(driverRow?.phone || "").trim();
    const candidateDriverIds = Array.from(
      new Set([String(userId || "").trim(), String(driverRow?.id || "").trim(), String(driverRow?.user_id || "").trim()].filter(Boolean))
    );

    const idCols = [
      "delivery_user_id",
      "delivery_partner_id",
      "delivery_driver_id",
      "assigned_delivery_user_id",
      "driver_id",
      "rider_id",
      "delivery_boy_id",
    ];
    const emailCols = ["delivery_email", "delivery_user_email", "driver_email", "rider_email"];
    const phoneCols = ["delivery_phone", "delivery_user_phone", "driver_phone", "rider_phone"];

    const fetchTable = async (tableName: "orders" | "grocery_orders", source: "restaurant" | "grocery") => {
      const merged = new Map<string, AnyRow>();
      const errors: string[] = [];

      const addRows = (arr: AnyRow[]) => {
        for (const r of arr || []) {
          const key = String(r?.id || "");
          if (!key) continue;
          if (!merged.has(key)) {
            merged.set(key, { ...r, _source: source, _rowKey: `${source}:${key}` });
          }
        }
      };

      for (const c of idCols) {
        for (const driverId of candidateDriverIds) {
          try {
            const { data, error } = await supabase
              .from(tableName)
              .select("*")
              .eq(c, driverId)
              .order("created_at", { ascending: false })
              .limit(1000);
            if (error) {
              if (isMissingColumn(error.message || "")) continue;
              errors.push(`${tableName}.${c}: ${error.message || "query failed"}`);
              continue;
            }
            addRows(Array.isArray(data) ? data : []);
          } catch (e: any) {
            const msg = String(e?.message || e || "");
            if (!isMissingColumn(msg)) errors.push(`${tableName}.${c}: ${msg}`);
          }
        }
      }

      if (driverEmail) {
        for (const c of emailCols) {
          try {
            const { data, error } = await supabase
              .from(tableName)
              .select("*")
              .eq(c, driverEmail)
              .order("created_at", { ascending: false })
              .limit(1000);
            if (error) {
              if (isMissingColumn(error.message || "")) continue;
              errors.push(`${tableName}.${c}: ${error.message || "query failed"}`);
              continue;
            }
            addRows(Array.isArray(data) ? data : []);
          } catch (e: any) {
            const msg = String(e?.message || e || "");
            if (!isMissingColumn(msg)) errors.push(`${tableName}.${c}: ${msg}`);
          }
        }
      }

      if (driverPhone) {
        for (const c of phoneCols) {
          try {
            const { data, error } = await supabase
              .from(tableName)
              .select("*")
              .eq(c, driverPhone)
              .order("created_at", { ascending: false })
              .limit(1000);
            if (error) {
              if (isMissingColumn(error.message || "")) continue;
              errors.push(`${tableName}.${c}: ${error.message || "query failed"}`);
              continue;
            }
            addRows(Array.isArray(data) ? data : []);
          } catch (e: any) {
            const msg = String(e?.message || e || "");
            if (!isMissingColumn(msg)) errors.push(`${tableName}.${c}: ${msg}`);
          }
        }
      }

      return { rows: Array.from(merged.values()), errorMsg: errors.join(" | ") };
    };

    const [restaurantRes, groceryRes] = await Promise.all([
      fetchTable("orders", "restaurant"),
      fetchTable("grocery_orders", "grocery"),
    ]);

    const allRows = [...restaurantRes.rows, ...groceryRes.rows];
    const uniq = new Map<string, AnyRow>();
    for (const r of allRows) {
      const k = String(r?._rowKey || `${String(r?._source || "order")}:${String(r?.id || "")}`);
      if (!uniq.has(k)) uniq.set(k, r);
    }

    const merged = Array.from(uniq.values()).sort((a, b) => {
      const ta = new Date(a?.created_at || 0).getTime();
      const tb = new Date(b?.created_at || 0).getTime();
      return tb - ta;
    });

    const errorMsg = [restaurantRes.errorMsg, groceryRes.errorMsg].filter(Boolean).join(" | ");
    return { rows: merged, errorMsg };
  }

  async function openDetails(r: AnyRow) {
    const uid = String(r?.user_id || "");
    if (!uid) return;

    setDetailOpen(true);
    setDetailRow(r);
    setDetailLoading(true);
    setDetailErr("");
    setDetailOrders([]);
    setDetailTab("all");
    setExpandedOrderKey("");

    try {
      const result = await loadDriverOrders(uid, r);
      setDetailOrders(result.rows || []);
      if (result.errorMsg && result.rows.length === 0) {
        setDetailErr(result.errorMsg);
      }
    } catch (e: any) {
      setDetailErr(e?.message || String(e));
      setDetailOrders([]);
    } finally {
      setDetailLoading(false);
    }
  }

  const detailStats = useMemo(() => {
    const list = Array.isArray(detailOrders) ? detailOrders : [];

    let active = 0;
    let completed = 0;
    let canceled = 0;
    let restaurant = 0;
    let grocery = 0;
    let payoutTotal = 0;
    let orderTotalGross = 0;

    for (const o of list) {
      const st = orderStatusNorm(o?.status);
      if (isCompletedStatus(st)) completed += 1;
      else if (isCanceledStatus(st)) canceled += 1;
      else active += 1;

      if (String(o?._source || "") === "grocery") grocery += 1;
      else restaurant += 1;

      payoutTotal += orderPayout(o);
      orderTotalGross += orderTotal(o);
    }

    return {
      total: list.length,
      active,
      completed,
      canceled,
      restaurant,
      grocery,
      payoutTotal,
      orderTotalGross,
    };
  }, [detailOrders]);

  const detailFilteredOrders = useMemo(() => {
    const list = Array.isArray(detailOrders) ? detailOrders : [];
    if (detailTab === "all") return list;
    if (detailTab === "active") return list.filter((o) => isActiveStatus(o?.status));
    if (detailTab === "completed") return list.filter((o) => isCompletedStatus(o?.status));
    return list.filter((o) => isCanceledStatus(o?.status));
  }, [detailOrders, detailTab]);

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

  function orderStatusBadge(status: any) {
    const s = orderStatusNorm(status);
    if (isCompletedStatus(s)) {
      return <span style={badge("rgba(34,197,94,0.12)", "rgba(34,197,94,0.25)")}>Completed</span>;
    }
    if (isCanceledStatus(s)) {
      return <span style={badge("rgba(239,68,68,0.12)", "rgba(239,68,68,0.25)")}>Canceled</span>;
    }
    return <span style={badge("rgba(59,130,246,0.12)", "rgba(59,130,246,0.25)")}>{safeVal(status, "Active")}</span>;
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
                          <button style={btn} disabled={saving} onClick={() => openDetails(r)}>View Details</button>
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

      {/* Driver details modal */}
      {detailOpen && detailRow ? (
        <div
          onClick={() => !detailLoading && setDetailOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 52,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(1220px, 98vw)",
              maxHeight: "94vh",
              overflowY: "auto",
              borderRadius: 18,
              background: "#fff",
              border: "1px solid rgba(15,23,42,0.12)",
              boxShadow: "0 26px 70px rgba(15,23,42,0.22)",
              padding: 16,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 300 }}>
                <img
                  src={String(detailRow?.avatar_url || "") || "/icon-512.png"}
                  alt="Driver"
                  style={{ width: 56, height: 56, borderRadius: 14, objectFit: "cover", border: "1px solid rgba(15,23,42,0.12)" }}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = "/icon-512.png";
                  }}
                />
                <div>
                  <div style={{ fontSize: 18, fontWeight: 950 }}>Driver Details</div>
                  <div style={{ fontSize: 13, opacity: 0.8, marginTop: 3 }}>
                    {safeVal(detailRow?.full_name, "No name")} - {safeVal(detailRow?.email, "No email")}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.65, marginTop: 3 }}>{safeVal(detailRow?.user_id, "-")}</div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {statusBadge(detailRow)}
                {detailRow?.is_delivery_online ? (
                  <span style={badge("rgba(34,197,94,0.12)", "rgba(34,197,94,0.25)")}>Online</span>
                ) : (
                  <span style={badge("rgba(148,163,184,0.18)", "rgba(148,163,184,0.35)")}>Offline</span>
                )}
                <button style={btn} disabled={detailLoading} onClick={() => openDetails(detailRow)}>Refresh Orders</button>
                <button style={btn} disabled={detailLoading} onClick={() => setDetailOpen(false)}>Close</button>
              </div>
            </div>

            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(4, minmax(180px, 1fr))", gap: 10 }}>
              <div style={{ ...card, padding: 12 }}>
                <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 900 }}>Phone</div>
                <div style={{ marginTop: 4, fontWeight: 950 }}>{safeVal(detailRow?.phone)}</div>
              </div>
              <div style={{ ...card, padding: 12 }}>
                <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 900 }}>Joined</div>
                <div style={{ marginTop: 4, fontWeight: 950 }}>{fmtDate(detailRow?.created_at)}</div>
              </div>
              <div style={{ ...card, padding: 12 }}>
                <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 900 }}>Vehicle</div>
                <div style={{ marginTop: 4, fontWeight: 950 }}>{safeVal(detailRow?.vehicle_type)}</div>
              </div>
              <div style={{ ...card, padding: 12 }}>
                <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 900 }}>License</div>
                <div style={{ marginTop: 4, fontWeight: 950 }}>{safeVal(detailRow?.license_number)}</div>
              </div>
            </div>

            <div style={{ ...card, marginTop: 10, padding: 12 }}>
              <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 900 }}>Address</div>
              <div style={{ marginTop: 4, fontWeight: 900 }}>
                {[safeVal(detailRow?.address_line1, ""), safeVal(detailRow?.address_line2, "")].filter(Boolean).join(", ") || "-"}
              </div>
              {detailRow?.admin_note ? (
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}><b>Admin note:</b> {String(detailRow.admin_note)}</div>
              ) : null}
            </div>

            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(6, minmax(160px, 1fr))", gap: 10 }}>
              <div style={{ ...card, padding: 12 }}><div style={{ fontSize: 12, opacity: 0.7, fontWeight: 900 }}>Total Orders</div><div style={{ marginTop: 4, fontSize: 24, fontWeight: 950 }}>{detailStats.total}</div></div>
              <div style={{ ...card, padding: 12 }}><div style={{ fontSize: 12, opacity: 0.7, fontWeight: 900 }}>Active</div><div style={{ marginTop: 4, fontSize: 24, fontWeight: 950 }}>{detailStats.active}</div></div>
              <div style={{ ...card, padding: 12 }}><div style={{ fontSize: 12, opacity: 0.7, fontWeight: 900 }}>Completed</div><div style={{ marginTop: 4, fontSize: 24, fontWeight: 950 }}>{detailStats.completed}</div></div>
              <div style={{ ...card, padding: 12 }}><div style={{ fontSize: 12, opacity: 0.7, fontWeight: 900 }}>Canceled</div><div style={{ marginTop: 4, fontSize: 24, fontWeight: 950 }}>{detailStats.canceled}</div></div>
              <div style={{ ...card, padding: 12 }}><div style={{ fontSize: 12, opacity: 0.7, fontWeight: 900 }}>Driver Payout</div><div style={{ marginTop: 4, fontSize: 24, fontWeight: 950 }}>{moneyUSD(detailStats.payoutTotal)}</div></div>
              <div style={{ ...card, padding: 12 }}><div style={{ fontSize: 12, opacity: 0.7, fontWeight: 900 }}>Order Gross</div><div style={{ marginTop: 4, fontSize: 24, fontWeight: 950 }}>{moneyUSD(detailStats.orderTotalGross)}</div></div>
            </div>

            <div style={{ ...card, marginTop: 10, padding: 12 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <button style={tabBtn(detailTab === "all")} onClick={() => setDetailTab("all")}>All ({detailStats.total})</button>
                <button style={tabBtn(detailTab === "active")} onClick={() => setDetailTab("active")}>Active ({detailStats.active})</button>
                <button style={tabBtn(detailTab === "completed")} onClick={() => setDetailTab("completed")}>Completed ({detailStats.completed})</button>
                <button style={tabBtn(detailTab === "canceled")} onClick={() => setDetailTab("canceled")}>Canceled ({detailStats.canceled})</button>
                <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 900, opacity: 0.75 }}>
                  Restaurant: {detailStats.restaurant} | Grocery: {detailStats.grocery}
                </span>
              </div>
            </div>

            {detailErr ? (
              <div style={{ ...card, marginTop: 10, borderColor: "rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.06)" }}>
                <div style={{ fontWeight: 950, color: "#B91C1C" }}>Orders load issue</div>
                <div style={{ marginTop: 6, opacity: 0.9 }}>{detailErr}</div>
              </div>
            ) : null}

            <div style={{ ...card, marginTop: 10, padding: 12 }}>
              {detailLoading ? (
                <div style={{ fontWeight: 900, opacity: 0.75 }}>Loading driver orders...</div>
              ) : detailFilteredOrders.length === 0 ? (
                <div style={{ fontWeight: 900, opacity: 0.75 }}>No orders found for this filter.</div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {detailFilteredOrders.map((o) => {
                    const rowKey = String(o?._rowKey || `${String(o?._source || "order")}:${String(o?.id || "")}`);
                    const expanded = expandedOrderKey === rowKey;
                    const sourceLabel = String(o?._source || "order").toUpperCase();
                    return (
                      <div key={rowKey} style={{ border: "1px solid rgba(15,23,42,0.12)", borderRadius: 14, padding: 12, background: "rgba(255,255,255,0.9)" }}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                          <span style={badge("rgba(59,130,246,0.12)", "rgba(59,130,246,0.25)")}>{sourceLabel}</span>
                          {orderStatusBadge(o?.status)}
                          <span style={{ fontSize: 12, fontWeight: 900, opacity: 0.7 }}>Order ID: {safeVal(o?.id)}</span>
                          <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 950 }}>{moneyUSD(orderTotal(o))}</span>
                        </div>

                        <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "repeat(4, minmax(180px, 1fr))", gap: 8 }}>
                          <div>
                            <div style={{ fontSize: 12, opacity: 0.65, fontWeight: 800 }}>Customer</div>
                            <div style={{ fontSize: 13, fontWeight: 900 }}>{orderCustomerName(o)}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 12, opacity: 0.65, fontWeight: 800 }}>Phone</div>
                            <div style={{ fontSize: 13, fontWeight: 900 }}>{orderCustomerPhone(o)}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 12, opacity: 0.65, fontWeight: 800 }}>Store</div>
                            <div style={{ fontSize: 13, fontWeight: 900 }}>{orderStoreName(o)}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 12, opacity: 0.65, fontWeight: 800 }}>Created</div>
                            <div style={{ fontSize: 13, fontWeight: 900 }}>{fmtDate(o?.created_at)}</div>
                          </div>
                        </div>

                        <div style={{ marginTop: 8, fontSize: 13, fontWeight: 900 }}>
                          Address: <span style={{ fontWeight: 800 }}>{orderAddress(o)}</span>
                        </div>

                        <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <span style={badge("rgba(15,23,42,0.06)", "rgba(15,23,42,0.15)")}>Delivery fee: {moneyUSD(orderDeliveryFee(o))}</span>
                          <span style={badge("rgba(15,23,42,0.06)", "rgba(15,23,42,0.15)")}>Tip: {moneyUSD(orderTip(o))}</span>
                          <span style={badge("rgba(34,197,94,0.12)", "rgba(34,197,94,0.25)")}>Driver payout: {moneyUSD(orderPayout(o))}</span>
                          {o?.delivery_earning_status ? (
                            <span style={badge("rgba(59,130,246,0.12)", "rgba(59,130,246,0.25)")}>Payout status: {safeVal(o?.delivery_earning_status)}</span>
                          ) : null}
                        </div>

                        <div style={{ marginTop: 10 }}>
                          <button style={btn} onClick={() => setExpandedOrderKey(expanded ? "" : rowKey)}>
                            {expanded ? "Hide Details" : "View Full Order Details"}
                          </button>
                        </div>

                        {expanded ? (
                          <div style={{ marginTop: 10, borderTop: "1px dashed rgba(15,23,42,0.16)", paddingTop: 10 }}>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(170px, 1fr))", gap: 8 }}>
                              <DetailKV label="Updated" value={fmtDate(o?.updated_at)} />
                              <DetailKV label="Delivered" value={fmtDate(o?.delivered_at)} />
                              <DetailKV label="Pickup lat/lng" value={`${safeVal(o?.restaurant_lat || o?._pickup_lat || "-")}, ${safeVal(o?.restaurant_lng || o?._pickup_lng || "-")}`} />
                              <DetailKV label="Drop lat/lng" value={`${safeVal(o?.customer_lat || o?.drop_lat || "-")}, ${safeVal(o?.customer_lng || o?.drop_lng || "-")}`} />
                              <DetailKV label="Payment method" value={safeVal(o?.payment_method)} />
                              <DetailKV label="Payment status" value={safeVal(o?.payment_status)} />
                              <DetailKV label="Order type" value={safeVal(o?.order_type || o?.type)} />
                              <DetailKV label="Store ID" value={safeVal(o?.store_id || o?.restaurant_id || o?.grocery_store_id)} />
                            </div>

                            {o?.delivery_instructions ? (
                              <div style={{ marginTop: 8, fontSize: 12, fontWeight: 800 }}>
                                Delivery instructions: {String(o.delivery_instructions)}
                              </div>
                            ) : null}

                            {o?.substitution_preference ? (
                              <div style={{ marginTop: 6, fontSize: 12, fontWeight: 800 }}>
                                Substitution: {String(o.substitution_preference)}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

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

function DetailKV({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: "1px solid rgba(15,23,42,0.1)", borderRadius: 10, padding: 8, background: "rgba(248,250,252,0.6)" }}>
      <div style={{ fontSize: 11, opacity: 0.7, fontWeight: 900 }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 12, fontWeight: 900 }}>{safeVal(value)}</div>
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

