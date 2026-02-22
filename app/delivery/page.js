"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import supabase from "@/lib/supabase";

// NOTE:
// - Restaurant orders table: orders
// - Grocery orders table: grocery_orders
// - Optional grocery items table: grocery_order_items (not required here; owner page already shows items)
// - Optional store table: grocery_stores (for pickup lat/lng, store name)
// - We unify both sources into ONE delivery dashboard list with a `_source` field.

const DELIVERY_FEE = 40;

function normalizeRole(r) {
  return String(r || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function normalizeDeliveryStatus(s) {
  const x = String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (!x) return "pending";
  if (x === "approve") return "approved";
  if (x === "approved") return "approved";
  if (x === "reject" || x === "rejected") return "rejected";
  if (x === "disable" || x === "disabled") return "disabled";
  if (x === "pending") return "pending";
  return x;
}

function deliveryGateReason(status) {
  const s = normalizeDeliveryStatus(status);
  if (s === "approved") return "";
  if (s === "disabled")
    return "Your delivery account is DISABLED by admin. You cannot go online or accept orders.";
  if (s === "rejected")
    return "Your delivery account is REJECTED by admin. You cannot go online or accept orders.";
  return "Your delivery account is PENDING approval. You cannot go online or accept orders yet.";
}

function pick(obj, keys, fallback = "-") {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null && String(obj[k]).trim() !== "") return obj[k];
  }
  return fallback;
}

function formatWhen(d) {
  try {
    return new Date(d).toLocaleString();
  } catch {
    return d || "-";
  }
}

function safeDate(d) {
  try {
    const x = new Date(d);
    if (isNaN(x.getTime())) return null;
    return x;
  } catch {
    return null;
  }
}

