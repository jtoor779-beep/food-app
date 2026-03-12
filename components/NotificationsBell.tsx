"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import supabase from "@/lib/supabase";

type Notif = {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  type: string | null;
  link: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
};

function fmtTime(iso?: string | null) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
}

export default function NotificationsBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [meId, setMeId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Notif[]>([]);
  const [err, setErr] = useState("");
  const [mounted, setMounted] = useState(false);

  // ref for the bell button container
  const boxRef = useRef<HTMLDivElement | null>(null);
  // ref for the portal panel (so click-inside doesn’t close)
  const panelRef = useRef<HTMLDivElement | null>(null);

  const unreadCount = useMemo(() => items.filter((x) => !x.is_read).length, [items]);

  async function loadMe() {
    const { data } = await supabase.auth.getUser();
    const uid = data?.user?.id || "";
    setMeId(uid);
    return uid;
  }

  async function loadNotifications(uid?: string) {
    const userId = uid || meId || (await loadMe());
    if (!userId) return;

    setErr("");
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("notifications")
        .select("id,user_id,title,body,type,link,is_read,read_at,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(25);

      if (error) throw error;
      setItems((data || []) as Notif[]);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function markOneRead(n: Notif) {
    if (n.is_read) return;
    await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("id", n.id);
  }

  async function markAllRead() {
    if (!meId) return;
    await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("user_id", meId)
      .eq("is_read", false);
    await loadNotifications(meId);
  }

  function onOpen() {
    const next = !open;
    setOpen(next);
    if (next) loadNotifications();
  }

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    loadMe().then((uid) => {
      if (uid) loadNotifications(uid);
    });

    const { data } = supabase.auth.onAuthStateChange(() => {
      loadMe().then((uid) => {
        setItems([]);
        if (uid) loadNotifications(uid);
      });
    });

    return () => data?.subscription?.unsubscribe?.();
  }, []);

  // realtime: refresh on any change
  useEffect(() => {
    if (!meId) return;

    const ch = supabase
      .channel(`notif-${meId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${meId}` },
        () => loadNotifications(meId)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meId]);

  // click outside to close (UPDATED: works with portal)
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (!open) return;
      const target = e.target as Node;

      const clickInsideBell = !!(boxRef.current && boxRef.current.contains(target));
      const clickInsidePanel = !!(panelRef.current && panelRef.current.contains(target));

      if (!clickInsideBell && !clickInsidePanel) setOpen(false);
    }
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  // lock body scroll when dropdown is open (prevents homepage scrolling behind)
  useEffect(() => {
    if (typeof document === "undefined") return;

    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;

    if (open) {
      const scrollBarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = "hidden";
      if (scrollBarWidth > 0) document.body.style.paddingRight = `${scrollBarWidth}px`;
    }

    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
    };
  }, [open]);

  return (
    <div ref={boxRef} style={wrap}>
      <button onClick={onOpen} style={bellBtn} aria-label="Notifications">
        <BellIcon />
        {unreadCount > 0 ? <span style={badge}>{unreadCount > 99 ? "99+" : unreadCount}</span> : null}
      </button>

      {/* PORTAL RENDER (escapes stacking contexts) */}
      {open && mounted
        ? createPortal(
            <>
              <div style={backdrop} onClick={() => setOpen(false)} aria-hidden="true" />
              <div ref={panelRef} style={dropdownFixed} role="dialog" aria-label="Notifications panel">
                <div style={dropTop}>
                  <div style={dropTitle}>Notifications</div>

                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button onClick={() => loadNotifications()} style={miniBtn}>
                      Refresh
                    </button>
                    <button onClick={markAllRead} style={miniBtn}>
                      Mark all read
                    </button>

                    <button
                      onClick={() => setOpen(false)}
                      style={iconCloseBtn}
                      aria-label="Close notifications"
                      title="Close"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {err ? <div style={errBox}>{err}</div> : null}

                {loading ? (
                  <div style={empty}>Loading…</div>
                ) : items.length === 0 ? (
                  <div style={empty}>No notifications yet.</div>
                ) : (
                  <div style={list}>
                    {items.map((n) => (
                      <button
                        key={n.id}
                        onClick={async () => {
                          await markOneRead(n);
                          if (n.link) {
                            setOpen(false);
                            router.push(n.link);
                          }
                        }}
                        style={{
                          ...row,
                          background: n.is_read ? "rgba(255,255,255,0.85)" : "rgba(2,6,23,0.04)",
                          border: n.is_read ? "1px solid rgba(0,0,0,0.08)" : "1px solid rgba(2,6,23,0.18)",
                        }}
                      >
                        <div style={rowTop}>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            {!n.is_read ? <span style={dot} /> : null}
                            <div style={rowTitle}>{n.title}</div>
                          </div>
                          <div style={rowTime}>{fmtTime(n.created_at)}</div>
                        </div>
                        {n.body ? <div style={rowBody}>{n.body}</div> : null}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>,
            document.body
          )
        : null}
    </div>
  );
}

/* =========================
   Styles (inline)
   ========================= */

const wrap: React.CSSProperties = { position: "relative", display: "inline-flex" };

const bellBtn: React.CSSProperties = {
  position: "relative",
  width: 42,
  height: 42,
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.85)",
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
};

const badge: React.CSSProperties = {
  position: "absolute",
  top: 6,
  right: 6,
  minWidth: 18,
  height: 18,
  padding: "0 6px",
  borderRadius: 999,
  background: "rgba(17,24,39,0.95)",
  color: "#fff",
  fontSize: 11,
  fontWeight: 1000,
  display: "grid",
  placeItems: "center",
  border: "1px solid rgba(255,255,255,0.6)",
};

// VERY HIGH z-index so it can never go under
const Z = 2147483647;

const backdrop: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(2,6,23,0.22)",
  zIndex: Z - 1,
  backdropFilter: "blur(1px)",
};

const dropdownFixed: React.CSSProperties = {
  position: "fixed",
  right: 16,
  top: 72,
  width: 420,
  maxWidth: "calc(100vw - 20px)",
  borderRadius: 18,
  background: "rgba(255,255,255,0.95)",
  border: "1px solid rgba(0,0,0,0.10)",
  boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
  overflow: "hidden",
  zIndex: Z,
  backdropFilter: "blur(10px)",
};

const dropTop: React.CSSProperties = {
  padding: 12,
  borderBottom: "1px solid rgba(0,0,0,0.06)",
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
  flexWrap: "wrap",
};

const dropTitle: React.CSSProperties = { fontWeight: 1000, color: "#0b1220" };

const miniBtn: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.85)",
  fontWeight: 950,
  cursor: "pointer",
  fontSize: 12,
};

