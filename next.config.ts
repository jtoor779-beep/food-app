import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,

  async headers() {
    return [
      // Safe global security headers (won’t break your app)
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },

      // Service worker must NOT be cached aggressively, or updates won’t apply properly
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

// ✅ next-pwa wrapper (TypeScript-safe in next.config.ts)
// IMPORTANT:
// We only enable PWA when you explicitly opt in with PWA_ENABLED=true.
// This prevents service-worker/cache issues during normal local development
// and avoids breaking app pages with stale cached assets.
const withPWA = require("next-pwa")({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.PWA_ENABLED !== "true",
});

export default withPWA(nextConfig);
