"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import supabase from "@/lib/supabase";
import { cleanCity, readGlobalCity, subscribeGlobalCity, writeGlobalCity } from "@/lib/globalLocation";

function normalizeRole(r: unknown) {
  return String(r || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

type NavItem = { href: string; label: string };

function dedupeByHref(items: NavItem[]) {
  const seen = new Set<string>();
  const out: NavItem[] = [];
  for (const it of items) {
    const href = String(it.href || "").trim();
    if (!href) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    out.push(it);
  }
  return out;
}

/* =========================
    Notifications (client-only, safe)
   - Stores data in localStorage
   - No backend required
   ========================= */

type SimpleNotif = {
  id: string;
  title: string;
  body?: string;
  ts: number; // epoch ms
  read?: boolean;
  href?: string;
};

const LS_NOTIFS = "hf_notifications_v1";

function readNotifs(): SimpleNotif[] {
  try {
    const raw = localStorage.getItem(LS_NOTIFS);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeNotifs(list: SimpleNotif[]) {
  try {
    localStorage.setItem(LS_NOTIFS, JSON.stringify(list || []));
    window.dispatchEvent(new Event("storage"));
  } catch {}
}

function seedIfEmpty() {
  try {
    const cur = readNotifs();
    if (cur.length > 0) return;

    const seeded: SimpleNotif[] = [
      {
        id: "welcome",
        title: "Welcome ",
        body: "Your dashboard is ready. Browse restaurants or groceries and start ordering.",
        ts: Date.now() - 1000 * 60 * 45,
        read: false,
        href: "/",
      },
      {
        id: "tips",
        title: "Quick Tip ",
        body: "Use search + filters to find best sellers fast.",
        ts: Date.now() - 1000 * 60 * 20,
        read: false,
      },
    ];
    writeNotifs(seeded);
  } catch {}
}

function timeAgo(ts: number) {
  const diff = Math.max(0, Date.now() - Number(ts || 0));
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function NavBar() {
  const router = useRouter();
  const pathname = usePathname();

  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState("");
  const [role, setRole] = useState("");
  const [profileName, setProfileName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [err, setErr] = useState("");

  //  responsive UI state
  const [isMobile, setIsMobile] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileSideMounted, setMobileSideMounted] = useState(false);
  const [mobileSideOpen, setMobileSideOpen] = useState(false);

  //  Notifications state
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState<SimpleNotif[]>([]);

  const [globalCity, setGlobalCity] = useState("");
  const [globalCityInput, setGlobalCityInput] = useState("");
  const [locatingCity, setLocatingCity] = useState(false);

  

  //  When user is NOT logged in, we fall back to localStorage notifications.
  // If user is logged in, we read/update notifications from Supabase table: public.notifications
  const useLocalNotifsRef = useRef(false);

  //  Push Notifications (PWA)
  const [pushState, setPushState] = useState<"unknown" | "enabled" | "disabled" | "denied">("unknown");
  const [pushBusy, setPushBusy] = useState(false);
  const vapidPublicKey = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string) || "";
//  Profile dropdown state
  const [profileOpen, setProfileOpen] = useState(false);

  //  Portal support (so panels never go under homepage)
  const [mounted, setMounted] = useState(false);

  // Notifications portal refs/pos
  const panelRef = useRef<HTMLDivElement | null>(null);
  const bellBtnRef = useRef<HTMLButtonElement | null>(null);
  const [panelPos, setPanelPos] = useState<{ top: number; right: number } | null>(null);
  const notifRef = useRef<HTMLDivElement | null>(null);

  // Profile portal refs/pos
  const profilePanelRef = useRef<HTMLDivElement | null>(null);
  const profileBtnRef = useRef<HTMLButtonElement | null>(null);
  const [profilePos, setProfilePos] = useState<{ top: number; right: number } | null>(null);
  const profileWrapRef = useRef<HTMLDivElement | null>(null);

  //  FIX: you already have app/help/page.tsx so route is /help (NOT /support)
  const SUPPORT_HREF = "/help";
  const SUPPORT_MAILTO = "mailto:support@yourdomain.com?subject=Help%20%7C%20HomyFod";

  async function loadSessionAndRole() {
    setErr("");
    setLoading(true);

    try {
      const { data } = await supabase.auth.getSession();
      const session = data?.session;

      if (!session?.user) {
        setUserEmail("");
        setRole("");
        setProfileName("");
        setAvatarUrl("");
        setLoading(false);
        return;
      }

      setUserEmail(String(session.user.email || ""));

      //  Try to infer role + header profile safely from profiles table
      // (keeps old logic intact; do NOT break if schema changes)
      let foundRole = "";
      let foundName = "";
      let foundAvatar = "";

      try {
        const { data: prof } = await supabase
          .from("profiles")
          .select("role, full_name, avatar_url")
          .eq("user_id", session.user.id)
          .maybeSingle();

        foundRole = normalizeRole((prof as any)?.role);
        foundName = String((prof as any)?.full_name || "").trim();
        foundAvatar = String((prof as any)?.avatar_url || "").trim();
      } catch {}

      setRole(foundRole || "");
      setProfileName(foundName || "");
      setAvatarUrl(foundAvatar || "");
    } catch (e: any) {
      setErr(e?.message || "Failed to load session");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    try {
      await supabase.auth.signOut();
    } catch {}
    setProfileOpen(false);
    setMenuOpen(false);
    setMobileSideOpen(false);
    setMobileSideMounted(false);
    router.push("/");
    router.refresh();
  }

  function applyGlobalCity() {
    const city = writeGlobalCity(globalCityInput);
    setGlobalCity(city);
    setGlobalCityInput(city);
  }

  async function detectAndApplyCurrentCity() {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      return;
    }

    setLocatingCity(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 12000,
          maximumAge: 120000,
        });
      });

      const lat = Number(pos?.coords?.latitude || 0);
      const lon = Number(pos?.coords?.longitude || 0);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

      let resolved = "";
      try {
        const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`, {
          headers: { Accept: "application/json" },
        });
        const data = await resp.json();
        const a = data?.address || {};
        resolved = cleanCity(a.city || a.town || a.village || a.county || a.state);
      } catch {}

      if (!resolved) return;

      const city = writeGlobalCity(resolved);
      setGlobalCity(city);
      setGlobalCityInput(city);
    } catch {
      // no-op: user denied permission or unavailable
    } finally {
      setLocatingCity(false);
    }
  }

  //  Mobile sidebar (DoorDash-style) open/close helpers (UI only)
  function openMobileSide() {
    setMobileSideMounted(true);
    // next frame so transition animates
    requestAnimationFrame(() => setMobileSideOpen(true));
  }

  function closeMobileSide() {
    setMobileSideOpen(false);
    // wait for transition end before unmount
    window.setTimeout(() => setMobileSideMounted(false), 260);
  }

  useEffect(() => {
    setMounted(true);
    loadSessionAndRole();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      loadSessionAndRole();
    });

    return () => {
      sub?.subscription?.unsubscribe?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const city = readGlobalCity();
    setGlobalCity(city);
    setGlobalCityInput(city);

    const unsub = subscribeGlobalCity((nextCity) => {
      const normalized = cleanCity(nextCity);
      setGlobalCity(normalized);
      setGlobalCityInput(normalized);
    });

    return () => unsub();
  }, []);

  //  refresh header profile when tab becomes active / route changes
  useEffect(() => {
    if (!mounted) return;

    const refreshHeaderProfile = () => {
      loadSessionAndRole();
    };

    window.addEventListener("focus", refreshHeaderProfile);
    document.addEventListener("visibilitychange", refreshHeaderProfile);
    window.addEventListener("storage", refreshHeaderProfile);

    return () => {
      window.removeEventListener("focus", refreshHeaderProfile);
      document.removeEventListener("visibilitychange", refreshHeaderProfile);
      window.removeEventListener("storage", refreshHeaderProfile);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, pathname]);

  //  responsive
  useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth < 900;
      setIsMobile(mobile);
      if (!mobile) {
        setMenuOpen(false);
        setMobileSideOpen(false);
        setMobileSideMounted(false);
      }
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  //  Notifications init (Supabase-backed for logged-in users; localStorage fallback)
  useEffect(() => {
    if (!mounted) return;

    let cancelled = false;

    async function loadNotifs() {
      try {
        const { data } = await supabase.auth.getSession();
        const user = data?.session?.user;

        // If user is logged in: load from DB
        if (user?.id) {
          useLocalNotifsRef.current = false;

          const { data: rows, error } = await supabase
            .from("notifications")
            .select("id,title,body,created_at,is_read,link")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(30);

          if (cancelled) return;

          if (error) {
            // If DB read fails, fallback to local (safe)
            useLocalNotifsRef.current = true;
            seedIfEmpty();
            setNotifs(readNotifs());
            return;
          }

          const mapped: SimpleNotif[] = (rows || []).map((r: any) => ({
            id: String(r?.id || ""),
            title: String(r?.title || ""),
            body: r?.body ? String(r.body) : "",
            ts: r?.created_at ? new Date(r.created_at).getTime() : Date.now(),
            read: !!r?.is_read,
            href: r?.link ? String(r.link) : "",
          }));

          setNotifs(mapped);
          return;
        }

        // Not logged in: local fallback
        useLocalNotifsRef.current = true;
        seedIfEmpty();
        setNotifs(readNotifs());
      } catch {
        // safest fallback
        useLocalNotifsRef.current = true;
        seedIfEmpty();
        setNotifs(readNotifs());
      }
    }

    loadNotifs();

    // Keep legacy live-update behavior ONLY for local notifications
    const onStorage = () => {
      if (useLocalNotifsRef.current) setNotifs(readNotifs());
    };
    window.addEventListener("storage", onStorage);

    return () => {
      cancelled = true;
      window.removeEventListener("storage", onStorage);
    };
  }, [mounted]);

const unreadCount = useMemo(() => notifs.filter((n) => !n.read).length, [notifs]);

  async function markAllRead() {
    const next = notifs.map((n) => ({ ...n, read: true }));
    setNotifs(next);

    //  Supabase (logged in)
    if (!useLocalNotifsRef.current) {
      try {
        const { data } = await supabase.auth.getSession();
        const user = data?.session?.user;
        if (user?.id) {
          await supabase
            .from("notifications")
            .update({ is_read: true, read_at: new Date().toISOString() })
            .eq("user_id", user.id)
            .eq("is_read", false);
        }
      } catch {}
      return;
    }

    //  Local fallback
    writeNotifs(next);
  }

  async function markOneRead(id: string) {
    const next = notifs.map((n) => (n.id === id ? { ...n, read: true } : n));
    setNotifs(next);

    //  Supabase (logged in)
    if (!useLocalNotifsRef.current) {
      try {
        await supabase
          .from("notifications")
          .update({ is_read: true, read_at: new Date().toISOString() })
          .eq("id", id);
      } catch {}
      return;
    }

    //  Local fallback
    writeNotifs(next);
  }

  async function clearNotifs() {
    // NOTE: With current RLS, we do not have DELETE policy.
    // So "Clear" behaves like "Mark all read" for DB-backed notifications.
    if (!useLocalNotifsRef.current) {
      await markAllRead();
      setNotifs([]); // clears UI list
      return;
    }

    //  Local fallback
    setNotifs([]);
    writeNotifs([]);
  }


  //  Push Notifications helpers (safe; does not affect normal checkout flow)
  function urlBase64ToUint8Array(base64String: string) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  async function enablePushNotifications() {
    try {
      if (typeof window === "undefined") return;
      if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        alert("Push notifications are not supported on this device/browser.");
        return;
      }

      if (!vapidPublicKey) {
        alert("VAPID public key is missing. Set NEXT_PUBLIC_VAPID_PUBLIC_KEY in Vercel env.");
        return;
      }

      setPushBusy(true);

      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setPushState(perm === "denied" ? "denied" : "disabled");
        return;
      }

      // Ensure SW is ready (your PWA already has a service worker)
      const reg = await navigator.serviceWorker.ready;

      // If already subscribed, reuse it
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        });
      }

      // Save subscription in DB for this user
      const { data } = await supabase.auth.getSession();
      const user = data?.session?.user;
      if (!user?.id) {
        // Logged-out fallback (keep safe)
        setPushState("disabled");
        return;
      }

      const json: any = sub.toJSON();
      const endpoint = String(json?.endpoint || "");
      const p256dh = String(json?.keys?.p256dh || "");
      const auth = String(json?.keys?.auth || "");

      if (!endpoint || !p256dh || !auth) {
        setPushState("disabled");
        return;
      }

      // Avoid duplicates: if same endpoint exists, do nothing; else insert
      try {
        const { data: existing } = await supabase
          .from("push_subscriptions")
          .select("id")
          .eq("user_id", user.id)
          .eq("endpoint", endpoint)
          .limit(1);

        if (!existing || existing.length === 0) {
          await supabase.from("push_subscriptions").insert({
            user_id: user.id,
            endpoint,
            p256dh,
            auth,
            user_agent: navigator.userAgent,
          });
        }
      } catch {}

      setPushState("enabled");
      alert(" Push notifications enabled on this device.");
    } catch (e: any) {
      // safest behavior: do not break navbar
      console.error(e);
      alert(e?.message || "Failed to enable push notifications.");
    } finally {
      setPushBusy(false);
    }
  }

  // Set initial push state (best-effort)
  useEffect(() => {
    if (!mounted) return;
    if (typeof window === "undefined") return;
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) return;

    if (Notification.permission === "denied") {
      setPushState("denied");
      return;
    }
    if (Notification.permission !== "granted") {
      setPushState("disabled");
      return;
    }

    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setPushState(sub ? "enabled" : "disabled");
      } catch {
        setPushState("disabled");
      }
    })();
  }, [mounted]);

const isLoggedIn = !loading && !!userEmail;
  const profileDisplayName = String(profileName || "").trim() || String(userEmail || "").split("@")[0] || "Profile";
  const profileDisplayEmail = userEmail || "";
  const r = normalizeRole(role);

  //  role flags (keep existing behavior)
  const isCustomer = r === "customer" || r === "user";
  const isOwner = r === "owner" || r === "restaurant_owner";
  const isGroceryOwner = r === "grocery_owner";
  const isDelivery = r === "delivery" || r === "delivery_driver";
  const isAdmin = r === "admin" || r === "super_admin";

  const roleUnknown = isLoggedIn && !isCustomer && !isOwner && !isGroceryOwner && !isDelivery && !isAdmin;

  const homeHref = "/";

  //  login button on right
  const rightLoginHref = "/login";

  const isActive = (href: string) => {
    if (pathname === href) return true;
    if (href !== "/" && pathname?.startsWith(href + "/")) return true;
    return false;
  };

  //  Make navbar feel more "left aligned" (less boxed/centered)
  const layoutMax = 1480;

  //  Desktop sidebar (DoorDash-style)  keep old logic intact
  const sidebarWidth = 240;
  const showSidebar = !isMobile;
  const showMyOrdersSide = isLoggedIn && (isCustomer || roleUnknown);

  //  Apply left padding to the page so fixed sidebar doesn't cover content
  useEffect(() => {
    if (typeof document === "undefined") return;

    const prev = document.body.style.paddingLeft;
    if (showSidebar) {
      document.body.style.paddingLeft = `${sidebarWidth}px`;
    } else {
      document.body.style.paddingLeft = prev || "";
    }

    return () => {
      document.body.style.paddingLeft = prev || "";
    };
  }, [showSidebar]);

  const headerWrap: React.CSSProperties = {
    position: "sticky",
    top: 0,
    zIndex: 9999,
    background: isMobile
      ? "linear-gradient(180deg, rgba(255,255,255,0.96), rgba(255,255,255,0.88))"
      : "#ffffff",
    borderBottom: "1px solid rgba(0,0,0,0.08)",
    width: "100%",
    overflowX: "hidden",
    isolation: "isolate",
    backdropFilter: isMobile ? "blur(12px) saturate(1.15)" : "blur(8px)",
    paddingTop: isMobile ? "max(0px, env(safe-area-inset-top))" : 0,
  };

  //  Left sidebar styles (desktop)
  const sideNav: React.CSSProperties = {
    position: "fixed",
    top: 0,
    left: 0,
    height: "100vh",
    width: sidebarWidth,
    zIndex: 9998, // under header but above page
    //  Navy gradient background for the LEFT NAV
    background: "#ffffff",
    borderRight: "1px solid rgba(0,0,0,0.08)",
    padding: 14,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    overflowY: "auto",
  };

  const sideSectionTitle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: 0.6,
    color: "rgba(255,255,255,0.55)",
    textTransform: "uppercase",
    padding: "8px 10px 0",
  };

  const sideItemBase: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.08)",
    color: "rgba(0,0,0,0.82)",
    textDecoration: "none",
    fontWeight: 800,
    fontSize: 14,
    background: "rgba(255,255,255,0.96)",
    boxShadow: "0 10px 28px rgba(0,0,0,0.06)",
    transition: "transform 120ms ease, box-shadow 120ms ease",
    userSelect: "none",
    WebkitTapHighlightColor: "transparent",
  };

  const sideItemActive: React.CSSProperties = {
    border: "1px solid rgba(0,0,0,0.14)",
    boxShadow: "0 16px 40px rgba(0,0,0,0.10)",
    transform: "translateY(-1px)",
  };

  const sideIcon: React.CSSProperties = {
    width: 26,
    height: 26,
    borderRadius: 10,
    display: "grid",
    placeItems: "center",
    background: "rgba(0,0,0,0.05)",
    fontSize: 14,
  };
  const sideSvgIcon: React.CSSProperties = {
    width: 15,
    height: 15,
    display: "block",
  };
  const mobileDrawerItem: React.CSSProperties = {
    ...sideItemBase,
    marginTop: 10,
    borderRadius: 18,
    padding: "12px 14px",
    border: "1px solid rgba(15,23,42,0.10)",
    boxShadow: "0 8px 22px rgba(15,23,42,0.08)",
    background: "rgba(255,255,255,0.98)",
  };
  const mobileDrawerTitle: React.CSSProperties = {
    ...sideSectionTitle,
    paddingLeft: 0,
    color: "rgba(15,23,42,0.55)",
    fontWeight: 900,
  };
  const bellSvgIcon: React.CSSProperties = {
    width: 18,
    height: 18,
    display: "block",
  };

  const mainHeaderRow: React.CSSProperties = {
    maxWidth: layoutMax,
    margin: "0 auto",
    padding: isMobile ? "8px 10px" : "10px 12px",
    display: "flex",
    alignItems: "center",
    gap: isMobile ? 8 : 12,
    justifyContent: "space-between",
  };

  const leftBrand: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: isMobile ? 8 : 10,
    minWidth: isMobile ? 0 : 180,
    flex: isMobile ? "1 1 auto" : undefined,
  };

  const brandLogo: React.CSSProperties = {
    width: isMobile ? 96 : 70,
    height: isMobile ? 32 : 70,
    borderRadius: isMobile ? 8 : 12,
    objectFit: "contain",
    background: "transparent",
    display: "block",
  };

  const brandTextWrap: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    lineHeight: 1.05,
  };

  const brandTitle: React.CSSProperties = {
    fontWeight: 900,
    fontSize: 16,
    color: "rgba(0,0,0,0.82)",
  };

  const brandSub: React.CSSProperties = {
    fontWeight: 800,
    fontSize: 12,
    color: "rgba(0,0,0,0.45)",
  };

  const centerNavWrap: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    justifyContent: "center",
    flex: 1,
  };

  const locationWrap: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 999,
    background: "rgba(255,255,255,0.96)",
    padding: "6px 8px",
    boxShadow: "0 12px 28px rgba(0,0,0,0.06)",
    maxWidth: 560,
    width: "100%",
  };

  const locationInput: React.CSSProperties = {
    border: "1px solid rgba(0,0,0,0.12)",
    borderRadius: 999,
    padding: "7px 12px",
    outline: "none",
    minWidth: 150,
    width: "100%",
    fontWeight: 700,
    fontSize: 12,
    color: "rgba(0,0,0,0.82)",
  };

  const locationBtn: React.CSSProperties = {
    padding: "7px 11px",
    borderRadius: 999,
    border: "1px solid rgba(0,0,0,0.12)",
    background: "rgba(0,0,0,0.04)",
    color: "rgba(0,0,0,0.84)",
    fontWeight: 900,
    fontSize: 12,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };

  const rightWrap: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: isMobile ? 8 : 10,
    minWidth: isMobile ? 0 : 210,
    justifyContent: "flex-end",
    flexShrink: 0,
  };

  const iconBtn: React.CSSProperties = {
    width: isMobile ? 42 : 40,
    height: isMobile ? 42 : 40,
    borderRadius: 999,
    border: "1px solid rgba(0,0,0,0.08)",
    background: isMobile ? "rgba(255,255,255,0.94)" : "rgba(255,255,255,0.96)",
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    boxShadow: "0 16px 40px rgba(0,0,0,0.08)",
    position: "relative",
  };

  const hamburgerBtn: React.CSSProperties = {
    ...iconBtn,
    width: isMobile ? 88 : 42,
    height: 42,
    fontSize: isMobile ? 14 : 18,
    fontWeight: 900,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: isMobile ? "0 12px" : "0 10px",
  };

  const badge: React.CSSProperties = {
    position: "absolute",
    top: -6,
    right: -6,
    minWidth: 18,
    height: 18,
    padding: "0 6px",
    borderRadius: 999,
    background: "#ff3b30",
    color: "white",
    fontSize: 11,
    fontWeight: 900,
    display: "grid",
    placeItems: "center",
    border: "2px solid #fff",
  };

  const profileBtn: React.CSSProperties = {
    padding: "8px 12px",
    borderRadius: 999,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "rgba(255,255,255,0.96)",
    cursor: "pointer",
    boxShadow: "0 16px 40px rgba(0,0,0,0.08)",
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontWeight: 900,
    color: "rgba(0,0,0,0.82)",
  };

  const loginBtn: React.CSSProperties = {
    padding: isMobile ? "10px 16px" : "10px 14px",
    borderRadius: 999,
    border: "1px solid rgba(0,0,0,0.12)",
    background: isMobile ? "rgba(255,255,255,0.92)" : "rgba(0,0,0,0.06)",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: isMobile ? 18 : 16,
    textDecoration: "none",
    color: "rgba(0,0,0,0.86)",
    lineHeight: 1,
  };

  const panelBase: React.CSSProperties = {
    width: 360,
    maxWidth: "92vw",
    borderRadius: 18,
    border: "1px solid rgba(0,0,0,0.12)",
    background: "rgba(255,255,255,0.98)",
    boxShadow: "0 24px 70px rgba(0,0,0,0.18)",
    overflow: "hidden",
  };

  const panelHeader: React.CSSProperties = {
    padding: "12px 14px",
    borderBottom: "1px solid rgba(0,0,0,0.08)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  };

  const panelTitle: React.CSSProperties = {
    fontWeight: 900,
    fontSize: 14,
    color: "rgba(0,0,0,0.85)",
  };

  const panelActions: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
  };

  const smallBtn: React.CSSProperties = {
    padding: "8px 10px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "rgba(0,0,0,0.04)",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 12,
  };

  const notifList: React.CSSProperties = {
    maxHeight: 420,
    overflowY: "auto",
    padding: 10,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  };

  const notifItem: React.CSSProperties = {
    padding: 12,
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "rgba(255,255,255,0.96)",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  };

  const notifMeta: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    fontSize: 12,
    fontWeight: 800,
    color: "rgba(0,0,0,0.55)",
  };

  const notifBody: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 800,
    color: "rgba(0,0,0,0.80)",
    lineHeight: 1.25,
  };

  const dim: React.CSSProperties = {
    opacity: 0.55,
  };

  function NavLink({
    href,
    children,
    onClick,
    style,
  }: {
    href: string;
    children: React.ReactNode;
    onClick?: () => void;
    style?: React.CSSProperties;
  }) {
    return (
      <Link href={href} style={style} onClick={onClick}>
        {children}
      </Link>
    );
  }

  const centerItems = useMemo((): NavItem[] => {
    if (!isLoggedIn) {
      //  Remove duplicate Login (keep Login button on right side)
      return dedupeByHref([
        { href: homeHref, label: "Home" },
        { href: "/restaurants", label: "Restaurant" },
        { href: "/groceries", label: "Groceries" },
        { href: "/signup", label: "Sign Up" },
      ]);
    }

    //  NEW: If role is missing/unknown, show customer menu so it never becomes "Home only"
    if (roleUnknown) {
      return dedupeByHref([
        { href: homeHref, label: "Home" },
        { href: "/restaurants", label: "Restaurant" },
        { href: "/groceries", label: "Groceries" },
        { href: "/cart", label: "Cart" },
      ]);
    }

    if (r === "customer" || r === "user") {
      return dedupeByHref([
        { href: homeHref, label: "Home" },
        { href: "/restaurants", label: "Restaurant" },
        { href: "/groceries", label: "Groceries" },
        { href: "/cart", label: "Cart" },
      ]);
    }

    if (r === "delivery" || r === "delivery_driver") {
      return dedupeByHref([{ href: homeHref, label: "Home" }]);
    }

    if (r === "owner" || r === "restaurant_owner") {
      return dedupeByHref([
        { href: homeHref, label: "Home" },
        { href: "/restaurants/orders", label: "Restaurant Orders" },
        { href: "/restaurants/menu", label: "Manage Menu" },
        { href: "/restaurants/settings", label: "Restaurant Settings" },
      ]);
    }

    if (r === "grocery_owner") {
      return dedupeByHref([
        { href: homeHref, label: "Home" },
        { href: "/groceries/owner/orders", label: "Grocery Orders" },
        { href: "/groceries/owner/items", label: "Manage Menu" },
        { href: "/groceries/owner/settings", label: "Grocery Settings" },
      ]);
    }

    if (r === "admin" || r === "super_admin") {
      return dedupeByHref([{ href: homeHref, label: "Home" }]);
    }

    return dedupeByHref([{ href: homeHref, label: "Home" }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, roleUnknown, r]);

  //  compute portal positions
  function calcPanelPos(btn: HTMLElement | null) {
    if (!btn) return null;
    const rect = btn.getBoundingClientRect();
    const top = rect.bottom + 10;
    const right = Math.max(12, window.innerWidth - rect.right);
    return { top, right };
  }

  //  close panels on outside click
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;

      const inNotif =
        notifRef.current?.contains(t) ||
        bellBtnRef.current?.contains(t) ||
        panelRef.current?.contains(t);

      if (!inNotif) setNotifOpen(false);

      const inProfile =
        profileWrapRef.current?.contains(t) ||
        profileBtnRef.current?.contains(t) ||
        profilePanelRef.current?.contains(t);

      if (!inProfile) setProfileOpen(false);
    };

    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  //  open/position notif panel
  useEffect(() => {
    if (!mounted) return;
    if (!notifOpen) return;
    setPanelPos(calcPanelPos(bellBtnRef.current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifOpen, mounted]);

  //  open/position profile panel
  useEffect(() => {
    if (!mounted) return;
    if (!profileOpen) return;
    setProfilePos(calcPanelPos(profileBtnRef.current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileOpen, mounted]);

  const supportHref = SUPPORT_HREF || SUPPORT_MAILTO;

  const renderSideGlyph = (kind: "home" | "restaurant" | "groceries" | "cart" | "orders" | "about" | "policies") => {
    if (kind === "home") {
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={sideSvgIcon}>
          <path d="M3 10.5L12 3l9 7.5" />
          <path d="M5 9.5V21h14V9.5" />
          <path d="M10 21v-6h4v6" />
        </svg>
      );
    }
    if (kind === "restaurant") {
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={sideSvgIcon}>
          <path d="M4 3v7a3 3 0 0 0 3 3v8" />
          <path d="M7 3v10" />
          <path d="M10 3v10" />
          <path d="M16 3v18" />
          <path d="M16 11c2.2 0 4-1.8 4-4V3h-4" />
        </svg>
      );
    }
    if (kind === "groceries") {
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={sideSvgIcon}>
          <circle cx="9" cy="20" r="1.5" />
          <circle cx="18" cy="20" r="1.5" />
          <path d="M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 2-1.6L21 7H7" />
        </svg>
      );
    }
    if (kind === "cart") {
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={sideSvgIcon}>
          <path d="M6 7h15l-1.5 8H8z" />
          <path d="M6 7L5 4H2" />
          <circle cx="9" cy="20" r="1.5" />
          <circle cx="18" cy="20" r="1.5" />
        </svg>
      );
    }
    if (kind === "orders") {
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={sideSvgIcon}>
          <path d="M6 3h9l3 3v15H6z" />
          <path d="M15 3v3h3" />
          <path d="M9 11h6M9 15h6" />
        </svg>
      );
    }
    if (kind === "about") {
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={sideSvgIcon}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 10v6" />
          <circle cx="12" cy="7.5" r="0.8" fill="currentColor" stroke="none" />
        </svg>
      );
    }
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={sideSvgIcon}>
        <path d="M6 4h12v16H6z" />
        <path d="M9 8h6M9 12h6M9 16h4" />
      </svg>
    );
  };

  //  Profile dropdown items (desktop)
  const profileItems = useMemo(() => {
    const items: Array<
      | { kind: "link"; href: string; label: string; icon?: string }
      | { kind: "btn"; onClick: () => void; label: string; icon?: string; danger?: boolean }
    > = [];

    //  My Orders moved to visible sidebar (kept Profile menu clean)

    items.push({ kind: "link", href: supportHref, label: "Help", icon: "?" });

    if (isLoggedIn) {
      items.push({ kind: "link", href: "/profile", label: "Profile", icon: "U" });
      items.push({ kind: "link", href: "/settings", label: "Settings", icon: "S" });
      items.push({ kind: "btn", onClick: handleLogout, label: "Logout", icon: "L", danger: true });
    }

    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, supportHref]);

  return (
    <>
      {showSidebar && (
        <aside style={sideNav} aria-label="Sidebar navigation">
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px 10px" }}>
            <Link href={homeHref} style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 10 }}>
              <img
                src="/logo.png"
                alt="HomyFod"
                style={{ width: 200, height: 84, borderRadius: 10, objectFit: "contain" }}
              />
</Link>
          </div>

          {showMyOrdersSide && (
            <>
              <div style={sideSectionTitle}>Account</div>
              <Link
                href="/orders"
                style={{ ...sideItemBase, ...(isActive("/orders") ? sideItemActive : {}) }}
                onClick={() => setMenuOpen(false)}
              >
                <span style={sideIcon}>{renderSideGlyph("orders")}</span>
                <span>My Orders</span>
              </Link>
            </>
          )}

          <div style={sideSectionTitle}>Browse</div>

          {centerItems.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              style={{ ...sideItemBase, ...(isActive(it.href) ? sideItemActive : {}) }}
              onClick={() => setMenuOpen(false)}
            >
              <span style={sideIcon}>
                {it.label === "Home"
                  ? renderSideGlyph("home")
                  : it.label === "Restaurant"
                  ? renderSideGlyph("restaurant")
                  : it.label === "Groceries"
                  ? renderSideGlyph("groceries")
                  : it.label === "Cart"
                  ? renderSideGlyph("cart")
                  : null}
              </span>
              <span>{it.label}</span>
            </Link>
          ))}

          {/*  Extra links under Cart */}
          <div style={sideSectionTitle}>Info</div>

          <Link
            href="/about"
            style={{ ...sideItemBase, ...(isActive("/about") ? sideItemActive : {}) }}
            onClick={() => setMenuOpen(false)}
          >
            <span style={sideIcon}>{renderSideGlyph("about")}</span>
                <span>About Us</span>
          </Link>

          <Link
            href="/policies"
            style={{ ...sideItemBase, ...(isActive("/policies") ? sideItemActive : {}) }}
            onClick={() => setMenuOpen(false)}
          >
            <span style={sideIcon}>{renderSideGlyph("policies")}</span>
                <span>Policies</span>
          </Link>
        </aside>
      )}

      {/*  Mobile left drawer (DoorDash-style) with smooth slide animation */}
      {mounted &&
        isMobile &&
        mobileSideMounted &&
        createPortal(
          <div style={{ position: "fixed", inset: 0, zIndex: 10001, display: "flex" }} aria-label="Mobile menu overlay">
            {/* Backdrop */}
            <div
              onClick={closeMobileSide}
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(10,18,32,0.18)",
                backdropFilter: "blur(3px)",
                opacity: mobileSideOpen ? 1 : 0,
                transition: "opacity 260ms ease",
              }}
            />

            {/* Drawer */}
            <div
              style={{
                position: "relative",
                height: "100%",
                width: 290,
                maxWidth: "82vw",
                background:
                  "linear-gradient(180deg, rgba(250,252,255,0.98) 0%, rgba(244,248,255,0.98) 45%, rgba(238,245,253,0.98) 100%)",
                borderRight: "1px solid rgba(15,23,42,0.10)",
                padding: 14,
                overflowY: "auto",
                boxShadow: "20px 0 60px rgba(15,23,42,0.18)",
                transform: mobileSideOpen ? "translateX(0)" : "translateX(-102%)",
                transition: "transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1)",
                willChange: "transform",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <Link
                  href={homeHref}
                  onClick={closeMobileSide}
                  style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 10 }}
                >
                  <img
                    src="/logo.png"
                    alt="HomyFod"
                    style={{ width: 34, height: 34, borderRadius: 10, objectFit: "contain" }}
                  />
</Link>

                <button type="button" style={smallBtn} onClick={closeMobileSide} aria-label="Close menu">
                  
                </button>
              </div>

              {showMyOrdersSide && (
                <>
                  <div style={mobileDrawerTitle}>Account</div>
                  <Link
                    href="/orders"
                    onClick={closeMobileSide}
                    style={{ ...mobileDrawerItem, ...(isActive("/orders") ? sideItemActive : {}) }}
                  >
                    <span style={sideIcon}>{renderSideGlyph("orders")}</span>
                <span>My Orders</span>
                  </Link>
                </>
              )}

              <div style={mobileDrawerTitle}>Browse</div>

              {centerItems.map((it) => (
                <Link
                  key={it.href}
                  href={it.href}
                  onClick={closeMobileSide}
                  style={{ ...mobileDrawerItem, ...(isActive(it.href) ? sideItemActive : {}) }}
                >
                  <span style={sideIcon}>
                    {it.label === "Home"
                  ? renderSideGlyph("home")
                  : it.label === "Restaurant"
                  ? renderSideGlyph("restaurant")
                  : it.label === "Groceries"
                  ? renderSideGlyph("groceries")
                  : it.label === "Cart"
                  ? renderSideGlyph("cart")
                  : null}
                  </span>
                  <span>{it.label}</span>
                </Link>
              ))}

              {/*  Extra links under Cart */}
              <div style={mobileDrawerTitle}>Info</div>

              <Link
                href="/about"
                onClick={closeMobileSide}
                style={{ ...mobileDrawerItem, ...(isActive("/about") ? sideItemActive : {}) }}
              >
                <span style={sideIcon}>{renderSideGlyph("about")}</span>
                <span>About Us</span>
              </Link>

              <Link
                href="/policies"
                onClick={closeMobileSide}
                style={{ ...mobileDrawerItem, ...(isActive("/policies") ? sideItemActive : {}) }}
              >
                <span style={sideIcon}>{renderSideGlyph("policies")}</span>
                <span>Policies</span>
              </Link>
            </div>
          </div>,
          document.body
        )}

      <header style={headerWrap}>
        <div style={mainHeaderRow}>
          {/* LEFT BRAND */}
          <div style={leftBrand}>
            {showSidebar ? (
              <div style={{ height: 44 }} />
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 10, minWidth: 0 }}>
                {isMobile && (
                  <button
                    type="button"
                    style={hamburgerBtn}
                    onClick={() => {
                      openMobileSide();
                      setNotifOpen(false);
                      setProfileOpen(false);
                    }}
                    aria-label="Open menu"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ width: 16, height: 16, display: "block" }}>
                      <path d="M4 7h16M4 12h16M4 17h16" />
                    </svg>
                    <span style={{ fontSize: 14, fontWeight: 900 }}>Menu</span>
                  </button>
                )}

                <NavLink
                  href={homeHref}
                  style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 10, textDecoration: "none", minWidth: 0 }}
                  onClick={() => setMenuOpen(false)}
                >
                  <img src="/logo.png" alt="HomyFod" style={brandLogo} />
                  {!isMobile && (
                  <div style={brandTextWrap}>
                    <div style={brandTitle}>HomyFod</div>
                    <div style={brandSub}>From Store to Your Door!</div>
                  </div>
                )}
                </NavLink>
              </div>
            )}
          </div>

          <div style={centerNavWrap}>
            {!isMobile && (
              <div style={locationWrap}>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 900,
                    color: "rgba(0,0,0,0.76)",
                    whiteSpace: "nowrap",
                  }}
                  title={globalCity || "City not set"}
                >
                  {globalCity ? `City: ${globalCity}` : "City: Not set"}
                </span>
                <input
                  value={globalCityInput}
                  onChange={(e) => setGlobalCityInput(e.target.value)}
                  placeholder="Enter city"
                  style={locationInput}
                  autoComplete="off"
                />
                <button type="button" style={locationBtn} onClick={applyGlobalCity}>
                  Apply
                </button>
                <button
                  type="button"
                  style={locationBtn}
                  onClick={detectAndApplyCurrentCity}
                  disabled={locatingCity}
                >
                  {locatingCity ? "Locating..." : "Use Current"}
                </button>
              </div>
            )}
          </div>

          {/* RIGHT */}
          <div style={rightWrap}>
            <button
              ref={bellBtnRef}
              style={iconBtn}
              onClick={() => {
                setNotifOpen((v) => !v);
                setProfileOpen(false);
                if (mobileSideMounted) closeMobileSide();
              }}
              aria-label="Notifications"
              type="button"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={bellSvgIcon}>
                <path d="M15 17H9a3 3 0 0 1-3-3V10a6 6 0 1 1 12 0v4a3 3 0 0 1-3 3z" />
                <path d="M10 20a2 2 0 0 0 4 0" />
              </svg>
              {unreadCount > 0 && <span style={badge}>{unreadCount}</span>}
            </button>

            {!isLoggedIn && (
              <NavLink href={rightLoginHref} style={loginBtn} onClick={() => setMenuOpen(false)}>
                Login
              </NavLink>
            )}

            {isLoggedIn && (
              <div ref={profileWrapRef} style={{ position: "relative" }}>
                <button
                  ref={profileBtnRef}
                  style={profileBtn}
                  onClick={() => {
                    setProfileOpen((v) => !v);
                    setNotifOpen(false);
                    if (mobileSideMounted) closeMobileSide();
                  }}
                  type="button"
                >
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={profileDisplayName}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 999,
                        objectFit: "cover",
                        border: "1px solid rgba(0,0,0,0.08)",
                        background: "rgba(0,0,0,0.04)",
                      }}
                    />
                  ) : (
                    <span
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 999,
                        display: "grid",
                        placeItems: "center",
                        background: "rgba(0,0,0,0.06)",
                        fontSize: 12,
                        fontWeight: 1000,
                      }}
                    >
                      {String(profileDisplayName || "U").trim().charAt(0).toUpperCase() || "U"}
                    </span>
                  )}
                  <span
                    style={{
                      fontSize: 12,
                      maxWidth: 110,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={profileDisplayName}
                  >
                    {profileDisplayName}
                  </span>
                  <span style={{ fontSize: 12, opacity: 0.6 }}>v</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* NOTIFICATION PANEL (portal) */}
        {mounted &&
          notifOpen &&
          panelPos &&
          createPortal(
            <div
              ref={notifRef}
              style={{
                position: "fixed",
                top: panelPos.top,
                right: panelPos.right,
                zIndex: 10000,
              }}
            >
              <div ref={panelRef} style={panelBase}>
                <div style={panelHeader}>
                  <div style={panelTitle}>Notifications</div>
                  <div style={panelActions}>
                    <button type="button" style={smallBtn} onClick={markAllRead}>
                      Mark all read
                    </button>
                    <button type="button" style={smallBtn} onClick={clearNotifs}>
                      Clear
                    </button>
{isLoggedIn && (
                    <button
                      type="button"
                      style={smallBtn}
                      onClick={enablePushNotifications}
                      disabled={pushBusy || pushState === "enabled"}
                      title={
                        pushState === "enabled"
                          ? "Push is already enabled on this device"
                          : pushState === "denied"
                          ? "Push permission denied in browser settings"
                          : "Enable push notifications on this device"
                      }
                    >
                      {pushBusy ? "Enabling" : pushState === "enabled" ? "Push enabled" : "Enable push"}
                    </button>
                    )}
                    <button type="button" style={smallBtn} onClick={() => setNotifOpen(false)}>
                      
                    </button>
                  </div>
                </div>

                <div style={notifList}>
                  {notifs.length === 0 && (
                    <div style={{ padding: 14, fontWeight: 800, color: "rgba(0,0,0,0.55)" }}>No notifications</div>
                  )}

                  {notifs.map((n) => (
                    <div
                      key={n.id}
                      style={{ ...notifItem, ...(n.read ? dim : {}) }}
                      onClick={() => {
                        markOneRead(n.id);
                        if (n.href) router.push(n.href);
                        setNotifOpen(false);
                      }}
                    >
                      <div style={notifMeta}>
                        <span>{n.title}</span>
                        <span>{timeAgo(n.ts)}</span>
                      </div>
                      {n.body && <div style={notifBody}>{n.body}</div>}
                    </div>
                  ))}
                </div>
              </div>
            </div>,
            document.body
          )}

        {/* PROFILE PANEL (portal) */}
        {mounted &&
          profileOpen &&
          profilePos &&
          createPortal(
            <div
              style={{
                position: "fixed",
                top: profilePos.top,
                right: profilePos.right,
                zIndex: 10000,
              }}
            >
              <div ref={profilePanelRef} style={{ ...panelBase, width: 320 }}>
                <div style={panelHeader}>
                  <div style={panelTitle}>Account</div>
                  <button type="button" style={smallBtn} onClick={() => setProfileOpen(false)}>
                    
                  </button>
                </div>

                <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div
                    style={{
                      padding: 10,
                      borderRadius: 14,
                      border: "1px solid rgba(0,0,0,0.08)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      fontWeight: 900,
                      fontSize: 12,
                      color: "rgba(0,0,0,0.65)",
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      {avatarUrl ? (
                        <img
                          src={avatarUrl}
                          alt={profileDisplayName}
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 999,
                            objectFit: "cover",
                            border: "1px solid rgba(0,0,0,0.08)",
                            background: "rgba(0,0,0,0.04)",
                            flexShrink: 0,
                          }}
                        />
                      ) : (
                        <span
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 999,
                            display: "grid",
                            placeItems: "center",
                            background: "rgba(0,0,0,0.06)",
                            fontSize: 13,
                            fontWeight: 1000,
                            flexShrink: 0,
                          }}
                        >
                          {String(profileDisplayName || "U").trim().charAt(0).toUpperCase() || "U"}
                        </span>
                      )}

                      <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                        <span
                          style={{
                            fontWeight: 1000,
                            color: "rgba(0,0,0,0.86)",
                            maxWidth: 170,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={profileDisplayName}
                        >
                          {profileDisplayName}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 800,
                            color: "rgba(0,0,0,0.55)",
                            maxWidth: 170,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={profileDisplayEmail}
                        >
                          {profileDisplayEmail}
                        </span>
                      </span>
                    </span>
                    <span style={{ opacity: 0.7 }}>{r || "user"}</span>
                  </div>

                  {profileItems.map((it, idx) => {
                    if (it.kind === "link") {
                      return (
                        <Link
                          key={idx}
                          href={it.href}
                          onClick={() => setProfileOpen(false)}
                          style={{
                            padding: "10px 12px",
                            borderRadius: 14,
                            border: "1px solid rgba(0,0,0,0.08)",
                            textDecoration: "none",
                            color: "rgba(0,0,0,0.82)",
                            fontWeight: 900,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                          }}
                        >
                          <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                            <span>{it.icon || ""}</span>
                            <span>{it.label}</span>
                          </span>
                          <span style={{ opacity: 0.6 }}></span>
                        </Link>
                      );
                    }

                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={it.onClick}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 14,
                          border: "1px solid rgba(0,0,0,0.10)",
                          background: it.danger ? "rgba(255,59,48,0.10)" : "rgba(0,0,0,0.04)",
                          color: it.danger ? "rgba(180,0,0,0.90)" : "rgba(0,0,0,0.82)",
                          fontWeight: 900,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                          <span>{it.icon || ""}</span>
                          <span>{it.label}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>,
            document.body
          )}

        {err && (
          <div style={{ padding: "6px 12px", maxWidth: layoutMax, margin: "0 auto", color: "#b00020", fontWeight: 900 }}>
            {err}
          </div>
        )}
      </header>
    </>
  );
}


















