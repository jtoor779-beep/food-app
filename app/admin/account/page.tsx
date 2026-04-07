"use client";

import React, { useEffect, useMemo, useState } from "react";
import supabase from "@/lib/supabase";

type AnyRow = Record<string, any>;

type TeamMemberAccess = {
  user_id: string;
  email?: string | null;
  full_name?: string | null;
  permissions: string[];
  is_active?: boolean;
  previous_role?: string | null;
};

const ADMIN_PERMISSION_OPTIONS = [
  { key: "restaurants", label: "Restaurants" },
  { key: "orders", label: "Orders" },
  { key: "revenue", label: "Revenue" },
  { key: "payouts", label: "Payouts" },
  { key: "driver_bank_accounts", label: "Driver Bank Accounts" },
  { key: "groceries", label: "Groceries" },
  { key: "delivery_partners", label: "Delivery Partners" },
  { key: "users", label: "Users" },
  { key: "support", label: "Support" },
  { key: "cms_pages", label: "CMS Pages" },
  { key: "home_banner", label: "Home Banner" },
  { key: "home_banner_settings", label: "Home Banner Settings" },
  { key: "home_featured", label: "Home Featured" },
  { key: "home_filters", label: "Home Filters" },
  { key: "mobile_home", label: "Mobile Home" },
  { key: "mobile_popular", label: "Mobile Popular" },
  { key: "mobile_recommended", label: "Mobile Recommended" },
  { key: "mobile_groceries", label: "Mobile Groceries" },
  { key: "mobile_restaurants", label: "Mobile Restaurants" },
  { key: "currency_settings", label: "Currency Settings" },
  { key: "settings", label: "Settings" },
];

function normalizeRole(input: any) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function uniquePermissions(input: string[]) {
  return Array.from(
    new Set(
      (input || [])
        .map((item) =>
          String(item || "")
            .trim()
            .toLowerCase()
            .replace(/\s+/g, "_")
        )
        .filter(Boolean)
    )
  );
}

function pickName(row: AnyRow) {
  return (
    row?.full_name ||
    row?.name ||
    row?.display_name ||
    row?.email ||
    row?.phone ||
    row?.user_id ||
    "Admin"
  );
}

function describeTeamRow(row: AnyRow) {
  const parts = [
    String(pickName(row) || "").trim(),
    normalizeRole(row?.role) || "unknown",
    String(row?.phone || "").trim(),
  ].filter(Boolean);
  return parts.join(" • ");
}

