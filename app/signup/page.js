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

async function redirectByRole(router) {
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

  if (role === "restaurant_owner") {
    router.push("/restaurants/settings");
    return;
  }

  if (role === "grocery_owner") {
    router.push("/groceries/owner/settings");
    return;
  }

  if (role === "delivery_partner") {
    router.push("/delivery");
    return;
  }

  router.push("/");
}

// ✅ helper: email confirmed check
function isEmailConfirmed(user) {
  const a = user?.email_confirmed_at;
  const b = user?.confirmed_at;
  return !!(a || b);
}

export default function SignupPage() {
  const router = useRouter();

  const [checkingSession, setCheckingSession] = useState(true);

  const [role, setRole] = useState("customer");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // extra fields
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [city, setCity] = useState("");
  const [stateProv, setStateProv] = useState("");
  const [postal, setPostal] = useState("");
  const [country, setCountry] = useState("");

  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const [infoMsg, setInfoMsg] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const { data } = await supabase.auth.getSession();
        if (!cancelled && data?.session?.user) {
          // if already logged in but email not confirmed, sign out for safety
          const u = data.session.user;
          if (!isEmailConfirmed(u)) {
            await supabase.auth.signOut();
          } else {
            await redirectByRole(router);
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

  async function handleSignup(e) {
    e.preventDefault();
    setErrMsg("");
    setInfoMsg("");

    if (!email.trim()) return setErrMsg("Please enter email.");
    if (!password.trim()) return setErrMsg("Please enter password.");
    if (password.trim().length < 6)
      return setErrMsg("Password must be at least 6 characters.");

    if (!fullName.trim()) return setErrMsg("Please enter full name.");
    if (!phone.trim()) return setErrMsg("Please enter phone.");
    if (!address1.trim()) return setErrMsg("Please enter address.");
    if (!city.trim()) return setErrMsg("Please enter city.");
    if (!country.trim()) return setErrMsg("Please enter country.");

    setLoading(true);

    try {
      const emailRedirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/auth/callback`
          : undefined;

      // ✅ A) Signup that requires email confirmation (if enabled in Supabase)
      const { data: signData, error: signErr } = await supabase.auth.signUp({
        email: email.trim(),
        password: password.trim(),
        options: emailRedirectTo ? { emailRedirectTo } : undefined,
      });
      if (signErr) throw signErr;

      const createdUser = signData?.user;

      // If confirm email is ON, sometimes there is no session yet — that’s OK.
      // We still create the profile if we have a user id.
      if (createdUser?.id) {
        const profilePayload = {
          user_id: createdUser.id,
          role,
          full_name: fullName.trim(),
          phone: phone.trim(),
          address_line1: address1.trim(),
          address_line2: address2.trim(),
          city: city.trim(),
          state: stateProv.trim(),
          postal_code: postal.trim(),
          country: country.trim(),
        };

        const { error: profErr } = await supabase
          .from("profiles")
          .upsert(profilePayload, { onConflict: "user_id" });

        if (profErr) throw profErr;
      }

      // ✅ If email confirmation required, user must verify before login
      setInfoMsg(
        "✅ Account created! Please check your email and click the verification link. After verifying, come back and login."
      );

      // Optional: auto redirect to login after short delay
      setTimeout(() => {
        router.push("/login");
      }, 1200);
    } catch (e) {
      setErrMsg(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <main style={{ padding: 24 }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>Checking session…</div>
      </main>
    );
  }

  const inputStyle = {
    width: "100%",
    padding: 12,
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.12)",
    background: "rgba(255,255,255,0.9)",
    outline: "none",
  };

  return (
    <main
      style={{
        minHeight: "calc(100vh - 64px)",
        padding: 24,
        background:
          "radial-gradient(1200px 600px at 20% 10%, rgba(255,200,120,0.35), transparent 60%), radial-gradient(900px 500px at 80% 20%, rgba(120,180,255,0.35), transparent 55%), linear-gradient(180deg, #f7f7fb, #ffffff)",
      }}
    >
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <h1 style={{ margin: 0, fontSize: 34, fontWeight: 950 }}>
            Create your account
          </h1>
          <div style={{ color: "#666", marginTop: 6 }}>
            Customer, Restaurant Owner, Grocery Owner, or Delivery Partner — all supported
          </div>
        </div>

        {errMsg ? (
          <div
            style={{
              maxWidth: 720,
              margin: "0 auto 12px auto",
              background: "#ffe7e7",
              border: "1px solid #ffb3b3",
              padding: 12,
              borderRadius: 12,
              color: "#8a1f1f",
              fontWeight: 700,
            }}
          >
            {errMsg}
          </div>
        ) : null}

        {infoMsg ? (
          <div
            style={{
              maxWidth: 720,
              margin: "0 auto 12px auto",
              background: "#e9fff0",
              border: "1px solid #a8f0bf",
              padding: 12,
              borderRadius: 12,
              color: "#0f5b2a",
              fontWeight: 700,
            }}
          >
            {infoMsg}
          </div>
        ) : null}

        <form
          onSubmit={handleSignup}
          style={{
            maxWidth: 720,
            margin: "0 auto",
            borderRadius: 18,
            padding: 18,
            background: "rgba(255,255,255,0.75)",
            border: "1px solid rgba(0,0,0,0.08)",
            boxShadow: "0 12px 40px rgba(0,0,0,0.08)",
            backdropFilter: "blur(10px)",
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontWeight: 900, display: "block", marginBottom: 6 }}>
                Account Type
              </label>
              <select value={role} onChange={(e) => setRole(e.target.value)} style={inputStyle}>
                <option value="customer">Customer</option>
                <option value="restaurant_owner">Restaurant Owner</option>
                <option value="grocery_owner">Grocery Owner</option>
                <option value="delivery_partner">Delivery Partner</option>
              </select>
            </div>

            <div>
              <label style={{ fontWeight: 900, display: "block", marginBottom: 6 }}>
                Country
              </label>
              <input
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="United States / India"
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
            <div>
              <label style={{ fontWeight: 900, display: "block", marginBottom: 6 }}>
                Email
              </label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={{ fontWeight: 900, display: "block", marginBottom: 6 }}>
                Password
              </label>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="min 6 characters"
                type="password"
                autoComplete="new-password"
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
            <div>
              <label style={{ fontWeight: 900, display: "block", marginBottom: 6 }}>
                Full Name
              </label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your full name"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={{ fontWeight: 900, display: "block", marginBottom: 6 }}>
                Phone
              </label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Phone number"
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <label style={{ fontWeight: 900, display: "block", marginBottom: 6 }}>
              Address Line 1
            </label>
            <input
              value={address1}
              onChange={(e) => setAddress1(e.target.value)}
              placeholder="Street address"
              style={inputStyle}
            />
          </div>

          <div style={{ marginTop: 12 }}>
            <label style={{ fontWeight: 900, display: "block", marginBottom: 6 }}>
              Address Line 2 (optional)
            </label>
            <input
              value={address2}
              onChange={(e) => setAddress2(e.target.value)}
              placeholder="Apartment, suite, landmark"
              style={inputStyle}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
            <div>
              <label style={{ fontWeight: 900, display: "block", marginBottom: 6 }}>
                City
              </label>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Bakersfield"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={{ fontWeight: 900, display: "block", marginBottom: 6 }}>
                State (optional)
              </label>
              <input
                value={stateProv}
                onChange={(e) => setStateProv(e.target.value)}
                placeholder="CA"
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <label style={{ fontWeight: 900, display: "block", marginBottom: 6 }}>
              Postal Code (optional)
            </label>
            <input
              value={postal}
              onChange={(e) => setPostal(e.target.value)}
              placeholder="93313"
              style={inputStyle}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 14,
              width: "100%",
              padding: "12px 14px",
              borderRadius: 14,
              border: "1px solid rgba(0,0,0,0.12)",
              background: "#111",
              color: "#fff",
              cursor: "pointer",
              fontWeight: 950,
              fontSize: 15,
              opacity: loading ? 0.85 : 1,
            }}
          >
            {loading ? "Creating…" : "Create Account"}
          </button>

          <div style={{ marginTop: 12, fontSize: 13, color: "#666" }}>
            Already have an account?{" "}
            <span
              onClick={() => router.push("/login")}
              style={{ color: "#111", fontWeight: 900, cursor: "pointer" }}
            >
              Login
            </span>
          </div>

          <div style={{ marginTop: 10, fontSize: 12, color: "#777", lineHeight: 1.5 }}>
            After signup, we’ll email you a verification link. You must confirm your email before you can log in and place orders.
          </div>
        </form>
      </div>
    </main>
  );
}