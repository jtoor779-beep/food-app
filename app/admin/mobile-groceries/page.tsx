"use client";

import React, { useEffect, useState } from "react";
import supabase from "@/lib/supabase";

const DEFAULT_CONFIG = {
  page_title: "Groceries",
  page_subtitle: "Clean store browsing for pantry, produce, and drinks.",
  search_placeholder: "Search grocery stores",
  hero_eyebrow: "MARKET PICKUP",
  hero_title: "Stock up faster with stores customers trust.",
  hero_subtitle:
    "Fresh produce, pantry essentials, frozen favorites, and local grocery shops in one smooth mobile flow.",
  hero_tags: ["Fresh picks", "Same-day staples", "Indian groceries"],
  section_title: "Stores near you",
};

function safeTags(value: any) {
  const rows = Array.isArray(value) ? value : [];
  const cleaned = rows.map((row) => String(row || "").trim()).filter(Boolean).slice(0, 4);
  return cleaned.length ? cleaned : DEFAULT_CONFIG.hero_tags;
}

async function loadSetting(key: string) {
  const { data, error } = await supabase
    .from("system_settings")
    .select("key, value_json")
    .eq("key", key)
    .limit(20);
  if (error) throw error;
  return Array.isArray(data) ? data[data.length - 1] || data[0] : null;
}

async function saveSetting(key: string, value_json: any) {
  const updated = await supabase
    .from("system_settings")
    .update({ value_json })
    .eq("key", key);
  if (!updated.error) return;

  const inserted = await supabase.from("system_settings").insert({ key, value_json });
  if (inserted.error) throw inserted.error;
}

export default function AdminMobileGroceriesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [config, setConfig] = useState<any>(DEFAULT_CONFIG);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const data = await loadSetting("mobile_groceries");
        if (!alive) return;
        const value = (data as any)?.value_json || {};
        setConfig({
          ...DEFAULT_CONFIG,
          ...value,
          hero_tags: safeTags(value?.hero_tags),
        });
      } catch (err: any) {
        if (!alive) return;
        setError(err?.message || "Unable to load mobile groceries settings.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function save() {
    try {
      setSaving(true);
      setError("");
      setMessage("");
      const value_json = {
        ...config,
        hero_tags: safeTags(config?.hero_tags),
      };
      await saveSetting("mobile_groceries", value_json);
      setMessage("Mobile groceries page saved.");
    } catch (err: any) {
      setError(err?.message || "Unable to save mobile groceries settings.");
    } finally {
      setSaving(false);
    }
  }

  const cardStyle: React.CSSProperties = {
    padding: 16,
    borderRadius: 18,
    background: "#FFFFFF",
    border: "1px solid rgba(15, 23, 42, 0.10)",
    boxShadow: "0 14px 36px rgba(15, 23, 42, 0.08)",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid rgba(15,23,42,0.12)",
    outline: "none",
    background: "rgba(255,255,255,0.95)",
    fontWeight: 700,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 900,
    opacity: 0.75,
    marginBottom: 6,
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 950 }}>Mobile Groceries</div>
          <div style={{ fontSize: 13, opacity: 0.72, marginTop: 4 }}>
            Controls the customer app groceries listing page hero, search copy, and section labels only.
          </div>
        </div>
        <button
          style={{
            padding: "10px 14px",
            borderRadius: 14,
            background: "linear-gradient(135deg, rgba(255,140,0,1), rgba(255,220,160,0.95))",
            border: "1px solid rgba(255,140,0,0.35)",
            color: "#0B1220",
            fontWeight: 950,
            cursor: "pointer",
          }}
          onClick={save}
          disabled={saving || loading}
        >
          {saving ? "Saving..." : "Save Mobile Groceries"}
        </button>
      </div>

      {error ? <div style={{ ...cardStyle, color: "#b91c1c", fontWeight: 900 }}>{error}</div> : null}
      {message ? <div style={{ ...cardStyle, color: "#166534", fontWeight: 900 }}>{message}</div> : null}

      <div style={{ ...cardStyle, display: "grid", gap: 14 }}>
        {[
          ["Page title", "page_title"],
          ["Page subtitle", "page_subtitle"],
          ["Search placeholder", "search_placeholder"],
          ["Hero eyebrow", "hero_eyebrow"],
          ["Hero title", "hero_title"],
          ["Hero subtitle", "hero_subtitle"],
          ["Section title", "section_title"],
        ].map(([label, key]) => (
          <div key={key}>
            <div style={labelStyle}>{label}</div>
            <input
              value={String(config?.[key] || "")}
              onChange={(e) => setConfig((prev: any) => ({ ...prev, [key]: e.target.value }))}
              style={inputStyle}
            />
          </div>
        ))}

        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ ...labelStyle, marginBottom: 0 }}>Hero tags</div>
          {safeTags(config?.hero_tags).map((tag, index) => (
            <input
              key={`${tag}-${index}`}
              value={tag}
              onChange={(e) =>
                setConfig((prev: any) => {
                  const next = safeTags(prev?.hero_tags);
                  next[index] = e.target.value;
                  return { ...prev, hero_tags: next };
                })
              }
              style={inputStyle}
            />
          ))}
        </div>
      </div>

      {loading ? <div style={{ ...cardStyle, fontWeight: 800 }}>Loading mobile groceries settings...</div> : null}
    </div>
  );
}
