"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import supabase from "@/lib/supabase";

function normalizeFilterKey(v: string) {
  return String(v || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

type HomeFilterCategoryRow = {
  id: string;
  key: string | null;
  label: string | null;
  sort_order: number | null;
  is_enabled: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export default function AdminHomeFiltersPage() {
  const [filterCatsLoading, setFilterCatsLoading] = useState(false);
  const [filterCatsSaving, setFilterCatsSaving] = useState(false);
  const [filterCatsError, setFilterCatsError] = useState<string>("");
  const [homeFilterCats, setHomeFilterCats] = useState<HomeFilterCategoryRow[]>([]);
  const [filterCatId, setFilterCatId] = useState<string>("");
  const [filterCatLabel, setFilterCatLabel] = useState<string>("");
  const [filterCatKey, setFilterCatKey] = useState<string>("");
  const [filterCatSortOrder, setFilterCatSortOrder] = useState<string>("0");
  const [filterCatEnabled, setFilterCatEnabled] = useState<boolean>(true);

  function resetFilterCategoryForm() {
    setFilterCatId("");
    setFilterCatLabel("");
    setFilterCatKey("");
    setFilterCatSortOrder("0");
    setFilterCatEnabled(true);
    setFilterCatsError("");
  }

  function loadFilterCategoryIntoForm(row: HomeFilterCategoryRow) {
    setFilterCatId(String(row?.id || ""));
    setFilterCatLabel(String(row?.label || ""));
    setFilterCatKey(String(row?.key || ""));
    setFilterCatSortOrder(String(Number(row?.sort_order ?? 0)));
    setFilterCatEnabled(row?.is_enabled !== false);
    setFilterCatsError("");
  }

  async function loadHomeFilterCategories(selectId?: string) {
    setFilterCatsLoading(true);
    setFilterCatsError("");
    try {
      const { data, error } = await supabase
        .from("home_filter_categories")
        .select("id, key, label, sort_order, is_enabled, created_at, updated_at")
        .order("sort_order", { ascending: true })
        .order("updated_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) {
        setFilterCatsError(`Home filter categories load failed: ${error.message}`);
        return;
      }

      const rows: HomeFilterCategoryRow[] = Array.isArray(data) ? (data as any) : [];
      setHomeFilterCats(rows);

      const desiredId = selectId || filterCatId;
      const pick = (desiredId && rows.find((r) => String(r.id) === String(desiredId))) || (rows.length ? rows[0] : null);

      if (pick) loadFilterCategoryIntoForm(pick);
      else resetFilterCategoryForm();
    } finally {
      setFilterCatsLoading(false);
    }
  }

  async function saveHomeFilterCategory() {
    setFilterCatsSaving(true);
    setFilterCatsError("");
    try {
      const label = String(filterCatLabel || "").trim();
      const rawKey = String(filterCatKey || "").trim();
      const key = normalizeFilterKey(rawKey || label);
      const sortOrderNum = Number(filterCatSortOrder || 0);

      if (!label) {
        setFilterCatsError("Please enter a filter label first.");
        return;
      }

      if (!key) {
        setFilterCatsError("Filter key is invalid. Use letters, numbers, or spaces only.");
        return;
      }

      const payload: any = {
        key,
        label,
        sort_order: Number.isFinite(sortOrderNum) ? sortOrderNum : 0,
        is_enabled: Boolean(filterCatEnabled),
      };

      if (filterCatId) {
        const { error } = await supabase.from("home_filter_categories").update(payload).eq("id", filterCatId);
        if (error) {
          setFilterCatsError(`Save failed: ${error.message}`);
          return;
        }
        await loadHomeFilterCategories(filterCatId);
      } else {
        const { data, error } = await supabase.from("home_filter_categories").insert(payload).select("id").limit(1);
        if (error) {
          setFilterCatsError(`Insert failed: ${error.message}`);
          return;
        }
        const newId = Array.isArray(data) && data[0]?.id ? String(data[0].id) : "";
        await loadHomeFilterCategories(newId || undefined);
      }
    } finally {
      setFilterCatsSaving(false);
    }
  }

  async function deleteHomeFilterCategory(id: string) {
    if (!id) return;
    const ok = window.confirm("Delete this Home filter category? This cannot be undone.");
    if (!ok) return;

    setFilterCatsSaving(true);
    setFilterCatsError("");
    try {
      const { error } = await supabase.from("home_filter_categories").delete().eq("id", id);
      if (error) {
        setFilterCatsError(`Delete failed: ${error.message}`);
        return;
      }
      const nextId = filterCatId === id ? undefined : filterCatId;
      await loadHomeFilterCategories(nextId);
    } finally {
      setFilterCatsSaving(false);
    }
  }

  useEffect(() => {
    loadHomeFilterCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setFilterCatKey(normalizeFilterKey(filterCatKey || filterCatLabel));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterCatLabel]);

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

  const smallLabel: React.CSSProperties = { fontSize: 12, fontWeight: 900, opacity: 0.75, marginBottom: 6 };
  const selectedFilterCatId = filterCatId;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 950, letterSpacing: -0.3 }}>Home Filters</div>
          <div style={{ fontSize: 13, opacity: 0.75, marginTop: 4, lineHeight: 1.5 }}>
            Controls Home page filter chips like <b>Punjabi</b>, <b>Pizza</b>, and <b>Indian</b>.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <Link href="/admin" style={btnGhost}>
            ← Back to Dashboard
          </Link>

          <button onClick={() => loadHomeFilterCategories()} style={btnGhost} disabled={filterCatsLoading || filterCatsSaving}>
            {filterCatsLoading ? "Loading..." : `Reload (${homeFilterCats.length})`}
          </button>

          <button onClick={() => resetFilterCategoryForm()} style={btnGhost} disabled={filterCatsLoading || filterCatsSaving} title="Create a new Home filter category">
            ➕ Add New
          </button>

          <button onClick={saveHomeFilterCategory} style={btnPrimary} disabled={filterCatsSaving || filterCatsLoading}>
            {filterCatsSaving ? "Saving..." : filterCatId ? "Save Changes" : "Save New Filter"}
          </button>

          <div
            style={{
              ...pill,
              background: filterCatEnabled ? "rgba(34,197,94,0.10)" : "rgba(239,68,68,0.10)",
            }}
          >
            {filterCatEnabled ? "Enabled ✅" : "Disabled ❌"}
          </div>

          {filterCatId ? (
            <button
              onClick={() => deleteHomeFilterCategory(filterCatId)}
              style={{ ...btnGhost, border: "1px solid rgba(239,68,68,0.22)", background: "rgba(239,68,68,0.08)" }}
              disabled={filterCatsSaving}
              title="Delete selected Home filter category"
            >
              🗑️ Delete
            </button>
          ) : null}
        </div>
      </div>

      <div style={{ ...card, display: "grid", gridTemplateColumns: "0.95fr 1.05fr", gap: 14 }}>
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
            <div style={{ fontSize: 12, fontWeight: 950, opacity: 0.9 }}>Home Filter List</div>
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4, lineHeight: 1.4 }}>
              Click a filter to edit. Sort Order decides chip order on Home page.
            </div>
          </div>

          <div style={{ maxHeight: 360, overflow: "auto" }}>
            {homeFilterCats.length === 0 ? (
              <div style={{ padding: 12, fontSize: 12, opacity: 0.75, fontWeight: 850 }}>No Home filter categories yet.</div>
            ) : (
              homeFilterCats.map((row) => {
                const id = String(row.id || "");
                const isSel = selectedFilterCatId && id === String(selectedFilterCatId);
                const keyText = String(row.key || "");
                const labelText = String(row.label || "Filter");
                return (
                  <button
                    key={id}
                    onClick={() => loadFilterCategoryIntoForm(row)}
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
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                      <div style={{ fontSize: 12, fontWeight: 950, color: "#0F172A" }}>
                        🏷️ {labelText} <span style={{ opacity: 0.7, fontWeight: 900 }}>• {row.is_enabled !== false ? "Enabled" : "Disabled"}</span>
                      </div>
                      <div style={{ fontSize: 11, opacity: 0.7, fontWeight: 900 }}>Sort: {Number(row.sort_order ?? 0)}</div>
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.72, marginTop: 5, fontWeight: 800 }}>Key: {keyText || "(auto)"}</div>
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
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ fontSize: 12, fontWeight: 950, opacity: 0.85 }}>
                Editing: <span style={{ opacity: 0.9 }}>{filterCatId ? `Existing filter (${filterCatId.slice(0, 8)}…)` : "New filter (not saved yet)"}</span>
              </div>
              <button onClick={() => resetFilterCategoryForm()} style={{ ...btnGhost, padding: "8px 10px" }} disabled={filterCatsSaving} title="Clear the form to create a new filter">
                Clear Form
              </button>
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={smallLabel}>Filter Label</div>
              <input value={filterCatLabel} onChange={(e) => setFilterCatLabel(e.target.value)} placeholder="Punjabi" style={input} />
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={smallLabel}>Filter Key</div>
              <input
                value={filterCatKey}
                onChange={(e) => setFilterCatKey(normalizeFilterKey(e.target.value))}
                placeholder="punjabi"
                style={input}
              />
              <div style={{ fontSize: 12, opacity: 0.72, marginTop: 6, lineHeight: 1.5 }}>
                Used by Home page logic. Example: <b>punjabi</b>, <b>pizza</b>, <b>indian</b>. If you type label only, key auto-generates.
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
              <div>
                <div style={smallLabel}>Sort Order</div>
                <input value={filterCatSortOrder} onChange={(e) => setFilterCatSortOrder(e.target.value)} placeholder="0" style={input} type="number" />
              </div>

              <div>
                <div style={smallLabel}>Enabled</div>
                <button
                  onClick={() => setFilterCatEnabled((v) => !v)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 14,
                    border: "1px solid rgba(15,23,42,0.12)",
                    background: filterCatEnabled ? "rgba(34,197,94,0.10)" : "rgba(239,68,68,0.10)",
                    fontWeight: 950,
                    cursor: "pointer",
                  }}
                >
                  {filterCatEnabled ? "Enabled ✅" : "Disabled ❌"}
                </button>
              </div>
            </div>

            {filterCatsError ? (
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
                {filterCatsError}
                <div style={{ marginTop: 6, fontWeight: 750, opacity: 0.9 }}>
                  If this says table does not exist, next step is to run the SQL for <b>home_filter_categories</b>.
                </div>
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
            <div style={{ fontSize: 12, fontWeight: 950, opacity: 0.9 }}>Preview</div>
            <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 999,
                  border: "1px solid rgba(15,23,42,0.12)",
                  background: filterCatEnabled ? "rgba(255,255,255,0.96)" : "rgba(239,68,68,0.06)",
                  fontWeight: 950,
                  color: "#0F172A",
                }}
              >
                {String(filterCatLabel || "Filter")}
              </div>
              <div style={{ fontSize: 12, opacity: 0.72, fontWeight: 850 }}>Key: <b>{normalizeFilterKey(filterCatKey || filterCatLabel) || "(empty)"}</b></div>
            </div>
            <div style={{ marginTop: 12, fontSize: 12, opacity: 0.72, lineHeight: 1.5 }}>
              Home page will show this filter chip based on <b>Sort Order</b> and <b>Enabled</b> status.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
