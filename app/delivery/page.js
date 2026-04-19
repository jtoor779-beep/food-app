"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import supabase from "@/lib/supabase";

// NOTE:
// - Restaurant orders table: orders
// - Grocery orders table: grocery_orders
// - Optional grocery items table: grocery_order_items (not required here; owner page already shows items)
// - Optional store table: grocery_stores (for pickup lat/lng, store name)
// - We unify both sources into ONE delivery dashboard list with a `_source` field.

const DELIVERY_FEE = 40;
const OFFER_SECONDS_DEFAULT = 25;
const DEFAULT_CURRENCY = "USD";
const PAYOUT_REQUESTS_TABLE = "delivery_payout_requests";
const PAYOUT_BANK_TABLE = "delivery_payout_bank_accounts";

function normalizeCurrency(c) {
  const v = String(c || "").trim().toUpperCase();
  if (v === "USD") return "USD";
  if (v === "INR") return "INR";
  return DEFAULT_CURRENCY;
}

function money(v, currency = DEFAULT_CURRENCY) {
  const n = Number(v || 0);
  const cur = normalizeCurrency(currency);
  if (!isFinite(n)) return cur === "USD" ? "$0.00" : "INR 0";

  const fractionDigits = cur === "INR" ? 0 : 2;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: cur,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(n);
  } catch {
    const fixed = n.toFixed(fractionDigits);
    return cur === "USD" ? `$${fixed}` : `INR ${Number(fixed).toFixed(0)}`;
  }
}

async function fetchCurrencyFromDB() {
  try {
    const { data, error } = await supabase
      .from("system_settings")
      .select("key, default_currency, value_json, updated_at")
      .order("updated_at", { ascending: false })
      .limit(10);

    if (error) return DEFAULT_CURRENCY;

    const rows = Array.isArray(data) ? data : [];
    if (rows.length === 0) return DEFAULT_CURRENCY;

    const globalRow = rows.find((r) => String(r?.key || "").toLowerCase() === "global");
    const row = globalRow || rows[0];

    const col = row?.default_currency;
    if (col) return normalizeCurrency(col);

    const jsonCur = row?.value_json?.default_currency;
    if (jsonCur) return normalizeCurrency(jsonCur);

    return DEFAULT_CURRENCY;
  } catch {
    return DEFAULT_CURRENCY;
  }
}

