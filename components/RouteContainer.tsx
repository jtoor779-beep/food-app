"use client";

import React from "react";
import { usePathname } from "next/navigation";

export default function RouteContainer({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname() || "";
  const isAdmin = pathname.startsWith("/admin");

  // Admin = full width
  if (isAdmin) {
    return <div style={{ width: "100%" }}>{children}</div>;
  }

  /**
   * Normal pages:
   * - Mobile/PWA stays responsive (no forced maxWidth)
   * - Desktop becomes full width
   * - We keep safe padding so UI doesn't touch edges
   */
  return (
    <div
      style={{
        width: "100%",
        margin: 0,
        padding: "0 16px", // good on mobile + desktop
        boxSizing: "border-box",
      }}
    >
      {children}
    </div>
  );
}