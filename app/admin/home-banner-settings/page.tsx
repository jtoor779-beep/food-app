"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import supabase from "@/lib/supabase";

type BannerAnimation = "none" | "fade" | "slide-left" | "slide-up" | "zoom-in";

type BannerSettings = {
  animation: BannerAnimation;
  duration_ms: number;
};

const DEFAULT_SETTINGS: BannerSettings = {
  animation: "none",
  duration_ms: 800,
};

function clampDuration(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.duration_ms;
  return Math.max(200, Math.min(3000, Math.round(n)));
}

function normalizeAnimation(v: unknown): BannerAnimation {
  const s = String(v || "").trim().toLowerCase();
  if (s === "fade") return "fade";
  if (s === "slide-left") return "slide-left";
  if (s === "slide-up") return "slide-up";
  if (s === "zoom-in") return "zoom-in";
  return "none";
}

export default function AdminHomeBannerSettingsPage() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [animation, setAnimation] = useState<BannerAnimation>(DEFAULT_SETTINGS.animation);
  const [durationMs, setDurationMs] = useState<number>(DEFAULT_SETTINGS.duration_ms);

  async function loadSettings() {
    setLoading(true);
    setError("");
    try {
      const { data, error: qErr } = await supabase
        .from("system_settings")
        .select("key, value_json")
        .eq("key", "home_banner_settings")
        .maybeSingle();

      if (qErr) {
        setError(`Load failed: ${qErr.message}`);
        return;
      }

      const cfg = (data as any)?.value_json || {};
      setAnimation(normalizeAnimation(cfg?.animation));
      setDurationMs(clampDuration(cfg?.duration_ms));
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    setSaving(true);
    setError("");
    try {
      const payload = {
        key: "home_banner_settings",
        value_json: {
          animation: normalizeAnimation(animation),
          duration_ms: clampDuration(durationMs),
        },
        updated_at: new Date().toISOString(),
      } as any;

      const { error: sErr } = await supabase.from("system_settings").upsert(payload, { onConflict: "key" });
      if (sErr) {
        setError(`Save failed: ${sErr.message}`);
        return;
      }

      try {
        localStorage.setItem("hf_home_banner_fx", JSON.stringify({ animation: normalizeAnimation(animation), duration_ms: clampDuration(durationMs) }));
      } catch {}

      await loadSettings();
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    loadSettings();
  }, []);

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

  const input: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid rgba(15,23,42,0.12)",
    outline: "none",
    background: "rgba(255,255,255,0.95)",
    fontWeight: 700,
  };

  const label: React.CSSProperties = { fontSize: 12, fontWeight: 900, opacity: 0.75, marginBottom: 6 };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 950, letterSpacing: -0.3 }}>Home Banner Settings</div>
          <div style={{ fontSize: 13, opacity: 0.75, marginTop: 4, lineHeight: 1.5 }}>
            Separate controls for homepage hero banner animation.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Link href="/admin/home-banner" style={btnGhost}>
            ? Back to Home Banner
          </Link>

          <button onClick={loadSettings} style={btnGhost} disabled={loading || saving}>
            {loading ? "Loading..." : "Reload Settings"}
          </button>

          <button onClick={saveSettings} style={btnPrimary} disabled={loading || saving}>
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </div>

      <div style={card}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <div style={label}>Animation Type</div>
            <select value={animation} onChange={(e) => setAnimation(normalizeAnimation(e.target.value))} style={{ ...input, cursor: "pointer" }}>
              <option value="none">None</option>
              <option value="fade">Fade</option>
              <option value="slide-left">Slide Left</option>
              <option value="slide-up">Slide Up</option>
              <option value="zoom-in">Zoom In</option>
            </select>

            <div style={{ marginTop: 12 }}>
              <div style={label}>Animation Duration (ms)</div>
              <input
                type="number"
                min={200}
                max={3000}
                step={50}
                value={durationMs}
                onChange={(e) => setDurationMs(clampDuration(e.target.value))}
                style={input}
              />
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
            <div style={{ fontSize: 12, fontWeight: 950, opacity: 0.85 }}>Current</div>
            <div style={{ marginTop: 8, fontSize: 13, fontWeight: 850, opacity: 0.78 }}>
              Animation: <b>{animation}</b>
            </div>
            <div style={{ marginTop: 6, fontSize: 13, fontWeight: 850, opacity: 0.78 }}>
              Duration: <b>{durationMs}ms</b>
            </div>

            {error ? (
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
                {error}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}










