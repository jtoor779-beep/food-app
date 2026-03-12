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
};

const POLICY_SLUGS = ["terms_conditions", "refund_policy", "privacy_policy"];

export default function PoliciesPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pages, setPages] = useState<CmsPageRow[]>([]);

  async function loadPolicies() {
    setLoading(true);
    setError("");

    try {
      const { data, error } = await supabase
        .from("cms_pages")
        .select("id, slug, title, content, is_enabled")
        .in("slug", POLICY_SLUGS)
        .eq("is_enabled", true);

      if (error) {
        setError(error.message || "Failed to load policies.");
        return;
      }

      const rows = Array.isArray(data) ? (data as CmsPageRow[]) : [];
      setPages(rows);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPolicies();
  }, []);

  const orderedPages = useMemo(() => {
    const order = new Map(POLICY_SLUGS.map((slug, index) => [slug, index]));
    return [...pages].sort((a, b) => {
      const ai = order.get(String(a.slug || "")) ?? 999;
      const bi = order.get(String(b.slug || "")) ?? 999;
      return ai - bi;
    });
  }, [pages]);

  const pageBg: React.CSSProperties = {
    minHeight: "calc(100vh - 64px)",
    padding: 20,
    background:
      "radial-gradient(1200px 600px at 20% 10%, rgba(255,140,0,0.10), transparent 62%), radial-gradient(900px 520px at 80% 18%, rgba(80,160,255,0.10), transparent 58%), linear-gradient(180deg, #fffaf5 0%, #ffffff 100%)",
  };

  const shell: React.CSSProperties = {
    maxWidth: 1100,
    margin: "0 auto",
  };

  const heroCard: React.CSSProperties = {
    borderRadius: 28,
    padding: 24,
    background: "linear-gradient(135deg, rgba(255,140,0,0.12), rgba(255,220,160,0.18))",
    border: "1px solid rgba(255,140,0,0.16)",
    boxShadow: "0 18px 46px rgba(15, 23, 42, 0.08)",
  };

  const quickLinksWrap: React.CSSProperties = {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    marginTop: 18,
  };

  const quickLink: React.CSSProperties = {
    padding: "10px 14px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.86)",
    border: "1px solid rgba(15,23,42,0.10)",
    textDecoration: "none",
    color: "#0F172A",
    fontWeight: 900,
    fontSize: 13,
    boxShadow: "0 10px 26px rgba(15,23,42,0.06)",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  };

  const contentCard: React.CSSProperties = {
    marginTop: 16,
    borderRadius: 24,
    padding: 20,
    background: "#FFFFFF",
    border: "1px solid rgba(15, 23, 42, 0.08)",
    boxShadow: "0 16px 40px rgba(15, 23, 42, 0.07)",
  };

  const policySection: React.CSSProperties = {
    padding: 18,
    borderRadius: 22,
    background: "rgba(255,255,255,0.96)",
    border: "1px solid rgba(15,23,42,0.08)",
    boxShadow: "0 10px 26px rgba(15,23,42,0.05)",
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
            📜 Legal & Policy Pages
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
            Policies
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
            Read our important policy pages in one place. You can also open each policy separately using the quick links below.
          </div>

          <div style={quickLinksWrap}>
            <Link href="/terms-and-conditions" style={quickLink}>
              📄 Terms & Conditions
            </Link>

            <Link href="/refund-policy" style={quickLink}>
              💸 Refund Policy
            </Link>

            <Link href="/privacy-policy" style={quickLink}>
              🔒 Privacy Policy
            </Link>
          </div>
        </div>

        <div style={contentCard}>
          {loading ? (
            <div style={{ fontSize: 14, fontWeight: 800, color: "#0F172A" }}>Loading policies...</div>
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
              {error}
            </div>
          ) : orderedPages.length === 0 ? (
            <div style={{ fontSize: 14, fontWeight: 800, color: "#0F172A" }}>No policy content added yet.</div>
          ) : (
            <div style={{ display: "grid", gap: 16 }}>
              {orderedPages.map((p) => (
                <div key={p.slug} style={policySection}>
                  <div
                    style={{
                      fontSize: 24,
                      fontWeight: 950,
                      color: "#0F172A",
                      letterSpacing: -0.3,
                    }}
                  >
                    {p.title || "Policy"}
                  </div>

                  <div
                    style={{
                      marginTop: 12,
                      whiteSpace: "pre-wrap",
                      fontSize: 15,
                      lineHeight: 1.9,
                      color: "#0F172A",
                    }}
                  >
                    {p.content || "No content added yet."}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