export default function AdminAccountPage() {
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingTeam, setSavingTeam] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [currentUserId, setCurrentUserId] = useState("");
  const [currentRole, setCurrentRole] = useState("");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [userRows, setUserRows] = useState<AnyRow[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMemberAccess[]>([]);
  const [selectedTeamUserId, setSelectedTeamUserId] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);

  const styles = useMemo(() => {
    const pageText = "#0b0f17";
    const muted = "rgba(15, 23, 42, 0.70)";

    const pageBg: React.CSSProperties = {
      padding: 16,
      borderRadius: 18,
      background:
        "radial-gradient(1200px 600px at 20% 10%, rgba(255,140,0,0.18), transparent 55%), radial-gradient(900px 520px at 85% 0%, rgba(255,220,160,0.18), transparent 60%), linear-gradient(180deg, rgba(248,250,252,1), rgba(241,245,249,1))",
      color: pageText,
      border: "1px solid rgba(15, 23, 42, 0.06)",
    };

    const card: React.CSSProperties = {
      padding: 16,
      borderRadius: 18,
      background: "#FFFFFF",
      border: "1px solid rgba(15, 23, 42, 0.10)",
      boxShadow: "0 14px 36px rgba(15, 23, 42, 0.08)",
      color: pageText,
    };

    const input: React.CSSProperties = {
      width: "100%",
      paddingTop: 11,
      paddingBottom: 11,
      paddingLeft: 12,
      paddingRight: 12,
      borderRadius: 14,
      border: "1px solid rgba(15, 23, 42, 0.14)",
      background: "rgba(255,255,255,0.95)",
      color: pageText,
      outline: "none",
      fontSize: 13,
      fontWeight: 700,
    };

    const btn: React.CSSProperties = {
      paddingTop: 10,
      paddingBottom: 10,
      paddingLeft: 12,
      paddingRight: 12,
      borderRadius: 14,
      border: "1px solid rgba(15, 23, 42, 0.12)",
      background: "rgba(255,255,255,0.92)",
      color: pageText,
      fontWeight: 900,
      cursor: "pointer",
      fontSize: 12,
      whiteSpace: "nowrap",
      boxShadow: "0 10px 22px rgba(15, 23, 42, 0.06)",
    };

    const btnPrimary: React.CSSProperties = {
      ...btn,
      background: "linear-gradient(135deg, rgba(255,140,0,1), rgba(255,220,160,0.95))",
      border: "1px solid rgba(255,200,120,0.55)",
      color: "#0b0f17",
      fontWeight: 950,
      boxShadow: "0 14px 30px rgba(255,140,0,0.22)",
    };

    const btnDanger: React.CSSProperties = {
      ...btn,
      background: "rgba(255,0,90,0.08)",
      border: "1px solid rgba(255,0,90,0.18)",
      color: "#7f1d1d",
      fontWeight: 950,
    };

    return { pageBg, card, input, btn, btnPrimary, btnDanger, muted };
  }, []);

  async function loadPage() {
    setLoading(true);
    setStatus(null);
    setError(null);

    try {
      const {
        data: { user },
        error: authErr,
      } = await supabase.auth.getUser();
      if (authErr) throw authErr;
      if (!user) throw new Error("Login required.");

      setCurrentUserId(String(user.id));
      setEmail(String(user.email || ""));

      const { data: profileRow, error: profileErr } = await supabase
        .from("profiles")
        .select("user_id, role, full_name, phone, avatar_url")
        .eq("user_id", user.id)
        .maybeSingle();
      if (profileErr) throw profileErr;

      setCurrentRole(normalizeRole(profileRow?.role));
      setFullName(String(profileRow?.full_name || user.user_metadata?.full_name || ""));
      setPhone(String(profileRow?.phone || ""));
      setAvatarUrl(String(profileRow?.avatar_url || ""));

      const { data: accessRow, error: accessErr } = await supabase
        .from("system_settings")
        .select("value_json")
        .eq("key", "admin_access")
        .maybeSingle();
      if (accessErr) throw accessErr;
      const valueJson = accessRow?.value_json && typeof accessRow.value_json === "object"
        ? accessRow.value_json
        : {};
      const members = Array.isArray((valueJson as any)?.members) ? (valueJson as any).members : [];
      setTeamMembers(
        members.map((item: any) => ({
          user_id: String(item?.user_id || ""),
          email: String(item?.email || ""),
          full_name: String(item?.full_name || ""),
          permissions: uniquePermissions(item?.permissions || []),
          is_active: item?.is_active !== false,
          previous_role: item?.previous_role || null,
        }))
      );

      if (normalizeRole(profileRow?.role) === "admin") {
        const { data: profiles, error: profilesErr } = await supabase
          .from("profiles")
          .select("user_id, role, full_name, phone")
          .order("created_at", { ascending: false })
          .limit(200);
        if (profilesErr) throw profilesErr;
        setUserRows((profiles || []).filter((row: any) => String(row?.user_id || "") !== String(user.id)));
      } else {
        setUserRows([]);
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPage();
  }, []);

  async function saveProfile() {
    setSavingProfile(true);
    setStatus(null);
    setError(null);
    try {
      await supabase.from("profiles").upsert(
        {
          user_id: currentUserId,
          role: currentRole || "admin",
          full_name: fullName.trim() || null,
          phone: phone.trim() || null,
          avatar_url: avatarUrl.trim() || null,
        },
        { onConflict: "user_id" }
      );
      setStatus("Admin profile updated.");
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSavingProfile(false);
    }
  }

  async function uploadAvatar(file: File) {
    setSavingProfile(true);
    setStatus(null);
    setError(null);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${currentUserId}/avatar.${ext}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, {
        upsert: true,
        contentType: file.type || "image/jpeg",
      });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const publicUrl = String(data?.publicUrl || "").trim();
      setAvatarUrl(publicUrl);

      await supabase.from("profiles").upsert(
        {
          user_id: currentUserId,
          role: currentRole || "admin",
          full_name: fullName.trim() || null,
          phone: phone.trim() || null,
          avatar_url: publicUrl || null,
        },
        { onConflict: "user_id" }
      );
      setStatus("Admin photo updated.");
    } catch (e: any) {
      setError(e?.message || "Upload failed. Make sure Storage bucket 'avatars' exists and is public.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function removeAvatar() {
    setSavingProfile(true);
    setStatus(null);
    setError(null);
    try {
      setAvatarUrl("");
      await supabase.from("profiles").upsert(
        {
          user_id: currentUserId,
          role: currentRole || "admin",
          full_name: fullName.trim() || null,
          phone: phone.trim() || null,
          avatar_url: null,
        },
        { onConflict: "user_id" }
      );
      setStatus("Admin photo removed.");
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSavingProfile(false);
    }
  }

  async function updatePassword() {
    if (!newPassword.trim() || newPassword.trim().length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Password confirmation does not match.");
      return;
    }

    setSavingPassword(true);
    setStatus(null);
    setError(null);
    try {
      const { error: updateErr } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateErr) throw updateErr;
      setNewPassword("");
      setConfirmPassword("");
      setStatus("Admin password updated.");
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSavingPassword(false);
    }
  }

  async function saveTeamAccess() {
    if (!selectedTeamUserId) {
      setError("Select a team user first.");
      return;
    }
    if (selectedPermissions.length === 0) {
      setError("Choose at least one admin section for this sub-admin.");
      return;
    }

    setSavingTeam(true);
    setStatus(null);
    setError(null);
    try {
      const picked = userRows.find((row) => String(row?.user_id || "") === selectedTeamUserId);
      if (!picked) throw new Error("Selected team user was not found.");

      const previousRole = normalizeRole(picked?.role) || "customer";
      const nextMembers = [...teamMembers];
      const nextEntry: TeamMemberAccess = {
        user_id: String(picked.user_id),
        email: String(picked.email || ""),
        full_name: String(picked.full_name || picked.name || ""),
        permissions: uniquePermissions(selectedPermissions),
        is_active: true,
        previous_role: previousRole === "sub_admin" ? "customer" : previousRole,
      };

      const existingIndex = nextMembers.findIndex((item) => item.user_id === nextEntry.user_id);
      if (existingIndex >= 0) nextMembers[existingIndex] = { ...nextMembers[existingIndex], ...nextEntry };
      else nextMembers.unshift(nextEntry);

      const { error: roleError } = await supabase
        .from("profiles")
        .update({ role: "sub_admin" })
        .eq("user_id", nextEntry.user_id);
      if (roleError) throw roleError;

      const { error: accessError } = await supabase.from("system_settings").upsert(
        [
          {
            key: "admin_access",
            value_json: {
              members: nextMembers,
            },
          },
        ],
        { onConflict: "key" }
      );
      if (accessError) throw accessError;

      setTeamMembers(nextMembers);
      setSelectedTeamUserId("");
      setSelectedPermissions([]);
      setStatus("Sub-admin access saved.");
      await loadPage();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSavingTeam(false);
    }
  }

  async function revokeTeamAccess(member: TeamMemberAccess) {
    setSavingTeam(true);
    setStatus(null);
    setError(null);
    try {
      const nextMembers = teamMembers.filter((item) => item.user_id !== member.user_id);
      const restoreRole = normalizeRole(member.previous_role) || "customer";

      const { error: roleError } = await supabase
        .from("profiles")
        .update({ role: restoreRole })
        .eq("user_id", member.user_id);
      if (roleError) throw roleError;

      const { error: accessError } = await supabase.from("system_settings").upsert(
        [
          {
            key: "admin_access",
            value_json: {
              members: nextMembers,
            },
          },
        ],
        { onConflict: "key" }
      );
      if (accessError) throw accessError;

      setTeamMembers(nextMembers);
      setStatus("Sub-admin access removed.");
      await loadPage();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSavingTeam(false);
    }
  }

  const teamChoices = useMemo(() => {
    return userRows.filter((row) => {
      const role = normalizeRole(row?.role);
      return role !== "admin";
    });
  }, [userRows]);

  if (loading) {
    return <div style={styles.pageBg}>Loading admin account...</div>;
  }

  return (
    <div style={styles.pageBg}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 950, letterSpacing: -0.2 }}>Admin Account</div>
          <div style={{ fontSize: 13, color: styles.muted, marginTop: 6, fontWeight: 700 }}>
            Personal admin profile, password controls, and optional team access setup.
          </div>
        </div>
        <button onClick={loadPage} style={styles.btn}>
          Refresh
        </button>
      </div>

      {status ? (
        <div style={{ ...styles.card, marginTop: 12 }}>
          <div style={{ fontWeight: 950 }}>Status</div>
          <div style={{ marginTop: 6, fontSize: 13 }}>{status}</div>
        </div>
      ) : null}

      {error ? (
        <div style={{ ...styles.card, marginTop: 12, border: "1px solid rgba(255,0,90,0.18)", background: "rgba(255,0,90,0.04)" }}>
          <div style={{ fontWeight: 950 }}>Error</div>
          <div style={{ marginTop: 6, fontSize: 13 }}>{error}</div>
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 14, marginTop: 14 }}>
        <div style={{ ...styles.card, gridColumn: "span 7" }}>
          <div style={{ fontSize: 16, fontWeight: 950 }}>Personal settings</div>
          <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 16, marginTop: 14 }}>
            <div>
              <div
                style={{
                  width: 140,
                  height: 140,
                  borderRadius: 22,
                  overflow: "hidden",
                  border: "1px solid rgba(15, 23, 42, 0.10)",
                  background: "rgba(15,23,42,0.05)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 950,
                  fontSize: 36,
                  color: "#0F172A",
                }}
              >
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="Admin avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span>{String(fullName || email || "A").slice(0, 1).toUpperCase()}</span>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                <label style={styles.btnPrimary}>
                  Upload photo
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadAvatar(file);
                    }}
                  />
                </label>
                <button type="button" style={styles.btnDanger} onClick={removeAvatar} disabled={!avatarUrl || savingProfile}>
                  Remove photo
                </button>
              </div>
            </div>

            <div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, color: styles.muted, marginBottom: 6, fontWeight: 900 }}>Full name</div>
                  <input value={fullName} onChange={(e) => setFullName(e.target.value)} style={styles.input} />
                </div>
                <div>
                  <div style={{ fontSize: 12, color: styles.muted, marginBottom: 6, fontWeight: 900 }}>Email</div>
                  <input value={email} readOnly style={{ ...styles.input, background: "rgba(241,245,249,0.95)" }} />
                </div>
                <div>
                  <div style={{ fontSize: 12, color: styles.muted, marginBottom: 6, fontWeight: 900 }}>Phone</div>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} style={styles.input} />
                </div>
                <div>
                  <div style={{ fontSize: 12, color: styles.muted, marginBottom: 6, fontWeight: 900 }}>Role</div>
                  <input value={currentRole || "admin"} readOnly style={{ ...styles.input, background: "rgba(241,245,249,0.95)" }} />
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
                <button onClick={saveProfile} style={styles.btnPrimary} disabled={savingProfile}>
                  {savingProfile ? "Saving..." : "Save profile"}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div style={{ ...styles.card, gridColumn: "span 5" }}>
          <div style={{ fontSize: 16, fontWeight: 950 }}>Change password</div>
          <div style={{ fontSize: 12, color: styles.muted, marginTop: 6, fontWeight: 700 }}>
            Update the admin panel password for this account.
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, color: styles.muted, marginBottom: 6, fontWeight: 900 }}>New password</div>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} style={styles.input} />
          </div>
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, color: styles.muted, marginBottom: 6, fontWeight: 900 }}>Confirm password</div>
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} style={styles.input} />
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
            <button onClick={updatePassword} style={styles.btnPrimary} disabled={savingPassword}>
              {savingPassword ? "Updating..." : "Update password"}
            </button>
          </div>
        </div>

        <div style={{ ...styles.card, gridColumn: "span 12" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 950 }}>Team access</div>
              <div style={{ fontSize: 12, color: styles.muted, marginTop: 6, fontWeight: 700 }}>
                Promote selected team members to `sub_admin` and control exactly which admin sections they can open.
              </div>
            </div>
          </div>

          {currentRole !== "admin" ? (
            <div style={{ marginTop: 14, fontSize: 13, color: styles.muted, fontWeight: 700 }}>
              Only full admin accounts can manage sub-admin access.
            </div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16, marginTop: 16 }}>
                <div>
                  <div style={{ fontSize: 12, color: styles.muted, marginBottom: 6, fontWeight: 900 }}>Select team user</div>
                  <select
                    value={selectedTeamUserId}
                    onChange={(e) => setSelectedTeamUserId(e.target.value)}
                    style={{ ...styles.input, paddingRight: 34 }}
                  >
                    <option value="">Choose existing user</option>
                    {teamChoices.map((row) => (
                      <option key={String(row.user_id)} value={String(row.user_id)}>
                        {describeTeamRow(row)}
                      </option>
                    ))}
                  </select>

                  <div style={{ marginTop: 8, fontSize: 12, color: styles.muted, fontWeight: 700, lineHeight: 1.5 }}>
                    Pick any existing user profile here, then choose which admin pages they can open.
                  </div>

                  {teamChoices.length === 0 ? (
                    <div style={{ marginTop: 10, fontSize: 12, color: styles.muted, fontWeight: 700 }}>
                      No team users found in `profiles` yet. Ask the team member to create/login once first so their account appears here.
                    </div>
                  ) : null}

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
                    <button
                      type="button"
                      style={styles.btn}
                      onClick={() => setSelectedPermissions(ADMIN_PERMISSION_OPTIONS.map((item) => item.key))}
                    >
                      Select all
                    </button>
                    <button type="button" style={styles.btn} onClick={() => setSelectedPermissions([])}>
                      Clear
                    </button>
                    <button type="button" style={styles.btnPrimary} onClick={saveTeamAccess} disabled={savingTeam}>
                      {savingTeam ? "Saving..." : "Save sub-admin access"}
                    </button>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 12, color: styles.muted, marginBottom: 10, fontWeight: 900 }}>Choose access sections</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
                    {ADMIN_PERMISSION_OPTIONS.map((item) => {
                      const checked = selectedPermissions.includes(item.key);
                      return (
                        <label
                          key={item.key}
                          style={{
                            padding: 12,
                            borderRadius: 14,
                            border: checked
                              ? "1px solid rgba(255,140,0,0.30)"
                              : "1px solid rgba(15, 23, 42, 0.10)",
                            background: checked ? "rgba(255,140,0,0.08)" : "#FFFFFF",
                            display: "flex",
                            gap: 10,
                            alignItems: "center",
                            fontWeight: 800,
                            cursor: "pointer",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setSelectedPermissions((prev) =>
                                checked ? prev.filter((entry) => entry !== item.key) : [...prev, item.key]
                              );
                            }}
                          />
                          <span>{item.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 18 }}>
                <div style={{ fontSize: 15, fontWeight: 950 }}>Current sub-admin team</div>
                <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
                  {teamMembers.length === 0 ? (
                    <div style={{ color: styles.muted, fontWeight: 700 }}>No sub-admin access assigned yet.</div>
                  ) : (
                    teamMembers.map((member) => (
                      <div
                        key={member.user_id}
                        style={{
                          padding: 14,
                          borderRadius: 16,
                          border: "1px solid rgba(15, 23, 42, 0.10)",
                          background: "rgba(255,255,255,0.92)",
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 14,
                          flexWrap: "wrap",
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 950 }}>{member.full_name || member.email || member.user_id}</div>
                          <div style={{ fontSize: 12, color: styles.muted, marginTop: 4, fontWeight: 700 }}>
                            {(member.email || "No email saved in access list")} • role: sub_admin
                          </div>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                            {member.permissions.map((permission) => (
                              <span
                                key={permission}
                                style={{
                                  padding: "6px 10px",
                                  borderRadius: 999,
                                  background: "rgba(255,140,0,0.10)",
                                  border: "1px solid rgba(255,140,0,0.20)",
                                  fontWeight: 900,
                                  fontSize: 12,
                                }}
                              >
                                {permission}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            style={styles.btn}
                            onClick={() => {
                              setSelectedTeamUserId(member.user_id);
                              setSelectedPermissions(member.permissions || []);
                            }}
                          >
                            Edit access
                          </button>
                          <button type="button" style={styles.btnDanger} onClick={() => revokeTeamAccess(member)} disabled={savingTeam}>
                            Remove access
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
