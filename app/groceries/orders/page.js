"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import supabase from "@/lib/supabase";
import { fetchReviewsByOrderIds, isReviewableStatus } from "@/lib/reviews";
import { useToast } from "@/components/ToastProvider";

//  SSR-safe dynamic import (leaflet must run client-side only)
const CustomerTrackingMap = dynamic(() => import("@/components/CustomerTrackingMap.jsx"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        height: 320,
        borderRadius: 16,
        border: "1px solid rgba(0,0,0,0.12)",
        background: "rgba(255,255,255,0.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 900,
        color: "rgba(17,24,39,0.7)",
      }}
    >
      Loading map...
    </div>
  ),
});

function normalizeRole(r) {
  return String(r || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function formatMoney(v, currency = "USD") {
  const n = Number(v || 0);
  const c = String(currency || "USD").toUpperCase();

  if (c === "INR") {
    return `₹${n.toFixed(0)}`;
  }

  return `$${n.toFixed(0)}`;
}

function formatTime(ts) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts || "");
  }
}

function clampText(s, max = 140) {
  const str = String(s ?? "");
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + "...";
}

function initials(name) {
  const s = String(name || "").trim();
  if (!s) return "DP";
  const parts = s.split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] || "";
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] : "";
  return (a + b).toUpperCase() || "DP";
}

function safeNum(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function DeliveryPerson({ dp }) {
  if (!dp) return null;

  const avatar = dp.avatar_url || dp.photo_url || dp.profile_photo || dp.image_url || "";
  const name =
    dp.full_name ||
    dp.display_name ||
    dp.name ||
    [dp.first_name, dp.last_name].filter(Boolean).join(" ") ||
    dp.username ||
    "Delivery Partner";
  const phone = dp.phone || dp.mobile || "";

  return (
    <div
      style={{
        marginTop: 10,
        borderRadius: 16,
        border: "1px solid rgba(0,0,0,0.08)",
        background: "rgba(255,255,255,0.85)",
        padding: 12,
        display: "flex",
        gap: 12,
        alignItems: "center",
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 999,
          border: "1px solid rgba(0,0,0,0.10)",
          background: "rgba(17,24,39,0.06)",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 1000,
          color: "rgba(17,24,39,0.85)",
          flexShrink: 0,
        }}
        title={name}
      >
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          initials(name)
        )}
      </div>

      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 1000, color: "#0b1220" }}>{name}</div>
        <div style={{ marginTop: 4, color: "rgba(17,24,39,0.68)", fontWeight: 850, fontSize: 13 }}>
          Assigned delivery partner{phone ? ` - ${phone}` : ""}
        </div>
      </div>
    </div>
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAbortAuthError(e) {
  const msg = String(e?.message || e || "").toLowerCase();
  return (
    msg.includes("signal is aborted without reason") ||
    msg.includes("aborterror") ||
    msg.includes("aborted") ||
    (msg.includes("lock") && msg.includes("timeout"))
  );
}

async function getUserWithRetry(maxAttempts = 3) {
  let lastError = null;
  for (let i = 0; i < maxAttempts; i += 1) {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (!error && data?.user) return { user: data.user, error: null };
      lastError = error || null;
      if (error && !isAbortAuthError(error)) break;
    } catch (e) {
      lastError = e;
      if (!isAbortAuthError(e)) break;
    }

    if (i < maxAttempts - 1) await sleep(220);
  }

  return { user: null, error: lastError };
}

/* =========================
   PREMIUM THEME (match your style)
   ========================= */

const pageBg = {
  minHeight: "calc(100vh - 64px)",
  padding: 20,
  background:
    "radial-gradient(1200px 600px at 20% 10%, rgba(34,197,94,0.18), transparent 62%), radial-gradient(900px 520px at 80% 18%, rgba(59,130,246,0.14), transparent 58%), linear-gradient(180deg, #f7f7fb, #ffffff)",
};

const heroGlass = {
  borderRadius: 20,
  padding: 18,
  background: "rgba(255,255,255,0.78)",
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 14px 44px rgba(0,0,0,0.09)",
  backdropFilter: "blur(10px)",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const pill = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 12px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.7)",
  fontSize: 12,
  fontWeight: 950,
  color: "rgba(17,24,39,0.85)",
  textDecoration: "none",
};

const heroTitle = {
  margin: "10px 0 0 0",
  fontSize: 34,
  fontWeight: 1000,
  color: "#0b1220",
  letterSpacing: -0.2,
};

const subText = {
  marginTop: 8,
  color: "rgba(17,24,39,0.7)",
  fontWeight: 800,
};

const cardGlass = {
  borderRadius: 18,
  padding: 14,
  background: "rgba(255,255,255,0.78)",
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 12px 36px rgba(0,0,0,0.08)",
  backdropFilter: "blur(10px)",
};

const statCard = {
  minWidth: 130,
  padding: "10px 12px",
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.7)",
};

const statNum = {
  fontSize: 18,
  fontWeight: 1000,
  color: "#0b1220",
};

const statLabel = {
  marginTop: 2,
  fontSize: 12,
  fontWeight: 900,
  color: "rgba(17,24,39,0.65)",
};

const alertErr = {
  marginTop: 12,
  padding: 12,
  border: "1px solid #fecaca",
  background: "rgba(254,242,242,0.9)",
  borderRadius: 14,
  color: "#7f1d1d",
  fontWeight: 900,
};

const emptyBox = {
  marginTop: 14,
  padding: 14,
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.75)",
  color: "rgba(17,24,39,0.72)",
  fontWeight: 850,
};

const row = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  flexWrap: "wrap",
  alignItems: "center",
};

function statusBadge(status) {
  const s = String(status || "").toLowerCase();

  if (s === "rejected" || s === "cancelled") {
    return {
      background: "rgba(254,242,242,0.9)",
      border: "1px solid rgba(239,68,68,0.25)",
      color: "#7f1d1d",
    };
  }

  if (s === "ready" || s === "delivered") {
    return {
      background: "rgba(236,253,245,0.9)",
      border: "1px solid rgba(16,185,129,0.25)",
      color: "#065f46",
    };
  }

  if (s === "delivering" || s === "picked_up" || s === "on_the_way") {
    return {
      background: "rgba(239,246,255,0.95)",
      border: "1px solid rgba(59,130,246,0.22)",
      color: "#1e40af",
    };
  }

  return {
    background: "rgba(255,247,237,0.95)",
    border: "1px solid rgba(249,115,22,0.20)",
    color: "#9a3412",
  };
}

function friendlyStatus(status) {
  const s = String(status || "").toLowerCase();
  if (s === "pending") return "Pending";
  if (s === "accepted" || s === "confirmed") return "Confirmed";
  if (s === "preparing") return "Preparing";
  if (s === "ready") return "Ready";
  if (s === "delivering") return "Out for delivery";
  if (s === "picked_up") return "Picked up";
  if (s === "on_the_way") return "On the way";
  if (s === "delivered") return "Delivered";
  if (s === "rejected" || s === "cancelled") return "Rejected";
  return s ? s : "Pending";
}

function messageBoxStyle(tone) {
  if (tone === "danger") {
    return {
      background: "rgba(254,242,242,0.92)",
      border: "1px solid rgba(239,68,68,0.25)",
      color: "#7f1d1d",
    };
  }
  if (tone === "success") {
    return {
      background: "rgba(236,253,245,0.92)",
      border: "1px solid rgba(16,185,129,0.22)",
      color: "#065f46",
    };
  }
  if (tone === "info") {
    return {
      background: "rgba(239,246,255,0.92)",
      border: "1px solid rgba(59,130,246,0.20)",
      color: "#1e40af",
    };
  }
  return {
    background: "rgba(255,247,237,0.92)",
    border: "1px solid rgba(249,115,22,0.18)",
    color: "#9a3412",
  };
}

