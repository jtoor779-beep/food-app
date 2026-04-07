"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import supabase from "@/lib/supabase";

type CmsPageRow = {
  id?: string;
  slug: string;
  title: string | null;
  content: string | null;
  is_enabled: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type CmsPageMeta = {
  attachmentName: string;
  attachmentBucket: string;
  attachmentPath: string;
  contractRequired: boolean;
  contractCheckboxLabel: string;
};

const CMS_TABLE = "cms_pages";
const CMS_META_KEY = "cms_page_meta";

const DEFAULT_PAGE_OPTIONS = [
  { slug: "about_us", title: "About Us" },
  { slug: "terms_conditions", title: "Terms & Conditions" },
  { slug: "refund_policy", title: "Refund Policy" },
  { slug: "privacy_policy", title: "Privacy Policy" },
  { slug: "driver_contract", title: "Driver Contract" },
];

function normalizeSlug(v: string) {
  return String(v || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function defaultMeta(): CmsPageMeta {
  return {
    attachmentName: "",
    attachmentBucket: "",
    attachmentPath: "",
    contractRequired: false,
    contractCheckboxLabel: "I agree to the driver contract.",
  };
}

function normalizeMeta(input: any): CmsPageMeta {
  return {
    attachmentName: String(input?.attachmentName || ""),
    attachmentBucket: String(input?.attachmentBucket || ""),
    attachmentPath: String(input?.attachmentPath || ""),
    contractRequired: Boolean(input?.contractRequired),
    contractCheckboxLabel: String(input?.contractCheckboxLabel || "I agree to the driver contract."),
  };
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
  const updated = await supabase.from("system_settings").update({ value_json }).eq("key", key);
  if (!updated.error) return;
  const inserted = await supabase.from("system_settings").insert({ key, value_json });
  if (inserted.error) throw inserted.error;
}

export default function AdminPagesManagerPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const [rows, setRows] = useState<CmsPageRow[]>([]);
  const [metaBySlug, setMetaBySlug] = useState<Record<string, CmsPageMeta>>({});
  const [selectedSlug, setSelectedSlug] = useState<string>("about_us");

  const [, setPageId] = useState<string>("");
  const [pageTitle, setPageTitle] = useState<string>("About Us");
  const [pageSlug, setPageSlug] = useState<string>("about_us");
  const [pageContent, setPageContent] = useState<string>("");
  const [pageEnabled, setPageEnabled] = useState<boolean>(true);
  const [attachmentName, setAttachmentName] = useState("");
  const [attachmentBucket, setAttachmentBucket] = useState("");
  const [attachmentPath, setAttachmentPath] = useState("");
  const [contractRequired, setContractRequired] = useState(false);
  const [contractCheckboxLabel, setContractCheckboxLabel] = useState("I agree to the driver contract.");

  function applyMeta(meta: CmsPageMeta) {
    setAttachmentName(meta.attachmentName);
    setAttachmentBucket(meta.attachmentBucket);
    setAttachmentPath(meta.attachmentPath);
    setContractRequired(meta.contractRequired);
    setContractCheckboxLabel(meta.contractCheckboxLabel);
  }

  function resetForm(slug = "", title = "") {
    setPageId("");
    setPageSlug(slug);
    setPageTitle(title);
    setPageContent("");
    setPageEnabled(true);
    setSelectedSlug(slug);
    applyMeta(defaultMeta());
  }

  function resetFormFromPreset(slug: string) {
    const preset = DEFAULT_PAGE_OPTIONS.find((x) => x.slug === slug);
    resetForm(slug, preset?.title || "");
  }

  function loadRowIntoForm(row: CmsPageRow, nextMetaMap?: Record<string, CmsPageMeta>) {
    const slug = normalizeSlug(String(row?.slug || ""));
    setPageId(String(row?.id || ""));
    setPageSlug(slug);
    setPageTitle(String(row?.title || ""));
    setPageContent(String(row?.content || ""));
    setPageEnabled(row?.is_enabled !== false);
    setSelectedSlug(slug);
    applyMeta((nextMetaMap || metaBySlug)?.[slug] || defaultMeta());
  }

  async function loadPages(preferredSlug?: string) {
    setLoading(true);
    setError("");
    try {
      const [pagesRes, metaRes] = await Promise.all([
        supabase
          .from(CMS_TABLE)
          .select("id, slug, title, content, is_enabled, created_at, updated_at")
          .order("updated_at", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(200),
        loadSetting(CMS_META_KEY).catch(() => null),
      ]);

      if (pagesRes.error) {
        setError(`CMS pages load failed: ${pagesRes.error.message}`);
        const desired = normalizeSlug(preferredSlug || selectedSlug || "about_us") || "about_us";
        resetFormFromPreset(desired);
        setRows([]);
        setMetaBySlug({});
        return;
      }

      const rawMetaMap = metaRes?.value_json && typeof metaRes.value_json === "object" ? metaRes.value_json : {};
      const normalizedMetaMap = Object.fromEntries(
        Object.entries(rawMetaMap || {}).map(([slug, meta]) => [normalizeSlug(slug), normalizeMeta(meta)])
      ) as Record<string, CmsPageMeta>;
      setMetaBySlug(normalizedMetaMap);

      const dbRows: CmsPageRow[] = Array.isArray(pagesRes.data) ? (pagesRes.data as CmsPageRow[]) : [];
      const mergedMap = new Map<string, CmsPageRow>();

      for (const preset of DEFAULT_PAGE_OPTIONS) {
        mergedMap.set(preset.slug, {
          slug: preset.slug,
          title: preset.title,
          content: "",
          is_enabled: true,
        });
      }

      for (const row of dbRows) {
        const slug = normalizeSlug(String(row?.slug || ""));
        if (!slug) continue;
        mergedMap.set(slug, {
          ...row,
          slug,
          title: String(row?.title || mergedMap.get(slug)?.title || ""),
        });
      }

      const mergedRows = Array.from(mergedMap.values()).sort((a, b) => {
        const ai = DEFAULT_PAGE_OPTIONS.findIndex((x) => x.slug === a.slug);
        const bi = DEFAULT_PAGE_OPTIONS.findIndex((x) => x.slug === b.slug);
        const ax = ai >= 0 ? ai : 9999;
        const bx = bi >= 0 ? bi : 9999;
        return ax - bx || String(a.title || "").localeCompare(String(b.title || ""));
      });

      setRows(mergedRows);

      const desiredSlug = normalizeSlug(preferredSlug || selectedSlug || "about_us") || "about_us";
      const picked = mergedRows.find((x) => x.slug === desiredSlug) || mergedRows[0];
      if (picked) loadRowIntoForm(picked, normalizedMetaMap);
      else resetFormFromPreset("about_us");
    } finally {
      setLoading(false);
    }
  }

  async function savePage() {
    const slug = normalizeSlug(pageSlug || selectedSlug || "");
    const title = String(pageTitle || "").trim();
    const content = String(pageContent || "");

    if (!slug) {
      setError("Please enter a valid page slug first.");
      return;
    }
    if (!title) {
      setError("Please enter a page title first.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const payload: any = {
        slug,
        title,
        content,
        is_enabled: Boolean(pageEnabled),
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from(CMS_TABLE)
        .upsert(payload, { onConflict: "slug" })
        .select("id, slug")
        .limit(1);

      if (error) {
        setError(`Save failed: ${error.message}`);
        return;
      }

      const nextMetaMap = {
        ...metaBySlug,
        [slug]: normalizeMeta({
          attachmentName,
          attachmentBucket,
          attachmentPath,
          contractRequired,
          contractCheckboxLabel,
        }),
      };

      await saveSetting(CMS_META_KEY, nextMetaMap);
      setMetaBySlug(nextMetaMap);

      const nextSlug =
        Array.isArray(data) && data[0]?.slug ? normalizeSlug(String(data[0].slug)) : slug;

      await loadPages(nextSlug);
    } catch (e: any) {
      setError(`Save failed: ${e?.message || "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  }

  async function deleteCurrentPage() {
    const slug = normalizeSlug(pageSlug || "");
    if (!slug) return;

    const ok = window.confirm(`Delete page "${slug}"? This cannot be undone.`);
    if (!ok) return;

    setSaving(true);
    setError("");
    try {
      const { error } = await supabase.from(CMS_TABLE).delete().eq("slug", slug);
      if (error) {
        setError(`Delete failed: ${error.message}`);
        return;
      }

      const nextMetaMap = { ...metaBySlug };
      delete nextMetaMap[slug];
      await saveSetting(CMS_META_KEY, nextMetaMap);
      setMetaBySlug(nextMetaMap);
      await loadPages("about_us");
    } finally {
      setSaving(false);
    }
  }

  async function uploadAttachment(file?: File | null) {
    if (!file) return;

    const slug = normalizeSlug(pageSlug || "");
    if (!slug) {
      setError("Save or enter a page slug before uploading an attachment.");
      return;
    }

    setUploading(true);
    setError("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const token = String(session?.access_token || "").trim();
      if (!token) throw new Error("Admin session missing. Please log in again.");

      const formData = new FormData();
      formData.append("slug", slug);
      formData.append("file", file);

      const res = await fetch("/api/admin/cms-attachment", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Unable to upload attachment.");
      }

      const attachment = json?.attachment || {};
      setAttachmentName(String(attachment?.name || file.name || ""));
      setAttachmentBucket(String(attachment?.bucket || ""));
      setAttachmentPath(String(attachment?.path || ""));
    } catch (e: any) {
      setError(e?.message || "Unable to upload attachment.");
    } finally {
      setUploading(false);
    }
  }

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    loadPages("about_us");
  }, []);
  /* eslint-enable react-hooks/exhaustive-deps */

  const selectedRow = useMemo(
    () => rows.find((x) => normalizeSlug(x.slug) === normalizeSlug(selectedSlug || pageSlug || "")),
    [rows, selectedSlug, pageSlug]
  );

  const pageCount = rows.length;
  const pageWrap: React.CSSProperties = { display: "grid", gap: 14 };
  const topBar: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 14,
    flexWrap: "wrap",
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
  const textarea: React.CSSProperties = {
    ...input,
    minHeight: 260,
    resize: "vertical",
    fontFamily: "inherit",
    lineHeight: 1.55,
  };
  const smallLabel: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 900,
    opacity: 0.75,
    marginBottom: 6,
  };

  return (
    <div style={pageWrap}>
      <div style={topBar}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 950, letterSpacing: -0.3 }}>CMS Pages</div>
          <div style={{ fontSize: 13, opacity: 0.75, marginTop: 4, lineHeight: 1.5 }}>
            Manage About Us, policies, and document-style pages for the apps. Table: <b>public.{CMS_TABLE}</b>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Link href="/admin" style={btnGhost}>
            ← Back to Dashboard
          </Link>

          <button onClick={() => resetForm("", "")} style={btnGhost} disabled={saving || uploading}>
            + New Page
          </button>

          <button onClick={() => loadPages(pageSlug || selectedSlug)} style={btnGhost} disabled={loading || saving || uploading}>
            {loading ? "Loading..." : "Reload"}
          </button>

          <button onClick={savePage} style={btnPrimary} disabled={saving || loading || uploading}>
            {saving ? "Saving..." : "Save Page"}
          </button>

          <div style={pill}>
            Pages: <b>{pageCount}</b>
          </div>
        </div>
      </div>

      <div
        style={{
          ...card,
          display: "grid",
          gridTemplateColumns: "0.95fr 1.35fr",
          gap: 14,
          alignItems: "start",
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
            <div style={{ fontSize: 12, fontWeight: 950, opacity: 0.9 }}>Available Pages</div>
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4, lineHeight: 1.4 }}>
              Click a page to edit it, or create a brand-new page from the top bar.
            </div>
          </div>

          <div style={{ maxHeight: 520, overflow: "auto" }}>
            {rows.length === 0 ? (
              <div style={{ padding: 12, fontSize: 12, opacity: 0.75, fontWeight: 850 }}>No pages loaded yet.</div>
            ) : (
              rows.map((row) => {
                const slug = normalizeSlug(String(row.slug || ""));
                const isSelected = slug === normalizeSlug(selectedSlug || pageSlug || "");
                const title = String(row.title || slug || "Page");
                const enabled = row.is_enabled !== false;
                const meta = metaBySlug[slug] || defaultMeta();

                return (
                  <button
                    key={slug}
                    onClick={() => loadRowIntoForm(row)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: 12,
                      border: "none",
                      borderBottom: "1px solid rgba(15,23,42,0.06)",
                      background: isSelected ? "rgba(255,140,0,0.10)" : "transparent",
                      cursor: "pointer",
                    }}
                    title={slug}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                      <div style={{ fontSize: 12, fontWeight: 950, color: "#0F172A" }}>📄 {title}</div>
                      <div style={{ fontSize: 11, opacity: 0.72, fontWeight: 900 }}>{enabled ? "Enabled" : "Disabled"}</div>
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.72, marginTop: 5, fontWeight: 800 }}>Slug: {slug}</div>
                    {meta.attachmentName ? (
                      <div style={{ fontSize: 11, opacity: 0.72, marginTop: 4, fontWeight: 800 }}>Attachment: {meta.attachmentName}</div>
                    ) : null}
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
                Editing: <span style={{ opacity: 0.9 }}>{pageSlug ? pageSlug : "new page"}</span>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  onClick={() => {
                    if (selectedRow) loadRowIntoForm(selectedRow);
                    else resetForm("", "");
                  }}
                  style={{ ...btnGhost, padding: "8px 10px" }}
                  disabled={saving || uploading}
                >
                  Reset Form
                </button>

                {selectedRow?.id ? (
                  <button
                    onClick={deleteCurrentPage}
                    style={{
                      ...btnGhost,
                      padding: "8px 10px",
                      border: "1px solid rgba(239,68,68,0.22)",
                      background: "rgba(239,68,68,0.08)",
                    }}
                    disabled={saving || uploading}
                  >
                    🗑️ Delete
                  </button>
                ) : null}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
              <div>
                <div style={smallLabel}>Page Title</div>
                <input value={pageTitle} onChange={(e) => setPageTitle(e.target.value)} placeholder="About Us" style={input} />
              </div>

              <div>
                <div style={smallLabel}>Page Slug</div>
                <input
                  value={pageSlug}
                  onChange={(e) => {
                    const slug = normalizeSlug(e.target.value);
                    setPageSlug(slug);
                    setSelectedSlug(slug);
                  }}
                  placeholder="about_us"
                  style={input}
                />
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={smallLabel}>Page Content</div>
              <textarea
                value={pageContent}
                onChange={(e) => setPageContent(e.target.value)}
                placeholder="Write your page content here..."
                style={textarea}
              />
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
              <div>
                <div style={smallLabel}>Page Attachment</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <label style={{ ...btnGhost, cursor: uploading ? "not-allowed" : "pointer", opacity: uploading ? 0.65 : 1 }}>
                    {uploading ? "Uploading..." : "Upload Attachment"}
                    <input
                      type="file"
                      style={{ display: "none" }}
                      disabled={uploading || saving}
                      onChange={(e) => void uploadAttachment(e.target.files?.[0] || null)}
                    />
                  </label>

                  {attachmentName ? (
                    <button
                      type="button"
                      onClick={() => {
                        setAttachmentName("");
                        setAttachmentBucket("");
                        setAttachmentPath("");
                      }}
                      style={{
                        ...btnGhost,
                        border: "1px solid rgba(239,68,68,0.22)",
                        background: "rgba(239,68,68,0.08)",
                      }}
                      disabled={uploading || saving}
                    >
                      Remove Attachment
                    </button>
                  ) : null}
                </div>
                <div style={{ fontSize: 12, opacity: 0.72, marginTop: 8, lineHeight: 1.5 }}>
                  {attachmentName
                    ? `Attached file: ${attachmentName}`
                    : "Upload PDF or document-style attachments such as a driver contract."}
                </div>
              </div>

              <div>
                <div style={smallLabel}>Contract Checkbox Required</div>
                <button
                  onClick={() => setContractRequired((value) => !value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 14,
                    border: "1px solid rgba(15,23,42,0.12)",
                    background: contractRequired ? "rgba(34,197,94,0.10)" : "rgba(255,255,255,0.95)",
                    fontWeight: 950,
                    cursor: "pointer",
                  }}
                >
                  {contractRequired ? "Required ✅" : "Optional"}
                </button>
              </div>

              <div>
                <div style={smallLabel}>Contract Checkbox Label</div>
                <input
                  value={contractCheckboxLabel}
                  onChange={(e) => setContractCheckboxLabel(e.target.value)}
                  placeholder="I agree to the driver contract."
                  style={input}
                />
              </div>

              <div>
                <div style={smallLabel}>Enabled</div>
                <button
                  onClick={() => setPageEnabled((v) => !v)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 14,
                    border: "1px solid rgba(15,23,42,0.12)",
                    background: pageEnabled ? "rgba(34,197,94,0.10)" : "rgba(239,68,68,0.10)",
                    fontWeight: 950,
                    cursor: "pointer",
                  }}
                >
                  {pageEnabled ? "Enabled ✅" : "Disabled ❌"}
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

            <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
              <div style={{ fontSize: 22, fontWeight: 950, color: "#0F172A" }}>{pageTitle || "Page Title"}</div>

              <div style={{ fontSize: 12, opacity: 0.72, fontWeight: 850 }}>
                Slug: <b>{pageSlug || "(empty)"}</b> • Status: <b>{pageEnabled ? "Enabled" : "Disabled"}</b>
              </div>

              {attachmentName ? (
                <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 850 }}>
                  Attachment: <b>{attachmentName}</b>
                </div>
              ) : null}

              {contractRequired ? (
                <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 850 }}>
                  Driver checkbox: <b>{contractCheckboxLabel || "I agree to the driver contract."}</b>
                </div>
              ) : null}

              <div
                style={{
                  padding: 14,
                  borderRadius: 16,
                  border: "1px solid rgba(15,23,42,0.10)",
                  background: "rgba(255,255,255,0.92)",
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.65,
                  fontSize: 14,
                  color: "#0F172A",
                  minHeight: 180,
                }}
              >
                {pageContent || "Your page content preview will appear here."}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
