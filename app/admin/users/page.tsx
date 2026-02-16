"use client";

import React, { useEffect, useMemo, useState } from "react";
import supabase from "@/lib/supabase";

type AnyRow = Record<string, any>;
type RestaurantsMap = Record<string, AnyRow[]>;

function normalize(s: any) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function clampText(s: any, max = 34) {
  const str = String(s ?? "");
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + "…";
}

function pickName(u: AnyRow) {
  return (
    u?.full_name ||
    u?.name ||
    u?.display_name ||
    u?.username ||
    u?.email ||
    u?.phone ||
    u?.user_id ||
    "User"
  );
}

function inferEnabledState(u: AnyRow) {
  if (typeof u?.is_disabled === "boolean") return u.is_disabled ? "disabled" : "enabled";
  if (typeof u?.disabled === "boolean") return u.disabled ? "disabled" : "enabled";
  if (typeof u?.is_active === "boolean") return u.is_active ? "enabled" : "disabled";
  if (typeof u?.enabled === "boolean") return u.enabled ? "enabled" : "disabled";
  return "unknown";
}

function buildEnabledUpdate(u: AnyRow, action: "enable" | "disable") {
  const dis = action === "disable";
  if (typeof u?.is_disabled === "boolean") return { is_disabled: dis };
  if (typeof u?.disabled === "boolean") return { disabled: dis };
  if (typeof u?.is_active === "boolean") return { is_active: !dis };
  if (typeof u?.enabled === "boolean") return { enabled: !dis };
  return null;
}

const ROLE_OPTIONS = [
  { value: "", label: "All roles" },
  { value: "admin", label: "Admin" },
  { value: "owner", label: "Owner" },
  { value: "customer", label: "Customer" },
  { value: "delivery", label: "Delivery" },
];

