"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import supabase from "@/lib/supabase";

type AnyRow = Record<string, any>;

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

function getOwnerKey(r: AnyRow) {
  // common column names we may have in restaurants table
  if (r?.owner_user_id) return "owner_user_id";
  if (r?.owner_id) return "owner_id";
  if (r?.user_id) return "user_id";
  if (r?.created_by) return "created_by";
  return null;
}

function inferApprovalState(r: AnyRow) {
  // We support multiple schemas:
  // 1) is_approved boolean
  // 2) approved boolean
  // 3) approval_status string: "pending/approved/rejected"
  // 4) status string: "pending/approved/rejected"
  if (typeof r?.is_approved === "boolean") return r.is_approved ? "approved" : "pending";
  if (typeof r?.approved === "boolean") return r.approved ? "approved" : "pending";

  const a = normalize(r?.approval_status);
  if (a) return a;

  const s = normalize(r?.status);
  if (s) return s;

  // no info
  return "unknown";
}

function inferEnabledState(r: AnyRow) {
  // 1) is_disabled boolean
  // 2) disabled boolean
  // 3) is_active boolean (inverse)
  // 4) enabled boolean
  if (typeof r?.is_disabled === "boolean") return r.is_disabled ? "disabled" : "enabled";
  if (typeof r?.disabled === "boolean") return r.disabled ? "disabled" : "enabled";
  if (typeof r?.is_active === "boolean") return r.is_active ? "enabled" : "disabled";
  if (typeof r?.enabled === "boolean") return r.enabled ? "enabled" : "disabled";
  return "unknown";
}

function safeNumber(v: any) {
  const n = Number(v);
  if (Number.isNaN(n)) return "";
  return n;
}

