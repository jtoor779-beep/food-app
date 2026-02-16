"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import supabase from "@/lib/supabase";

/* =========================
   Helpers (safe)
   ========================= */

function passwordScore(pw) {
  const p = String(pw || "");
  let score = 0;
  if (p.length >= 8) score += 1;
  if (/[A-Z]/.test(p)) score += 1;
  if (/[a-z]/.test(p)) score += 1;
  if (/[0-9]/.test(p)) score += 1;
  if (/[^A-Za-z0-9]/.test(p)) score += 1;
  return score; // 0..5
}

function strengthLabel(score) {
  if (score <= 1) return "Weak";
  if (score === 2) return "Fair";
  if (score === 3) return "Good";
  if (score === 4) return "Strong";
  return "Very strong";
}

async function loadUserAgain(router, setEmail) {
  const { data } = await supabase.auth.getUser();
  const user = data?.user;
  if (!user) {
    router.push("/login");
    return;
  }
  setEmail(user.email || "");
}

/* =========================
   Page
   ========================= */

export default function SettingsPage() {
  const router = useRouter();

  // ✅ old work
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");

  const [newPass, setNewPass] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  // ✅ pro additions (safe)
  const [confirmPass, setConfirmPass] = useState("");
  const [showPass, setShowPass] = useState(false);

  // busy = buttons disabled while logout/update etc.
  const [busy, setBusy] = useState(false);

  // ✅ FIX: saving state exists now (used for input disabling, etc.)
  const [saving, setSaving] = useState(false);

  const [copied, setCopied] = useState(false);

  // Danger zone confirmations
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [confirmLogoutAll, setConfirmLogoutAll] = useState(false);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.auth.getUser();
      const user = data?.user;

      if (!user) {
        router.push("/login");
        return;
      }

      setEmail(user.email || "");
      setLoading(false);
    }

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ old work kept
  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  // ✅ pro: logout from all devices/sessions
  async function logoutAllDevices() {
    // Supabase supports scope: "global" in newer versions.
    // Fallback to normal signOut if not supported.
    try {
      // @ts-ignore
      await supabase.auth.signOut({ scope: "global" });
    } catch {
      await supabase.auth.signOut();
    }
    router.push("/login");
  }

  // ✅ old work kept, enhanced validation only
  async function changePassword() {
    setMsg("");
    setErr("");

    const p1 = String(newPass || "");
    const p2 = String(confirmPass || "");

    if (!p1 || p1.length < 6) {
      setErr("Password must be at least 6 characters.");
      return;
    }
    if (p1 !== p2) {
      setErr("Passwords do not match. Please confirm again.");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: p1 });
      if (error) throw error;

      setMsg("✅ Password updated successfully.");
      setNewPass("");
      setConfirmPass("");
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  async function copyEmail() {
    setCopied(false);
    try {
      await navigator.clipboard.writeText(email || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore
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
      maxWidth: 980,
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

    const inputWrap = {
      position: "relative",
      display: "flex",
      alignItems: "center",
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
      gap: 8,
      whiteSpace: "nowrap",
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
      background: "rgba(255,255,255,0.75)",
      cursor: "pointer",
      fontWeight: 950,
      color: "rgba(2,6,23,0.80)",
      whiteSpace: "nowrap",
    };

    const danger = {
      borderRadius: 22,
      border: "1px solid rgba(255, 90, 90, 0.28)",
      background: "rgba(255, 240, 240, 0.60)",
      padding: 16,
    };

    const dangerTitle = {
      fontSize: 13,
      fontWeight: 980,
      color: "rgba(120, 18, 18, 0.90)",
      letterSpacing: 0.2,
      marginBottom: 10,
    };

    const row = {
      display: "flex",
      gap: 10,
      flexWrap: "wrap",
      alignItems: "center",
      justifyContent: "space-between",
    };

    const small = {
      fontSize: 12,
      color: "rgba(15,23,42,0.66)",
      lineHeight: 1.45,
      marginTop: 8,
    };

    const strengthWrap = {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      marginTop: 8,
      flexWrap: "wrap",
    };

    const bars = {
      display: "flex",
      gap: 6,
      alignItems: "center",
    };

    const bar = (on) => ({
      width: 34,
      height: 8,
      borderRadius: 999,
      border: "1px solid rgba(15,23,42,0.08)",
      background: on ? "rgba(17,24,39,0.85)" : "rgba(17,24,39,0.12)",
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
      field,
      label,
      input,
      inputWrap,
      eyeBtn,
      btnPrimary,
      btnPrimaryDisabled,
      btnGhost,
      danger,
      dangerTitle,
      row,
      small,
      strengthWrap,
      bars,
      bar,
    };
  }, []);

  const score = passwordScore(newPass);
  const strength = strengthLabel(score);

  if (loading) {
    return (
      <main style={ui.page}>
        <div className="sf_blob sf_blobA" />
        <div className="sf_blob sf_blobB" />
        <div style={ui.container}>
          <div style={ui.card}>
            <div style={ui.sectionTitle}>Loading settings…</div>
            <div
              style={{
                height: 12,
                borderRadius: 999,
                background:
                  "linear-gradient(90deg, rgba(255,255,255,0.15), rgba(0,0,0,0.06), rgba(255,255,255,0.15))",
                backgroundSize: "200% 100%",
                animation: "sf_shimmer 1.6s linear infinite",
                marginBottom: 10,
                width: "74%",
              }}
            />
            <div
              style={{
                height: 12,
                borderRadius: 999,
                background:
                  "linear-gradient(90deg, rgba(255,255,255,0.15), rgba(0,0,0,0.06), rgba(255,255,255,0.15))",
                backgroundSize: "200% 100%",
                animation: "sf_shimmer 1.6s linear infinite",
                marginBottom: 0,
                width: "92%",
              }}
            />
          </div>
        </div>

        <style jsx global>{`
          @keyframes sf_float {
            0% { transform: translate3d(0,0,0) scale(1); }
            50% { transform: translate3d(0,-18px,0) scale(1.02); }
            100% { transform: translate3d(0,0,0) scale(1); }
          }
          @keyframes sf_shimmer {
            0% { background-position: 0% 50%; }
            100% { background-position: 200% 50%; }
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
            <h1 style={ui.h1}>Settings</h1>
            <div style={ui.sub}>Account settings</div>
          </div>
          <div style={ui.pill}>Secure • Account</div>
        </div>

        {err ? <div style={ui.alertErr}>{err}</div> : null}
        {msg ? <div style={ui.alertOk}>{msg}</div> : null}

        <div style={ui.grid} className="sf_settings_grid">
          {/* Account info */}
          <section style={ui.card}>
            <div style={ui.sectionTitle}>Account</div>

            <div style={ui.field}>
              <div style={ui.label}>Logged in as</div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ fontWeight: 980, color: "#0b1220" }}>{email}</div>
                <button type="button" style={ui.btnGhost} onClick={copyEmail}>
                  {copied ? "Copied ✅" : "Copy email"}
                </button>
              </div>
              <div style={ui.small}>
                If you changed email in Supabase, it may require verification depending on your project settings.
              </div>
            </div>

            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                style={busy ? ui.btnPrimaryDisabled : ui.btnPrimary}
                disabled={busy || saving}
                onClick={async () => {
                  setMsg("");
                  setErr("");
                  setBusy(true);
                  try {
                    await logout();
                  } catch (e) {
                    setErr(e?.message || String(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Logout
              </button>

              <button
                type="button"
                style={busy ? ui.btnPrimaryDisabled : ui.btnGhost}
                disabled={busy || saving}
                onClick={async () => {
                  setMsg("");
                  setErr("");
                  setBusy(true);
                  try {
                    await loadUserAgain(router, setEmail);
                    setMsg("✅ Session refreshed.");
                  } catch (e) {
                    setErr(e?.message || String(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Refresh session
              </button>
            </div>
          </section>

          {/* Security */}
          <section style={ui.card}>
            <div style={ui.sectionTitle}>Security</div>

            <div style={ui.field}>
              <div style={ui.label}>Change password</div>

              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 950, color: "rgba(2,6,23,0.70)", marginBottom: 6 }}>
                  New password
                </div>

                <div style={ui.inputWrap}>
                  <input
                    value={newPass}
                    onChange={(e) => setNewPass(e.target.value)}
                    placeholder="New password (min 6 chars)"
                    type={showPass ? "text" : "password"}
                    style={ui.input}
                    disabled={busy || saving}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    style={ui.eyeBtn}
                    aria-label={showPass ? "Hide password" : "Show password"}
                    title={showPass ? "Hide password" : "Show password"}
                  >
                    {showPass ? "🙈" : "👁️"}
                  </button>
                </div>

                <div style={ui.strengthWrap}>
                  <div style={ui.bars}>
                    <span style={ui.bar(score >= 1)} />
                    <span style={ui.bar(score >= 2)} />
                    <span style={ui.bar(score >= 3)} />
                    <span style={ui.bar(score >= 4)} />
                    <span style={ui.bar(score >= 5)} />
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 950, color: "rgba(15,23,42,0.72)" }}>
                    Strength: {strength}
                  </div>
                </div>

                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 950, color: "rgba(2,6,23,0.70)", marginBottom: 6 }}>
                    Confirm password
                  </div>
                  <input
                    value={confirmPass}
                    onChange={(e) => setConfirmPass(e.target.value)}
                    placeholder="Re-type new password"
                    type={showPass ? "text" : "password"}
                    style={ui.input}
                    disabled={busy || saving}
                  />
                </div>

                <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={changePassword}
                    disabled={busy || saving}
                    style={busy || saving ? ui.btnPrimaryDisabled : ui.btnPrimary}
                  >
                    {saving ? "Updating…" : "Update Password"}
                  </button>

                  <button
                    type="button"
                    disabled={busy || saving}
                    style={ui.btnGhost}
                    onClick={() => {
                      setErr("");
                      setMsg("");
                      setNewPass("");
                      setConfirmPass("");
                      setMsg("✅ Cleared password fields.");
                    }}
                  >
                    Clear
                  </button>
                </div>

                <div style={ui.small}>
                  Tip: Use at least 8+ characters with numbers and symbols for better security.
                </div>
              </div>
            </div>

            {/* Danger Zone */}
            <div style={{ marginTop: 12, ...ui.danger }}>
              <div style={ui.dangerTitle}>Danger zone</div>

              <div style={ui.row}>
                <div style={{ minWidth: 240 }}>
                  <div style={{ fontWeight: 980, color: "rgba(120,18,18,0.90)" }}>
                    Logout
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(120,18,18,0.75)", marginTop: 2 }}>
                    Signs you out on this device.
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {!confirmLogout ? (
                    <button
                      type="button"
                      style={ui.btnGhost}
                      disabled={busy || saving}
                      onClick={() => {
                        setConfirmLogout(true);
                        setTimeout(() => setConfirmLogout(false), 3000);
                      }}
                    >
                      Confirm
                    </button>
                  ) : (
                    <button
                      type="button"
                      style={ui.btnPrimary}
                      disabled={busy || saving}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await logout();
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Logout now
                    </button>
                  )}
                </div>
              </div>

              <div style={{ height: 10 }} />

              <div style={ui.row}>
                <div style={{ minWidth: 240 }}>
                  <div style={{ fontWeight: 980, color: "rgba(120,18,18,0.90)" }}>
                    Logout all devices
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(120,18,18,0.75)", marginTop: 2 }}>
                    Signs you out everywhere (all sessions).
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {!confirmLogoutAll ? (
                    <button
                      type="button"
                      style={ui.btnGhost}
                      disabled={busy || saving}
                      onClick={() => {
                        setConfirmLogoutAll(true);
                        setTimeout(() => setConfirmLogoutAll(false), 3000);
                      }}
                    >
                      Confirm
                    </button>
                  ) : (
                    <button
                      type="button"
                      style={ui.btnPrimary}
                      disabled={busy || saving}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await logoutAllDevices();
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Logout everywhere
                    </button>
                  )}
                </div>
              </div>
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
        @keyframes sf_shimmer {
          0% { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
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
          .sf_settings_grid {
            grid-template-columns: 0.9fr 1.1fr !important;
            gap: 14px !important;
          }
        }
      `}</style>
    </main>
  );
}