export default function AdminUsersPage() {
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [users, setUsers] = useState<AnyRow[]>([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");

  // ✅ keep explicit map type
  const [restaurantsByOwner, setRestaurantsByOwner] = useState<RestaurantsMap>({});

  // Modal
  const [selected, setSelected] = useState<AnyRow | null>(null);

  /* =========================
     PREMIUM ADMIN THEME (match dashboard)
     ONLY COLOR + FONT CHANGES (+ fix padding warning)
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

    // ✅ FIX: no shorthand padding here (so select can safely use paddingRight)
    const input: React.CSSProperties = {
      width: "100%",
      paddingTop: 11,
      paddingBottom: 11,
      paddingLeft: 12,
      paddingRight: 12,
      borderRadius: 14,
      border: "1px solid rgba(15, 23, 42, 0.14)",
      background: "rgba(255,255,255,0.95)",
      color: pageText,
      outline: "none",
      fontSize: 13,
      fontWeight: 700,
    };

    const btn: React.CSSProperties = {
      paddingTop: 10,
      paddingBottom: 10,
      paddingLeft: 12,
      paddingRight: 12,
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

    const badge = (kind: "enabled" | "disabled" | "unknown" | "admin" | "owner" | "customer" | "delivery") => {
      const common: React.CSSProperties = {
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        paddingTop: 6,
        paddingBottom: 6,
        paddingLeft: 10,
        paddingRight: 10,
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 950,
        border: "1px solid rgba(15, 23, 42, 0.12)",
        background: "rgba(15, 23, 42, 0.04)",
        color: pageText,
      };

      if (kind === "enabled")
        return { ...common, background: "rgba(0, 140, 255, 0.10)", border: "1px solid rgba(0, 140, 255, 0.22)" };
      if (kind === "disabled")
        return { ...common, background: "rgba(255, 0, 90, 0.10)", border: "1px solid rgba(255, 0, 90, 0.22)" };

      if (kind === "admin")
        return { ...common, background: "rgba(255,140,0,0.14)", border: "1px solid rgba(255,140,0,0.26)" };
      if (kind === "owner")
        return { ...common, background: "rgba(0, 200, 120, 0.10)", border: "1px solid rgba(0, 200, 120, 0.22)" };
      if (kind === "customer")
        return { ...common, background: "rgba(255, 180, 0, 0.12)", border: "1px solid rgba(255, 180, 0, 0.26)" };
      if (kind === "delivery")
        return { ...common, background: "rgba(160,120,255,0.14)", border: "1px solid rgba(160,120,255,0.26)" };

      return { ...common, color: muted };
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
      color: pageText,
    };

    const pageBg: React.CSSProperties = {
      padding: 16,
      borderRadius: 18,
      background:
        "radial-gradient(1200px 600px at 20% 10%, rgba(255,140,0,0.18), transparent 55%), radial-gradient(900px 520px at 85% 0%, rgba(255,220,160,0.18), transparent 60%), linear-gradient(180deg, rgba(248,250,252,1), rgba(241,245,249,1))",
      color: pageText,
      border: "1px solid rgba(15, 23, 42, 0.06)",
    };

    return { card, input, btn, btnPrimary, badge, modalOverlay, modalCard, pageBg, pageText, muted };
  }, []);

  async function loadUsers() {
    setLoading(true);
    setError(null);

    try {
      let q: any = supabase.from("profiles").select("*").order("created_at", { ascending: false }).limit(200);
      if (roleFilter) q = q.eq("role", roleFilter);

      const { data, error } = await q;
      if (error) {
        setUsers([]);
        setError(`Users fetch failed: ${error.message || "Unknown error"}`);
        return;
      }

      const rows = (data || []) as AnyRow[];
      setUsers(rows);
      await loadLinkedRestaurants(rows);
    } catch (e: any) {
      console.log(e);
      setUsers([]);
      setError("Users fetch crashed. Open console and share error.");
    } finally {
      setLoading(false);
    }
  }

  async function loadLinkedRestaurants(profileRows: AnyRow[]) {
    try {
      const ids = Array.from(new Set(profileRows.map((u) => String(u?.user_id ?? u?.id ?? "")).filter(Boolean))).slice(
        0,
        200
      );

      if (ids.length === 0) {
        setRestaurantsByOwner({});
        return;
      }

      // ✅ IMPORTANT: keep this as string[] to avoid deep TS inference
      const colsToTry: string[] = ["owner_user_id", "owner_id", "user_id", "created_by"];

      const map: RestaurantsMap = {};

      for (const col of colsToTry) {
        // ✅ IMPORTANT: make builder `any` so TS stops "excessively deep" inference
        const builder: any = supabase
          .from("restaurants")
          .select(
            "id, name, phone, city, address, address_line1, accepting_orders, is_open, created_at, owner_user_id, owner_id, user_id, created_by"
          )
          .in(col, ids)
          .limit(500);

        const { data, error } = await builder;

        if (error) {
          console.log(`Linked restaurants query failed for column ${col}:`, error);
          continue;
        }

        for (const r of data || []) {
          const ownerVal = (r as AnyRow)?.[col];
          if (!ownerVal) continue;

          const key = String(ownerVal);
          if (!map[key]) map[key] = [];
          if (!map[key].some((x) => String(x.id) === String((r as AnyRow).id))) {
            map[key].push(r as AnyRow);
          }
        }
      }

      setRestaurantsByOwner(map);
    } catch (e: any) {
      console.log("Linked restaurants load crashed:", e);
    }
  }

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => loadUsers(), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleFilter]);

  const filteredUsers = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return users;

    return users.filter((u) => {
      const nm = String(pickName(u)).toLowerCase();
      const email = String(u?.email ?? "").toLowerCase();
      const phone = String(u?.phone ?? u?.mobile ?? "").toLowerCase();
      const role = String(u?.role ?? "").toLowerCase();
      const uid = String(u?.user_id ?? u?.id ?? "").toLowerCase();
      return nm.includes(s) || email.includes(s) || phone.includes(s) || role.includes(s) || uid.includes(s);
    });
  }, [users, search]);

  const stats = useMemo(() => {
    const total = filteredUsers.length;
    let enabled = 0;
    let disabled = 0;
    let owners = 0;
    let customers = 0;
    let deliveries = 0;

    for (const u of filteredUsers) {
      const en = normalize(inferEnabledState(u));
      if (en === "enabled") enabled++;
      if (en === "disabled") disabled++;

      const r = normalize(u?.role);

      if (r === "owner" || r === "restaurant_owner") owners++;
      if (r === "customer") customers++;
      if (r === "delivery" || r === "delivery_partner") deliveries++;
    }

    return { total, enabled, disabled, owners, customers, deliveries };
  }, [filteredUsers]);

  async function setUserEnabled(u: AnyRow, action: "enable" | "disable") {
    const id = String(u?.user_id ?? u?.id ?? "");
    if (!id) return;

    const payload = buildEnabledUpdate(u, action);
    if (!payload) {
      setError(
        "Your profiles table does not have enable/disable columns (is_disabled/disabled/is_active/enabled). Tell me what column you want to use and I’ll map it."
      );
      return;
    }

    setBusyId(id);
    setError(null);

    try {
      const byUserId = await supabase.from("profiles").update(payload).eq("user_id", id);
      if (byUserId.error) {
        const byId = await supabase.from("profiles").update(payload).eq("id", id);
        if (byId.error) {
          setError(`Update failed: ${byId.error.message || byUserId.error.message || "Unknown error"}`);
          return;
        }
      }

      setUsers((prev) =>
        prev.map((x) => {
          const xid = String(x?.user_id ?? x?.id ?? "");
          return xid === id ? { ...x, ...payload } : x;
        })
      );

      setSelected((prev) => {
        if (!prev) return prev;
        const pid = String(prev?.user_id ?? prev?.id ?? "");
        if (pid !== id) return prev;
        return { ...prev, ...payload };
      });
    } catch (e: any) {
      console.log(e);
      setError("Update crashed. Open console and share error.");
    } finally {
      setBusyId(null);
    }
  }

  const headerRow: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1.2fr 1fr 0.8fr 0.8fr 1.2fr 1.2fr",
    gap: 10,
    paddingTop: 11,
    paddingBottom: 11,
    paddingLeft: 12,
    paddingRight: 12,
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
    gridTemplateColumns: "1.2fr 1fr 0.8fr 0.8fr 1.2fr 1.2fr",
    gap: 10,
    paddingTop: 12,
    paddingBottom: 12,
    paddingLeft: 12,
    paddingRight: 12,
    borderRadius: 14,
    background: "#FFFFFF",
    border: "1px solid rgba(15, 23, 42, 0.08)",
    boxShadow: "0 12px 26px rgba(15, 23, 42, 0.05)",
    cursor: "pointer",
    color: styles.pageText,
  };

  return (
    <div style={styles.pageBg}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 950, letterSpacing: -0.2 }}>Users</div>
          <div style={{ fontSize: 13, color: styles.muted, marginTop: 6, fontWeight: 700 }}>
            Profiles list — filter by role, search, enable/disable, and see linked restaurants.
          </div>
        </div>

        <button onClick={loadUsers} style={styles.btnPrimary} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 12, marginTop: 14 }}>
        <div style={styles.card}>
          <div style={{ fontSize: 12, color: styles.muted, fontWeight: 900 }}>Total</div>
          <div style={{ fontSize: 28, fontWeight: 950, marginTop: 6 }}>{stats.total}</div>
        </div>
        <div style={styles.card}>
          <div style={{ fontSize: 12, color: styles.muted, fontWeight: 900 }}>Enabled</div>
          <div style={{ fontSize: 28, fontWeight: 950, marginTop: 6 }}>{stats.enabled}</div>
        </div>
        <div style={styles.card}>
          <div style={{ fontSize: 12, color: styles.muted, fontWeight: 900 }}>Disabled</div>
          <div style={{ fontSize: 28, fontWeight: 950, marginTop: 6 }}>{stats.disabled}</div>
        </div>
        <div style={styles.card}>
          <div style={{ fontSize: 12, color: styles.muted, fontWeight: 900 }}>Owners</div>
          <div style={{ fontSize: 28, fontWeight: 950, marginTop: 6 }}>{stats.owners}</div>
          <div style={{ fontSize: 12, color: styles.muted, marginTop: 6, fontWeight: 700 }}>owner + restaurant_owner</div>
        </div>
        <div style={styles.card}>
          <div style={{ fontSize: 12, color: styles.muted, fontWeight: 900 }}>Customers</div>
          <div style={{ fontSize: 28, fontWeight: 950, marginTop: 6 }}>{stats.customers}</div>
        </div>
        <div style={styles.card}>
          <div style={{ fontSize: 12, color: styles.muted, fontWeight: 900 }}>Delivery</div>
          <div style={{ fontSize: 28, fontWeight: 950, marginTop: 6 }}>{stats.deliveries}</div>
          <div style={{ fontSize: 12, color: styles.muted, marginTop: 6, fontWeight: 700 }}>delivery + delivery_partner</div>
        </div>
      </div>

      <div style={{ ...styles.card, marginTop: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 950, letterSpacing: -0.1 }}>Filters</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10, marginTop: 10 }}>
          <div>
            <div style={{ fontSize: 12, color: styles.muted, marginBottom: 6, fontWeight: 900 }}>Role</div>
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} style={{ ...styles.input, paddingRight: 34 }}>
              {ROLE_OPTIONS.map((x) => (
                <option key={x.value} value={x.value}>
                  {x.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div style={{ fontSize: 12, color: styles.muted, marginBottom: 6, fontWeight: 900 }}>Search</div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name / email / phone / user id / role…"
              style={styles.input}
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
          <button
            style={styles.btn}
            onClick={() => {
              setRoleFilter("");
              setSearch("");
            }}
          >
            Clear
          </button>
        </div>
      </div>

      {error ? (
        <div style={{ ...styles.card, marginTop: 12, border: "1px solid rgba(255,0,90,0.25)", background: "rgba(255,0,90,0.06)" }}>
          <div style={{ fontWeight: 950 }}>Error</div>
          <div style={{ marginTop: 6, fontSize: 13, opacity: 0.95 }}>{error}</div>
        </div>
      ) : null}

      <div style={{ marginTop: 12 }}>
        <div style={headerRow}>
          <div>User</div>
          <div>Contact</div>
          <div>Role</div>
          <div>Status</div>
          <div>Linked Restaurants</div>
          <div>Actions</div>
        </div>

        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
          {loading ? (
            <div style={styles.card}>Loading users…</div>
          ) : filteredUsers.length === 0 ? (
            <div style={styles.card}>No users found.</div>
          ) : (
            filteredUsers.map((u) => {
              const uid = String(u?.user_id ?? u?.id ?? "");
              const nm = pickName(u);
              const email = u?.email ?? "";
              const phone = u?.phone ?? u?.mobile ?? "";
              const role = normalize(u?.role) || "unknown";
              const enabledState = normalize(inferEnabledState(u));

              const linked = (restaurantsByOwner[uid] || []) as AnyRow[];
              const linkedLabel =
                linked.length === 0 ? "—" : linked.length === 1 ? linked[0]?.name || "1 restaurant" : `${linked.length} restaurants`;

              return (
                <div key={uid || Math.random()} style={rowStyle} onClick={() => setSelected(u)} title="Click to view details">
                  <div style={{ fontWeight: 950 }}>
                    {clampText(nm, 34)}
                    <div style={{ fontSize: 12, color: styles.muted, marginTop: 2, fontWeight: 700 }}>
                      {uid ? `UID: ${clampText(uid, 30)}` : "UID: —"}
                    </div>
                  </div>

                  <div style={{ opacity: 0.98 }}>
                    <div style={{ fontWeight: 950 }}>{email ? clampText(email, 40) : "—"}</div>
                    <div style={{ fontSize: 12, color: styles.muted, marginTop: 2, fontWeight: 700 }}>
                      {phone ? clampText(phone, 18) : "—"}
                    </div>
                  </div>

                  <div>
                    <span
                      style={styles.badge(
                        role === "admin"
                          ? "admin"
                          : role === "owner" || role === "restaurant_owner"
                          ? "owner"
                          : role === "customer"
                          ? "customer"
                          : role === "delivery" || role === "delivery_partner"
                          ? "delivery"
                          : "unknown"
                      )}
                    >
                      {role}
                    </span>
                  </div>

                  <div>
                    <span style={styles.badge(enabledState === "disabled" ? "disabled" : enabledState === "enabled" ? "enabled" : "unknown")}>
                      {enabledState || "unknown"}
                    </span>
                  </div>

                  <div style={{ fontWeight: 950, opacity: 0.98 }}>{clampText(linkedLabel, 32)}</div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} onClick={(e) => e.stopPropagation()}>
                    {enabledState === "disabled" ? (
                      <button style={styles.btnPrimary} disabled={busyId === uid} onClick={() => setUserEnabled(u, "enable")}>
                        Enable
                      </button>
                    ) : (
                      <button style={styles.btn} disabled={busyId === uid} onClick={() => setUserEnabled(u, "disable")}>
                        Disable
                      </button>
                    )}
                    <button style={styles.btn} onClick={() => setSelected(u)}>
                      View
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {selected ? (
        <div style={styles.modalOverlay} onClick={() => setSelected(null)}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 950, letterSpacing: -0.2 }}>{pickName(selected)}</div>
                <div style={{ fontSize: 13, color: styles.muted, marginTop: 4, fontWeight: 700 }}>
                  UID: {String(selected?.user_id ?? selected?.id ?? "—")}
                </div>
              </div>

              <button style={styles.btn} onClick={() => setSelected(null)}>
                Close
              </button>
            </div>

            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ ...styles.card, background: "rgba(15, 23, 42, 0.03)" }}>
                <div style={{ fontSize: 13, fontWeight: 950 }}>Profile</div>
                <div style={{ marginTop: 10, fontSize: 13, opacity: 0.95, lineHeight: 1.6 }}>
                  <div>
                    <b>Role:</b> {String(selected?.role ?? "—")}
                  </div>
                  <div>
                    <b>Email:</b> {String(selected?.email ?? "—")}
                  </div>
                  <div>
                    <b>Phone:</b> {String(selected?.phone ?? selected?.mobile ?? "—")}
                  </div>
                  <div>
                    <b>Status:</b> {inferEnabledState(selected)}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                  {normalize(inferEnabledState(selected)) === "disabled" ? (
                    <button
                      style={styles.btnPrimary}
                      disabled={busyId === String(selected?.user_id ?? selected?.id ?? "")}
                      onClick={() => setUserEnabled(selected, "enable")}
                    >
                      Enable user
                    </button>
                  ) : (
                    <button
                      style={styles.btn}
                      disabled={busyId === String(selected?.user_id ?? selected?.id ?? "")}
                      onClick={() => setUserEnabled(selected, "disable")}
                    >
                      Disable user
                    </button>
                  )}
                </div>
              </div>

              <div style={{ ...styles.card, background: "rgba(15, 23, 42, 0.03)" }}>
                <div style={{ fontSize: 13, fontWeight: 950 }}>Linked restaurants</div>

                {(() => {
                  const uid = String(selected?.user_id ?? selected?.id ?? "");
                  const linked = (restaurantsByOwner[uid] || []) as AnyRow[];
                  if (!uid) return <div style={{ marginTop: 10, color: styles.muted, fontWeight: 700 }}>No UID found.</div>;
                  if (linked.length === 0)
                    return <div style={{ marginTop: 10, color: styles.muted, fontWeight: 700 }}>No linked restaurants found.</div>;

                  return (
                    <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                      {linked.map((r, idx) => {
                        const addr = r?.address ?? r?.address_line1 ?? "";
                        const accepting =
                          typeof r?.accepting_orders === "boolean"
                            ? r.accepting_orders
                            : typeof r?.is_open === "boolean"
                            ? r.is_open
                            : null;

                        return (
                          <div
                            key={String(r?.id ?? idx)}
                            style={{
                              padding: 12,
                              borderRadius: 14,
                              background: "rgba(15, 23, 42, 0.03)",
                              border: "1px solid rgba(15, 23, 42, 0.10)",
                            }}
                          >
                            <div style={{ fontWeight: 950 }}>{r?.name || "Restaurant"}</div>
                            <div style={{ fontSize: 12, color: styles.muted, marginTop: 4, fontWeight: 700 }}>
                              #{clampText(r?.id, 26)} {addr ? `• ${clampText(addr, 42)}` : ""}
                            </div>
                            <div style={{ fontSize: 12, color: styles.muted, marginTop: 4, fontWeight: 700 }}>
                              Accepting: <b>{accepting === null ? "—" : accepting ? "YES" : "NO"}</b>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>

            <div style={{ ...styles.card, marginTop: 12, background: "rgba(15, 23, 42, 0.03)" }}>
              <div style={{ fontSize: 13, fontWeight: 950 }}>Raw user data (debug)</div>
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
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
