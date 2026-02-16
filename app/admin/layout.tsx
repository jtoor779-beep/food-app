"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import supabase from "@/lib/supabase";

function normalizeRole(r: any) {
  return String(r || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [checking, setChecking] = useState(true);
  const [adminName, setAdminName] = useState("Admin");
  const [blockedReason, setBlockedReason] = useState<string | null>(null);

  const nav = useMemo(
    () => [
      { href: "/admin", label: "Dashboard" },
      { href: "/admin/restaurants", label: "Restaurants" },
      { href: "/admin/orders", label: "Orders" },

      // ✅ NEW: Delivery partners management (approve/reject/edit/disable)
      { href: "/admin/delivery-partners", label: "Delivery Partners" },

      { href: "/admin/users", label: "Users" },
      { href: "/admin/settings", label: "Settings" },
    ],
    []
  );

  useEffect(() => {
    let alive = true;

    async function checkAdmin() {
      try {
        setChecking(true);
        setBlockedReason(null);

        const {
          data: { user },
          error: authErr,
        } = await supabase.auth.getUser();

        if (authErr || !user) {
          if (!alive) return;
          setBlockedReason("Not logged in (no Supabase user). Please login first.");
          return;
        }

        // ✅ IMPORTANT: your schema uses profiles.user_id (not id) so check that FIRST
        let profile: any = null;

        // 0) Best: use a security-definer RPC (works even if RLS is tricky)
        // You must create the SQL function `public.get_my_profile()` once in Supabase SQL Editor.
        const viaRpc = await supabase.rpc("get_my_profile");
        if (viaRpc?.error) {
          console.log("Admin guard RPC error (get_my_profile):", viaRpc.error);
        } else if (Array.isArray(viaRpc?.data)) {
          profile = viaRpc.data?.[0] || null;
        } else if (viaRpc?.data) {
          // some setups return a single object
          profile = viaRpc.data;
        }

        // 1) Fallback: normal select using RLS policy (user_id = auth.uid())
        if (!profile) {
          const byUserId = await supabase
            .from("profiles")
            .select("id, user_id, role, full_name, name, email")
            .eq("user_id", user.id)
            .maybeSingle();

          if (byUserId.error) {
            console.log("Admin guard profile error (by user_id):", byUserId.error);
            if (!alive) return;
            setBlockedReason(
              "Profile read blocked (possible RLS/policy issue). Fix: create the SELECT policy (user_id = auth.uid()) on public.profiles, or create RPC get_my_profile()."
            );
            return;
          }

          profile = byUserId.data;
        }

        // 2) Last fallback (only if your table sometimes stores auth uid in id)
        if (!profile) {
          const byId = await supabase
            .from("profiles")
            .select("id, user_id, role, full_name, name, email")
            .eq("id", user.id)
            .maybeSingle();

          if (byId.error) {
            console.log("Admin guard profile error (by id):", byId.error);
            if (!alive) return;
            setBlockedReason(
              "Profile read blocked (possible RLS/policy issue). Check profiles SELECT policy or RPC."
            );
            return;
          }

          profile = byId.data;
        }

        if (!profile) {
          if (!alive) return;
          setBlockedReason(
            "Profile not found for this logged-in user. Your logged-in UID must match profiles.user_id."
          );
          return;
        }

        const role = normalizeRole(profile?.role);
        if (role !== "admin") {
          if (!alive) return;
          setBlockedReason(
            `Not authorized. Your role is "${profile?.role}". Change it to "admin" in profiles table.`
          );
          return;
        }

        const nm =
          profile?.full_name ||
          profile?.name ||
          user.user_metadata?.full_name ||
          user.email ||
          "Admin";

        if (alive) setAdminName(String(nm));
      } catch (e) {
        console.log("Admin guard crash:", e);
        if (!alive) return;
        setBlockedReason("Admin guard crashed unexpectedly. Open console and share the error.");
      } finally {
        if (alive) setChecking(false);
      }
    }

    checkAdmin();
    return () => {
      alive = false;
    };
  }, [router]);

  // ✅ Modern app font stack (Inter-like). We don't use next/font here because this is a client component.
  const appFont =
    'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"';

  // ✅ LIGHT THEME
  const pageWrap: React.CSSProperties = {
    minHeight: "100vh",
    fontFamily: appFont,
    background:
      "radial-gradient(1200px 650px at 12% 10%, rgba(255,140,0,0.18), transparent 60%), radial-gradient(900px 560px at 88% 18%, rgba(0,128,255,0.14), transparent 55%), #F5F7FB",
    color: "#0F172A",
  };

  const shell: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "292px 1fr",
    gap: 0,
    minHeight: "100vh",
  };

  const sidebar: React.CSSProperties = {
    borderRight: "1px solid rgba(15, 23, 42, 0.10)",
    background: "rgba(255,255,255,0.86)",
    backdropFilter: "blur(10px)",
    padding: 18,
  };

  const brand: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 10px 18px",
    borderBottom: "1px solid rgba(15, 23, 42, 0.10)",
    marginBottom: 14,
  };

  const brandDot: React.CSSProperties = {
    width: 42,
    height: 42,
    borderRadius: 14,
    background: "linear-gradient(135deg, rgba(255,140,0,1), rgba(255,220,160,0.95))",
    boxShadow: "0 14px 36px rgba(255,140,0,0.18)",
  };

  const navItem = (active: boolean): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 12px",
    borderRadius: 14,
    marginBottom: 8,
    textDecoration: "none",
    color: active ? "#0B1220" : "#0F172A",
    background: active ? "rgba(255,140,0,0.14)" : "rgba(255,255,255,0.85)",
    border: active
      ? "1px solid rgba(255,140,0,0.35)"
      : "1px solid rgba(15, 23, 42, 0.10)",
    boxShadow: active ? "0 14px 36px rgba(255,140,0,0.14)" : "0 10px 26px rgba(15,23,42,0.06)",
    transition: "transform 120ms ease",
  });

  const main: React.CSSProperties = {
    padding: 18,
  };

  const topbar: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "14px 16px",
    borderRadius: 18,
    background: "rgba(255,255,255,0.88)",
    border: "1px solid rgba(15, 23, 42, 0.10)",
    boxShadow: "0 16px 40px rgba(15,23,42,0.08)",
  };

  const content: React.CSSProperties = {
    marginTop: 14,
    padding: 16,
    borderRadius: 20,
    background: "rgba(255,255,255,0.90)",
    border: "1px solid rgba(15, 23, 42, 0.10)",
    boxShadow: "0 18px 60px rgba(15,23,42,0.08)",
    minHeight: "calc(100vh - 120px)",
  };

  const buttonBase: React.CSSProperties = {
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid rgba(15, 23, 42, 0.12)",
    background: "#FFFFFF",
    color: "#0F172A",
    fontWeight: 800,
    cursor: "pointer",
  };

  const buttonPrimary: React.CSSProperties = {
    ...buttonBase,
    border: "1px solid rgba(255,140,0,0.35)",
    background: "linear-gradient(135deg, rgba(255,140,0,1), rgba(255,220,160,0.95))",
    color: "#0B1220",
    boxShadow: "0 16px 40px rgba(255,140,0,0.14)",
  };

  if (checking) {
    return (
      <div style={pageWrap}>
        <div style={{ maxWidth: 980, margin: "0 auto", padding: 20 }}>
          <div
            style={{
              padding: 18,
              borderRadius: 18,
              background: "rgba(255,255,255,0.88)",
              border: "1px solid rgba(15, 23, 42, 0.10)",
              boxShadow: "0 16px 40px rgba(15,23,42,0.08)",
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            Checking admin access…
          </div>
        </div>
      </div>
    );
  }

  if (blockedReason) {
    return (
      <div style={pageWrap}>
        <div style={{ maxWidth: 980, margin: "0 auto", padding: 20 }}>
          <div
            style={{
              padding: 18,
              borderRadius: 18,
              background: "rgba(255,255,255,0.90)",
              border: "1px solid rgba(15, 23, 42, 0.10)",
              boxShadow: "0 18px 60px rgba(15,23,42,0.10)",
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 950, letterSpacing: -0.2 }}>
              Not authorized
            </div>
            <div style={{ marginTop: 8, fontSize: 14, opacity: 0.85, lineHeight: 1.6 }}>
              {blockedReason}
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
              <button onClick={() => router.replace("/")} style={buttonBase}>
                Go Home
              </button>

              <button
                onClick={async () => {
                  await supabase.auth.signOut();
                  router.replace("/login");
                }}
                style={buttonBase}
              >
                Logout & Login Again
              </button>
            </div>

            <div style={{ marginTop: 12, fontSize: 12, opacity: 0.65 }}>
              If this still says “Profile read blocked”, create the RPC `get_my_profile()` (SQL below).
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={pageWrap}>
      <div style={shell}>
        <aside style={sidebar}>
          <div style={brand}>
            <div style={brandDot} />
            <div>
              <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 800, letterSpacing: 0.2 }}>
                Admin Panel
              </div>
              <div style={{ fontSize: 18, fontWeight: 950, letterSpacing: -0.3 }}>
                Food App
              </div>
            </div>
          </div>

          <div style={{ padding: "6px 4px 10px", fontSize: 11, opacity: 0.65, fontWeight: 900, letterSpacing: 0.6 }}>
            NAVIGATION
          </div>

          {nav.map((n) => {
            const active =
              pathname === n.href || (n.href !== "/admin" && pathname?.startsWith(n.href));
            return (
              <Link key={n.href} href={n.href} style={navItem(active)}>
                <span style={{ fontWeight: 900, fontSize: 13 }}>{n.label}</span>
                <span style={{ fontSize: 12, opacity: active ? 0.75 : 0.35 }}>→</span>
              </Link>
            );
          })}

          <div
            style={{
              marginTop: 14,
              padding: 14,
              borderRadius: 18,
              background: "rgba(255,255,255,0.90)",
              border: "1px solid rgba(15, 23, 42, 0.10)",
              boxShadow: "0 14px 36px rgba(15,23,42,0.08)",
            }}
          >
            <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 800 }}>Logged in as</div>
            <div style={{ fontWeight: 950, marginTop: 4, fontSize: 14 }}>{adminName}</div>

            <button
              onClick={async () => {
                await supabase.auth.signOut();
                router.replace("/");
              }}
              style={{
                ...buttonBase,
                width: "100%",
                marginTop: 10,
              }}
            >
              Logout
            </button>
          </div>
        </aside>

        <main style={main}>
          <div style={topbar}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>Welcome</div>
              <div style={{ fontSize: 20, fontWeight: 950, letterSpacing: -0.3 }}>
                Admin Control Center
              </div>
            </div>

            <div
              style={{
                padding: "10px 12px",
                borderRadius: 14,
                background: "rgba(255,140,0,0.12)",
                border: "1px solid rgba(255,140,0,0.25)",
                fontSize: 12,
                fontWeight: 900,
                color: "#0B1220",
              }}
            >
              Secure: role lock enabled ✅
            </div>
          </div>

          <div style={content}>{children}</div>
        </main>
      </div>
    </div>
  );
}
