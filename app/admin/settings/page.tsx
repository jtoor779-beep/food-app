"use client";

import React, { useEffect, useMemo, useState } from "react";
import supabase from "@/lib/supabase";

type AnyRow = Record<string, any>;

type SettingsState = {
  commission_percent: string; // keep as string for input
  delivery_fee_base: string;
  delivery_fee_per_km: string;
  tax_note: string;

  // ✅ kept
  feature_owner_multi_restaurants: boolean;
  feature_admin_force_status: boolean;
};

const DEFAULTS: SettingsState = {
  commission_percent: "10",
  delivery_fee_base: "20",
  delivery_fee_per_km: "0",
  tax_note: "Taxes will be configured later as per country/state rules.",

  feature_owner_multi_restaurants: true,
  feature_admin_force_status: true,
};

function toNumberString(v: any) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  const cleaned = s.replace(/[^\d.]/g, "");
  return cleaned;
}

function safeParseSettings(row: AnyRow | null): Partial<SettingsState> {
  const v = row?.value_json;
  if (!v || typeof v !== "object") return {};
  return v as Partial<SettingsState>;
}

/* =========================
   ✅ COUPON MANAGER (Admin)
   ✅ MATCHES YOUR REAL TABLE:
   id, code, type, value, min_order_amount, max_discount,
   starts_at, expires_at, is_active, usage_limit_total, usage_limit_per_user,
   used_count, created_at
   ========================= */

type CouponRow = {
  id: string;
  code: string;
  type: string; // "flat" | "percent"
  value: any; // numeric
  min_order_amount?: any;
  max_discount?: any;
  starts_at?: any;
  expires_at?: any;
  is_active?: any;
  usage_limit_total?: any;
  usage_limit_per_user?: any;
  used_count?: any;
  created_at?: any;
};

