"use client";

import { useEffect, useMemo } from "react";

export default function DriverAuthCallbackPage() {
  const deepLink = useMemo(() => {
    if (typeof window === "undefined") return "homyfoddriver:///auth/callback";

    const allowedQueryKeys = new Set([
      "code",
      "type",
      "error",
      "error_code",
      "error_description",
    ]);
    const allowedHashKeys = new Set([
      "access_token",
      "refresh_token",
      "expires_at",
      "expires_in",
      "token_type",
      "type",
      "provider_token",
      "provider_refresh_token",
      "error",
      "error_code",
      "error_description",
    ]);

    const url = new URL(window.location.href);
    const nextQuery = new URLSearchParams();
    const nextHash = new URLSearchParams();
    const rawHash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
    const hashParams = new URLSearchParams(rawHash);

    url.searchParams.forEach((value, key) => {
      if (allowedQueryKeys.has(key) && value) {
        nextQuery.set(key, value);
      }
    });

    hashParams.forEach((value, key) => {
      if (allowedHashKeys.has(key) && value) {
        nextHash.set(key, value);
      }
    });

    const query = nextQuery.toString();
    const hash = nextHash.toString();

    return `homyfoddriver:///auth/callback${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const timer = window.setTimeout(() => {
      window.location.replace(deepLink);
    }, 150);

    return () => window.clearTimeout(timer);
  }, [deepLink]);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f8fafc",
        padding: "24px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 460,
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: 24,
          padding: 32,
          boxShadow: "0 20px 45px rgba(15,23,42,0.08)",
          textAlign: "center",
        }}
      >
        <div
          style={{
            display: "inline-block",
            padding: "8px 14px",
            borderRadius: 999,
            background: "#ecfdf5",
            color: "#15803d",
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          HomyFod Driver
        </div>
        <h1 style={{ margin: "18px 0 12px", fontSize: 30, lineHeight: 1.1, color: "#0f172a" }}>
          Confirming your email
        </h1>
        <p style={{ margin: 0, color: "#475569", fontSize: 16, lineHeight: 1.7 }}>
          We are opening the HomyFod Driver app now so your email confirmation can finish cleanly.
        </p>
        <a
          href={deepLink}
          style={{
            display: "inline-block",
            marginTop: 24,
            padding: "14px 22px",
            borderRadius: 14,
            background: "#16a34a",
            color: "#ffffff",
            textDecoration: "none",
            fontWeight: 800,
          }}
        >
          Open HomyFod Driver
        </a>
        <p style={{ marginTop: 18, color: "#64748b", fontSize: 13, lineHeight: 1.7 }}>
          If the app does not open automatically, tap the button above.
        </p>
      </div>
    </main>
  );
}