function groceryStatusMessage(status) {
  const s = String(status || "").toLowerCase();

  if (s === "rejected" || s === "cancelled") {
    return { title: "Order cancelled ", text: "This grocery order was cancelled/rejected.", tone: "danger" };
  }
  if (s === "delivered") {
    return { title: "Delivered successfully ", text: "Thanks! Your groceries are delivered.", tone: "success" };
  }
  if (s === "on_the_way") {
    return { title: "On the way ", text: "Your groceries are on the way.", tone: "info" };
  }
  if (s === "picked_up" || s === "delivering") {
    return { title: "Out for delivery ", text: "A delivery partner is bringing your groceries.", tone: "info" };
  }
  if (s === "ready") {
    return { title: "Order is ready ", text: "Store marked your order ready. Delivery will start soon.", tone: "success" };
  }
  if (s === "preparing" || s === "accepted" || s === "confirmed") {
    return { title: "Preparing ", text: "Store is preparing your grocery order.", tone: "info" };
  }
  return { title: "Order placed ", text: "We received your grocery order. Store will confirm soon.", tone: "warn" };
}

function StatusMessageCard({ status }) {
  const m = groceryStatusMessage(status);
  const st = messageBoxStyle(m.tone);
  return (
    <div style={{ marginTop: 10, borderRadius: 16, padding: 12, ...st, boxShadow: "0 10px 28px rgba(0,0,0,0.06)" }}>
      <div style={{ fontWeight: 1000, letterSpacing: -0.1 }}>{m.title}</div>
      <div style={{ marginTop: 6, fontWeight: 850, opacity: 0.9, fontSize: 13, lineHeight: 1.45 }}>{m.text}</div>
    </div>
  );
}

/* =========================
   STEPS (same clean style)
   ========================= */

function statusStepInfo(status) {
  const s = String(status || "").toLowerCase();

  if (s === "rejected" || s === "cancelled") {
    return { mode: "cancelled", currentIndex: 0 };
  }

  if (s === "delivered") return { mode: "normal", currentIndex: 3 };
  if (s === "on_the_way" || s === "picked_up" || s === "delivering") return { mode: "normal", currentIndex: 2 };
  if (s === "ready" || s === "preparing" || s === "accepted" || s === "confirmed") return { mode: "normal", currentIndex: 1 };
  return { mode: "normal", currentIndex: 0 };
}

function StatusSteps({ status }) {
  const { mode, currentIndex } = statusStepInfo(status);

  if (mode === "cancelled") {
    return (
      <div
        style={{
          marginTop: 10,
          borderRadius: 14,
          padding: 12,
          border: "1px solid rgba(239,68,68,0.25)",
          background: "rgba(254,242,242,0.90)",
        }}
      >
        <div style={{ fontWeight: 1000, color: "#7f1d1d" }}>Order Cancelled</div>
        <div style={{ marginTop: 6, fontWeight: 850, color: "rgba(127,29,29,0.85)", fontSize: 13 }}>
          This order was cancelled/rejected.
        </div>
      </div>
    );
  }

  const steps = ["Placed", "Preparing", "On the way", "Delivered"];

  return (
    <div style={stepsWrap}>
      {steps.map((t, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        return (
          <div key={t} style={stepItem}>
            <div style={{ ...stepDot, ...(done ? stepDotDone : active ? stepDotActive : stepDotTodo) }}>{done ? "\u2713" : i + 1}</div>
            <div style={{ ...stepLabel, opacity: done || active ? 1 : 0.65 }}>{t}</div>
            {i !== steps.length - 1 ? <div style={{ ...stepLine, ...(done ? stepLineDone : stepLineTodo) }} /> : null}
          </div>
        );
      })}
    </div>
  );
}

/* =========================
   MAP HELPERS (SAFE + COMPAT)
   ========================= */

function numOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pickLatLng(obj) {
  if (!obj) return null;

  const candidates = [
    ["lat", "lng"],
    ["latitude", "longitude"],
    ["location_lat", "location_lng"],
    ["store_lat", "store_lng"],
    ["customer_lat", "customer_lng"],
    ["drop_lat", "drop_lng"],
  ];

  for (const [a, b] of candidates) {
    const la = numOrNull(obj?.[a]);
    const lo = numOrNull(obj?.[b]);
    if (la !== null && lo !== null) return { lat: la, lng: lo };
  }

  return null;
}

function safeImgUrl(v) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("/")) return s;
  return "";
}

function isActiveDeliveryStatus(status) {
  const s = String(status || "").toLowerCase();
  return s === "delivering" || s === "picked_up" || s === "on_the_way";
}

const MAX_CHAT_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const CHAT_ATTACH_BUCKET = "order_chat_attachments";

