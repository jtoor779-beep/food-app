"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import supabase from "@/lib/supabase";

function normalizeRole(r) {
  return String(r || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function initials(name) {
  const s = String(name || "").trim();
  if (!s) return "U";
  const parts = s.split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] || "";
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] : "";
  return (a + b).toUpperCase() || "U";
}

function safeMoneyINR(v) {
  const n = Number(v || 0);
  return `₹${n.toFixed(0)}`;
}

function formatTime(ts) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts || "");
  }
}

function maskEmail(email) {
  const s = String(email || "");
  const [u, d] = s.split("@");
  if (!u || !d) return s;
  if (u.length <= 2) return `${u[0] || "*"}*@${d}`;
  return `${u.slice(0, 2)}***@${d}`;
}

function clampText(s, max = 46) {
  const str = String(s ?? "");
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + "…";
}

export default function ProfilePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const [profile, setProfile] = useState({
    email: "",
    user_id: "",
    role: "",
    full_name: "",
    phone: "",
    address_line1: "",
    city: "",
    state: "",
    zip: "",
    avatar_url: "",
  });

  // ✅ editable fields (does not break old logic)
  const [edit, setEdit] = useState({
    full_name: "",
    phone: "",
    address_line1: "",
    city: "",
    state: "",
    zip: "",
  });

  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  // ✅ NEW: pro stats
  const [stats, setStats] = useState({
    restaurantOrders: 0,
    groceryOrders: 0,
    totalSpend: 0,
    lastOrderAt: "",
    lastOrderLabel: "",
  });

  // ✅ NEW: preferences (localStorage only; safe)
  const [prefs, setPrefs] = useState({
    emailUpdates: true,
    smsUpdates: false,
    marketing: false,
  });

  async function loadPrefs() {
    try {
      const emailUpdates = localStorage.getItem("pref_email_updates");
      const smsUpdates = localStorage.getItem("pref_sms_updates");
      const marketing = localStorage.getItem("pref_marketing");

      setPrefs({
        emailUpdates: emailUpdates == null ? true : emailUpdates === "1",
        smsUpdates: smsUpdates == null ? false : smsUpdates === "1",
        marketing: marketing == null ? false : marketing === "1",
      });
    } catch {
      // ignore
    }
  }

  function savePrefs(next) {
    setPrefs(next);
    try {
      localStorage.setItem("pref_email_updates", next.emailUpdates ? "1" : "0");
      localStorage.setItem("pref_sms_updates", next.smsUpdates ? "1" : "0");
      localStorage.setItem("pref_marketing", next.marketing ? "1" : "0");
    } catch {
      // ignore
    }
  }

  async function loadStats(userId) {
    // This is optional UI/UX: counts + spend + last order time across restaurant + grocery
    try {
      // Counts (fast)
      const rCount = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);
      const gCount = await supabase
        .from("grocery_orders")
        .select("id", { count: "exact", head: true })
        .eq("customer_user_id", userId);

      const restaurantOrders = Number(rCount?.count || 0);
      const groceryOrders = Number(gCount?.count || 0);

      // Spend + last order (limit fetch to stay fast)
      const rList = await supabase
        .from("orders")
        .select("id,total_amount,total,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(200);

      const gList = await supabase
        .from("grocery_orders")
        .select("id,total_amount,created_at")
        .eq("customer_user_id", userId)
        .order("created_at", { ascending: false })
        .limit(200);

      const rSpend = (rList.data || []).reduce(
        (s, o) => s + Number(o.total_amount || o.total || 0),
        0
      );
      const gSpend = (gList.data || []).reduce(
        (s, o) => s + Number(o.total_amount || 0),
        0
      );
      const totalSpend = rSpend + gSpend;

      const rLast = (rList.data || [])[0]?.created_at || "";
      const gLast = (gList.data || [])[0]?.created_at || "";

      let lastOrderAt = "";
      let lastOrderLabel = "";
      if (rLast && gLast) {
        if (new Date(rLast).getTime() >= new Date(gLast).getTime()) {
          lastOrderAt = rLast;
          lastOrderLabel = "Restaurant";
        } else {
          lastOrderAt = gLast;
          lastOrderLabel = "Grocery";
        }
      } else if (rLast) {
        lastOrderAt = rLast;
        lastOrderLabel = "Restaurant";
      } else if (gLast) {
        lastOrderAt = gLast;
        lastOrderLabel = "Grocery";
      }

      setStats({
        restaurantOrders,
        groceryOrders,
        totalSpend,
        lastOrderAt,
        lastOrderLabel,
      });
    } catch {
      // Don't block profile page if stats fail
      setStats((s) => ({ ...s }));
    }
  }

  async function load() {
    setLoading(true);
    setErr("");
    setOk("");

    try {
      const { data } = await supabase.auth.getUser();
      const user = data?.user;
      if (!user) {
        router.push("/login");
        return;
      }

      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("role, full_name, phone, address_line1, city, state, zip, avatar_url")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profErr) throw profErr;

      const next = {
        email: user.email || "",
        user_id: user.id,
        role: normalizeRole(prof?.role),
        full_name: prof?.full_name || "",
        phone: prof?.phone || "",
        address_line1: prof?.address_line1 || "",
        city: prof?.city || "",
        state: prof?.state || "",
        zip: prof?.zip || "",
        avatar_url: prof?.avatar_url || "",
      };

      setProfile(next);
      setEdit({
        full_name: next.full_name,
        phone: next.phone,
        address_line1: next.address_line1,
        city: next.city,
        state: next.state,
        zip: next.zip,
      });

      // ✅ NEW: pro extras
      await loadPrefs();
      await loadStats(user.id);
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function uploadAvatar(file) {
    setErr("");
    setOk("");
    setBusy(true);

    try {
      const { data } = await supabase.auth.getUser();
      const user = data?.user;
      if (!user) {
        router.push("/login");
        return;
      }

      // Basic validation
      const maxMb = 5;
      const sizeMb = file.size / (1024 * 1024);
      if (sizeMb > maxMb) throw new Error(`Image too large. Max ${maxMb}MB`);

      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${user.id}/avatar.${ext}`;

      // Upload to Supabase Storage bucket "avatars"
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, {
        upsert: true,
        contentType: file.type || "image/jpeg",
      });
      if (upErr) throw upErr;

      // Get public URL
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = pub?.publicUrl || "";
      if (!publicUrl) throw new Error("Could not get public URL");

      // Save URL into profiles.avatar_url
      const { error: saveErr } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("user_id", user.id);

      if (saveErr) throw saveErr;

      setProfile((p) => ({ ...p, avatar_url: publicUrl }));
      setOk("✅ Photo updated!");
    } catch (e) {
      setErr(
        e?.message ||
          String(e) ||
          "Upload failed. Make sure Storage bucket 'avatars' exists and is Public."
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveProfileEdits() {
    setErr("");
    setOk("");
    setSaving(true);

    try {
      const { data } = await supabase.auth.getUser();
      const user = data?.user;
      if (!user) {
        router.push("/login");
        return;
      }

      const payload = {
        full_name: String(edit.full_name || "").trim(),
        phone: String(edit.phone || "").trim(),
        address_line1: String(edit.address_line1 || "").trim(),
        city: String(edit.city || "").trim(),
        state: String(edit.state || "").trim(),
        zip: String(edit.zip || "").trim(),
      };

      const { error } = await supabase.from("profiles").update(payload).eq("user_id", user.id);
      if (error) throw error;

      setProfile((p) => ({ ...p, ...payload }));
      setOk("✅ Profile updated!");
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  async function copyUserId() {
    setCopied(false);
    try {
      await navigator.clipboard.writeText(profile.user_id || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore
    }
  }

  // ✅ NEW: send password reset email (pro feature)
  async function sendPasswordReset() {
    setErr("");
    setOk("");
    setBusy(true);

    try {
      const { data } = await supabase.auth.getUser();
      const user = data?.user;
      if (!user?.email) throw new Error("No email found for this account.");

      // redirect back to your app after reset (works even if page doesn't exist yet)
      const redirectTo =
        typeof window !== "undefined" ? `${window.location.origin}/reset-password` : undefined;

      const { error } = await supabase.auth.resetPasswordForEmail(
        user.email,
        redirectTo ? { redirectTo } : undefined
      );
      if (error) throw error;

      setOk("✅ Password reset email sent. Check your inbox.");
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  // ✅ NEW: logout
  async function logout() {
    setErr("");
    setOk("");
    setBusy(true);
    try {
      await supabase.auth.signOut();
      router.push("/login");
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  // ✅ NEW: download user data JSON (client-only)
  function downloadMyData() {
    try {
      const payload = {
        profile,
        preferences: prefs,
        stats,
        exported_at: new Date().toISOString(),
      };
      const json = JSON.stringify(payload, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `homyfod_profile_${String(profile.user_id || "user").slice(0, 8)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setOk("✅ Download started.");
    } catch {
      setErr("Could not export data.");
    }
  }

  /* =========================
     PREMIUM UI (inline + safe)
     ========================= */
  const ui = useMemo(() => {
    const page = {
      minHeight: "calc(100vh - 64px)",
      padding: 18,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background:
        "radial-gradient(1200px 600px at 18% 10%, rgba(255,140,0,0.25), transparent 60%), radial-gradient(900px 520px at 82% 18%, rgba(80,160,255,0.20), transparent 58%), radial-gradient(900px 520px at 70% 90%, rgba(0,200,120,0.14), transparent 60%), linear-gradient(180deg, #f7f8fb, #eef1f7)",
      position: "relative",
      overflow: "hidden",
    };

    const container = {
      width: "100%",
      maxWidth: 1120,
      position: "relative",
      zIndex: 2,
    };

    const header = {
      display: "flex",
      alignItems: "flex-end",
      justifyContent: "space-between",
      gap: 12,
      flexWrap: "wrap",
      marginBottom: 12,
    };

    const h1 = {
      margin: 0,
      fontSize: 30,
      fontWeight: 980,
      letterSpacing: -0.6,
      color: "#0b1220",
      lineHeight: 1.1,
    };

    const sub = {
      marginTop: 6,
      color: "rgba(15,23,42,0.68)",
      fontSize: 13,
      lineHeight: 1.35,
    };

    const pill = {
      padding: "8px 12px",
      borderRadius: 999,
      border: "1px solid rgba(0,0,0,0.08)",
      background: "rgba(255,255,255,0.65)",
      color: "rgba(15,23,42,0.78)",
      fontWeight: 950,
      fontSize: 12,
      whiteSpace: "nowrap",
    };

    const grid = {
      display: "grid",
      gridTemplateColumns: "1fr",
      gap: 14,
      alignItems: "start",
    };

    const card = {
      borderRadius: 22,
      border: "1px solid rgba(255,255,255,0.55)",
      background: "rgba(255,255,255,0.72)",
      boxShadow:
        "0 18px 55px rgba(16,24,40,0.14), 0 2px 10px rgba(16,24,40,0.06)",
      backdropFilter: "blur(10px)",
      padding: 16,
      overflow: "hidden",
    };

    const sectionTitle = {
      fontSize: 13,
      fontWeight: 980,
      color: "rgba(2,6,23,0.78)",
      letterSpacing: 0.2,
      marginBottom: 10,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      flexWrap: "wrap",
    };

    const alertBase = {
      padding: 12,
      borderRadius: 16,
      marginTop: 10,
      marginBottom: 12,
      fontSize: 13,
      lineHeight: 1.35,
      border: "1px solid rgba(0,0,0,0.08)",
      background: "rgba(255,255,255,0.62)",
    };

    const alertErr = {
      ...alertBase,
      border: "1px solid rgba(255,179,179,0.95)",
      background: "rgba(255, 231, 231, 0.75)",
      color: "#7a1717",
      fontWeight: 900,
    };

    const alertOk = {
      ...alertBase,
      border: "1px solid rgba(168,240,191,0.95)",
      background: "rgba(233,255,240,0.75)",
      color: "#0f5b2a",
      fontWeight: 950,
    };

    const avatarRow = {
      display: "flex",
      gap: 14,
      alignItems: "center",
      flexWrap: "wrap",
    };

    const avatar = {
      width: 86,
      height: 86,
      borderRadius: 999,
      overflow: "hidden",
      border: "1px solid rgba(15,23,42,0.10)",
      background:
        "linear-gradient(135deg, rgba(255,140,0,0.12), rgba(80,160,255,0.10))",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontWeight: 980,
      color: "#0b1220",
      flexShrink: 0,
      boxShadow: "0 18px 40px rgba(0,0,0,0.10)",
    };

    const name = {
      fontWeight: 980,
      fontSize: 18,
      color: "#0b1220",
      lineHeight: 1.2,
    };

    const email = {
      marginTop: 4,
      color: "rgba(15,23,42,0.62)",
      fontSize: 13,
    };

    const actions = {
      marginTop: 10,
      display: "flex",
      gap: 10,
      flexWrap: "wrap",
      alignItems: "center",
    };

    const btnPrimary = {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "10px 12px",
      borderRadius: 14,
      border: "1px solid rgba(0,0,0,0.10)",
      background: "linear-gradient(180deg, #0b0f19, #111827)",
      color: "#fff",
      cursor: "pointer",
      fontWeight: 950,
      userSelect: "none",
    };

    const btnPrimaryDisabled = {
      ...btnPrimary,
      opacity: 0.7,
      cursor: "not-allowed",
    };

    const btnGhost = {
      padding: "10px 12px",
      borderRadius: 14,
      border: "1px solid rgba(15,23,42,0.12)",
      background: "rgba(255,255,255,0.7)",
      cursor: "pointer",
      fontWeight: 950,
      color: "rgba(2,6,23,0.78)",
    };

    const btnDanger = {
      padding: "10px 12px",
      borderRadius: 14,
      border: "1px solid rgba(239,68,68,0.22)",
      background: "rgba(254,242,242,0.85)",
      cursor: "pointer",
      fontWeight: 950,
      color: "#7f1d1d",
    };

    const hint = {
      marginTop: 8,
      color: "rgba(15,23,42,0.62)",
      fontSize: 12,
    };

    const row = {
      display: "grid",
      gridTemplateColumns: "1fr",
      gap: 10,
    };

    const field = {
      borderRadius: 16,
      border: "1px solid rgba(15,23,42,0.10)",
      background: "rgba(255,255,255,0.75)",
      padding: 12,
    };

    const label = {
      fontSize: 12,
      fontWeight: 950,
      color: "rgba(2,6,23,0.70)",
      marginBottom: 6,
    };

    const input = {
      width: "100%",
      padding: "10px 12px",
      borderRadius: 14,
      border: "1px solid rgba(15,23,42,0.12)",
      background: "rgba(255,255,255,0.9)",
      outline: "none",
      fontSize: 14,
      color: "#0b1220",
    };

    const metaLine = {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      flexWrap: "wrap",
      marginTop: 8,
      color: "rgba(15,23,42,0.70)",
      fontSize: 13,
    };

    const mono = {
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      fontSize: 12,
      color: "rgba(15,23,42,0.78)",
      wordBreak: "break-all",
    };

    const smallBtn = {
      padding: "8px 10px",
      borderRadius: 12,
      border: "1px solid rgba(15,23,42,0.12)",
      background: "rgba(255,255,255,0.8)",
      cursor: "pointer",
      fontWeight: 950,
      fontSize: 12,
      color: "rgba(2,6,23,0.80)",
    };

    const roleHint = {
      marginTop: 10,
      color: "rgba(15,23,42,0.66)",
      fontSize: 13,
      lineHeight: 1.35,
    };

    const statGrid = {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 10,
      marginTop: 10,
    };

    const statCard = {
      borderRadius: 16,
      border: "1px solid rgba(15,23,42,0.10)",
      background: "rgba(255,255,255,0.78)",
      padding: 12,
    };

    const statNum = {
      fontWeight: 1000,
      fontSize: 18,
      color: "#0b1220",
      letterSpacing: -0.2,
    };

    const statLabel = {
      marginTop: 4,
      fontWeight: 900,
      fontSize: 12,
      color: "rgba(15,23,42,0.62)",
    };

    const divider = {
      height: 1,
      background: "rgba(15,23,42,0.08)",
      margin: "12px 0",
    };

    const toggleRow = {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      padding: "10px 12px",
      borderRadius: 16,
      border: "1px solid rgba(15,23,42,0.10)",
      background: "rgba(255,255,255,0.75)",
      marginTop: 8,
    };

    const toggleBtn = (on) => ({
      width: 52,
      height: 30,
      borderRadius: 999,
      border: "1px solid rgba(0,0,0,0.10)",
      background: on ? "rgba(17,24,39,0.95)" : "rgba(0,0,0,0.10)",
      position: "relative",
      cursor: "pointer",
      flexShrink: 0,
    });

    const toggleKnob = (on) => ({
      width: 24,
      height: 24,
      borderRadius: 999,
      background: "rgba(255,255,255,0.95)",
      position: "absolute",
      top: 2.5,
      left: on ? 26 : 2.5,
      transition: "left 140ms ease",
      boxShadow: "0 10px 22px rgba(0,0,0,0.12)",
    });

    const progressWrap = {
      marginTop: 10,
      borderRadius: 16,
      border: "1px solid rgba(15,23,42,0.10)",
      background: "rgba(255,255,255,0.75)",
      padding: 12,
    };

    const progressBar = (pct) => ({
      height: 10,
      borderRadius: 999,
      background: "rgba(0,0,0,0.10)",
      overflow: "hidden",
      marginTop: 8,
    });

    const progressFill = (pct) => ({
      height: "100%",
      width: `${Math.max(0, Math.min(100, pct))}%`,
      borderRadius: 999,
      background:
        "linear-gradient(90deg, rgba(17,24,39,0.95), rgba(59,130,246,0.85))",
    });

    return {
      page,
      container,
      header,
      h1,
      sub,
      pill,
      grid,
      card,
      sectionTitle,
      alertErr,
      alertOk,
      avatarRow,
      avatar,
      name,
      email,
      actions,
      btnPrimary,
      btnPrimaryDisabled,
      btnGhost,
      btnDanger,
      hint,
      row,
      field,
      label,
      input,
      metaLine,
      mono,
      smallBtn,
      roleHint,
      statGrid,
      statCard,
      statNum,
      statLabel,
      divider,
      toggleRow,
      toggleBtn,
      toggleKnob,
      progressWrap,
      progressBar,
      progressFill,
    };
  }, []);

  const roleLabel =
    profile.role === "restaurant_owner"
      ? "Restaurant Owner"
      : profile.role === "grocery_owner"
      ? "Grocery Owner"
      : profile.role === "delivery_partner"
      ? "Delivery Partner"
      : profile.role === "admin"
      ? "Admin"
      : "Customer";

  const rolePill =
    profile.role === "restaurant_owner"
      ? "Owner"
      : profile.role === "grocery_owner"
      ? "GroceryOwner"
      : profile.role === "delivery_partner"
      ? "Delivery"
      : profile.role === "admin"
      ? "Admin"
      : "Customer";

  const completion = useMemo(() => {
    const checks = [
      !!String(profile.full_name || "").trim(),
      !!String(profile.phone || "").trim(),
      !!String(profile.address_line1 || "").trim(),
      !!String(profile.city || "").trim(),
      !!String(profile.state || "").trim(),
      !!String(profile.zip || "").trim(),
      !!String(profile.avatar_url || "").trim(),
    ];
    const filled = checks.filter(Boolean).length;
    return Math.round((filled / checks.length) * 100);
  }, [
    profile.full_name,
    profile.phone,
    profile.address_line1,
    profile.city,
    profile.state,
    profile.zip,
    profile.avatar_url,
  ]);

  if (loading) {
    return (
      <main style={ui.page}>
        <div className="sf_blob sf_blobA" />
        <div className="sf_blob sf_blobB" />

        <div style={ui.container}>
          <div style={ui.card}>
            <div style={{ fontWeight: 980, color: "rgba(2,6,23,0.78)" }}>
              Loading profile…
            </div>
            <div
              style={{ marginTop: 10, color: "rgba(15,23,42,0.62)", fontWeight: 850 }}
            >
              Please wait…
            </div>
          </div>
        </div>

        <style jsx global>{`
          @keyframes sf_float {
            0% {
              transform: translate3d(0, 0, 0) scale(1);
            }
            50% {
              transform: translate3d(0, -18px, 0) scale(1.02);
            }
            100% {
              transform: translate3d(0, 0, 0) scale(1);
            }
          }
          .sf_blob {
            position: absolute;
            width: 420px;
            height: 420px;
            border-radius: 999px;
            filter: blur(35px);
            opacity: 0.65;
            animation: sf_float 6s ease-in-out infinite;
            z-index: 1;
          }
          .sf_blobA {
            left: -120px;
            top: -140px;
            background: radial-gradient(
              circle at 30% 30%,
              rgba(255, 140, 0, 0.55),
              rgba(255, 140, 0, 0) 60%
            );
          }
          .sf_blobB {
            right: -140px;
            bottom: -160px;
            background: radial-gradient(
              circle at 30% 30%,
              rgba(80, 160, 255, 0.55),
              rgba(80, 160, 255, 0) 60%
            );
            animation-delay: -1.8s;
          }
        `}</style>
      </main>
    );
  }

  return (
    <main style={ui.page}>
      <div className="sf_blob sf_blobA" />
      <div className="sf_blob sf_blobB" />

      <div style={ui.container}>
        <div style={ui.header}>
          <div>
            <h1 style={ui.h1}>Profile</h1>
            <div style={ui.sub}>Your account info</div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div style={ui.pill}>{rolePill} • Signed in</div>
            <button
              onClick={logout}
              disabled={busy || saving}
              style={busy || saving ? ui.btnPrimaryDisabled : ui.btnPrimary}
            >
              Logout
            </button>
          </div>
        </div>

        {err ? <div style={ui.alertErr}>{err}</div> : null}
        {ok ? <div style={ui.alertOk}>{ok}</div> : null}

        <div style={ui.grid} className="sf_profile_grid">
          {/* LEFT COLUMN */}
          <section style={ui.card}>
            <div style={ui.sectionTitle}>
              <span>Account</span>
              <span style={{ color: "rgba(15,23,42,0.62)", fontWeight: 900, fontSize: 12 }}>
                Profile completion: {completion}%
              </span>
            </div>

            <div style={ui.avatarRow}>
              <div style={ui.avatar} title="Profile photo">
                {profile.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profile.avatar_url}
                    alt="avatar"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <span style={{ fontSize: 22 }}>{initials(profile.full_name || profile.email)}</span>
                )}
              </div>

              <div style={{ flex: 1, minWidth: 240 }}>
                <div style={ui.name}>{profile.full_name || "No name set"}</div>
                <div style={ui.email}>{profile.email}</div>

                <div style={ui.actions}>
                  <label style={busy ? ui.btnPrimaryDisabled : ui.btnPrimary}>
                    {busy ? "Uploading…" : "Upload Photo"}
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      disabled={busy}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        uploadAvatar(file);
                        e.target.value = "";
                      }}
                    />
                  </label>

                  {profile.avatar_url ? (
                    <button
                      type="button"
                      style={ui.btnGhost}
                      disabled={busy}
                      onClick={async () => {
                        setErr("");
                        setOk("");
                        setBusy(true);
                        try {
                          const { data } = await supabase.auth.getUser();
                          const user = data?.user;
                          if (!user) {
                            router.push("/login");
                            return;
                          }
                          const { error: saveErr } = await supabase
                            .from("profiles")
                            .update({ avatar_url: null })
                            .eq("user_id", user.id);
                          if (saveErr) throw saveErr;

                          setProfile((p) => ({ ...p, avatar_url: "" }));
                          setOk("✅ Photo removed");
                        } catch (e) {
                          setErr(e?.message || String(e));
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>

                <div style={ui.hint}>Tip: Use a square photo for best look (max 5MB).</div>
              </div>
            </div>

            <div style={ui.progressWrap}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <div style={{ fontWeight: 1000, color: "#0b1220" }}>Finish setup</div>
                <div style={{ color: "rgba(15,23,42,0.62)", fontWeight: 900, fontSize: 12 }}>
                  {completion < 100 ? "Add missing details for smoother checkout." : "All set ✅"}
                </div>
              </div>

              <div style={ui.progressBar(completion)}>
                <div style={ui.progressFill(completion)} />
              </div>

              {completion < 100 ? (
                <div style={{ marginTop: 10, color: "rgba(15,23,42,0.66)", fontSize: 12, fontWeight: 850 }}>
                  Missing:{" "}
                  {[
                    !String(profile.full_name || "").trim() ? "name" : null,
                    !String(profile.phone || "").trim() ? "phone" : null,
                    !String(profile.address_line1 || "").trim() ? "address" : null,
                    !String(profile.city || "").trim() ? "city" : null,
                    !String(profile.state || "").trim() ? "state" : null,
                    !String(profile.zip || "").trim() ? "zip" : null,
                    !String(profile.avatar_url || "").trim() ? "photo" : null,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </div>
              ) : null}
            </div>

            <div style={ui.metaLine}>
              <div>
                <b>Role:</b> {roleLabel}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontWeight: 950 }}>User ID</span>
                <button type="button" style={ui.smallBtn} onClick={copyUserId}>
                  {copied ? "Copied ✅" : "Copy"}
                </button>
              </div>
              <div style={ui.mono}>{profile.user_id}</div>
            </div>

            {/* Role hint */}
            {profile.role === "restaurant_owner" ? (
              <div style={ui.roleHint}>Owner account detected ✅ (Owner Orders menu is enabled)</div>
            ) : profile.role === "grocery_owner" ? (
              <div style={ui.roleHint}>Grocery owner account detected ✅ (Grocery Owner Orders is enabled)</div>
            ) : profile.role === "delivery_partner" ? (
              <div style={ui.roleHint}>Delivery account detected ✅ (Delivery Dashboard is enabled)</div>
            ) : (
              <div style={ui.roleHint}>Customer account detected ✅ (Cart + My Orders menu is enabled)</div>
            )}

            <div style={ui.divider} />

            {/* Quick actions */}
            <div style={ui.sectionTitle}>
              <span>Quick actions</span>
              <span style={{ color: "rgba(15,23,42,0.62)", fontWeight: 900, fontSize: 12 }}>
                Fast shortcuts
              </span>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="button" style={ui.btnGhost} onClick={() => router.push("/orders")}>
                My Restaurant Orders
              </button>
              <button type="button" style={ui.btnGhost} onClick={() => router.push("/groceries/orders")}>
                My Grocery Orders
              </button>
              <button type="button" style={ui.btnGhost} onClick={() => router.push("/settings")}>
                Settings
              </button>
              <button type="button" style={ui.btnGhost} onClick={downloadMyData}>
                Download my data
              </button>
            </div>
          </section>

          {/* RIGHT COLUMN */}
          <section style={ui.card}>
            <div style={ui.sectionTitle}>
              <span>Profile details</span>
              <span style={{ color: "rgba(15,23,42,0.62)", fontWeight: 900, fontSize: 12 }}>
                Secure • Synced to Supabase
              </span>
            </div>

            <div style={ui.row} className="sf_fields">
              <div style={ui.field}>
                <div style={ui.label}>Full name</div>
                <input
                  value={edit.full_name}
                  onChange={(e) => setEdit((p) => ({ ...p, full_name: e.target.value }))}
                  placeholder="Enter your full name"
                  style={ui.input}
                  disabled={saving || busy}
                />
              </div>

              <div style={ui.field}>
                <div style={ui.label}>Phone</div>
                <input
                  value={edit.phone}
                  onChange={(e) => setEdit((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="Enter phone number"
                  style={ui.input}
                  disabled={saving || busy}
                />
              </div>

              <div style={ui.field}>
                <div style={ui.label}>Address line 1</div>
                <input
                  value={edit.address_line1}
                  onChange={(e) => setEdit((p) => ({ ...p, address_line1: e.target.value }))}
                  placeholder="Street address"
                  style={ui.input}
                  disabled={saving || busy}
                />
              </div>

              {/* ✅ NEW: City/State/Zip */}
              <div style={ui.field}>
                <div style={ui.label}>City</div>
                <input
                  value={edit.city}
                  onChange={(e) => setEdit((p) => ({ ...p, city: e.target.value }))}
                  placeholder="City"
                  style={ui.input}
                  disabled={saving || busy}
                />
              </div>

              <div style={ui.field}>
                <div style={ui.label}>State</div>
                <input
                  value={edit.state}
                  onChange={(e) => setEdit((p) => ({ ...p, state: e.target.value }))}
                  placeholder="State"
                  style={ui.input}
                  disabled={saving || busy}
                />
              </div>

              <div style={ui.field}>
                <div style={ui.label}>Zip code</div>
                <input
                  value={edit.zip}
                  onChange={(e) => setEdit((p) => ({ ...p, zip: e.target.value }))}
                  placeholder="Zip"
                  style={ui.input}
                  disabled={saving || busy}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
              <button
                type="button"
                onClick={saveProfileEdits}
                disabled={saving || busy}
                style={saving || busy ? ui.btnPrimaryDisabled : ui.btnPrimary}
              >
                {saving ? "Saving…" : "Save Changes"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setErr("");
                  setOk("");
                  setEdit({
                    full_name: profile.full_name,
                    phone: profile.phone,
                    address_line1: profile.address_line1,
                    city: profile.city,
                    state: profile.state,
                    zip: profile.zip,
                  });
                  setOk("✅ Changes reset");
                }}
                disabled={saving || busy}
                style={ui.btnGhost}
              >
                Reset
              </button>

              <button type="button" onClick={load} disabled={saving || busy} style={ui.btnGhost}>
                Refresh
              </button>
            </div>

            <div style={{ marginTop: 10, color: "rgba(15,23,42,0.62)", fontSize: 12 }}>
              Note: Save updates <b>full_name</b>, <b>phone</b>, <b>address_line1</b>, <b>city</b>, <b>state</b>, <b>zip</b> in your{" "}
              <b>profiles</b> table.
            </div>

            <div style={ui.divider} />

            {/* Stats */}
            <div style={ui.sectionTitle}>
              <span>Your activity</span>
              <span style={{ color: "rgba(15,23,42,0.62)", fontWeight: 900, fontSize: 12 }}>
                Last:{" "}
                {stats.lastOrderAt
                  ? `${stats.lastOrderLabel} • ${formatTime(stats.lastOrderAt)}`
                  : "No orders yet"}
              </span>
            </div>

            <div style={ui.statGrid}>
              <div style={ui.statCard}>
                <div style={ui.statNum}>{stats.restaurantOrders}</div>
                <div style={ui.statLabel}>Restaurant orders</div>
              </div>
              <div style={ui.statCard}>
                <div style={ui.statNum}>{stats.groceryOrders}</div>
                <div style={ui.statLabel}>Grocery orders</div>
              </div>
              <div style={{ ...ui.statCard, gridColumn: "1 / -1" }}>
                <div style={ui.statNum}>{safeMoneyINR(stats.totalSpend)}</div>
                <div style={ui.statLabel}>Total spend (approx)</div>
              </div>
            </div>

            <div style={ui.divider} />

            {/* Preferences */}
            <div style={ui.sectionTitle}>
              <span>Preferences</span>
              <span style={{ color: "rgba(15,23,42,0.62)", fontWeight: 900, fontSize: 12 }}>
                Stored on this device
              </span>
            </div>

            <div style={ui.toggleRow}>
              <div>
                <div style={{ fontWeight: 1000, color: "#0b1220" }}>Order updates email</div>
                <div style={{ marginTop: 4, fontSize: 12, fontWeight: 850, color: "rgba(15,23,42,0.62)" }}>
                  Receipts + status updates
                </div>
              </div>
              <div
                style={ui.toggleBtn(prefs.emailUpdates)}
                onClick={() => savePrefs({ ...prefs, emailUpdates: !prefs.emailUpdates })}
                role="button"
                aria-label="toggle email updates"
              >
                <div style={ui.toggleKnob(prefs.emailUpdates)} />
              </div>
            </div>

            <div style={ui.toggleRow}>
              <div>
                <div style={{ fontWeight: 1000, color: "#0b1220" }}>SMS updates</div>
                <div style={{ marginTop: 4, fontSize: 12, fontWeight: 850, color: "rgba(15,23,42,0.62)" }}>
                  Delivery alerts (if enabled later)
                </div>
              </div>
              <div
                style={ui.toggleBtn(prefs.smsUpdates)}
                onClick={() => savePrefs({ ...prefs, smsUpdates: !prefs.smsUpdates })}
                role="button"
                aria-label="toggle sms updates"
              >
                <div style={ui.toggleKnob(prefs.smsUpdates)} />
              </div>
            </div>

            <div style={ui.toggleRow}>
              <div>
                <div style={{ fontWeight: 1000, color: "#0b1220" }}>Offers & marketing</div>
                <div style={{ marginTop: 4, fontSize: 12, fontWeight: 850, color: "rgba(15,23,42,0.62)" }}>
                  Deals and announcements
                </div>
              </div>
              <div
                style={ui.toggleBtn(prefs.marketing)}
                onClick={() => savePrefs({ ...prefs, marketing: !prefs.marketing })}
                role="button"
                aria-label="toggle marketing"
              >
                <div style={ui.toggleKnob(prefs.marketing)} />
              </div>
            </div>

            <div style={ui.divider} />

            {/* Security */}
            <div style={ui.sectionTitle}>
              <span>Security</span>
              <span style={{ color: "rgba(15,23,42,0.62)", fontWeight: 900, fontSize: 12 }}>
                Email: {maskEmail(profile.email)}
              </span>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                style={busy ? ui.btnPrimaryDisabled : ui.btnPrimary}
                disabled={busy}
                onClick={sendPasswordReset}
              >
                Send password reset email
              </button>
              <button type="button" style={ui.btnGhost} onClick={downloadMyData}>
                Download my data
              </button>
              <button type="button" style={ui.btnDanger} disabled={busy || saving} onClick={logout}>
                Logout
              </button>
            </div>

            <div style={{ marginTop: 10, color: "rgba(15,23,42,0.62)", fontSize: 12 }}>
              Password reset will email you a secure link. You can later add “Change password inside app” if you want.
            </div>
          </section>
        </div>
      </div>

      <style jsx global>{`
        @keyframes sf_float {
          0% { transform: translate3d(0,0,0) scale(1); }
          50% { transform: translate3d(0,-18px,0) scale(1.02); }
          100% { transform: translate3d(0,0,0) scale(1); }
        }
        .sf_blob {
          position: absolute;
          width: 420px;
          height: 420px;
          border-radius: 999px;
          filter: blur(35px);
          opacity: 0.65;
          animation: sf_float 6s ease-in-out infinite;
          z-index: 1;
        }
        .sf_blobA {
          left: -120px;
          top: -140px;
          background: radial-gradient(circle at 30% 30%, rgba(255,140,0,0.55), rgba(255,140,0,0) 60%);
        }
        .sf_blobB {
          right: -140px;
          bottom: -160px;
          background: radial-gradient(circle at 30% 30%, rgba(80,160,255,0.55), rgba(80,160,255,0) 60%);
          animation-delay: -1.8s;
        }

        /* Desktop split layout */
        @media (min-width: 980px) {
          .sf_profile_grid {
            grid-template-columns: 0.95fr 1.05fr !important;
            gap: 14px !important;
          }
          .sf_fields {
            grid-template-columns: 1fr 1fr !important;
          }
          /* last row becomes full width if needed */
          .sf_fields > div:nth-last-child(1) {
            grid-column: auto;
          }
        }
      `}</style>
    </main>
  );
}