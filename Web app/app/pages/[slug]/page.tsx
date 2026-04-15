"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import supabase from "@/lib/supabase";

type CmsPageRow = {
  id?: string;
  slug: string;
  title: string | null;
  content: string | null;
  is_enabled: boolean | null;
};

function normalizeSlug(v: string) {
  return String(v || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function prettyTitleFromSlug(slug: string) {
  return String(slug || "Page")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

export default function DynamicCmsPage() {
  const params = useParams();
  const rawSlug = String(params?.slug || "");
  const pageSlug = normalizeSlug(rawSlug);

  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState(prettyTitleFromSlug(pageSlug || "page"));
  const [content, setContent] = useState("");
  const [error, setError] = useState("");

  async function loadPage() {
    if (!pageSlug) {
      setTitle("Page");
      setContent("This page is not available right now.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const { data, error } = await supabase
        .from("cms_pages")
        .select("id, slug, title, content, is_enabled")
        .eq("slug", pageSlug)
        .eq("is_enabled", true)
        .maybeSingle();

      if (error) {
        setError(error.message || "Failed to load page.");
        return;
      }

      const row = (data || null) as CmsPageRow | null;

      if (!row) {
        setTitle(prettyTitleFromSlug(pageSlug));
        setContent("This page is not available right now.");
        return;
      }

      setTitle(String(row.title || prettyTitleFromSlug(pageSlug)));
      setContent(String(row.content || ""));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSlug]);

  const pageBg: React.CSSProperties = {
    minHeight: "calc(100vh - 64px)",
    padding: 20,
    background:
      "radial-gradient(1200px 600px at 20% 10%, rgba(255,140,0,0.10), transparent 62%), radial-gradient(900px 520px at 80% 18%, rgba(80,160,255,0.10), transparent 58%), linear-gradient(180deg, #fffaf5 0%, #ffffff 100%)",
  };

  const shell: React.CSSProperties = {
    maxWidth: 1000,
    margin: "0 auto",
  };

  const heroCard: React.CSSProperties = {
    borderRadius: 26,
    padding: 24,
    background: "linear-gradient(135deg, rgba(255,140,0,0.12), rgba(255,220,160,0.18))",
    border: "1px solid rgba(255,140,0,0.16)",
    boxShadow: "0 18px 46px rgba(15, 23, 42, 0.08)",
  };

  const contentCard: React.CSSProperties = {
    marginTop: 16,
    borderRadius: 24,
    padding: 24,
    background: "#FFFFFF",
    border: "1px solid rgba(15, 23, 42, 0.08)",
    boxShadow: "0 16px 40px rgba(15, 23, 42, 0.07)",
  };

  const textContent: React.CSSProperties = {
    marginTop: 14,
    whiteSpace: "pre-wrap",
    fontSize: 15,
    lineHeight: 1.9,
    color: "#0F172A",
  };

  return (
    <div style={pageBg}>
      <div style={shell}>
        <div style={heroCard}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.78)",
              border: "1px solid rgba(15,23,42,0.08)",
              fontSize: 12,
              fontWeight: 900,
              color: "#0F172A",
            }}
          >
            📄 CMS Page
          </div>

          <div
            style={{
              fontSize: 34,
              fontWeight: 950,
              letterSpacing: -0.5,
              color: "#0F172A",
              marginTop: 14,
            }}
          >
            {loading ? "Loading..." : title}
          </div>
        </div>

        <div style={contentCard}>
          {error && (
            <div
              style={{
                padding: 14,
                borderRadius: 16,
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.18)",
                color: "#7F1D1D",
                fontSize: 13,
                fontWeight: 800,
                lineHeight: 1.6,
                marginBottom: 14,
              }}
            >
              {error}
            </div>
          )}

          {!loading && (
            <div style={textContent}>
              {content || "No content added yet."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}