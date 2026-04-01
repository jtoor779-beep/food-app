"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import supabase from "@/lib/supabase";

const DEFAULT_CONFIG = {
  section_title: "Recommended for you",
  section_subtitle: "Admin-managed picks from restaurants and groceries",
  menu_item_ids: [] as string[],
  grocery_item_ids: [] as string[],
};

type MenuItemRef = {
  id: string;
  name: string | null;
  restaurant_id: string | null;
  price?: number | null;
};

type GroceryItemRef = {
  id: string;
  name: string | null;
  store_id: string | null;
  price?: number | null;
};

function clean(value: unknown) {
  return String(value || "").trim();
}

function normalizeIdList(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value
    .map((item) => clean(item))
    .filter(Boolean)
    .filter((item, index, arr) => arr.indexOf(item) === index)
    .slice(0, 24);
}

function money(value: unknown) {
  const amount = Number(value || 0);
  return Number.isFinite(amount)
    ? amount.toLocaleString(undefined, { style: "currency", currency: "USD" })
    : "$0.00";
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
  const existing = await supabase
    .from("system_settings")
    .select("key", { count: "exact", head: true })
    .eq("key", key);

  if (existing.error) throw existing.error;

  if ((existing.count || 0) > 0) {
    const updated = await supabase
      .from("system_settings")
      .update({ value_json })
      .eq("key", key);

    if (updated.error) throw updated.error;
    return;
  }

  const inserted = await supabase
    .from("system_settings")
    .insert({ key, value_json });

  if (inserted.error) throw inserted.error;
}