function nnum(v, fallback = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

function statusBadge(status) {
  const s = String(status || "").toLowerCase();
  if (s === "ready") return { bg: "rgba(236,253,245,0.95)", border: "rgba(16,185,129,0.22)", text: "#065f46" };
  if (s === "delivering") return { bg: "rgba(239,246,255,0.95)", border: "rgba(59,130,246,0.22)", text: "#1e40af" };
  if (s === "picked_up") return { bg: "rgba(255,247,237,0.95)", border: "rgba(249,115,22,0.22)", text: "#9a3412" };
  if (s === "on_the_way") return { bg: "rgba(254,243,199,0.95)", border: "rgba(245,158,11,0.28)", text: "#92400e" };
  if (s === "delivered") return { bg: "rgba(236,253,245,0.95)", border: "rgba(16,185,129,0.22)", text: "#065f46" };
  if (s === "rejected") return { bg: "rgba(254,242,242,0.95)", border: "rgba(239,68,68,0.25)", text: "#7f1d1d" };
  return { bg: "rgba(255,255,255,0.85)", border: "rgba(0,0,0,0.12)", text: "#0b1220" };
}

/* =========================
   Earnings helpers
   ========================= */

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function startOfWeekMonday(d) {
  const x = startOfDay(d);
  const day = x.getDay();
  const diffToMonday = (day + 6) % 7;
  x.setDate(x.getDate() - diffToMonday);
  return x;
}

function shortDayLabel(d) {
  try {
    return d.toLocaleDateString(undefined, { weekday: "short" });
  } catch {
    return "Day";
  }
}

function dayNumLabel(d) {
  try {
    const dd = d.getDate();
    const mm = d.toLocaleDateString(undefined, { month: "short" });
    return `${dd} ${mm}`;
  } catch {
    return "Date";
  }
}

function monthStart(d) {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
}

function toISOKey(d) {
  return startOfDay(d).toISOString().slice(0, 10);
}

function buildGoogleMapsUrl(address) {
  const q = encodeURIComponent(String(address || "").trim());
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

function buildGoogleMapsUrlLatLng(lat, lng) {
  const la = Number(lat);
  const ln = Number(lng);
  if (!isFinite(la) || !isFinite(ln)) return "";
  return `https://www.google.com/maps/search/?api=1&query=${la},${ln}`;
}

function buildGoogleMapsDirectionsUrl(originLat, originLng, destLat, destLng) {
  const ola = Number(originLat);
  const oln = Number(originLng);
  const dla = Number(destLat);
  const dln = Number(destLng);
  if (![ola, oln, dla, dln].every((x) => isFinite(x))) return "";
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
    `${ola},${oln}`
  )}&destination=${encodeURIComponent(`${dla},${dln}`)}&travelmode=driving`;
}

async function copyText(txt) {
  try {
    await navigator.clipboard.writeText(String(txt || ""));
    return true;
  } catch {
    return false;
  }
}

function downloadCSV(rows, filename = "export.csv") {
  try {
    if (!rows || rows.length === 0) return;

    const headers = Object.keys(rows[0]);
    const escape = (v) => {
      const s = String(v ?? "");
      if (s.includes('"') || s.includes(",") || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };

    const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
  } catch {
    // ignore
  }
}

/* =========================
   Address helper
   ========================= */
function buildFullAddress(o) {
  const a1 = pick(o, ["address_line1"], "");
  const a2 = pick(o, ["address_line2"], "");
  const lm = pick(o, ["landmark"], "");

  const parts = [a1, a2, lm]
    .map((x) => String(x || "").trim())
    .filter((x) => x && x !== "-");

  const joined = parts.join(", ");
  if (joined) return joined;

  const old = pick(o, ["customer_address", "address", "delivery_address"], "-");
  return old;
}

/* =========================
   ✅ Unified source tagging
   ========================= */
function tagSource(rows, source) {
  return (rows || []).map((r) => ({ ...r, _source: source }));
}

export default function DeliveryHomePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState("");

  const [profile, setProfile] = useState(null);
  const [userEmail, setUserEmail] = useState("");
  const [userId, setUserId] = useState("");

  // Unified lists: both restaurant + grocery
  const [availableOrders, setAvailableOrders] = useState([]);
  const [myOrders, setMyOrders] = useState([]);

  const [busyId, setBusyId] = useState("");

  // Premium UI states
  const [chartDays, setChartDays] = useState(7);
  const [tab, setTab] = useState("available"); // available | my | completed
  const [searchText, setSearchText] = useState("");
  const [sortMode, setSortMode] = useState("newest");

  // ✅ NEW: source filter (All / Restaurant / Grocery)
  const [sourceFilter, setSourceFilter] = useState("all"); // all | restaurant | grocery

  // Online/offline stored in DB
  const [isOnline, setIsOnline] = useState(true);
  const [savingOnline, setSavingOnline] = useState(false);

  const [toast, setToast] = useState({ show: false, text: "" });
  const toastTimer = useRef(null);

  // Realtime channels (prevent duplicates)
  const readyRestaurantChannelRef = useRef(null);
  const readyGroceryChannelRef = useRef(null);
  const myRestaurantChannelRef = useRef(null);
  const myGroceryChannelRef = useRef(null);

  const lastAvailableCountRef = useRef(0);

  // Timeline UI (shared)
  const [timelineOpen, setTimelineOpen] = useState({});
  const [timelineLoading, setTimelineLoading] = useState({});
  const [timelineData, setTimelineData] = useState({});
  const [timelineError, setTimelineError] = useState({});

  // Rating UI
  const [ratingBusyId, setRatingBusyId] = useState("");
  const [ratingLocal, setRatingLocal] = useState({});

  // GPS Tracking
  const gpsWatchRef = useRef({});
  const gpsLastSaveRef = useRef({});
  const [gpsState, setGpsState] = useState({});

  // Approval gate
  const [deliveryStatus, setDeliveryStatus] = useState("pending");
  const deliveryAllowed = useMemo(() => normalizeDeliveryStatus(deliveryStatus) === "approved", [deliveryStatus]);
  const deliveryBlockedReason = useMemo(() => deliveryGateReason(deliveryStatus), [deliveryStatus]);

  function showToast(text) {
    try {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      setToast({ show: true, text: String(text || "") });
      toastTimer.current = setTimeout(() => setToast({ show: false, text: "" }), 2600);
    } catch {
      // ignore
    }
  }

  // Payout helpers (works for both tables if columns exist)
  function orderPayout(o) {
    const p = nnum(o?.delivery_payout, NaN);
    if (Number.isFinite(p) && p > 0) return p;

    const fee = nnum(o?.delivery_fee, DELIVERY_FEE);
    const tip = nnum(o?.tip_amount, 0);
    const computed = fee + tip;
    return computed > 0 ? computed : DELIVERY_FEE;
  }

  function orderFee(o) {
    const fee = nnum(o?.delivery_fee, NaN);
    if (Number.isFinite(fee)) return fee;
    return DELIVERY_FEE;
  }

  function orderTip(o) {
    return nnum(o?.tip_amount, 0);
  }

  function earningStatus(o) {
    const s = String(o?.delivery_earning_status || "").toLowerCase();
    if (s === "paid") return "paid";
    if (s === "unpaid") return "unpaid";
    return "unpaid";
  }

  // ✅ IMPORTANT:
  // Restaurant pickup lat/lng normally stored on order as restaurant_lat/restaurant_lng.
  // Grocery pickup lat/lng should come from grocery_stores (if you saved store gps there).
  // If you don't have store lat/lng yet, pickup will show "Not saved" but order still appears.

  async function loadAvailableRestaurant() {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("status", "ready")
      .is("delivery_user_id", null)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return tagSource(data || [], "restaurant");
  }

  async function loadAvailableGrocery() {
    const { data, error } = await supabase
      .from("grocery_orders")
      .select("*")
      .eq("status", "ready")
      .is("delivery_user_id", null)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const rows = tagSource(data || [], "grocery");

    // Enrich with store pickup coords/name (best effort)
    try {
      const storeIds = Array.from(new Set(rows.map((r) => r.store_id).filter(Boolean)));
      if (storeIds.length > 0) {
        const { data: stores, error: sErr } = await supabase
          .from("grocery_stores")
          .select("id, name, store_name, lat, lng, location_lat, location_lng, store_lat, store_lng")
          .in("id", storeIds);

        if (!sErr && stores) {
          const map = {};
          for (const s of stores) map[s.id] = s;

          for (const r of rows) {
            const st = map[r.store_id];
            if (st) {
              r._store_name = pick(st, ["name", "store_name"], "");
              // try multiple column possibilities for gps
              r._pickup_lat = pick(st, ["lat", "location_lat", "store_lat"], null);
              r._pickup_lng = pick(st, ["lng", "location_lng", "store_lng"], null);
            }
          }
        }
      }
    } catch {
      // ignore
    }

    return rows;
  }

  async function loadMyRestaurant() {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("delivery_user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return tagSource(data || [], "restaurant");
  }

  async function loadMyGrocery() {
    const { data, error } = await supabase
      .from("grocery_orders")
      .select("*")
      .eq("delivery_user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const rows = tagSource(data || [], "grocery");

    // Enrich with store pickup coords/name (best effort)
    try {
      const storeIds = Array.from(new Set(rows.map((r) => r.store_id).filter(Boolean)));
      if (storeIds.length > 0) {
        const { data: stores, error: sErr } = await supabase
          .from("grocery_stores")
          .select("id, name, store_name, lat, lng, location_lat, location_lng, store_lat, store_lng")
          .in("id", storeIds);

        if (!sErr && stores) {
          const map = {};
          for (const s of stores) map[s.id] = s;

          for (const r of rows) {
            const st = map[r.store_id];
            if (st) {
              r._store_name = pick(st, ["name", "store_name"], "");
              r._pickup_lat = pick(st, ["lat", "location_lat", "store_lat"], null);
              r._pickup_lng = pick(st, ["lng", "location_lng", "store_lng"], null);
            }
          }
        }
      }
    } catch {
      // ignore
    }

    return rows;
  }

  async function loadAvailable() {
    if (!deliveryAllowed) {
      setAvailableOrders([]);
      return;
    }

    const [r, g] = await Promise.all([loadAvailableRestaurant(), loadAvailableGrocery()]);
    const merged = [...r, ...g].sort((a, b) => {
      const da = safeDate(a.created_at || a.updated_at)?.getTime() || 0;
      const db = safeDate(b.created_at || b.updated_at)?.getTime() || 0;
      return db - da;
    });

    setAvailableOrders(merged);
  }

  async function loadMy() {
    if (!deliveryAllowed) {
      setMyOrders([]);
      return;
    }

    const [r, g] = await Promise.all([loadMyRestaurant(), loadMyGrocery()]);
    const merged = [...r, ...g].sort((a, b) => {
      const da = safeDate(a.created_at || a.updated_at)?.getTime() || 0;
      const db = safeDate(b.created_at || b.updated_at)?.getTime() || 0;
      return db - da;
    });

    setMyOrders(merged);
  }

  function setupRealtime() {
    if (!userId) return;
    if (!deliveryAllowed) return;

    // Restaurant ready
    if (!readyRestaurantChannelRef.current) {
      const ch = supabase
        .channel("delivery_ready_restaurant_orders")
        .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: "status=eq.ready" }, async () => {
          try {
            await loadAvailable();
          } catch {}
        })
        .subscribe();

      readyRestaurantChannelRef.current = ch;
    }

    // Grocery ready
    if (!readyGroceryChannelRef.current) {
      const ch = supabase
        .channel("delivery_ready_grocery_orders")
        .on("postgres_changes", { event: "*", schema: "public", table: "grocery_orders", filter: "status=eq.ready" }, async () => {
          try {
            await loadAvailable();
          } catch {}
        })
        .subscribe();

      readyGroceryChannelRef.current = ch;
    }

    // My restaurant orders
    if (!myRestaurantChannelRef.current) {
      const ch = supabase
        .channel(`delivery_my_restaurant_${userId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "orders", filter: `delivery_user_id=eq.${userId}` },
          async () => {
            try {
              await loadMy();
            } catch {}
          }
        )
        .subscribe();

      myRestaurantChannelRef.current = ch;
    }

    // My grocery orders
    if (!myGroceryChannelRef.current) {
      const ch = supabase
        .channel(`delivery_my_grocery_${userId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "grocery_orders", filter: `delivery_user_id=eq.${userId}` },
          async () => {
            try {
              await loadMy();
            } catch {}
          }
        )
        .subscribe();

      myGroceryChannelRef.current = ch;
    }
  }

  async function saveOnlineToDB(nextValue) {
    if (!userId) return;

    const allowed = deliveryAllowed;
    const finalValue = allowed ? !!nextValue : false;

    setSavingOnline(true);
    try {
      const { error } = await supabase.from("profiles").update({ is_delivery_online: !!finalValue }).eq("user_id", userId);
      if (error) throw error;
      setProfile((p) => ({ ...(p || {}), is_delivery_online: !!finalValue }));
    } catch {
      showToast("Could not save online status");
    } finally {
      setSavingOnline(false);
    }
  }

  async function tryInsertDeliveryEvent({ orderId, eventType, note, lat, lng }) {
    if (!orderId || !userId) return { ok: false, error: "Missing orderId or userId" };
    if (!deliveryAllowed) return { ok: false, error: "Delivery account not approved." };

    const payload = {
      order_id: orderId,
      delivery_user_id: userId,
      event_type: String(eventType || "").trim() || "unknown",
      event_note: note ? String(note) : null,
      lat: lat === undefined ? null : Number(lat),
      lng: lng === undefined ? null : Number(lng),
    };

    const { error } = await supabase.from("delivery_events").insert(payload);
    if (error) return { ok: false, error: error.message || String(error) };
    return { ok: true, error: "" };
  }

  async function loadTimeline(orderId) {
    if (!orderId || !userId) return;
    if (!deliveryAllowed) {
      setTimelineData((m) => ({ ...m, [orderId]: [] }));
      setTimelineError((m) => ({ ...m, [orderId]: "Delivery account not approved." }));
      return;
    }

    setTimelineLoading((m) => ({ ...m, [orderId]: true }));
    setTimelineError((m) => ({ ...m, [orderId]: "" }));

    try {
      const { data, error } = await supabase
        .from("delivery_events")
        .select("*")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setTimelineData((m) => ({ ...m, [orderId]: data || [] }));
    } catch (e) {
      setTimelineError((m) => ({ ...m, [orderId]: e?.message || "Timeline not available" }));
    } finally {
      setTimelineLoading((m) => ({ ...m, [orderId]: false }));
    }
  }

  function setGpsFor(orderId, patch) {
    setGpsState((m) => ({
      ...m,
      [orderId]: {
        on: false,
        lastLat: null,
        lastLng: null,
        lastSavedAt: null,
        err: "",
        saving: false,
        ...(m[orderId] || {}),
        ...(patch || {}),
      },
    }));
  }

  function stopTracking(orderId, silent = false) {
    try {
      const wid = gpsWatchRef.current?.[orderId];
      if (wid !== undefined && wid !== null) {
        navigator.geolocation.clearWatch(wid);
      }
    } catch {
      // ignore
    } finally {
      gpsWatchRef.current = { ...(gpsWatchRef.current || {}), [orderId]: null };
      setGpsFor(orderId, { on: false, saving: false });
      if (!silent) showToast("GPS Tracking OFF");
    }
  }

  async function startTracking(orderId, silent = false) {
    if (!orderId) return;
    if (!deliveryAllowed) {
      setGpsFor(orderId, { on: false, saving: false, err: "Delivery account not approved." });
      if (!silent) showToast("Account not approved");
      return;
    }
    if (gpsState?.[orderId]?.on) return;

    if (!("geolocation" in navigator)) {
      setGpsFor(orderId, { err: "Geolocation not supported on this device." });
      if (!silent) showToast("GPS not supported on this device");
      return;
    }

    setGpsFor(orderId, { on: true, err: "" });
    if (!silent) showToast("GPS Tracking ON");

    const saveEveryMs = 8000;

    const wid = navigator.geolocation.watchPosition(
      async (pos) => {
        const lat = pos?.coords?.latitude;
        const lng = pos?.coords?.longitude;

        setGpsFor(orderId, { on: true, lastLat: lat, lastLng: lng, err: "" });

        const nowMs = Date.now();
        const lastMs = gpsLastSaveRef.current?.[orderId] || 0;
        if (nowMs - lastMs < saveEveryMs) return;
        gpsLastSaveRef.current = { ...(gpsLastSaveRef.current || {}), [orderId]: nowMs };

        setGpsFor(orderId, { saving: true });

        const res = await tryInsertDeliveryEvent({ orderId, eventType: "gps", note: null, lat, lng });

        if (!res.ok) {
          setGpsFor(orderId, { err: res.error || "Insert failed", saving: false });
          showToast(`GPS save failed: ${res.error || "unknown error"}`);
          return;
        }

        setGpsFor(orderId, { lastSavedAt: new Date().toLocaleTimeString(), saving: false });
      },
      (err) => {
        const msg = err?.message || "GPS permission denied or unavailable";
        setGpsFor(orderId, { err: msg, on: false, saving: false });
        if (!silent) showToast(msg);
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
    );

    gpsWatchRef.current = { ...(gpsWatchRef.current || {}), [orderId]: wid };
  }

  async function autoStartIfNeeded(order) {
    try {
      if (!order?.id) return;
      const st = String(order.status || "").toLowerCase();
      if (st === "delivered" || st === "rejected") return;
      if (String(order.delivery_user_id || "") !== String(userId || "")) return;
      if (gpsState?.[order.id]?.on) return;
      await startTracking(order.id, true);
    } catch {}
  }

  function autoStopIfDelivered(orderId) {
    try {
      if (!orderId) return;
      if (gpsState?.[orderId]?.on) stopTracking(orderId, true);
    } catch {}
  }

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setErrMsg("");
      setLoading(true);

      try {
        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr) throw userErr;

        const user = userData?.user;
        if (!user) {
          router.push("/login");
          return;
        }

        setUserEmail(user.email || "");
        setUserId(user.id || "");

        const { data: prof, error: profErr } = await supabase
          .from("profiles")
          .select("full_name, phone, role, avatar_url, is_delivery_online, delivery_status")
          .eq("user_id", user.id)
          .maybeSingle();

        if (profErr) throw profErr;

        const role = normalizeRole(prof?.role);
        if (role !== "delivery_partner") {
          router.push("/");
          return;
        }

        const dStatus = normalizeDeliveryStatus(prof?.delivery_status);

        if (!cancelled) {
          setProfile(prof || null);
          setDeliveryStatus(dStatus);

          const dbOnline =
            prof?.is_delivery_online === null || prof?.is_delivery_online === undefined
              ? true
              : !!prof?.is_delivery_online;

          if (dStatus !== "approved") {
            setIsOnline(false);
            try {
              await supabase.from("profiles").update({ is_delivery_online: false }).eq("user_id", user.id);
            } catch {}
          } else {
            setIsOnline(dbOnline);
          }
        }
      } catch (e) {
        if (!cancelled) setErrMsg(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();

    return () => {
      cancelled = true;
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [router]);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    async function loadAll() {
      try {
        if (!deliveryAllowed) {
          setAvailableOrders([]);
          setMyOrders([]);
          return;
        }

        await loadAvailable();
        await loadMy();
        setupRealtime();
      } catch (e) {
        if (!cancelled) setErrMsg(e?.message || String(e));
      }
    }

    loadAll();

    return () => {
      cancelled = true;

      // remove channels
      const chans = [
        readyRestaurantChannelRef.current,
        readyGroceryChannelRef.current,
        myRestaurantChannelRef.current,
        myGroceryChannelRef.current,
      ].filter(Boolean);

      for (const ch of chans) {
        try {
          supabase.removeChannel(ch);
        } catch {}
      }

      readyRestaurantChannelRef.current = null;
      readyGroceryChannelRef.current = null;
      myRestaurantChannelRef.current = null;
      myGroceryChannelRef.current = null;

      // stop gps watches
      try {
        const keys = Object.keys(gpsWatchRef.current || {});
        for (const k of keys) {
          const wid = gpsWatchRef.current[k];
          if (wid) navigator.geolocation.clearWatch(wid);
        }
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, deliveryAllowed]);

  useEffect(() => {
    try {
      if (!userId) return;
      if (!deliveryAllowed) return;

      const list = myOrders || [];
      for (const o of list) {
        const st = String(o.status || "").toLowerCase();
        if (st !== "delivered") autoStartIfNeeded(o);
        else autoStopIfDelivered(o.id);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myOrders, userId, deliveryAllowed]);

  useEffect(() => {
    const current = (availableOrders || []).length;
    const prev = lastAvailableCountRef.current;
    lastAvailableCountRef.current = current;

    if (!loading && isOnline && tab === "available" && current > prev && prev !== 0) {
      showToast(`New order available (+${current - prev})`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableOrders]);

  async function handleLogout() {
    try {
      await supabase.auth.signOut();
    } catch {}
    router.push("/");
    router.refresh();
  }

  async function hardRefresh() {
    setErrMsg("");
    try {
      if (!deliveryAllowed) {
        showToast("Account not approved");
        setAvailableOrders([]);
        setMyOrders([]);
        return;
      }
      await loadAvailable();
      await loadMy();
      showToast("Refreshed");
    } catch (e) {
      setErrMsg(e?.message || String(e));
    }
  }

  // ✅ Accept order (restaurant OR grocery)
  async function acceptOrder(orderRow) {
    const orderId = orderRow?.id;
    const src = orderRow?._source;

    if (!deliveryAllowed) return showToast("Account not approved");
    if (!isOnline) return showToast("Go Online to accept orders");
    if (!orderId || !src) return;

    setErrMsg("");
    setBusyId(orderId);

    try {
      const table = src === "grocery" ? "grocery_orders" : "orders";

      const { data, error } = await supabase
        .from(table)
        .update({ delivery_user_id: userId, status: "delivering" })
        .eq("id", orderId)
        .eq("status", "ready")
        .is("delivery_user_id", null)
        .select("*");

      if (error) throw error;

      if (!data || data.length === 0) {
        setErrMsg("❌ This order was already taken by another delivery partner.");
        await loadAvailable();
        await loadMy();
        return;
      }

      const res = await tryInsertDeliveryEvent({ orderId, eventType: `accepted_${src}`, note: null });
      if (!res.ok) showToast(`delivery_events insert failed: ${res.error}`);

      showToast(`${src === "grocery" ? "Grocery" : "Restaurant"} order accepted ✅`);
      setTab("my");

      await startTracking(orderId, true);

      await loadAvailable();
      await loadMy();
    } catch (e) {
      setErrMsg(e?.message || String(e) || "Could not accept this order.");
    } finally {
      setBusyId("");
    }
  }

  // ✅ Update status (restaurant OR grocery)
  async function updateMyStatus(orderRow, status) {
    const orderId = orderRow?.id;
    const src = orderRow?._source;
    if (!orderId || !src) return;

    if (!deliveryAllowed) return showToast("Account not approved");

    setErrMsg("");
    setBusyId(orderId);

    try {
      const table = src === "grocery" ? "grocery_orders" : "orders";
      const patch = { status };

      if (String(status).toLowerCase() === "delivered") {
        patch.delivered_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from(table)
        .update(patch)
        .eq("id", orderId)
        .eq("delivery_user_id", userId);

      if (error) throw error;

      const res = await tryInsertDeliveryEvent({ orderId, eventType: `${status}_${src}`, note: null });
      if (!res.ok) showToast(`delivery_events insert failed: ${res.error}`);

      if (String(status).toLowerCase() === "delivered") stopTracking(orderId, true);

      await loadMy();

      if (status === "delivered") showToast("Delivered ✅");
      else showToast("Status updated ✅");
    } catch (e) {
      setErrMsg(e?.message || String(e));
    } finally {
      setBusyId("");
    }
  }

  async function saveRating(orderRow, ratingValue) {
    const orderId = orderRow?.id;
    const src = orderRow?._source;
    if (!orderId || !src) return;

    const val = nnum(ratingValue, 0);
    if (val < 1 || val > 5) return;

    if (!deliveryAllowed) return showToast("Account not approved");

    setRatingBusyId(orderId);
    setErrMsg("");

    try {
      const table = src === "grocery" ? "grocery_orders" : "orders";

      const { error } = await supabase
        .from(table)
        .update({ delivery_rating: val })
        .eq("id", orderId)
        .eq("delivery_user_id", userId);

      if (error) throw error;

      setRatingLocal((m) => ({ ...m, [orderId]: val }));
      showToast("Rating saved ⭐");
      await loadMy();
    } catch (e) {
      setErrMsg(e?.message || String(e));
    } finally {
      setRatingBusyId("");
    }
  }

  const styles = useMemo(() => {
    return {
      page: {
        minHeight: "calc(100vh - 64px)",
        padding: 24,
        background:
          "radial-gradient(1200px 600px at 20% 10%, rgba(90,180,255,0.22), transparent 60%), radial-gradient(900px 500px at 80% 20%, rgba(255,180,120,0.18), transparent 55%), linear-gradient(180deg, #f7f7fb, #ffffff)",
      },
      wrap: { maxWidth: 1150, margin: "0 auto" },
      title: { margin: 0, fontSize: 34, fontWeight: 950, letterSpacing: -0.3 },
      sub: { marginTop: 6, color: "#666", fontSize: 14 },

      row: { display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" },

      pill: {
        padding: "6px 10px",
        borderRadius: 999,
        border: "1px solid rgba(0,0,0,0.10)",
        background: "rgba(0,0,0,0.04)",
        fontWeight: 850,
        fontSize: 12,
      },

      btn: {
        padding: "10px 12px",
        borderRadius: 14,
        border: "1px solid rgba(0,0,0,0.12)",
        background: "#111",
        color: "#fff",
        cursor: "pointer",
        fontWeight: 950,
      },
      btnGhost: {
        padding: "10px 12px",
        borderRadius: 14,
        border: "1px solid rgba(0,0,0,0.12)",
        background: "rgba(255,255,255,0.8)",
        cursor: "pointer",
        fontWeight: 950,
      },
      btnSoft: {
        padding: "10px 12px",
        borderRadius: 14,
        border: "1px solid rgba(0,0,0,0.12)",
        background: "rgba(17,24,39,0.04)",
        cursor: "pointer",
        fontWeight: 950,
      },

      card: {
        marginTop: 16,
        borderRadius: 18,
        padding: 16,
        background: "rgba(255,255,255,0.78)",
        border: "1px solid rgba(0,0,0,0.08)",
        boxShadow: "0 12px 40px rgba(0,0,0,0.08)",
        backdropFilter: "blur(10px)",
      },

      kpiGrid: {
        display: "grid",
        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
        gap: 12,
        marginTop: 12,
      },

      kpiCard: {
        borderRadius: 16,
        border: "1px solid rgba(0,0,0,0.08)",
        background: "rgba(255,255,255,0.8)",
        padding: 14,
      },

      kpiNum: { fontSize: 22, fontWeight: 1000, color: "#0b1220" },
      kpiLabel: { marginTop: 4, fontSize: 12, fontWeight: 900, color: "rgba(17,24,39,0.65)" },

      split: {
        display: "grid",
        gridTemplateColumns: "1.3fr 0.7fr",
        gap: 12,
        marginTop: 12,
      },

      error: {
        marginTop: 12,
        background: "#ffe7e7",
        border: "1px solid #ffb3b3",
        padding: 12,
        borderRadius: 12,
        color: "#8a1f1f",
        fontWeight: 800,
      },

      loading: { padding: 24, color: "#666" },

      orderCard: {
        marginTop: 10,
        borderRadius: 16,
        border: "1px solid rgba(0,0,0,0.08)",
        background: "rgba(255,255,255,0.85)",
        padding: 12,
      },

      badge: (status) => {
        const b = statusBadge(status);
        return {
          display: "inline-flex",
          alignItems: "center",
          padding: "6px 10px",
          borderRadius: 999,
          border: `1px solid ${b.border}`,
          background: b.bg,
          color: b.text,
          fontWeight: 950,
          fontSize: 12,
          textTransform: "capitalize",
        };
      },

      subBadge: {
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 10px",
        borderRadius: 999,
        border: "1px solid rgba(0,0,0,0.10)",
        background: "rgba(0,0,0,0.04)",
        color: "rgba(17,24,39,0.75)",
        fontWeight: 950,
        fontSize: 12,
      },

      moneyBadge: {
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 10px",
        borderRadius: 999,
        border: "1px solid rgba(0,0,0,0.10)",
        background: "rgba(17,24,39,0.04)",
        color: "#0b1220",
        fontWeight: 950,
        fontSize: 12,
      },

      paidBadge: (paid) => ({
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 10px",
        borderRadius: 999,
        border: paid ? "1px solid rgba(16,185,129,0.25)" : "1px solid rgba(245,158,11,0.28)",
        background: paid ? "rgba(236,253,245,0.95)" : "rgba(254,243,199,0.95)",
        color: paid ? "#065f46" : "#92400e",
        fontWeight: 950,
        fontSize: 12,
        textTransform: "uppercase",
      }),

      line: { height: 1, background: "rgba(0,0,0,0.06)", margin: "10px 0" },

      label: { color: "rgba(17,24,39,0.6)", fontWeight: 900, fontSize: 12, marginBottom: 4 },
      val: { fontWeight: 950, color: "#0b1220" },

      weekWrap: {
        marginTop: 14,
        borderRadius: 16,
        border: "1px solid rgba(0,0,0,0.08)",
        background: "rgba(255,255,255,0.78)",
        padding: 14,
      },
      weekTop: {
        display: "flex",
        justifyContent: "space-between",
        gap: 10,
        flexWrap: "wrap",
        alignItems: "flex-end",
      },
      weekTitle: { margin: 0, fontSize: 14, fontWeight: 950, color: "#0b1220" },
      weekSub: { marginTop: 4, color: "rgba(17,24,39,0.65)", fontWeight: 850, fontSize: 12 },

      rangeRow: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },
      rangeBtn: (active) => ({
        padding: "8px 10px",
        borderRadius: 999,
        border: "1px solid rgba(0,0,0,0.12)",
        background: active ? "#111" : "rgba(255,255,255,0.8)",
        color: active ? "#fff" : "#111",
        cursor: "pointer",
        fontWeight: 950,
        fontSize: 12,
      }),

      chart7: {
        marginTop: 12,
        height: 120,
        display: "grid",
        gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
        gap: 10,
        alignItems: "end",
      },

      chart30Wrap: {
        marginTop: 12,
        borderRadius: 14,
        border: "1px solid rgba(0,0,0,0.06)",
        background: "rgba(255,255,255,0.6)",
        padding: 10,
        overflowX: "auto",
      },
      chart30: {
        height: 140,
        display: "flex",
        gap: 10,
        alignItems: "flex-end",
        minWidth: 950,
      },

      chart90: {
        marginTop: 12,
        height: 140,
        display: "grid",
        gridTemplateColumns: "repeat(13, minmax(0, 1fr))",
        gap: 10,
        alignItems: "end",
      },

      barCol: { display: "flex", flexDirection: "column", gap: 6, alignItems: "center" },
      bar: {
        width: "100%",
        borderRadius: 12,
        border: "1px solid rgba(0,0,0,0.10)",
        background: "rgba(17,24,39,0.10)",
        boxShadow: "0 10px 24px rgba(0,0,0,0.06)",
      },
      barValue: { fontSize: 11, fontWeight: 950, color: "rgba(17,24,39,0.70)" },
      barLabel: { fontSize: 11, fontWeight: 950, color: "rgba(17,24,39,0.65)" },

      tabsRow: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 12 },
      tabBtn: (active) => ({
        padding: "8px 10px",
        borderRadius: 999,
        border: "1px solid rgba(0,0,0,0.12)",
        background: active ? "#111" : "rgba(255,255,255,0.8)",
        color: active ? "#fff" : "#111",
        cursor: "pointer",
        fontWeight: 950,
        fontSize: 12,
      }),
      input: {
        padding: "10px 12px",
        borderRadius: 14,
        border: "1px solid rgba(0,0,0,0.12)",
        background: "rgba(255,255,255,0.9)",
        outline: "none",
        fontWeight: 850,
        minWidth: 240,
      },
      select: {
        padding: "10px 12px",
        borderRadius: 14,
        border: "1px solid rgba(0,0,0,0.12)",
        background: "rgba(255,255,255,0.9)",
        outline: "none",
        fontWeight: 900,
      },

      toggleWrap: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        borderRadius: 999,
        border: "1px solid rgba(0,0,0,0.12)",
        background: "rgba(255,255,255,0.85)",
      },
      toggleDot: (on) => ({
        width: 10,
        height: 10,
        borderRadius: 999,
        background: on ? "rgba(16,185,129,0.95)" : "rgba(239,68,68,0.85)",
        boxShadow: on ? "0 0 0 4px rgba(16,185,129,0.14)" : "0 0 0 4px rgba(239,68,68,0.12)",
      }),
      toggleText: { fontWeight: 950, fontSize: 12, color: "#0b1220" },

      toast: {
        position: "fixed",
        bottom: 18,
        right: 18,
        zIndex: 9999,
        borderRadius: 14,
        border: "1px solid rgba(0,0,0,0.12)",
        background: "rgba(17,24,39,0.92)",
        color: "#fff",
        padding: "10px 12px",
        boxShadow: "0 12px 40px rgba(0,0,0,0.22)",
        fontWeight: 950,
        fontSize: 13,
        maxWidth: 420,
      },

      avatar: {
        width: 44,
        height: 44,
        borderRadius: 999,
        border: "1px solid rgba(0,0,0,0.10)",
        background: "rgba(0,0,0,0.06)",
        overflow: "hidden",
        display: "grid",
        placeItems: "center",
        fontWeight: 1000,
        color: "rgba(17,24,39,0.75)",
      },
      avatarImg: { width: "100%", height: "100%", objectFit: "cover" },

      timelineBox: {
        marginTop: 10,
        borderRadius: 14,
        border: "1px solid rgba(0,0,0,0.08)",
        background: "rgba(255,255,255,0.75)",
        padding: 12,
      },

      starRow: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8 },
      starBtn: (active) => ({
        padding: "8px 10px",
        borderRadius: 999,
        border: "1px solid rgba(0,0,0,0.12)",
        background: active ? "#111" : "rgba(255,255,255,0.85)",
        color: active ? "#fff" : "#111",
        cursor: "pointer",
        fontWeight: 950,
        fontSize: 12,
      }),

      gpsBox: {
        marginTop: 10,
        borderRadius: 14,
        border: "1px solid rgba(0,0,0,0.08)",
        background: "rgba(255,255,255,0.78)",
        padding: 12,
      },
      gpsPill: {
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        borderRadius: 999,
        border: "1px solid rgba(0,0,0,0.12)",
        background: "rgba(17,24,39,0.04)",
        fontWeight: 950,
        fontSize: 12,
      },

      locPill: {
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        borderRadius: 999,
        border: "1px solid rgba(0,0,0,0.10)",
        background: "rgba(0,0,0,0.04)",
        fontWeight: 950,
        fontSize: 12,
        color: "rgba(17,24,39,0.80)",
      },

      gateBadge: (status) => {
        const s = normalizeDeliveryStatus(status);
        if (s === "approved") {
          return {
            padding: "6px 10px",
            borderRadius: 999,
            border: "1px solid rgba(16,185,129,0.25)",
            background: "rgba(236,253,245,0.95)",
            color: "#065f46",
            fontWeight: 950,
            fontSize: 12,
            textTransform: "uppercase",
          };
        }
        if (s === "disabled" || s === "rejected") {
          return {
            padding: "6px 10px",
            borderRadius: 999,
            border: "1px solid rgba(239,68,68,0.25)",
            background: "rgba(254,242,242,0.95)",
            color: "#7f1d1d",
            fontWeight: 950,
            fontSize: 12,
            textTransform: "uppercase",
          };
        }
        return {
          padding: "6px 10px",
          borderRadius: 999,
          border: "1px solid rgba(245,158,11,0.28)",
          background: "rgba(254,243,199,0.95)",
          color: "#92400e",
          fontWeight: 950,
          fontSize: 12,
          textTransform: "uppercase",
        };
      },

      sourceBtn: (active) => ({
        padding: "8px 10px",
        borderRadius: 999,
        border: "1px solid rgba(0,0,0,0.12)",
        background: active ? "#111" : "rgba(255,255,255,0.85)",
        color: active ? "#fff" : "#111",
        cursor: "pointer",
        fontWeight: 950,
        fontSize: 12,
      }),
    };
  }, [deliveryStatus]);

  const availableCount = isOnline && deliveryAllowed ? availableOrders.length : 0;

  const availableRestaurantCount = useMemo(() => {
    if (!isOnline || !deliveryAllowed) return 0;
    return (availableOrders || []).filter((o) => o._source === "restaurant").length;
  }, [availableOrders, isOnline, deliveryAllowed]);

  const availableGroceryCount = useMemo(() => {
    if (!isOnline || !deliveryAllowed) return 0;
    return (availableOrders || []).filter((o) => o._source === "grocery").length;
  }, [availableOrders, isOnline, deliveryAllowed]);

  const myActiveOrders = useMemo(() => {
    const list = myOrders || [];
    return list.filter((o) => String(o.status || "").toLowerCase() !== "delivered");
  }, [myOrders]);

  const completedOrders = useMemo(() => {
    const list = myOrders || [];
    return list.filter((o) => String(o.status || "").toLowerCase() === "delivered");
  }, [myOrders]);

  const now = new Date();
  const todayKey = toISOKey(now);
  const weekStart = startOfWeekMonday(now);
  const monthStartDate = monthStart(now);

  const earningsStats = useMemo(() => {
    const delivered = completedOrders;

    let todayCount = 0;
    let weekCount = 0;
    let monthCount = 0;
    let lifeCount = delivered.length;

    let todayE = 0;
    let weekE = 0;
    let monthE = 0;
    let lifeE = 0;

    const rangeStart = startOfDay(addDays(now, -(chartDays - 1)));
    const rangeDays = Array.from({ length: chartDays }, (_, i) => startOfDay(addDays(rangeStart, i)));
    const byKeyCount = {};
    const byKeyE = {};
    for (const d of rangeDays) {
      const k = toISOKey(d);
      byKeyCount[k] = 0;
      byKeyE[k] = 0;
    }

    const weekDays = Array.from({ length: 7 }, (_, i) => startOfDay(addDays(weekStart, i)));
    const weekByCount = {};
    const weekByE = {};
    for (const d of weekDays) {
      const k = toISOKey(d);
      weekByCount[k] = 0;
      weekByE[k] = 0;
    }

    for (const o of delivered) {
      const ts = o.delivered_at || o.updated_at || o.created_at;
      const dt = safeDate(ts);
      if (!dt) continue;

      const k = toISOKey(dt);
      const payout = orderPayout(o);

      lifeE += payout;

      if (k === todayKey) {
        todayCount += 1;
        todayE += payout;
      }

      if (dt >= weekStart && dt < addDays(weekStart, 7)) {
        weekCount += 1;
        weekE += payout;
        if (weekByCount[k] !== undefined) weekByCount[k] += 1;
        if (weekByE[k] !== undefined) weekByE[k] += payout;
      }

      if (dt >= monthStartDate) {
        monthCount += 1;
        monthE += payout;
      }

      if (dt >= rangeStart && byKeyCount[k] !== undefined) {
        byKeyCount[k] += 1;
        byKeyE[k] += payout;
      }
    }

    const weekChart = weekDays.map((d) => {
      const key = toISOKey(d);
      const count = weekByCount[key] || 0;
      const earnings = weekByE[key] || 0;
      return { key, label: shortDayLabel(d), count, earnings };
    });

    const topWeekDay = weekChart.reduce((best, cur) => (cur.earnings > best.earnings ? cur : best), {
      label: "—",
      earnings: 0,
      count: 0,
    });

    const avgPerDayWeek = Math.round(weekE / 7);

    const dailyChart = rangeDays.map((d) => {
      const key = toISOKey(d);
      const count = byKeyCount[key] || 0;
      const earnings = byKeyE[key] || 0;
      return {
        key,
        label: chartDays === 30 ? dayNumLabel(d) : shortDayLabel(d),
        count,
        earnings,
        date: d,
      };
    });

    let displayChart = dailyChart;
    let displayMax = Math.max(1, ...dailyChart.map((x) => x.earnings));
    let displayNote = chartDays === 7 ? "Chart shows last 7 days." : "Chart shows daily earnings for last 30 days (scroll).";

    if (chartDays === 90) {
      const start = startOfDay(addDays(now, -89));
      const weeks = Array.from({ length: 13 }, (_, i) => startOfDay(addDays(start, i * 7)));
      const byWeek = weeks.map((w, idx) => {
        const wEnd = addDays(w, 7);
        let c = 0;
        let e = 0;
        for (const o of delivered) {
          const ts = o.delivered_at || o.updated_at || o.created_at;
          const dt = safeDate(ts);
          if (!dt) continue;
          if (dt >= w && dt < wEnd) {
            c += 1;
            e += orderPayout(o);
          }
        }
        return { key: `w${idx}`, label: `W${idx + 1}`, count: c, earnings: e };
      });
      displayChart = byWeek;
      displayMax = Math.max(1, ...byWeek.map((x) => x.earnings));
      displayNote = "Chart shows last 90 days (weekly bars).";
    }

    const rangeDeliveredCount =
      chartDays === 90 ? displayChart.reduce((s, x) => s + x.count, 0) : dailyChart.reduce((s, x) => s + x.count, 0);

    const rangeE = chartDays === 90 ? displayChart.reduce((s, x) => s + x.earnings, 0) : dailyChart.reduce((s, x) => s + x.earnings, 0);

    return {
      todayCount,
      weekCount,
      monthCount,
      lifeCount,

      todayE: Math.round(todayE),
      weekE: Math.round(weekE),
      monthE: Math.round(monthE),
      lifeE: Math.round(lifeE),

      topWeekDay: { ...topWeekDay, earnings: Math.round(topWeekDay.earnings) },
      avgPerDayWeek: Math.round(avgPerDayWeek),

      rangeE: Math.round(rangeE),
      rangeDeliveredCount,
      displayChart: displayChart.map((x) => ({ ...x, earnings: Math.round(x.earnings) })),
      displayMax: Math.max(1, Math.round(displayMax)),
      displayNote,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completedOrders, chartDays, todayKey, weekStart, monthStartDate]);

  function orderTotal(o) {
    const t = pick(o, ["total", "amount", "grand_total"], "0");
    const n = Number(t);
    return isNaN(n) ? 0 : n;
  }

  function matchesSearch(o) {
    const q = String(searchText || "").trim().toLowerCase();
    if (!q) return true;

    const fullAddr = buildFullAddress(o);

    const fields = [
      pick(o, ["customer_name", "name", "full_name"], ""),
      pick(o, ["phone", "customer_phone", "mobile", "customer_mobile"], ""),
      fullAddr || "",
      pick(o, ["address_line1", "address_line2", "landmark"], ""),
      pick(o, ["id"], ""),
      pick(o, ["status"], ""),
      pick(o, ["_source"], ""),
      pick(o, ["_store_name"], ""),
    ]
      .join(" ")
      .toLowerCase();

    return fields.includes(q);
  }

  function sortList(list) {
    const arr = [...(list || [])];

    const byDate = (o) => {
      const dt = safeDate(o.created_at || o.createdAt || o.updated_at);
      return dt ? dt.getTime() : 0;
    };

    if (sortMode === "oldest") arr.sort((a, b) => byDate(a) - byDate(b));
    else if (sortMode === "amount_high") arr.sort((a, b) => orderTotal(b) - orderTotal(a));
    else if (sortMode === "amount_low") arr.sort((a, b) => orderTotal(a) - orderTotal(b));
    else arr.sort((a, b) => byDate(b) - byDate(a));

    return arr;
  }

  function applySourceFilter(list) {
    if (sourceFilter === "restaurant") return (list || []).filter((o) => o._source === "restaurant");
    if (sourceFilter === "grocery") return (list || []).filter((o) => o._source === "grocery");
    return list || [];
  }

  const visibleAvailable = useMemo(() => {
    if (!isOnline) return [];
    if (!deliveryAllowed) return [];
    return sortList(applySourceFilter((availableOrders || []).filter(matchesSearch)));
  }, [availableOrders, searchText, sortMode, isOnline, deliveryAllowed, sourceFilter]);

  const visibleMyActive = useMemo(() => {
    if (!deliveryAllowed) return [];
    return sortList(applySourceFilter((myActiveOrders || []).filter(matchesSearch)));
  }, [myActiveOrders, searchText, sortMode, deliveryAllowed, sourceFilter]);

  const visibleCompleted = useMemo(() => {
    if (!deliveryAllowed) return [];
    return sortList(applySourceFilter((completedOrders || []).filter(matchesSearch)));
  }, [completedOrders, searchText, sortMode, deliveryAllowed, sourceFilter]);

  function renderOrderCard(o, type) {
    const src = o._source || "restaurant";

    const customerName = pick(o, ["customer_name", "name", "full_name"]);
    const customerPhone = pick(o, ["phone", "customer_phone", "mobile", "customer_mobile"]);
    const customerAddress = buildFullAddress(o);

    const instructions = pick(o, ["customer_instructions", "instructions", "note", "notes"], "");
    const items = pick(o, ["items", "order_items", "cart_items", "products"], "");
    const total = orderTotal(o);
    const st = String(o.status || "").toLowerCase();

    // Drop coords (both)
    const dropLat = pick(o, ["customer_lat", "drop_lat", "delivery_lat"], null);
    const dropLng = pick(o, ["customer_lng", "drop_lng", "delivery_lng"], null);
    const dropMapsUrlLatLng = buildGoogleMapsUrlLatLng(dropLat, dropLng);
    const dropMapsUrl = dropMapsUrlLatLng || buildGoogleMapsUrl(customerAddress);

    // Pickup coords
    let pickLat = null;
    let pickLng = null;

    if (src === "restaurant") {
      pickLat = pick(o, ["restaurant_lat", "pickup_lat"], null);
      pickLng = pick(o, ["restaurant_lng", "pickup_lng"], null);
    } else {
      // grocery: from enriched store gps (if exists) or possible columns on order
      pickLat = pick(o, ["_pickup_lat", "store_lat", "pickup_lat"], null);
      pickLng = pick(o, ["_pickup_lng", "store_lng", "pickup_lng"], null);
    }

    const pickupMapsUrlLatLng = buildGoogleMapsUrlLatLng(pickLat, pickLng);
    const routeUrl = buildGoogleMapsDirectionsUrl(pickLat, pickLng, dropLat, dropLng);

    const telUrl = `tel:${String(customerPhone || "").replace(/\s+/g, "")}`;
    const waUrl = `https://wa.me/${String(customerPhone || "").replace(/[^\d]/g, "")}`;

    const fee = orderFee(o);
    const tip = orderTip(o);
    const payout = orderPayout(o);
    const paid = earningStatus(o) === "paid";

    const timelineIsOpen = !!timelineOpen[o.id];
    const tLoading = !!timelineLoading[o.id];
    const tErr = timelineError[o.id] || "";
    const tRows = timelineData[o.id] || [];

    const currentRating = ratingLocal[o.id] || nnum(o?.delivery_rating, 0);

    const gps = gpsState[o.id] || {};
    const gpsOn = !!gps.on;
    const gpsErr = gps.err || "";
    const lastLat = gps.lastLat;
    const lastLng = gps.lastLng;

    return (
      <div key={`${src}_${o.id}`} style={styles.orderCard}>
        <div style={styles.row}>
          <span style={styles.badge(o.status)}>{o.status || "unknown"}</span>

          <span style={styles.subBadge}>{src === "grocery" ? "GROCERY" : "RESTAURANT"}</span>
          {src === "grocery" && o._store_name ? <span style={styles.subBadge}>{o._store_name}</span> : null}

          {type !== "available" ? <span style={styles.paidBadge(paid)}>{paid ? "PAID" : "UNPAID"}</span> : null}

          <div style={{ color: "#666", fontSize: 12, fontWeight: 850 }}>{formatWhen(o.created_at || o.createdAt)}</div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={styles.moneyBadge}>Fee: ₹{fee}</span>
            <span style={styles.moneyBadge}>Tip: ₹{tip}</span>
            <span style={styles.moneyBadge}>Payout: ₹{payout}</span>
            <div style={{ fontWeight: 950, color: "#0b1220" }}>Order: ₹{total}</div>
          </div>
        </div>

        <div style={styles.line} />

        <div style={styles.split}>
          <div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span style={styles.locPill}>
                Pickup:{" "}
                {buildGoogleMapsUrlLatLng(pickLat, pickLng)
                  ? `${Number(pickLat).toFixed(5)}, ${Number(pickLng).toFixed(5)}`
                  : "Not saved"}
              </span>
              <span style={styles.locPill}>
                Drop:{" "}
                {buildGoogleMapsUrlLatLng(dropLat, dropLng)
                  ? `${Number(dropLat).toFixed(5)}, ${Number(dropLng).toFixed(5)}`
                  : "Not saved"}
              </span>
            </div>

            <div style={{ marginTop: 10 }}>
              <div style={styles.label}>Customer</div>
              <div style={styles.val}>{customerName}</div>
            </div>

            <div style={{ marginTop: 8 }}>
              <div style={styles.label}>Phone</div>
              <div style={styles.val}>{customerPhone}</div>
            </div>

            <div style={{ marginTop: 8 }}>
              <div style={styles.label}>Address</div>
              <div style={{ ...styles.val, fontWeight: 900 }}>{customerAddress}</div>
            </div>

            {instructions ? (
              <div style={{ marginTop: 8 }}>
                <div style={styles.label}>Instructions</div>
                <div style={{ fontWeight: 850, color: "rgba(17,24,39,0.8)", whiteSpace: "pre-wrap" }}>{instructions}</div>
              </div>
            ) : null}

            {items && items !== "-" ? (
              <div style={{ marginTop: 8 }}>
                <div style={styles.label}>Items</div>
                <div style={{ fontWeight: 850, color: "rgba(17,24,39,0.78)", whiteSpace: "pre-wrap" }}>
                  {typeof items === "string" ? items : JSON.stringify(items, null, 2)}
                </div>
              </div>
            ) : null}

            {type === "my" ? (
              <div style={styles.gpsBox}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <div style={styles.gpsPill}>
                    <span>GPS Tracking</span>
                    <span style={{ color: "rgba(17,24,39,0.55)", fontWeight: 900 }}>AUTO after Accept • saves every ~8s</span>
                  </div>
                  <div style={{ fontWeight: 1000, color: gpsOn ? "#065f46" : "#9a3412" }}>{gpsOn ? "ON" : "OFF"}</div>
                </div>

                <div style={{ marginTop: 8, color: "rgba(17,24,39,0.75)", fontWeight: 900, fontSize: 12 }}>
                  {lastLat && lastLng ? `Last: ${lastLat}, ${lastLng}` : "Waiting for GPS… (auto starts after accept)"}
                  {gps.lastSavedAt ? ` • saved @ ${gps.lastSavedAt}` : ""}
                  {gps.saving ? " • saving..." : ""}
                </div>

                {gpsErr ? (
                  <div style={{ marginTop: 8, color: "#8a1f1f", fontWeight: 950, fontSize: 13 }}>GPS Save Error: {gpsErr}</div>
                ) : null}

                <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {!gpsOn ? (
                    <button type="button" style={styles.btn} onClick={() => startTracking(o.id, false)}>
                      Start Tracking
                    </button>
                  ) : (
                    <button type="button" style={styles.btnGhost} onClick={() => stopTracking(o.id, false)}>
                      Stop Tracking
                    </button>
                  )}
                </div>
              </div>
            ) : null}

            {type !== "available" ? (
              <div style={{ marginTop: 10 }}>
                <button
                  type="button"
                  style={styles.btnSoft}
                  onClick={async () => {
                    const next = !timelineIsOpen;
                    setTimelineOpen((m) => ({ ...m, [o.id]: next }));
                    if (next) await loadTimeline(o.id);
                  }}
                >
                  {timelineIsOpen ? "Hide Timeline" : "View Timeline"}
                </button>

                {timelineIsOpen ? (
                  <div style={styles.timelineBox}>
                    {tLoading ? (
                      <div style={{ color: "#666", fontWeight: 850 }}>Loading timeline…</div>
                    ) : tErr ? (
                      <div style={{ color: "#8a1f1f", fontWeight: 900 }}>{tErr}</div>
                    ) : tRows.length === 0 ? (
                      <div style={{ color: "#666", fontWeight: 850 }}>No events yet.</div>
                    ) : (
                      <div style={{ display: "grid", gap: 8 }}>
                        {tRows.map((ev) => (
                          <div
                            key={ev.id}
                            style={{
                              borderRadius: 12,
                              border: "1px solid rgba(0,0,0,0.08)",
                              background: "rgba(255,255,255,0.85)",
                              padding: 10,
                            }}
                          >
                            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                              <span style={styles.subBadge}>{String(ev.event_type || "event")}</span>
                              <div style={{ color: "#666", fontSize: 12, fontWeight: 850 }}>{formatWhen(ev.created_at)}</div>
                              {ev.lat !== null && ev.lng !== null ? (
                                <span style={styles.subBadge}>
                                  {ev.lat}, {ev.lng}
                                </span>
                              ) : null}
                            </div>
                            {ev.event_note ? (
                              <div style={{ marginTop: 6, color: "rgba(17,24,39,0.75)", fontWeight: 850 }}>{ev.event_note}</div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div>
            <div style={styles.label}>Quick Actions</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <a
                href={pickupMapsUrlLatLng || "#"}
                target="_blank"
                rel="noreferrer"
                style={{
                  ...styles.btnGhost,
                  textDecoration: "none",
                  opacity: pickupMapsUrlLatLng ? 1 : 0.55,
                  pointerEvents: pickupMapsUrlLatLng ? "auto" : "none",
                }}
                title={pickupMapsUrlLatLng ? "Open Pickup in Maps" : "Pickup location not saved"}
              >
                Pickup Maps
              </a>

              <a href={dropMapsUrl} target="_blank" rel="noreferrer" style={{ ...styles.btnGhost, textDecoration: "none" }}>
                Drop Maps
              </a>

              <a
                href={routeUrl || "#"}
                target="_blank"
                rel="noreferrer"
                style={{
                  ...styles.btnGhost,
                  textDecoration: "none",
                  opacity: routeUrl ? 1 : 0.55,
                  pointerEvents: routeUrl ? "auto" : "none",
                }}
                title={routeUrl ? "Open Route: Pickup → Customer" : "Route needs both pickup and drop coordinates"}
              >
                Route →
              </a>

              <a href={telUrl} style={{ ...styles.btnGhost, textDecoration: "none" }}>
                Call
              </a>
              <a href={waUrl} target="_blank" rel="noreferrer" style={{ ...styles.btnGhost, textDecoration: "none" }}>
                WhatsApp
              </a>

              <button
                type="button"
                style={styles.btnSoft}
                onClick={async () => {
                  const ok = await copyText(customerAddress);
                  showToast(ok ? "Address copied" : "Copy failed");
                }}
              >
                Copy Address
              </button>

              <button
                type="button"
                style={styles.btnSoft}
                onClick={async () => {
                  const ok = await copyText(customerPhone);
                  showToast(ok ? "Phone copied" : "Copy failed");
                }}
              >
                Copy Phone
              </button>

              <button
                type="button"
                style={styles.btnSoft}
                onClick={async () => {
                  const txt = `pickup=${pickLat},${pickLng} | drop=${dropLat},${dropLng}`;
                  const ok = await copyText(txt);
                  showToast(ok ? "Coords copied" : "Copy failed");
                }}
                title="Copy pickup + drop coordinates"
              >
                Copy Coords
              </button>
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={styles.label}>Progress</div>

              {type === "available" ? (
                <button
                  onClick={() => acceptOrder(o)}
                  disabled={busyId === o.id || !isOnline || !deliveryAllowed}
                  style={styles.btn}
                  title={!deliveryAllowed ? "Account not approved" : !isOnline ? "Go Online to accept" : "Accept this order"}
                >
                  {busyId === o.id ? "Accepting…" : "Accept"}
                </button>
              ) : null}

              {type === "my" ? (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {st === "delivering" ? (
                    <button onClick={() => updateMyStatus(o, "picked_up")} disabled={busyId === o.id || !deliveryAllowed} style={styles.btnSoft}>
                      {busyId === o.id ? "Updating…" : "Picked Up"}
                    </button>
                  ) : null}

                  {st === "picked_up" ? (
                    <button onClick={() => updateMyStatus(o, "on_the_way")} disabled={busyId === o.id || !deliveryAllowed} style={styles.btnSoft}>
                      {busyId === o.id ? "Updating…" : "On The Way"}
                    </button>
                  ) : null}

                  {st === "on_the_way" ? (
                    <button onClick={() => updateMyStatus(o, "delivered")} disabled={busyId === o.id || !deliveryAllowed} style={styles.btn}>
                      {busyId === o.id ? "Updating…" : "Delivered"}
                    </button>
                  ) : null}

                  {st === "delivered" ? <span style={{ color: "#065f46", fontWeight: 950 }}>✅ Completed</span> : null}
                </div>
              ) : null}

              {type === "completed" ? (
                <div style={{ marginTop: 10 }}>
                  <div style={{ color: "rgba(17,24,39,0.7)", fontWeight: 900, fontSize: 12 }}>
                    Earned: ₹{payout} ({paid ? "paid" : "unpaid"})
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <div style={styles.label}>Customer Rating</div>
                    <div style={styles.starRow}>
                      {[1, 2, 3, 4, 5].map((x) => (
                        <button
                          key={x}
                          type="button"
                          style={styles.starBtn(currentRating === x)}
                          disabled={ratingBusyId === o.id || !deliveryAllowed}
                          onClick={() => saveRating(o, x)}
                          title={`Rate ${x} star`}
                        >
                          {x} ⭐
                        </button>
                      ))}
                      {ratingBusyId === o.id ? <span style={{ color: "#666", fontWeight: 850 }}>Saving…</span> : null}
                      {currentRating ? (
                        <span style={{ color: "rgba(17,24,39,0.70)", fontWeight: 900 }}>Current: {currentRating}/5</span>
                      ) : (
                        <span style={{ color: "rgba(17,24,39,0.60)", fontWeight: 850 }}>Not rated yet</span>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const headerName = profile?.full_name || "Delivery Partner";
  const initials =
    String(headerName || "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join("") || "DP";

  return (
    <main style={styles.page}>
      {toast.show ? <div style={styles.toast}>{toast.text}</div> : null}

      <div style={styles.wrap}>
        <div style={styles.row}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div style={styles.avatar}>
                {profile?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.avatar_url} alt="avatar" style={styles.avatarImg} />
                ) : (
                  initials
                )}
              </div>

              <div>
                <h1 style={styles.title}>Delivery Dashboard</h1>
                <div style={styles.sub}>Welcome{headerName ? `, ${headerName}` : ""} — ready to deliver.</div>

                <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={styles.gateBadge(deliveryStatus)}>
                    {normalizeDeliveryStatus(deliveryStatus) === "approved" ? "APPROVED" : normalizeDeliveryStatus(deliveryStatus)}
                  </span>
                  {!deliveryAllowed ? (
                    <span style={{ fontSize: 12, fontWeight: 900, color: "rgba(17,24,39,0.70)" }}>{deliveryBlockedReason}</span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div style={styles.row}>
            <div style={styles.toggleWrap}>
              <div style={styles.toggleDot(isOnline && deliveryAllowed)} />
              <div style={styles.toggleText}>
                {deliveryAllowed ? (isOnline ? "Online" : "Offline") : "Blocked"}
                {savingOnline ? " (saving…)" : ""}
              </div>

              <button
                type="button"
                style={styles.btnSoft}
                disabled={savingOnline || !deliveryAllowed}
                onClick={async () => {
                  const next = !isOnline;
                  setIsOnline(next);
                  showToast(next ? "You are Online" : "You are Offline");
                  await saveOnlineToDB(next);
                }}
                title={!deliveryAllowed ? "Account not approved" : "Toggle online"}
              >
                Toggle
              </button>
            </div>

            <span style={styles.pill}>Available: {availableCount}</span>
            <span style={styles.pill}>Restaurant: {availableRestaurantCount}</span>
            <span style={styles.pill}>Grocery: {availableGroceryCount}</span>
            <span style={styles.pill}>Active: {deliveryAllowed ? myActiveOrders.length : 0}</span>

            <button onClick={hardRefresh} style={styles.btnGhost}>
              Refresh
            </button>

            <button onClick={() => router.push("/delivery")} style={styles.btnGhost}>
              Home
            </button>

            <button onClick={handleLogout} style={styles.btn}>
              Logout
            </button>
          </div>
        </div>

        {loading ? <div style={styles.loading}>Loading delivery profile…</div> : null}
        {errMsg ? <div style={styles.error}>{errMsg}</div> : null}

        {!loading && !errMsg && !deliveryAllowed ? (
          <div style={styles.card}>
            <div style={{ fontWeight: 1000, fontSize: 16 }}>Account Locked</div>
            <div style={{ marginTop: 8, color: "rgba(17,24,39,0.75)", fontWeight: 900, lineHeight: 1.6 }}>
              {deliveryBlockedReason}
              <br />
              Please contact admin to <b>Approve</b> your account.
            </div>
          </div>
        ) : null}

        {!loading && !errMsg && deliveryAllowed ? (
          <>
            <div style={styles.card}>
              <div style={styles.row}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 950, fontSize: 14 }}>Account</div>
                  <div style={{ color: "#666", marginTop: 4, fontSize: 13 }}>
                    Email: {userEmail || "-"} • Phone: {profile?.phone || "-"}
                  </div>
                </div>

                <button
                  type="button"
                  style={styles.btnSoft}
                  onClick={() => {
                    const rows = completedOrders.slice(0, 500).map((o) => ({
                      source: o._source || "",
                      order_id: o.id,
                      status: o.status,
                      created_at: o.created_at,
                      delivered_at: o.delivered_at || o.updated_at || "",
                      amount: orderTotal(o),
                      delivery_fee: orderFee(o),
                      tip_amount: orderTip(o),
                      delivery_payout: orderPayout(o),
                      earning_status: earningStatus(o),
                      delivery_rating: o.delivery_rating ?? "",
                      customer: pick(o, ["customer_name", "name", "full_name"], ""),
                      phone: pick(o, ["phone", "customer_phone", "mobile", "customer_mobile"], ""),
                      address: buildFullAddress(o),
                      pickup_lat: pick(o, ["restaurant_lat", "_pickup_lat"], ""),
                      pickup_lng: pick(o, ["restaurant_lng", "_pickup_lng"], ""),
                      drop_lat: pick(o, ["customer_lat"], ""),
                      drop_lng: pick(o, ["customer_lng"], ""),
                    }));
                    downloadCSV(rows, "delivery_completed_orders.csv");
                    showToast("Exported CSV");
                  }}
                >
                  Export Completed CSV
                </button>
              </div>
            </div>

            <div style={styles.card}>
              <div style={styles.row}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 950, fontSize: 14 }}>Earnings</div>
                  <div style={{ color: "#666", marginTop: 4, fontSize: 13 }}>Based on payout (fee + tip) from orders</div>
                </div>
              </div>

              <div style={styles.kpiGrid}>
                <div style={styles.kpiCard}>
                  <div style={styles.kpiNum}>₹{earningsStats.todayE}</div>
                  <div style={styles.kpiLabel}>Today • {earningsStats.todayCount} deliveries</div>
                </div>

                <div style={styles.kpiCard}>
                  <div style={styles.kpiNum}>₹{earningsStats.weekE}</div>
                  <div style={styles.kpiLabel}>This Week • {earningsStats.weekCount} deliveries</div>
                </div>

                <div style={styles.kpiCard}>
                  <div style={styles.kpiNum}>₹{earningsStats.monthE}</div>
                  <div style={styles.kpiLabel}>This Month • {earningsStats.monthCount} deliveries</div>
                </div>

                <div style={styles.kpiCard}>
                  <div style={styles.kpiNum}>₹{earningsStats.lifeE}</div>
                  <div style={styles.kpiLabel}>Lifetime • {earningsStats.lifeCount} deliveries</div>
                </div>
              </div>

              <div style={styles.weekWrap}>
                <div style={styles.weekTop}>
                  <div style={{ minWidth: 280 }}>
                    <h4 style={styles.weekTitle}>Weekly Performance (Mon–Sun)</h4>
                    <div style={styles.weekSub}>
                      Week starts: <b>{formatWhen(weekStart)}</b>
                    </div>
                    <div style={{ ...styles.weekSub, marginTop: 6 }}>
                      Top Day: <b>{earningsStats.topWeekDay.label}</b> • ₹{earningsStats.topWeekDay.earnings} ({earningsStats.topWeekDay.count})
                    </div>
                    <div style={{ ...styles.weekSub, marginTop: 4 }}>
                      Avg / day: <b>₹{earningsStats.avgPerDayWeek}</b>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                    <div style={styles.kpiCard}>
                      <div style={styles.kpiNum}>₹{earningsStats.rangeE}</div>
                      <div style={styles.kpiLabel}>
                        Last {chartDays} Days • {earningsStats.rangeDeliveredCount} deliveries
                      </div>
                    </div>

                    <div style={styles.rangeRow}>
                      <button type="button" style={styles.rangeBtn(chartDays === 7)} onClick={() => setChartDays(7)}>
                        Last 7
                      </button>
                      <button type="button" style={styles.rangeBtn(chartDays === 30)} onClick={() => setChartDays(30)}>
                        Last 30
                      </button>
                      <button type="button" style={styles.rangeBtn(chartDays === 90)} onClick={() => setChartDays(90)}>
                        Last 90
                      </button>
                    </div>
                  </div>
                </div>

                {chartDays === 7 ? (
                  <div style={styles.chart7}>
                    {earningsStats.displayChart.map((d) => {
                      const h = Math.round((d.earnings / Math.max(1, earningsStats.displayMax)) * 100);
                      return (
                        <div key={d.key} style={styles.barCol} title={`${d.label}: ₹${d.earnings} (${d.count})`}>
                          <div style={styles.barValue}>₹{d.earnings}</div>
                          <div style={{ ...styles.bar, height: `${Math.max(8, h)}%` }} />
                          <div style={styles.barLabel}>{d.label}</div>
                        </div>
                      );
                    })}
                  </div>
                ) : chartDays === 30 ? (
                  <div style={styles.chart30Wrap}>
                    <div style={styles.chart30}>
                      {earningsStats.displayChart.map((d) => {
                        const h = Math.round((d.earnings / Math.max(1, earningsStats.displayMax)) * 100);
                        return (
                          <div key={d.key} style={{ ...styles.barCol, width: 46, flex: "0 0 auto" }} title={`${d.label}: ₹${d.earnings} (${d.count})`}>
                            <div style={styles.barValue}>₹{d.earnings}</div>
                            <div style={{ ...styles.bar, height: `${Math.max(8, h)}%` }} />
                            <div style={styles.barLabel}>{d.label}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div style={styles.chart90}>
                    {earningsStats.displayChart.map((d) => {
                      const h = Math.round((d.earnings / Math.max(1, earningsStats.displayMax)) * 100);
                      return (
                        <div key={d.key} style={styles.barCol} title={`${d.label}: ₹${d.earnings} (${d.count})`}>
                          <div style={styles.barValue}>₹{d.earnings}</div>
                          <div style={{ ...styles.bar, height: `${Math.max(8, h)}%` }} />
                          <div style={styles.barLabel}>{d.label}</div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div style={{ marginTop: 10, color: "rgba(17,24,39,0.65)", fontWeight: 850, fontSize: 12 }}>{earningsStats.displayNote}</div>
              </div>
            </div>

            <div style={styles.card}>
              <div style={styles.row}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 950, fontSize: 14 }}>Orders</div>
                  <div style={{ color: "#666", marginTop: 4, fontSize: 13 }}>
                    Home shows all orders, but you can filter Grocery vs Restaurant.
                  </div>
                </div>

                <input value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="Search name / phone / address / id…" style={styles.input} />

                <select value={sortMode} onChange={(e) => setSortMode(e.target.value)} style={styles.select}>
                  <option value="newest">Newest</option>
                  <option value="oldest">Oldest</option>
                  <option value="amount_high">Amount (High)</option>
                  <option value="amount_low">Amount (Low)</option>
                </select>
              </div>

              <div style={styles.tabsRow}>
                <button type="button" style={styles.tabBtn(tab === "available")} onClick={() => setTab("available")}>
                  Available ({isOnline ? visibleAvailable.length : 0})
                </button>
                <button type="button" style={styles.tabBtn(tab === "my")} onClick={() => setTab("my")}>
                  My Active ({visibleMyActive.length})
                </button>
                <button type="button" style={styles.tabBtn(tab === "completed")} onClick={() => setTab("completed")}>
                  Completed ({visibleCompleted.length})
                </button>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <button type="button" style={styles.sourceBtn(sourceFilter === "all")} onClick={() => setSourceFilter("all")}>
                    All
                  </button>
                  <button type="button" style={styles.sourceBtn(sourceFilter === "restaurant")} onClick={() => setSourceFilter("restaurant")}>
                    Restaurant
                  </button>
                  <button type="button" style={styles.sourceBtn(sourceFilter === "grocery")} onClick={() => setSourceFilter("grocery")}>
                    Grocery
                  </button>
                </div>

                <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    style={styles.btnSoft}
                    onClick={() => {
                      const list = tab === "available" ? visibleAvailable : tab === "my" ? visibleMyActive : visibleCompleted;
                      const rows = (list || []).map((o) => ({
                        source: o._source || "",
                        order_id: o.id,
                        status: o.status,
                        created_at: o.created_at,
                        amount: orderTotal(o),
                        delivery_fee: orderFee(o),
                        tip_amount: orderTip(o),
                        delivery_payout: orderPayout(o),
                        earning_status: earningStatus(o),
                        customer: pick(o, ["customer_name", "name", "full_name"], ""),
                        phone: pick(o, ["phone", "customer_phone", "mobile", "customer_mobile"], ""),
                        address: buildFullAddress(o),
                        pickup_lat: pick(o, ["restaurant_lat", "_pickup_lat"], ""),
                        pickup_lng: pick(o, ["restaurant_lng", "_pickup_lng"], ""),
                        drop_lat: pick(o, ["customer_lat"], ""),
                        drop_lng: pick(o, ["customer_lng"], ""),
                      }));
                      downloadCSV(rows, `delivery_${tab}_orders.csv`);
                      showToast("Exported CSV");
                    }}
                  >
                    Export Tab CSV
                  </button>
                </div>
              </div>

              <div style={{ marginTop: 10 }}>
                {tab === "available" ? (
                  !isOnline ? (
                    <div style={{ marginTop: 10, color: "#888", fontSize: 13 }}>
                      You are <b>Offline</b>. Go Online to see & accept orders.
                    </div>
                  ) : visibleAvailable.length === 0 ? (
                    <div style={{ marginTop: 10, color: "#888", fontSize: 13 }}>No ready orders right now.</div>
                  ) : (
                    visibleAvailable.map((o) => renderOrderCard(o, "available"))
                  )
                ) : null}

                {tab === "my" ? (
                  visibleMyActive.length === 0 ? (
                    <div style={{ marginTop: 10, color: "#888", fontSize: 13 }}>No active deliveries right now.</div>
                  ) : (
                    visibleMyActive.map((o) => renderOrderCard(o, "my"))
                  )
                ) : null}

                {tab === "completed" ? (
                  visibleCompleted.length === 0 ? (
                    <div style={{ marginTop: 10, color: "#888", fontSize: 13 }}>No completed deliveries yet.</div>
                  ) : (
                    visibleCompleted.map((o) => renderOrderCard(o, "completed"))
                  )
                ) : null}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}