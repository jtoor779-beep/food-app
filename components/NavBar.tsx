"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import supabase from "@/lib/supabase";

function normalizeRole(r: unknown) {
  return String(r || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

export default function NavBar() {
  const router = useRouter();
  const pathname = usePathname();

  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState("");
  const [role, setRole] = useState("");
  const [err, setErr] = useState("");

  async function loadSessionAndRole() {
    setErr("");
    setLoading(true);
    try {
      const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
      if (sessErr) throw sessErr;

      const user = sessionData?.session?.user;
      if (!user) {
        setUserEmail("");
        setRole("");
        return;
      }

      setUserEmail(user.email || "");

      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profErr) throw profErr;

      setRole(normalizeRole(prof?.role));
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    // ✅ clear UI immediately (no “customer menu” after logout)
    setUserEmail("");
    setRole("");

    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  useEffect(() => {
    loadSessionAndRole();

    const { data } = supabase.auth.onAuthStateChange((event) => {
      // ✅ keep UI correct when signed out / signed in
      if (event === "SIGNED_OUT") {
        setUserEmail("");
        setRole("");
      } else {
        loadSessionAndRole();
      }
    });

    return () => data?.subscription?.unsubscribe?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isLoggedIn = !!userEmail;
  const isOwner = role === "restaurant_owner";
  const isCustomer = role === "customer";
  const isDelivery = role === "delivery_partner";
  const isAdmin = role === "admin";

  // ✅ Role-based Home routing so Delivery Home never goes to customer dashboard.
  // 🔒 Extra safety: while role is still loading, keep Home inside current section (prevents wrong redirects)
  const homeHref = useMemo(() => {
    // guests and customers stay on "/"
    if (!isLoggedIn) return "/";

    // While loading role, DO NOT guess "/".
    // Keep Home within the current "area" the user is already visiting.
    if (loading) {
      const p = pathname || "/";
      if (p.startsWith("/delivery")) return "/delivery";
      if (p.startsWith("/restaurants")) return "/restaurants/dashboard";
      if (p.startsWith("/admin")) return "/admin/orders";
      // If user is somewhere else, keep them on current page
      return p;
    }

    // Role resolved
    if (isDelivery) return "/delivery";
    if (isOwner) return "/restaurants/dashboard";
    if (isAdmin) return "/admin/orders";

    // customer (or unknown role)
    return "/";
  }, [isLoggedIn, isDelivery, isOwner, isAdmin, loading, pathname]);

  const isActive = (href: string) => {
    // exact match
    if (pathname === href) return true;

    // nested match (example: /restaurants/orders/123 should still highlight /restaurants/orders)
    if (href !== "/" && pathname?.startsWith(href + "/")) return true;

    return false;
  };

  const linkStyle = (href: string): React.CSSProperties => {
    const active = isActive(href);
    return {
      padding: "8px 10px",
      borderRadius: 10,
      textDecoration: "none",
      color: active ? "#111" : "#444",
      background: active ? "#f1f1f1" : "transparent",
      border: active ? "1px solid #e5e5e5" : "1px solid transparent",
      fontWeight: 700,
      fontSize: 14,
      lineHeight: "18px",
      whiteSpace: "nowrap",
    };
  };

  return (
    <header
      style={{
        borderBottom: "1px solid #eee",
        background: "#fff",
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}
    >
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontWeight: 900 }}>🍔 Food App</div>
          <span
            style={{
              fontSize: 12,
              padding: "4px 10px",
              borderRadius: 999,
              border: "1px solid #eee",
              background: "#fafafa",
              color: "#333",
            }}
          >
            {isLoggedIn ? role || "user" : "guest"}
          </span>
        </div>

        <nav style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {!isLoggedIn ? (
            <>
              <Link href={homeHref} style={linkStyle(homeHref)}>
                Home
              </Link>
              <Link href="/restaurants" style={linkStyle("/restaurants")}>
                Restaurants
              </Link>
              <Link href="/menu" style={linkStyle("/menu")}>
                Menu
              </Link>
              <Link href="/login" style={linkStyle("/login")}>
                Login
              </Link>
              <Link href="/signup" style={linkStyle("/signup")}>
                Sign Up
              </Link>
            </>
          ) : null}

          {isCustomer ? (
            <>
              <Link href={homeHref} style={linkStyle(homeHref)}>
                Home
              </Link>
              <Link href="/restaurants" style={linkStyle("/restaurants")}>
                Restaurants
              </Link>
              <Link href="/menu" style={linkStyle("/menu")}>
                Menu
              </Link>
              <Link href="/cart" style={linkStyle("/cart")}>
                Cart
              </Link>
              <Link href="/orders" style={linkStyle("/orders")}>
                My Orders
              </Link>
            </>
          ) : null}

          {isDelivery ? (
            <>
              <Link href={homeHref} style={linkStyle(homeHref)}>
                Home
              </Link>
              <Link href="/delivery" style={linkStyle("/delivery")}>
                Delivery Dashboard
              </Link>
            </>
          ) : null}

          {isOwner ? (
            <>
              <Link href={homeHref} style={linkStyle(homeHref)}>
                Home
              </Link>
              <Link href="/restaurants/orders" style={linkStyle("/restaurants/orders")}>
                Restaurant Orders
              </Link>
              <Link href="/restaurants/menu" style={linkStyle("/restaurants/menu")}>
                Manage Menu
              </Link>
              <Link href="/restaurants/settings" style={linkStyle("/restaurants/settings")}>
                Restaurant Settings
              </Link>
            </>
          ) : null}

          {isAdmin ? (
            <>
              <Link href={homeHref} style={linkStyle(homeHref)}>
                Home
              </Link>
              <Link href="/admin/orders" style={linkStyle("/admin/orders")}>
                Admin Orders
              </Link>
            </>
          ) : null}
        </nav>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {err ? <span style={{ color: "#b00020", fontSize: 12 }}>{err}</span> : null}
          {loading ? <span style={{ fontSize: 12, color: "#666" }}>Loading…</span> : null}

          {isLoggedIn ? (
            <>
              <Link href="/profile" style={linkStyle("/profile")}>
                Profile
              </Link>
              <Link href="/settings" style={linkStyle("/settings")}>
                Settings
              </Link>
              <button
                onClick={handleLogout}
                style={{
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  background: "#fff",
                  cursor: "pointer",
                  fontWeight: 800,
                }}
              >
                Logout
              </button>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