function formatMoney(v: any) {
  const n = Number(v || 0);
  if (Number.isNaN(n)) return "₹0";
  return `₹${n.toFixed(0)}`;
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

/** =========================
 *  MENU ITEMS HELPERS (auto-detect columns)
 *  ========================= */
function getMenuImageUrl(it: AnyRow): string {
  const keys = [
    "image_url",
    "photo_url",
    "image",
    "photo",
    "picture_url",
    "thumbnail_url",
    "banner_url",
    "img",
    "cover_url",
  ];
  for (const k of keys) {
    const v = it?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  // If "images" array exists, use first
  const arr = it?.images;
  if (Array.isArray(arr) && arr.length > 0) {
    const first = arr[0];
    if (typeof first === "string" && first.trim()) return first.trim();
  }
  return "";
}

function getMenuName(it: AnyRow) {
  return it?.name ?? it?.item_name ?? it?.title ?? it?.dish_name ?? "(no name)";
}

function getMenuCategory(it: AnyRow) {
  return it?.category ?? it?.category_name ?? it?.group ?? it?.section ?? "";
}

function getMenuPrice(it: AnyRow) {
  return it?.price ?? it?.unit_price ?? it?.amount ?? it?.mrp ?? it?.sale_price ?? 0;
}

function inferMenuAvailable(it: AnyRow): { key: string | null; value: boolean | null } {
  const candidates = ["is_available", "available", "in_stock", "is_active", "active", "enabled"];
  for (const k of candidates) {
    if (typeof it?.[k] === "boolean") return { key: k, value: !!it[k] };
  }
  return { key: null, value: null };
}

/** =========================
 *  PUBLIC CODE (RST-01)
 *  ========================= */
function getPublicCode(r: AnyRow) {
  const v = r?.public_code;
  if (typeof v === "string" && v.trim()) return v.trim();
  // fallback (short) if public_code not present
  const id = String(r?.id ?? "");
  if (!id) return "RST-??";
  return `RST-${id.slice(0, 6).toUpperCase()}`;
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function mergePayloads(...parts: Array<AnyRow | null | undefined>) {
  const out: AnyRow = {};
  for (const p of parts) {
    if (!p) continue;
    for (const k of Object.keys(p)) out[k] = p[k];
  }
  return out;
}

function buildAcceptingUpdate(row: AnyRow, next: boolean) {
  if (typeof row?.accepting_orders === "boolean") return { accepting_orders: next };
  if (typeof row?.is_open === "boolean") return { is_open: next };
  if (typeof row?.open === "boolean") return { open: next };
  // If no column exists, do nothing (avoid creating new column by mistake)
  return null;
}

export default function AdminRestaurantsPage() {
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [restaurants, setRestaurants] = useState<AnyRow[]>([]);
  const [ownersById, setOwnersById] = useState<Record<string, AnyRow>>({});

  const [search, setSearch] = useState("");
  const [approvalFilter, setApprovalFilter] = useState(""); // all / pending / approved / rejected
  const [enabledFilter, setEnabledFilter] = useState(""); // all / enabled / disabled

  const [editing, setEditing] = useState<AnyRow | null>(null);
  const [editForm, setEditForm] = useState<AnyRow>({});
  const [editError, setEditError] = useState<string | null>(null);

  // ✅ PRO: restaurant details modal
  const [viewing, setViewing] = useState<AnyRow | null>(null);
  const [viewTab, setViewTab] = useState<"overview" | "menu" | "orders">("overview");

  // ✅ PRO: menu items state
  const [menuLoading, setMenuLoading] = useState(false);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [menuItems, setMenuItems] = useState<AnyRow[]>([]);
  const [menuSearch, setMenuSearch] = useState("");
  const [menuCategoryFilter, setMenuCategoryFilter] = useState("");

  // ✅ PRO: dish modal
  const [dishEditing, setDishEditing] = useState<AnyRow | null>(null);
  const [dishForm, setDishForm] = useState<AnyRow>({});
  const [dishSaving, setDishSaving] = useState(false);
  const [dishError, setDishError] = useState<string | null>(null);

  // ✅ PRO: orders preview
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [recentOrders, setRecentOrders] = useState<AnyRow[]>([]);
  const [ordersStats, setOrdersStats] = useState<{ totalOrders: number; revenue: number }>({
    totalOrders: 0,
    revenue: 0,
  });

  // ✅ NICE debug toggle
  const [showDebug, setShowDebug] = useState(false);

  // ✅ Realtime helpers
  const viewingRef = useRef<AnyRow | null>(null);
  const refreshTimerRef = useRef<any>(null);
  const detailsTimerRef = useRef<any>(null);

  useEffect(() => {
    viewingRef.current = viewing;
  }, [viewing]);

  /* =========================
     PREMIUM ADMIN THEME (match dashboard)
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

    // ✅ FIX: no shorthand padding (prevents "padding vs paddingRight" warning)
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

    const btnDanger: React.CSSProperties = {
      ...btn,
      border: "1px solid rgba(255,0,90,0.18)",
      background: "rgba(255,0,90,0.06)",
      color: "#9b102f",
    };

    const badge = (kind: "approved" | "pending" | "rejected" | "enabled" | "disabled" | "unknown") => {
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

      if (kind === "approved")
        return { ...common, background: "rgba(0, 200, 120, 0.10)", border: "1px solid rgba(0, 200, 120, 0.22)" };
      if (kind === "pending")
        return { ...common, background: "rgba(255, 180, 0, 0.12)", border: "1px solid rgba(255, 180, 0, 0.26)" };
      if (kind === "rejected")
        return { ...common, background: "rgba(255, 0, 90, 0.10)", border: "1px solid rgba(255, 0, 90, 0.22)" };
      if (kind === "enabled")
        return { ...common, background: "rgba(0, 140, 255, 0.10)", border: "1px solid rgba(0, 140, 255, 0.22)" };
      if (kind === "disabled")
        return { ...common, background: "rgba(255, 0, 90, 0.10)", border: "1px solid rgba(255, 0, 90, 0.22)" };
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
      width: "min(1120px, 100%)",
      maxHeight: "90vh",
      overflow: "auto",
      borderRadius: 20,
      background: "#FFFFFF",
      border: "1px solid rgba(15, 23, 42, 0.12)",
      boxShadow: "0 30px 120px rgba(2,6,23,0.35)",
      padding: 16,
      color: pageText,
    };

    return { card, input, btn, btnPrimary, btnDanger, badge, pageBg, pageText, muted, modalOverlay, modalCard };
  }, []);

  async function loadRestaurants() {
    setLoading(true);
    setError(null);

    try {
      let data: AnyRow[] | null = null;
      let errMsg: string | null = null;

      const r1 = await supabase
        .from("restaurants")
        .select("*, profiles(full_name,email,phone)")
        .order("created_at", { ascending: false })
        .limit(200);

      if (r1.error) {
        console.log("Restaurants load with join error:", r1.error);
        const r2 = await supabase.from("restaurants").select("*").order("created_at", { ascending: false }).limit(200);

        if (r2.error) {
          errMsg = r2.error.message || "Unknown error";
        } else {
          data = (r2.data || []) as AnyRow[];
        }
      } else {
        data = (r1.data || []) as AnyRow[];
      }

      if (errMsg) {
        setRestaurants([]);
        setError(`Restaurants fetch failed: ${errMsg}`);
        return;
      }

      setRestaurants(data || []);

      // Collect owner ids
      const ownerIds = new Set<string>();
      for (const row of data || []) {
        const k = getOwnerKey(row);
        if (!k) continue;
        const val = row?.[k];
        if (val) ownerIds.add(String(val));
      }

      if (ownerIds.size > 0) {
        const ids = Array.from(ownerIds);

        const ownersResp = await supabase
          .from("profiles")
          .select("user_id, full_name, name, email, phone, role")
          .in("user_id", ids);

        if (ownersResp.error) {
          console.log("Owners batch load error:", ownersResp.error);
          return;
        }

        const map: Record<string, AnyRow> = {};
        for (const o of ownersResp.data || []) map[String(o.user_id)] = o;
        setOwnersById(map);
      }
    } catch (e: any) {
      console.log(e);
      setRestaurants([]);
      setError("Restaurants fetch crashed. Open console and share error.");
    } finally {
      setLoading(false);
    }
  }

  /** =========================
   *  ✅ REALTIME (no refresh)
   *  ========================= */
  useEffect(() => {
    // Debounced refresh
    const scheduleRefreshRestaurants = () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = setTimeout(() => {
        void loadRestaurants();
      }, 250);
    };

    const scheduleRefreshDetails = (table: "menu_items" | "orders") => {
      if (detailsTimerRef.current) clearTimeout(detailsTimerRef.current);
      detailsTimerRef.current = setTimeout(() => {
        const cur = viewingRef.current;
        if (!cur?.id) return;
        if (table === "menu_items") void loadMenuItems(cur);
        if (table === "orders") void loadOrdersForRestaurant(cur);
      }, 250);
    };

    const channel = supabase
      .channel("admin-restaurants-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "restaurants" }, () => {
        scheduleRefreshRestaurants();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_items" }, (payload: any) => {
        const cur = viewingRef.current;
        const rid = cur?.id;
        const changedRid =
          payload?.new?.restaurant_id ?? payload?.old?.restaurant_id ?? payload?.record?.restaurant_id ?? null;
        if (rid && changedRid && String(rid) === String(changedRid)) {
          scheduleRefreshDetails("menu_items");
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, (payload: any) => {
        const cur = viewingRef.current;
        const rid = cur?.id;
        const changedRid =
          payload?.new?.restaurant_id ?? payload?.old?.restaurant_id ?? payload?.record?.restaurant_id ?? null;
        if (rid && changedRid && String(rid) === String(changedRid)) {
          scheduleRefreshDetails("orders");
        }
      })
      .subscribe();

    return () => {
      try {
        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
        if (detailsTimerRef.current) clearTimeout(detailsTimerRef.current);
      } catch {}
      try {
        supabase.removeChannel(channel);
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadRestaurants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();

    return restaurants.filter((r) => {
      const approval = inferApprovalState(r);
      const enabled = inferEnabledState(r);

      if (approvalFilter && normalize(approval) !== normalize(approvalFilter)) return false;
      if (enabledFilter && normalize(enabled) !== normalize(enabledFilter)) return false;

      if (!s) return true;

      const name = String(r?.name ?? "").toLowerCase();
      const phone = String(r?.phone ?? "").toLowerCase();
      const address = String(r?.address ?? r?.address_line1 ?? "").toLowerCase();
      const city = String(r?.city ?? "").toLowerCase();
      const id = String(r?.id ?? "").toLowerCase();
      const pcode = String(r?.public_code ?? "").toLowerCase();

      const ownerKey = getOwnerKey(r);
      const ownerId = ownerKey ? String(r?.[ownerKey] ?? "") : "";
      const owner = ownersById[ownerId] || r?.profiles || null;
      const ownerEmail = String(owner?.email ?? "").toLowerCase();
      const ownerName = String(owner?.full_name ?? owner?.name ?? "").toLowerCase();

      return (
        id.includes(s) ||
        pcode.includes(s) ||
        name.includes(s) ||
        phone.includes(s) ||
        address.includes(s) ||
        city.includes(s) ||
        ownerEmail.includes(s) ||
        ownerName.includes(s)
      );
    });
  }, [restaurants, ownersById, search, approvalFilter, enabledFilter]);

  const stats = useMemo(() => {
    const total = filtered.length;
    let pending = 0;
    let approved = 0;
    let rejected = 0;
    let enabled = 0;
    let disabled = 0;

    for (const r of filtered) {
      const a = normalize(inferApprovalState(r));
      const e = normalize(inferEnabledState(r));
      if (a === "pending") pending++;
      if (a === "approved") approved++;
      if (a === "rejected") rejected++;
      if (e === "enabled") enabled++;
      if (e === "disabled") disabled++;
    }
    return { total, pending, approved, rejected, enabled, disabled };
  }, [filtered]);

  function buildApprovalUpdate(row: AnyRow, action: "approve" | "reject") {
    const yes = action === "approve";
    if (typeof row?.is_approved === "boolean") return { is_approved: yes };
    if (typeof row?.approved === "boolean") return { approved: yes };
    if (row?.approval_status !== undefined) return { approval_status: yes ? "approved" : "rejected" };
    if (row?.status !== undefined) return { status: yes ? "approved" : "rejected" };
    return null;
  }

  function buildEnabledUpdate(row: AnyRow, action: "enable" | "disable") {
    const dis = action === "disable";
    if (typeof row?.is_disabled === "boolean") return { is_disabled: dis };
    if (typeof row?.disabled === "boolean") return { disabled: dis };
    if (typeof row?.is_active === "boolean") return { is_active: !dis };
    if (typeof row?.enabled === "boolean") return { enabled: !dis };
    return null;
  }

  function buildForceCloseUpdate(row: AnyRow) {
    if (typeof row?.accepting_orders === "boolean") return { accepting_orders: false };
    if (typeof row?.is_open === "boolean") return { is_open: false };
    if (typeof row?.open === "boolean") return { open: false };
    return { accepting_orders: false };
  }

  async function doUpdate(row: AnyRow, payload: AnyRow, successPatch?: AnyRow) {
    setBusyId(row.id);
    setError(null);

    try {
      const { error } = await supabase.from("restaurants").update(payload).eq("id", row.id);

      if (error) {
        setError(`Update failed: ${error.message || "Unknown error"}`);
        return false;
      }

      setRestaurants((prev) => prev.map((x) => (x.id === row.id ? { ...x, ...payload, ...(successPatch || {}) } : x)));

      setEditing((prev) => (prev && prev.id === row.id ? { ...prev, ...payload, ...(successPatch || {}) } : prev));
      setViewing((prev) => (prev && prev.id === row.id ? { ...prev, ...payload, ...(successPatch || {}) } : prev));

      return true;
    } catch (e: any) {
      console.log(e);
      setError("Update crashed. Open console and share error.");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  // ✅ IMPORTANT: Approve now also ENABLES automatically (and turns accepting ON if column exists)
  async function approve(row: AnyRow) {
    const approvalPayload = buildApprovalUpdate(row, "approve");
    if (!approvalPayload) {
      setError("Your restaurants table does not have approval columns (is_approved/approved/status/approval_status).");
      return;
    }

    const enablePayload = buildEnabledUpdate(row, "enable"); // is_active=true if exists
    const acceptingPayload = buildAcceptingUpdate(row, true);

    const payload = mergePayloads(approvalPayload, enablePayload, acceptingPayload);
    await doUpdate(row, payload);
  }

  // ✅ IMPORTANT: Reject now also DISABLES automatically (and force closes)
  async function reject(row: AnyRow) {
    const approvalPayload = buildApprovalUpdate(row, "reject");
    if (!approvalPayload) {
      setError("Your restaurants table does not have approval columns (is_approved/approved/status/approval_status).");
      return;
    }

    const disablePayload = buildEnabledUpdate(row, "disable");
    const closePayload = buildForceCloseUpdate(row);

    const payload = mergePayloads(approvalPayload, disablePayload, closePayload);
    await doUpdate(row, payload);
  }

  async function enableRow(row: AnyRow) {
    const payload = buildEnabledUpdate(row, "enable");
    if (!payload) {
      setError("Your restaurants table does not have enable/disable columns (is_disabled/disabled/is_active/enabled).");
      return;
    }
    await doUpdate(row, payload);
  }

  async function disableRow(row: AnyRow) {
    const payload = buildEnabledUpdate(row, "disable");
    if (!payload) {
      setError("Your restaurants table does not have enable/disable columns (is_disabled/disabled/is_active/enabled).");
      return;
    }
    await doUpdate(row, payload);
  }

  async function forceClose(row: AnyRow) {
    const payload = buildForceCloseUpdate(row);
    await doUpdate(row, payload);
  }

  function openEdit(row: AnyRow) {
    setEditError(null);
    setEditing(row);

    setEditForm({
      name: row?.name ?? "",
      phone: row?.phone ?? "",
      address: row?.address ?? row?.address_line1 ?? "",
      city: row?.city ?? "",
      timings: row?.timings ?? row?.hours ?? "",
      min_order: row?.min_order ?? row?.min_order_amount ?? "",
      accepting_orders:
        typeof row?.accepting_orders === "boolean"
          ? row.accepting_orders
          : typeof row?.is_open === "boolean"
          ? row.is_open
          : true,
    });
  }

  async function saveEdit() {
    if (!editing) return;
    setEditError(null);

    const payload: AnyRow = {};
    payload.name = editForm.name;

    if (editing?.phone !== undefined) payload.phone = editForm.phone;
    else payload.phone = editForm.phone;

    if (editing?.address !== undefined) payload.address = editForm.address;
    else if (editing?.address_line1 !== undefined) payload.address_line1 = editForm.address;
    else payload.address = editForm.address;

    if (editing?.city !== undefined) payload.city = editForm.city;

    if (editing?.timings !== undefined) payload.timings = editForm.timings;
    else if (editing?.hours !== undefined) payload.hours = editForm.timings;

    const mo = safeNumber(editForm.min_order);
    if (editing?.min_order !== undefined) payload.min_order = mo === "" ? null : mo;
    else if (editing?.min_order_amount !== undefined) payload.min_order_amount = mo === "" ? null : mo;

    if (editing?.accepting_orders !== undefined) payload.accepting_orders = !!editForm.accepting_orders;
    else if (editing?.is_open !== undefined) payload.is_open = !!editForm.accepting_orders;
    else payload.accepting_orders = !!editForm.accepting_orders;

    const ok = await doUpdate(editing, payload);
    if (ok) setEditing(null);
  }

  /** =========================
   *  PRO: VIEW DETAILS (menu + orders)
   *  ========================= */
  function openView(row: AnyRow) {
    setShowDebug(false);
    setViewing(row);
    setViewTab("overview");
    // load menu + orders in background
    void loadMenuItems(row);
    void loadOrdersForRestaurant(row);
  }

  async function loadMenuItems(restaurant: AnyRow) {
    const rid = restaurant?.id;
    if (!rid) return;

    setMenuLoading(true);
    setMenuError(null);

    try {
      const { data, error } = await supabase
        .from("menu_items")
        .select("*")
        .eq("restaurant_id", rid)
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) {
        setMenuItems([]);
        setMenuError(`Menu fetch failed: ${error.message || "Unknown error"}`);
        return;
      }

      setMenuItems((data || []) as AnyRow[]);
    } catch (e: any) {
      console.log(e);
      setMenuItems([]);
      setMenuError("Menu fetch crashed. Open console and share error.");
    } finally {
      setMenuLoading(false);
    }
  }

  async function loadOrdersForRestaurant(restaurant: AnyRow) {
    const rid = restaurant?.id;
    if (!rid) return;

    setOrdersLoading(true);
    setOrdersError(null);

    try {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("restaurant_id", rid)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        setRecentOrders([]);
        setOrdersStats({ totalOrders: 0, revenue: 0 });
        setOrdersError(`Orders fetch failed: ${error.message || "Unknown error"}`);
        return;
      }

      const rows = (data || []) as AnyRow[];
      setRecentOrders(rows);

      let revenue = 0;
      for (const o of rows) {
        const v = o?.total_amount ?? o?.total ?? o?.grand_total ?? 0;
        const n = Number(v || 0);
        if (!Number.isNaN(n)) revenue += n;
      }
      setOrdersStats({ totalOrders: rows.length, revenue });
    } catch (e: any) {
      console.log(e);
      setRecentOrders([]);
      setOrdersStats({ totalOrders: 0, revenue: 0 });
      setOrdersError("Orders fetch crashed. Open console and share error.");
    } finally {
      setOrdersLoading(false);
    }
  }

  const menuCategories = useMemo(() => {
    const set = new Set<string>();
    for (const it of menuItems) {
      const c = String(getMenuCategory(it) || "").trim();
      if (c) set.add(c);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [menuItems]);

  const filteredMenuItems = useMemo(() => {
    const s = menuSearch.trim().toLowerCase();
    const cat = normalize(menuCategoryFilter);

    return menuItems.filter((it) => {
      const name = String(getMenuName(it)).toLowerCase();
      const category = normalize(getMenuCategory(it));
      const desc = String(it?.description ?? it?.details ?? "").toLowerCase();

      if (cat && category !== cat) return false;
      if (!s) return true;
      return name.includes(s) || category.includes(s) || desc.includes(s);
    });
  }, [menuItems, menuSearch, menuCategoryFilter]);

  function openAddDish() {
    if (!viewing?.id) return;
    setDishError(null);
    setDishEditing(null);
    setDishForm({
      name: "",
      price: "",
      category: "",
      description: "",
      image_url: "",
    });
  }

  function openEditDish(it: AnyRow) {
    setDishError(null);
    setDishEditing(it);

    const img = getMenuImageUrl(it);
    setDishForm({
      name: getMenuName(it) ?? "",
      price: String(getMenuPrice(it) ?? ""),
      category: getMenuCategory(it) ?? "",
      description: it?.description ?? it?.details ?? "",
      image_url: img,
      _raw: it,
    });
  }

  function closeDishModal() {
    setDishEditing(null);
    setDishForm({});
    setDishError(null);
    setDishSaving(false);
  }

  async function saveDish() {
    if (!viewing?.id) return;

    const rid = viewing.id;
    setDishSaving(true);
    setDishError(null);

    try {
      const payload: AnyRow = {};

      payload.restaurant_id = rid;

      payload.name = String(dishForm?.name ?? "").trim();
      if (!payload.name) {
        setDishError("Dish name is required.");
        setDishSaving(false);
        return;
      }

      const p = safeNumber(dishForm?.price);
      if (p !== "") payload.price = p;

      const cat = String(dishForm?.category ?? "").trim();
      if (cat) payload.category = cat;

      const desc = String(dishForm?.description ?? "").trim();
      if (desc) payload.description = desc;

      const img = String(dishForm?.image_url ?? "").trim();
      if (img) payload.image_url = img;

      if (dishEditing?.id) {
        const id = dishEditing.id;

        const existingKeys = new Set(Object.keys(dishEditing || {}));
        const updatePayload: AnyRow = {};

        for (const k of Object.keys(payload)) {
          if (k === "restaurant_id") continue;
          if (
            existingKeys.has(k) ||
            k === "name" ||
            k === "price" ||
            k === "category" ||
            k === "description" ||
            k === "image_url"
          ) {
            updatePayload[k] = payload[k];
          }
        }

        const { error } = await supabase.from("menu_items").update(updatePayload).eq("id", id);
        if (error) {
          setDishError(`Save failed: ${error.message || "Unknown error"}`);
          setDishSaving(false);
          return;
        }

        setMenuItems((prev) => prev.map((x) => (String(x.id) === String(id) ? { ...x, ...updatePayload } : x)));
        closeDishModal();
        return;
      } else {
        const { data, error } = await supabase.from("menu_items").insert([payload]).select("*").maybeSingle();
        if (error) {
          setDishError(`Add failed: ${error.message || "Unknown error"}`);
          setDishSaving(false);
          return;
        }

        if (data) setMenuItems((prev) => [data as AnyRow, ...prev]);
        closeDishModal();
        return;
      }
    } catch (e: any) {
      console.log(e);
      setDishError("Dish save crashed. Open console and share error.");
    } finally {
      setDishSaving(false);
    }
  }

  async function deleteDish(it: AnyRow) {
    const id = it?.id;
    if (!id) return;

    const ok = window.confirm("Delete this dish? This cannot be undone.");
    if (!ok) return;

    try {
      const { error } = await supabase.from("menu_items").delete().eq("id", id);
      if (error) {
        setMenuError(`Delete failed: ${error.message || "Unknown error"}`);
        return;
      }
      setMenuItems((prev) => prev.filter((x) => String(x.id) !== String(id)));
    } catch (e: any) {
      console.log(e);
      setMenuError("Delete crashed. Open console and share error.");
    }
  }

  async function toggleDishAvailable(it: AnyRow) {
    const id = it?.id;
    if (!id) return;

    const { key, value } = inferMenuAvailable(it);
    if (!key || value === null) {
      setMenuError("No availability column found on menu_items (try is_available / available / in_stock / is_active).");
      return;
    }

    const next = !value;

    try {
      const { error } = await supabase.from("menu_items").update({ [key]: next }).eq("id", id);
      if (error) {
        setMenuError(`Update failed: ${error.message || "Unknown error"}`);
        return;
      }
      setMenuItems((prev) => prev.map((x) => (String(x.id) === String(id) ? { ...x, [key]: next } : x)));
    } catch (e: any) {
      console.log(e);
      setMenuError("Availability update crashed. Open console and share error.");
    }
  }

  const headerRow: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1.2fr 1fr 0.9fr 0.9fr 0.9fr 1.1fr 1.3fr",
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
    gridTemplateColumns: "1.2fr 1fr 0.9fr 0.9fr 0.9fr 1.1fr 1.3fr",
    gap: 10,
    padding: "12px 12px",
    borderRadius: 14,
    background: "#FFFFFF",
    border: "1px solid rgba(15, 23, 42, 0.08)",
    boxShadow: "0 12px 26px rgba(15, 23, 42, 0.05)",
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
          <div style={{ fontSize: 24, fontWeight: 950, letterSpacing: -0.2 }}>Restaurants</div>
          <div style={{ fontSize: 13, color: styles.muted, marginTop: 6, fontWeight: 700 }}>
            View, search, approve/reject, enable/disable, edit info, and force close — now with menu + orders + realtime.
          </div>
        </div>

        <button onClick={loadRestaurants} style={styles.btnPrimary} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 12, marginTop: 14 }}>
        <div style={styles.card}>
          <div style={{ fontSize: 12, color: styles.muted, fontWeight: 900 }}>Total (filtered)</div>
          <div style={{ fontSize: 28, fontWeight: 950, marginTop: 6 }}>{stats.total}</div>
        </div>
        <div style={styles.card}>
          <div style={{ fontSize: 12, color: styles.muted, fontWeight: 900 }}>Pending</div>
          <div style={{ fontSize: 28, fontWeight: 950, marginTop: 6 }}>{stats.pending}</div>
        </div>
        <div style={styles.card}>
          <div style={{ fontSize: 12, color: styles.muted, fontWeight: 900 }}>Approved</div>
          <div style={{ fontSize: 28, fontWeight: 950, marginTop: 6 }}>{stats.approved}</div>
        </div>
        <div style={styles.card}>
          <div style={{ fontSize: 12, color: styles.muted, fontWeight: 900 }}>Rejected</div>
          <div style={{ fontSize: 28, fontWeight: 950, marginTop: 6 }}>{stats.rejected}</div>
        </div>
        <div style={styles.card}>
          <div style={{ fontSize: 12, color: styles.muted, fontWeight: 900 }}>Enabled</div>
          <div style={{ fontSize: 28, fontWeight: 950, marginTop: 6 }}>{stats.enabled}</div>
        </div>
        <div style={styles.card}>
          <div style={{ fontSize: 12, color: styles.muted, fontWeight: 900 }}>Disabled</div>
          <div style={{ fontSize: 28, fontWeight: 950, marginTop: 6 }}>{stats.disabled}</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ ...styles.card, marginTop: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 950, letterSpacing: -0.1 }}>Filters</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: 10, marginTop: 10 }}>
          <div>
            <div style={{ fontSize: 12, color: styles.muted, marginBottom: 6, fontWeight: 900 }}>Approval</div>
            <select value={approvalFilter} onChange={(e) => setApprovalFilter(e.target.value)} style={{ ...styles.input, paddingRight: 34 }}>
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          <div>
            <div style={{ fontSize: 12, color: styles.muted, marginBottom: 6, fontWeight: 900 }}>Enabled</div>
            <select value={enabledFilter} onChange={(e) => setEnabledFilter(e.target.value)} style={{ ...styles.input, paddingRight: 34 }}>
              <option value="">All</option>
              <option value="enabled">Enabled</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>

          <div>
            <div style={{ fontSize: 12, color: styles.muted, marginBottom: 6, fontWeight: 900 }}>Search</div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name / phone / address / city / owner email / RST code…"
              style={styles.input}
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
          <button
            style={styles.btn}
            onClick={() => {
              setApprovalFilter("");
              setEnabledFilter("");
              setSearch("");
            }}
          >
            Clear
          </button>
        </div>
      </div>

      {/* Error */}
      {error ? (
        <div style={{ ...styles.card, marginTop: 12, border: "1px solid rgba(255,0,90,0.25)", background: "rgba(255,0,90,0.06)" }}>
          <div style={{ fontWeight: 950 }}>Error</div>
          <div style={{ marginTop: 6, fontSize: 13, opacity: 0.95 }}>{error}</div>
          <div style={{ marginTop: 8, fontSize: 12, color: styles.muted, fontWeight: 700 }}>
            If it says “permission denied / RLS”, we must add admin policies for restaurants / menu_items / orders.
          </div>
        </div>
      ) : null}

      {/* Table */}
      <div style={{ marginTop: 12 }}>
        <div style={headerRow}>
          <div>Restaurant</div>
          <div>Owner</div>
          <div>Approval</div>
          <div>Enabled</div>
          <div>Accepting</div>
          <div>Contact</div>
          <div>Actions</div>
        </div>

        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
          {loading ? (
            <div style={styles.card}>Loading restaurants…</div>
          ) : filtered.length === 0 ? (
            <div style={styles.card}>No restaurants found.</div>
          ) : (
            filtered.map((r) => {
              const id = r?.id ?? "-";
              const code = getPublicCode(r);
              const name = r?.name ?? "(no name)";
              const approval = normalize(inferApprovalState(r));
              const enabled = normalize(inferEnabledState(r));

              const ownerKey = getOwnerKey(r);
              const ownerId = ownerKey ? String(r?.[ownerKey] ?? "") : "";
              const owner = ownersById[ownerId] || r?.profiles || null;

              const ownerLabel = owner ? owner?.full_name || owner?.name || owner?.email || ownerId || "-" : ownerId || "-";

              const phone = r?.phone ?? "-";
              const address = r?.address ?? r?.address_line1 ?? "";
              const accepting =
                typeof r?.accepting_orders === "boolean" ? r.accepting_orders : typeof r?.is_open === "boolean" ? r.is_open : null;

              return (
                <div key={String(id)} style={{ ...rowStyle, cursor: "pointer" }} onClick={() => openView(r)} title="Click to view details + menu">
                  <div style={{ fontWeight: 950 }}>
                    {clampText(name, 34)}
                    <div style={{ fontSize: 12, color: styles.muted, marginTop: 2, fontWeight: 800 }}>
                      {code} <span style={{ opacity: 0.7, fontWeight: 700 }}>•</span>{" "}
                      {address ? clampText(address, 44) : "—"}
                    </div>
                  </div>

                  <div style={{ opacity: 0.98 }}>
                    <div style={{ fontWeight: 950 }}>{clampText(ownerLabel, 34)}</div>
                    {owner?.email ? (
                      <div style={{ fontSize: 12, color: styles.muted, marginTop: 2, fontWeight: 700 }}>{clampText(owner.email, 40)}</div>
                    ) : null}
                  </div>

                  <div>
                    <span
                      style={styles.badge(
                        approval === "approved" ? "approved" : approval === "rejected" ? "rejected" : approval === "pending" ? "pending" : "unknown"
                      )}
                    >
                      {approval || "unknown"}
                    </span>
                  </div>

                  <div>
                    <span style={styles.badge(enabled === "enabled" ? "enabled" : enabled === "disabled" ? "disabled" : "unknown")}>
                      {enabled || "unknown"}
                    </span>
                  </div>

                  <div style={{ fontWeight: 950, opacity: 0.95 }}>{accepting === null ? "—" : accepting ? "YES" : "NO"}</div>

                  <div style={{ opacity: 0.95 }}>
                    <div style={{ fontWeight: 950 }}>{clampText(phone, 18)}</div>
                    {r?.city ? (
                      <div style={{ fontSize: 12, color: styles.muted, marginTop: 2, fontWeight: 700 }}>{clampText(r.city, 20)}</div>
                    ) : null}
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} onClick={(e) => e.stopPropagation()}>
                    <button style={styles.btn} disabled={busyId === id} onClick={() => openView(r)}>
                      View
                    </button>

                    <button style={styles.btn} disabled={busyId === id} onClick={() => openEdit(r)}>
                      Edit
                    </button>

                    <button style={styles.btn} disabled={busyId === id} onClick={() => forceClose(r)} title="Force close (accepting_orders OFF)">
                      Force close
                    </button>

                    <button style={styles.btn} disabled={busyId === id} onClick={() => approve(r)} title="Approve + Enable + Accepting ON">
                      Approve
                    </button>

                    <button style={styles.btn} disabled={busyId === id} onClick={() => reject(r)} title="Reject + Disable + Force close">
                      Reject
                    </button>

                    {enabled === "disabled" ? (
                      <button style={styles.btnPrimary} disabled={busyId === id} onClick={() => enableRow(r)}>
                        Enable
                      </button>
                    ) : (
                      <button style={styles.btn} disabled={busyId === id} onClick={() => disableRow(r)}>
                        Disable
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ✅ PRO: VIEW MODAL */}
      {viewing ? (
        <div style={styles.modalOverlay} onClick={() => setViewing(null)}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            {(() => {
              const id = viewing?.id ?? "-";
              const code = getPublicCode(viewing);
              const name = viewing?.name ?? "(no name)";
              const approval = normalize(inferApprovalState(viewing));
              const enabled = normalize(inferEnabledState(viewing));
              const accepting =
                typeof viewing?.accepting_orders === "boolean" ? viewing.accepting_orders : typeof viewing?.is_open === "boolean" ? viewing.is_open : null;

              const ownerKey = getOwnerKey(viewing);
              const ownerId = ownerKey ? String(viewing?.[ownerKey] ?? "") : "";
              const owner = ownersById[ownerId] || viewing?.profiles || null;
              const ownerLabel = owner ? owner?.full_name || owner?.name || owner?.email || ownerId || "-" : ownerId || "-";

              const dishesCount = menuItems.length;

              return (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 950, letterSpacing: -0.2 }}>{name}</div>

                      <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                        <span
                          style={{
                            padding: "6px 10px",
                            borderRadius: 999,
                            border: "1px solid rgba(15,23,42,0.10)",
                            background: "rgba(15,23,42,0.03)",
                            fontWeight: 950,
                            fontSize: 12,
                          }}
                        >
                          {code}
                        </span>

                        <button
                          style={styles.btn}
                          onClick={async () => {
                            const ok = await copyToClipboard(code);
                            if (ok) alert("Copied ✅");
                          }}
                        >
                          Copy code
                        </button>

                        <span
                          style={styles.badge(
                            approval === "approved" ? "approved" : approval === "rejected" ? "rejected" : approval === "pending" ? "pending" : "unknown"
                          )}
                        >
                          {approval || "unknown"}
                        </span>
                        <span style={styles.badge(enabled === "enabled" ? "enabled" : enabled === "disabled" ? "disabled" : "unknown")}>
                          {enabled || "unknown"}
                        </span>
                        <span style={{ ...styles.badge("unknown"), background: "rgba(15,23,42,0.03)" }}>
                          Accepting: <b style={{ marginLeft: 6 }}>{accepting === null ? "—" : accepting ? "YES" : "NO"}</b>
                        </span>
                      </div>

                      <div style={{ marginTop: 10, fontSize: 13, color: styles.muted, fontWeight: 700 }}>
                        Owner: <span style={{ color: styles.pageText }}>{clampText(ownerLabel, 60)}</span>
                        {owner?.email ? <span style={{ marginLeft: 10 }}>• {clampText(owner.email, 60)}</span> : null}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <button
                        style={styles.btn}
                        onClick={() => {
                          void loadMenuItems(viewing);
                          void loadOrdersForRestaurant(viewing);
                        }}
                      >
                        Refresh details
                      </button>
                      <button style={styles.btn} onClick={() => openEdit(viewing)}>
                        Edit restaurant
                      </button>
                      <button style={styles.btnPrimary} onClick={() => setViewing(null)}>
                        Close
                      </button>
                    </div>
                  </div>

                  {/* Tabs */}
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
                    <button style={viewTab === "overview" ? styles.btnPrimary : styles.btn} onClick={() => setViewTab("overview")}>
                      Overview
                    </button>
                    <button style={viewTab === "menu" ? styles.btnPrimary : styles.btn} onClick={() => setViewTab("menu")}>
                      Menu / Dishes
                    </button>
                    <button style={viewTab === "orders" ? styles.btnPrimary : styles.btn} onClick={() => setViewTab("orders")}>
                      Orders
                    </button>
                  </div>

                  {/* Tab content */}
                  {viewTab === "overview" ? (
                    <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 12 }}>
                      <div style={{ ...styles.card, gridColumn: "span 7" }}>
                        <div style={{ fontSize: 13, fontWeight: 950 }}>Restaurant Profile</div>
                        <div style={{ marginTop: 10, fontSize: 13, opacity: 0.95, lineHeight: 1.7 }}>
                          <div>
                            <b>Public Code:</b> {code}
                          </div>
                          <div>
                            <b>Phone:</b> {String(viewing?.phone ?? "—")}
                          </div>
                          <div>
                            <b>City:</b> {String(viewing?.city ?? "—")}
                          </div>
                          <div>
                            <b>Address:</b> {String(viewing?.address ?? viewing?.address_line1 ?? "—")}
                          </div>
                          <div>
                            <b>Timings:</b> {String(viewing?.timings ?? viewing?.hours ?? "—")}
                          </div>
                          <div>
                            <b>Min order:</b> {String(viewing?.min_order ?? viewing?.min_order_amount ?? "—")}
                          </div>
                          <div>
                            <b>Created:</b> {formatDateTime(viewing?.created_at)}
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
                          <button style={styles.btn} onClick={() => forceClose(viewing)}>
                            Force close
                          </button>
                          <button style={styles.btn} onClick={() => approve(viewing)} title="Approve + Enable + Accepting ON">
                            Approve
                          </button>
                          <button style={styles.btn} onClick={() => reject(viewing)} title="Reject + Disable + Force close">
                            Reject
                          </button>
                          {enabled === "disabled" ? (
                            <button style={styles.btnPrimary} onClick={() => enableRow(viewing)}>
                              Enable
                            </button>
                          ) : (
                            <button style={styles.btn} onClick={() => disableRow(viewing)}>
                              Disable
                            </button>
                          )}
                        </div>
                      </div>

                      <div style={{ ...styles.card, gridColumn: "span 5" }}>
                        <div style={{ fontSize: 13, fontWeight: 950 }}>Quick Stats</div>

                        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                          <div
                            style={{
                              padding: 12,
                              borderRadius: 16,
                              border: "1px solid rgba(15,23,42,0.10)",
                              background: "rgba(15,23,42,0.03)",
                            }}
                          >
                            <div style={{ fontSize: 12, color: styles.muted, fontWeight: 900 }}>Dishes</div>
                            <div style={{ fontSize: 20, fontWeight: 950, marginTop: 6 }}>{dishesCount}</div>
                          </div>
                          <div
                            style={{
                              padding: 12,
                              borderRadius: 16,
                              border: "1px solid rgba(15,23,42,0.10)",
                              background: "rgba(15,23,42,0.03)",
                            }}
                          >
                            <div style={{ fontSize: 12, color: styles.muted, fontWeight: 900 }}>Orders (recent)</div>
                            <div style={{ fontSize: 20, fontWeight: 950, marginTop: 6 }}>{ordersStats.totalOrders}</div>
                          </div>
                          <div
                            style={{
                              padding: 12,
                              borderRadius: 16,
                              border: "1px solid rgba(15,23,42,0.10)",
                              background: "rgba(15,23,42,0.03)",
                            }}
                          >
                            <div style={{ fontSize: 12, color: styles.muted, fontWeight: 900 }}>Revenue (recent)</div>
                            <div style={{ fontSize: 20, fontWeight: 950, marginTop: 6 }}>{formatMoney(ordersStats.revenue)}</div>
                          </div>
                          <div
                            style={{
                              padding: 12,
                              borderRadius: 16,
                              border: "1px solid rgba(15,23,42,0.10)",
                              background: "rgba(15,23,42,0.03)",
                            }}
                          >
                            <div style={{ fontSize: 12, color: styles.muted, fontWeight: 900 }}>Accepting</div>
                            <div style={{ fontSize: 20, fontWeight: 950, marginTop: 6 }}>
                              {accepting === null ? "—" : accepting ? "YES" : "NO"}
                            </div>
                          </div>
                        </div>

                        <div style={{ marginTop: 12, fontSize: 12, color: styles.muted, fontWeight: 700, lineHeight: 1.5 }}>
                          Tip: If menu is empty, it means this restaurant has no rows in <b>menu_items</b> for this restaurant_id.
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {viewTab === "menu" ? (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                        <div style={{ flex: 1, minWidth: 240 }}>
                          <div style={{ fontSize: 12, color: styles.muted, marginBottom: 6, fontWeight: 900 }}>Search dishes</div>
                          <input
                            value={menuSearch}
                            onChange={(e) => setMenuSearch(e.target.value)}
                            placeholder="Search dish by name/category/desc..."
                            style={styles.input}
                          />
                        </div>

                        <div style={{ minWidth: 220 }}>
                          <div style={{ fontSize: 12, color: styles.muted, marginBottom: 6, fontWeight: 900 }}>Category</div>
                          <select value={menuCategoryFilter} onChange={(e) => setMenuCategoryFilter(e.target.value)} style={{ ...styles.input, paddingRight: 34 }}>
                            <option value="">All</option>
                            {menuCategories.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                          <button
                            style={styles.btn}
                            onClick={() => {
                              setMenuSearch("");
                              setMenuCategoryFilter("");
                            }}
                          >
                            Clear
                          </button>
                          <button style={styles.btnPrimary} onClick={openAddDish}>
                            + Add Dish
                          </button>
                        </div>
                      </div>

                      {menuError ? (
                        <div style={{ ...styles.card, marginTop: 12, border: "1px solid rgba(255,0,90,0.18)", background: "rgba(255,0,90,0.05)" }}>
                          <div style={{ fontWeight: 950 }}>Menu Error</div>
                          <div style={{ marginTop: 6, fontSize: 13, opacity: 0.95 }}>{menuError}</div>
                        </div>
                      ) : null}

                      <div style={{ marginTop: 12 }}>
                        {menuLoading ? (
                          <div style={styles.card}>Loading menu items…</div>
                        ) : filteredMenuItems.length === 0 ? (
                          <div style={styles.card}>No dishes found for this restaurant.</div>
                        ) : (
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 12 }}>
                            {filteredMenuItems.map((it) => {
                              const img = getMenuImageUrl(it);
                              const name = String(getMenuName(it));
                              const price = getMenuPrice(it);
                              const cat = String(getMenuCategory(it) || "—");
                              const desc = String(it?.description ?? it?.details ?? "");
                              const { key: availKey, value: availVal } = inferMenuAvailable(it);

                              return (
                                <div
                                  key={String(it?.id ?? Math.random())}
                                  style={{
                                    gridColumn: "span 6",
                                    borderRadius: 18,
                                    border: "1px solid rgba(15,23,42,0.10)",
                                    background: "#fff",
                                    boxShadow: "0 12px 26px rgba(15,23,42,0.06)",
                                    overflow: "hidden",
                                    display: "flex",
                                    gap: 12,
                                  }}
                                >
                                  <div
                                    style={{
                                      width: 120,
                                      height: 120,
                                      background: "rgba(15,23,42,0.04)",
                                      flex: "0 0 auto",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                    }}
                                  >
                                    {img ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img src={img} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                    ) : (
                                      <div style={{ fontSize: 12, color: styles.muted, fontWeight: 900 }}>No Image</div>
                                    )}
                                  </div>

                                  <div style={{ flex: 1, padding: 12 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                                      <div style={{ fontWeight: 950, fontSize: 14 }}>{clampText(name, 48)}</div>
                                      <div style={{ fontWeight: 950 }}>{formatMoney(price)}</div>
                                    </div>

                                    <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                      <span style={{ ...styles.badge("unknown"), background: "rgba(15,23,42,0.03)" }}>{cat}</span>
                                      {availKey ? (
                                        <span style={{ ...styles.badge(availVal ? "enabled" : "disabled") }}>
                                          {availVal ? "AVAILABLE" : "OFF"}
                                        </span>
                                      ) : (
                                        <span style={{ ...styles.badge("unknown") }}>availability: n/a</span>
                                      )}
                                    </div>

                                    {desc ? (
                                      <div style={{ marginTop: 6, fontSize: 12, color: styles.muted, fontWeight: 700, lineHeight: 1.4 }}>
                                        {clampText(desc, 110)}
                                      </div>
                                    ) : null}

                                    <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                                      {availKey ? (
                                        <button style={styles.btn} onClick={() => toggleDishAvailable(it)}>
                                          {availVal ? "Mark OFF" : "Mark ON"}
                                        </button>
                                      ) : null}
                                      <button style={styles.btn} onClick={() => openEditDish(it)}>
                                        Edit
                                      </button>
                                      <button style={styles.btnDanger} onClick={() => deleteDish(it)}>
                                        Delete
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}

                  {viewTab === "orders" ? (
                    <div style={{ marginTop: 12 }}>
                      {ordersError ? (
                        <div style={{ ...styles.card, border: "1px solid rgba(255,0,90,0.18)", background: "rgba(255,0,90,0.05)" }}>
                          <div style={{ fontWeight: 950 }}>Orders Error</div>
                          <div style={{ marginTop: 6, fontSize: 13, opacity: 0.95 }}>{ordersError}</div>
                        </div>
                      ) : null}

                      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
                        <div style={{ ...styles.card, flex: 1, minWidth: 260 }}>
                          <div style={{ fontSize: 12, color: styles.muted, fontWeight: 900 }}>Recent orders</div>
                          <div style={{ fontSize: 22, fontWeight: 950, marginTop: 6 }}>{ordersStats.totalOrders}</div>
                        </div>
                        <div style={{ ...styles.card, flex: 1, minWidth: 260 }}>
                          <div style={{ fontSize: 12, color: styles.muted, fontWeight: 900 }}>Recent revenue</div>
                          <div style={{ fontSize: 22, fontWeight: 950, marginTop: 6 }}>{formatMoney(ordersStats.revenue)}</div>
                        </div>
                      </div>

                      <div style={{ marginTop: 12 }}>
                        {ordersLoading ? (
                          <div style={styles.card}>Loading orders…</div>
                        ) : recentOrders.length === 0 ? (
                          <div style={styles.card}>No orders found for this restaurant yet.</div>
                        ) : (
                          <div style={{ display: "grid", gap: 10 }}>
                            {recentOrders.slice(0, 20).map((o) => {
                              const oid = o?.id ?? "-";
                              const total = o?.total_amount ?? o?.total ?? o?.grand_total ?? 0;
                              const st = String(o?.status ?? "pending");
                              const created = o?.created_at ?? o?.createdAt ?? o?.created_on;

                              return (
                                <div
                                  key={String(oid)}
                                  style={{
                                    padding: 12,
                                    borderRadius: 16,
                                    border: "1px solid rgba(15,23,42,0.10)",
                                    background: "rgba(255,255,255,0.95)",
                                    boxShadow: "0 10px 22px rgba(15,23,42,0.05)",
                                    display: "flex",
                                    justifyContent: "space-between",
                                    gap: 12,
                                    flexWrap: "wrap",
                                    alignItems: "center",
                                  }}
                                >
                                  <div style={{ fontWeight: 950 }}>
                                    Order #{clampText(oid, 28)}
                                    <div style={{ marginTop: 4, fontSize: 12, color: styles.muted, fontWeight: 700 }}>{formatDateTime(created)}</div>
                                  </div>

                                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                                    <span style={{ ...styles.badge("unknown"), background: "rgba(15,23,42,0.03)" }}>{normalize(st)}</span>
                                    <div style={{ fontWeight: 950 }}>{formatMoney(total)}</div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}

                  {/* ✅ Nice Debug (collapsed) */}
                  <div style={{ ...styles.card, marginTop: 12, background: "rgba(15, 23, 42, 0.02)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <div style={{ fontSize: 13, fontWeight: 950 }}>Developer tools</div>
                      <button style={styles.btn} onClick={() => setShowDebug((p) => !p)}>
                        {showDebug ? "Hide debug" : "Show debug"}
                      </button>
                    </div>

                    {showDebug ? (
                      <pre
                        style={{
                          marginTop: 10,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                          fontSize: 12,
                          opacity: 0.9,
                          color: styles.pageText,
                          padding: 12,
                          borderRadius: 16,
                          border: "1px solid rgba(15,23,42,0.10)",
                          background: "rgba(255,255,255,0.9)",
                        }}
                      >
{JSON.stringify(viewing, null, 2)}
                      </pre>
                    ) : (
                      <div style={{ marginTop: 8, fontSize: 12, color: styles.muted, fontWeight: 700 }}>
                        Debug is hidden to keep UI clean.
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      ) : null}

      {/* ✅ OLD: Edit Modal (unchanged logic, premium theme kept) */}
      {editing ? (
        <div style={modalOverlay} onClick={() => setEditing(null)}>
          <div style={modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 950, letterSpacing: -0.2 }}>Edit Restaurant</div>
                <div style={{ fontSize: 13, color: styles.muted, marginTop: 4, fontWeight: 700 }}>
                  {getPublicCode(editing)} • #{String(editing?.id ?? "")}
                </div>
              </div>

              <button style={styles.btn} onClick={() => setEditing(null)}>
                Close
              </button>
            </div>

            {editError ? (
              <div style={{ ...styles.card, marginTop: 12, border: "1px solid rgba(255,0,90,0.25)", background: "rgba(255,0,90,0.06)" }}>
                <div style={{ fontWeight: 950 }}>Error</div>
                <div style={{ marginTop: 6, fontSize: 13, opacity: 0.95 }}>{editError}</div>
              </div>
            ) : null}

            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: styles.muted, marginBottom: 6, fontWeight: 900 }}>Name</div>
                <input value={editForm.name ?? ""} onChange={(e) => setEditForm((p: AnyRow) => ({ ...p, name: e.target.value }))} style={styles.input} />
              </div>

              <div>
                <div style={{ fontSize: 12, color: styles.muted, marginBottom: 6, fontWeight: 900 }}>Phone</div>
                <input value={editForm.phone ?? ""} onChange={(e) => setEditForm((p: AnyRow) => ({ ...p, phone: e.target.value }))} style={styles.input} />
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <div style={{ fontSize: 12, color: styles.muted, marginBottom: 6, fontWeight: 900 }}>Address</div>
                <input value={editForm.address ?? ""} onChange={(e) => setEditForm((p: AnyRow) => ({ ...p, address: e.target.value }))} style={styles.input} />
              </div>

              <div>
                <div style={{ fontSize: 12, color: styles.muted, marginBottom: 6, fontWeight: 900 }}>City</div>
                <input value={editForm.city ?? ""} onChange={(e) => setEditForm((p: AnyRow) => ({ ...p, city: e.target.value }))} style={styles.input} />
              </div>

              <div>
                <div style={{ fontSize: 12, color: styles.muted, marginBottom: 6, fontWeight: 900 }}>Min Order</div>
                <input value={String(editForm.min_order ?? "")} onChange={(e) => setEditForm((p: AnyRow) => ({ ...p, min_order: e.target.value }))} style={styles.input} placeholder="e.g. 199" />
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <div style={{ fontSize: 12, color: styles.muted, marginBottom: 6, fontWeight: 900 }}>Timings</div>
                <input value={editForm.timings ?? ""} onChange={(e) => setEditForm((p: AnyRow) => ({ ...p, timings: e.target.value }))} style={styles.input} placeholder="e.g. 10:00 AM - 11:00 PM" />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
                <input type="checkbox" checked={!!editForm.accepting_orders} onChange={(e) => setEditForm((p: AnyRow) => ({ ...p, accepting_orders: e.target.checked }))} />
                <div style={{ fontSize: 13, fontWeight: 950 }}>Accepting orders</div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
              <button style={styles.btnPrimary} onClick={saveEdit} disabled={busyId === editing?.id}>
                Save
              </button>

              <button style={styles.btn} onClick={() => setEditing(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ✅ PRO: Dish Add/Edit Modal */}
      {(dishEditing !== null || (dishEditing === null && Object.keys(dishForm || {}).length > 0)) && viewing ? (
        <div style={styles.modalOverlay} onClick={closeDishModal}>
          <div style={{ ...styles.modalCard, width: "min(840px, 100%)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 950 }}>{dishEditing?.id ? "Edit Dish" : "Add Dish"}</div>
                <div style={{ fontSize: 13, color: styles.muted, marginTop: 4, fontWeight: 700 }}>
                  Restaurant: {String(viewing?.name ?? "")} ({getPublicCode(viewing)})
                </div>
              </div>

              <button style={styles.btn} onClick={closeDishModal}>
                Close
              </button>
            </div>

            {dishError ? (
              <div style={{ ...styles.card, marginTop: 12, border: "1px solid rgba(255,0,90,0.18)", background: "rgba(255,0,90,0.05)" }}>
                <div style={{ fontWeight: 950 }}>Error</div>
                <div style={{ marginTop: 6, fontSize: 13, opacity: 0.95 }}>{dishError}</div>
              </div>
            ) : null}

            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <div style={{ fontSize: 12, color: styles.muted, marginBottom: 6, fontWeight: 900 }}>Dish name *</div>
                <input value={dishForm?.name ?? ""} onChange={(e) => setDishForm((p: AnyRow) => ({ ...p, name: e.target.value }))} style={styles.input} placeholder="e.g. Butter Chicken" />
              </div>

              <div>
                <div style={{ fontSize: 12, color: styles.muted, marginBottom: 6, fontWeight: 900 }}>Price</div>
                <input value={dishForm?.price ?? ""} onChange={(e) => setDishForm((p: AnyRow) => ({ ...p, price: e.target.value }))} style={styles.input} placeholder="e.g. 299" />
              </div>

              <div>
                <div style={{ fontSize: 12, color: styles.muted, marginBottom: 6, fontWeight: 900 }}>Category</div>
                <input value={dishForm?.category ?? ""} onChange={(e) => setDishForm((p: AnyRow) => ({ ...p, category: e.target.value }))} style={styles.input} placeholder="e.g. Main Course" />
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <div style={{ fontSize: 12, color: styles.muted, marginBottom: 6, fontWeight: 900 }}>Image URL</div>
                <input value={dishForm?.image_url ?? ""} onChange={(e) => setDishForm((p: AnyRow) => ({ ...p, image_url: e.target.value }))} style={styles.input} placeholder="https://..." />
                {dishForm?.image_url ? (
                  <div style={{ marginTop: 10, borderRadius: 16, overflow: "hidden", border: "1px solid rgba(15,23,42,0.10)" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={String(dishForm.image_url)} alt="preview" style={{ width: "100%", height: 220, objectFit: "cover" }} />
                  </div>
                ) : null}
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <div style={{ fontSize: 12, color: styles.muted, marginBottom: 6, fontWeight: 900 }}>Description</div>
                <textarea value={dishForm?.description ?? ""} onChange={(e) => setDishForm((p: AnyRow) => ({ ...p, description: e.target.value }))} style={{ ...styles.input, minHeight: 90, resize: "vertical" }} placeholder="Short description..." />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
              <button style={styles.btnPrimary} onClick={saveDish} disabled={dishSaving}>
                {dishSaving ? "Saving…" : "Save"}
              </button>
              <button style={styles.btn} onClick={closeDishModal} disabled={dishSaving}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
