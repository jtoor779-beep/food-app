"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
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

  // ✅ NEW: responsive UI state (no change to business logic)
  const [isMobile, setIsMobile] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

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
    setMenuOpen(false);

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
        setMenuOpen(false);
      } else {
        loadSessionAndRole();
      }
    });

    return () => data?.subscription?.unsubscribe?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ NEW: detect mobile width (pure UI)
  useEffect(() => {
    function onResize() {
      const m = window.innerWidth <= 820;
      setIsMobile(m);
      if (!m) setMenuOpen(false); // if returning to desktop, close mobile menu
    }
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ✅ NEW: close menu when route changes
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

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
      padding: "10px 12px",
      borderRadius: 12,
      textDecoration: "none",
      color: active ? "#111" : "#444",
      background: active ? "#f1f1f1" : "transparent",
      border: active ? "1px solid #e5e5e5" : "1px solid transparent",
      fontWeight: 800,
      fontSize: 14,
      lineHeight: "18px",
      whiteSpace: "nowrap",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
    };
  };

  const brandWrap: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  };

  const brandTextWrap: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  };

  const brandName: React.CSSProperties = {
    fontWeight: 1000,
    fontSize: 16,
    lineHeight: "18px",
    display: "flex",
    alignItems: "center",
    gap: 8,
    whiteSpace: "nowrap",
  };

  const badge: React.CSSProperties = {
    fontSize: 12,
    padding: "4px 10px",
    borderRadius: 999,
    border: "1px solid #eee",
    background: "#fafafa",
    color: "#333",
    fontWeight: 800,
    whiteSpace: "nowrap",
  };

  const hamburgerBtn: React.CSSProperties = {
    border: "1px solid #e6e6e6",
    background: "#fff",
    borderRadius: 12,
    padding: "10px 12px",
    cursor: "pointer",
    fontWeight: 900,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  };

  const desktopNav: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  };

  const mobileMenuPanel: React.CSSProperties = {
    maxWidth: 1100,
    margin: "0 auto",
    padding: "0 16px 14px 16px",
  };

  const mobileSection: React.CSSProperties = {
    marginTop: 10,
    padding: 12,
    borderRadius: 16,
    border: "1px solid #eee",
    background: "#fff",
  };

  const mobileGrid: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  };

  function MobileLink({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) {
    return (
      <Link
        href={href}
        style={{
          ...linkStyle(href),
          width: "100%",
        }}
        onClick={() => setMenuOpen(false)}
      >
        {children}
      </Link>
    );
  }

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
      {/* TOP ROW */}
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
        {/* LEFT: BRAND */}
        <div style={brandWrap}>
          <div style={brandTextWrap}>
            <div style={brandName}>
              🍔 <span>HomyFod</span>
            </div>
            <span style={badge}>{isLoggedIn ? role || "user" : "guest"}</span>
          </div>
        </div>

        {/* RIGHT: STATUS + ACTIONS */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {err ? <span style={{ color: "#b00020", fontSize: 12 }}>{err}</span> : null}
          {loading ? <span style={{ fontSize: 12, color: "#666" }}>Loading…</span> : null}

          {/* Desktop right actions */}
          {!isMobile && isLoggedIn ? (
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
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid #ddd",
                  background: "#fff",
                  cursor: "pointer",
                  fontWeight: 900,
                }}
              >
                Logout
              </button>
            </>
          ) : null}

          {/* Mobile hamburger */}
          {isMobile ? (
            <button onClick={() => setMenuOpen((v) => !v)} style={hamburgerBtn} aria-label="Menu">
              {menuOpen ? "✕" : "☰"} <span style={{ fontSize: 13, fontWeight: 900 }}>Menu</span>
            </button>
          ) : null}
        </div>
      </div>

      {/* DESKTOP NAV (unchanged routes/logic) */}
      {!isMobile ? (
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 16px 12px 16px" }}>
          <nav style={desktopNav}>
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
        </div>
      ) : null}

      {/* MOBILE MENU (same links, just displayed better) */}
      {isMobile && menuOpen ? (
        <div style={mobileMenuPanel}>
          {/* Primary nav */}
          <div style={mobileSection}>
            <div style={{ fontWeight: 1000, marginBottom: 10, color: "#111" }}>Navigation</div>

            {!isLoggedIn ? (
              <div style={mobileGrid}>
                <MobileLink href={homeHref}>Home</MobileLink>
                <MobileLink href="/restaurants">Restaurants</MobileLink>
                <MobileLink href="/menu">Menu</MobileLink>
                <MobileLink href="/login">Login</MobileLink>
                <MobileLink href="/signup">Sign Up</MobileLink>
              </div>
            ) : null}

            {isCustomer ? (
              <div style={mobileGrid}>
                <MobileLink href={homeHref}>Home</MobileLink>
                <MobileLink href="/restaurants">Restaurants</MobileLink>
                <MobileLink href="/menu">Menu</MobileLink>
                <MobileLink href="/cart">Cart</MobileLink>
                <MobileLink href="/orders">My Orders</MobileLink>
              </div>
            ) : null}

            {isDelivery ? (
              <div style={mobileGrid}>
                <MobileLink href={homeHref}>Home</MobileLink>
                <MobileLink href="/delivery">Delivery Dashboard</MobileLink>
              </div>
            ) : null}

            {isOwner ? (
              <div style={mobileGrid}>
                <MobileLink href={homeHref}>Home</MobileLink>
                <MobileLink href="/restaurants/orders">Restaurant Orders</MobileLink>
                <MobileLink href="/restaurants/menu">Manage Menu</MobileLink>
                <MobileLink href="/restaurants/settings">Restaurant Settings</MobileLink>
              </div>
            ) : null}

            {isAdmin ? (
              <div style={mobileGrid}>
                <MobileLink href={homeHref}>Home</MobileLink>
                <MobileLink href="/admin/orders">Admin Orders</MobileLink>
              </div>
            ) : null}
          </div>

          {/* Account actions */}
          {isLoggedIn ? (
            <div style={mobileSection}>
              <div style={{ fontWeight: 1000, marginBottom: 10, color: "#111" }}>Account</div>
              <div style={mobileGrid}>
                <MobileLink href="/profile">Profile</MobileLink>
                <MobileLink href="/settings">Settings</MobileLink>
                <button
                  onClick={handleLogout}
                  style={{
                    ...hamburgerBtn,
                    width: "100%",
                    justifyContent: "center",
                    borderRadius: 12,
                    gridColumn: "1 / -1",
                  }}
                >
                  Logout
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}
