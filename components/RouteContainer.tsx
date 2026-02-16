"use client";

import React from "react";
import { usePathname } from "next/navigation";

export default function RouteContainer({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "";
  const isAdmin = pathname.startsWith("/admin");

  // Admin = full width
  if (isAdmin) {
    return <div style={{ width: "100%" }}>{children}</div>;
  }

  // Normal pages = centered max width (same as your old layout)
  return <div style={{ maxWidth: 1100, margin: "0 auto" }}>{children}</div>;
}
