"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import supabase from "@/lib/supabase";

function normalizeRole(r) {
  return String(r || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

async function getRoleAndRedirect(router) {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw userErr;

  const user = userData?.user;
  if (!user) return;

  const { data: prof, error: profErr } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profErr) throw profErr;

  const role = normalizeRole(prof?.role);

  // ✅ Your required redirects
  if (role === "restaurant_owner") {
    router.push("/restaurants/orders");
    return;
  }
  if (role === "admin") {
    router.push("/admin/orders");
    return;
  }

  // ✅ Grocery Owner redirect
  if (role === "grocery_owner") {
    router.push("/groceries/owner/dashboard");
    return;
  }

  // ✅ Delivery Partner redirect
  if (role === "delivery_partner") {
    router.push("/delivery");
    return;
  }

  // default customer (or unknown) -> Home
  router.push("/");
}

// ✅ helper: email confirmed check across Supabase versions
function isEmailConfirmed(user) {
  // supabase auth user can expose one of these depending on version/settings:
  // - email_confirmed_at (most common)
  // - confirmed_at
  const a = user?.email_confirmed_at;
  const b = user?.confirmed_at;
  return !!(a || b);
}

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [errMsg, setErrMsg] = useState("");
  const [infoMsg, setInfoMsg] = useState("");

  // ✅ UI: show/hide password
  const [showPass, setShowPass] = useState(false);

  // ✅ forgot password loading
  const [resetLoading, setResetLoading] = useState(false);

  // ✅ NEW: Email OTP login (code)
  const [otpMode, setOtpMode] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);

  // ✅ resend verification
  const [resendLoading, setResendLoading] = useState(false);

  // ✅ If already logged in, redirect to correct home
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const { data } = await supabase.auth.getSession();
        if (!cancelled && data?.session?.user) {
          // If session exists but email isn't confirmed, sign out for safety
          const u = data.session.user;
          if (!isEmailConfirmed(u)) {
            await supabase.auth.signOut();
          } else {
            await getRoleAndRedirect(router);
          }
        }
      } catch (e) {
        // ignore
      } finally {
        if (!cancelled) setCheckingSession(false);
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleLogin(e) {
    e.preventDefault();
    setErrMsg("");
    setInfoMsg("");

    if (!email.trim()) return setErrMsg("Please enter email.");
    if (!password.trim()) return setErrMsg("Please enter password.");

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password.trim(),
      });

      if (error) throw error;

      // ✅ A) Block access until email is confirmed
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;

      if (!user) {
        setErrMsg("Login failed. Please try again.");
        return;
      }

      if (!isEmailConfirmed(user)) {
        // immediately sign out so unconfirmed accounts can't continue
        await supabase.auth.signOut();
        setErrMsg(
          "✅ Account created, but email is not verified yet. Please check your inbox and confirm your email. Then login again."
        );
        return;
      }

      setInfoMsg("✅ Logged in successfully. Redirecting...");
      await getRoleAndRedirect(router);
      router.refresh();
    } catch (e) {
      setErrMsg(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  // ✅ Forgot password
  async function handleForgotPassword() {
    setErrMsg("");
    setInfoMsg("");

    const em = email.trim();
    if (!em) {
      setErrMsg("Enter your email first, then click 'Forgot password?'.");
      return;
    }

    setResetLoading(true);
    try {
      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/reset-password`
          : undefined;

      const { error } = await supabase.auth.resetPasswordForEmail(em, {
        redirectTo,
      });

      if (error) throw error;

      setInfoMsg(
        "✅ Password reset email sent. Please check your inbox (and spam)."
      );
    } catch (e) {
      setErrMsg(e?.message || String(e));
    } finally {
      setResetLoading(false);
    }
  }

  // ✅ A) Resend verification email
  async function resendVerificationEmail() {
    setErrMsg("");
    setInfoMsg("");

    const em = email.trim();
    if (!em) {
      setErrMsg("Enter your email first, then click 'Resend verification email'.");
      return;
    }

    setResendLoading(true);
    try {
      const emailRedirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/auth/callback`
          : undefined;

      // supabase-js v2 supports resend for signup verification
      // if your version complains, tell me the exact error and I’ll adapt it.
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: em,
        options: emailRedirectTo ? { emailRedirectTo } : undefined,
      });

      if (error) throw error;

      setInfoMsg("✅ Verification email re-sent. Check inbox/spam.");
    } catch (e) {
      setErrMsg(e?.message || String(e));
    } finally {
      setResendLoading(false);
    }
  }

  // ✅ B) Email code login (OTP) - send code
  async function sendLoginCode() {
    setErrMsg("");
    setInfoMsg("");

    const em = email.trim();
    if (!em) {
      setErrMsg("Enter your email first, then click 'Send code'.");
      return;
    }

    setOtpLoading(true);
    try {
      const emailRedirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/auth/callback`
          : undefined;

      const { error } = await supabase.auth.signInWithOtp({
        email: em,
        options: emailRedirectTo ? { emailRedirectTo } : undefined,
      });

      if (error) throw error;

      setOtpSent(true);
      setInfoMsg("✅ Code sent to your email. Enter the code below.");
    } catch (e) {
      setErrMsg(e?.message || String(e));
    } finally {
      setOtpLoading(false);
    }
  }

  // ✅ B) verify OTP code
  async function verifyLoginCode(e) {
    e.preventDefault();
    setErrMsg("");
    setInfoMsg("");

    const em = email.trim();
    const code = String(otpCode || "").trim();

    if (!em) return setErrMsg("Enter your email.");
    if (!code) return setErrMsg("Enter the code from your email.");

    setOtpLoading(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: em,
        token: code,
        type: "email",
      });

      if (error) throw error;

      const user = data?.user;
      if (user && !isEmailConfirmed(user)) {
        // with OTP flow, email is typically verified, but keep safe
        setErrMsg("Email is not verified yet. Please confirm your email first.");
        return;
      }

      setInfoMsg("✅ Logged in successfully. Redirecting...");
      await getRoleAndRedirect(router);
      router.refresh();
    } catch (e) {
      setErrMsg(e?.message || String(e));
    } finally {
      setOtpLoading(false);
    }
  }

  /* =========================
     PRO UI (inline only) — LOGIC 100% SAME
     ✅ Added: HomyFod creative 3D/emoji background + hero side panel (desktop)
     ========================= */

  const page = {
    minHeight: "calc(100vh - 64px)",
    padding: 18,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "hidden",
    background:
      "radial-gradient(1200px 600px at 20% 10%, rgba(255,140,0,0.25), transparent 60%), radial-gradient(900px 520px at 80% 18%, rgba(80,160,255,0.22), transparent 58%), radial-gradient(900px 520px at 70% 90%, rgba(0,200,120,0.16), transparent 60%), linear-gradient(180deg, #f7f8fb, #eef1f7)",
  };

  const shell = {
    width: "100%",
    maxWidth: 1080,
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 18,
    alignItems: "stretch",
    position: "relative",
    zIndex: 2,
  };

  const hero = {
    borderRadius: 26,
    border: "1px solid rgba(255,255,255,0.55)",
    background: "rgba(255,255,255,0.55)",
    boxShadow:
      "0 18px 55px rgba(16,24,40,0.10), 0 2px 10px rgba(16,24,40,0.05)",
    backdropFilter: "blur(10px)",
    padding: 18,
    overflow: "hidden",
    position: "relative",
    minHeight: 360,
  };

  const heroTop = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  };

  const heroBrand = {
    display: "flex",
    alignItems: "center",
    gap: 10,
  };

  const heroLogo = {
    width: 46,
    height: 46,
    borderRadius: 16,
    display: "grid",
    placeItems: "center",
    background:
      "linear-gradient(135deg, rgba(255,140,0,0.20), rgba(80,160,255,0.18))",
    border: "1px solid rgba(0,0,0,0.06)",
    boxShadow: "0 10px 26px rgba(0,0,0,0.10)",
    fontSize: 20,
  };

  const heroTitle = {
    margin: 0,
    fontSize: 22,
    fontWeight: 1000,
    letterSpacing: -0.5,
    color: "#0b1220",
    lineHeight: 1.1,
  };

  const heroSub = {
    marginTop: 5,
    fontSize: 13,
    color: "rgba(15,23,42,0.72)",
    lineHeight: 1.35,
  };

  const heroBadge = {
    fontSize: 12,
    padding: "7px 10px",
    borderRadius: 999,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "rgba(255,255,255,0.65)",
    color: "rgba(15,23,42,0.78)",
    fontWeight: 900,
    whiteSpace: "nowrap",
  };

  const heroBody = {
    marginTop: 14,
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 12,
  };

  const heroLine = {
    borderRadius: 18,
    border: "1px solid rgba(15,23,42,0.08)",
    background: "rgba(255,255,255,0.70)",
    padding: 14,
    color: "rgba(2,6,23,0.82)",
    fontWeight: 900,
    lineHeight: 1.35,
  };

  const heroMiniRow = {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 10,
  };

  const heroMini = {
    borderRadius: 18,
    border: "1px solid rgba(15,23,42,0.08)",
    background: "rgba(255,255,255,0.68)",
    padding: 12,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  };

  const heroMiniLeft = {
    display: "flex",
    alignItems: "center",
    gap: 10,
  };

  const heroEmoji = {
    width: 38,
    height: 38,
    borderRadius: 16,
    display: "grid",
    placeItems: "center",
    background:
      "linear-gradient(135deg, rgba(255,140,0,0.12), rgba(80,160,255,0.10))",
    border: "1px solid rgba(0,0,0,0.06)",
    boxShadow: "0 10px 24px rgba(0,0,0,0.08)",
    fontSize: 18,
  };

  const heroMiniText = {
    display: "flex",
    flexDirection: "column",
    gap: 3,
  };

  const heroMiniTitle = {
    fontWeight: 1000,
    color: "#0b1220",
    fontSize: 13,
  };

  const heroMiniSub = {
    color: "rgba(15,23,42,0.66)",
    fontSize: 12,
    fontWeight: 850,
  };

  const heroPill = {
    fontSize: 12,
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "rgba(255,255,255,0.70)",
    color: "rgba(15,23,42,0.75)",
    fontWeight: 900,
  };

  const card = {
    width: "100%",
    maxWidth: 520,
    margin: "0 auto",
    borderRadius: 22,
    border: "1px solid rgba(255,255,255,0.55)",
    background: "rgba(255,255,255,0.72)",
    boxShadow:
      "0 18px 55px rgba(16,24,40,0.14), 0 2px 10px rgba(16,24,40,0.06)",
    backdropFilter: "blur(10px)",
    padding: 18,
    position: "relative",
    overflow: "hidden",
  };

  const headerRow = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 10,
  };

  const brand = { display: "flex", alignItems: "center", gap: 10 };

  const logo = {
    width: 42,
    height: 42,
    borderRadius: 14,
    display: "grid",
    placeItems: "center",
    background:
      "linear-gradient(135deg, rgba(255,140,0,0.20), rgba(80,160,255,0.18))",
    border: "1px solid rgba(0,0,0,0.06)",
    boxShadow: "0 8px 22px rgba(0,0,0,0.10)",
  };

  const title = {
    fontSize: 20,
    fontWeight: 950,
    margin: 0,
    letterSpacing: -0.3,
    color: "#0b1220",
    lineHeight: 1.2,
  };

  const subtitle = { marginTop: 2, fontSize: 13, color: "rgba(15,23,42,0.70)" };

  const pill = {
    fontSize: 12,
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "rgba(255,255,255,0.65)",
    color: "rgba(15,23,42,0.75)",
    fontWeight: 800,
    cursor: "pointer",
    userSelect: "none",
  };

  const alertBase = {
    padding: 12,
    borderRadius: 14,
    marginTop: 10,
    marginBottom: 12,
    fontSize: 13,
    lineHeight: 1.35,
  };

  const alertError = {
    ...alertBase,
    background: "rgba(255, 231, 231, 0.75)",
    border: "1px solid rgba(255, 179, 179, 0.9)",
    color: "#7a1717",
  };

  const alertInfo = {
    ...alertBase,
    background: "rgba(233, 255, 240, 0.75)",
    border: "1px solid rgba(168, 240, 191, 0.95)",
    color: "#0f5b2a",
  };

  const form = {
    borderRadius: 18,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "rgba(255,255,255,0.70)",
    padding: 14,
  };

  const field = { marginBottom: 12 };

  const label = {
    display: "block",
    fontWeight: 950,
    marginBottom: 7,
    fontSize: 13,
    color: "rgba(2,6,23,0.86)",
  };

  const inputWrap = { position: "relative", display: "flex", alignItems: "center" };

  const iconLeft = {
    position: "absolute",
    left: 12,
    width: 18,
    height: 18,
    opacity: 0.75,
    pointerEvents: "none",
  };

  const input = {
    width: "100%",
    padding: "11px 12px 11px 40px",
    borderRadius: 14,
    border: "1px solid rgba(15,23,42,0.14)",
    outline: "none",
    background: "rgba(255,255,255,0.85)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.9)",
    fontSize: 14,
    color: "#0b1220",
  };

  const passInput = { ...input, paddingRight: 44 };

  const eyeBtn = {
    position: "absolute",
    right: 10,
    width: 34,
    height: 34,
    borderRadius: 12,
    border: "1px solid rgba(15,23,42,0.10)",
    background: "rgba(255,255,255,0.7)",
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
  };

  const rowBetween = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 6,
    marginBottom: 10,
    flexWrap: "wrap",
  };

  const linkBtn = {
    border: "none",
    background: "transparent",
    padding: 0,
    cursor: "pointer",
    color: "rgba(2,6,23,0.78)",
    fontWeight: 900,
    fontSize: 13,
    textDecoration: "underline",
    textUnderlineOffset: 3,
  };

  const submit = {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.10)",
    background: "linear-gradient(180deg, #0b0f19, #111827)",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 950,
    letterSpacing: 0.2,
    boxShadow: "0 10px 26px rgba(0,0,0,0.22)",
  };

  const submitDisabled = { ...submit, opacity: 0.75, cursor: "not-allowed" };

  const footer = {
    marginTop: 12,
    fontSize: 13,
    color: "rgba(15,23,42,0.70)",
    textAlign: "center",
  };

  const createLink = {
    color: "#0b0f19",
    fontWeight: 950,
    cursor: "pointer",
    textDecoration: "underline",
    textUnderlineOffset: 3,
  };

  function MailIcon() {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" style={iconLeft}>
        <path
          d="M4 7.5c0-1.1.9-2 2-2h12c1.1 0 2 .9 2 2v9c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2v-9Z"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <path
          d="M5.5 8.2 12 13l6.5-4.8"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  function LockIcon() {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" style={iconLeft}>
        <path
          d="M7 11V8.8A5 5 0 0 1 12 4a5 5 0 0 1 5 4.8V11"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M6.5 11h11A2.5 2.5 0 0 1 20 13.5v4A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5v-4A2.5 2.5 0 0 1 6.5 11Z"
          stroke="currentColor"
          strokeWidth="1.6"
        />
      </svg>
    );
  }

  function EyeIcon({ off }) {
    return off ? (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
        <path
          d="M3 12s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7Z"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <path
          d="M10 10.2a3 3 0 0 0 3.8 3.8"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M4 4l16 16"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    ) : (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
        <path
          d="M3 12s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7Z"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <path
          d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
          stroke="currentColor"
          strokeWidth="1.6"
        />
      </svg>
    );
  }

  function Spinner() {
    return (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        style={{ marginRight: 8 }}
        aria-hidden="true"
      >
        <circle
          cx="12"
          cy="12"
          r="9"
          stroke="rgba(255,255,255,0.45)"
          strokeWidth="3"
          fill="none"
        />
        <path
          d="M21 12a9 9 0 0 0-9-9"
          stroke="#ffffff"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        >
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 12 12"
            to="360 12 12"
            dur="0.9s"
            repeatCount="indefinite"
          />
        </path>
      </svg>
    );
  }

  // Decorative floating emoji “stickers” (no logic impact)
  function Sticker({ className, children }) {
    return (
      <div className={`hf_sticker ${className || ""}`} aria-hidden="true">
        <div className="hf_stickerInner">{children}</div>
      </div>
    );
  }

  if (checkingSession) {
    return (
      <main style={page}>
        {/* Background creative layer */}
        <div className="hf_bg" aria-hidden="true">
          <div className="hf_wm">HomyFod</div>
          <div className="hf_glow hf_glowA" />
          <div className="hf_glow hf_glowB" />
          <div className="hf_glow hf_glowC" />
          <Sticker className="hf_s1">🍔</Sticker>
          <Sticker className="hf_s2">🥗</Sticker>
          <Sticker className="hf_s3">🍕</Sticker>
          <Sticker className="hf_s4">🥑</Sticker>
          <Sticker className="hf_s5">🍗</Sticker>
          <Sticker className="hf_s6">🧃</Sticker>
        </div>

        <div style={{ ...card, maxWidth: 520 }}>
          <div style={headerRow}>
            <div style={brand}>
              <div style={logo}>🍔</div>
              <div>
                <div style={title}>HomyFod</div>
                <div style={subtitle}>Preparing your session…</div>
              </div>
            </div>
            <div style={{ ...pill, cursor: "default" }}>Secure</div>
          </div>

          <div
            style={{
              marginTop: 10,
              padding: 14,
              borderRadius: 16,
              border: "1px solid rgba(0,0,0,0.08)",
              background: "rgba(255,255,255,0.75)",
              display: "flex",
              alignItems: "center",
              gap: 10,
              color: "rgba(15,23,42,0.75)",
              fontWeight: 900,
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                background: "rgba(255,140,0,0.9)",
                boxShadow: "0 0 0 4px rgba(255,140,0,0.18)",
              }}
            />
            Checking session…
          </div>
        </div>

        <style jsx global>{`
          @keyframes hf_float {
            0% {
              transform: translate3d(0, 0, 0) rotate(0deg);
            }
            50% {
              transform: translate3d(0, -14px, 0) rotate(2deg);
            }
            100% {
              transform: translate3d(0, 0, 0) rotate(0deg);
            }
          }
          @keyframes hf_drift {
            0% {
              transform: translate3d(0, 0, 0);
            }
            50% {
              transform: translate3d(18px, -10px, 0);
            }
            100% {
              transform: translate3d(0, 0, 0);
            }
          }
          @keyframes hf_shine {
            0% {
              opacity: 0.5;
              transform: translate3d(0, 0, 0) scale(1);
            }
            50% {
              opacity: 0.75;
              transform: translate3d(0, 0, 0) scale(1.05);
            }
            100% {
              opacity: 0.5;
              transform: translate3d(0, 0, 0) scale(1);
            }
          }

          .hf_bg {
            position: absolute;
            inset: 0;
            overflow: hidden;
            pointer-events: none;
            z-index: 1;
          }

          .hf_wm {
            position: absolute;
            left: 50%;
            top: 52%;
            transform: translate(-50%, -50%);
            font-weight: 1000;
            letter-spacing: -2px;
            font-size: clamp(46px, 10vw, 110px);
            color: rgba(15, 23, 42, 0.06);
            text-shadow: 0 20px 60px rgba(0, 0, 0, 0.05);
            user-select: none;
            white-space: nowrap;
          }

          .hf_glow {
            position: absolute;
            width: 520px;
            height: 520px;
            border-radius: 999px;
            filter: blur(36px);
            opacity: 0.65;
            animation: hf_shine 6s ease-in-out infinite;
          }
          .hf_glowA {
            left: -180px;
            top: -220px;
            background: radial-gradient(
              circle at 30% 30%,
              rgba(255, 140, 0, 0.55),
              rgba(255, 140, 0, 0) 60%
            );
          }
          .hf_glowB {
            right: -220px;
            top: 8%;
            background: radial-gradient(
              circle at 30% 30%,
              rgba(80, 160, 255, 0.55),
              rgba(80, 160, 255, 0) 60%
            );
            animation-delay: -1.4s;
          }
          .hf_glowC {
            left: 20%;
            bottom: -240px;
            background: radial-gradient(
              circle at 30% 30%,
              rgba(0, 200, 120, 0.40),
              rgba(0, 200, 120, 0) 62%
            );
            animation-delay: -2.1s;
          }

          .hf_sticker {
            position: absolute;
            width: 74px;
            height: 74px;
            border-radius: 22px;
            background: rgba(255, 255, 255, 0.65);
            border: 1px solid rgba(255, 255, 255, 0.55);
            box-shadow: 0 18px 55px rgba(16, 24, 40, 0.12),
              0 2px 10px rgba(16, 24, 40, 0.06);
            backdrop-filter: blur(10px);
            display: grid;
            place-items: center;
            transform-style: preserve-3d;
            animation: hf_float 5.6s ease-in-out infinite;
          }
          .hf_stickerInner {
            width: 58px;
            height: 58px;
            border-radius: 18px;
            display: grid;
            place-items: center;
            background: linear-gradient(
              135deg,
              rgba(255, 140, 0, 0.10),
              rgba(80, 160, 255, 0.10)
            );
            border: 1px solid rgba(0, 0, 0, 0.06);
            font-size: 28px;
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9);
            transform: translateZ(14px);
          }

          /* Sticker positions */
          .hf_s1 {
            left: 6%;
            top: 14%;
            animation-delay: -0.6s;
          }
          .hf_s2 {
            left: 14%;
            bottom: 12%;
            animation-delay: -1.2s;
          }
          .hf_s3 {
            right: 10%;
            top: 18%;
            animation-delay: -1.8s;
          }
          .hf_s4 {
            right: 6%;
            bottom: 16%;
            animation-delay: -2.2s;
          }
          .hf_s5 {
            left: 42%;
            top: 8%;
            animation-delay: -2.8s;
          }
          .hf_s6 {
            right: 36%;
            bottom: 8%;
            animation-delay: -3.3s;
          }

          @media (max-width: 720px) {
            .hf_wm {
              top: 46%;
            }
            .hf_sticker {
              width: 64px;
              height: 64px;
              border-radius: 20px;
            }
            .hf_stickerInner {
              width: 50px;
              height: 50px;
              border-radius: 16px;
              font-size: 24px;
            }
            .hf_s5,
            .hf_s6 {
              display: none;
            }
          }
        `}</style>
      </main>
    );
  }

  return (
    <main style={page}>
      {/* Background creative layer */}
      <div className="hf_bg" aria-hidden="true">
        <div className="hf_wm">HomyFod</div>
        <div className="hf_glow hf_glowA" />
        <div className="hf_glow hf_glowB" />
        <div className="hf_glow hf_glowC" />
        <Sticker className="hf_s1">🍔</Sticker>
        <Sticker className="hf_s2">🥗</Sticker>
        <Sticker className="hf_s3">🍕</Sticker>
        <Sticker className="hf_s4">🥑</Sticker>
        <Sticker className="hf_s5">🍗</Sticker>
        <Sticker className="hf_s6">🧃</Sticker>
      </div>

      <div style={shell} className="hf_shell">
        {/* Desktop hero panel (mobile auto hides) */}
        <section style={hero} className="hf_hero">
          <div style={heroTop}>
            <div style={heroBrand}>
              <div style={heroLogo}>🍽️</div>
              <div>
                <h3 style={heroTitle}>HomyFod</h3>
                <div style={heroSub}>
                  Restaurants + Groceries in one place. <br />
                  Fast delivery. Smooth checkout.
                </div>
              </div>
            </div>
            <div style={heroBadge}>Pro • Secure • Verified</div>
          </div>

          <div style={heroBody}>
            <div style={heroLine}>
              👋 Welcome! Browse as guest anytime. <br />
              <span style={{ color: "rgba(15,23,42,0.72)", fontWeight: 850 }}>
                To place an order, sign in (password) or use email code.
              </span>
            </div>

            <div style={heroMiniRow} className="hf_heroMiniRow">
              <div style={heroMini}>
                <div style={heroMiniLeft}>
                  <div style={heroEmoji}>🍛</div>
                  <div style={heroMiniText}>
                    <div style={heroMiniTitle}>Restaurant Orders</div>
                    <div style={heroMiniSub}>Fresh meals • Live updates</div>
                  </div>
                </div>
                <div style={heroPill}>Hot</div>
              </div>

              <div style={heroMini}>
                <div style={heroMiniLeft}>
                  <div style={heroEmoji}>🛒</div>
                  <div style={heroMiniText}>
                    <div style={heroMiniTitle}>Grocery Delivery</div>
                    <div style={heroMiniSub}>Weekly essentials • Quick</div>
                  </div>
                </div>
                <div style={heroPill}>Fast</div>
              </div>

              <div style={heroMini}>
                <div style={heroMiniLeft}>
                  <div style={heroEmoji}>🔐</div>
                  <div style={heroMiniText}>
                    <div style={heroMiniTitle}>Verified Accounts</div>
                    <div style={heroMiniSub}>Email confirm + OTP option</div>
                  </div>
                </div>
                <div style={heroPill}>Secure</div>
              </div>
            </div>
          </div>

          {/* extra floating emojis inside hero */}
          <div className="hf_heroFloat hf_hf1" aria-hidden="true">
            🍩
          </div>
          <div className="hf_heroFloat hf_hf2" aria-hidden="true">
            🍓
          </div>
          <div className="hf_heroFloat hf_hf3" aria-hidden="true">
            🥙
          </div>
        </section>

        <div style={card}>
          {/* Subtle top shine inside card */}
          <div className="hf_cardShine" aria-hidden="true" />

          <div style={headerRow}>
            <div style={brand}>
              <div style={logo}>🍕</div>
              <div>
                <h2 style={title}>Welcome back</h2>
                <div style={subtitle}>Sign in to continue</div>
              </div>
            </div>

            {/* Toggle between Password login & Code login */}
            <div
              style={pill}
              onClick={() => {
                setErrMsg("");
                setInfoMsg("");
                setOtpMode((v) => !v);
                setOtpSent(false);
                setOtpCode("");
              }}
              title="Switch login method"
            >
              {otpMode ? "Password" : "Code"}
            </div>
          </div>

          {errMsg ? <div style={alertError}>{errMsg}</div> : null}
          {infoMsg ? <div style={alertInfo}>{infoMsg}</div> : null}

          {!otpMode ? (
            // ===========================
            // Password Login (existing)
            // ===========================
            <form onSubmit={handleLogin} style={form}>
              <div style={field}>
                <label style={label}>Email</label>
                <div style={inputWrap}>
                  <MailIcon />
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    style={input}
                  />
                </div>
              </div>

              <div style={field}>
                <label style={label}>Password</label>
                <div style={inputWrap}>
                  <LockIcon />
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    type={showPass ? "text" : "password"}
                    autoComplete="current-password"
                    style={passInput}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    style={eyeBtn}
                    aria-label={showPass ? "Hide password" : "Show password"}
                    title={showPass ? "Hide password" : "Show password"}
                  >
                    <EyeIcon off={showPass} />
                  </button>
                </div>

                <div style={rowBetween}>
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    disabled={resetLoading}
                    style={{
                      ...linkBtn,
                      opacity: resetLoading ? 0.7 : 1,
                      cursor: resetLoading ? "not-allowed" : "pointer",
                    }}
                  >
                    {resetLoading ? "Sending reset email…" : "Forgot password?"}
                  </button>

                  <button
                    type="button"
                    onClick={resendVerificationEmail}
                    disabled={resendLoading}
                    style={{
                      ...linkBtn,
                      opacity: resendLoading ? 0.7 : 1,
                      cursor: resendLoading ? "not-allowed" : "pointer",
                    }}
                    title="If you didn’t receive verification email"
                  >
                    {resendLoading ? "Resending…" : "Resend verification"}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                style={loading ? submitDisabled : submit}
              >
                {loading ? (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Spinner />
                    Signing in…
                  </span>
                ) : (
                  "Sign In"
                )}
              </button>

              <div style={footer}>
                Don’t have an account?{" "}
                <span onClick={() => router.push("/signup")} style={createLink}>
                  Create one
                </span>
              </div>
            </form>
          ) : (
            // ===========================
            // Email Code Login (OTP) — B
            // ===========================
            <form onSubmit={verifyLoginCode} style={form}>
              <div style={field}>
                <label style={label}>Email</label>
                <div style={inputWrap}>
                  <MailIcon />
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    style={input}
                  />
                </div>
              </div>

              {!otpSent ? (
                <button
                  type="button"
                  onClick={sendLoginCode}
                  disabled={otpLoading}
                  style={otpLoading ? submitDisabled : submit}
                >
                  {otpLoading ? (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Spinner />
                      Sending code…
                    </span>
                  ) : (
                    "Send code to email"
                  )}
                </button>
              ) : (
                <>
                  <div style={field}>
                    <label style={label}>Enter code</label>
                    <div style={inputWrap}>
                      <LockIcon />
                      <input
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value)}
                        placeholder="6-digit code"
                        autoComplete="one-time-code"
                        style={input}
                      />
                    </div>

                    <div style={rowBetween}>
                      <button
                        type="button"
                        onClick={sendLoginCode}
                        disabled={otpLoading}
                        style={{
                          ...linkBtn,
                          opacity: otpLoading ? 0.7 : 1,
                          cursor: otpLoading ? "not-allowed" : "pointer",
                        }}
                      >
                        {otpLoading ? "Resending…" : "Resend code"}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setOtpSent(false);
                          setOtpCode("");
                          setErrMsg("");
                          setInfoMsg("");
                        }}
                        style={linkBtn}
                      >
                        Change email
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={otpLoading}
                    style={otpLoading ? submitDisabled : submit}
                  >
                    {otpLoading ? (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Spinner />
                        Verifying…
                      </span>
                    ) : (
                      "Verify & Sign in"
                    )}
                  </button>
                </>
              )}

              <div style={footer}>
                Don’t have an account?{" "}
                <span onClick={() => router.push("/signup")} style={createLink}>
                  Create one
                </span>
              </div>
            </form>
          )}

          <div
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 16,
              border: "1px dashed rgba(0,0,0,0.12)",
              background: "rgba(255,255,255,0.55)",
              color: "rgba(15,23,42,0.72)",
              fontSize: 12,
              lineHeight: 1.45,
              textAlign: "center",
            }}
          >
            {otpMode ? (
              <>
                Code login is extra secure. <br />
                <span style={{ fontWeight: 900 }}>
                  We’ll email you a one-time code
                </span>
              </>
            ) : (
              <>
                By signing in you agree to our basic terms. <br />
                <span style={{ fontWeight: 900 }}>Fast • Secure • Smooth</span>
              </>
            )}
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes hf_float {
          0% {
            transform: translate3d(0, 0, 0) rotate(0deg);
          }
          50% {
            transform: translate3d(0, -14px, 0) rotate(2deg);
          }
          100% {
            transform: translate3d(0, 0, 0) rotate(0deg);
          }
        }
        @keyframes hf_shine {
          0% {
            opacity: 0.5;
            transform: translate3d(0, 0, 0) scale(1);
          }
          50% {
            opacity: 0.75;
            transform: translate3d(0, 0, 0) scale(1.05);
          }
          100% {
            opacity: 0.5;
            transform: translate3d(0, 0, 0) scale(1);
          }
        }
        @keyframes hf_slide {
          0% {
            transform: translate3d(-30%, -20%, 0) rotate(12deg);
          }
          50% {
            transform: translate3d(30%, 10%, 0) rotate(12deg);
          }
          100% {
            transform: translate3d(-30%, -20%, 0) rotate(12deg);
          }
        }
        @keyframes hf_bob {
          0% {
            transform: translate3d(0, 0, 0);
          }
          50% {
            transform: translate3d(0, -12px, 0);
          }
          100% {
            transform: translate3d(0, 0, 0);
          }
        }

        .hf_bg {
          position: absolute;
          inset: 0;
          overflow: hidden;
          pointer-events: none;
          z-index: 1;
        }
        .hf_wm {
          position: absolute;
          left: 50%;
          top: 52%;
          transform: translate(-50%, -50%);
          font-weight: 1000;
          letter-spacing: -2px;
          font-size: clamp(46px, 10vw, 110px);
          color: rgba(15, 23, 42, 0.06);
          text-shadow: 0 20px 60px rgba(0, 0, 0, 0.05);
          user-select: none;
          white-space: nowrap;
        }

        .hf_glow {
          position: absolute;
          width: 520px;
          height: 520px;
          border-radius: 999px;
          filter: blur(36px);
          opacity: 0.65;
          animation: hf_shine 6s ease-in-out infinite;
        }
        .hf_glowA {
          left: -180px;
          top: -220px;
          background: radial-gradient(
            circle at 30% 30%,
            rgba(255, 140, 0, 0.55),
            rgba(255, 140, 0, 0) 60%
          );
        }
        .hf_glowB {
          right: -220px;
          top: 8%;
          background: radial-gradient(
            circle at 30% 30%,
            rgba(80, 160, 255, 0.55),
            rgba(80, 160, 255, 0) 60%
          );
          animation-delay: -1.4s;
        }
        .hf_glowC {
          left: 20%;
          bottom: -240px;
          background: radial-gradient(
            circle at 30% 30%,
            rgba(0, 200, 120, 0.4),
            rgba(0, 200, 120, 0) 62%
          );
          animation-delay: -2.1s;
        }

        .hf_sticker {
          position: absolute;
          width: 74px;
          height: 74px;
          border-radius: 22px;
          background: rgba(255, 255, 255, 0.65);
          border: 1px solid rgba(255, 255, 255, 0.55);
          box-shadow: 0 18px 55px rgba(16, 24, 40, 0.12),
            0 2px 10px rgba(16, 24, 40, 0.06);
          backdrop-filter: blur(10px);
          display: grid;
          place-items: center;
          transform-style: preserve-3d;
          animation: hf_float 5.6s ease-in-out infinite;
        }
        .hf_stickerInner {
          width: 58px;
          height: 58px;
          border-radius: 18px;
          display: grid;
          place-items: center;
          background: linear-gradient(
            135deg,
            rgba(255, 140, 0, 0.1),
            rgba(80, 160, 255, 0.1)
          );
          border: 1px solid rgba(0, 0, 0, 0.06);
          font-size: 28px;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9);
          transform: translateZ(14px);
        }

        .hf_s1 {
          left: 6%;
          top: 14%;
          animation-delay: -0.6s;
        }
        .hf_s2 {
          left: 14%;
          bottom: 12%;
          animation-delay: -1.2s;
        }
        .hf_s3 {
          right: 10%;
          top: 18%;
          animation-delay: -1.8s;
        }
        .hf_s4 {
          right: 6%;
          bottom: 16%;
          animation-delay: -2.2s;
        }
        .hf_s5 {
          left: 42%;
          top: 8%;
          animation-delay: -2.8s;
        }
        .hf_s6 {
          right: 36%;
          bottom: 8%;
          animation-delay: -3.3s;
        }

        /* Card subtle shine */
        .hf_cardShine {
          position: absolute;
          left: -40%;
          top: -20%;
          width: 180%;
          height: 60%;
          background: linear-gradient(
            90deg,
            rgba(255, 255, 255, 0) 0%,
            rgba(255, 255, 255, 0.55) 50%,
            rgba(255, 255, 255, 0) 100%
          );
          transform: rotate(12deg);
          opacity: 0.45;
          animation: hf_slide 7.5s ease-in-out infinite;
          pointer-events: none;
        }

        /* Hero floating emojis */
        .hf_heroFloat {
          position: absolute;
          font-size: 26px;
          filter: drop-shadow(0 12px 22px rgba(0, 0, 0, 0.12));
          opacity: 0.9;
          animation: hf_bob 4.6s ease-in-out infinite;
          user-select: none;
          pointer-events: none;
        }
        .hf_hf1 {
          right: 18px;
          bottom: 18px;
          animation-delay: -0.6s;
        }
        .hf_hf2 {
          left: 18px;
          bottom: 22px;
          animation-delay: -1.2s;
        }
        .hf_hf3 {
          right: 26%;
          top: 18px;
          animation-delay: -1.8s;
        }

        /* Desktop layout: hero + card */
        @media (min-width: 980px) {
          .hf_shell {
            grid-template-columns: 1.05fr 0.95fr !important;
            align-items: start !important;
            gap: 16px !important;
          }
          .hf_hero {
            display: block !important;
          }
          .hf_heroMiniRow {
            grid-template-columns: 1fr !important;
          }
        }

        /* Mobile: hide hero panel for clean look */
        @media (max-width: 979px) {
          .hf_hero {
            display: none !important;
          }
        }

        @media (max-width: 720px) {
          .hf_wm {
            top: 46%;
          }
          .hf_sticker {
            width: 64px;
            height: 64px;
            border-radius: 20px;
          }
          .hf_stickerInner {
            width: 50px;
            height: 50px;
            border-radius: 16px;
            font-size: 24px;
          }
          .hf_s5,
          .hf_s6 {
            display: none;
          }
        }
      `}</style>
    </main>
  );
}