export default function AdminMobileRecommendedPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [menuItems, setMenuItems] = useState<MenuItemRef[]>([]);
  const [groceryItems, setGroceryItems] = useState<GroceryItemRef[]>([]);
  const [selectedMenuId, setSelectedMenuId] = useState("");
  const [selectedGroceryId, setSelectedGroceryId] = useState("");

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);

        const [setting, menuRes, groceryRes] = await Promise.all([
          loadSetting("mobile_recommended"),
          supabase
            .from("menu_items")
            .select("id, name, restaurant_id, price")
            .order("name", { ascending: true })
            .limit(5000),
          supabase
            .from("grocery_items")
            .select("id, name, store_id, price")
            .order("name", { ascending: true })
            .limit(5000),
        ]);

        if (!alive) return;

        const value = (setting as any)?.value_json || {};

        setConfig({
          section_title:
            clean(value?.section_title || DEFAULT_CONFIG.section_title) ||
            DEFAULT_CONFIG.section_title,
          section_subtitle:
            clean(value?.section_subtitle || DEFAULT_CONFIG.section_subtitle) ||
            DEFAULT_CONFIG.section_subtitle,
          menu_item_ids: normalizeIdList(value?.menu_item_ids),
          grocery_item_ids: normalizeIdList(value?.grocery_item_ids),
        });

        setMenuItems(Array.isArray(menuRes.data) ? (menuRes.data as any) : []);
        setGroceryItems(Array.isArray(groceryRes.data) ? (groceryRes.data as any) : []);
      } catch (err: any) {
        if (!alive) return;
        setError(err?.message || "Unable to load mobile recommended settings.");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const menuMap = useMemo(
    () => new Map(menuItems.map((item) => [String(item.id), item])),
    [menuItems]
  );

  const groceryMap = useMemo(
    () => new Map(groceryItems.map((item) => [String(item.id), item])),
    [groceryItems]
  );

  function addMenuItem() {
    if (!selectedMenuId) return;

    setConfig((prev) => ({
      ...prev,
      menu_item_ids: normalizeIdList([...prev.menu_item_ids, selectedMenuId]),
    }));

    setSelectedMenuId("");
  }

  function addGroceryItem() {
    if (!selectedGroceryId) return;

    setConfig((prev) => ({
      ...prev,
      grocery_item_ids: normalizeIdList([...prev.grocery_item_ids, selectedGroceryId]),
    }));

    setSelectedGroceryId("");
  }

  async function save() {
    try {
      setSaving(true);
      setError("");
      setMessage("");

      await saveSetting("mobile_recommended", {
        section_title: clean(config.section_title) || DEFAULT_CONFIG.section_title,
        section_subtitle:
          clean(config.section_subtitle) || DEFAULT_CONFIG.section_subtitle,
        menu_item_ids: normalizeIdList(config.menu_item_ids),
        grocery_item_ids: normalizeIdList(config.grocery_item_ids),
      });

      setMessage("Mobile recommended items saved.");
    } catch (err: any) {
      setError(err?.message || "Unable to save mobile recommended settings.");
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

  const pillStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    alignItems: "center",
    padding: "10px 12px",
    borderRadius: 14,
    background: "#F8FAFC",
    border: "1px solid rgba(15, 23, 42, 0.08)",
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontSize: 24, fontWeight: 950 }}>Mobile Recommended</div>
          <div style={{ fontSize: 13, opacity: 0.72, marginTop: 4 }}>
            Controls the customer app recommended items section only.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/admin/mobile-home" style={ghostBtn}>
            Back to Mobile Home
          </Link>
          <button style={primaryBtn} onClick={save} disabled={saving || loading}>
            {saving ? "Saving..." : "Save Mobile Recommended"}
          </button>
        </div>
      </div>

      {error ? (
        <div style={{ ...cardStyle, color: "#b91c1c", fontWeight: 900 }}>{error}</div>
      ) : null}

      {message ? (
        <div style={{ ...cardStyle, color: "#166534", fontWeight: 900 }}>{message}</div>
      ) : null}

      <div style={{ ...cardStyle, display: "grid", gap: 14 }}>
        <div style={{ fontSize: 18, fontWeight: 900 }}>Section copy</div>

        <div>
          <div style={labelStyle}>Section title</div>
          <input
            value={config.section_title}
            onChange={(e) =>
              setConfig((prev) => ({ ...prev, section_title: e.target.value }))
            }
            style={inputStyle}
          />
        </div>

        <div>
          <div style={labelStyle}>Section subtitle</div>
          <input
            value={config.section_subtitle}
            onChange={(e) =>
              setConfig((prev) => ({ ...prev, section_subtitle: e.target.value }))
            }
            style={inputStyle}
          />
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 16,
        }}
      >
        <div style={{ ...cardStyle, display: "grid", gap: 14 }}>
          <div style={{ fontSize: 18, fontWeight: 900 }}>Restaurant items</div>

          <div style={{ display: "flex", gap: 10 }}>
            <select
              value={selectedMenuId}
              onChange={(e) => setSelectedMenuId(e.target.value)}
              style={{ ...inputStyle, flex: 1 }}
            >
              <option value="">Select restaurant item...</option>
              {menuItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name || "Item"} - {money(item.price)}
                </option>
              ))}
            </select>

            <button type="button" onClick={addMenuItem} style={primaryBtn}>
              Add
            </button>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {config.menu_item_ids.length === 0 ? (
              <div style={{ fontSize: 13, opacity: 0.72, fontWeight: 800 }}>
                No restaurant items selected yet.
              </div>
            ) : (
              config.menu_item_ids.map((id) => {
                const item = menuMap.get(id);

                return (
                  <div key={id} style={pillStyle}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 900 }}>{item?.name || id}</div>
                      <div style={{ fontSize: 12, opacity: 0.72 }}>
                        {money(item?.price)}
                      </div>
                    </div>

                    <button
                      type="button"
                      style={ghostBtn}
                      onClick={() =>
                        setConfig((prev) => ({
                          ...prev,
                          menu_item_ids: prev.menu_item_ids.filter((row) => row !== id),
                        }))
                      }
                    >
                      Remove
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div style={{ ...cardStyle, display: "grid", gap: 14 }}>
          <div style={{ fontSize: 18, fontWeight: 900 }}>Grocery items</div>

          <div style={{ display: "flex", gap: 10 }}>
            <select
              value={selectedGroceryId}
              onChange={(e) => setSelectedGroceryId(e.target.value)}
              style={{ ...inputStyle, flex: 1 }}
            >
              <option value="">Select grocery item...</option>
              {groceryItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name || "Item"} - {money(item.price)}
                </option>
              ))}
            </select>

            <button type="button" onClick={addGroceryItem} style={primaryBtn}>
              Add
            </button>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {config.grocery_item_ids.length === 0 ? (
              <div style={{ fontSize: 13, opacity: 0.72, fontWeight: 800 }}>
                No grocery items selected yet.
              </div>
            ) : (
              config.grocery_item_ids.map((id) => {
                const item = groceryMap.get(id);

                return (
                  <div key={id} style={pillStyle}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 900 }}>{item?.name || id}</div>
                      <div style={{ fontSize: 12, opacity: 0.72 }}>
                        {money(item?.price)}
                      </div>
                    </div>

                    <button
                      type="button"
                      style={ghostBtn}
                      onClick={() =>
                        setConfig((prev) => ({
                          ...prev,
                          grocery_item_ids: prev.grocery_item_ids.filter(
                            (row) => row !== id
                          ),
                        }))
                      }
                    >
                      Remove
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ ...cardStyle, fontWeight: 800 }}>
          Loading mobile recommended settings...
        </div>
      ) : null}
    </div>
  );
}