const iconCloseBtn: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.90)",
  fontWeight: 1000,
  cursor: "pointer",
  fontSize: 14,
  display: "grid",
  placeItems: "center",
};

const empty: React.CSSProperties = {
  padding: 14,
  fontWeight: 900,
  color: "rgba(17,24,39,0.65)",
};

const list: React.CSSProperties = {
  maxHeight: 420,
  overflow: "auto",
  padding: 12,
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const row: React.CSSProperties = {
  textAlign: "left",
  width: "100%",
  padding: 12,
  borderRadius: 16,
  cursor: "pointer",
};

const rowTop: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
};

const rowTitle: React.CSSProperties = { fontWeight: 1000, color: "#0b1220", fontSize: 13 };

const rowTime: React.CSSProperties = { fontWeight: 900, color: "rgba(17,24,39,0.55)", fontSize: 12 };

const rowBody: React.CSSProperties = {
  marginTop: 8,
  fontWeight: 800,
  color: "rgba(17,24,39,0.70)",
  fontSize: 13,
  lineHeight: 1.45,
  whiteSpace: "pre-wrap",
};

const dot: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: 999,
  background: "rgba(59,130,246,1)",
};

const errBox: React.CSSProperties = {
  margin: 12,
  padding: 10,
  borderRadius: 14,
  border: "1px solid #fecaca",
  background: "rgba(254,242,242,0.9)",
  color: "#7f1d1d",
  fontWeight: 900,
  fontSize: 12,
};

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2Zm6-6V11a6 6 0 0 0-5-5.91V4a1 1 0 1 0-2 0v1.09A6 6 0 0 0 6 11v5l-2 2v1h16v-1l-2-2Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}