export default function GroceryOrdersPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState("");

  const [user, setUser] = useState(null);
  const [role, setRole] = useState("");
  const [orders, setOrders] = useState([]);
  const [defaultCurrency, setDefaultCurrency] = useState("USD");

  const [lastRealtimeHit, setLastRealtimeHit] = useState("");
  const channelRef = useRef(null);

  //  store coords map: { [store_id]: { lat, lng } }
  const [storeCoords, setStoreCoords] = useState({});

  //  live driver GPS per order: { [orderId]: { lat, lng, ts, source } }
  const [liveGpsByOrderId, setLiveGpsByOrderId] = useState({});
  const gpsPollRef = useRef(null);

  //  details view toggle
  const [openOrderId, setOpenOrderId] = useState(null);

  const [reviewByOrderId, setReviewByOrderId] = useState({});
  const [reviewModalOrder, setReviewModalOrder] = useState(null);
  const [reviewForm, setReviewForm] = useState({ rating: 5, title: "", comment: "" });
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [deliveryProfiles, setDeliveryProfiles] = useState({});
  const [driverReviewByOrderId, setDriverReviewByOrderId] = useState({});
  const [driverReviewModalOrder, setDriverReviewModalOrder] = useState(null);
  const [driverReviewForm, setDriverReviewForm] = useState({ rating: 5, title: "", comment: "" });
  const [driverReviewSaving, setDriverReviewSaving] = useState(false);
  const [driverReviewError, setDriverReviewError] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [chatDraft, setChatDraft] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatSending, setChatSending] = useState(false);
  const [chatAvailable, setChatAvailable] = useState(true);
  const [chatError, setChatError] = useState("");
  const [chatFile, setChatFile] = useState(null);
  const [chatUnreadCounts, setChatUnreadCounts] = useState({});
  const chatChannelRef = useRef(null);
  const hiddenFileInput = useRef(null);

  const toast = useToast();

  const totalOrders = useMemo(() => orders.length, [orders]);

  const totalSpend = useMemo(() => {
    return (orders || []).reduce((sum, o) => sum + Number(o.total_amount || o.total || 0), 0);
  }, [orders]);

  const openOrder = useMemo(() => {
    if (!openOrderId) return null;
    return (orders || []).find((x) => x.id === openOrderId) || null;
  }, [orders, openOrderId]);

  function cleanupChatRealtime() {
    if (chatChannelRef.current) {
      supabase.removeChannel(chatChannelRef.current);
      chatChannelRef.current = null;
    }
  }

  useEffect(() => {
    return () => cleanupChatRealtime();
  }, []);

  useEffect(() => {
    cleanupChatRealtime();

    if (!user?.id || !openOrder?.id || !openOrder?.delivery_user_id) {
      setChatMessages([]);
      setChatDraft("");
      setChatError("");
      setChatAvailable(true);
      setChatLoading(false);
      return;
    }

    if (isReviewableStatus(openOrder?.status)) {
      setChatMessages([]);
      setChatDraft("");
      setChatError("");
      setChatAvailable(true);
      setChatLoading(false);
      return;
    }

    let alive = true;

    async function loadChat() {
      try {
        setChatLoading(true);
        setChatError("");

        const { data, error } = await supabase
          .from("order_chat_messages")
          .select("*")
          .eq("order_id", openOrder.id)
          .eq("order_type", "grocery")
          .order("created_at", { ascending: true });

        if (error) {
          const msg = String(error.message || "");
          if (/order_chat_messages/i.test(msg) || /relation .* does not exist/i.test(msg) || /row-level security/i.test(msg)) {
            if (alive) {
              setChatAvailable(false);
              setChatMessages([]);
              setChatError("Chat will show here once order chat is enabled.");
            }
            return;
          }
          throw error;
        }

        if (!alive) return;
        setChatAvailable(true);
        setChatMessages(Array.isArray(data) ? data : []);
      } catch (e) {
        if (!alive) return;
        setChatAvailable(false);
        setChatMessages([]);
        setChatError(e?.message || String(e) || "Unable to load chat right now.");
      } finally {
        if (alive) setChatLoading(false);
      }
    }

    loadChat();

    const channel = supabase
      .channel("order-chat-grocery-" + openOrder.id)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "order_chat_messages", filter: "order_id=eq." + openOrder.id },
        (payload) => {
          const next = payload?.new;
          if (!next || next.order_id !== openOrder.id || next.order_type !== "grocery") return;
          if (!alive) return;
          setChatMessages((current) => {
            if ((current || []).some((item) => item.id === next.id)) return current;
            return [...(current || []), next];
          });
        }
      )
      .subscribe();

    chatChannelRef.current = channel;

    return () => {
      alive = false;
      cleanupChatRealtime();
    };
  }, [user?.id, openOrder?.id, openOrder?.delivery_user_id, openOrder?.status]);

  function onAttachClick() {
    hiddenFileInput.current?.click();
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_CHAT_ATTACHMENT_BYTES) {
      alert("File is too large (max 5MB)");
      return;
    }

    setChatFile(file);
  }

  async function sendChatMessage() {
    const message = String(chatDraft || "").trim();
    if (!user?.id || !openOrder?.id || !openOrder?.delivery_user_id || (!message && !chatFile)) return;

    try {
      setChatSending(true);
      setChatError("");

      let attachment_url = null;
      let attachment_name = null;
      let attachment_type = null;

      if (chatFile) {
        const fileExt = chatFile.name.split(".").pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `grocery/${openOrder.id}/${user.id}/${Date.now()}-${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from(CHAT_ATTACH_BUCKET)
          .upload(filePath, chatFile);

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage
          .from(CHAT_ATTACH_BUCKET)
          .getPublicUrl(filePath);

        attachment_url = publicUrlData.publicUrl;
        attachment_name = chatFile.name;
        attachment_type = chatFile.type;
      }

      const { data, error } = await supabase
        .from("order_chat_messages")
        .insert({
          order_id: openOrder.id,
          order_type: "grocery",
          customer_user_id: user.id,
          driver_user_id: openOrder.delivery_user_id,
          sender_user_id: user.id,
          sender_role: "customer",
          message: message || "Photo attached",
          attachment_url,
          attachment_name,
          attachment_type,
        })
        .select("*")
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setChatMessages((current) => {
          if ((current || []).some((item) => item.id === data.id)) return current;
          return [...(current || []), data];
        });
      }

      setChatDraft("");
      setChatFile(null);
      setChatAvailable(true);

      // Notify driver
      if (openOrder.delivery_user_id) {
        try {
          await fetch("/api/send-chat-notification", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              orderId: openOrder.id,
              orderType: "grocery",
              recipientRole: "driver",
              recipientUserId: openOrder.delivery_user_id,
              senderRole: "customer",
              senderName: user.email?.split("@")[0] || "Customer",
              preview: message || "Photo attached",
            }),
          });
        } catch (err) {
          console.log("Chat notification error:", err);
        }
      }
    } catch (e) {
      setChatError(e?.message || String(e) || "Unable to send message right now.");
    } finally {
      setChatSending(false);
    }
  }

  function renderStars(rating) {
    const value = Math.max(1, Math.min(5, Math.round(Number(rating || 0))));
    return "\u2605".repeat(value) + "\u2606".repeat(5 - value);
  }

  async function loadDefaultCurrencyFromSettings() {
    try {
      const { data, error } = await supabase
        .from("system_settings")
        .select("key, default_currency")
        .eq("key", "global")
        .maybeSingle();

      if (error) return;

      const c = String(data?.default_currency || "USD").toUpperCase();
      setDefaultCurrency(c === "INR" ? "INR" : "USD");
    } catch {}
  }

  async function loadDeliveryProfilesFromOrders(ordersList) {
    try {
      const ids = Array.from(new Set((ordersList || []).map((o) => o.delivery_user_id).filter(Boolean)));
      if (!ids.length) {
        setDeliveryProfiles({});
        return;
      }

      const res = await fetch("/api/public-delivery-profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload?.success === false) {
        throw new Error(payload?.message || "Could not load delivery partner profiles.");
      }
      setDeliveryProfiles(payload?.profiles || {});
    } catch {
      setDeliveryProfiles({});
    }
  }

  async function loadOwnReviews(userId, ordersList) {
    const reviewableOrderIds = (ordersList || [])
      .filter((order) => isReviewableStatus(order?.status) && order?.store_id)
      .map((order) => order.id)
      .filter(Boolean);

    if (!userId || !reviewableOrderIds.length) {
      setReviewByOrderId({});
      setDriverReviewByOrderId({});
      return;
    }

    try {
      const rows = await fetchReviewsByOrderIds(supabase, { userId, orderIds: reviewableOrderIds });
      const map = {};
      const driverMap = {};
      for (const row of rows || []) {
        if (!row?.order_id) continue;
        const targetType = String(row?.target_type || "").toLowerCase();
        if (targetType === "driver") driverMap[row.order_id] = row;
        else if (targetType === "grocery") map[row.order_id] = row;
      }
      setReviewByOrderId(map);
      setDriverReviewByOrderId(driverMap);
    } catch {
      setReviewByOrderId({});
      setDriverReviewByOrderId({});
    }
  }

  function openReviewModal(order) {
    const existing = reviewByOrderId?.[order?.id] || null;
    setReviewError("");
    setReviewModalOrder(order);
    setReviewForm({
      rating: Number(existing?.rating || 5) || 5,
      title: String(existing?.title || ""),
      comment: String(existing?.comment || ""),
    });
  }

  function closeReviewModal() {
    if (reviewSaving) return;
    setReviewModalOrder(null);
    setReviewError("");
  }

  function openDriverReviewModal(order) {
    const existing = driverReviewByOrderId?.[order?.id] || null;
    setDriverReviewError("");
    setDriverReviewModalOrder(order);
    setDriverReviewForm({
      rating: Number(existing?.rating || 5) || 5,
      title: String(existing?.title || ""),
      comment: String(existing?.comment || ""),
    });
  }

  function closeDriverReviewModal() {
    if (driverReviewSaving) return;
    setDriverReviewModalOrder(null);
    setDriverReviewError("");
  }

  async function saveReview() {
    if (!user?.id || !reviewModalOrder?.id || !reviewModalOrder?.store_id) return;
    const rating = Math.max(1, Math.min(5, Number(reviewForm.rating || 0) || 0));
    if (!rating) {
      setReviewError("Please choose a rating.");
      return;
    }

    setReviewSaving(true);
    setReviewError("");

    const payload = {
      user_id: user.id,
      order_id: reviewModalOrder.id,
      target_type: "grocery",
      target_id: reviewModalOrder.store_id,
      rating,
      title: String(reviewForm.title || "").trim() || null,
      comment: String(reviewForm.comment || "").trim() || null,
      is_visible: true,
    };

    try {
      const existing = reviewByOrderId?.[reviewModalOrder.id];
      if (existing?.id) {
        const { error } = await supabase.from("reviews").update(payload).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("reviews").insert(payload);
        if (error) throw error;
      }

      const latest = await loadGroceryOrders(user.id);
      await loadOwnReviews(user.id, latest);
      setReviewModalOrder(null);
    } catch (e) {
      setReviewError(e?.message || String(e));
    } finally {
      setReviewSaving(false);
    }
  }

  async function saveDriverReview() {
    if (!user?.id || !driverReviewModalOrder?.id || !driverReviewModalOrder?.delivery_user_id) return;
    const rating = Math.max(1, Math.min(5, Number(driverReviewForm.rating || 0) || 0));
    if (!rating) {
      setDriverReviewError("Please choose a rating.");
      return;
    }

    setDriverReviewSaving(true);
    setDriverReviewError("");

    const payload = {
      user_id: user.id,
      order_id: driverReviewModalOrder.id,
      target_type: "driver",
      target_id: driverReviewModalOrder.delivery_user_id,
      rating,
      title: String(driverReviewForm.title || "").trim() || null,
      comment: String(driverReviewForm.comment || "").trim() || null,
      is_visible: true,
    };

    try {
      const existing = driverReviewByOrderId?.[driverReviewModalOrder.id];
      if (existing?.id) {
        const { error } = await supabase.from("reviews").update(payload).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("reviews").insert(payload);
        if (error) throw error;
      }

      const latest = await loadGroceryOrders(user.id);
      await loadOwnReviews(user.id, latest);
      setDriverReviewModalOrder(null);
    } catch (e) {
      setDriverReviewError(e?.message || String(e));
    } finally {
      setDriverReviewSaving(false);
    }
  }

  function cleanupRealtime() {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }

  function stopGpsPolling() {
    if (gpsPollRef.current) {
      clearInterval(gpsPollRef.current);
      gpsPollRef.current = null;
    }
  }

  //  Fetch latest GPS for ONE order (fast view first, then fallback table)
  async function fetchLatestGpsForOrder(orderId) {
    if (!orderId) return null;

    // Try view: delivery_latest_location
    try {
      const { data, error } = await supabase
        .from("delivery_latest_location")
        .select("order_id, lat, lng, created_at")
        .eq("order_id", orderId)
        .maybeSingle();

      if (!error && data?.lat != null && data?.lng != null) {
        return {
          lat: Number(data.lat),
          lng: Number(data.lng),
          ts: data.created_at,
          source: "view",
        };
      }
    } catch {}

    // Fallback: query delivery_events directly
    try {
      const { data, error } = await supabase
        .from("delivery_events")
        .select("lat,lng,created_at,event_type")
        .eq("order_id", orderId)
        .in("event_type", ["gps", "gps_test"])
        .not("lat", "is", null)
        .not("lng", "is", null)
        .order("created_at", { ascending: false })
        .limit(1);

      if (error) return null;
      const row = Array.isArray(data) ? data[0] : null;
      if (!row?.lat || !row?.lng) return null;

      return {
        lat: Number(row.lat),
        lng: Number(row.lng),
        ts: row.created_at,
        source: "events",
      };
    } catch {
      return null;
    }
  }

  function startGpsPolling(activeOrders) {
    stopGpsPolling();

    const active = (activeOrders || []).filter((o) => isActiveDeliveryStatus(o.status));
    if (active.length === 0) return;

    const tick = async () => {
      try {
        for (const o of active) {
          const loc = await fetchLatestGpsForOrder(o.id);
          if (!loc) continue;

          setLiveGpsByOrderId((m) => {
            const prev = m[o.id];
            const same =
              prev &&
              String(prev.ts || "") === String(loc.ts || "") &&
              Number(prev.lat) === Number(loc.lat) &&
              Number(prev.lng) === Number(loc.lng);

            if (same) return m;
            return { ...(m || {}), [o.id]: loc };
          });
        }
      } catch {}
    };

    tick();
    gpsPollRef.current = setInterval(tick, 5000);
  }

  //  schema-safe store coords loader (tries different column sets)
  async function loadStoreCoordsFromOrders(ordersList) {
    try {
      const ids = Array.from(new Set((ordersList || []).map((o) => o.store_id).filter(Boolean)));
      if (ids.length === 0) {
        setStoreCoords({});
        return;
      }

      const tries = ["id, lat, lng", "id, latitude, longitude", "id, location_lat, location_lng"];

      let rows = null;
      for (const sel of tries) {
        const { data, error } = await supabase.from("grocery_stores").select(sel).in("id", ids);
        if (!error) {
          rows = data || [];
          break;
        }
      }

      const map = {};
      for (const r of rows || []) {
        const ll = pickLatLng(r);
        if (ll) map[r.id] = ll;
      }
      setStoreCoords(map);
    } catch {
      setStoreCoords({});
    }
  }

  async function loadGroceryOrders(customerId) {
    // main select (expected schema)
    const baseSelect = `
      id,
      customer_user_id,
      store_id,
      status,
      total_amount,
      delivery_fee,
      tip_amount,
      created_at,
      updated_at,
      customer_name,
      customer_phone,
      delivery_address,
      instructions,
      delivery_user_id,
      customer_lat,
      customer_lng,
      grocery_order_items (
        id,
        order_id,
        product_name,
        quantity,
        unit_price,
        line_total
      )
    `;

    const altSelect = `
      id,
      customer_user_id,
      store_id,
      status,
      total_amount,
      delivery_fee,
      tip_amount,
      created_at,
      updated_at,
      customer_name,
      customer_phone,
      delivery_address,
      instructions,
      delivery_user_id,
      customer_lat,
      customer_lng
    `;

    let data = null;
    let error = null;

    const r1 = await supabase
      .from("grocery_orders")
      .select(baseSelect)
      .eq("customer_user_id", customerId)
      .order("created_at", { ascending: false });

    if (!r1.error) {
      data = r1.data;
    } else {
      const r2 = await supabase
        .from("grocery_orders")
        .select(altSelect)
        .eq("customer_user_id", customerId)
        .order("created_at", { ascending: false });

      data = r2.data;
      error = r2.error;
    }

    if (error) throw error;

    const list = Array.isArray(data) ? data : [];
    const hasEmbedded = list.some((o) => Array.isArray(o.grocery_order_items));

    const normalizeItem = (it, fallbackOrderId = null) => ({
      id: it?.id,
      order_id: it?.order_id ?? fallbackOrderId ?? null,
      item_ref_id: it?.grocery_item_id ?? it?.item_id ?? it?.product_id ?? it?.menu_item_id ?? null,
      product_name: it?.product_name ?? it?.item_name ?? it?.name ?? "",
      quantity: Number(it?.quantity ?? it?.qty ?? it?.count ?? 0) || 0,
      unit_price: Number(it?.unit_price ?? it?.price_each ?? it?.price ?? it?.unit_amount ?? 0) || 0,
      image_url: safeImgUrl(it?.image_url ?? it?.img ?? it?.photo_url ?? it?.picture_url ?? ""),
      line_total:
        Number(it?.line_total ?? it?.total ?? it?.amount ?? it?.subtotal ?? 0) ||
        (Number(it?.quantity ?? it?.qty ?? it?.count ?? 0) || 0) * (Number(it?.unit_price ?? it?.price_each ?? it?.price ?? it?.unit_amount ?? 0) || 0),
    });

    if (!hasEmbedded && list.length > 0) {
      const ids = list.map((o) => o.id).filter(Boolean);
      const { data: itemsData } = await supabase.from("grocery_order_items").select("*").in("order_id", ids);

      const byOrder = {};
      for (const it of itemsData || []) {
        const k = it.order_id;
        if (!byOrder[k]) byOrder[k] = [];
        byOrder[k].push(normalizeItem(it, k));
      }

      for (const o of list) {
        o.grocery_order_items = byOrder[o.id] || [];
      }
    } else if (hasEmbedded) {
      for (const o of list) {
        const embedded = Array.isArray(o.grocery_order_items) ? o.grocery_order_items : [];
        o.grocery_order_items = embedded.map((it) => normalizeItem(it, o.id));
      }
    }

    // Enrich missing item names/images from grocery_items table when item id is available.
    const refIds = Array.from(
      new Set(
        list
          .flatMap((o) => (Array.isArray(o.grocery_order_items) ? o.grocery_order_items : []))
          .map((it) => it?.item_ref_id)
          .filter(Boolean)
          .map(String)
      )
    );
    if (refIds.length > 0) {
      try {
        const { data: rows, error: itemMetaErr } = await supabase.from("grocery_items").select("id, name, image_url").in("id", refIds);
        if (!itemMetaErr) {
          const metaById = new Map();
          for (const r of rows || []) {
            metaById.set(String(r.id), {
              name: String(r?.name || "").trim(),
              image_url: safeImgUrl(r?.image_url),
            });
          }
          for (const o of list) {
            const its = Array.isArray(o.grocery_order_items) ? o.grocery_order_items : [];
            o.grocery_order_items = its.map((it) => {
              const meta = it?.item_ref_id ? metaById.get(String(it.item_ref_id)) : null;
              return {
                ...it,
                product_name: String(it?.product_name || "").trim() || meta?.name || "Item",
                image_url: safeImgUrl(it?.image_url) || safeImgUrl(meta?.image_url),
              };
            });
          }
        }
      } catch {}
    }

    setOrders(list);
    await loadStoreCoordsFromOrders(list);
    await loadDeliveryProfilesFromOrders(list);

    //  If open order removed, close safely
    if (openOrderId && !list.find((x) => x.id === openOrderId)) {
      setOpenOrderId(null);
    }

    return list;
  }

  async function setupRealtime(customerId) {
    cleanupRealtime();

    channelRef.current = supabase
      .channel(`realtime-customer-grocery-orders-${customerId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "grocery_orders", filter: `customer_user_id=eq.${customerId}` }, async () => {
        setLastRealtimeHit(new Date().toLocaleTimeString());
        const list = await loadGroceryOrders(customerId);
        await loadOwnReviews(customerId, list);
        await loadDefaultCurrencyFromSettings();
      })
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "order_chat_messages",
          filter: `customer_user_id=eq.${customerId}`,
        },
        (payload) => {
          const next = payload.new;
          if (!next || next.order_type !== "grocery" || next.sender_role === "customer") return;

          setChatUnreadCounts((prev) => {
            const currentCount = prev[next.order_id] || 0;
            return { ...prev, [next.order_id]: currentCount + 1 };
          });

          // Show in-app toast if order details not open
          if (openOrderId !== next.order_id) {
            toast.show(`New message from driver for grocery order #${next.order_id.slice(0, 8)}`, "info");
          }
        }
      )
      .subscribe();
  }

  async function init() {
    setLoading(true);
    setErrMsg("");

    try {
      const { user: u, error: userErr } = await getUserWithRetry(3);
      if (userErr && !isAbortAuthError(userErr)) throw userErr;

      if (!u) {
        if (isAbortAuthError(userErr)) {
          setErrMsg("Temporary session sync issue. Please wait a moment and refresh.");
          return;
        }
        router.push("/login");
        return;
      }
      setUser(u);

      const { data: prof, error: profErr } = await supabase.from("profiles").select("role").eq("user_id", u.id).maybeSingle();
      if (profErr) throw profErr;

      const r = normalizeRole(prof?.role);
      setRole(r);

      // redirect non-customer roles away
      if (r === "restaurant_owner") {
        router.push("/restaurants/orders");
        return;
      }
      if (r === "grocery_owner") {
        router.push("/groceries/owner/orders");
        return;
      }
      if (r === "delivery_partner") {
        router.push("/delivery");
        return;
      }

      await loadDefaultCurrencyFromSettings();
      const loadedOrders = await loadGroceryOrders(u.id);
      await loadOwnReviews(u.id, loadedOrders);
      await setupRealtime(u.id);
    } catch (e) {
      setErrMsg(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    init();
    return () => {
      cleanupRealtime();
      stopGpsPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user) return;
    startGpsPolling(orders);
    return () => stopGpsPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, user]);

  //  Invoice action: open PREMIUM invoice page in SAME TAB (like restaurant invoice)
  function goToInvoicePage(order) {
    if (!order?.id) return;
    router.push(`/groceries/orders/invoice?id=${order.id}`);
  }

  return (
    <main style={pageBg}>
      <div style={{ width: "100%", margin: 0 }}>
        {/* HERO */}
        <div style={heroGlass}>
          <div style={{ minWidth: 260 }}>
            <div style={pill}>Customer - Grocery</div>
            <h1 style={heroTitle}>Grocery Orders</h1>
            <div style={subText}>Track your grocery orders & status updates (Realtime)</div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div style={statCard}>
              <div style={statNum}>{totalOrders}</div>
              <div style={statLabel}>Total Orders</div>
            </div>

            <div style={statCard}>
              <div style={statNum}>{formatMoney(totalSpend, defaultCurrency)}</div>
              <div style={statLabel}>Total Spend</div>
            </div>

            <Link href="/groceries" style={pill}>
              Groceries
            </Link>
            <Link href="/orders" style={pill}>
              Restaurant Orders
            </Link>
          </div>
        </div>

        {errMsg ? <div style={alertErr}>{errMsg}</div> : null}

        {user ? (
          <div style={{ ...cardGlass, marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontWeight: 1000, color: "#0b1220" }}>Account</div>
                <div style={{ marginTop: 6, color: "rgba(17,24,39,0.72)", fontWeight: 850 }}>
                  <b>Email:</b> {user.email}
                </div>
                <div style={{ marginTop: 4, color: "rgba(17,24,39,0.72)", fontWeight: 850 }}>
                  <b>Role:</b> {role}
                </div>
              </div>

              <div style={{ minWidth: 220 }}>
                <div style={{ fontWeight: 1000, color: "#0b1220" }}>Realtime</div>
                <div style={{ marginTop: 6, color: "rgba(6,95,70,0.95)", fontWeight: 950 }}>
                  ON {lastRealtimeHit ? `(last event: ${lastRealtimeHit})` : ""}
                </div>
                <div style={{ marginTop: 6, color: "rgba(17,24,39,0.65)", fontWeight: 800, fontSize: 12 }}>
                  Status changes will update automatically.
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {loading ? <div style={{ marginTop: 14, color: "rgba(17,24,39,0.7)", fontWeight: 900 }}>Loading...</div> : null}

        {!loading && orders.length === 0 ? (
          <div style={emptyBox}>
            No grocery orders yet.{" "}
            <Link href="/groceries" style={{ color: "#111827", fontWeight: 1000 }}>
              Browse groceries
            </Link>
          </div>
        ) : null}

        {/* =========================
            CLEAN LIST VIEW (NO MAPS)
           ========================= */}
        {!loading && orders.length > 0 && !openOrder ? (
          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
            {orders.map((o) => {
              const badge = statusBadge(o.status);
              const items = Array.isArray(o.grocery_order_items) ? o.grocery_order_items : [];
              const total = Number(o.total_amount || o.total || 0);

              const firstItemName = items?.[0]?.product_name || "Items";
              const qtyCount = items.reduce((s, it) => s + Number(it.quantity || 0), 0);

              return (
                <div key={o.id} style={listCard} onClick={() => setOpenOrderId(o.id)} title="Click to view details">
                  <div style={row}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ padding: "6px 10px", borderRadius: 999, fontWeight: 1000, fontSize: 12, ...badge }}>
                        {friendlyStatus(o.status).toUpperCase()}
                      </span>

                      <div style={{ fontWeight: 1000, color: "#0b1220" }}>
                        Grocery Order - <span style={{ opacity: 0.7 }}>{String(o.id).slice(0, 8)}...</span>
                      </div>

                      <span style={{ color: "rgba(17,24,39,0.65)", fontWeight: 900, fontSize: 12 }}>{formatTime(o.created_at)}</span>
                    </div>

                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <div style={{ fontWeight: 1000, color: "#0b1220" }}>{formatMoney(total, defaultCurrency)}</div>
                      {isReviewableStatus(o.status) && o.store_id ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openReviewModal(o);
                          }}
                          style={reviewByOrderId[o.id] ? btnReviewGhost : btnReview}
                        >
                          {reviewByOrderId[o.id] ? "Edit Review" : "Write Review"}
                        </button>
                      ) : null}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenOrderId(o.id);
                          setChatUnreadCounts((prev) => ({ ...prev, [o.id]: 0 }));
                        }}
                        style={{ ...btnView, position: "relative" }}
                      >
                        View details
                        {chatUnreadCounts[o.id] > 0 ? (
                          <span
                            style={{
                              position: "absolute",
                              top: -8,
                              right: -8,
                              background: "#ef4444",
                              color: "#fff",
                              borderRadius: "50%",
                              width: 20,
                              height: 20,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 10,
                              fontWeight: 1000,
                              border: "2px solid #fff",
                              boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
                            }}
                          >
                            {chatUnreadCounts[o.id]}
                          </span>
                        ) : null}
                      </button>
                    </div>
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <StatusSteps status={o.status} />
                  </div>

                  <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <div style={{ color: "rgba(17,24,39,0.72)", fontWeight: 900 }}>
                      {firstItemName}
                      {qtyCount > 1 ? (
                        <span style={{ marginLeft: 8, color: "rgba(17,24,39,0.55)", fontWeight: 900, fontSize: 12 }}>
                          + {qtyCount - 1} more
                        </span>
                      ) : null}
                    </div>

                    <div style={{ color: "rgba(17,24,39,0.55)", fontWeight: 850, fontSize: 12 }}>
                      Click to open tracking + items
                    </div>
                  </div>

                  <StatusMessageCard status={o.status} />
                </div>
              );
            })}
          </div>
        ) : null}

        {/* =========================
            DETAIL VIEW (ONLY ONE ORDER)
           ========================= */}
        {!loading && orders.length > 0 && openOrder ? (
          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
            {(() => {
              const o = openOrder;
              const badge = statusBadge(o.status);
              const items = Array.isArray(o.grocery_order_items) ? o.grocery_order_items : [];
              const total = Number(o.total_amount || o.total || 0);
              const dp = o.delivery_user_id ? deliveryProfiles[o.delivery_user_id] : null;

              //  map points
              const pickup = o.store_id ? storeCoords[o.store_id] || null : null;
              const drop = pickLatLng({ customer_lat: o.customer_lat, customer_lng: o.customer_lng }) || null;

              //  live driver gps (if available)
              const live = liveGpsByOrderId[o.id] || null;
              const liveOk = live?.lat != null && live?.lng != null && isActiveDeliveryStatus(o.status);

              const liveLabel = !isActiveDeliveryStatus(o.status)
                ? "Live GPS available during delivery"
                : liveOk
                ? `Live GPS connected  (updated: ${formatTime(live.ts)})`
                : "Waiting for driver GPS...";

              const hasAnyMapPoint = !!pickup || !!drop || (liveOk && live);

              return (
                <div style={cardGlass}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <button onClick={() => setOpenOrderId(null)} style={btnBack}>
                      Back to all grocery orders
                    </button>

                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ padding: "6px 10px", borderRadius: 999, fontWeight: 1000, fontSize: 12, ...badge }}>
                        {friendlyStatus(o.status).toUpperCase()}
                      </span>

                      <span style={{ color: "rgba(17,24,39,0.65)", fontWeight: 900, fontSize: 12 }}>{formatTime(o.created_at)}</span>

                      <span style={{ color: "rgba(17,24,39,0.65)", fontWeight: 900, fontSize: 12 }}>
                        Order ID: <span style={{ color: "#0b1220" }}>{o.id}</span>
                      </span>
                    </div>

                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <div style={{ fontWeight: 1000, color: "#0b1220" }}>Total: {formatMoney(total, defaultCurrency)}</div>
                      {isReviewableStatus(o.status) && o.store_id ? (
                        <button onClick={() => openReviewModal(o)} style={reviewByOrderId[o.id] ? btnReviewGhost : btnReview}>
                          {reviewByOrderId[o.id] ? "Edit Review" : "Write Review"}
                        </button>
                      ) : null}
                      {isReviewableStatus(o.status) && o.delivery_user_id ? (
                        <button onClick={() => openDriverReviewModal(o)} style={driverReviewByOrderId[o.id] ? btnReviewGhost : btnReview}>
                          {driverReviewByOrderId[o.id] ? "Edit Driver Review" : "Rate Driver"}
                        </button>
                      ) : null}
                      {/* Invoice button (same tab) */}
                      <button
                        style={btnInvoice}
                        onClick={() => goToInvoicePage(o)}
                        title="Open invoice page"
                      >
                        Invoice / Print
                      </button>
                    </div>
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <StatusSteps status={o.status} />
                  </div>

                  <StatusMessageCard status={o.status} />

                  {reviewByOrderId[o.id] ? (
                    <div
                      style={{
                        marginTop: 12,
                        borderRadius: 16,
                        border: "1px solid rgba(0,0,0,0.08)",
                        background: "rgba(255,255,255,0.75)",
                        padding: 12,
                      }}
                    >
                      <div style={{ fontWeight: 1000, color: "#0b1220" }}>Your Review</div>
                      <div style={{ marginTop: 6, fontWeight: 900, color: "rgba(17,24,39,0.78)" }}>{renderStars(reviewByOrderId[o.id].rating)}</div>
                      {reviewByOrderId[o.id].title ? <div style={{ marginTop: 6, fontWeight: 900, color: "#0b1220" }}>{reviewByOrderId[o.id].title}</div> : null}
                      {reviewByOrderId[o.id].comment ? <div style={{ marginTop: 6, color: "rgba(17,24,39,0.72)", lineHeight: 1.45 }}>{reviewByOrderId[o.id].comment}</div> : null}
                    </div>
                  ) : null}

                  {driverReviewByOrderId[o.id] ? (
                    <div
                      style={{
                        marginTop: 12,
                        borderRadius: 16,
                        border: "1px solid rgba(0,0,0,0.08)",
                        background: "rgba(255,255,255,0.75)",
                        padding: 12,
                      }}
                    >
                      <div style={{ fontWeight: 1000, color: "#0b1220" }}>Your Driver Review</div>
                      <div style={{ marginTop: 6, fontWeight: 900, color: "rgba(17,24,39,0.78)" }}>{renderStars(driverReviewByOrderId[o.id].rating)}</div>
                      {driverReviewByOrderId[o.id].title ? <div style={{ marginTop: 6, fontWeight: 900, color: "#0b1220" }}>{driverReviewByOrderId[o.id].title}</div> : null}
                      {driverReviewByOrderId[o.id].comment ? <div style={{ marginTop: 6, color: "rgba(17,24,39,0.72)", lineHeight: 1.45 }}>{driverReviewByOrderId[o.id].comment}</div> : null}
                    </div>
                  ) : null}

                  {/*  LIVE TRACKING ONLY IN DETAILS */}
                  <div style={{ marginTop: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                      <div style={{ fontWeight: 1000, color: "#0b1220" }}>Live Tracking</div>
                      <div style={{ color: "rgba(17,24,39,0.65)", fontWeight: 850, fontSize: 12 }}>{liveLabel}</div>
                    </div>

                    <div style={{ marginTop: 10 }}>
                      {!hasAnyMapPoint ? (
                        <div
                          style={{
                            height: 320,
                            borderRadius: 16,
                            border: "1px solid rgba(0,0,0,0.12)",
                            background: "rgba(255,255,255,0.75)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: 900,
                            color: "rgba(17,24,39,0.7)",
                            textAlign: "center",
                            padding: 14,
                          }}
                        >
                          Location not available yet (pickup/drop not saved).
                          <br />
                          Tracking will appear when delivery starts.
                        </div>
                      ) : (
                        <CustomerTrackingMap
                          pickup={pickup}
                          drop={drop}
                          driver={liveOk ? { lat: live.lat, lng: live.lng } : null}
                          driverUpdatedAt={live?.ts || null}
                          status={o.status}
                          height={320}
                        />
                      )}
                    </div>

                    <div style={{ marginTop: 8, color: "rgba(17,24,39,0.65)", fontWeight: 800, fontSize: 12 }}>
                      {pickup ? (
                        <>
                          Pickup: {pickup?.lat?.toFixed?.(4)}, {pickup?.lng?.toFixed?.(4)}
                        </>
                      ) : (
                        <>Pickup: -</>
                      )}{" "} - {" "}
                      {drop ? (
                        <>
                          Drop: {drop?.lat?.toFixed?.(4)}, {drop?.lng?.toFixed?.(4)}
                        </>
                      ) : (
                        <>Drop: -</>
                      )}
                      {liveOk ? (
                        <>
                          {" "} - Driver: {Number(live.lat).toFixed(5)}, {Number(live.lng).toFixed(5)}
                        </>
                      ) : null}
                    </div>

                    {!pickup ? (
                      <div style={{ marginTop: 6, color: "rgba(17,24,39,0.60)", fontWeight: 800, fontSize: 12 }}>
                        Note: Store pickup coordinates not found yet. Add lat/lng to <b>grocery_stores</b> to show pickup point.
                      </div>
                    ) : null}
                  </div>

                  {o.delivery_user_id ? <DeliveryPerson dp={dp || { full_name: "Delivery Partner" }} /> : null}

                  {o.delivery_user_id && !isReviewableStatus(o.status) ? (
                    <div
                      style={{
                        marginTop: 12,
                        borderRadius: 16,
                        border: "1px solid rgba(34,197,94,0.15)",
                        background: "rgba(255,255,255,0.82)",
                        padding: 14,
                      }}
                    >
                      <div style={{ fontWeight: 1000, color: "#0b1220" }}>Driver Chat</div>
                      <div style={{ marginTop: 6, color: "rgba(17,24,39,0.72)", fontSize: 13, lineHeight: 1.5 }}>
                        Chat with your assigned driver while the order is still active.
                      </div>

                      <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                        {chatLoading ? (
                          <div style={{ color: "rgba(17,24,39,0.65)", fontWeight: 800 }}>Loading chat...</div>
                        ) : chatMessages.length ? (
                          chatMessages.map((msg) => {
                            const own = msg.sender_role === "customer";
                            return (
                              <div
                                key={msg.id}
                                style={{
                                  justifySelf: own ? "end" : "start",
                                  maxWidth: "88%",
                                  borderRadius: 14,
                                  padding: "10px 12px",
                                  border: own ? "1px solid #22C55E" : "1px solid rgba(15,23,42,0.12)",
                                  background: own ? "rgba(34,197,94,0.12)" : "rgba(248,250,252,0.95)",
                                }}
                              >
                                <div style={{ fontSize: 11, fontWeight: 900, color: own ? "#15803D" : "#475569", textTransform: "uppercase", letterSpacing: 0.4 }}>
                                  {own ? "You" : "Driver"}
                                </div>
                                <div style={{ marginTop: 4, color: "#0f172a", fontSize: 14, lineHeight: 1.5 }}>
  {msg.message}
</div>

{/* Attachment display */}
{msg.attachment_url ? (
  <div style={{ marginTop: 8 }}>
    {msg.attachment_type?.startsWith("image") ? (
      <img
        src={msg.attachment_url}
        alt={msg.attachment_name || "attachment"}
        style={{
          width: "100%",
          maxWidth: 220,
          borderRadius: 10,
          border: "1px solid rgba(0,0,0,0.1)",
        }}
      />
    ) : (
      <a
        href={msg.attachment_url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          color: "#2563eb",
          fontWeight: 900,
          textDecoration: "underline",
        }}
      >
        {msg.attachment_name || "View attachment"}
      </a>
    )}
  </div>
) : null}
                              </div>
                            );
                          })
                        ) : (
                          <div style={{ color: "rgba(17,24,39,0.65)", fontSize: 13, lineHeight: 1.5 }}>
                            No messages yet. Use chat for directions, gate codes, or quick delivery notes.
                          </div>
                        )}
                      </div>

                      {chatError ? (
                        <div style={{ marginTop: 10, color: "#B91C1C", fontWeight: 800, fontSize: 13 }}>{chatError}</div>
                      ) : null}

                      <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <button
                            type="button"
                            onClick={onAttachClick}
                            style={{
                              padding: "6px 12px",
                              borderRadius: 10,
                              border: "1px solid rgba(0,0,0,0.12)",
                              background: "#f1f5f9",
                              fontSize: 12,
                              fontWeight: 1000,
                              cursor: "pointer",
                            }}
                          >
                            Attach Photo
                          </button>
                          {chatFile ? (
                            <div style={{ fontSize: 12, fontWeight: 900, color: "#15803D", display: "flex", alignItems: "center", gap: 6 }}>
                              <span>📎 {chatFile.name}</span>
                              <button
                                type="button"
                                onClick={() => setChatFile(null)}
                                style={{ border: "none", background: "none", color: "#B91C1C", cursor: "pointer", fontWeight: 1000 }}
                              >
                                Remove
                              </button>
                            </div>
                          ) : null}
                          <input
                            type="file"
                            ref={hiddenFileInput}
                            onChange={handleFileChange}
                            style={{ display: "none" }}
                            accept="image/*"
                          />
                        </div>

                        <textarea
                          value={chatDraft}
                          onChange={(e) => setChatDraft(e.target.value)}
                          placeholder="Message your driver"
                          rows={3}
                          style={{
                            width: "100%",
                            resize: "vertical",
                            borderRadius: 14,
                            border: "1px solid rgba(15,23,42,0.12)",
                            background: "#fff",
                            padding: "12px 14px",
                            fontSize: 14,
                            color: "#0f172a",
                            outline: "none",
                          }}
                        />
                        <div style={{ display: "flex", justifyContent: "flex-end" }}>
                          <button
                            type="button"
                            onClick={sendChatMessage}
                            disabled={!chatAvailable || chatSending || (!String(chatDraft || "").trim() && !chatFile)}
                            style={{
                              borderRadius: 999,
                              border: "none",
                              background: !chatAvailable || chatSending || (!String(chatDraft || "").trim() && !chatFile) ? "rgba(34,197,94,0.35)" : "#22C55E",
                              color: "#04130A",
                              fontWeight: 1000,
                              padding: "11px 18px",
                              cursor: !chatAvailable || chatSending || (!String(chatDraft || "").trim() && !chatFile) ? "not-allowed" : "pointer",
                            }}
                          >
                            {chatSending ? "Sending..." : "Send"}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : o.delivery_user_id ? (
                    <div
                      style={{
                        marginTop: 12,
                        borderRadius: 16,
                        border: "1px solid rgba(15,23,42,0.08)",
                        background: "rgba(255,255,255,0.7)",
                        padding: 14,
                        color: "rgba(17,24,39,0.7)",
                        fontWeight: 800,
                      }}
                    >
                      Chat closed after delivery.
                    </div>
                  ) : null}

                  <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {/* Delivery */}
                    <div
                      style={{
                        borderRadius: 16,
                        border: "1px solid rgba(0,0,0,0.08)",
                        background: "rgba(255,255,255,0.75)",
                        padding: 12,
                      }}
                    >
                      <div style={{ fontWeight: 1000, color: "#0b1220" }}>Delivery</div>

                      <div style={{ marginTop: 8, color: "rgba(17,24,39,0.72)", fontWeight: 850 }}>
                        <b>Name:</b> {o.customer_name || "-"}
                      </div>
                      <div style={{ marginTop: 4, color: "rgba(17,24,39,0.72)", fontWeight: 850 }}>
                        <b>Phone:</b> {o.customer_phone || "-"}
                      </div>
                      <div style={{ marginTop: 4, color: "rgba(17,24,39,0.72)", fontWeight: 850 }}>
                        <b>Address:</b> {o.delivery_address || "-"}
                      </div>
                      {o.instructions ? (
                        <div style={{ marginTop: 4, color: "rgba(17,24,39,0.72)", fontWeight: 850 }}>
                          <b>Instructions:</b> {o.instructions}
                        </div>
                      ) : null}
                    </div>

                    {/* Items */}
                    <div
                      style={{
                        borderRadius: 16,
                        border: "1px solid rgba(0,0,0,0.08)",
                        background: "rgba(255,255,255,0.75)",
                        padding: 12,
                      }}
                    >
                      <div style={{ fontWeight: 1000, color: "#0b1220" }}>Items</div>

                      <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                        {items.length === 0 ? (
                          <div style={{ color: "rgba(17,24,39,0.65)", fontWeight: 850, fontSize: 13 }}>Items will appear here.</div>
                        ) : (
                          items.map((it, idx) => (
                            <div
                              key={`${it.id || it.item_ref_id || it.product_name || "item"}-${idx}`}
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                gap: 10,
                                flexWrap: "wrap",
                                padding: "8px 10px",
                                borderRadius: 14,
                                border: "1px solid rgba(0,0,0,0.08)",
                                background: "rgba(255,255,255,0.85)",
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                {it?.image_url ? (
                                  <img
                                    src={it.image_url}
                                    alt={it.product_name || "Item"}
                                    style={{
                                      width: 42,
                                      height: 42,
                                      borderRadius: 10,
                                      objectFit: "cover",
                                      border: "1px solid rgba(0,0,0,0.08)",
                                      background: "rgba(255,255,255,0.8)",
                                    }}
                                  />
                                ) : null}
                                <div style={{ fontWeight: 950, color: "#0b1220" }}>{it.product_name || "Item"}</div>
                              </div>
                              <div style={{ color: "rgba(17,24,39,0.72)", fontWeight: 900 }}>
                                Qty {Number(it.quantity || 0)}
                                <span style={{ marginLeft: 10 }}>
                                  {formatMoney(Number(it.line_total || 0) || Number(it.quantity || 0) * Number(it.unit_price || 0), defaultCurrency)}
                                </span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      {o.store_id ? (
                        <div style={{ marginTop: 10, color: "rgba(17,24,39,0.65)", fontWeight: 850, fontSize: 12 }}>
                          Store ID: <span style={{ color: "#0b1220" }}>{o.store_id}</span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        ) : null}

        {reviewModalOrder ? (
          <div style={reviewModalOverlay} onMouseDown={(e) => e.target === e.currentTarget && closeReviewModal()}>
            <div style={reviewModalCard}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                <div style={{ fontWeight: 1000, color: "#0b1220", fontSize: 18 }}>
                  {reviewByOrderId[reviewModalOrder.id] ? "Edit Grocery Review" : "Write Grocery Review"}
                </div>
                <button onClick={closeReviewModal} style={btnBack} disabled={reviewSaving}>Close</button>
              </div>

              <div style={{ marginTop: 12, color: "rgba(17,24,39,0.72)", fontWeight: 850 }}>
                Grocery Order - {String(reviewModalOrder.id).slice(0, 8)}...
              </div>

              <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    onClick={() => setReviewForm((prev) => ({ ...prev, rating: value }))}
                    style={Number(reviewForm.rating) === value ? reviewStarBtnActive : reviewStarBtn}
                  >
                    {value} Star{value === 1 ? "" : "s"}
                  </button>
                ))}
              </div>

              <input
                value={reviewForm.title}
                onChange={(e) => setReviewForm((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Review title (optional)"
                style={{ ...reviewInput, marginTop: 14 }}
              />

              <textarea
                value={reviewForm.comment}
                onChange={(e) => setReviewForm((prev) => ({ ...prev, comment: e.target.value }))}
                placeholder="Tell other customers about your grocery experience"
                rows={5}
                style={{ ...reviewInput, marginTop: 12, resize: "vertical", minHeight: 120 }}
              />

              {reviewError ? <div style={{ marginTop: 10, color: "#b42318", fontWeight: 900 }}>{reviewError}</div> : null}

              <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
                <button onClick={closeReviewModal} style={btnBack} disabled={reviewSaving}>Cancel</button>
                <button onClick={saveReview} style={btnReview} disabled={reviewSaving}>{reviewSaving ? "Saving..." : "Save Review"}</button>
              </div>
            </div>
          </div>
        ) : null}

        {driverReviewModalOrder ? (
          <div style={reviewModalOverlay} onMouseDown={(e) => e.target === e.currentTarget && closeDriverReviewModal()}>
            <div style={reviewModalCard}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <div style={{ fontSize: 28, fontWeight: 1000, color: "#0b1220" }}>
                  {driverReviewByOrderId[driverReviewModalOrder.id] ? "Edit Driver Review" : "Rate Your Driver"}
                </div>
                <button onClick={closeDriverReviewModal} style={btnBack} disabled={driverReviewSaving}>Close</button>
              </div>
              <div style={{ marginTop: 8, color: "rgba(17,24,39,0.68)", fontWeight: 850 }}>
                Grocery Order - {String(driverReviewModalOrder.id).slice(0, 8)}...
              </div>

              <div style={{ marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap" }}>
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    onClick={() => setDriverReviewForm((prev) => ({ ...prev, rating: value }))}
                    style={Number(driverReviewForm.rating) === value ? reviewStarBtnActive : reviewStarBtn}
                  >
                    {renderStars(value)}
                  </button>
                ))}
              </div>

              <input
                value={driverReviewForm.title}
                onChange={(e) => setDriverReviewForm((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Review title (optional)"
                style={{ ...reviewInput, marginTop: 14 }}
              />

              <textarea
                value={driverReviewForm.comment}
                onChange={(e) => setDriverReviewForm((prev) => ({ ...prev, comment: e.target.value }))}
                placeholder="Tell us about the delivery experience"
                style={{ ...reviewInput, marginTop: 12, resize: "vertical", minHeight: 120 }}
              />

              {driverReviewError ? <div style={{ marginTop: 10, color: "#b42318", fontWeight: 900 }}>{driverReviewError}</div> : null}

              <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button onClick={closeDriverReviewModal} style={btnBack} disabled={driverReviewSaving}>Cancel</button>
                <button onClick={saveDriverReview} style={btnReview} disabled={driverReviewSaving}>{driverReviewSaving ? "Saving..." : "Save Driver Review"}</button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}

/* =========================
   EXTRA STYLES (LIST + STEPS)
   ========================= */

const listCard = {
  ...cardGlass,
  cursor: "pointer",
  transition: "transform 120ms ease, box-shadow 120ms ease",
};

const btnView = {
  padding: "10px 12px",
  borderRadius: 14,
  border: "1px solid rgba(17,24,39,0.95)",
  background: "rgba(17,24,39,0.95)",
  color: "#fff",
  fontWeight: 950,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const btnBack = {
  padding: "10px 12px",
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.85)",
  color: "#111827",
  fontWeight: 950,
  cursor: "pointer",
};

const btnInvoice = {
  padding: "10px 12px",
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.90)",
  color: "#111827",
  fontWeight: 1000,
  cursor: "pointer",
};

const btnReview = {
  padding: "10px 12px",
  borderRadius: 14,
  border: "1px solid rgba(255,140,0,0.35)",
  background: "linear-gradient(135deg, rgba(255,140,0,1), rgba(255,220,160,0.95))",
  color: "#111827",
  fontWeight: 1000,
  cursor: "pointer",
};

const btnReviewGhost = {
  padding: "10px 12px",
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.9)",
  color: "#111827",
  fontWeight: 1000,
  cursor: "pointer",
};

const reviewModalOverlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.45)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  padding: 16,
  zIndex: 10000,
};

const reviewModalCard = {
  width: "min(720px, 96vw)",
  borderRadius: 18,
  background: "rgba(255,255,255,0.96)",
  border: "1px solid rgba(0,0,0,0.12)",
  boxShadow: "0 18px 70px rgba(0,0,0,0.25)",
  padding: 16,
};

const reviewInput = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.9)",
  fontWeight: 800,
  outline: "none",
};

const reviewStarBtn = {
  padding: "9px 12px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.9)",
  color: "#111827",
  fontWeight: 900,
  cursor: "pointer",
};

const reviewStarBtnActive = {
  ...reviewStarBtn,
  border: "1px solid rgba(255,140,0,0.35)",
  background: "linear-gradient(135deg, rgba(255,140,0,1), rgba(255,220,160,0.95))",
};

const stepsWrap = {
  display: "flex",
  gap: 0,
  alignItems: "center",
  flexWrap: "wrap",
};

const stepItem = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  position: "relative",
  paddingRight: 14,
};

const stepDot = {
  width: 28,
  height: 28,
  borderRadius: 999,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 1000,
  fontSize: 12,
  border: "1px solid rgba(0,0,0,0.12)",
};

const stepDotDone = {
  background: "rgba(17,24,39,0.95)",
  color: "#fff",
  border: "1px solid rgba(17,24,39,0.95)",
};

const stepDotActive = {
  background: "rgba(255,255,255,0.92)",
  color: "#111827",
  border: "1px solid rgba(17,24,39,0.35)",
};

const stepDotTodo = {
  background: "rgba(255,255,255,0.75)",
  color: "rgba(17,24,39,0.65)",
};

const stepLabel = {
  fontWeight: 950,
  fontSize: 12,
  color: "rgba(17,24,39,0.82)",
};

const stepLine = {
  width: 44,
  height: 2,
  borderRadius: 999,
  marginLeft: 10,
};

const stepLineDone = {
  background: "rgba(17,24,39,0.95)",
};
const stepLineTodo = {
  background: "rgba(0,0,0,0.10)",
};
