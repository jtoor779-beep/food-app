"use client";

import { useEffect, useMemo } from "react";

function safeUrl(value: string, fallback: string) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return fallback;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.toString();
  } catch {
    // Ignore invalid fallback URL values.
  }
  return fallback;
}

export default function ManagerAppBridgePage() {
  const { deepLink, webFallback } = useMemo(() => {
    if (typeof window === "undefined") {
      return {
        deepLink: "homyfodmanagerfresh://orders",
        webFallback: "https://www.homyfod.com/restaurants/orders",
      };
    }

    const url = new URL(window.location.href);
    const screen = String(url.searchParams.get("screen") || "orders").trim().toLowerCase();
    const fallbackFromQuery = String(url.searchParams.get("fallback") || "").trim();
    const allowedScreens = new Set(["orders", "settings", "earnings", "items", "home"]);
    const normalizedScreen = allowedScreens.has(screen) ? screen : "orders";
    const routePart = normalizedScreen === "home" ? "" : normalizedScreen;

    return {
      deepLink: `homyfodmanagerfresh://${routePart}`,
      webFallback: safeUrl(fallbackFromQuery, `${url.origin}/restaurants/orders`),
    };
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
          maxWidth: 480,
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
          HomyFod Owner
        </div>
        <h1 style={{ margin: "18px 0 12px", fontSize: 30, lineHeight: 1.1, color: "#0f172a" }}>
          Opening Manager App
        </h1>
        <p style={{ margin: 0, color: "#475569", fontSize: 16, lineHeight: 1.7 }}>
          We are opening the HomyFod Manager app now. If nothing happens, use one of the buttons below.
        </p>
        <div style={{ marginTop: 24, display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
          <a
            href={deepLink}
            style={{
              display: "inline-block",
              padding: "14px 22px",
              borderRadius: 14,
              background: "#16a34a",
              color: "#ffffff",
              textDecoration: "none",
              fontWeight: 800,
            }}
          >
            Open HomyFod Manager
          </a>
          <a
            href={webFallback}
            style={{
              display: "inline-block",
              padding: "14px 22px",
              borderRadius: 14,
              border: "1px solid #cbd5e1",
              color: "#0f172a",
              textDecoration: "none",
              fontWeight: 800,
              background: "#ffffff",
            }}
          >
            Open Web Dashboard
          </a>
        </div>
      </div>
    </main>
  );
}

