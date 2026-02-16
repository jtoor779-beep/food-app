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

  // ✅ NEW: Delivery Partner redirect
  if (role === "delivery_partner") {
    router.push("/delivery");
    return;
  }

  // default customer (or unknown) -> Home
  router.push("/");
}

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [errMsg, setErrMsg] = useState("");
  const [infoMsg, setInfoMsg] = useState("");

  // ✅ NEW (UI only): show/hide password
  const [showPass, setShowPass] = useState(false);

  // ✅ NEW (feature): forgot password loading
  const [resetLoading, setResetLoading] = useState(false);

  // ✅ If already logged in, redirect to correct home
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const { data } = await supabase.auth.getSession();
        if (!cancelled && data?.session?.user) {
          await getRoleAndRedirect(router);
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

      setInfoMsg("✅ Logged in successfully. Redirecting...");
      await getRoleAndRedirect(router);
      router.refresh();
    } catch (e) {
      setErrMsg(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  // ✅ NEW: Forgot password (safe add-on)
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
      // This sends a reset email. If you later create /reset-password page, it can handle update password flow.
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

  /* =========================
     PRO UI (inline only)
     ========================= */

  const page = {
    minHeight: "calc(100vh - 64px)",
    padding: 18,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background:
      "radial-gradient(1200px 600px at 20% 10%, rgba(255,140,0,0.25), transparent 60%), radial-gradient(900px 520px at 80% 18%, rgba(80,160,255,0.22), transparent 58%), radial-gradient(900px 520px at 70% 90%, rgba(0,200,120,0.16), transparent 60%), linear-gradient(180deg, #f7f8fb, #eef1f7)",
  };

  const shell = {
    width: "100%",
    maxWidth: 980,
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 18,
    alignItems: "stretch",
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
  };

  const headerRow = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 10,
  };

  const brand = {
    display: "flex",
    alignItems: "center",
    gap: 10,
  };

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

  const subtitle = {
    marginTop: 2,
    fontSize: 13,
    color: "rgba(15,23,42,0.70)",
  };

  const pill = {
    fontSize: 12,
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "rgba(255,255,255,0.65)",
    color: "rgba(15,23,42,0.75)",
    fontWeight: 800,
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

  const field = {
    marginBottom: 12,
  };

  const label = {
    display: "block",
    fontWeight: 950,
    marginBottom: 7,
    fontSize: 13,
    color: "rgba(2,6,23,0.86)",
  };

  const inputWrap = {
    position: "relative",
    display: "flex",
    alignItems: "center",
  };

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

  const passInput = {
    ...input,
    paddingRight: 44,
  };

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

  const submitDisabled = {
    ...submit,
    opacity: 0.75,
    cursor: "not-allowed",
  };

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
      <svg
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        style={iconLeft}
      >
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
      <svg
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        style={iconLeft}
      >
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

  if (checkingSession) {
    return (
      <main style={page}>
        <div style={{ ...card, maxWidth: 520 }}>
          <div style={headerRow}>
            <div style={brand}>
              <div style={logo}>🍔</div>
              <div>
                <div style={title}>Food App</div>
                <div style={subtitle}>Preparing your session…</div>
              </div>
            </div>
            <div style={pill}>Secure</div>
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
      </main>
    );
  }

  return (
    <main style={page}>
      <div style={shell}>
        <div style={card}>
          <div style={headerRow}>
            <div style={brand}>
              <div style={logo}>🍕</div>
              <div>
                <h2 style={title}>Welcome back</h2>
                <div style={subtitle}>Sign in to continue</div>
              </div>
            </div>
            <div style={pill}>Login</div>
          </div>

          {errMsg ? <div style={alertError}>{errMsg}</div> : null}
          {infoMsg ? <div style={alertInfo}>{infoMsg}</div> : null}

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

                <div style={{ fontSize: 12, color: "rgba(15,23,42,0.60)" }}>
                  Tip: use the same email you signed up with
                </div>
              </div>
            </div>

            <button type="submit" disabled={loading} style={loading ? submitDisabled : submit}>
              {loading ? (
                <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
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
            By signing in you agree to our basic terms. <br />
            <span style={{ fontWeight: 900 }}>Fast • Secure • Smooth</span>
          </div>
        </div>
      </div>
    </main>
  );
}