function normalizeRole(r) {
  return String(r || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function normStatus(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function isDeliveredLikeStatus(s) {
  const x = normStatus(s);
  return x === "delivered" || x === "completed" || x === "complete" || x === "done";
}

function isCanceledLikeStatus(s) {
  const x = normStatus(s);
  return x === "cancelled" || x === "canceled" || x === "rejected" || x === "declined";
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

function parseDateInputLocal(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    const dt = new Date(y, mo, d, 0, 0, 0, 0);
    if (!Number.isNaN(dt.getTime())) return dt;
  }

  return safeDate(raw);
}

function nnum(v, fallback = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

function maskLast4(v) {
  const s = String(v || "").replace(/\s+/g, "");
  if (!s) return "";
  const last4 = s.slice(-4);
  return `****${last4}`;
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

  // Treat missing/invalid values as unusable
  if (!isFinite(la) || !isFinite(ln)) return "";

  // In this app, 0,0 means "not saved" (placeholder), so don't generate a URL
  // (Real deliveries won't be in the ocean at 0,0.)
  if (Math.abs(la) < 0.00001 && Math.abs(ln) < 0.00001) return "";

  return `https://www.google.com/maps/search/?api=1&query=${la},${ln}`;
}

function buildGoogleMapsNavUrlLatLng(lat, lng) {
  const la = Number(lat);
  const ln = Number(lng);

  // Treat missing/invalid values as unusable
  if (!isFinite(la) || !isFinite(ln)) return "";

  // 0,0 means "not saved" in this app
  if (Math.abs(la) < 0.00001 && Math.abs(ln) < 0.00001) return "";

  // Directions with destination (lets driver start navigation immediately)
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${la},${ln}`)}&travelmode=driving`;
}

function buildGoogleMapsDirectionsUrl(originLat, originLng, destLat, destLng) {
  const ola = Number(originLat);
  const oln = Number(originLng);
  const dla = Number(destLat);
  const dln = Number(destLng);

  if (![ola, oln, dla, dln].every((x) => isFinite(x))) return "";

  // Guard against placeholder "not saved" coords (0,0)
  if (
    (Math.abs(ola) < 0.00001 && Math.abs(oln) < 0.00001) ||
    (Math.abs(dla) < 0.00001 && Math.abs(dln) < 0.00001)
  ) {
    return "";
  }

  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
    `${ola},${oln}`
  )}&destination=${encodeURIComponent(`${dla},${dln}`)}&travelmode=driving`;
}

/* =========================
   Miles / Distance helpers (UI estimate)
   ========================= */
function isValidLatLng(lat, lng) {
  const la = Number(lat);
  const ln = Number(lng);
  if (!isFinite(la) || !isFinite(ln)) return false;
  // 0,0 is treated as "not saved" in this app
  if (Math.abs(la) < 0.00001 && Math.abs(ln) < 0.00001) return false;
  return true;
}

function pickFirstNumber(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    const n = Number(v);
    if (isFinite(n)) return n;
  }
  return null;
}

function getPickupLatLng(o) {
  if (!o) return { lat: null, lng: null };

  // Restaurant orders commonly store pickup on the order
  const rLat = pickFirstNumber(o, ["restaurant_lat", "pickup_lat", "origin_lat", "store_lat", "lat_pickup"]);
  const rLng = pickFirstNumber(o, ["restaurant_lng", "pickup_lng", "origin_lng", "store_lng", "lng_pickup"]);
  if (isValidLatLng(rLat, rLng)) return { lat: rLat, lng: rLng };

  // Grocery orders: we enrich with _pickup_lat/_pickup_lng from grocery_stores
  const gLat = pickFirstNumber(o, ["_pickup_lat", "store_lat", "lat"]);
  const gLng = pickFirstNumber(o, ["_pickup_lng", "store_lng", "lng"]);
  if (isValidLatLng(gLat, gLng)) return { lat: gLat, lng: gLng };

  return { lat: null, lng: null };
}

function getDropLatLng(o) {
  if (!o) return { lat: null, lng: null };

  const dLat = pickFirstNumber(o, ["customer_lat", "delivery_lat", "drop_lat", "dest_lat", "lat_drop", "lat"]);
  const dLng = pickFirstNumber(o, ["customer_lng", "delivery_lng", "drop_lng", "dest_lng", "lng_drop", "lng"]);
  if (isValidLatLng(dLat, dLng)) return { lat: dLat, lng: dLng };

  return { lat: null, lng: null };
}

function haversineMiles(lat1, lng1, lat2, lng2) {
  try {
    const toRad = (x) => (Number(x) * Math.PI) / 180;
    const R = 3958.8; // Earth radius in miles
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c;
    if (!isFinite(d) || d <= 0) return null;
    return d;
  } catch {
    return null;
  }
}

function estimateOrderMiles(o) {
  const p = getPickupLatLng(o);
  const d = getDropLatLng(o);
  if (!isValidLatLng(p.lat, p.lng) || !isValidLatLng(d.lat, d.lng)) return null;
  return haversineMiles(p.lat, p.lng, d.lat, d.lng);
}

function resolveOfferMiles(o) {
  const m1 = estimateOrderMiles(o);
  if (Number.isFinite(m1) && m1 > 0) return m1;

  const directMiles = pickFirstNumber(o, [
    "distance_miles",
    "delivery_distance_miles",
    "route_miles",
    "total_miles",
    "miles",
  ]);
  if (Number.isFinite(directMiles) && directMiles > 0) return directMiles;

  const km = pickFirstNumber(o, [
    "distance_km",
    "delivery_distance_km",
    "route_km",
    "total_km",
    "km",
  ]);
  if (Number.isFinite(km) && km > 0) return km * 0.621371;

  return null;
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
   âœ… Unified source tagging
   ========================= */
function tagSource(rows, source) {
  return (rows || []).map((r) => ({ ...r, _source: source }));
}

function DeliveryHomePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState("");

  const [profile, setProfile] = useState(null);
  const [userEmail, setUserEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);

  // Unified lists: both restaurant + grocery
  const [availableOrders, setAvailableOrders] = useState([]);
  const [myOrders, setMyOrders] = useState([]);
  const [statusOverride, setStatusOverride] = useState({});

  const [busyId, setBusyId] = useState("");

  // Premium UI states
  const [chartDays, setChartDays] = useState(7);
  const [tab, setTab] = useState("available"); // available | my | completed
  const [searchText, setSearchText] = useState("");
  const [sortMode, setSortMode] = useState("newest");

  // âœ… Order Details Panel (mobile full-screen / desktop drawer)
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsCtx, setDetailsCtx] = useState({ order: null, type: "available" });
  const [isMobile, setIsMobile] = useState(false);

  // âœ… NEW: source filter (All / Restaurant / Grocery)
  const [sourceFilter, setSourceFilter] = useState("all"); // all | restaurant | grocery
  const [earnRange, setEarnRange] = useState("30d"); // 7d | 30d | 90d | custom
  const [earnFrom, setEarnFrom] = useState("");
  const [earnTo, setEarnTo] = useState("");
  const [earnSource, setEarnSource] = useState("all"); // all | restaurant | grocery
  const [earnPayState, setEarnPayState] = useState("all"); // all | paid | unpaid
  const [earnSort, setEarnSort] = useState("latest"); // latest | oldest | payout_high | payout_low
  const [payoutRange, setPayoutRange] = useState("30d"); // 7d | 30d | 90d | all | custom
  const [payoutFrom, setPayoutFrom] = useState("");
  const [payoutTo, setPayoutTo] = useState("");
  const [payoutSource, setPayoutSource] = useState("all"); // all | restaurant | grocery
  const [payoutSort, setPayoutSort] = useState("latest"); // latest | oldest | amount_high | amount_low
  const [payoutRequests, setPayoutRequests] = useState([]);
  const [payoutStoreMode, setPayoutStoreMode] = useState("local"); // local | db
  const [bankStoreMode, setBankStoreMode] = useState("local"); // local | db
  const [bankBusy, setBankBusy] = useState(false);
  const [bankSavedAt, setBankSavedAt] = useState("");
  const [bankForm, setBankForm] = useState({
    account_holder_name: "",
    bank_name: "",
    account_number: "",
    routing_code: "",
    country: "US",
    currency: "USD",
    account_number_last4: "",
    routing_code_last4: "",
    status: "pending_verification",
  });

  // Online/offline stored in DB
  const [isOnline, setIsOnline] = useState(true);
  const [savingOnline, setSavingOnline] = useState(false);

  const [toast, setToast] = useState({ show: false, text: "" });
  const toastTimer = useRef(null);


  // =========================
  // ðŸ”” New-order alerts (Sound + Vibration) - stored locally (no DB change)
  // =========================
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try {
      const v = localStorage.getItem("delivery_sound_enabled");
      if (v === null) return true;
      return v === "1";
    } catch {
      return true;
    }
  });

  const [vibrateEnabled, setVibrateEnabled] = useState(() => {
    try {
      const v = localStorage.getItem("delivery_vibrate_enabled");
      if (v === null) return true;
      return v === "1";
    } catch {
      return true;
    }
  });


  // =========================
  // ðŸ”” Push Notifications (PWA) - works even when app is closed (requires Service Worker)
  // =========================
  const [pushSupported, setPushSupported] = useState(false);
  const [pushPermission, setPushPermission] = useState("default"); // default | granted | denied
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  function urlBase64ToUint8Array(base64String) {
    try {
      const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
      const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
      const rawData = window.atob(base64);
      const outputArray = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
      return outputArray;
    } catch {
      return null;
    }
  }

  async function getServiceWorkerRegistration() {
    if (typeof window === "undefined") return null;
    if (!("serviceWorker" in navigator)) return null;

    // Prefer an existing registration at root scope
    let reg = await navigator.serviceWorker.getRegistration("/");

    // If not registered yet, register our SW (served from /public/sw.js)
    if (!reg) {
      reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    }

    // Wait until the SW is ready (active)
    await navigator.serviceWorker.ready;

    // Re-fetch after ready (sometimes the returned reg is stale)
    reg = await navigator.serviceWorker.getRegistration("/");

    if (!reg) return null;

    // Ensure we have an active worker before subscribing
    if (!reg.active) {
      const candidate = reg.installing || reg.waiting;
      if (candidate) {
        await new Promise((resolve) => {
          const onState = () => {
            if (candidate.state === "activated") {
              candidate.removeEventListener("statechange", onState);
              resolve(true);
            }
          };
          candidate.addEventListener("statechange", onState);
          // In case it's already activated
          if (candidate.state === "activated") resolve(true);
        });
      }
    }

    return reg;
  }

  async function refreshPushState() {
    try {
      if (typeof window === "undefined") return;
      const supported =
        "Notification" in window && typeof navigator !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;

      setPushSupported(!!supported);
      if (!supported) return;

      setPushPermission(Notification.permission || "default");

      const reg = await getServiceWorkerRegistration();
      if (!reg?.pushManager) {
        setPushEnabled(false);
        return;
      }

      const sub = await reg.pushManager.getSubscription();
      setPushEnabled(!!sub);
    } catch {
      // ignore
    }
  }

  async function enablePushNotifications() {
    if (!deliveryAllowed) return showToast("Account not approved");
    if (!userId) return showToast("Not logged in");
    if (typeof window === "undefined") return;

    const supported =
      "Notification" in window && typeof navigator !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;

    if (!supported) {
      showToast("Push not supported on this device/browser");
      return;
    }

    setPushBusy(true);
    setErrMsg("");

    try {
      const perm = await Notification.requestPermission();
      setPushPermission(perm);

      if (perm !== "granted") {
        showToast("Permission denied for notifications");
        return;
      }

      const reg = await getServiceWorkerRegistration();
      if (!reg) {
        showToast("Service worker not ready");
        return;
      }

      const vapidPublicKey = String(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "").trim();
      if (!vapidPublicKey) {
        showToast("Missing VAPID key (NEXT_PUBLIC_VAPID_PUBLIC_KEY)");
        return;
      }

      const appKey = urlBase64ToUint8Array(vapidPublicKey);
      if (!appKey) {
        showToast("Invalid VAPID public key");
        return;
      }

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appKey });
      }

      setPushEnabled(true);
      showToast("Push notifications enabled");

      // Save subscription in DB (matches your current table columns)
      const json = sub.toJSON ? sub.toJSON() : sub;
      const endpoint = json?.endpoint || sub?.endpoint || "";
      const p256dh = json?.keys?.p256dh || "";
      const auth = json?.keys?.auth || "";

      const { error: upsertError } = await supabase
        .from("push_subscriptions")
        .upsert(
          [
            {
              user_id: userId,
              endpoint,
              p256dh,
              auth,
              user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
              created_at: new Date().toISOString(),
            },
          ],
          { onConflict: "user_id" }
        );

      if (upsertError) throw upsertError;

      showToast("Push enabled + saved");
    } catch (e) {
      setErrMsg(e?.message || String(e));
      showToast("Could not enable push");
    } finally {
      setPushBusy(false);
    }
  }

  async function disablePushNotifications() {
    if (!userId) return;
    if (typeof window === "undefined") return;

    setPushBusy(true);
    setErrMsg("");

    try {
      const reg = await getServiceWorkerRegistration();
      const sub = await reg?.pushManager?.getSubscription?.();
      if (sub) {
        try {
          await sub.unsubscribe();
        } catch {}
      }

      setPushEnabled(false);
      showToast("Push notifications disabled");

      // Best-effort DB cleanup
      try {
        await supabase.from("push_subscriptions").delete().eq("user_id", userId);
      } catch {}
    } catch (e) {
      setErrMsg(e?.message || String(e));
    } finally {
      setPushBusy(false);
    }
  }

  // Mobile browsers require a user gesture to play audio. We'll unlock audio after first tap/click.
  const audioReadyRef = useRef(false);
  const audioCtxRef = useRef(null);
  const warnedSoundRef = useRef(false);

  function persistSound(next) {
    const val = !!next;
    setSoundEnabled(val);
    try {
      localStorage.setItem("delivery_sound_enabled", val ? "1" : "0");
    } catch {}
    showToast(val ? "Sound ON" : "Sound OFF");
  }

  function persistVibrate(next) {
    const val = !!next;
    setVibrateEnabled(val);
    try {
      localStorage.setItem("delivery_vibrate_enabled", val ? "1" : "0");
    } catch {}
    if (val && typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate([120, 60, 120]);
      } catch {}
    }
    showToast(val ? "Vibrate ON" : "Vibrate OFF");
  }

  function unlockAudioIfNeeded() {
    if (audioReadyRef.current) return true;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      const ctx = audioCtxRef.current || new Ctx();
      audioCtxRef.current = ctx;

      // Some browsers start suspended; resume in a gesture.
      if (ctx.state === "suspended" && typeof ctx.resume === "function") {
        ctx.resume().catch(() => {});
      }

      // Create a tiny silent buffer to "prime" audio.
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      g.gain.value = 0;
      o.connect(g);
      g.connect(ctx.destination);
      o.start(0);
      o.stop(0.01);

      audioReadyRef.current = true;
      return true;
    } catch {
      return false;
    }
  }

  function playNewOrderBeep() {
    if (!soundEnabled) return;
    if (typeof window === "undefined") return;

    const ok = unlockAudioIfNeeded();
    if (!ok) return;

    try {
      const ctx = audioCtxRef.current;
      if (!ctx) return;

      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = 880;

      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);

      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.2);
    } catch {
      // ignore
    }
  }

  function vibrateNewOrder() {
    if (!vibrateEnabled) return;
    if (typeof navigator === "undefined") return;
    if (!("vibrate" in navigator)) return;
    try {
      navigator.vibrate([200, 120, 200, 120, 200]);
    } catch {}
  }

  function playAlert() {
    // Unified alert used by realtime delivery_events:
    // keep behavior consistent with "new order" alerts.
    try {
      playNewOrderBeep();
    } catch {}
    try {
      vibrateNewOrder();
    } catch {}
  }


  useEffect(() => {
    function onFirstGesture() {
      unlockAudioIfNeeded();
      window.removeEventListener("pointerdown", onFirstGesture);
      window.removeEventListener("touchstart", onFirstGesture);
      window.removeEventListener("mousedown", onFirstGesture);
      window.removeEventListener("keydown", onFirstGesture);
    }
    window.addEventListener("pointerdown", onFirstGesture, { passive: true });
    window.addEventListener("touchstart", onFirstGesture, { passive: true });
    window.addEventListener("mousedown", onFirstGesture, { passive: true });
    window.addEventListener("keydown", onFirstGesture);

    return () => {
      window.removeEventListener("pointerdown", onFirstGesture);
      window.removeEventListener("touchstart", onFirstGesture);
      window.removeEventListener("mousedown", onFirstGesture);
      window.removeEventListener("keydown", onFirstGesture);
    };

// eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function syncCurrency() {
      try {
        const localCur = localStorage.getItem("foodapp_currency");
        if (!cancelled) setCurrency(normalizeCurrency(localCur));
      } catch {
        if (!cancelled) setCurrency(DEFAULT_CURRENCY);
      }

      const dbCur = await fetchCurrencyFromDB();
      const normalized = normalizeCurrency(dbCur);
      if (cancelled) return;
      setCurrency(normalized);
      try {
        localStorage.setItem("foodapp_currency", normalized);
      } catch {}
    }

    syncCurrency();
    return () => {
      cancelled = true;
    };
  }, []);

  // Responsive helper (PWA / phones)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 640px)");
    const apply = () => setIsMobile(!!mq.matches);
    apply();
    if (typeof mq.addEventListener === "function") mq.addEventListener("change", apply);
    else mq.addListener?.(apply);
    return () => {
      if (typeof mq.removeEventListener === "function") mq.removeEventListener("change", apply);
      else mq.removeListener?.(apply);
    };
  }, []);

  // =========================
  // Push notification state (detect + keep in sync)
  // =========================
  useEffect(() => {
    refreshPushState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    refreshPushState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // =========================
  // âœ… Option 2: Offer Screen (Accept/Reject with timer)
  // =========================
  const [offerOpen, setOfferOpen] = useState(false);
  const [offerOrder, setOfferOrder] = useState(null);
  const [offerSecondsLeft, setOfferSecondsLeft] = useState(OFFER_SECONDS_DEFAULT);
  const offerIntervalRef = useRef(null);
  const [declinedOfferIds, setDeclinedOfferIds] = useState(() => new Set());

  // Realtime channels (prevent duplicates)
  const readyRestaurantChannelRef = useRef(null);
  const readyGroceryChannelRef = useRef(null);
  const deliveryEventsChannelRef = useRef(null);
  const seenDeliveryEventKeysRef = useRef(new Set());
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

  function persistPayoutRequests(next) {
    try {
      if (!userId) return;
      localStorage.setItem(`delivery_payout_requests_${userId}`, JSON.stringify(next || []));
    } catch {}
  }

  function normalizePayoutRequestStatus(v) {
    const s = String(v || "").trim().toLowerCase();
    if (s === "paid") return "paid";
    if (s === "processing") return "processing";
    if (s === "failed") return "failed";
    return "requested";
  }

  function normalizePayoutRequest(row) {
    const source = String(row?.source || row?.request_source || "all");
    const range = String(row?.range || row?.request_range || "all");
    const status = normalizePayoutRequestStatus(row?.status);
    const createdAt = row?.created_at || row?.createdAt || new Date().toISOString();
    const totalAmount = nnum(row?.total_amount ?? row?.amount_total ?? row?.total, 0);
    const orderIds = Array.isArray(row?.order_ids) ? row.order_ids : [];
    const orderKeys = Array.isArray(row?.order_keys) ? row.order_keys : [];
    const count = nnum(row?.count ?? orderIds.length ?? orderKeys.length, 0);

    return {
      id: row?.id || `REQ-${Date.now()}`,
      created_at: createdAt,
      status,
      source,
      range,
      order_ids: orderIds,
      order_keys: orderKeys,
      total_amount: totalAmount,
      count,
    };
  }

  async function fetchPayoutSnapshotViaApi(uid) {
    if (!uid) return null;
    try {
      const res = await fetch(`/api/delivery/payouts?deliveryUserId=${encodeURIComponent(uid)}`, {
        method: "GET",
        cache: "no-store",
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.success) return null;
      return payload;
    } catch {
      return null;
    }
  }

  async function saveBankViaApi(payload) {
    try {
      const res = await fetch("/api/delivery/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "save_bank", ...payload }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.success) return { ok: false, payload: body };
      return { ok: true, payload: body };
    } catch {
      return { ok: false, payload: {} };
    }
  }

  async function createPayoutViaApi(payload) {
    try {
      const res = await fetch("/api/delivery/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "request_payout", ...payload }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.success) return { ok: false, payload: body };
      return { ok: true, payload: body };
    } catch {
      return { ok: false, payload: {} };
    }
  }

  async function loadPayoutRequestsForUser(uid) {
    if (!uid) return { mode: "local", rows: [] };

    try {
      const snapshot = await fetchPayoutSnapshotViaApi(uid);
      if (snapshot?.success) {
        const rows = Array.isArray(snapshot.requests) ? snapshot.requests.map(normalizePayoutRequest) : [];
        return { mode: "db", rows };
      }
    } catch {}

    try {
      const { data, error } = await supabase
        .from(PAYOUT_REQUESTS_TABLE)
        .select("id, delivery_user_id, status, source, range, order_ids, order_keys, total_amount, count, created_at")
        .eq("delivery_user_id", uid)
        .order("created_at", { ascending: false });

      if (!error) {
        const rows = Array.isArray(data) ? data.map(normalizePayoutRequest) : [];
        return { mode: "db", rows };
      }
    } catch {}

    try {
      const raw = localStorage.getItem(`delivery_payout_requests_${uid}`);
      const arr = raw ? JSON.parse(raw) : [];
      const rows = Array.isArray(arr) ? arr.map(normalizePayoutRequest) : [];
      return { mode: "local", rows };
    } catch {
      return { mode: "local", rows: [] };
    }
  }

  function persistBankLocal(uid, row) {
    try {
      if (!uid) return;
      localStorage.setItem(`delivery_payout_bank_${uid}`, JSON.stringify(row || {}));
    } catch {}
  }

  function normalizeBankRow(row) {
    const accountLast4 = String(row?.account_number_last4 || "").trim();
    const routingLast4 = String(row?.routing_code_last4 || "").trim();
    return {
      account_holder_name: String(row?.account_holder_name || "").trim(),
      bank_name: String(row?.bank_name || "").trim(),
      account_number: "",
      routing_code: "",
      country: String(row?.country || "US").trim().toUpperCase() || "US",
      currency: normalizeCurrency(row?.currency || "USD"),
      account_number_last4: accountLast4,
      routing_code_last4: routingLast4,
      status: String(row?.status || "pending_verification").trim().toLowerCase() || "pending_verification",
      updated_at: row?.updated_at || row?.created_at || "",
    };
  }

  async function loadBankDetailsForUser(uid) {
    if (!uid) return { mode: "local", row: null };

    try {
      const snapshot = await fetchPayoutSnapshotViaApi(uid);
      if (snapshot?.success && snapshot?.bank) {
        return { mode: "db", row: normalizeBankRow(snapshot.bank) };
      }
    } catch {}

    try {
      const { data, error } = await supabase
        .from(PAYOUT_BANK_TABLE)
        .select("id, delivery_user_id, account_holder_name, bank_name, account_number_last4, routing_code_last4, country, currency, status, created_at, updated_at")
        .eq("delivery_user_id", uid)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data) return { mode: "db", row: normalizeBankRow(data) };
    } catch {}

    try {
      const raw = localStorage.getItem(`delivery_payout_bank_${uid}`);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === "object") return { mode: "local", row: normalizeBankRow(parsed) };
    } catch {}

    return { mode: "local", row: null };
  }

  async function saveBankDetails() {
    if (!userId) return showToast("Not logged in");
    if (!deliveryAllowed) return showToast("Account not approved");

    const account_holder_name = String(bankForm.account_holder_name || "").trim();
    const bank_name = String(bankForm.bank_name || "").trim();
    const account_number = String(bankForm.account_number || "").replace(/\s+/g, "");
    const routing_code = String(bankForm.routing_code || "").replace(/\s+/g, "");
    const country = String(bankForm.country || "US").trim().toUpperCase() || "US";
    const cur = normalizeCurrency(bankForm.currency || "USD");

    if (!account_holder_name || !bank_name || !account_number || !routing_code) {
      return showToast("Fill all required bank fields");
    }
    if (account_number.length < 6) return showToast("Enter valid account number");
    if (routing_code.length < 4) return showToast("Enter valid routing/IFSC");

    setBankBusy(true);
    setErrMsg("");

    const accountLast4 = account_number.slice(-4);
    const routingLast4 = routing_code.slice(-4);
    const nowIso = new Date().toISOString();
    const dbRowBase = {
      delivery_user_id: userId,
      account_holder_name,
      bank_name,
      account_number_last4: accountLast4,
      routing_code_last4: routingLast4,
      country,
      currency: cur,
      status: "pending_verification",
      updated_at: nowIso,
    };
    const dbRowFull = {
      ...dbRowBase,
      account_number_full: account_number,
      routing_code_full: routing_code,
    };
    const localRow = {
      account_holder_name,
      bank_name,
      account_number_full: account_number,
      routing_code_full: routing_code,
      account_number_last4: accountLast4,
      routing_code_last4: routingLast4,
      country,
      currency: cur,
      status: "pending_verification",
      updated_at: nowIso,
    };

    try {
      const apiSave = await saveBankViaApi({
        delivery_user_id: userId,
        account_holder_name,
        bank_name,
        account_number,
        routing_code,
        country,
        currency: cur,
      });
      if (apiSave.ok) {
        const normalized = normalizeBankRow(apiSave?.payload?.bank || dbRowBase);
        const normalizedUpdatedAt = String(normalized.updated_at || nowIso);
        persistBankLocal(userId, { ...localRow, status: normalized.status, updated_at: normalizedUpdatedAt });
        setBankStoreMode("db");
        setBankSavedAt(normalizedUpdatedAt);
        setBankForm((prev) => ({
          ...prev,
          account_holder_name,
          bank_name,
          account_number: "",
          routing_code: "",
          country,
          currency: cur,
          account_number_last4: accountLast4,
          routing_code_last4: routingLast4,
          status: normalized.status || "pending_verification",
        }));
        showToast("Bank details saved (pending verification)");
        return;
      }

      try {
        let { error } = await supabase.from(PAYOUT_BANK_TABLE).upsert([dbRowFull], { onConflict: "delivery_user_id" });
        if (error) {
          // Backward-compatible fallback when full-detail columns are not added yet.
          const retry = await supabase.from(PAYOUT_BANK_TABLE).upsert([dbRowBase], { onConflict: "delivery_user_id" });
          error = retry.error;
        }
        if (!error) {
          persistBankLocal(userId, localRow);
          setBankStoreMode("db");
          setBankSavedAt(nowIso);
          setBankForm((prev) => ({
            ...prev,
            account_holder_name,
            bank_name,
            account_number: "",
            routing_code: "",
            country,
            currency: cur,
            account_number_last4: accountLast4,
            routing_code_last4: routingLast4,
            status: "pending_verification",
          }));
          showToast("Bank details saved (pending verification)");
          return;
        }
      } catch {}

      persistBankLocal(userId, localRow);
      setBankStoreMode("local");
      setBankSavedAt(nowIso);
      setBankForm((prev) => ({
        ...prev,
        account_holder_name,
        bank_name,
        account_number: "",
        routing_code: "",
        country,
        currency: cur,
        account_number_last4: accountLast4,
        routing_code_last4: routingLast4,
        status: "pending_verification",
      }));
      showToast("Bank details saved (local mode)");
    } finally {
      setBankBusy(false);
    }
  }

  function closeOffer(silent = false) {
    try {
      if (offerIntervalRef.current) clearInterval(offerIntervalRef.current);
    } catch {}
    offerIntervalRef.current = null;
    setOfferOpen(false);
    setOfferOrder(null);
    setOfferSecondsLeft(OFFER_SECONDS_DEFAULT);
    if (!silent) {
      // no toast by default
    }
  }

  function declineOffer(orderId, reason = "declined") {
    try {
      if (orderId) {
        setDeclinedOfferIds((prev) => {
          const next = new Set(Array.from(prev || []));
          next.add(String(orderId));
          return next;
        });
      }
    } catch {}

    closeOffer(true);

    if (reason === "timeout") showToast("Offer expired");
    else showToast("Offer declined");
  }

  function openOffer(orderRow) {
    if (!orderRow?.id) return;

    setOfferOrder(orderRow);
    setOfferSecondsLeft(OFFER_SECONDS_DEFAULT);
    setOfferOpen(true);

    // vibrate on mobile (best effort)
    try {
      if (navigator?.vibrate) navigator.vibrate([120, 60, 120]);
    } catch {}
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

  const payoutOrderStatusMap = useMemo(() => {
    const rank = { failed: 1, requested: 2, processing: 3, paid: 4 };
    const map = {};
    for (const req of payoutRequests || []) {
      const st = normalizePayoutRequestStatus(req?.status);
      const keys = Array.isArray(req?.order_keys) ? req.order_keys : [];
      for (const k0 of keys) {
        const k = String(k0 || "");
        if (!k) continue;
        const prev = map[k];
        if (!prev || (rank[st] || 0) >= (rank[prev] || 0)) map[k] = st;
      }
    }
    return map;
  }, [payoutRequests]);

  function earningStatus(o) {
    const dbStatus = String(o?.delivery_earning_status || "").toLowerCase();
    if (dbStatus === "paid") return "paid";

    const key = `${String(o?._source || "restaurant")}:${String(o?.id || "")}`;
    const reqStatus = payoutOrderStatusMap[key];
    if (reqStatus === "paid") return "paid";
    if (reqStatus === "processing") return "processing";
    if (reqStatus === "requested") return "requested";
    if (dbStatus === "unpaid" || reqStatus === "failed") return "unpaid";
    return "unpaid";
  }

  // âœ… IMPORTANT:
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
          .select("id, name, address, phone, lat, lng")
          .in("id", storeIds);

        if (!sErr && stores) {
          const map = {};
          for (const s of stores) map[s.id] = s;

          for (const r of rows) {
            const st = map[r.store_id];
            if (st) {
              r._store_name = pick(st, ["name", "store_name"], "");
              // try multiple column possibilities for gps
              r._pickup_lat = pick(st, ["lat", "latitude", "location_lat", "store_lat"], null);
              r._pickup_lng = pick(st, ["lng", "longitude", "location_lng", "store_lng"], null);
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
          .select("id, name, address, phone, lat, lng")
          .in("id", storeIds);

        if (!sErr && stores) {
          const map = {};
          for (const s of stores) map[s.id] = s;

          for (const r of rows) {
            const st = map[r.store_id];
            if (st) {
              r._store_name = pick(st, ["name", "store_name"], "");
              r._pickup_lat = pick(st, ["lat", "latitude", "location_lat", "store_lat"], null);
              r._pickup_lng = pick(st, ["lng", "longitude", "location_lng", "store_lng"], null);
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

    // Delivery events for this driver (used for in-app alerts + push/bell)
    if (!deliveryEventsChannelRef.current) {
      const ch = supabase
        .channel(`delivery_events_${userId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "delivery_events",
            filter: `delivery_user_id=eq.${userId}`,
          },
          (payload) => {
            try {
              const row = payload?.new || {};
              const key =
                row?.id ||
                `${row?.event_type || "event"}:${row?.order_type || ""}:${row?.order_id || ""}:${row?.created_at || ""}`;

              if (seenDeliveryEventKeysRef.current.has(key)) return;
              seenDeliveryEventKeysRef.current.add(key);

              const orderTypeLabel =
                row?.order_type === "grocery"
                  ? "Grocery"
                  : row?.order_type === "restaurant"
                  ? "Restaurant"
                  : "Order";

              const title = row?.title || `New ${orderTypeLabel} update`;
              const body =
                row?.message ||
                (row?.event_type
                  ? `${orderTypeLabel} - ${String(row.event_type).replaceAll("_", " ")}`
                  : `You have a new update`);

              const evt = String(row?.event_type || "").trim().toLowerCase();
              const isSilentTrackingEvent =
                evt === "gps" ||
                evt === "location" ||
                evt === "tracking" ||
                evt === "heartbeat";

              // âœ… SAFE FIX:
              // Do not alert repeatedly for GPS/tracking inserts.
              // Those events can fire every few seconds while the delivery app is open.
              // We only alert for real order updates.
              if (!isSilentTrackingEvent) {
                showToast(`${title} - ${body}`);
                playAlert();

                // browser notification (only if already allowed)
                if (typeof window !== "undefined" && "Notification" in window) {
                  if (Notification.permission === "granted") {
                    // eslint-disable-next-line no-new
                    new Notification(title, { body });
                  }
                }
              }
            } catch (e) {
              // never break delivery page if realtime payload is weird
              console.error("delivery_events realtime error", e);
            }
          }
        )
        .subscribe();

      deliveryEventsChannelRef.current = ch;
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
      const st = normStatus(order.status);
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
        deliveryEventsChannelRef.current,
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
      deliveryEventsChannelRef.current = null;
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
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const result = await loadPayoutRequestsForUser(userId);
      if (cancelled) return;
      setPayoutStoreMode(result.mode);
      setPayoutRequests(result.rows || []);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const result = await loadBankDetailsForUser(userId);
      if (cancelled) return;
      setBankStoreMode(result.mode || "local");
      if (result.row) {
        const row = result.row;
        setBankSavedAt(String(row.updated_at || ""));
        setBankForm((prev) => ({
          ...prev,
          account_holder_name: String(row.account_holder_name || ""),
          bank_name: String(row.bank_name || ""),
          account_number: "",
          routing_code: "",
          country: String(row.country || "US"),
          currency: normalizeCurrency(row.currency || prev.currency || "USD"),
          account_number_last4: String(row.account_number_last4 || ""),
          routing_code_last4: String(row.routing_code_last4 || ""),
          status: String(row.status || "pending_verification"),
        }));
      } else {
        setBankSavedAt("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    try {
      if (!userId) return;
      if (!deliveryAllowed) return;

      const list = myOrders || [];
      for (const o of list) {
        const src = o?._source || "restaurant";
        const effective = statusOverride[`${src}:${o?.id}`] || o?.status;
        if (!isDeliveredLikeStatus(effective)) autoStartIfNeeded(o);
        else autoStopIfDelivered(o.id);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myOrders, userId, deliveryAllowed, statusOverride]);

  useEffect(() => {
    const list = availableOrders || [];
    const current = list.length;
    const prev = lastAvailableCountRef.current;
    lastAvailableCountRef.current = current;

    const shouldNotify = !loading && isOnline && deliveryAllowed && tab === "available" && current > prev && prev !== 0;

    if (shouldNotify) {
      // Pick the first order that hasn't been declined in this session.
      const pick = list.find((x) => x && !declinedOfferIds?.has?.(x.id));
      if (pick) {
        // Open Offer (DoorDash-style) + trigger alerts.
        setOfferOrder(pick);
        setOfferSecondsLeft(OFFER_SECONDS_DEFAULT);
        setOfferOpen(true);

        // Alerts: beep + vibration (best-effort)
        playNewOrderBeep();
        vibrateNewOrder();

        // If audio is blocked, show a one-time hint.
        if (!audioReadyRef.current && !warnedSoundRef.current && soundEnabled) {
          warnedSoundRef.current = true;
          showToast("Tap once to enable sound");
        }
      } else {
        showToast(`New order available (+${current - prev})`);
      }
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
      // Keep desktop progression aligned with mobile/details behavior:
      // local state is already updated above, so avoid immediate overwrite from a stale refetch.
      if (normStatus(dbStatus) === "delivered") {
        await loadMy();
      }
      if (userId) {
        const payoutRes = await loadPayoutRequestsForUser(userId);
        setPayoutStoreMode(payoutRes.mode);
        setPayoutRequests(payoutRes.rows || []);
      }
      showToast("Refreshed");
    } catch (e) {
      setErrMsg(e?.message || String(e));
    }
  }

  async function requestPayoutBatch() {
    try {
      if (!deliveryAllowed) return showToast("Account not approved");
      if (!bankGate.ok) return showToast(bankGate.reason);

      const rows = payoutCenter.availableRows || [];
      if (rows.length === 0) return showToast("No available payouts");
      if (!payoutCenter.canRequest) {
        return showToast(`Minimum cashout is ${money(payoutCenter.minCashout, currency)}`);
      }

      const createdAt = new Date().toISOString();
      const requestId = `REQ-${Date.now()}`;
      const orderKeys = rows.map((o) => `${String(o?._source || "restaurant")}:${String(o?.id || "")}`);
      const orderIds = rows.map((o) => o?.id).filter(Boolean);

      const requestRow = {
        id: requestId,
        created_at: createdAt,
        delivery_user_id: userId,
        status: "requested",
        source: payoutSource,
        range: payoutRange,
        order_ids: orderIds,
        order_keys: orderKeys,
        total_amount: payoutCenter.availableAmount,
        count: rows.length,
      };

      let savedInDB = false;
      const localRow = normalizePayoutRequest(requestRow);
      try {
        const apiCreate = await createPayoutViaApi(requestRow);
        if (apiCreate.ok) {
          savedInDB = true;
          const apiRow = normalizePayoutRequest(apiCreate?.payload?.request || requestRow);
          const next = [apiRow, ...(payoutRequests || []).filter((r) => String(r?.id || "") !== String(apiRow.id || ""))];
          setPayoutStoreMode("db");
          setPayoutRequests(next);
          persistPayoutRequests(next);
          showToast(`Payout requested: ${money(payoutCenter.availableAmount, currency)} (${rows.length} orders)`);
          return;
        }

        const { error } = await supabase.from(PAYOUT_REQUESTS_TABLE).insert([requestRow]);
        if (!error) savedInDB = true;
      } catch {}

      if (savedInDB) {
        const next = [localRow, ...(payoutRequests || []).filter((r) => String(r?.id || "") !== String(localRow.id || ""))];
        setPayoutStoreMode("db");
        setPayoutRequests(next);
        persistPayoutRequests(next);
        showToast(`Payout requested: ${money(payoutCenter.availableAmount, currency)} (${rows.length} orders)`);
        return;
      }

      const next = [localRow, ...(payoutRequests || [])];
      setPayoutStoreMode("local");
      setPayoutRequests(next);
      persistPayoutRequests(next);
      showToast(`Payout requested (local mode): ${money(payoutCenter.availableAmount, currency)} (${rows.length} orders)`);
    } catch {
      showToast("Could not create payout request");
    }
  }

  // âœ… Accept order (restaurant OR grocery)
  async function notifyCustomerDeliveryStatus(orderRow, nextStatus) {
    const orderId = orderRow?.id;
    const src = orderRow?._source;
    if (!orderId || !src) return;

    try {
      const table = src === "grocery" ? "grocery_orders" : "orders";
      const userCol = src === "grocery" ? "customer_user_id" : "user_id";
      const link = src === "grocery" ? "/groceries/orders" : "/orders";
      const label = src === "grocery" ? "grocery order" : "order";

      const { data: freshRow, error: freshErr } = await supabase
        .from(table)
        .select(`id, ${userCol}, status`)
        .eq("id", orderId)
        .maybeSingle();

      if (freshErr) throw freshErr;

      const customerUserId = freshRow?.[userCol] || orderRow?.[userCol] || null;
      if (!customerUserId) return;

      const shortId = String(freshRow?.id || orderId).slice(0, 8);
      const status = String(nextStatus || freshRow?.status || "").toLowerCase();

      let title = "Order update";
      let body = `Your ${label} ${shortId ? "#" + shortId : ""} has a new update.`;

      if (["delivering", "on_the_way", "picked_up"].includes(status)) {
        title = "Out for delivery";
        body = `Your ${label} ${shortId ? "#" + shortId : ""} is on the way.`;
      } else if (status === "delivered") {
        title = "Order delivered";
        body = `Your ${label} ${shortId ? "#" + shortId : ""} was delivered.`;
      } else {
        return;
      }

      await supabase.from("notifications").insert({
        user_id: customerUserId,
        title,
        body,
        type: "order",
        link,
        is_read: false,
      });
    } catch (err) {
      console.warn("[customer-notify:delivery] failed", { orderId, src, nextStatus, err });
    }
  }
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
        setErrMsg("This order was already taken by another delivery partner.");
        await loadAvailable();
        await loadMy();
        return;
      }

      const res = await tryInsertDeliveryEvent({ orderId, eventType: `accepted_${src}`, note: null });
      if (!res.ok) showToast(`delivery_events insert failed: ${res.error}`);

      notifyCustomerDeliveryStatus(orderRow, "delivering");

      showToast(`${src === "grocery" ? "Grocery" : "Restaurant"} order accepted`);
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

  
  // âœ… Status progression lock (prevents skipping steps / going backward)
  function isAllowedStatusTransition(currentStatus, nextStatus) {
    const cur = normStatus(currentStatus);
    const nxt = normStatus(nextStatus);

    // Delivery flow we enforce (for both restaurant + grocery)
    const flow = ["delivering", "arrived_pickup", "picked_up", "on_the_way", "arrived_drop", "delivered"];

    const curIdx = flow.indexOf(cur);
    const nxtIdx = flow.indexOf(nxt);

    // If either status is outside our known flow, don't block (backward-compat safety)
    if (curIdx === -1 || nxtIdx === -1) return true;

    // Allow staying the same (no-op)
    if (curIdx === nxtIdx) return true;

    // Only allow moving forward by exactly 1 step
    return nxtIdx === curIdx + 1;
  }

// âœ… Update status (restaurant OR grocery)
  async function updateMyStatus(orderRow, status) {
    const orderId = orderRow?.id;
    const src = orderRow?._source;
    if (!orderId || !src) return;

    if (!deliveryAllowed) return showToast("Account not approved");

    // âœ… Enforce correct step-by-step delivery status order (prevents skipping)
    const curStatus = statusOverride[`${src}:${orderId}`] || orderRow?.status;
    if (!isAllowedStatusTransition(curStatus, status)) {
      showToast("Invalid status step. Please follow the next action button order.");
      return;
    }

    setErrMsg("");
    setBusyId(orderId);

    try {
      const table = src === "grocery" ? "grocery_orders" : "orders";
      const dbStatus =
        normStatus(status) === "arrived_pickup"
          ? "picked_up"
          : normStatus(status) === "arrived_drop"
          ? "delivered"
          : status;
      const patch = { status: dbStatus };

      if (normStatus(dbStatus) === "delivered") {
        patch.delivered_at = new Date().toISOString();
      }

      let { error } = await supabase
        .from(table)
        .update(patch)
        .eq("id", orderId)
        .eq("delivery_user_id", userId);

      // Fallback for schemas/data where delivery_user_id may not match exactly on desktop session.
      // RLS still protects unauthorized updates.
      if (!error) {
        const rLoose = await supabase.from(table).update(patch).eq("id", orderId);
        error = rLoose.error || null;
      }

      // Some schemas may not have delivered_at; still persist status safely.
      if (error && isMissingColumnError(error?.message || String(error))) {
        const patch2 = { status: dbStatus };
        const r2 = await supabase
          .from(table)
          .update(patch2)
          .eq("id", orderId)
          .eq("delivery_user_id", userId);
        error = r2.error || null;
        if (!error) {
          const r2Loose = await supabase.from(table).update(patch2).eq("id", orderId);
          error = r2Loose.error || null;
        }
      }

      if (error) throw error;

      const res = await tryInsertDeliveryEvent({ orderId, eventType: `${status}_${src}`, note: null });
      if (!res.ok) showToast(`delivery_events insert failed: ${res.error}`);

      if (normStatus(dbStatus) === "delivered") stopTracking(orderId, true);
      setStatusOverride((m) => ({ ...(m || {}), [`${src}:${orderId}`]: dbStatus }));

      // âœ… UI sync: update the open details panel + local list immediately
      // (DB already updated; this prevents the action bar from staying on the previous step)
      try {
        const deliveredAt = normStatus(dbStatus) === "delivered" ? new Date().toISOString() : undefined;

        // Update local myOrders state (fast UI)
        setMyOrders((prev) =>
          (prev || []).map((o) =>
            String(o?.id) === String(orderId) ? { ...o, status: dbStatus, ...(deliveredAt ? { delivered_at: deliveredAt } : {}) } : o
          )
        );

        // If the details drawer/sheet is open for this order, update it too
        setDetailsCtx((ctx) => {
          const curId = ctx?.order?.id;
          if (!ctx?.order || String(curId) !== String(orderId)) return ctx;
          return {
            ...(ctx || {}),
            order: {
              ...(ctx.order || {}),
              status: dbStatus,
              ...(deliveredAt ? { delivered_at: deliveredAt } : {}),
            },
          };
        });
      } catch {
        // ignore
      }

      await loadMy();

      if (normStatus(dbStatus) === "delivered") {
        notifyCustomerDeliveryStatus(orderRow, "delivered");
        showToast("Delivered");
        setTab("completed");
      } else {
        showToast("Status updated");
      }
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
      showToast("Rating saved");
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
        padding: isMobile ? 12 : 24,
        background:
          "radial-gradient(1200px 650px at 18% 8%, rgba(59,130,246,0.18), transparent 62%), radial-gradient(900px 520px at 82% 22%, rgba(16,185,129,0.12), transparent 58%), linear-gradient(180deg, #f4f6fb, #ffffff)",
      },
      wrap: { width: "100%", margin: "0 auto" },
      title: { margin: 0, fontSize: isMobile ? 28 : 34, fontWeight: 950, letterSpacing: -0.3, lineHeight: 1.05 },
      sub: { marginTop: 6, color: "#666", fontSize: 14 },

      row: { display: "flex", gap: isMobile ? 10 : 12, flexWrap: "wrap", alignItems: "center" },

      pill: {
        padding: "6px 10px",
        borderRadius: 999,
        border: "1px solid rgba(0,0,0,0.10)",
        background: "rgba(0,0,0,0.04)",
        fontWeight: 850,
        fontSize: 12,
      },

      btn: {
        padding: isMobile ? "12px 12px" : "10px 12px",
        borderRadius: 14,
        border: "1px solid rgba(0,0,0,0.12)",
        background: "#0B1220",
        color: "#fff",
        cursor: "pointer",
        fontWeight: 950,
        minHeight: isMobile ? 44 : undefined,
      },
      btnGhost: {
        padding: isMobile ? "12px 12px" : "10px 12px",
        borderRadius: 14,
        border: "1px solid rgba(0,0,0,0.12)",
        background: "rgba(255,255,255,0.8)",
        cursor: "pointer",
        fontWeight: 950,
        minHeight: isMobile ? 44 : undefined,
      },
      btnSoft: {
        padding: isMobile ? "12px 12px" : "10px 12px",
        borderRadius: 14,
        border: "1px solid rgba(0,0,0,0.12)",
        background: "rgba(11,18,32,0.05)",
        cursor: "pointer",
        fontWeight: 950,
        minHeight: isMobile ? 44 : undefined,
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
        gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))",
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
        gridTemplateColumns: isMobile ? "1fr" : "1.3fr 0.7fr",
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
        background: "rgba(11,18,32,0.05)",
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
        background: active ? "#0B1220" : "rgba(255,255,255,0.86)",
        color: active ? "#fff" : "#0B1220",
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
        background: active ? "#0B1220" : "rgba(255,255,255,0.86)",
        color: active ? "#fff" : "#0B1220",
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
        minWidth: isMobile ? 0 : 240,
        width: isMobile ? "100%" : undefined,
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
        background: "rgba(11,18,32,0.94)",
        color: "#fff",
        padding: "10px 12px",
        boxShadow: "0 12px 40px rgba(0,0,0,0.22)",
        fontWeight: 950,
        fontSize: 13,
        maxWidth: 420,
      },

      // âœ… Sticky summary bar (mobile pro)
      stickySummary: {
        position: "sticky",
        top: isMobile ? 6 : 10,
        zIndex: 60,
        marginTop: 12,
        borderRadius: 16,
        border: "1px solid rgba(0,0,0,0.10)",
        background: "rgba(255,255,255,0.90)",
        boxShadow: "0 14px 40px rgba(0,0,0,0.10)",
        backdropFilter: "blur(10px)",
        padding: 12,
      },
      stickyRow: {
        display: "flex",
        gap: 10,
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
      },
      stickyItem: {
        display: "flex",
        flexDirection: "column",
        gap: 2,
        minWidth: 110,
      },
      stickyLabel: {
        fontSize: 11,
        fontWeight: 950,
        color: "rgba(17,24,39,0.55)",
        textTransform: "uppercase",
        letterSpacing: 0.4,
      },
      stickyValue: {
        fontSize: 16,
        fontWeight: 1000,
        color: "#0b1220",
      },
      onlinePill: (on) => ({
        padding: "8px 10px",
        borderRadius: 999,
        border: on ? "1px solid rgba(16,185,129,0.25)" : "1px solid rgba(239,68,68,0.22)",
        background: on ? "rgba(236,253,245,0.95)" : "rgba(254,242,242,0.95)",
        color: on ? "#065f46" : "#7f1d1d",
        fontWeight: 1000,
        fontSize: 12,
      }),

      // =========================
      // Offer Screen (Option 2)
      // =========================
      offerBackdrop: {
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "rgba(0,0,0,0.40)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        padding: 12,
      },
      offerSheet: {
        width: "100%",
        maxWidth: 520,
        borderRadius: 18,
        border: "1px solid rgba(255,255,255,0.16)",
        background: "rgba(255,255,255,0.95)",
        boxShadow: "0 18px 60px rgba(0,0,0,0.30)",
        overflow: "hidden",
      },
      offerTopRow: {
        display: "flex",
        gap: 12,
        alignItems: "center",
        justifyContent: "space-between",
        padding: 14,
        borderBottom: "1px solid rgba(0,0,0,0.08)",
        background: "linear-gradient(180deg, rgba(17,24,39,0.03), rgba(255,255,255,0.90))",
      },
      offerTitle: { fontSize: 16, fontWeight: 1000, color: "#0b1220" },
      offerSub: { marginTop: 2, fontSize: 12, fontWeight: 900, color: "rgba(17,24,39,0.65)" },
      offerTimer: {
        minWidth: 56,
        textAlign: "center",
        padding: "8px 10px",
        borderRadius: 999,
        border: "1px solid rgba(0,0,0,0.10)",
        background: "rgba(0,0,0,0.04)",
        fontWeight: 1000,
      },
      offerBody: {
        padding: 14,
        paddingBottom: "calc(14px + env(safe-area-inset-bottom))",
      },
      offerCard: {
        borderRadius: 16,
        border: "1px solid rgba(0,0,0,0.08)",
        background: "rgba(255,255,255,0.85)",
        padding: 12,
      },
      offerBtns: { marginTop: 12, display: "flex", gap: 10 },
      offerLabel: { fontSize: 12, fontWeight: 950, color: "rgba(17,24,39,0.65)" },
      offerValue: { marginTop: 2, fontSize: 14, fontWeight: 950, color: "#0b1220", lineHeight: 1.35 },
      offerHint: { marginTop: 10, fontSize: 12, fontWeight: 850, color: "rgba(17,24,39,0.60)" },

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
        color: active ? "#fff" : "#0B1220",
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
        background: "rgba(11,18,32,0.05)",
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
        color: active ? "#fff" : "#0B1220",
        cursor: "pointer",
        fontWeight: 950,
        fontSize: 12,
      }),
    };
  }, [deliveryStatus, isMobile]);

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
    return list.filter((o) => {
      const src = o?._source || "restaurant";
      const effective = statusOverride[`${src}:${o?.id}`] || o?.status;
      return !isDeliveredLikeStatus(effective) && !isCanceledLikeStatus(effective);
    });
  }, [myOrders, statusOverride]);

  const completedOrders = useMemo(() => {
    const list = myOrders || [];
    return list.filter((o) => {
      const src = o?._source || "restaurant";
      const effective = statusOverride[`${src}:${o?.id}`] || o?.status;
      return isDeliveredLikeStatus(effective) && !isCanceledLikeStatus(effective);
    });
  }, [myOrders, statusOverride]);

  const canceledOrders = useMemo(() => {
    const list = myOrders || [];
    return list.filter((o) => {
      const src = o?._source || "restaurant";
      const effective = statusOverride[`${src}:${o?.id}`] || o?.status;
      return isCanceledLikeStatus(effective);
    });
  }, [myOrders, statusOverride]);

  const now = new Date();
  const todayKey = toISOKey(now);
  const weekStart = startOfWeekMonday(now);
  const monthStartDate = monthStart(now);

  useEffect(() => {
    if (earnRange === "custom") return;
    const end = startOfDay(new Date());
    const days = earnRange === "7d" ? 7 : earnRange === "90d" ? 90 : 30;
    const start = startOfDay(addDays(end, -(days - 1)));
    setEarnFrom(toISOKey(start));
    setEarnTo(toISOKey(end));
  }, [earnRange]);

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
      label: "-",
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

  const earningsPro = useMemo(() => {
    const fromDt = earnFrom ? startOfDay(new Date(`${earnFrom}T00:00:00`)) : null;
    const toDtExclusive = earnTo ? addDays(startOfDay(new Date(`${earnTo}T00:00:00`)), 1) : null;

    let filtered = (completedOrders || []).filter((o) => {
      const deliveredAt = safeDate(o.delivered_at || o.updated_at || o.created_at);
      if (!deliveredAt) return false;
      if (fromDt && deliveredAt < fromDt) return false;
      if (toDtExclusive && deliveredAt >= toDtExclusive) return false;
      if (earnSource !== "all" && String(o?._source || "") !== earnSource) return false;
      if (earnPayState === "paid" && earningStatus(o) !== "paid") return false;
      if (earnPayState === "unpaid" && earningStatus(o) === "paid") return false;
      return true;
    });

    filtered = [...filtered].sort((a, b) => {
      const ad = safeDate(a.delivered_at || a.updated_at || a.created_at)?.getTime() || 0;
      const bd = safeDate(b.delivered_at || b.updated_at || b.created_at)?.getTime() || 0;
      if (earnSort === "oldest") return ad - bd;
      if (earnSort === "payout_high") return orderPayout(b) - orderPayout(a);
      if (earnSort === "payout_low") return orderPayout(a) - orderPayout(b);
      return bd - ad;
    });

    let totalPayout = 0;
    let totalFee = 0;
    let totalTip = 0;
    let paidCount = 0;
    let unpaidCount = 0;
    let restaurantCount = 0;
    let groceryCount = 0;
    const byDay = {};

    for (const o of filtered) {
      const payout = orderPayout(o);
      const fee = orderFee(o);
      const tip = orderTip(o);
      const k = toISOKey(safeDate(o.delivered_at || o.updated_at || o.created_at) || new Date());

      totalPayout += payout;
      totalFee += fee;
      totalTip += tip;
      if (earningStatus(o) === "paid") paidCount += 1;
      else unpaidCount += 1;
      if (String(o?._source || "") === "grocery") groceryCount += 1;
      else restaurantCount += 1;

      if (!byDay[k]) byDay[k] = { key: k, count: 0, payout: 0 };
      byDay[k].count += 1;
      byDay[k].payout += payout;
    }

    const days = Object.values(byDay);
    const bestDay = days.reduce(
      (best, cur) => (cur.payout > best.payout ? cur : best),
      { key: "-", count: 0, payout: 0 }
    );

    return {
      rows: filtered,
      totalPayout: Math.round(totalPayout),
      totalFee: Math.round(totalFee),
      totalTip: Math.round(totalTip),
      avgPayout: filtered.length ? Math.round(totalPayout / filtered.length) : 0,
      paidCount,
      unpaidCount,
      restaurantCount,
      groceryCount,
      bestDay: { ...bestDay, payout: Math.round(bestDay.payout) },
    };
  }, [completedOrders, earnFrom, earnTo, earnSource, earnPayState, earnSort]);

  const payoutCenter = useMemo(() => {
    const now = new Date();
    const rangeStart =
      payoutRange === "7d"
        ? addDays(startOfDay(now), -6)
        : payoutRange === "30d"
        ? addDays(startOfDay(now), -29)
        : payoutRange === "90d"
        ? addDays(startOfDay(now), -89)
        : null;

    const customFrom = payoutRange === "custom" ? parseDateInputLocal(payoutFrom) : null;
    const customTo = payoutRange === "custom" ? parseDateInputLocal(payoutTo) : null;
    const fromDt = customFrom ? startOfDay(customFrom) : rangeStart;
    const toDtExclusive = customTo ? addDays(startOfDay(customTo), 1) : null;

    const requestedRequests = (payoutRequests || []).filter((r) => normalizePayoutRequestStatus(r?.status) === "requested");
    const processingRequests = (payoutRequests || []).filter((r) => normalizePayoutRequestStatus(r?.status) === "processing");
    const activeRequests = [...requestedRequests, ...processingRequests];
    const paidRequests = (payoutRequests || []).filter((r) => normalizePayoutRequestStatus(r?.status) === "paid");
    const failedRequests = (payoutRequests || []).filter((r) => normalizePayoutRequestStatus(r?.status) === "failed");

    let pool = (completedOrders || []).filter((o) => {
      if (payoutSource !== "all" && String(o?._source || "") !== payoutSource) return false;
      const dt = safeDate(o.delivered_at || o.updated_at || o.created_at);
      if (fromDt && toDtExclusive && toDtExclusive <= fromDt) return false;
      if (fromDt && dt && dt < fromDt) return false;
      if (toDtExclusive && dt && dt >= toDtExclusive) return false;
      return true;
    });

    const paidRows = pool.filter((o) => earningStatus(o) === "paid");
    const requestedRows = pool.filter((o) => {
      const s = earningStatus(o);
      return s === "requested" || s === "processing";
    });
    const unpaidRows = pool.filter((o) => {
      const s = earningStatus(o);
      return s !== "paid" && s !== "requested" && s !== "processing";
    });
    let availableRows = unpaidRows;

    availableRows = [...availableRows].sort((a, b) => {
      const ad = safeDate(a.delivered_at || a.updated_at || a.created_at)?.getTime() || 0;
      const bd = safeDate(b.delivered_at || b.updated_at || b.created_at)?.getTime() || 0;
      if (payoutSort === "oldest") return ad - bd;
      if (payoutSort === "amount_high") return orderPayout(b) - orderPayout(a);
      if (payoutSort === "amount_low") return orderPayout(a) - orderPayout(b);
      return bd - ad;
    });

    const sum = (rows) => rows.reduce((s, o) => s + orderPayout(o), 0);
    const availableAmount = Math.round(sum(availableRows));
    const requestedAmount = Math.round(sum(requestedRows));
    const paidAmount = Math.round(sum(paidRows));
    const minCashout = 25;

    return {
      availableRows,
      requestedRows,
      paidRows,
      availableAmount,
      requestedAmount,
      paidAmount,
      availableCount: availableRows.length,
      requestedCount: requestedRows.length,
      paidCount: paidRows.length,
      canRequest: availableRows.length > 0 && availableAmount >= minCashout,
      minCashout,
      activeRequests,
      requestedRequests,
      processingRequests,
      paidRequests,
      failedRequests,
    };
  }, [completedOrders, payoutRange, payoutFrom, payoutTo, payoutSource, payoutSort, payoutRequests]);

  const bankGate = useMemo(() => {
    const hasBasics =
      !!String(bankForm.account_holder_name || "").trim() &&
      !!String(bankForm.bank_name || "").trim() &&
      !!String(bankForm.account_number_last4 || "").trim() &&
      !!String(bankForm.routing_code_last4 || "").trim();

    if (!hasBasics) {
      return { ok: false, reason: "Add bank details before requesting payout." };
    }

    const st = String(bankForm.status || "").trim().toLowerCase();
    if (st === "approved") return { ok: true, reason: "" };
    if (st === "pending_verification" || st === "pending") {
      return { ok: false, reason: "Bank details pending admin verification." };
    }
    if (st === "rejected" || st === "failed") {
      return { ok: false, reason: "Bank details rejected. Update and resubmit." };
    }

    return { ok: false, reason: "Bank details not approved yet." };
  }, [bankForm]);

  const payoutCanRequest = payoutCenter.canRequest && bankGate.ok;

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


  // âœ… Option 2: Auto-show Offer Screen for next available order
  useEffect(() => {
    try {
      if (!deliveryAllowed) return;
      if (!isOnline) return;
      if (tab !== "available") return;
      if (loading) return;
      if (offerOpen) return;
      if (busyId) return;

      const list = (visibleAvailable || []).filter((o) => {
        const id = o?.id ? String(o.id) : "";
        return id && !declinedOfferIds.has(id);
      });

      if (list.length === 0) return;

      // Offer the newest/first visible order
      openOffer(list[0]);
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleAvailable, isOnline, tab, deliveryAllowed, loading, busyId, offerOpen]);

  // âœ… Option 2: Offer countdown timer
  useEffect(() => {
    if (!offerOpen) return;

    try {
      if (offerIntervalRef.current) clearInterval(offerIntervalRef.current);
    } catch {}

    offerIntervalRef.current = setInterval(() => {
      setOfferSecondsLeft((s) => {
        const next = Number(s) - 1;
        return next;
      });
    }, 1000);

    return () => {
      try {
        if (offerIntervalRef.current) clearInterval(offerIntervalRef.current);
      } catch {}
      offerIntervalRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerOpen]);

  // âœ… Option 2: Auto-expire offer
  useEffect(() => {
    if (!offerOpen) return;
    if (!offerOrder?.id) return;

    if (offerSecondsLeft <= 0) {
      declineOffer(offerOrder.id, "timeout");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerSecondsLeft, offerOpen, offerOrder]);

  const visibleMyActive = useMemo(() => {
    if (!deliveryAllowed) return [];
    return sortList(applySourceFilter((myActiveOrders || []).filter(matchesSearch)));
  }, [myActiveOrders, searchText, sortMode, deliveryAllowed, sourceFilter]);

  const visibleCompleted = useMemo(() => {
    if (!deliveryAllowed) return [];
    return sortList(applySourceFilter((completedOrders || []).filter(matchesSearch)));
  }, [completedOrders, searchText, sortMode, deliveryAllowed, sourceFilter]);

  const visibleCanceled = useMemo(() => {
    if (!deliveryAllowed) return [];
    return sortList(applySourceFilter((canceledOrders || []).filter(matchesSearch)));
  }, [canceledOrders, searchText, sortMode, deliveryAllowed, sourceFilter]);

  const viewMode = useMemo(() => {
    const raw = String(searchParams?.get("view") || "").trim().toLowerCase();
    if (raw === "earnings") return "earnings";
    if (raw === "payouts" || raw === "payout") return "payouts";
    if (raw === "active") return "active";
    if (raw === "completed") return "completed";
    if (raw === "canceled" || raw === "cancelled") return "canceled";
    return "available";
  }, [searchParams]);
  const isHomeView = viewMode === "available";
  const isEarningsView = viewMode === "earnings";
  const isPayoutsView = viewMode === "payouts";
  const showOrdersView = viewMode === "available" || viewMode === "active" || viewMode === "completed" || viewMode === "canceled";

  useEffect(() => {
    if (viewMode === "active") {
      setTab("my");
      return;
    }
    if (viewMode === "completed") {
      setTab("completed");
      return;
    }
    if (viewMode === "earnings") {
      setTab("available");
      return;
    }
    if (viewMode === "payouts") {
      setTab("available");
      return;
    }
    if (viewMode === "canceled") {
      setTab("canceled");
      return;
    }
    setTab("available");
  }, [viewMode]);

  function renderOrderCard(o, type) {
    const src = o._source || "restaurant";

    const customerName = pick(o, ["customer_name", "name", "full_name"]);
    const customerPhone = pick(o, ["phone", "customer_phone", "mobile", "customer_mobile"]);
    const customerAddress = buildFullAddress(o);

    const instructions = pick(o, ["customer_instructions", "instructions", "note", "notes"], "");
    const items = pick(o, ["items", "order_items", "cart_items", "products"], "");
    
const total = orderTotal(o);
    const st = normStatus(statusOverride[`${src}:${o.id}`] || o.status);

    // âœ… Mobile/PWA + Delivery sub-pages: compact card + open full details in panel
    if ((isMobile || !isHomeView) && !detailsOpen) {
      const srcLabel = src === "grocery" ? "GROCERY" : "RESTAURANT";
      const payout = orderPayout(o);
      const fee = orderFee(o);
      const tip = orderTip(o);
      const paid = earningStatus(o) === "paid";
      const when = formatWhen(o.created_at || o.updated_at || o.delivered_at);

      return (
        <div key={`${src}_${o.id}`} style={{ ...styles.orderCard, padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <span style={styles.badge(st)}>{st || "status"}</span>
                <span style={styles.subBadge}>{srcLabel}</span>
                {type === "completed" ? <span style={styles.paidBadge(paid)}>{paid ? "PAID" : "UNPAID"}</span> : null}
              </div>

              <div style={{ marginTop: 10 }}>
                <div style={{ fontWeight: 1000, color: "#0b1220", fontSize: 15, lineHeight: 1.25, wordBreak: "break-word" }}>
                  {customerName}
                </div>
                <div style={{ marginTop: 4, color: "rgba(17,24,39,0.70)", fontWeight: 850, fontSize: 12, wordBreak: "break-word" }}>
                  {customerAddress}
                </div>
                <div style={{ marginTop: 6, color: "rgba(17,24,39,0.60)", fontWeight: 850, fontSize: 12 }}>
                  {when}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <span style={styles.moneyBadge}>Fee: {money(fee, currency)}</span>
                <span style={styles.moneyBadge}>Tip: {money(tip, currency)}</span>
                <span style={styles.moneyBadge}>Payout: {money(payout, currency)}</span>
              </div>

              <button
                type="button"
                style={styles.btn}
                onClick={() => {
                  setDetailsCtx({ order: o, type });
                  setDetailsOpen(true);
                }}
              >
                Open Details
              </button>
            </div>
          </div>
        </div>
      );
    }


    // Drop coords (both)
    const dropLat = pick(o, ["customer_lat", "customer_latitude", "drop_lat", "delivery_lat", "latitude", "lat"], null);
    const dropLng = pick(o, ["customer_lng", "customer_longitude", "customer_lon", "drop_lng", "delivery_lng", "longitude", "lng"], null);
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
    const pickupNavUrl = buildGoogleMapsNavUrlLatLng(pickLat, pickLng);
    const dropNavUrl = buildGoogleMapsNavUrlLatLng(dropLat, dropLng);
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
            <span style={styles.moneyBadge}>Fee: {money(fee, currency)}</span>
            <span style={styles.moneyBadge}>Tip: {money(tip, currency)}</span>
            <span style={styles.moneyBadge}>Payout: {money(payout, currency)}</span>
            <div style={{ fontWeight: 950, color: "#0b1220" }}>Order: {money(total, currency)}</div>
          </div>
        </div>

        <div style={styles.line} />

        <div className="dp-split" style={styles.split}>
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
                    <span style={{ color: "rgba(17,24,39,0.55)", fontWeight: 900 }}>AUTO after Accept - saves every ~8s</span>
                  </div>
                  <div style={{ fontWeight: 1000, color: gpsOn ? "#065f46" : "#9a3412" }}>{gpsOn ? "ON" : "OFF"}</div>
                </div>

                <div style={{ marginTop: 8, color: "rgba(17,24,39,0.75)", fontWeight: 900, fontSize: 12 }}>
                  {lastLat && lastLng ? `Last: ${lastLat}, ${lastLng}` : "Waiting for GPS... (auto starts after accept)"}
                  {gps.lastSavedAt ? ` - saved @ ${gps.lastSavedAt}` : ""}
                  {gps.saving ? " - saving..." : ""}
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
                      <div style={{ color: "#666", fontWeight: 850 }}>Loading timeline...</div>
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
                href={pickupNavUrl || pickupMapsUrlLatLng}
                target="_blank"
                rel="noreferrer"
                style={{
                  ...styles.btnGhost,
                  textDecoration: "none",
                  opacity: pickupNavUrl || pickupMapsUrlLatLng ? 1 : 0.55,
                  pointerEvents: pickupNavUrl || pickupMapsUrlLatLng ? "auto" : "none",
                }}
                title={pickupNavUrl || pickupMapsUrlLatLng ? "Navigate to Pickup" : "Pickup location not saved"}
              >
                Navigate Pickup
              </a>

              <a
                href={dropNavUrl || dropMapsUrl}
                target="_blank"
                rel="noreferrer"
                style={{ ...styles.btnGhost, textDecoration: "none" }}
                title="Navigate to Drop"
              >
                Navigate Drop
              </a>

              <a href={telUrl} style={{ ...styles.btnGhost, textDecoration: "none" }}>
                Call
              </a>
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
                  {busyId === o.id ? "Accepting..." : "Accept"}
                </button>
              ) : null}

              {type === "my" ? (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {/* Pro step-by-step flow (shows ONLY the next action) */}
                  {st === "delivering" ? (
                    <button onClick={() => updateMyStatus(o, "arrived_pickup")} disabled={busyId === o.id || !deliveryAllowed} style={styles.btnSoft}>
                      {busyId === o.id ? "Updating..." : "Arrived Pickup"}
                    </button>
                  ) : null}

                  {st === "arrived_pickup" ? (
                    <button onClick={() => updateMyStatus(o, "picked_up")} disabled={busyId === o.id || !deliveryAllowed} style={styles.btnSoft}>
                      {busyId === o.id ? "Updating..." : "Picked Up"}
                    </button>
                  ) : null}

                  {st === "picked_up" ? (
                    <button onClick={() => updateMyStatus(o, "on_the_way")} disabled={busyId === o.id || !deliveryAllowed} style={styles.btnSoft}>
                      {busyId === o.id ? "Updating..." : "On The Way"}
                    </button>
                  ) : null}

                  {st === "on_the_way" ? (
                    <button onClick={() => updateMyStatus(o, "arrived_drop")} disabled={busyId === o.id || !deliveryAllowed} style={styles.btnSoft}>
                      {busyId === o.id ? "Updating..." : "Arrived Drop"}
                    </button>
                  ) : null}

                  {st === "arrived_drop" ? (
                    <button onClick={() => updateMyStatus(o, "delivered")} disabled={busyId === o.id || !deliveryAllowed} style={styles.btn}>
                      {busyId === o.id ? "Updating..." : "Delivered"}
                    </button>
                  ) : null}

                  {/* Backward-compat safety: if status is something unexpected but still "my" */}
                  {st && !["delivering","arrived_pickup","picked_up","on_the_way","arrived_drop","delivered"].includes(st) ? (
                    <button onClick={() => updateMyStatus(o, "delivered")} disabled={busyId === o.id || !deliveryAllowed} style={styles.btnSoft} title="Fallback action">
                      {busyId === o.id ? "Updating..." : "Mark Delivered"}
                    </button>
                  ) : null}
                </div>
              ) : null}

              {type === "completed" ? (
                <div style={{ marginTop: 10 }}>
                  <div style={{ color: "rgba(17,24,39,0.7)", fontWeight: 900, fontSize: 12 }}>
                    Earned: {money(payout, currency)} ({paid ? "paid" : "unpaid"})
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
                          {x} *
                        </button>
                      ))}
                      {ratingBusyId === o.id ? <span style={{ color: "#666", fontWeight: 850 }}>Saving...</span> : null}
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
    <main className="dp-page" style={styles.page}>
      {toast.show ? <div className="dp-toast" style={styles.toast}>{toast.text}</div> : null}

      <style>{`
        /* Mobile-first polish (Option B theme + clean layout) */
        @media (max-width: 900px) {
          .dp-page { padding: 12px !important; }
          .dp-wrap { width: 100% !important; }
          .dp-header { flex-direction: column !important; align-items: stretch !important; gap: 12px !important; }
          .dp-controls { justify-content: flex-start !important; width: 100% !important; }
          .dp-controls > * { min-width: 0 !important; }
          .dp-controls button { flex: 1 1 calc(50% - 8px); }
          .dp-kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          .dp-split { grid-template-columns: 1fr !important; }
          .dp-input { min-width: 0 !important; width: 100% !important; flex: 1 1 100% !important; }
          .dp-details-sheet { width: 100% !important; border-radius: 16px 16px 0 0 !important; max-height: 90vh !important; }
          .dp-toast { left: 12px; right: 12px; bottom: 12px; max-width: none !important; }
        }
        @media (max-width: 480px) {
          .dp-controls button { flex: 1 1 100% !important; }
        }
      `}</style>



      {offerOpen && offerOrder ? (
        <div style={styles.offerBackdrop} onClick={() => closeOffer(true)} role="presentation">
          <div
            style={styles.offerSheet}
            onClick={(e) => {
              e.stopPropagation();
            }}
            role="dialog"
            aria-modal="true"
          >
            <div style={styles.offerTopRow}>
              <div>
                <div style={styles.offerTitle}>New Delivery Offer</div>
                <div style={styles.offerSub}>
                  {offerOrder._source === "grocery" ? "Grocery" : "Restaurant"} - Order #{String(offerOrder.id || "").slice(0, 8)}
                </div>
              </div>

              <div style={styles.offerTimer} title="Seconds left">
                {Math.max(0, offerSecondsLeft)}s
              </div>
            </div>

            <div style={styles.offerBody}>
              <div style={styles.offerCard}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={styles.subBadge}>{String(offerOrder.status || "ready")}</span>
                  <span style={styles.subBadge}>Total miles: {(() => {
                    const mi = resolveOfferMiles(offerOrder);
                    return Number.isFinite(mi) ? `${mi.toFixed(1)} mi` : "-";
                  })()}</span>
                  <span style={styles.subBadge}>Delivery fee: {money(orderFee(offerOrder), currency)}</span>
                </div>

                <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                  <div>
                    <div style={styles.offerLabel}>Customer name</div>
                    <div style={styles.offerValue}>{pick(offerOrder, ["customer_name", "name", "full_name"], "-")}</div>
                  </div>

                  <div>
                    <div style={styles.offerLabel}>Address</div>
                    <div style={styles.offerValue}>{buildFullAddress(offerOrder)}</div>
                  </div>
                </div>
              </div>

              <div style={styles.offerBtns}>
                <button
                  type="button"
                  style={styles.btnGhost}
                  onClick={() => declineOffer(offerOrder.id, "declined")}
                  disabled={busyId === offerOrder.id}
                >
                  Reject
                </button>

                <button
                  type="button"
                  style={styles.btn}
                  onClick={async () => {
                    const cur = offerOrder;
                    closeOffer(true);
                    await acceptOrder(cur);
                  }}
                  disabled={busyId === offerOrder.id || !isOnline || !deliveryAllowed}
                  title={!deliveryAllowed ? "Account not approved" : !isOnline ? "Go Online to accept" : "Accept this order"}
                >
                  {busyId === offerOrder.id ? "Accepting..." : "Accept"}
                </button>
              </div>

              <div style={styles.offerHint}>Tip: If you reject, we hide this offer for you (for this session) so it won&apos;t pop again.</div>
            </div>
          </div>
        </div>
      ) : null}



{/* âœ… Order Details Panel (mobile: full sheet, desktop: right drawer) */}
{detailsOpen && detailsCtx?.order ? (
  <div
    className="dp-details-backdrop"
    style={{
      position: "fixed",
      inset: 0,
      zIndex: 10001,
      background: "rgba(0,0,0,0.45)",
      display: "flex",
      alignItems: isMobile ? "flex-end" : "stretch",
      justifyContent: isMobile ? "center" : "flex-end",
      padding: isMobile ? 12 : 0,
    }}
    onClick={() => {
      setDetailsOpen(false);
      setDetailsCtx({ order: null, type: "available" });
    }}
    role="presentation"
  >
    <div
      className="dp-details-sheet"
      style={{
        width: isMobile ? "100%" : 460,
        maxWidth: isMobile ? 520 : 460,
        height: isMobile ? "92vh" : "100vh",
        borderRadius: isMobile ? 18 : 0,
        border: isMobile ? "1px solid rgba(255,255,255,0.16)" : "none",
        background: "rgba(255,255,255,0.98)",
        boxShadow: isMobile ? "0 18px 60px rgba(0,0,0,0.35)" : "0 0 60px rgba(0,0,0,0.28)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        style={{
          padding: 14,
          borderBottom: "1px solid rgba(0,0,0,0.08)",
          background: "linear-gradient(180deg, rgba(17,24,39,0.03), rgba(255,255,255,0.92))",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 1000, color: "#0b1220" }}>Order Details</div>
          <div style={{ marginTop: 2, fontSize: 12, fontWeight: 900, color: "rgba(17,24,39,0.65)" }}>
            {detailsCtx?.order?._source === "grocery" ? "Grocery" : "Restaurant"} - #{String(detailsCtx?.order?.id || "").slice(0, 8)}
          </div>
        </div>

        <button
          type="button"
          style={styles.btnGhost}
          onClick={() => {
            setDetailsOpen(false);
            setDetailsCtx({ order: null, type: "available" });
          }}
        >
          Close
        </button>
      </div>

      <div style={{ padding: 14, overflowY: "auto", paddingBottom: "calc(14px + env(safe-area-inset-bottom))" }}>
        {renderOrderCard(detailsCtx.order, detailsCtx.type)}
      </div>
    </div>
  </div>
) : null}

      <div className="dp-wrap" style={styles.wrap}>
        <div className="dp-header" style={styles.row}>
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
                <div style={styles.sub}>Welcome{headerName ? `, ${headerName}` : ""} - ready to deliver.</div>

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

          <div className="dp-controls" style={styles.row}>
            <div style={styles.toggleWrap}>
              <div style={styles.toggleDot(isOnline && deliveryAllowed)} />
              <div style={styles.toggleText}>
                {deliveryAllowed ? (isOnline ? "Online" : "Offline") : "Blocked"}
                {savingOnline ? " (saving...)" : ""}
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

            <button
              type="button"
              style={{
                ...styles.btnGhost,
                border: soundEnabled ? "1px solid rgba(16,185,129,0.35)" : "1px solid rgba(0,0,0,0.12)",
                opacity: deliveryAllowed ? 1 : 0.6,
              }}
              disabled={!deliveryAllowed}
              onClick={() => persistSound(!soundEnabled)}
              title="New order sound"
            >
              {soundEnabled ? "Sound: ON" : "Sound: OFF"}
            </button>

            <button
              type="button"
              style={{
                ...styles.btnGhost,
                border: vibrateEnabled ? "1px solid rgba(16,185,129,0.35)" : "1px solid rgba(0,0,0,0.12)",
                opacity: deliveryAllowed ? 1 : 0.6,
              }}
              disabled={!deliveryAllowed}
              onClick={() => persistVibrate(!vibrateEnabled)}
              title={typeof navigator !== "undefined" && "vibrate" in navigator ? "New order vibration" : "Vibration not supported"}
            >
              {vibrateEnabled ? "Vibrate: ON" : "Vibrate: OFF"}
            </button>


            {pushSupported ? (
              <button
                type="button"
                style={{
                  ...styles.btnGhost,
                  border:
                    pushPermission === "granted" && pushEnabled
                      ? "1px solid rgba(16,185,129,0.35)"
                      : pushPermission === "denied"
                      ? "1px solid rgba(239,68,68,0.35)"
                      : "1px solid rgba(0,0,0,0.12)",
                  opacity: deliveryAllowed ? 1 : 0.6,
                }}
                disabled={pushBusy || (!deliveryAllowed && !pushEnabled)}
                onClick={() => (pushEnabled ? disablePushNotifications() : enablePushNotifications())}
                title={
                  pushPermission === "denied"
                    ? "Notifications blocked in browser settings"
                    : "Enable push notifications (PWA)"
                }
              >
                {pushEnabled ? "Push: ON" : "Push: Enable"}
              </button>
            ) : (
              <span style={{ ...styles.pill, opacity: 0.7 }}>Push: Not supported</span>
            )}

            <span style={styles.pill}>Available: {availableCount}</span>
            {!isMobile ? <span style={styles.pill}>Restaurant: {availableRestaurantCount}</span> : null}
            {!isMobile ? <span style={styles.pill}>Grocery: {availableGroceryCount}</span> : null}
            {!isMobile ? <span style={styles.pill}>Active: {deliveryAllowed ? myActiveOrders.length : 0}</span> : null}

            <button onClick={hardRefresh} style={styles.btnGhost}>
              Refresh
            </button>

            {!isMobile ? (
            <button onClick={() => router.push("/delivery")} style={styles.btnGhost}>
              Home
            </button>
            ) : null}

            <button onClick={() => router.push("/delivery?view=payouts")} style={styles.btnGhost}>
              Payouts
            </button>

            <button onClick={handleLogout} style={styles.btn}>
              Logout
            </button>
          </div>
        </div>

        {/* âœ… Sticky Summary (home only) */}
        {deliveryAllowed && isHomeView ? (
          <div className="dp-sticky-summary" style={styles.stickySummary}>
            <div style={styles.stickyRow}>
              <div style={styles.stickyItem}>
                <div style={styles.stickyLabel}>Today Earnings</div>
                <div style={styles.stickyValue}>{money(earningsStats.todayE, currency)}</div>
              </div>

              <div style={styles.stickyItem}>
                <div style={styles.stickyLabel}>Today Completed</div>
                <div style={styles.stickyValue}>{earningsStats.todayCount}</div>
              </div>

              <div style={styles.stickyItem}>
                <div style={styles.stickyLabel}>This Week</div>
                <div style={styles.stickyValue}>{money(earningsStats.weekE, currency)}</div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: "auto" }}>
                <span style={styles.onlinePill(isOnline && deliveryAllowed)}>
                  {isOnline ? "Online" : "Offline"}
                </span>

                <button type="button" style={styles.btnGhost} onClick={hardRefresh}>
                  Refresh
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {loading ? <div style={styles.loading}>Loading delivery profile...</div> : null}
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
            {isHomeView ? (
            <div style={styles.card}>
              <div style={styles.row}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 950, fontSize: 14 }}>Account</div>
                  <div style={{ color: "#666", marginTop: 4, fontSize: 13 }}>
                    Email: {userEmail || "-"} - Phone: {profile?.phone || "-"}
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
                      drop_lat: pick(o, ["customer_lat", "customer_latitude", "drop_lat", "delivery_lat", "latitude", "lat"], ""),
                      drop_lng: pick(o, ["customer_lng", "customer_longitude", "customer_lon", "drop_lng", "delivery_lng", "longitude", "lng"], ""),
                    }));
                    downloadCSV(rows, "delivery_completed_orders.csv");
                    showToast("Exported CSV");
                  }}
                >
                  Export Completed CSV
                </button>
              </div>
            </div>
            ) : null}

            {isHomeView || isEarningsView ? (
            <div style={styles.card}>
              <div style={styles.row}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 950, fontSize: 14 }}>Earnings</div>
                  <div style={{ color: "#666", marginTop: 4, fontSize: 13 }}>Based on payout (fee + tip) from orders</div>
                </div>
              </div>

              <div className="dp-kpi-grid" style={styles.kpiGrid}>
                <div style={styles.kpiCard}>
                  <div style={styles.kpiNum}>{money(earningsStats.todayE, currency)}</div>
                  <div style={styles.kpiLabel}>Today - {earningsStats.todayCount} deliveries</div>
                </div>

                <div style={styles.kpiCard}>
                  <div style={styles.kpiNum}>{money(earningsStats.weekE, currency)}</div>
                  <div style={styles.kpiLabel}>This Week - {earningsStats.weekCount} deliveries</div>
                </div>

                <div style={styles.kpiCard}>
                  <div style={styles.kpiNum}>{money(earningsStats.monthE, currency)}</div>
                  <div style={styles.kpiLabel}>This Month - {earningsStats.monthCount} deliveries</div>
                </div>

                <div style={styles.kpiCard}>
                  <div style={styles.kpiNum}>{money(earningsStats.lifeE, currency)}</div>
                  <div style={styles.kpiLabel}>Lifetime - {earningsStats.lifeCount} deliveries</div>
                </div>
              </div>

              <div style={styles.weekWrap}>
                <div style={styles.weekTop}>
                  <div style={{ minWidth: 280 }}>
                    <h4 style={styles.weekTitle}>Weekly Performance (Mon-Sun)</h4>
                    <div style={styles.weekSub}>
                      Week starts: <b>{formatWhen(weekStart)}</b>
                    </div>
                    <div style={{ ...styles.weekSub, marginTop: 6 }}>
                      Top Day: <b>{earningsStats.topWeekDay.label}</b> - {money(earningsStats.topWeekDay.earnings, currency)} ({earningsStats.topWeekDay.count})
                    </div>
                    <div style={{ ...styles.weekSub, marginTop: 4 }}>
                      Avg / day: <b>{money(earningsStats.avgPerDayWeek, currency)}</b>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                    <div style={styles.kpiCard}>
                      <div style={styles.kpiNum}>{money(earningsStats.rangeE, currency)}</div>
                      <div style={styles.kpiLabel}>
                        Last {chartDays} Days - {earningsStats.rangeDeliveredCount} deliveries
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
                        <div key={d.key} style={styles.barCol} title={`${d.label}: ${money(d.earnings, currency)} (${d.count})`}>
                          <div style={styles.barValue}>{money(d.earnings, currency)}</div>
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
                          <div key={d.key} style={{ ...styles.barCol, width: 46, flex: "0 0 auto" }} title={`${d.label}: ${money(d.earnings, currency)} (${d.count})`}>
                            <div style={styles.barValue}>{money(d.earnings, currency)}</div>
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
                        <div key={d.key} style={styles.barCol} title={`${d.label}: ${money(d.earnings, currency)} (${d.count})`}>
                          <div style={styles.barValue}>{money(d.earnings, currency)}</div>
                          <div style={{ ...styles.bar, height: `${Math.max(8, h)}%` }} />
                          <div style={styles.barLabel}>{d.label}</div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div style={{ marginTop: 10, color: "rgba(17,24,39,0.65)", fontWeight: 850, fontSize: 12 }}>{earningsStats.displayNote}</div>
              </div>

              {isEarningsView ? (
                <div style={{ marginTop: 14, borderTop: "1px solid rgba(0,0,0,0.08)", paddingTop: 14 }}>
                  <div style={{ fontWeight: 950, fontSize: 14 }}>Pro Earnings Filters</div>
                  <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <button type="button" style={styles.sourceBtn(earnRange === "7d")} onClick={() => setEarnRange("7d")}>
                      Last 7D
                    </button>
                    <button type="button" style={styles.sourceBtn(earnRange === "30d")} onClick={() => setEarnRange("30d")}>
                      Last 30D
                    </button>
                    <button type="button" style={styles.sourceBtn(earnRange === "90d")} onClick={() => setEarnRange("90d")}>
                      Last 90D
                    </button>
                    <button type="button" style={styles.sourceBtn(earnRange === "custom")} onClick={() => setEarnRange("custom")}>
                      Custom
                    </button>

                    <input type="date" value={earnFrom} onChange={(e) => setEarnFrom(e.target.value)} style={styles.input} />
                    <input type="date" value={earnTo} onChange={(e) => setEarnTo(e.target.value)} style={styles.input} />

                    <select value={earnSource} onChange={(e) => setEarnSource(e.target.value)} style={styles.select}>
                      <option value="all">All sources</option>
                      <option value="restaurant">Restaurant</option>
                      <option value="grocery">Grocery</option>
                    </select>

                    <select value={earnPayState} onChange={(e) => setEarnPayState(e.target.value)} style={styles.select}>
                      <option value="all">All payouts</option>
                      <option value="paid">Paid only</option>
                      <option value="unpaid">Unpaid only</option>
                    </select>

                    <select value={earnSort} onChange={(e) => setEarnSort(e.target.value)} style={styles.select}>
                      <option value="latest">Sort: Latest</option>
                      <option value="oldest">Sort: Oldest</option>
                      <option value="payout_high">Payout High</option>
                      <option value="payout_low">Payout Low</option>
                    </select>

                    <button
                      type="button"
                      style={styles.btnSoft}
                      onClick={() => {
                        const rows = (earningsPro.rows || []).map((o) => ({
                          source: o._source || "",
                          order_id: o.id,
                          customer: pick(o, ["customer_name", "name", "full_name"], ""),
                          delivered_at: o.delivered_at || o.updated_at || o.created_at || "",
                          payout: orderPayout(o),
                          fee: orderFee(o),
                          tip: orderTip(o),
                          payout_state: earningStatus(o),
                        }));
                        downloadCSV(rows, "delivery_earnings_filtered.csv");
                        showToast("Exported filtered earnings CSV");
                      }}
                    >
                      Export filtered CSV
                    </button>
                  </div>

                  <div className="dp-kpi-grid" style={{ ...styles.kpiGrid, marginTop: 12 }}>
                    <div style={styles.kpiCard}>
                      <div style={styles.kpiNum}>{money(earningsPro.totalPayout, currency)}</div>
                      <div style={styles.kpiLabel}>Filtered payout - {earningsPro.rows.length} deliveries</div>
                    </div>
                    <div style={styles.kpiCard}>
                      <div style={styles.kpiNum}>{money(earningsPro.totalFee, currency)}</div>
                      <div style={styles.kpiLabel}>Delivery fee total</div>
                    </div>
                    <div style={styles.kpiCard}>
                      <div style={styles.kpiNum}>{money(earningsPro.totalTip, currency)}</div>
                      <div style={styles.kpiLabel}>Tips total</div>
                    </div>
                    <div style={styles.kpiCard}>
                      <div style={styles.kpiNum}>{money(earningsPro.avgPayout, currency)}</div>
                      <div style={styles.kpiLabel}>Avg payout / delivery</div>
                    </div>
                  </div>

                  <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span style={styles.subBadge}>Paid: {earningsPro.paidCount}</span>
                    <span style={styles.subBadge}>Unpaid: {earningsPro.unpaidCount}</span>
                    <span style={styles.subBadge}>Restaurant: {earningsPro.restaurantCount}</span>
                    <span style={styles.subBadge}>Grocery: {earningsPro.groceryCount}</span>
                    <span style={styles.subBadge}>Best day: {earningsPro.bestDay.key} - {money(earningsPro.bestDay.payout, currency)}</span>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontWeight: 900, fontSize: 13, marginBottom: 8 }}>Recent Payouts</div>
                    {earningsPro.rows.length === 0 ? (
                      <div style={{ color: "#888", fontSize: 13 }}>No deliveries for selected filters.</div>
                    ) : (
                      <div style={{ display: "grid", gap: 8 }}>
                        {earningsPro.rows.slice(0, 8).map((o) => {
                          const d = formatWhen(o.delivered_at || o.updated_at || o.created_at);
                          return (
                            <div key={`earn_${o._source}_${o.id}`} style={{ border: "1px solid rgba(0,0,0,0.1)", borderRadius: 12, padding: 10, background: "rgba(255,255,255,0.9)" }}>
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                <span style={styles.subBadge}>{String(o._source || "order").toUpperCase()}</span>
                                <span style={styles.subBadge}>{earningStatus(o).toUpperCase()}</span>
                                <span style={{ marginLeft: "auto", fontWeight: 950 }}>{money(orderPayout(o), currency)}</span>
                              </div>
                              <div style={{ marginTop: 6, color: "rgba(17,24,39,0.75)", fontWeight: 850, fontSize: 12 }}>
                                {pick(o, ["customer_name", "name", "full_name"], "-")} - {d}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
            ) : null}

            {isPayoutsView ? (
            <div style={styles.card}>
              <div style={styles.row}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 950, fontSize: 14 }}>Payout Center</div>
                  <div style={{ color: "#666", marginTop: 4, fontSize: 13 }}>
                    Manage available cashout, requested batches, and paid history.
                  </div>
                </div>

                <button
                  type="button"
                  style={{ ...styles.btn, opacity: payoutCanRequest ? 1 : 0.6 }}
                  onClick={requestPayoutBatch}
                  disabled={!payoutCanRequest}
                  title={
                    payoutCanRequest
                      ? "Request payout for available orders"
                      : !bankGate.ok
                      ? bankGate.reason
                      : `Minimum cashout ${money(payoutCenter.minCashout, currency)}`
                  }
                >
                  Request Payout
                </button>
                <button
                  type="button"
                  style={styles.btnSoft}
                  onClick={() => {
                    const rows = (payoutCenter.availableRows || []).map((o) => ({
                      source: o._source || "",
                      order_id: o.id,
                      delivered_at: o.delivered_at || o.updated_at || o.created_at || "",
                      customer: pick(o, ["customer_name", "name", "full_name"], ""),
                      payout: orderPayout(o),
                      fee: orderFee(o),
                      tip: orderTip(o),
                      payout_state: "unpaid",
                    }));
                    downloadCSV(rows, "delivery_payout_available.csv");
                    showToast("Exported payout-ready CSV");
                  }}
                >
                  Export CSV
                </button>
              </div>

              <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <span style={styles.subBadge}>Mode: {payoutStoreMode === "db" ? "DB" : "LOCAL"}</span>
                <button type="button" style={styles.sourceBtn(payoutRange === "7d")} onClick={() => setPayoutRange("7d")}>
                  Last 7D
                </button>
                <button type="button" style={styles.sourceBtn(payoutRange === "30d")} onClick={() => setPayoutRange("30d")}>
                  Last 30D
                </button>
                <button type="button" style={styles.sourceBtn(payoutRange === "90d")} onClick={() => setPayoutRange("90d")}>
                  Last 90D
                </button>
                <button type="button" style={styles.sourceBtn(payoutRange === "all")} onClick={() => setPayoutRange("all")}>
                  All
                </button>
                <button type="button" style={styles.sourceBtn(payoutRange === "custom")} onClick={() => setPayoutRange("custom")}>
                  Custom
                </button>
                <input type="date" value={payoutFrom} onChange={(e) => setPayoutFrom(e.target.value)} style={styles.input} />
                <input type="date" value={payoutTo} onChange={(e) => setPayoutTo(e.target.value)} style={styles.input} />
                <select value={payoutSource} onChange={(e) => setPayoutSource(e.target.value)} style={styles.select}>
                  <option value="all">All sources</option>
                  <option value="restaurant">Restaurant</option>
                  <option value="grocery">Grocery</option>
                </select>
                <select value={payoutSort} onChange={(e) => setPayoutSort(e.target.value)} style={styles.select}>
                  <option value="latest">Sort: Latest</option>
                  <option value="oldest">Sort: Oldest</option>
                  <option value="amount_high">Amount High</option>
                  <option value="amount_low">Amount Low</option>
                </select>
              </div>

              <div
                style={{
                  marginTop: 12,
                  border: "1px solid rgba(0,0,0,0.1)",
                  borderRadius: 14,
                  padding: 12,
                  background: "rgba(255,255,255,0.9)",
                }}
              >
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 900, fontSize: 13 }}>Bank Details For Payout</div>
                  <span style={styles.subBadge}>Store: {bankStoreMode === "db" ? "DB" : "LOCAL"}</span>
                  <span
                    style={{
                      ...styles.subBadge,
                      color: "#92400e",
                      borderColor: "rgba(245,158,11,0.35)",
                      background: "rgba(254,243,199,0.6)",
                    }}
                  >
                    {String(bankForm.status || "pending_verification").replace(/_/g, " ").toUpperCase()}
                  </span>
                  {bankSavedAt ? <span style={styles.subBadge}>Saved: {formatWhen(bankSavedAt)}</span> : null}
                </div>

                <div style={{ marginTop: 8, color: "#666", fontSize: 12 }}>
                  Add payout bank details. Admin can verify this before payout release.
                </div>

                <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))", gap: 8 }}>
                  <input
                    value={bankForm.account_holder_name}
                    onChange={(e) => setBankForm((p) => ({ ...p, account_holder_name: e.target.value }))}
                    placeholder="Account holder name *"
                    style={styles.input}
                  />
                  <input
                    value={bankForm.bank_name}
                    onChange={(e) => setBankForm((p) => ({ ...p, bank_name: e.target.value }))}
                    placeholder="Bank name *"
                    style={styles.input}
                  />
                  <input
                    value={bankForm.account_number}
                    onChange={(e) => setBankForm((p) => ({ ...p, account_number: e.target.value }))}
                    placeholder="Account number *"
                    style={styles.input}
                  />
                  <input
                    value={bankForm.routing_code}
                    onChange={(e) => setBankForm((p) => ({ ...p, routing_code: e.target.value }))}
                    placeholder="Routing / IFSC *"
                    style={styles.input}
                  />
                  <input
                    value={bankForm.country}
                    onChange={(e) => setBankForm((p) => ({ ...p, country: e.target.value.toUpperCase() }))}
                    placeholder="Country code (US) *"
                    style={styles.input}
                  />
                  <select
                    value={bankForm.currency}
                    onChange={(e) => setBankForm((p) => ({ ...p, currency: normalizeCurrency(e.target.value) }))}
                    style={styles.select}
                  >
                    <option value="USD">USD</option>
                    <option value="INR">INR</option>
                  </select>
                </div>

                <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <button type="button" style={{ ...styles.btnSoft, opacity: bankBusy ? 0.7 : 1 }} disabled={bankBusy} onClick={saveBankDetails}>
                    {bankBusy ? "Saving..." : "Save Bank Details"}
                  </button>
                  {bankForm.account_number_last4 ? <span style={styles.subBadge}>A/C: {maskLast4(bankForm.account_number_last4)}</span> : null}
                  {bankForm.routing_code_last4 ? <span style={styles.subBadge}>Route: {maskLast4(bankForm.routing_code_last4)}</span> : null}
                </div>
                {!bankGate.ok ? (
                  <div style={{ marginTop: 8, fontSize: 12, color: "#9a3412", fontWeight: 900 }}>{bankGate.reason}</div>
                ) : null}
              </div>

              <div className="dp-kpi-grid" style={{ ...styles.kpiGrid, marginTop: 12 }}>
                <div style={styles.kpiCard}>
                  <div style={styles.kpiNum}>{money(payoutCenter.availableAmount, currency)}</div>
                  <div style={styles.kpiLabel}>Available now - {payoutCenter.availableCount} orders</div>
                </div>
                <div style={styles.kpiCard}>
                  <div style={styles.kpiNum}>{money(payoutCenter.requestedAmount, currency)}</div>
                  <div style={styles.kpiLabel}>Requested - {payoutCenter.requestedCount} orders</div>
                </div>
                <div style={styles.kpiCard}>
                  <div style={styles.kpiNum}>{money(payoutCenter.paidAmount, currency)}</div>
                  <div style={styles.kpiLabel}>Already paid - {payoutCenter.paidCount} orders</div>
                </div>
                <div style={styles.kpiCard}>
                  <div style={styles.kpiNum}>{money(payoutCenter.minCashout, currency)}</div>
                  <div style={styles.kpiLabel}>Minimum cashout threshold</div>
                </div>
              </div>

              <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                <div style={{ fontWeight: 900, fontSize: 13 }}>Requested / Processing Batches</div>
                {payoutStoreMode !== "db" ? (
                  <div style={{ color: "#9a3412", fontSize: 12, fontWeight: 900 }}>
                    Running in local mode. Create DB table to switch to permanent server payouts.
                  </div>
                ) : null}
                {payoutCenter.activeRequests.length === 0 ? (
                  <div style={{ color: "#888", fontSize: 13 }}>No payout requests yet.</div>
                ) : (
                  payoutCenter.activeRequests.slice(0, 6).map((r) => (
                    <div
                      key={String(r.id)}
                      style={{
                        border: "1px solid rgba(0,0,0,0.1)",
                        borderRadius: 12,
                        padding: 10,
                        background: "rgba(255,255,255,0.9)",
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap",
                        alignItems: "center",
                      }}
                    >
                      <span style={styles.subBadge}>#{String(r.id || "").slice(-6)}</span>
                      <span
                        style={{
                          ...styles.subBadge,
                          color:
                            normalizePayoutRequestStatus(r.status) === "processing"
                              ? "#92400e"
                              : "#1e40af",
                          borderColor:
                            normalizePayoutRequestStatus(r.status) === "processing"
                              ? "rgba(245,158,11,0.35)"
                              : "rgba(59,130,246,0.35)",
                          background:
                            normalizePayoutRequestStatus(r.status) === "processing"
                              ? "rgba(254,243,199,0.6)"
                              : "rgba(219,234,254,0.6)",
                        }}
                      >
                        {String(r.status || "requested").toUpperCase()}
                      </span>
                      <span style={styles.subBadge}>{formatWhen(r.created_at)}</span>
                      <span style={styles.subBadge}>{Number(r.count || 0)} orders</span>
                      <span style={{ marginLeft: "auto", fontWeight: 950 }}>{money(r.total_amount || 0, currency)}</span>
                    </div>
                  ))
                )}
              </div>

              <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                <div style={{ fontWeight: 900, fontSize: 13 }}>Paid Batches</div>
                {payoutCenter.paidRequests.length === 0 ? (
                  <div style={{ color: "#888", fontSize: 13 }}>No paid payout batches yet.</div>
                ) : (
                  payoutCenter.paidRequests.slice(0, 6).map((r) => (
                    <div
                      key={`paid_${String(r.id)}`}
                      style={{
                        border: "1px solid rgba(0,0,0,0.1)",
                        borderRadius: 12,
                        padding: 10,
                        background: "rgba(236,253,245,0.8)",
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap",
                        alignItems: "center",
                      }}
                    >
                      <span style={styles.subBadge}>#{String(r.id || "").slice(-6)}</span>
                      <span style={{ ...styles.subBadge, color: "#065f46", borderColor: "rgba(16,185,129,0.35)", background: "rgba(209,250,229,0.8)" }}>
                        PAID
                      </span>
                      <span style={styles.subBadge}>{formatWhen(r.created_at)}</span>
                      <span style={styles.subBadge}>{Number(r.count || 0)} orders</span>
                      <span style={{ marginLeft: "auto", fontWeight: 950 }}>{money(r.total_amount || 0, currency)}</span>
                    </div>
                  ))
                )}
              </div>

              <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                <div style={{ fontWeight: 900, fontSize: 13 }}>Failed Batches</div>
                {payoutCenter.failedRequests.length === 0 ? (
                  <div style={{ color: "#888", fontSize: 13 }}>No failed payout batches.</div>
                ) : (
                  payoutCenter.failedRequests.slice(0, 6).map((r) => (
                    <div
                      key={`failed_${String(r.id)}`}
                      style={{
                        border: "1px solid rgba(239,68,68,0.2)",
                        borderRadius: 12,
                        padding: 10,
                        background: "rgba(254,242,242,0.8)",
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap",
                        alignItems: "center",
                      }}
                    >
                      <span style={styles.subBadge}>#{String(r.id || "").slice(-6)}</span>
                      <span style={{ ...styles.subBadge, color: "#7f1d1d", borderColor: "rgba(239,68,68,0.35)", background: "rgba(254,226,226,0.8)" }}>
                        FAILED
                      </span>
                      <span style={styles.subBadge}>{formatWhen(r.created_at)}</span>
                      <span style={styles.subBadge}>{Number(r.count || 0)} orders</span>
                      <span style={{ marginLeft: "auto", fontWeight: 950 }}>{money(r.total_amount || 0, currency)}</span>
                    </div>
                  ))
                )}
              </div>

              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 900, fontSize: 13, marginBottom: 8 }}>Available Orders For Next Payout</div>
                {payoutCenter.availableRows.length === 0 ? (
                  <div style={{ color: "#888", fontSize: 13 }}>No payout-ready orders for selected filters.</div>
                ) : (
                  <div style={{ display: "grid", gap: 8 }}>
                    {payoutCenter.availableRows.slice(0, 10).map((o) => {
                      const d = formatWhen(o.delivered_at || o.updated_at || o.created_at);
                      return (
                        <div key={`payout_ready_${o._source}_${o.id}`} style={{ border: "1px solid rgba(0,0,0,0.1)", borderRadius: 12, padding: 10, background: "rgba(255,255,255,0.9)" }}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                            <span style={styles.subBadge}>{String(o._source || "order").toUpperCase()}</span>
                            <span style={styles.subBadge}>UNPAID</span>
                            <span style={{ marginLeft: "auto", fontWeight: 950 }}>{money(orderPayout(o), currency)}</span>
                          </div>
                          <div style={{ marginTop: 6, color: "rgba(17,24,39,0.75)", fontWeight: 850, fontSize: 12 }}>
                            {pick(o, ["customer_name", "name", "full_name"], "-")} - {d}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            ) : null}

            {showOrdersView ? (
            <div style={styles.card}>
              <div style={styles.row}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 950, fontSize: 14 }}>Orders</div>
                  <div style={{ color: "#666", marginTop: 4, fontSize: 13 }}>
                    Home shows all orders, but you can filter Grocery vs Restaurant.
                  </div>
                </div>

                <input value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="Search name / phone / address / id..." className="dp-input" style={styles.input} />

                <select value={sortMode} onChange={(e) => setSortMode(e.target.value)} style={styles.select}>
                  <option value="newest">Newest</option>
                  <option value="oldest">Oldest</option>
                  <option value="amount_high">Amount (High)</option>
                  <option value="amount_low">Amount (Low)</option>
                </select>
              </div>

              {isHomeView ? (
              <div style={styles.tabsRow}>
                <button type="button" style={styles.tabBtn(tab === "available")} onClick={() => setTab("available")}>
                  Available ({isOnline ? visibleAvailable.length : 0})
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
                      const list =
                        tab === "available"
                          ? visibleAvailable
                          : tab === "my"
                          ? visibleMyActive
                          : tab === "canceled"
                          ? visibleCanceled
                          : visibleCompleted;
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
                        drop_lat: pick(o, ["customer_lat", "customer_latitude", "drop_lat", "delivery_lat", "latitude", "lat"], ""),
                        drop_lng: pick(o, ["customer_lng", "customer_longitude", "customer_lon", "drop_lng", "delivery_lng", "longitude", "lng"], ""),
                      }));
                      downloadCSV(rows, `delivery_${tab}_orders.csv`);
                      showToast("Exported CSV");
                    }}
                  >
                    Export Tab CSV
                  </button>
                </div>
              </div>
              ) : null}

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

                {tab === "canceled" ? (
                  visibleCanceled.length === 0 ? (
                    <div style={{ marginTop: 10, color: "#888", fontSize: 13 }}>No canceled deliveries yet.</div>
                  ) : (
                    visibleCanceled.map((o) => renderOrderCard(o, "completed"))
                  )
                ) : null}
              </div>
            </div>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}

export default function DeliveryHomePage() {
  return (
    <Suspense
      fallback={
        <main style={{ minHeight: "100vh", padding: 24, background: "#f8fafc" }}>
          <div style={{ maxWidth: 980, margin: "0 auto" }}>
            <div
              style={{
                borderRadius: 20,
                padding: 20,
                background: "#ffffff",
                border: "1px solid rgba(15,23,42,0.08)",
                boxShadow: "0 18px 48px rgba(15,23,42,0.08)",
              }}
            >
              <div style={{ fontSize: 20, fontWeight: 900, color: "#0f172a" }}>Loading delivery dashboard...</div>
              <div style={{ marginTop: 8, color: "#475569", fontSize: 14 }}>
                Preparing your delivery workspace safely.
              </div>
            </div>
          </div>
        </main>
      }
    >
      <DeliveryHomePageInner />
    </Suspense>
  );
}


