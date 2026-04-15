"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import supabase from "@/lib/supabase";

const DEFAULT_CONFIG = {
  app_title: "Homyfod",
  app_subtitle: "Food & groceries delivered to your door",
  search_placeholder: "Search food, groceries, restaurants...",
  location_title: "Delivery Location",
  location_empty: "Set your delivery address",
  hero_title: "Welcome to Homyfod",
  hero_subtitle: "Order from local restaurants and Indian grocery stores in one app.",
  hero_button_label: "Start Exploring",
  browse_title: "Browse by Category",
  popular_title: "Popular This Week",
  popular_subtitle: "Admin-picked food and grocery favorites",
  category_cards: [
    { key: "food", label: "Food", subtitle: "Restaurants & dishes", icon: "restaurant-outline", action: "restaurants" },
    { key: "groceries", label: "Groceries", subtitle: "Stores & essentials", icon: "cart-outline", action: "groceries" },
  ],
};

function safeCards(value: any) {
  const rows = Array.isArray(value) ? value : [];
  if (!rows.length) return DEFAULT_CONFIG.category_cards;
  return rows.slice(0, 2).map((row: any, index: number) => ({
    key: String(row?.key || `card_${index + 1}`),
    label: String(row?.label || `Card ${index + 1}`),
    subtitle: String(row?.subtitle || ""),
    icon: String(row?.icon || ""),
    action: String(row?.action || row?.key || ""),
  }));
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

export default function AdminMobileHomePage() {
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
        const data = await loadSetting("mobile_home");
        if (!alive) return;
        const value = (data as any)?.value_json || {};
        setConfig({
          ...DEFAULT_CONFIG,
          ...value,
          category_cards: safeCards(value?.category_cards),
        });
      } catch (err: any) {
        if (!alive) return;
        setError(err?.message || "Unable to load mobile home settings.");
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
        category_cards: safeCards(config?.category_cards),
      };
      await saveSetting("mobile_home", value_json);
      setMessage("Mobile home settings saved.");
    } catch (err: any) {
      setError(err?.message || "Unable to save mobile home settings.");
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

  const ghostBtn: React.CSSProperties = {
    padding: "10px 12px",
    borderRadius: 14,
    background: "rgba(255,255,255,0.85)",
    border: "1px solid rgba(15, 23, 42, 0.12)",
    color: "#0B1220",
    fontWeight: 900,
    cursor: "pointer",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
  };

  const primaryBtn: React.CSSProperties = {
    padding: "10px 14px",
    borderRadius: 14,
    background: "linear-gradient(135deg, rgba(255,140,0,1), rgba(255,220,160,0.95))",
    border: "1px solid rgba(255,140,0,0.35)",
    color: "#0B1220",
    fontWeight: 950,
    cursor: "pointer",
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 950 }}>Mobile Home</div>
          <div style={{ fontSize: 13, opacity: 0.72, marginTop: 4 }}>
            Controls the customer app home page only. Hero media comes from <b>Home Banner</b>, and popular items come from <b>Mobile Popular</b>.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/admin/home-banner" style={ghostBtn}>Open Home Banner</Link>
          <Link href="/admin/mobile-popular" style={ghostBtn}>Open Mobile Popular</Link>
          <Link href="/admin/mobile-recommended" style={ghostBtn}>Open Mobile Recommended</Link>
          <button style={primaryBtn} onClick={save} disabled={saving || loading}>
            {saving ? "Saving..." : "Save Mobile Home"}
          </button>
        </div>
      </div>

      {error ? <div style={{ ...cardStyle, color: "#b91c1c", fontWeight: 900 }}>{error}</div> : null}
      {message ? <div style={{ ...cardStyle, color: "#166534", fontWeight: 900 }}>{message}</div> : null}

      <div style={{ ...cardStyle, display: "grid", gap: 14 }}>
        <div style={{ fontSize: 18, fontWeight: 900 }}>Main copy</div>

        {[
          ["App title", "app_title"],
          ["App subtitle", "app_subtitle"],
          ["Search placeholder", "search_placeholder"],
          ["Location title", "location_title"],
          ["Location empty text", "location_empty"],
          ["Hero title", "hero_title"],
          ["Hero subtitle", "hero_subtitle"],
          ["Hero button label", "hero_button_label"],
          ["Browse title", "browse_title"],
          ["Popular title", "popular_title"],
          ["Popular subtitle", "popular_subtitle"],
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
      </div>

      <div style={{ ...cardStyle, display: "grid", gap: 14 }}>
        <div style={{ fontSize: 18, fontWeight: 900 }}>Browse by category cards</div>
        <div style={{ fontSize: 13, opacity: 0.72 }}>
          Recommended actions: <b>restaurants</b> and <b>groceries</b>.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 14 }}>
          {safeCards(config?.category_cards).map((card: any, index: number) => (
            <div key={`${card.key}-${index}`} style={{ padding: 14, borderRadius: 16, background: "#F8FAFC", border: "1px solid rgba(15,23,42,0.08)", display: "grid", gap: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 900 }}>Card {index + 1}</div>
              <div>
                <div style={labelStyle}>Key</div>
                <input
                  value={card.key}
                  onChange={(e) =>
                    setConfig((prev: any) => {
                      const next = safeCards(prev?.category_cards);
                      next[index] = { ...next[index], key: e.target.value };
                      return { ...prev, category_cards: next };
                    })
                  }
                  style={inputStyle}
                />
              </div>
              <div>
                <div style={labelStyle}>Label</div>
                <input
                  value={card.label}
                  onChange={(e) =>
                    setConfig((prev: any) => {
                      const next = safeCards(prev?.category_cards);
                      next[index] = { ...next[index], label: e.target.value };
                      return { ...prev, category_cards: next };
                    })
                  }
                  style={inputStyle}
                />
              </div>
              <div>
                <div style={labelStyle}>Subtitle</div>
                <input
                  value={card.subtitle}
                  onChange={(e) =>
                    setConfig((prev: any) => {
                      const next = safeCards(prev?.category_cards);
                      next[index] = { ...next[index], subtitle: e.target.value };
                      return { ...prev, category_cards: next };
                    })
                  }
                  style={inputStyle}
                />
              </div>
              <div>
                <div style={labelStyle}>Icon</div>
                <input
                  value={card.icon}
                  onChange={(e) =>
                    setConfig((prev: any) => {
                      const next = safeCards(prev?.category_cards);
                      next[index] = { ...next[index], icon: e.target.value };
                      return { ...prev, category_cards: next };
                    })
                  }
                  style={inputStyle}
                />
              </div>
              <div>
                <div style={labelStyle}>Action</div>
                <input
                  value={card.action}
                  onChange={(e) =>
                    setConfig((prev: any) => {
                      const next = safeCards(prev?.category_cards);
                      next[index] = { ...next[index], action: e.target.value };
                      return { ...prev, category_cards: next };
                    })
                  }
                  style={inputStyle}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {loading ? <div style={{ ...cardStyle, fontWeight: 800 }}>Loading mobile home settings...</div> : null}
    </div>
  );
}
