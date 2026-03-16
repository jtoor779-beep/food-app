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

async function ensureProfileForUser(user) {
  if (!user?.id) return null;

  const { data: prof, error: profErr } = await supabase
    .from("profiles")
    .select("user_id, role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profErr) throw profErr;
  if (prof?.user_id) return prof;

  const fallbackName = String(user?.user_metadata?.full_name || user?.email || "")
    .split("@")[0]
    .trim();
  const fallbackRole = normalizeRole(user?.user_metadata?.role || "customer") || "customer";

  const payload = {
    user_id: user.id,
    role: fallbackRole,
    full_name: fallbackName || "User",
    phone: String(user?.user_metadata?.phone || "").trim() || null,
    country: String(user?.user_metadata?.country || "").trim() || null,
  };

  const { error: upsertErr } = await supabase.from("profiles").upsert(payload, { onConflict: "user_id" });
  if (upsertErr) throw upsertErr;

  return { user_id: user.id, role: fallbackRole };
}

async function getRoleAndRedirect(router) {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw userErr;

  const user = userData?.user;
  if (!user) return;

  const prof = await ensureProfileForUser(user);

  const role = normalizeRole(prof?.role);

  if (role === "restaurant_owner") {
    router.push("/restaurants/orders");
    return;
  }
  if (role === "admin") {
    router.push("/admin/orders");
    return;
  }
  if (role === "grocery_owner") {
    router.push("/groceries/owner/dashboard");
    return;
  }
  if (role === "delivery_partner") {
    router.push("/delivery");
    return;
  }

  router.push("/");
}

function isEmailConfirmed(user) {
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

  const [showPass, setShowPass] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const [otpMode, setOtpMode] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);

  const [resendLoading, setResendLoading] = useState(false);

  // ✅ OPTIONAL: Put your real images here (URL or /public path)
  // Example:
  // const HERO_PHOTO = "/images/login-hero.jpg";
  // const PARTNER_PHOTO = "/images/partner.jpg";
  const HERO_PHOTO = ""; // <-- add later
  const PARTNER_PHOTO = ""; // <-- add later

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const { data } = await supabase.auth.getSession();
        if (!cancelled && data?.session?.user) {
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

      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;

      if (!user) {
        setErrMsg("Login failed. Please try again.");
        return;
      }

      if (!isEmailConfirmed(user)) {
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

  async function resendVerificationEmail() {
    setErrMsg("");
    setInfoMsg("");

    const em = email.trim();
    if (!em) {
      setErrMsg("Enter your email first, then click 'Resend verification'.");
      return;
    }

    setResendLoading(true);
    try {
      const emailRedirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/auth/callback`
          : undefined;

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

  function goBecome(role) {
    router.push(`/signup?role=${encodeURIComponent(role)}`);
  }
  function goGetApp() {
    router.push("/");
  }
  const emailValid = /\S+@\S+\.\S+/.test(String(email || "").trim());
  const passValid = String(password || "").trim().length >= 8;
  const otpValid = String(otpCode || "").trim().length >= 6;

  function FieldState({ status, withEye = false }) {
    if (status === "neutral") return null;
    return (
      <span
        className={`hf_stateIcon ${withEye ? "hf_stateIconEye" : ""} ${
          status === "valid" ? "hf_stateValid" : "hf_stateInvalid"
        }`}
        aria-hidden="true"
      >
        {status === "valid" ? "OK" : "!"}
      </span>
    );
  }

  function SpinnerDark() {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <circle
          cx="12"
          cy="12"
          r="9"
          stroke="rgba(255,255,255,0.35)"
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

  function ArrowIcon() {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M9 18l6-6-6-6"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  function SocialIcon({ type }) {
    if (type === "x") {
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M18.8 3H21l-6.7 7.7L22 21h-6.4l-5-6-5.2 6H3.2l7.2-8.3L2 3h6.6l4.5 5.2L18.8 3Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      );
    }
    if (type === "ig") {
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M7.5 3.8h9A3.7 3.7 0 0 1 20.2 7.5v9a3.7 3.7 0 0 1-3.7 3.7h-9A3.7 3.7 0 0 1 3.8 16.5v-9A3.7 3.7 0 0 1 7.5 3.8Z"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="M12 16.2a4.2 4.2 0 1 0 0-8.4 4.2 4.2 0 0 0 0 8.4Z"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="M17.2 6.8h.01"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      );
    }
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M14 8.5V7.2c0-1 .8-1.7 1.8-1.7H18V2.5h-2.6C12.9 2.5 11 4.4 11 6.9v1.6H8.7v3H11V21h3v-9.5h2.4l.4-3H14Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  function WaveSvg({ className }) {
    return (
      <svg
        className={className}
        viewBox="0 0 1200 120"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d="M0,72 C120,96 240,112 360,100 C480,88 600,48 720,44 C840,40 960,72 1080,84 C1140,90 1170,88 1200,84 L1200,120 L0,120 Z"
          fill="currentColor"
        />
      </svg>
    );
  }

  function PhoneMock() {
    return (
      <div className="hf_phoneWrap" aria-hidden="true">
        <div className="hf_phone">
          <div className="hf_phoneTop">
            <div className="hf_notch" />
          </div>
          <div className="hf_phoneScreen">
            <div className="hf_phoneHeader">
              <div className="hf_phoneLogo">🍔</div>
              <div className="hf_phoneBrand">
                <div className="hf_phoneName">HomyFod</div>
                <div className="hf_phoneTag">Fast • Grocery • Food</div>
              </div>
            </div>

            <div className="hf_phoneCard">
              <div className="hf_phoneCardRow">
                <div className="hf_bubble">🔥</div>
                <div className="hf_phoneCardText">
                  <div className="hf_phoneCardTitle">Trending near you</div>
                  <div className="hf_phoneCardSub">Fresh deals • live orders</div>
                </div>
              </div>
              <div className="hf_phoneBtn">Order now</div>
            </div>

            <div className="hf_phoneMiniGrid">
              <div className="hf_phoneMini">
                <div className="hf_mi">🍕</div>
                <div className="hf_mt">
                  <div className="hf_mtt">Restaurants</div>
                  <div className="hf_mts">Hot & fast</div>
                </div>
              </div>
              <div className="hf_phoneMini">
                <div className="hf_mi">🛒</div>
                <div className="hf_mt">
                  <div className="hf_mtt">Groceries</div>
                  <div className="hf_mts">Essentials</div>
                </div>
              </div>
            </div>

            <div className="hf_phoneGlow" />
          </div>
        </div>
      </div>
    );
  }

  if (checkingSession) {
    return (
      <main className="hf_page">
        <section className="hf_hero">
          <div className="hf_heroDecor hf_dLeft" aria-hidden="true" />
          <div className="hf_heroDecor hf_dRight" aria-hidden="true" />
          <WaveSvg className="hf_wave hf_wave1" />
          <WaveSvg className="hf_wave hf_wave2" />
          <div className="hf_heroInner">
            <div className="hf_authCard hf_reveal hf_r2">
              <div className="hf_authTop">
                <div className="hf_brand">
                  <div className="hf_brandLogo">🍔</div>
                  <div>
                    <div className="hf_brandName">HomyFod</div>
                    <div className="hf_brandSub">Preparing your session…</div>
                  </div>
                </div>
                <div className="hf_pillStatic">Secure</div>
              </div>

              <div className="hf_notice">
                <span className="hf_dot" />
                Checking session…
              </div>
            </div>
          </div>
        </section>

        <style jsx global>{heroCss}</style>
      </main>
    );
  }

  return (
    <main className="hf_page">
      <section className="hf_hero">
        {/* Real photo overlay (optional) */}
        {HERO_PHOTO ? (
          <div className="hf_photoLayer" aria-hidden="true">
            <img src={HERO_PHOTO} alt="" className="hf_photoImg" />
            <div className="hf_photoShade" />
          </div>
        ) : null}

        <div className="hf_heroDecor hf_dLeft" aria-hidden="true" />
        <div className="hf_heroDecor hf_dRight" aria-hidden="true" />
        <div className="hf_heroFood hf_fLeft" aria-hidden="true">
          🥡
        </div>
        <div className="hf_heroFood hf_fRight" aria-hidden="true">
          🍟
        </div>

        <WaveSvg className="hf_wave hf_wave1" />
        <WaveSvg className="hf_wave hf_wave2" />
        <WaveSvg className="hf_wave hf_wave3" />

        <div className="hf_heroInner">
          <div className="hf_leftColumn">
            <div className="hf_heroTitleBlock hf_reveal hf_r1">
              <div className="hf_heroBrand">HomyFod</div>
              <h1 className="hf_heroTitle">Sign in to order fast</h1>
              <p className="hf_heroSubtitle">
                Restaurants + Groceries • Live updates • Smooth checkout
              </p>
              <div className="hf_socialProof hf_reveal hf_r2">
                <div className="hf_statItem">
                  <div className="hf_statValue">4.9</div>
                  <div className="hf_statLabel">App rating</div>
                </div>
                <div className="hf_statItem">
                  <div className="hf_statValue">120k+</div>
                  <div className="hf_statLabel">Happy users</div>
                </div>
                <div className="hf_statItem">
                  <div className="hf_statValue">28 min</div>
                  <div className="hf_statLabel">Avg delivery</div>
                </div>
              </div>
            </div>

            <div className="hf_reveal hf_r3"><PhoneMock /></div>
          </div>

          <div className="hf_authCard hf_reveal hf_r2">
            <div className="hf_authTop">
              <div className="hf_brand">
                <div className="hf_brandLogo">🍕</div>
                <div>
                  <div className="hf_brandName">Welcome back</div>
                  <div className="hf_brandSub">Sign in to continue</div>
                </div>
              </div>

              <button
                className="hf_modePill"
                onClick={() => {
                  setErrMsg("");
                  setInfoMsg("");
                  setOtpMode((v) => !v);
                  setOtpSent(false);
                  setOtpCode("");
                }}
                type="button"
                title="Switch login method"
              >
                {otpMode ? "Password" : "Code"}
              </button>
            </div>

            {errMsg ? <div className="hf_alert hf_error">{errMsg}</div> : null}
            {infoMsg ? <div className="hf_alert hf_info">{infoMsg}</div> : null}

            {!otpMode ? (
              <form onSubmit={handleLogin} className="hf_form">
                <label className="hf_label">Email</label>
                <div className={`hf_inputWrap ${email ? (emailValid ? "hf_valid" : "hf_invalid") : ""}`}>
                  <span className="hf_icon">✉️</span>
                  <input
                    className="hf_input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                  <FieldState status={email ? (emailValid ? "valid" : "invalid") : "neutral"} />
                </div>

                <label className="hf_label" style={{ marginTop: 10 }}>
                  Password
                </label>
                <div className={`hf_inputWrap ${password ? (passValid ? "hf_valid" : "hf_invalid") : ""}`}>
                  <span className="hf_icon">🔒</span>
                  <input
                    className="hf_input hf_inputPass"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    type={showPass ? "text" : "password"}
                    autoComplete="current-password"
                  />
                  <FieldState status={password ? (passValid ? "valid" : "invalid") : "neutral"} withEye />
                  <button
                    type="button"
                    className="hf_eye"
                    onClick={() => setShowPass((v) => !v)}
                    aria-label={showPass ? "Hide password" : "Show password"}
                  >
                    {showPass ? "🙈" : "👁️"}
                  </button>
                </div>

                <div className="hf_linksRow">
                  <button
                    type="button"
                    className="hf_link"
                    onClick={handleForgotPassword}
                    disabled={resetLoading}
                  >
                    {resetLoading ? "Sending reset…" : "Forgot password?"}
                  </button>

                  <button
                    type="button"
                    className="hf_link"
                    onClick={resendVerificationEmail}
                    disabled={resendLoading}
                    title="If you didn’t receive verification email"
                  >
                    {resendLoading ? "Resending…" : "Resend verification"}
                  </button>
                </div>

                <button className="hf_btnPrimary" type="submit" disabled={loading}>
                  {loading ? (
                    <span className="hf_btnSpin">
                      <SpinnerDark /> Signing in…
                    </span>
                  ) : (
                    "Sign In"
                  )}
                </button>

                <div className="hf_footer">
                  Don’t have an account?{" "}
                  <span className="hf_footerLink" onClick={() => router.push("/signup")}>
                    Create one
                  </span>
                </div>
              </form>
            ) : (
              <form onSubmit={verifyLoginCode} className="hf_form">
                <label className="hf_label">Email</label>
                <div className={`hf_inputWrap ${email ? (emailValid ? "hf_valid" : "hf_invalid") : ""}`}>
                  <span className="hf_icon">✉️</span>
                  <input
                    className="hf_input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                  <FieldState status={email ? (emailValid ? "valid" : "invalid") : "neutral"} />
                </div>

                {!otpSent ? (
                  <button
                    className="hf_btnPrimary"
                    type="button"
                    onClick={sendLoginCode}
                    disabled={otpLoading}
                    style={{ marginTop: 12 }}
                  >
                    {otpLoading ? (
                      <span className="hf_btnSpin">
                        <SpinnerDark /> Sending code…
                      </span>
                    ) : (
                      "Send code to email"
                    )}
                  </button>
                ) : (
                  <>
                    <label className="hf_label" style={{ marginTop: 12 }}>
                      Enter code
                    </label>
                    <div className={`hf_inputWrap ${otpCode ? (otpValid ? "hf_valid" : "hf_invalid") : ""}`}>
                      <span className="hf_icon">🔑</span>
                      <input
                        className="hf_input"
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value)}
                        placeholder="6-digit code"
                        autoComplete="one-time-code"
                      />
                      <FieldState status={otpCode ? (otpValid ? "valid" : "invalid") : "neutral"} />
                    </div>

                    <div className="hf_linksRow">
                      <button
                        type="button"
                        className="hf_link"
                        onClick={sendLoginCode}
                        disabled={otpLoading}
                      >
                        {otpLoading ? "Resending…" : "Resend code"}
                      </button>

                      <button
                        type="button"
                        className="hf_link"
                        onClick={() => {
                          setOtpSent(false);
                          setOtpCode("");
                          setErrMsg("");
                          setInfoMsg("");
                        }}
                      >
                        Change email
                      </button>
                    </div>

                    <button className="hf_btnPrimary" type="submit" disabled={otpLoading}>
                      {otpLoading ? (
                        <span className="hf_btnSpin">
                          <SpinnerDark /> Verifying…
                        </span>
                      ) : (
                        "Verify & Sign in"
                      )}
                    </button>
                  </>
                )}

                <div className="hf_footer">
                  Don’t have an account?{" "}
                  <span className="hf_footerLink" onClick={() => router.push("/signup")}>
                    Create one
                  </span>
                </div>
              </form>
            )}

            <div className="hf_trustRow">
              <span className="hf_trustChip">Secure checkout</span>
              <span className="hf_trustChip">Live order tracking</span>
              <span className="hf_trustChip">24x7 support</span>
            </div>

            <div className="hf_terms">
              {otpMode ? (
                <>
                  Code login is extra secure. <b>We’ll email you a one-time code</b>.
                </>
              ) : (
                <>
                  By signing in you agree to our basic terms. <b>Fast • Secure • Smooth</b>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="hf_joinWrap">
        {/* Real partner photo (optional) */}
        {PARTNER_PHOTO ? (
          <div className="hf_partnerPhoto" aria-hidden="true">
            <img src={PARTNER_PHOTO} alt="" className="hf_partnerImg" />
            <div className="hf_partnerShade" />
          </div>
        ) : null}

        <div className="hf_joinBg" aria-hidden="true">
          <WaveSvg className="hf_joinWave hf_joinWave1" />
          <WaveSvg className="hf_joinWave hf_joinWave2" />
        </div>

        <div className="hf_joinGrid">
          <div className="hf_joinCard hf_reveal hf_r1">
            <div className="hf_joinIcon">🛵</div>
            <div className="hf_joinTitle">Become a Delivery Partner</div>
            <div className="hf_joinDesc">
              Deliver orders, earn money and work on your schedule. Sign up in minutes.
            </div>
            <button className="hf_joinLink" onClick={() => goBecome("delivery_partner")}>
              Start earning <span className="hf_joinArrow"><ArrowIcon /></span>
            </button>
          </div>

          <div className="hf_joinCard hf_reveal hf_r2">
            <div className="hf_joinIcon">🏪</div>
            <div className="hf_joinTitle">Become a Merchant</div>
            <div className="hf_joinDesc">
              Attract new customers and grow sales with online orders.
            </div>
            <button className="hf_joinLink" onClick={() => goBecome("restaurant_owner")}>
              Partner up <span className="hf_joinArrow"><ArrowIcon /></span>
            </button>
          </div>

        </div>
      </section>


      <style jsx global>{heroCss}</style>
    </main>
  );
}

const heroCss = `
  .hf_page{
    min-height: calc(100vh - 64px);
    background: #ffffff;
  }

  .hf_hero{
    position: relative;
    overflow: hidden;
    padding: 34px 18px 40px;
    background:
      radial-gradient(1200px 600px at 18% 30%, rgba(255,255,255,0.16), rgba(255,255,255,0) 60%),
      radial-gradient(900px 520px at 82% 24%, rgba(255,255,255,0.14), rgba(255,255,255,0) 62%),
      radial-gradient(700px 420px at 60% 68%, rgba(255, 214, 10, 0.10), rgba(255, 214, 10, 0) 62%),
      linear-gradient(180deg, #ff5a5f, #ff2d55);
    border-bottom: 1px solid rgba(0,0,0,0.08);
  }

  /* ✅ OPTIONAL PHOTO layer */
  .hf_photoLayer{
    position:absolute;
    inset:0;
    z-index: 0;
    pointer-events:none;
  }
  .hf_photoImg{
    width:100%;
    height:100%;
    object-fit: cover;
    filter: saturate(1.05) contrast(1.05);
    transform: scale(1.02);
  }
  .hf_photoShade{
    position:absolute;
    inset:0;
    background:
      radial-gradient(900px 520px at 20% 30%, rgba(255,90,95,0.35), rgba(255,90,95,0) 65%),
      linear-gradient(180deg, rgba(255,90,95,0.55), rgba(255,45,85,0.70));
    mix-blend-mode: multiply;
  }

  .hf_heroDecor{
    position:absolute;
    width: 560px;
    height: 560px;
    border-radius: 999px;
    filter: blur(38px);
    opacity: 0.55;
    pointer-events: none;
    z-index: 1;
  }
  .hf_dLeft{
    left: -260px;
    top: -260px;
    background: radial-gradient(circle at 30% 30%, rgba(255,214,10,0.55), rgba(255,214,10,0) 62%);
  }
  .hf_dRight{
    right: -300px;
    top: -260px;
    background: radial-gradient(circle at 30% 30%, rgba(255,255,255,0.40), rgba(255,255,255,0) 62%);
  }

  .hf_heroFood{
    position:absolute;
    width: 92px;
    height: 92px;
    border-radius: 24px;
    display:grid;
    place-items:center;
    background: rgba(255,255,255,0.16);
    border: 1px solid rgba(255,255,255,0.20);
    box-shadow: 0 22px 60px rgba(0,0,0,0.25);
    backdrop-filter: blur(10px);
    font-size: 36px;
    pointer-events:none;
    z-index: 2;
  }
  .hf_fLeft{ left: 22px; top: 22px; transform: rotate(-10deg); }
  .hf_fRight{ right: 22px; top: 22px; transform: rotate(10deg); }

  @keyframes hf_waveMove1 { 0%{ transform: translateX(0); } 100%{ transform: translateX(-18%); } }
  @keyframes hf_waveMove2 { 0%{ transform: translateX(0); } 100%{ transform: translateX(-28%); } }
  @keyframes hf_waveMove3 { 0%{ transform: translateX(0); } 100%{ transform: translateX(-22%); } }

  .hf_wave{
    position:absolute;
    left: -10%;
    bottom: -2px;
    width: 120%;
    height: 140px;
    color: rgba(255,255,255,0.18);
    pointer-events:none;
    z-index: 1;
  }
  .hf_wave1{
    height: 160px;
    color: rgba(255,255,255,0.22);
    animation: hf_waveMove1 9.5s linear infinite;
  }
  .hf_wave2{
    height: 140px;
    bottom: 10px;
    color: rgba(255,255,255,0.16);
    animation: hf_waveMove2 12.5s linear infinite;
  }
  .hf_wave3{
    height: 110px;
    bottom: 22px;
    color: rgba(255,255,255,0.12);
    animation: hf_waveMove3 10.8s linear infinite;
  }

  .hf_heroInner{
    max-width: 1120px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: 1fr;
    gap: 16px;
    align-items: center;
    position: relative;
    z-index: 3;
  }

  .hf_leftColumn{
    display:flex;
    flex-direction: column;
    gap: 16px;
    align-items: center;
  }

  .hf_heroTitleBlock{
    color:#fff;
    text-align: center;
    padding: 6px 8px 0;
  }
  .hf_heroBrand{
    font-weight: 900;
    letter-spacing: 0.3px;
    text-transform: uppercase;
    opacity: 0.95;
    font-size: 12px;
  }
  .hf_heroTitle{
    margin: 6px 0 0;
    font-weight: 1000;
    letter-spacing: -1px;
    font-size: clamp(30px, 4.3vw, 52px);
    line-height: 1.05;
  }
  .hf_heroSubtitle{
    margin: 10px auto 0;
    max-width: 720px;
    opacity: 0.94;
    font-weight: 800;
    font-size: 15px;
    line-height: 1.45;
  }

  .hf_socialProof{
    margin-top: 16px;
    display: grid;
    grid-template-columns: repeat(3, minmax(110px, 1fr));
    gap: 10px;
    width: 100%;
    max-width: 560px;
  }
  .hf_statItem{
    border-radius: 14px;
    border: 1px solid rgba(255,255,255,0.25);
    background: rgba(255,255,255,0.12);
    backdrop-filter: blur(8px);
    padding: 10px 12px;
  }
  .hf_statValue{
    color: #fff;
    font-size: 18px;
    font-weight: 1000;
    letter-spacing: -0.3px;
    line-height: 1.05;
  }
  .hf_statLabel{
    margin-top: 3px;
    color: rgba(255,255,255,0.92);
    font-size: 11px;
    font-weight: 800;
  }

  .hf_phoneWrap{
    width: 100%;
    max-width: 520px;
    display:none;
    justify-content: center;
  }
  .hf_phone{
    width: 310px;
    height: 520px;
    border-radius: 42px;
    background: linear-gradient(180deg, rgba(255,255,255,0.25), rgba(255,255,255,0.12));
    border: 1px solid rgba(255,255,255,0.22);
    box-shadow: 0 30px 90px rgba(0,0,0,0.30);
    position: relative;
    overflow: hidden;
    backdrop-filter: blur(12px);
    transform: rotate(-6deg);
  }
  .hf_phoneTop{
    height: 56px;
    display:flex;
    justify-content:center;
    align-items:flex-end;
    padding-bottom: 10px;
  }
  .hf_notch{
    width: 120px;
    height: 18px;
    border-radius: 999px;
    background: rgba(0,0,0,0.35);
  }
  .hf_phoneScreen{
    position:absolute;
    inset: 18px;
    top: 52px;
    border-radius: 30px;
    background:
      radial-gradient(420px 240px at 35% 20%, rgba(255,214,10,0.30), rgba(255,214,10,0) 60%),
      radial-gradient(420px 240px at 80% 30%, rgba(255,255,255,0.18), rgba(255,255,255,0) 60%),
      linear-gradient(180deg, rgba(12,18,32,0.92), rgba(17,24,39,0.96));
    border: 1px solid rgba(255,255,255,0.10);
    overflow:hidden;
    padding: 14px;
  }
  .hf_phoneHeader{
    display:flex;
    align-items:center;
    gap: 10px;
    color:#fff;
  }
  .hf_phoneLogo{
    width: 44px;
    height: 44px;
    border-radius: 16px;
    display:grid;
    place-items:center;
    background: rgba(255,255,255,0.10);
    border: 1px solid rgba(255,255,255,0.10);
    box-shadow: 0 16px 40px rgba(0,0,0,0.25);
    font-size: 20px;
  }
  .hf_phoneName{ font-weight: 1000; letter-spacing: -0.3px; }
  .hf_phoneTag{ margin-top: 2px; font-size: 12px; opacity: 0.85; font-weight: 850; }

  .hf_phoneCard{
    margin-top: 14px;
    border-radius: 18px;
    background: rgba(255,255,255,0.10);
    border: 1px solid rgba(255,255,255,0.10);
    padding: 12px;
  }
  .hf_phoneCardRow{
    display:flex;
    align-items:center;
    gap: 10px;
    color:#fff;
  }
  .hf_bubble{
    width: 44px;
    height: 44px;
    border-radius: 16px;
    display:grid;
    place-items:center;
    background: rgba(255,90,95,0.22);
    border: 1px solid rgba(255,255,255,0.10);
    font-size: 18px;
  }
  .hf_phoneCardTitle{ font-weight: 1000; letter-spacing: -0.2px; }
  .hf_phoneCardSub{ margin-top: 2px; font-size: 12px; opacity: 0.85; font-weight: 850; }

  .hf_phoneBtn{
    margin-top: 12px;
    width: 100%;
    border-radius: 14px;
    padding: 10px 12px;
    background: linear-gradient(180deg, #ff5a5f, #ff2d55);
    color:#fff;
    font-weight: 1000;
    text-align:center;
    box-shadow: 0 18px 45px rgba(0,0,0,0.22);
  }

  .hf_phoneMiniGrid{
    margin-top: 14px;
    display:grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .hf_phoneMini{
    border-radius: 16px;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.10);
    padding: 10px;
    display:flex;
    gap: 10px;
    color:#fff;
    align-items:center;
  }
  .hf_mi{
    width: 40px;
    height: 40px;
    border-radius: 14px;
    display:grid;
    place-items:center;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.10);
    font-size: 18px;
  }
  .hf_mtt{ font-weight: 1000; font-size: 12px; }
  .hf_mts{ margin-top: 2px; opacity: 0.82; font-weight: 850; font-size: 11px; }

  .hf_phoneGlow{
    position:absolute;
    width: 420px;
    height: 420px;
    border-radius: 999px;
    left: -160px;
    bottom: -220px;
    background: radial-gradient(circle at 30% 30%, rgba(255,90,95,0.30), rgba(255,90,95,0) 60%);
    filter: blur(24px);
    opacity: 0.85;
    pointer-events:none;
  }

  .hf_authCard{
    width: 100%;
    max-width: 520px;
    margin: 0 auto;
    border-radius: 20px;
    background: linear-gradient(160deg, rgba(255,255,255,0.96), rgba(255,255,255,0.88));
    border: 1px solid rgba(255,255,255,0.55);
    box-shadow: 0 36px 90px rgba(0,0,0,0.26), inset 0 1px 0 rgba(255,255,255,0.75);
    backdrop-filter: blur(14px);
    overflow: hidden;
  }

  .hf_reveal{
    opacity: 0;
    transform: translateY(12px);
    animation: hf_revealUp 560ms ease forwards;
  }
  .hf_r1{ animation-delay: 40ms; }
  .hf_r2{ animation-delay: 140ms; }
  .hf_r3{ animation-delay: 240ms; }
  @keyframes hf_revealUp {
    to { opacity: 1; transform: translateY(0); }
  }
  .hf_authTop{
    display:flex;
    align-items:center;
    justify-content: space-between;
    gap: 10px;
    padding: 14px 14px 10px;
    border-bottom: 1px solid rgba(0,0,0,0.06);
    background: linear-gradient(180deg, rgba(255,255,255,1), rgba(255,255,255,0.92));
  }
  .hf_brand{
    display:flex;
    align-items:center;
    gap: 10px;
    min-width: 0;
  }
  .hf_brandLogo{
    width: 42px;
    height: 42px;
    border-radius: 14px;
    display:grid;
    place-items:center;
    background: linear-gradient(135deg, rgba(255,90,95,0.20), rgba(255,45,85,0.14));
    border: 1px solid rgba(0,0,0,0.08);
    box-shadow: 0 10px 24px rgba(0,0,0,0.12);
    font-size: 20px;
  }
  .hf_brandName{
    font-weight: 1000;
    color: #0b1220;
    letter-spacing: -0.3px;
    font-size: 16px;
    line-height: 1.1;
  }
  .hf_brandSub{
    margin-top: 2px;
    color: rgba(15,23,42,0.70);
    font-weight: 850;
    font-size: 12px;
    line-height: 1.2;
  }
  .hf_modePill{
    border-radius: 999px;
    border: 1px solid rgba(0,0,0,0.10);
    background: rgba(255,255,255,0.85);
    padding: 8px 10px;
    font-weight: 950;
    color: rgba(15,23,42,0.78);
    cursor:pointer;
    white-space:nowrap;
  }
  .hf_pillStatic{
    border-radius: 999px;
    border: 1px solid rgba(0,0,0,0.10);
    background: rgba(255,255,255,0.85);
    padding: 8px 10px;
    font-weight: 950;
    color: rgba(15,23,42,0.78);
    white-space:nowrap;
  }

  .hf_alert{
    margin: 12px 14px 0;
    border-radius: 12px;
    padding: 10px 12px;
    font-weight: 850;
    font-size: 13px;
    line-height: 1.35;
  }
  .hf_error{
    background: rgba(255,231,231,0.95);
    border: 1px solid rgba(255,179,179,0.95);
    color: #7a1717;
  }
  .hf_info{
    background: rgba(233,255,240,0.95);
    border: 1px solid rgba(168,240,191,0.98);
    color: #0f5b2a;
  }

  .hf_form{
    padding: 12px 14px 14px;
  }
  .hf_label{
    display:block;
    font-weight: 950;
    color: rgba(2,6,23,0.86);
    font-size: 13px;
    margin: 6px 0 6px;
  }

  .hf_inputWrap{
    position: relative;
    display:flex;
    align-items:center;
  }
  .hf_inputWrap.hf_valid .hf_input{
    border-color: rgba(10,138,75,0.45);
    box-shadow: 0 0 0 3px rgba(10,138,75,0.12);
  }
  .hf_inputWrap.hf_invalid .hf_input{
    border-color: rgba(198,40,40,0.45);
    box-shadow: 0 0 0 3px rgba(198,40,40,0.10);
  }
  .hf_stateIcon{
    position: absolute;
    right: 12px;
    width: 20px;
    height: 20px;
    border-radius: 999px;
    display: grid;
    place-items: center;
    font-size: 11px;
    font-weight: 1000;
    pointer-events: none;
  }
  .hf_stateIconEye{ right: 48px; }
  .hf_stateValid{
    background: rgba(16,185,129,0.18);
    color: rgba(6,95,70,0.98);
    border: 1px solid rgba(6,95,70,0.20);
  }
  .hf_stateInvalid{
    background: rgba(239,68,68,0.14);
    color: rgba(127,29,29,0.98);
    border: 1px solid rgba(127,29,29,0.20);
  }
  .hf_icon{
    position:absolute;
    left: 12px;
    opacity: 0.8;
    font-size: 15px;
    pointer-events:none;
  }
  .hf_input{
    width:100%;
    border-radius: 14px;
    border: 1px solid rgba(15,23,42,0.14);
    background: rgba(255,255,255,0.98);
    padding: 12px 12px 12px 40px;
    outline:none;
    font-size: 14px;
    color: #0b1220;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.9);
  }
  .hf_input:focus{
    border-color: rgba(0,0,0,0.22);
    box-shadow: 0 0 0 4px rgba(0,0,0,0.06);
  }
  .hf_inputPass{ padding-right: 72px; }
  .hf_eye{
    position:absolute;
    right: 10px;
    width: 34px;
    height: 34px;
    border-radius: 12px;
    border: 1px solid rgba(15,23,42,0.10);
    background: rgba(255,255,255,0.92);
    cursor:pointer;
    display:grid;
    place-items:center;
    font-size: 16px;
  }

  .hf_linksRow{
    display:flex;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
    margin: 10px 0 12px;
  }
  .hf_link{
    border: none;
    background: transparent;
    padding: 0;
    cursor: pointer;
    color: rgba(2,6,23,0.78);
    font-weight: 900;
    font-size: 13px;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .hf_link:disabled{
    opacity: 0.7;
    cursor:not-allowed;
  }

  .hf_btnPrimary{
    width:100%;
    padding: 12px 14px;
    border-radius: 14px;
    border: 1px solid rgba(0,0,0,0.10);
    background: linear-gradient(180deg, #0b0f19, #111827);
    color:#fff;
    font-weight: 950;
    letter-spacing: 0.2px;
    cursor:pointer;
    box-shadow: 0 16px 40px rgba(0,0,0,0.22);
    margin-top: 6px;
  }
  .hf_btnPrimary:disabled{
    opacity: 0.75;
    cursor:not-allowed;
  }
  .hf_btnSpin{
    display:inline-flex;
    align-items:center;
    justify-content:center;
    gap: 8px;
  }

  .hf_footer{
    margin-top: 10px;
    text-align:center;
    color: rgba(15,23,42,0.70);
    font-size: 13px;
    font-weight: 850;
  }
  .hf_footerLink{
    color:#0b0f19;
    font-weight: 950;
    cursor:pointer;
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .hf_trustRow{
    margin: 2px 14px 10px;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
  }
  .hf_trustChip{
    border-radius: 999px;
    border: 1px solid rgba(15,23,42,0.10);
    background: rgba(255,255,255,0.78);
    padding: 6px 10px;
    font-size: 11px;
    font-weight: 900;
    color: rgba(15,23,42,0.78);
  }

  .hf_terms{
    margin: 0 14px 14px;
    padding: 12px;
    border-radius: 14px;
    border: 1px dashed rgba(0,0,0,0.12);
    background: rgba(255,255,255,0.80);
    color: rgba(15,23,42,0.72);
    font-size: 12px;
    font-weight: 850;
    line-height: 1.45;
    text-align:center;
  }

  .hf_notice{
    margin: 12px 14px 14px;
    padding: 12px;
    border-radius: 14px;
    border: 1px solid rgba(0,0,0,0.08);
    background: rgba(255,255,255,0.92);
    color: rgba(15,23,42,0.78);
    font-weight: 900;
    display:flex;
    align-items:center;
    gap: 10px;
  }
  .hf_dot{
    width: 10px;
    height: 10px;
    border-radius: 999px;
    background: rgba(255,90,95,0.95);
    box-shadow: 0 0 0 4px rgba(255,90,95,0.18);
  }

  .hf_joinWrap{
    position: relative;
    overflow:hidden;
    padding: 40px 18px 48px;
    background:
      radial-gradient(900px 520px at 20% 20%, rgba(255,255,255,0.22), rgba(255,255,255,0) 62%),
      linear-gradient(180deg, rgba(255,90,95,0.18), rgba(255,45,85,0.08));
    border-top: 1px solid rgba(0,0,0,0.06);
  }

  /* ✅ OPTIONAL partner photo */
  .hf_partnerPhoto{
    position:absolute;
    inset:0;
    z-index: 0;
    pointer-events:none;
    opacity: 0.40;
  }
  .hf_partnerImg{
    width:100%;
    height:100%;
    object-fit: cover;
    filter: saturate(1.02) contrast(1.02);
    transform: scale(1.03);
  }
  .hf_partnerShade{
    position:absolute;
    inset:0;
    background:
      radial-gradient(900px 520px at 60% 30%, rgba(255,255,255,0.45), rgba(255,255,255,0) 60%),
      linear-gradient(180deg, rgba(255,255,255,0.60), rgba(255,255,255,0.85));
  }

  .hf_joinBg{
    position:absolute;
    inset:0;
    pointer-events:none;
    opacity: 0.75;
    z-index: 1;
  }
  .hf_joinWave{
    position:absolute;
    left: -12%;
    width: 124%;
    height: 120px;
    color: rgba(255, 45, 85, 0.10);
  }
  .hf_joinWave1{
    bottom: -8px;
    animation: hf_waveMove2 12.5s linear infinite;
  }
  .hf_joinWave2{
    bottom: 16px;
    height: 90px;
    color: rgba(255, 90, 95, 0.10);
    animation: hf_waveMove1 9.5s linear infinite;
  }

  .hf_joinGrid{
    max-width: 1120px;
    margin: 0 auto;
    display:grid;
    grid-template-columns: 1fr;
    gap: 22px;
    text-align:center;
    justify-content: center;
    position:relative;
    z-index: 2;
  }

  .hf_joinCard{
    border-radius: 18px;
    background: rgba(255,255,255,0.92);
    border: 1px solid rgba(0,0,0,0.08);
    padding: 22px 16px;
    box-shadow: 0 14px 40px rgba(16,24,40,0.08);
    backdrop-filter: blur(8px);
  }

  .hf_joinIcon{
    width: 88px;
    height: 88px;
    border-radius: 26px;
    margin: 0 auto 10px;
    display:grid;
    place-items:center;
    background: rgba(255,90,95,0.10);
    border: 1px solid rgba(255,90,95,0.18);
    font-size: 34px;
  }

  .hf_joinTitle{
    font-weight: 1000;
    letter-spacing: -0.4px;
    font-size: 22px;
    color: #0b1220;
    margin-top: 6px;
  }
  .hf_joinDesc{
    margin: 10px auto 14px;
    max-width: 320px;
    color: rgba(15,23,42,0.72);
    font-weight: 850;
    font-size: 14px;
    line-height: 1.45;
  }

  .hf_joinLink{
    border: none;
    background: transparent;
    color: #ff2d55;
    font-weight: 950;
    cursor:pointer;
    display:inline-flex;
    align-items:center;
    gap: 10px;
    font-size: 14px;
  }
  .hf_joinArrow{
    width: 28px;
    height: 28px;
    border-radius: 999px;
    border: 1px solid rgba(255,45,85,0.25);
    display:grid;
    place-items:center;
  }

  /* ✅ Footer now light red */
  .hf_footerBar{
    background:
      radial-gradient(900px 520px at 20% 30%, rgba(255,255,255,0.22), rgba(255,255,255,0) 62%),
      linear-gradient(180deg, rgba(255,90,95,0.22), rgba(255,45,85,0.18));
    color: rgba(15,23,42,0.85);
    border-top: 1px solid rgba(0,0,0,0.06);
    padding: 12px 14px;
  }
  .hf_footerInner{
    max-width: 1120px;
    margin: 0 auto;
    display:flex;
    align-items:center;
    justify-content: space-between;
    gap: 14px;
    flex-wrap: wrap;
  }
  .hf_footerLeft{
    display:flex;
    align-items:center;
    gap: 10px;
    flex: 1 1 560px;
    min-width: 280px;
  }
  .hf_footerLogo{
    width: 34px;
    height: 34px;
    border-radius: 12px;
    display:grid;
    place-items:center;
    background: rgba(255,255,255,0.50);
    border: 1px solid rgba(0,0,0,0.06);
  }
  .hf_footerLinks{
    display:flex;
    gap: 14px;
    flex-wrap: wrap;
    align-items:center;
    font-size: 12px;
    font-weight: 850;
  }
  .hf_footerA{
    color: rgba(15,23,42,0.85);
    text-decoration: none;
  }
  .hf_footerA:hover{
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .hf_footerCopy{
    opacity: 0.75;
  }

  .hf_footerRight{
    display:flex;
    align-items:center;
    gap: 12px;
  }
  .hf_lang{
    display:flex;
    align-items:center;
    gap: 8px;
    background: rgba(255,255,255,0.55);
    border: 1px solid rgba(0,0,0,0.06);
    border-radius: 999px;
    padding: 6px 10px;
  }
  .hf_langIcon{ opacity: 0.9; }
  .hf_langSelect{
    background: transparent;
    border: none;
    outline: none;
    color: rgba(15,23,42,0.90);
    font-weight: 900;
    font-size: 12px;
    cursor:pointer;
  }
  .hf_langSelect option{
    color: #0b0f19;
  }

  .hf_social{
    display:flex;
    gap: 8px;
    align-items:center;
  }
  .hf_socialBtn{
    width: 34px;
    height: 34px;
    border-radius: 999px;
    display:grid;
    place-items:center;
    background: rgba(255,255,255,0.55);
    border: 1px solid rgba(0,0,0,0.06);
    color: rgba(15,23,42,0.90);
    text-decoration:none;
  }

  @media (min-width: 980px){
    .hf_heroInner{
      grid-template-columns: 1fr 520px;
      gap: 18px;
      align-items: center;
    }
    .hf_leftColumn{
      align-items: flex-start;
    }
    .hf_heroTitleBlock{
      text-align:left;
      padding: 0 8px 0 0;
    }
    .hf_phoneWrap{
      display:flex;
    }
    .hf_joinGrid{
      grid-template-columns: repeat(2, minmax(320px, 360px));
      gap: 26px;
      text-align:center;
      justify-content: center;
    }
  }

  @media (max-width: 760px){
    .hf_socialProof{
      grid-template-columns: 1fr;
      max-width: 320px;
    }
  }

  @media (max-width: 520px){
    .hf_heroFood{ display:none; }
  }
`;
