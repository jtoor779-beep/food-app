"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import supabase from "@/lib/supabase";

type HomepageCategoryRule = {
  id: string;
  label: string;
  kind: "restaurant" | "grocery";
  match_type: "cuisine" | "category";
  match_value: string;
  item_limit: number;
  sort_order: number;
  is_enabled: boolean;
};

const SETTINGS_KEY = "app_homepage_categories";

function uid() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function clean(value: any) {
  return String(value || "").trim();
}

function normalizeKey(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeRule(input: any): HomepageCategoryRule {
  const kind =
    String(input?.kind || "").trim().toLowerCase() === "grocery"
      ? "grocery"
      : "restaurant";

  const rawMatchType = String(input?.match_type || "").trim().toLowerCase();
  const match_type: "cuisine" | "category" =
    rawMatchType === "category" ? "category" : "cuisine";

  return {
    id: clean(input?.id) || uid(),
    label: clean(input?.label) || "Category",
    kind,
    match_type,
    match_value: clean(input?.match_value),
    item_limit: Math.max(1, Number(input?.item_limit || 8) || 8),
    sort_order: Number.isFinite(Number(input?.sort_order))
      ? Number(input?.sort_order)
      : 0,
    is_enabled: input?.is_enabled !== false,
  };
}

function normalizeRules(value: any): HomepageCategoryRule[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => normalizeRule(row))
    .filter((row) => !!clean(row.label) && !!clean(row.match_value))
    .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));
}

function uniqueSortedNames(values: any[]) {
  return Array.from(
    new Set(
      (values || [])
        .map((value) => clean(value))
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));
}