function normCode(v: any) {
  return String(v || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function asBool(v: any) {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "").toLowerCase();
  return s === "true" || s === "1" || s === "yes";
}

function safeNum(v: any) {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

function numOrEmpty(v: any) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  const n = Number(s);
  return isFinite(n) ? String(n) : "";
}

export default function AdminSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [tableMissing, setTableMissing] = useState(false);

  const [form, setForm] = useState<SettingsState>({ ...DEFAULTS });

  // ✅ Coupons state
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponStatus, setCouponStatus] = useState<string | null>(null);
  const [couponRows, setCouponRows] = useState<CouponRow[]>([]);
  const [couponTableMissing, setCouponTableMissing] = useState(false);

  // new coupon form
  const [newCode, setNewCode] = useState("");
  const [newType, setNewType] = useState<"flat" | "percent">("flat");
  const [newValue, setNewValue] = useState("");
  const [newActive, setNewActive] = useState(true);

  const [newMinOrderAmount, setNewMinOrderAmount] = useState("");
  const [newMaxDiscount, setNewMaxDiscount] = useState("");
  const [newStartsAt, setNewStartsAt] = useState("");
  const [newExpiresAt, setNewExpiresAt] = useState("");
  const [newUsageLimitTotal, setNewUsageLimitTotal] = useState("");
  const [newUsageLimitPerUser, setNewUsageLimitPerUser] = useState("");

  /* =========================
     PREMIUM ADMIN THEME
     ========================= */
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
      padding: 14,
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

    const btnDark: React.CSSProperties = {
      ...btn,
      background: "rgba(2,6,23,0.92)",
      border: "1px solid rgba(2,6,23,0.18)",
      color: "#fff",
      fontWeight: 950,
    };

    const sectionTitle: React.CSSProperties = {
      fontSize: 13,
      fontWeight: 950,
      marginBottom: 8,
      letterSpacing: -0.1,
    };

    const small: React.CSSProperties = {
      fontSize: 12,
      color: muted,
      marginTop: 6,
      lineHeight: 1.4,
      fontWeight: 700,
    };

    const warnCard: React.CSSProperties = {
      ...card,
      border: "1px solid rgba(255,180,0,0.25)",
      background: "rgba(255,180,0,0.08)",
    };

    const codeBox: React.CSSProperties = {
      marginTop: 12,
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      fontSize: 12,
      opacity: 0.95,
      background: "rgba(2,6,23,0.06)",
      border: "1px solid rgba(15, 23, 42, 0.10)",
      borderRadius: 14,
      paddingTop: 12,
      paddingBottom: 12,
      paddingLeft: 12,
      paddingRight: 12,
      color: pageText,
    };

    const chip: React.CSSProperties = {
      paddingTop: 8,
      paddingBottom: 8,
      paddingLeft: 12,
      paddingRight: 12,
      borderRadius: 999,
      border: "1px solid rgba(15, 23, 42, 0.12)",
      background: "rgba(255,255,255,0.92)",
      color: pageText,
      fontWeight: 950,
      cursor: "pointer",
      boxShadow: "0 10px 22px rgba(15, 23, 42, 0.06)",
      fontSize: 12,
      whiteSpace: "nowrap",
    };

    const chipOn: React.CSSProperties = {
      ...chip,
      background: "rgba(0, 140, 255, 0.12)",
      border: "1px solid rgba(0, 140, 255, 0.22)",
    };

    const rowLine: React.CSSProperties = {
      display: "flex",
      justifyContent: "space-between",
      gap: 10,
      flexWrap: "wrap",
      alignItems: "center",
      paddingTop: 10,
      paddingBottom: 10,
      borderTop: "1px solid rgba(15, 23, 42, 0.08)",
    };

    return {
      pageBg,
      card,
      input,
      btn,
      btnPrimary,
      btnDanger,
      btnDark,
      sectionTitle,
      small,
      warnCard,
      codeBox,
      chip,
      chipOn,
      rowLine,
      pageText,
      muted,
    };
  }, []);

  async function loadSettings() {
    setLoading(true);
    setStatus(null);
    setTableMissing(false);

    try {
      const { data, error } = await supabase
        .from("system_settings")
        .select("key, value_json, updated_at")
        .eq("key", "platform")
        .maybeSingle();

      if (error) {
        const msg = String(error.message || "");
        if (msg.toLowerCase().includes("does not exist")) {
          setTableMissing(true);
          setForm({ ...DEFAULTS });
          return;
        }

        setStatus(`Load failed: ${error.message || "Unknown error"}`);
        setForm({ ...DEFAULTS });
        return;
      }

      const patch = safeParseSettings(data || null);
      setForm((prev) => ({ ...prev, ...DEFAULTS, ...patch }));
    } catch (e: any) {
      console.log(e);
      setStatus("Load crashed. Open console and share error.");
      setForm({ ...DEFAULTS });
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    setSaving(true);
    setStatus(null);

    try {
      const payload: SettingsState = {
        ...form,
        commission_percent: toNumberString(form.commission_percent),
        delivery_fee_base: toNumberString(form.delivery_fee_base),
        delivery_fee_per_km: toNumberString(form.delivery_fee_per_km),
        tax_note: String(form.tax_note ?? ""),
      };

      const { error } = await supabase.from("system_settings").upsert(
        [
          {
            key: "platform",
            value_json: payload,
          },
        ],
        { onConflict: "key" }
      );

      if (error) {
        const msg = String(error.message || "");
        if (msg.toLowerCase().includes("does not exist")) {
          setTableMissing(true);
          setStatus("Settings table missing. Create it in Supabase SQL Editor (steps shown on this page).");
          return;
        }

        setStatus(`Save failed: ${error.message || "Unknown error"}`);
        return;
      }

      setStatus("Saved ✅");
    } catch (e: any) {
      console.log(e);
      setStatus("Save crashed. Open console and share error.");
    } finally {
      setSaving(false);
    }
  }

  function resetDefaults() {
    setStatus("Reset to defaults ✅ (press Save to store)");
    setForm({ ...DEFAULTS });
  }

  /* =========================
     ✅ COUPONS (REAL TABLE)
     ========================= */

  async function loadCoupons() {
    setCouponLoading(true);
    setCouponStatus(null);
    setCouponTableMissing(false);

    try {
      const { data, error } = await supabase
        .from("coupons")
        .select(
          "id, code, type, value, min_order_amount, max_discount, starts_at, expires_at, is_active, usage_limit_total, usage_limit_per_user, used_count, created_at"
        )
        .order("created_at", { ascending: false });

      if (error) {
        const msg = String(error.message || "").toLowerCase();
        if (msg.includes("does not exist")) {
          setCouponTableMissing(true);
          setCouponRows([]);
          setCouponStatus("Coupons table missing.");
          return;
        }
        setCouponStatus(`Coupon load failed: ${error.message || "Unknown error"}`);
        setCouponRows([]);
        return;
      }

      setCouponRows(Array.isArray(data) ? (data as any) : []);
    } catch (e: any) {
      console.log(e);
      setCouponStatus("Coupon load crashed. Open console and share error.");
      setCouponRows([]);
    } finally {
      setCouponLoading(false);
    }
  }

  async function createCoupon() {
    setCouponStatus(null);

    const code = normCode(newCode);
    if (!code) return setCouponStatus("Enter coupon code.");
    if (!newValue || !isFinite(Number(newValue))) return setCouponStatus("Enter valid value.");

    if (newType === "percent") {
      const p = Number(newValue);
      if (p <= 0 || p > 100) return setCouponStatus("Percent must be 1 to 100.");
    }

    try {
      const payload: AnyRow = {
        code,
        type: newType,
        value: Number(newValue),
        is_active: !!newActive,
      };

      if (newMinOrderAmount.trim()) payload.min_order_amount = Number(newMinOrderAmount);
      if (newMaxDiscount.trim()) payload.max_discount = Number(newMaxDiscount);
      if (newStartsAt.trim()) payload.starts_at = newStartsAt.trim() || null;
      if (newExpiresAt.trim()) payload.expires_at = newExpiresAt.trim() || null;
      if (newUsageLimitTotal.trim()) payload.usage_limit_total = Number(newUsageLimitTotal);
      if (newUsageLimitPerUser.trim()) payload.usage_limit_per_user = Number(newUsageLimitPerUser);

      const { error } = await supabase.from("coupons").insert(payload);

      if (error) {
        setCouponStatus(`Create failed: ${error.message || "Unknown error"}`);
        return;
      }

      setNewCode("");
      setNewType("flat");
      setNewValue("");
      setNewActive(true);

      setNewMinOrderAmount("");
      setNewMaxDiscount("");
      setNewStartsAt("");
      setNewExpiresAt("");
      setNewUsageLimitTotal("");
      setNewUsageLimitPerUser("");

      setCouponStatus("Coupon created ✅");
      await loadCoupons();
    } catch (e: any) {
      console.log(e);
      setCouponStatus("Create crashed. Open console and share error.");
    }
  }

  async function updateCoupon(id: string, patch: AnyRow) {
    setCouponStatus(null);
    try {
      const { error } = await supabase.from("coupons").update(patch).eq("id", id);
      if (error) {
        setCouponStatus(`Update failed: ${error.message || "Unknown error"}`);
        return;
      }
      setCouponStatus("Updated ✅");
      await loadCoupons();
    } catch (e: any) {
      console.log(e);
      setCouponStatus("Update crashed. Open console and share error.");
    }
  }

  async function deleteCoupon(id: string) {
    setCouponStatus(null);
    try {
      const { error } = await supabase.from("coupons").delete().eq("id", id);
      if (error) {
        setCouponStatus(`Delete failed: ${error.message || "Unknown error"}`);
        return;
      }
      setCouponStatus("Deleted ✅");
      await loadCoupons();
    } catch (e: any) {
      console.log(e);
      setCouponStatus("Delete crashed. Open console and share error.");
    }
  }

  useEffect(() => {
    loadSettings();
    loadCoupons();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={styles.pageBg}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 950, letterSpacing: -0.2 }}>Settings</div>
          <div style={{ fontSize: 13, color: styles.muted, marginTop: 6, fontWeight: 700 }}>
            Platform commission, delivery fee rules, tax note, and feature toggles.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={loadSettings} style={styles.btn} disabled={loading || saving}>
            {loading ? "Loading…" : "Refresh"}
          </button>
          <button onClick={resetDefaults} style={styles.btn} disabled={loading || saving}>
            Reset defaults
          </button>
          <button onClick={saveSettings} style={styles.btnPrimary} disabled={loading || saving}>
            {saving ? "Saving…" : "Save settings"}
          </button>
        </div>
      </div>

      {status ? (
        <div style={{ ...styles.card, marginTop: 12 }}>
          <div style={{ fontWeight: 950 }}>Status</div>
          <div style={{ marginTop: 6, fontSize: 13, opacity: 0.95 }}>{status}</div>
        </div>
      ) : null}

      {tableMissing ? (
        <div style={{ ...styles.warnCard, marginTop: 12 }}>
          <div style={{ fontWeight: 950 }}>⚠️ Settings table missing</div>
          <div style={{ marginTop: 8, fontSize: 13, opacity: 0.95, lineHeight: 1.6 }}>
            You need to create <b>system_settings</b> table once.
            <br />
            Go Supabase → <b>SQL Editor</b> → New query → paste SQL below → Run.
          </div>

          <pre style={styles.codeBox}>
{`create table if not exists public.system_settings (
  key text primary key,
  value_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_system_settings_touch on public.system_settings;
create trigger trg_system_settings_touch
before update on public.system_settings
for each row execute function public.touch_updated_at();`}
          </pre>

          <div style={{ ...styles.small, marginTop: 10 }}>
            After you run SQL, refresh this page and click <b>Save settings</b>.
          </div>
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 14, marginTop: 14 }}>
        {/* Pricing */}
        <div style={{ ...styles.card, gridColumn: "span 6" }}>
          <div style={styles.sectionTitle}>Platform commission</div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: styles.muted, marginBottom: 6, fontWeight: 900 }}>Commission %</div>
              <input
                value={form.commission_percent}
                onChange={(e) => setForm((p) => ({ ...p, commission_percent: e.target.value }))}
                style={styles.input}
                placeholder="e.g. 10"
              />
              <div style={styles.small}>Used later to calculate admin revenue cut.</div>
            </div>

            <div>
              <div style={{ fontSize: 12, color: styles.muted, marginBottom: 6, fontWeight: 900 }}>Tax note (display text)</div>
              <input
                value={form.tax_note}
                onChange={(e) => setForm((p) => ({ ...p, tax_note: e.target.value }))}
                style={styles.input}
                placeholder="Tax note..."
              />
              <div style={styles.small}>Shown to users later (checkout / invoices).</div>
            </div>
          </div>
        </div>

        {/* Delivery */}
        <div style={{ ...styles.card, gridColumn: "span 6" }}>
          <div style={styles.sectionTitle}>Delivery fee rules</div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: styles.muted, marginBottom: 6, fontWeight: 900 }}>Base fee</div>
              <input
                value={form.delivery_fee_base}
                onChange={(e) => setForm((p) => ({ ...p, delivery_fee_base: e.target.value }))}
                style={styles.input}
                placeholder="e.g. 20"
              />
              <div style={styles.small}>Flat amount added to delivery orders.</div>
            </div>

            <div>
              <div style={{ fontSize: 12, color: styles.muted, marginBottom: 6, fontWeight: 900 }}>Per KM fee (optional)</div>
              <input
                value={form.delivery_fee_per_km}
                onChange={(e) => setForm((p) => ({ ...p, delivery_fee_per_km: e.target.value }))}
                style={styles.input}
                placeholder="e.g. 2"
              />
              <div style={styles.small}>If you later calculate distance, this fee is used.</div>
            </div>
          </div>
        </div>

        {/* Feature toggles */}
        <div style={{ ...styles.card, gridColumn: "span 12" }}>
          <div style={styles.sectionTitle}>Feature toggles</div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
            <Toggle
              label="Owner multi-restaurants"
              value={form.feature_owner_multi_restaurants}
              onChange={(v) => setForm((p) => ({ ...p, feature_owner_multi_restaurants: v }))}
            />
            <Toggle
              label="Admin can force status"
              value={form.feature_admin_force_status}
              onChange={(v) => setForm((p) => ({ ...p, feature_admin_force_status: v }))}
            />
          </div>

          <div style={{ ...styles.small, marginTop: 10 }}>These toggles are stored now. Next step is to use them in code.</div>
        </div>

        {/* ✅ Coupons */}
        <div style={{ ...styles.card, gridColumn: "span 12" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 950, letterSpacing: -0.1 }}>Coupons</div>
              <div style={{ ...styles.small, marginTop: 6 }}>
                Create coupons here. Cart will validate from <b>coupons</b> table (next step).
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button onClick={loadCoupons} style={styles.btn} disabled={couponLoading}>
                {couponLoading ? "Loading…" : "Refresh coupons"}
              </button>
            </div>
          </div>

          {couponStatus ? (
            <div style={{ ...styles.card, marginTop: 12, background: "rgba(2,6,23,0.02)" }}>
              <div style={{ fontWeight: 950 }}>Coupon status</div>
              <div style={{ marginTop: 6, fontSize: 13, opacity: 0.95 }}>{couponStatus}</div>
            </div>
          ) : null}

          {couponTableMissing ? (
            <div style={{ ...styles.warnCard, marginTop: 12 }}>
              <div style={{ fontWeight: 950 }}>⚠️ Coupons table missing</div>
              <div style={{ marginTop: 8, fontSize: 13, opacity: 0.95, lineHeight: 1.6 }}>
                Your app can’t find <b>public.coupons</b>.
              </div>
              <div style={{ ...styles.small, marginTop: 10 }}>But from your screenshots, this should NOT happen anymore.</div>
            </div>
          ) : null}

          {/* Create coupon */}
          <div style={{ ...styles.card, marginTop: 12, background: "rgba(15, 23, 42, 0.03)" }}>
            <div style={{ fontWeight: 950 }}>Create new coupon</div>

            <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr 1fr", gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: styles.muted, marginBottom: 6, fontWeight: 900 }}>Code</div>
                <input value={newCode} onChange={(e) => setNewCode(e.target.value)} style={styles.input} placeholder="WELCOME50" />
                <div style={styles.small}>Stored uppercase (no spaces).</div>
              </div>

              <div>
                <div style={{ fontSize: 12, color: styles.muted, marginBottom: 6, fontWeight: 900 }}>Type</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button onClick={() => setNewType("flat")} style={newType === "flat" ? styles.chipOn : styles.chip}>
                    Flat ₹
                  </button>
                  <button onClick={() => setNewType("percent")} style={newType === "percent" ? styles.chipOn : styles.chip}>
                    Percent %
                  </button>
                </div>
                <div style={styles.small}>Flat = ₹ off, Percent = % off</div>
              </div>

              <div>
                <div style={{ fontSize: 12, color: styles.muted, marginBottom: 6, fontWeight: 900 }}>
                  {newType === "percent" ? "Percent" : "Value (₹)"}
                </div>
                <input value={newValue} onChange={(e) => setNewValue(toNumberString(e.target.value))} style={styles.input} placeholder="50" />
                <div style={styles.small}>{newType === "percent" ? "1–100" : "₹ amount"}</div>
              </div>

              <div>
                <div style={{ fontSize: 12, color: styles.muted, marginBottom: 6, fontWeight: 900 }}>Active</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button onClick={() => setNewActive(true)} style={newActive ? styles.chipOn : styles.chip}>
                    ON
                  </button>
                  <button onClick={() => setNewActive(false)} style={!newActive ? styles.chipOn : styles.chip}>
                    OFF
                  </button>
                </div>
                <div style={styles.small}>If OFF, coupon won’t apply.</div>
              </div>
            </div>

            {/* optional rules */}
            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: styles.muted, marginBottom: 6, fontWeight: 900 }}>Min order amount</div>
                <input
                  value={newMinOrderAmount}
                  onChange={(e) => setNewMinOrderAmount(toNumberString(e.target.value))}
                  style={styles.input}
                  placeholder="0"
                />
              </div>
              <div>
                <div style={{ fontSize: 12, color: styles.muted, marginBottom: 6, fontWeight: 900 }}>Max discount</div>
                <input
                  value={newMaxDiscount}
                  onChange={(e) => setNewMaxDiscount(toNumberString(e.target.value))}
                  style={styles.input}
                  placeholder="0"
                />
              </div>
              <div>
                <div style={{ fontSize: 12, color: styles.muted, marginBottom: 6, fontWeight: 900 }}>Starts at</div>
                <input value={newStartsAt} onChange={(e) => setNewStartsAt(e.target.value)} style={styles.input} placeholder="2026-02-16T00:00:00Z" />
              </div>
              <div>
                <div style={{ fontSize: 12, color: styles.muted, marginBottom: 6, fontWeight: 900 }}>Expires at</div>
                <input value={newExpiresAt} onChange={(e) => setNewExpiresAt(e.target.value)} style={styles.input} placeholder="2026-03-16T00:00:00Z" />
              </div>
              <div>
                <div style={{ fontSize: 12, color: styles.muted, marginBottom: 6, fontWeight: 900 }}>Usage limit (total)</div>
                <input
                  value={newUsageLimitTotal}
                  onChange={(e) => setNewUsageLimitTotal(toNumberString(e.target.value))}
                  style={styles.input}
                  placeholder="1000"
                />
              </div>
              <div>
                <div style={{ fontSize: 12, color: styles.muted, marginBottom: 6, fontWeight: 900 }}>Usage limit (per user)</div>
                <input
                  value={newUsageLimitPerUser}
                  onChange={(e) => setNewUsageLimitPerUser(toNumberString(e.target.value))}
                  style={styles.input}
                  placeholder="1"
                />
              </div>
            </div>

            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button onClick={createCoupon} style={styles.btnPrimary}>
                Create coupon
              </button>
            </div>
          </div>

          {/* Coupon list */}
          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 950 }}>All coupons</div>

            {couponRows.length === 0 ? (
              <div style={{ marginTop: 10, color: styles.muted, fontWeight: 800 }}>No coupons found.</div>
            ) : (
              <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                {couponRows.map((c) => {
                  const id = String(c.id || "");
                  const code = normCode(c.code);
                  const type = String(c.type || "flat").toLowerCase();
                  const value = safeNum(c.value);
                  const active = asBool(c.is_active);

                  return (
                    <div key={id} style={{ ...styles.card, background: "rgba(255,255,255,0.95)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                          <div style={{ fontWeight: 1000, fontSize: 14 }}>{code || "COUPON"}</div>
                          <div style={{ fontSize: 12, fontWeight: 900, color: styles.muted }}>
                            {type === "percent" ? `${value}% OFF` : `₹${value} OFF`}
                          </div>

                          <span
                            style={{
                              paddingTop: 6,
                              paddingBottom: 6,
                              paddingLeft: 10,
                              paddingRight: 10,
                              borderRadius: 999,
                              border: "1px solid rgba(15,23,42,0.10)",
                              background: active ? "rgba(0,140,255,0.10)" : "rgba(2,6,23,0.06)",
                              fontWeight: 950,
                              fontSize: 12,
                            }}
                          >
                            {active ? "ACTIVE" : "OFF"}
                          </span>

                          <span style={{ fontSize: 12, fontWeight: 900, color: styles.muted }}>
                            Used: <span style={{ color: styles.pageText }}>{safeNum(c.used_count)}</span>
                          </span>
                        </div>

                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                          <button onClick={() => updateCoupon(id, { is_active: !active })} style={active ? styles.btnDark : styles.btn}>
                            {active ? "Turn OFF" : "Turn ON"}
                          </button>

                          <button onClick={() => deleteCoupon(id)} style={styles.btnDanger}>
                            Delete
                          </button>
                        </div>
                      </div>

                      {/* Quick edit controls */}
                      <div style={styles.rowLine}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, width: "100%" }}>
                          <div>
                            <div style={{ fontSize: 12, color: styles.muted, marginBottom: 6, fontWeight: 900 }}>Type</div>
                            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                              <button
                                onClick={() => updateCoupon(id, { type: "flat" })}
                                style={String(c.type || "").toLowerCase() === "flat" ? styles.chipOn : styles.chip}
                              >
                                Flat
                              </button>
                              <button
                                onClick={() => updateCoupon(id, { type: "percent" })}
                                style={String(c.type || "").toLowerCase() === "percent" ? styles.chipOn : styles.chip}
                              >
                                Percent
                              </button>
                            </div>
                          </div>

                          <div>
                            <div style={{ fontSize: 12, color: styles.muted, marginBottom: 6, fontWeight: 900 }}>
                              {type === "percent" ? "Percent" : "Value (₹)"}
                            </div>
                            <input
                              defaultValue={String(c.value ?? "")}
                              onBlur={(e) => updateCoupon(id, { value: Number(toNumberString(e.target.value || "")) || 0 })}
                              style={styles.input}
                              placeholder="50"
                            />
                            <div style={styles.small}>Edit then click outside.</div>
                          </div>

                          <div>
                            <div style={{ fontSize: 12, color: styles.muted, marginBottom: 6, fontWeight: 900 }}>Min order amount</div>
                            <input
                              defaultValue={numOrEmpty(c.min_order_amount)}
                              onBlur={(e) => {
                                const v = toNumberString(e.target.value || "");
                                updateCoupon(id, { min_order_amount: v ? Number(v) : null });
                              }}
                              style={styles.input}
                              placeholder="0"
                            />
                          </div>

                          <div>
                            <div style={{ fontSize: 12, color: styles.muted, marginBottom: 6, fontWeight: 900 }}>Max discount</div>
                            <input
                              defaultValue={numOrEmpty(c.max_discount)}
                              onBlur={(e) => {
                                const v = toNumberString(e.target.value || "");
                                updateCoupon(id, { max_discount: v ? Number(v) : null });
                              }}
                              style={styles.input}
                              placeholder="0"
                            />
                          </div>
                        </div>
                      </div>

                      <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                        <div>
                          <div style={{ fontSize: 12, color: styles.muted, marginBottom: 6, fontWeight: 900 }}>Starts at</div>
                          <input
                            defaultValue={String(c.starts_at ?? "")}
                            onBlur={(e) => updateCoupon(id, { starts_at: String(e.target.value || "").trim() || null })}
                            style={styles.input}
                            placeholder="optional"
                          />
                        </div>
                        <div>
                          <div style={{ fontSize: 12, color: styles.muted, marginBottom: 6, fontWeight: 900 }}>Expires at</div>
                          <input
                            defaultValue={String(c.expires_at ?? "")}
                            onBlur={(e) => updateCoupon(id, { expires_at: String(e.target.value || "").trim() || null })}
                            style={styles.input}
                            placeholder="optional"
                          />
                        </div>
                        <div>
                          <div style={{ fontSize: 12, color: styles.muted, marginBottom: 6, fontWeight: 900 }}>Usage limit (total)</div>
                          <input
                            defaultValue={numOrEmpty(c.usage_limit_total)}
                            onBlur={(e) => {
                              const v = toNumberString(e.target.value || "");
                              updateCoupon(id, { usage_limit_total: v ? Number(v) : null });
                            }}
                            style={styles.input}
                            placeholder="optional"
                          />
                        </div>
                        <div>
                          <div style={{ fontSize: 12, color: styles.muted, marginBottom: 6, fontWeight: 900 }}>Usage limit (per user)</div>
                          <input
                            defaultValue={numOrEmpty(c.usage_limit_per_user)}
                            onBlur={(e) => {
                              const v = toNumberString(e.target.value || "");
                              updateCoupon(id, { usage_limit_per_user: v ? Number(v) : null });
                            }}
                            style={styles.input}
                            placeholder="optional"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Advanced note */}
        <div style={{ ...styles.card, gridColumn: "span 12", background: "rgba(15, 23, 42, 0.03)" }}>
          <div style={{ fontSize: 13, fontWeight: 950 }}>Next we connect coupon validation into Cart</div>
          <div style={{ ...styles.small, marginTop: 8 }}>
            Next step: Cart will validate coupon from <b>coupons</b> table (is_active + rules), then save into <b>orders</b>:
            <b> coupon_id, coupon_code, discount_amount, subtotal_amount, total_amount</b>.
          </div>
        </div>
      </div>
    </div>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const styles = useMemo(() => {
    const pageText = "#0b0f17";

    const card: React.CSSProperties = {
      paddingTop: 14,
      paddingBottom: 14,
      paddingLeft: 14,
      paddingRight: 14,
      borderRadius: 16,
      background: "#FFFFFF",
      border: "1px solid rgba(15, 23, 42, 0.10)",
      boxShadow: "0 12px 26px rgba(15, 23, 42, 0.06)",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      color: pageText,
    };

    const btn: React.CSSProperties = {
      paddingTop: 8,
      paddingBottom: 8,
      paddingLeft: 12,
      paddingRight: 12,
      borderRadius: 999,
      border: "1px solid rgba(15, 23, 42, 0.12)",
      background: "rgba(255,255,255,0.92)",
      color: pageText,
      fontWeight: 950,
      cursor: "pointer",
      minWidth: 70,
      boxShadow: "0 10px 22px rgba(15, 23, 42, 0.06)",
      fontSize: 12,
    };

    const btnOn: React.CSSProperties = {
      ...btn,
      background: "rgba(0, 140, 255, 0.12)",
      border: "1px solid rgba(0, 140, 255, 0.22)",
    };

    return { card, btn, btnOn };
  }, []);

  return (
    <div style={styles.card}>
      <div style={{ fontSize: 13, fontWeight: 950, opacity: 0.98 }}>{label}</div>

      <button onClick={() => onChange(!value)} style={value ? styles.btnOn : styles.btn}>
        {value ? "ON" : "OFF"}
      </button>
    </div>
  );
}
