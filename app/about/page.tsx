
"use client";

import React, { useEffect, useState } from "react";
import supabase from "@/lib/supabase";

type CmsPageRow = {
  id?: string;
  slug: string;
  title: string | null;
  content: string | null;
  is_enabled: boolean | null;
};

export default function AboutPage() {
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("About Us");
  const [content, setContent] = useState("");
  const [error, setError] = useState("");

  async function loadAboutPage() {
    setLoading(true);
    setError("");

    try {
      const { data, error } = await supabase
        .from("cms_pages")
        .select("id, slug, title, content, is_enabled")
        .eq("slug", "about_us")
        .eq("is_enabled", true)
        .maybeSingle();

      if (error) {
        setError(error.message || "Failed to load About Us page.");
        return;
      }

      const row = (data || null) as CmsPageRow | null;

      if (!row) {
        setTitle("About Us");
        setContent("This page is not available right now.");
        return;
      }

      setTitle(String(row.title || "About Us"));
      setContent(String(row.content || ""));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAboutPage();
  }, []);

  const pageBg: React.CSSProperties = {
    minHeight: "calc(100vh - 64px)",
    padding: 20,
    background:
      "radial-gradient(1200px 600px at 20% 10%, rgba(255,140,0,0.10), transparent 62%), radial-gradient(900px 520px at 80% 18%, rgba(80,160,255,0.10), transparent 58%), linear-gradient(180deg, #fffaf5 0%, #ffffff 100%)",
  };

  const shell: React.CSSProperties = {
    maxWidth: 980,
    margin: "0 auto",
  };

  const heroCard: React.CSSProperties = {
    borderRadius: 26,
    padding: 24,
    background: "linear-gradient(135deg, rgba(255,140,0,0.10), rgba(255,220,160,0.16))",
    border: "1px solid rgba(255,140,0,0.16)",
    boxShadow: "0 18px 46px rgba(15, 23, 42, 0.08)",
  };

  const contentCard: React.CSSProperties = {
    marginTop: 16,
    borderRadius: 24,
    padding: 22,
    background: "#FFFFFF",
    border: "1px solid rgba(15, 23, 42, 0.08)",
    boxShadow: "0 16px 40px rgba(15, 23, 42, 0.07)",
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
            ℹ️ Company Information
          </div>

          <div
            style={{
              fontSize: 34,
              fontWeight: 950,
              letterSpacing: -0.6,
              color: "#0F172A",
              marginTop: 14,
            }}
          >
            {loading ? "Loading About Us..." : title}
          </div>

          <div
            style={{
              fontSize: 14,
              lineHeight: 1.7,
              color: "rgba(15,23,42,0.72)",
              marginTop: 10,
              maxWidth: 760,
            }}
          >
            Learn more about us, our story, and what we stand for.
          </div>
        </div>

        <div style={contentCard}>
          {loading ? (
            <div style={{ fontSize: 14, fontWeight: 800, color: "#0F172A" }}>Loading content...</div>
          ) : error ? (
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
              }}
            >
              About page load failed: {error}
            </div>
          ) : (
            <div
              style={{
                whiteSpace: "pre-wrap",
                fontSize: 15,
                lineHeight: 1.9,
                color: "#0F172A",
              }}
            >
              {content || "No About Us content added yet."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
