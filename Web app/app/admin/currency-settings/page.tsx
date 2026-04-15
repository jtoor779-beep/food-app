"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import supabase from "@/lib/supabase";

export default function AdminCurrencySettingsPage() {
  const [currencyLoading, setCurrencyLoading] = useState(false);
  const [currencySaving, setCurrencySaving] = useState(false);
  const [currencyError, setCurrencyError] = useState("");
  const [defaultCurrency, setDefaultCurrency] = useState<"USD" | "INR">("USD");

  async function loadDefaultCurrencyFromSettings() {
    setCurrencyLoading(true);
    setCurrencyError("");
    try {
      const { data, error } = await supabase
        .from("system_settings")
        .select("key, default_currency")
        .eq("key", "global")
        .maybeSingle();

      if (error) {
        setCurrencyError(`Currency settings load failed: ${error.message}`);
        return;
      }

      const c = String((data as any)?.default_currency || "USD").toUpperCase();
      setDefaultCurrency(c === "INR" ? "INR" : "USD");
    } finally {
      setCurrencyLoading(false);
    }
  }

  async function saveDefaultCurrencyToSettings() {
    setCurrencySaving(true);
    setCurrencyError("");
    try {
      const { error } = await supabase
        .from("system_settings")
        .upsert(
          {
            key: "global",
            default_currency: defaultCurrency,
            updated_at: new Date().toISOString(),
          } as any,
          { onConflict: "key" }
        );

      if (error) {
        setCurrencyError(`Currency save failed: ${error.message}`);
        return;
      }

      await loadDefaultCurrencyFromSettings();
    } finally {
      setCurrencySaving(false);
    }
  }

  useEffect(() => {
    loadDefaultCurrencyFromSettings();
  }, []);

  const wrap: React.CSSProperties = {
    display: "grid",
    gap: 14,
  };

  const card: React.CSSProperties = {
    padding: 16,
    borderRadius: 18,
    background: "#FFFFFF",
    border: "1px solid rgba(15, 23, 42, 0.10)",
    boxShadow: "0 14px 36px rgba(15, 23, 42, 0.08)",
  };

  const btnPrimary: React.CSSProperties = {
    padding: "10px 14px",
    borderRadius: 14,
    background: "linear-gradient(135deg, rgba(255,140,0,1), rgba(255,220,160,0.95))",
    border: "1px solid rgba(255,140,0,0.35)",
    color: "#0B1220",
    fontWeight: 950,
    cursor: "pointer",
    boxShadow: "0 14px 36px rgba(255,140,0,0.14)",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  };

  const btnGhost: React.CSSProperties = {
    padding: "10px 12px",
    borderRadius: 14,
    background: "rgba(255,255,255,0.85)",
    border: "1px solid rgba(15, 23, 42, 0.12)",
    color: "#0B1220",
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: "0 10px 26px rgba(15,23,42,0.06)",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  };

  const pill: React.CSSProperties = {
    padding: "10px 12px",
    borderRadius: 16,
    background: "rgba(255,255,255,0.88)",
    border: "1px solid rgba(15, 23, 42, 0.10)",
    fontSize: 12,
    fontWeight: 900,
    opacity: 0.9,
    height: "fit-content",
    boxShadow: "0 10px 26px rgba(15,23,42,0.06)",
  };

  const input: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid rgba(15,23,42,0.12)",
    outline: "none",
    background: "rgba(255,255,255,0.95)",
    fontWeight: 700,
  };

  const select: React.CSSProperties = {
    ...input,
    cursor: "pointer",
  };

  const smallLabel: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 900,
    opacity: 0.75,
    marginBottom: 6,
  };

  return (
    <div style={wrap}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 4, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 950, letterSpacing: -0.3 }}>Currency Settings</div>
          <div style={{ fontSize: 13, opacity: 0.75, marginTop: 4, lineHeight: 1.5 }}>
            Controls the global default currency used across the app.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Link href="/admin" style={btnGhost}>
            ← Back to Dashboard
          </Link>

          <button onClick={loadDefaultCurrencyFromSettings} style={btnGhost} disabled={currencyLoading || currencySaving}>
            {currencyLoading ? "Loading..." : "Reload Settings"}
          </button>

          <button onClick={saveDefaultCurrencyToSettings} style={btnPrimary} disabled={currencySaving || currencyLoading}>
            {currencySaving ? "Saving..." : "Save Settings"}
          </button>

          <div style={pill}>
            Default Currency: <b>{defaultCurrency}</b>
          </div>
        </div>
      </div>

      <div style={card}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <div style={smallLabel}>Default Currency</div>
            <select
              value={defaultCurrency}
              onChange={(e) =>
                setDefaultCurrency(
                  (String(e.target.value || "USD").toUpperCase() === "INR" ? "INR" : "USD") as any
                )
              }
              style={select}
              disabled={currencySaving || currencyLoading}
            >
              <option value="USD">USD ($)</option>
              <option value="INR">INR (₹)</option>
            </select>

            <div style={{ fontSize: 12, opacity: 0.72, marginTop: 8, lineHeight: 1.5 }}>
              This is the global default currency. Customer app pages can read this value and use it as the main app currency.
            </div>
          </div>

          <div
            style={{
              borderRadius: 18,
              border: "1px solid rgba(15,23,42,0.10)",
              background: "rgba(255,255,255,0.70)",
              boxShadow: "0 14px 36px rgba(15, 23, 42, 0.06)",
              padding: 14,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 950, opacity: 0.85 }}>Status</div>
            <div style={{ marginTop: 8, fontSize: 12, fontWeight: 900, opacity: 0.75 }}>
              {currencyLoading ? "Loading settings…" : currencySaving ? "Saving settings…" : "Ready ✅"}
            </div>

            {currencyError ? (
              <div
                style={{
                  marginTop: 12,
                  padding: 12,
                  borderRadius: 14,
                  background: "rgba(239,68,68,0.08)",
                  border: "1px solid rgba(239,68,68,0.20)",
                  color: "#7F1D1D",
                  fontSize: 12,
                  fontWeight: 850,
                  lineHeight: 1.5,
                }}
              >
                {currencyError}
                <div style={{ marginTop: 6, fontWeight: 750, opacity: 0.9 }}>
                  If this says “permission denied” → add RLS policy for admins on <b>system_settings</b>.
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