export default function AdminAppHomepageCategoriesPage() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const [rules, setRules] = useState<HomepageCategoryRule[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);

  const [ruleId, setRuleId] = useState("");
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<"restaurant" | "grocery">("restaurant");
  const [matchType, setMatchType] = useState<"cuisine" | "category">("cuisine");
  const [matchValue, setMatchValue] = useState("");
  const [itemLimit, setItemLimit] = useState("8");
  const [sortOrder, setSortOrder] = useState("0");
  const [isEnabled, setIsEnabled] = useState(true);

  function resetForm() {
    setRuleId("");
    setLabel("");
    setKind("restaurant");
    setMatchType("cuisine");
    setMatchValue("");
    setItemLimit("8");
    setSortOrder("0");
    setIsEnabled(true);
    setError("");
    setInfo("");
  }

  function loadIntoForm(row: HomepageCategoryRule) {
    setRuleId(String(row.id || ""));
    setLabel(String(row.label || ""));
    setKind(row.kind === "grocery" ? "grocery" : "restaurant");
    setMatchType(row.match_type === "category" ? "category" : "cuisine");
    setMatchValue(String(row.match_value || ""));
    setItemLimit(String(Number(row.item_limit || 8)));
    setSortOrder(String(Number(row.sort_order || 0)));
    setIsEnabled(row.is_enabled !== false);
    setError("");
    setInfo("");
  }

  async function loadCategoryOptions(nextKind: "restaurant" | "grocery") {
    setOptionsLoading(true);
    try {
      if (nextKind === "grocery") {
        const { data, error } = await supabase
          .from("grocery_items")
          .select("category")
          .limit(5000);

        if (error) {
          setError(`Category load failed: ${error.message}`);
          setCategoryOptions([]);
          return;
        }

        const names = uniqueSortedNames(
          (Array.isArray(data) ? data : []).map((row: any) => row?.category)
        );
        setCategoryOptions(names);
        return;
      }

      const { data, error } = await supabase
        .from("menu_items")
        .select("cuisine")
        .limit(5000);

      if (error) {
        setError(`Cuisine load failed: ${error.message}`);
        setCategoryOptions([]);
        return;
      }

      const names = uniqueSortedNames((Array.isArray(data) ? data : []).map((row: any) => row?.cuisine));
      setCategoryOptions(names);
    } finally {
      setOptionsLoading(false);
    }
  }

  async function loadRules(selectId?: string) {
    setLoading(true);
    setError("");
    setInfo("");

    try {
      const { data, error } = await supabase
        .from("system_settings")
        .select("key, value_json, updated_at")
        .eq("key", SETTINGS_KEY)
        .order("updated_at", { ascending: false })
        .limit(1);

      if (error) {
        setError(`Load failed: ${error.message}`);
        return;
      }

      const rows = Array.isArray(data) ? data : [];
      const latest = rows[0] || null;
      const nextRules = normalizeRules(latest?.value_json?.sections || []);

      setRules(nextRules);

      const desiredId = clean(selectId || ruleId);
      const picked =
        (desiredId &&
          nextRules.find((row) => String(row.id) === String(desiredId))) ||
        nextRules[0] ||
        null;

      if (picked) loadIntoForm(picked);
      else resetForm();
    } finally {
      setLoading(false);
    }
  }

  async function saveAllRules(
    nextRules: HomepageCategoryRule[],
    successMessage: string
  ) {
    setSaving(true);
    setError("");
    setInfo("");

    try {
      const payload = {
        sections: nextRules
          .map((row) => ({
            id: clean(row.id) || uid(),
            key: normalizeKey(row.label),
            label: clean(row.label),
            kind: row.kind === "grocery" ? "grocery" : "restaurant",
            match_type: row.match_type === "category" ? "category" : "cuisine",
            match_value: clean(row.match_value),
            item_limit: Math.max(1, Number(row.item_limit || 8) || 8),
            sort_order: Number.isFinite(Number(row.sort_order))
              ? Number(row.sort_order)
              : 0,
            is_enabled: row.is_enabled !== false,
          }))
          .filter((row) => !!row.label && !!row.match_value)
          .sort(
            (a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label)
          ),
      };

      const { data: existingRows, error: existingError } = await supabase
        .from("system_settings")
        .select("key, updated_at")
        .eq("key", SETTINGS_KEY)
        .order("updated_at", { ascending: false })
        .limit(1);

      if (existingError) {
        setError(`Settings lookup failed: ${existingError.message}`);
        return;
      }

      const existing = Array.isArray(existingRows) ? existingRows[0] : null;

      if (existing?.key) {
        const { error: updateError } = await supabase
          .from("system_settings")
          .update({
            value_json: payload,
            updated_at: new Date().toISOString(),
          })
          .eq("key", SETTINGS_KEY);

        if (updateError) {
          setError(`Save failed: ${updateError.message}`);
          return;
        }
      } else {
        const { error: insertError } = await supabase
          .from("system_settings")
          .insert({
            key: SETTINGS_KEY,
            value_json: payload,
            updated_at: new Date().toISOString(),
          });

        if (insertError) {
          setError(`Insert failed: ${insertError.message}`);
          return;
        }
      }

      setInfo(successMessage);
      await loadRules();
    } finally {
      setSaving(false);
    }
  }

  async function saveCurrentRule() {
    const nextLabel = clean(label);
    const nextMatchValue = clean(matchValue);

    if (!nextLabel) {
      setError("Please enter category label first.");
      return;
    }

    if (!nextMatchValue) {
      setError("Please select category first.");
      return;
    }

    const nextRule: HomepageCategoryRule = normalizeRule({
      id: clean(ruleId) || uid(),
      label: nextLabel,
      kind,
      match_type: matchType,
      match_value: nextMatchValue,
      item_limit: Number(itemLimit || 8),
      sort_order: Number(sortOrder || 0),
      is_enabled: isEnabled,
    });

    const nextRules = [...rules];
    const existingIndex = nextRules.findIndex(
      (row) => String(row.id) === String(nextRule.id)
    );

    if (existingIndex >= 0) {
      nextRules[existingIndex] = nextRule;
    } else {
      nextRules.push(nextRule);
    }

    await saveAllRules(
      nextRules.sort(
        (a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label)
      ),
      existingIndex >= 0
        ? "Homepage category updated successfully."
        : "Homepage category added successfully."
    );

    setRuleId(nextRule.id);
  }

  async function deleteCurrentRule(id: string) {
    if (!id) return;

    const ok = window.confirm(
      "Delete this App Homepage Category rule? This cannot be undone."
    );
    if (!ok) return;

    const nextRules = rules.filter((row) => String(row.id) !== String(id));
    await saveAllRules(nextRules, "Homepage category deleted successfully.");

    if (String(ruleId) === String(id)) {
      if (nextRules[0]) loadIntoForm(nextRules[0]);
      else resetForm();
    }
  }

  useEffect(() => {
    loadRules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadCategoryOptions(kind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  useEffect(() => {
    if (kind === "restaurant" && matchType !== "cuisine") {
      setMatchType("cuisine");
    }
    if (kind === "grocery" && matchType !== "category") {
      setMatchType("category");
    }
  }, [kind, matchType]);

  const selectedId = ruleId;

  const sortedPreview = useMemo(
    () =>
      [...rules].sort(
        (a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label)
      ),
    [rules]
  );

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
    background:
      "linear-gradient(135deg, rgba(255,140,0,1), rgba(255,220,160,0.95))",
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

  const smallLabel: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 900,
    opacity: 0.75,
    marginBottom: 6,
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontSize: 24, fontWeight: 950, letterSpacing: -0.3 }}>
            App Homepage Categories
          </div>
          <div
            style={{
              fontSize: 13,
              opacity: 0.75,
              marginTop: 4,
              lineHeight: 1.5,
            }}
          >
            Control which <b>restaurant cuisines</b> and <b>grocery categories</b>{" "}
            show on the app homepage, and how many items each section shows.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <Link href="/admin" style={btnGhost}>
            ← Back to Dashboard
          </Link>

          <button
            onClick={() => {
              loadRules();
              loadCategoryOptions(kind);
            }}
            style={btnGhost}
            disabled={loading || saving || optionsLoading}
          >
            {loading || optionsLoading ? "Loading..." : `Reload (${rules.length})`}
          </button>

          <button
            onClick={() => resetForm()}
            style={btnGhost}
            disabled={loading || saving}
            title="Create a new app homepage category rule"
          >
            ➕ Add New
          </button>

          <button
            onClick={saveCurrentRule}
            style={btnPrimary}
            disabled={saving || loading || optionsLoading}
          >
            {saving ? "Saving..." : ruleId ? "Save Changes" : "Save New Category"}
          </button>

          <div
            style={{
              ...pill,
              background: isEnabled
                ? "rgba(34,197,94,0.10)"
                : "rgba(239,68,68,0.10)",
            }}
          >
            {isEnabled ? "Enabled ✅" : "Disabled ❌"}
          </div>

          {ruleId ? (
            <button
              onClick={() => deleteCurrentRule(ruleId)}
              style={{
                ...btnGhost,
                border: "1px solid rgba(239,68,68,0.22)",
                background: "rgba(239,68,68,0.08)",
              }}
              disabled={saving}
              title="Delete selected App Homepage Category rule"
            >
              🗑️ Delete
            </button>
          ) : null}
        </div>
      </div>

      <div
        style={{
          ...card,
          display: "grid",
          gridTemplateColumns: "0.98fr 1.02fr",
          gap: 14,
        }}
      >
        <div
          style={{
            borderRadius: 18,
            border: "1px solid rgba(15,23,42,0.10)",
            background: "rgba(255,255,255,0.70)",
            boxShadow: "0 14px 36px rgba(15, 23, 42, 0.06)",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: 12, borderBottom: "1px solid rgba(15,23,42,0.08)" }}>
            <div style={{ fontSize: 12, fontWeight: 950, opacity: 0.9 }}>
              Homepage Category List
            </div>
            <div
              style={{
                fontSize: 12,
                opacity: 0.7,
                marginTop: 4,
                lineHeight: 1.4,
              }}
            >
              Click a row to edit. Sort Order decides section order on the app homepage.
            </div>
          </div>

          <div style={{ maxHeight: 420, overflow: "auto" }}>
            {sortedPreview.length === 0 ? (
              <div style={{ padding: 12, fontSize: 12, opacity: 0.75, fontWeight: 850 }}>
                No app homepage categories saved yet.
              </div>
            ) : (
              sortedPreview.map((row) => {
                const id = String(row.id || "");
                const isSel = selectedId && id === String(selectedId);

                return (
                  <button
                    key={id}
                    onClick={() => loadIntoForm(row)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: 12,
                      border: "none",
                      borderBottom: "1px solid rgba(15,23,42,0.06)",
                      background: isSel ? "rgba(255,140,0,0.10)" : "transparent",
                      cursor: "pointer",
                    }}
                    title={id}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                        alignItems: "center",
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 950, color: "#0F172A" }}>
                        📦 {row.label}{" "}
                        <span style={{ opacity: 0.7, fontWeight: 900 }}>
                          • {row.kind === "grocery" ? "Grocery" : "Restaurant"}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, opacity: 0.7, fontWeight: 900 }}>
                        Sort: {Number(row.sort_order ?? 0)}
                      </div>
                    </div>

                    <div
                      style={{
                        fontSize: 11,
                        opacity: 0.72,
                        marginTop: 5,
                        fontWeight: 800,
                      }}
                    >
                      Match: {row.match_type} = <b>{row.match_value}</b> • Limit:{" "}
                      {row.item_limit} • {row.is_enabled ? "Enabled" : "Disabled"}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div style={{ display: "grid", gap: 14 }}>
          <div
            style={{
              borderRadius: 18,
              border: "1px solid rgba(15,23,42,0.10)",
              background: "rgba(255,255,255,0.70)",
              boxShadow: "0 14px 36px rgba(15, 23, 42, 0.06)",
              padding: 14,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 950, opacity: 0.85 }}>
                Editing:{" "}
                <span style={{ opacity: 0.9 }}>
                  {ruleId
                    ? `Existing rule (${ruleId.slice(0, 8)}…)`
                    : "New rule (not saved yet)"}
                </span>
              </div>

              <button
                onClick={() => resetForm()}
                style={{ ...btnGhost, padding: "8px 10px" }}
                disabled={saving}
                title="Clear the form to create a new rule"
              >
                Clear Form
              </button>
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={smallLabel}>Section Label</div>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Fresh Vegetables"
                style={input}
              />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
                marginTop: 12,
              }}
            >
              <div>
                <div style={smallLabel}>Source Type</div>
                <select
                  value={kind}
                  onChange={(e) => {
                    const nextKind =
                      e.target.value === "grocery" ? "grocery" : "restaurant";
                    setKind(nextKind);
                    setMatchValue("");
                  }}
                  style={input}
                >
                  <option value="restaurant">Restaurant</option>
                  <option value="grocery">Grocery</option>
                </select>
              </div>

              <div>
                <div style={smallLabel}>Match Type</div>
                <select value={matchType} style={input} disabled>
                  {kind === "restaurant" ? (
                    <option value="cuisine">Cuisine</option>
                  ) : (
                    <option value="category">Category</option>
                  )}
                </select>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={smallLabel}>
                {kind === "restaurant"
                  ? "Restaurant Category / Cuisine"
                  : "Grocery Category"}
              </div>

              <select
                value={matchValue}
                onChange={(e) => {
                  const selected = e.target.value;
                  setMatchValue(selected);
                  if (!clean(label)) {
                    setLabel(selected);
                  }
                }}
                style={input}
                disabled={optionsLoading}
              >
                <option value="">
                  {optionsLoading
                    ? "Loading categories..."
                    : categoryOptions.length
                    ? "Select category"
                    : "No categories found"}
                </option>
                {categoryOptions.map((option) => (
                  <option key={`${kind}-${option}`} value={option}>
                    {option}
                  </option>
                ))}
              </select>

              <div style={{ fontSize: 12, opacity: 0.72, marginTop: 6, lineHeight: 1.5 }}>
                {kind === "restaurant"
                  ? "This dropdown is loaded live from menu_items.cuisine."
                  : "This dropdown is loaded live from grocery_items.category so homepage matching stays exact."}
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 12,
                marginTop: 12,
              }}
            >
              <div>
                <div style={smallLabel}>Item Limit</div>
                <input
                  value={itemLimit}
                  onChange={(e) => setItemLimit(e.target.value)}
                  placeholder="8"
                  style={input}
                  type="number"
                  min={1}
                />
              </div>

              <div>
                <div style={smallLabel}>Sort Order</div>
                <input
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                  placeholder="0"
                  style={input}
                  type="number"
                />
              </div>

              <div>
                <div style={smallLabel}>Enabled</div>
                <button
                  onClick={() => setIsEnabled((v) => !v)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 14,
                    border: "1px solid rgba(15,23,42,0.12)",
                    background: isEnabled
                      ? "rgba(34,197,94,0.10)"
                      : "rgba(239,68,68,0.10)",
                    fontWeight: 950,
                    cursor: "pointer",
                  }}
                >
                  {isEnabled ? "Enabled ✅" : "Disabled ❌"}
                </button>
              </div>
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

            {info ? (
              <div
                style={{
                  marginTop: 12,
                  padding: 12,
                  borderRadius: 14,
                  background: "rgba(34,197,94,0.10)",
                  border: "1px solid rgba(34,197,94,0.20)",
                  color: "#166534",
                  fontSize: 12,
                  fontWeight: 850,
                  lineHeight: 1.5,
                }}
              >
                {info}
              </div>
            ) : null}
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
            <div style={{ fontSize: 12, fontWeight: 950, opacity: 0.9 }}>
              Preview
            </div>

            <div
              style={{
                marginTop: 10,
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 999,
                  border: "1px solid rgba(15,23,42,0.12)",
                  background: isEnabled
                    ? "rgba(255,255,255,0.96)"
                    : "rgba(239,68,68,0.06)",
                  fontWeight: 950,
                  color: "#0F172A",
                }}
              >
                {label || "Category"}
              </div>

              <div style={{ fontSize: 12, opacity: 0.72, fontWeight: 850 }}>
                Type: <b>{kind}</b>
              </div>

              <div style={{ fontSize: 12, opacity: 0.72, fontWeight: 850 }}>
                Match: <b>{matchType}</b>
              </div>

              <div style={{ fontSize: 12, opacity: 0.72, fontWeight: 850 }}>
                Value: <b>{matchValue || "(empty)"}</b>
              </div>

              <div style={{ fontSize: 12, opacity: 0.72, fontWeight: 850 }}>
                Limit: <b>{Math.max(1, Number(itemLimit || 8) || 8)}</b>
              </div>
            </div>

            <div style={{ marginTop: 12, fontSize: 12, opacity: 0.72, lineHeight: 1.5 }}>
              Future owner-added categories will appear automatically here after reload, because this page reads live DB values.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}