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
    avatar_url: "",
  });

  // ✅ NEW (UI/UX): editable fields (does not break old logic)
  const [edit, setEdit] = useState({
    full_name: "",
    phone: "",
    address_line1: "",
  });

  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

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
        .select("role, full_name, phone, address_line1, avatar_url")
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
        avatar_url: prof?.avatar_url || "",
      };

      setProfile(next);
      setEdit({
        full_name: next.full_name,
        phone: next.phone,
        address_line1: next.address_line1,
      });
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

  // ✅ NEW: Save profile edits (safe add-on)
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

      // Only update editable fields
      const payload = {
        full_name: String(edit.full_name || "").trim(),
        phone: String(edit.phone || "").trim(),
        address_line1: String(edit.address_line1 || "").trim(),
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
      hint,
      row,
      field,
      label,
      input,
      metaLine,
      mono,
      smallBtn,
      roleHint,
    };
  }, []);

  const roleLabel =
    profile.role === "restaurant_owner"
      ? "Restaurant Owner"
      : profile.role === "delivery_partner"
      ? "Delivery Partner"
      : profile.role === "admin"
      ? "Admin"
      : "Customer";

  const rolePill =
    profile.role === "restaurant_owner"
      ? "Owner"
      : profile.role === "delivery_partner"
      ? "Delivery"
      : profile.role === "admin"
      ? "Admin"
      : "Customer";

  if (loading) {
    return (
      <main style={ui.page}>
        <div className="sf_blob sf_blobA" />
        <div className="sf_blob sf_blobB" />

        <div style={ui.container}>
          <div style={ui.card}>
            <div style={ui.sectionTitle}>Loading profile…</div>
            <div
              style={{
                height: 12,
                borderRadius: 999,
                background:
                  "linear-gradient(90deg, rgba(255,255,255,0.15), rgba(0,0,0,0.06), rgba(255,255,255,0.15))",
                backgroundSize: "200% 100%",
                animation: "sf_shimmer 1.6s linear infinite",
                marginBottom: 10,
                width: "70%",
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
                marginBottom: 10,
                width: "92%",
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
                width: "58%",
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
            <h1 style={ui.h1}>Profile</h1>
            <div style={ui.sub}>Your account info</div>
          </div>
          <div style={ui.pill}>
            {rolePill} • {profile.email ? "Signed in" : "Guest"}
          </div>
        </div>

        {err ? <div style={ui.alertErr}>{err}</div> : null}
        {ok ? <div style={ui.alertOk}>{ok}</div> : null}

        <div style={ui.grid} className="sf_profile_grid">
          {/* LEFT: Avatar & basic */}
          <section style={ui.card}>
            <div style={ui.sectionTitle}>Account</div>

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
                  <span style={{ fontSize: 22 }}>
                    {initials(profile.full_name || profile.email)}
                  </span>
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

            {/* Role hint (same text as your old work) */}
            {profile.role === "restaurant_owner" ? (
              <div style={ui.roleHint}>
                Owner account detected ✅ (Owner Orders menu is enabled)
              </div>
            ) : profile.role === "delivery_partner" ? (
              <div style={ui.roleHint}>
                Delivery account detected ✅ (Delivery Dashboard is enabled)
              </div>
            ) : (
              <div style={ui.roleHint}>
                Customer account detected ✅ (Cart + My Orders menu is enabled)
              </div>
            )}
          </section>

          {/* RIGHT: Editable details */}
          <section style={ui.card}>
            <div style={ui.sectionTitle}>Profile details</div>

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
                <div style={ui.label}>Address</div>
                <input
                  value={edit.address_line1}
                  onChange={(e) => setEdit((p) => ({ ...p, address_line1: e.target.value }))}
                  placeholder="Enter address"
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
                  });
                  setOk("✅ Changes reset");
                }}
                disabled={saving || busy}
                style={ui.btnGhost}
              >
                Reset
              </button>

              <button
                type="button"
                onClick={load}
                disabled={saving || busy}
                style={ui.btnGhost}
              >
                Refresh
              </button>
            </div>

            <div style={{ marginTop: 10, color: "rgba(15,23,42,0.62)", fontSize: 12 }}>
              Note: Save updates <b>full_name</b>, <b>phone</b>, and <b>address_line1</b> in your <b>profiles</b> table.
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
          .sf_profile_grid {
            grid-template-columns: 0.95fr 1.05fr !important;
            gap: 14px !important;
          }
          .sf_fields {
            grid-template-columns: 1fr 1fr !important;
          }
          .sf_fields > div:last-child {
            grid-column: 1 / -1;
          }
        }
      `}</style>
    </main>
  );
}
