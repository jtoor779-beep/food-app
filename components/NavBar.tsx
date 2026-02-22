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

type NavItem = { href: string; label: string };

function dedupeByHref(items: NavItem[]) {
  const seen = new Set<string>();
  const out: NavItem[] = [];
  for (const it of items) {
    const href = String(it.href || "").trim();
    if (!href) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    out.push(it);
  }
  return out;
}

export default function NavBar() {
  const router = useRouter();
  const pathname = usePathname();

  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState("");
  const [role, setRole] = useState("");
  const [err, setErr] = useState("");

  // ✅ responsive UI state (no change to business logic)
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

  // ✅ detect mobile width (pure UI)
  useEffect(() => {
    function onResize() {
      const m = window.innerWidth <= 900;
      setIsMobile(m);
      if (!m) setMenuOpen(false);
    }
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ✅ close menu when route changes
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const isLoggedIn = !!userEmail;
  const isOwner = role === "restaurant_owner";
  const isCustomer = role === "customer";
  const isDelivery = role === "delivery_partner";
  const isAdmin = role === "admin";
  const isGroceryOwner = role === "grocery_owner";

  // ✅ Role-based Home routing (kept)
  const homeHref = useMemo(() => {
    if (!isLoggedIn) return "/";

    if (loading) {
      const p = pathname || "/";
      if (p.startsWith("/delivery")) return "/delivery";
      if (p.startsWith("/restaurants")) return "/restaurants/dashboard";
      if (p.startsWith("/admin")) return "/admin/orders";
      if (p.startsWith("/groceries/owner")) return "/groceries/owner/dashboard";
      return p;
    }

    if (isDelivery) return "/delivery";
    if (isOwner) return "/restaurants/dashboard";
    if (isGroceryOwner) return "/groceries/owner/dashboard";
    if (isAdmin) return "/admin/orders";
    return "/";
  }, [isLoggedIn, isDelivery, isOwner, isGroceryOwner, isAdmin, loading, pathname]);

  const isActive = (href: string) => {
    if (pathname === href) return true;
    if (href !== "/" && pathname?.startsWith(href + "/")) return true;
    return false;
  };

  /* =========================
     PREMIUM “MOSS-LIKE” HEADER
     ========================= */

  const layoutMax = 1240;

  const headerWrap: React.CSSProperties = {
    position: "sticky",
    top: 0,
    zIndex: 50,
    background: "#fff",
    borderBottom: "1px solid rgba(0,0,0,0.06)",
  };

  const mainHeaderRow: React.CSSProperties = {
    maxWidth: layoutMax,
    margin: "0 auto",
    padding: isMobile ? "12px 18px" : "16px 18px",
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 16,
  };

  const brand: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 12,
    minWidth: 180,
  };

  const brandMark: React.CSSProperties = {
    width: 44,
    height: 44,
    borderRadius: 14,
    display: "grid",
    placeItems: "center",
    border: "1px solid rgba(0,0,0,0.08)",
    background:
      "radial-gradient(14px 14px at 30% 25%, rgba(255,140,0,0.30), transparent 60%), radial-gradient(16px 16px at 70% 70%, rgba(80,160,255,0.22), transparent 65%), linear-gradient(180deg, rgba(255,255,255,0.92), rgba(248,248,248,0.92))",
    boxShadow: "0 10px 26px rgba(0,0,0,0.10)",
    flexShrink: 0,
  };

  const brandName: React.CSSProperties = {
    fontWeight: 1000,
    letterSpacing: -0.4,
    fontSize: 18,
    color: "#0b1220",
    lineHeight: 1,
    whiteSpace: "nowrap",
  };

  const brandSub: React.CSSProperties = {
    marginTop: 4,
    fontSize: 12,
    color: "rgba(15,23,42,0.55)",
    fontWeight: 900,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  };

  const centerNavWrap: React.CSSProperties = {
    flex: 1,
    display: "flex",
    justifyContent: "center",
    minWidth: 0,
  };

  const centerNav: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 18,
    flexWrap: "nowrap",
    padding: "6px 16px 6px 16px",
    borderRadius: 999,
    overflowX: "auto",
    whiteSpace: "nowrap",
    WebkitOverflowScrolling: "touch",
    msOverflowStyle: "none",
    scrollbarWidth: "none",
    scrollPaddingLeft: 16,
    scrollPaddingRight: 16,
    maxWidth: "100%",
  };

  const navLink = (href: string): React.CSSProperties => {
    const active = isActive(href);
    return {
      textDecoration: "none",
      textTransform: "uppercase",
      letterSpacing: 1.2,
      fontSize: 12,
      fontWeight: active ? 1000 : 900,
      color: active ? "#0b1220" : "rgba(2,6,23,0.62)",
      padding: "10px 10px",
      borderRadius: 10,
      position: "relative",
      whiteSpace: "nowrap",
      transition: "transform 120ms ease, color 120ms ease, opacity 120ms ease",
      transform: active ? "translateY(-1px)" : "translateY(0)",
      flexShrink: 0,
    };
  };

  const underline: React.CSSProperties = {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 6,
    height: 2,
    borderRadius: 999,
    background: "rgba(2,6,23,0.82)",
  };

  const rightActions: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 10,
    minWidth: 210,
    flexShrink: 0,
  };

  const badge: React.CSSProperties = {
    fontSize: 12,
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "rgba(255,255,255,0.7)",
    color: "rgba(2,6,23,0.70)",
    fontWeight: 900,
    whiteSpace: "nowrap",
  };

  const actionBtn: React.CSSProperties = {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.10)",
    background: "rgba(255,255,255,0.85)",
    cursor: "pointer",
    fontWeight: 950,
    color: "rgba(2,6,23,0.78)",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    whiteSpace: "nowrap",
  };

  const actionBtnPrimary: React.CSSProperties = {
    ...actionBtn,
    background: "linear-gradient(180deg, #0b0f19, #111827)",
    color: "#fff",
    border: "1px solid rgba(0,0,0,0.12)",
    boxShadow: "0 10px 24px rgba(0,0,0,0.16)",
  };

  const hamburgerBtn: React.CSSProperties = {
    ...actionBtn,
    padding: "10px 12px",
    borderRadius: 12,
    fontWeight: 950,
    gap: 8,
  };

  const mobileMenuPanel: React.CSSProperties = {
    maxWidth: layoutMax,
    margin: "0 auto",
    padding: "0 18px 16px 18px",
  };

  const mobileSection: React.CSSProperties = {
    marginTop: 10,
    padding: 14,
    borderRadius: 18,
    border: "1px solid rgba(0,0,0,0.08)",
    background: "rgba(255,255,255,0.92)",
    boxShadow: "0 18px 45px rgba(16,24,40,0.10)",
  };

  const mobileGrid: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
  };

  const mobileLinkStyle = (href: string): React.CSSProperties => {
    const active = isActive(href);
    return {
      ...actionBtn,
      width: "100%",
      justifyContent: "center",
      fontSize: 13,
      fontWeight: active ? 1000 : 900,
      background: active ? "rgba(2,6,23,0.06)" : "rgba(255,255,255,0.85)",
    };
  };

  function MobileLink({ href, children }: { href: string; children: React.ReactNode }) {
    return (
      <Link href={href} style={mobileLinkStyle(href)} onClick={() => setMenuOpen(false)}>
        {children}
      </Link>
    );
  }

  // Center nav items (kept logic, improved to avoid duplicate hrefs)
  const centerItems = useMemo((): NavItem[] => {
    // Guest
    if (!isLoggedIn) {
      return dedupeByHref([
        { href: homeHref, label: "Home" },
        { href: "/restaurants", label: "Restaurant" },
        { href: "/groceries", label: "Groceries" },
        { href: "/login", label: "Login" },
        { href: "/signup", label: "Sign Up" },
      ]);
    }

    // Customer
    if (isCustomer) {
      return dedupeByHref([
        { href: homeHref, label: "Home" },
        { href: "/restaurants", label: "Restaurant" },
        { href: "/groceries", label: "Groceries" },
        { href: "/cart", label: "Cart" },
        { href: "/orders", label: "My Orders" },
      ]);
    }

    // Delivery (✅ remove duplicate dashboard href)
    if (isDelivery) {
      return dedupeByHref([
        { href: homeHref, label: "Home" },
        // add more delivery links later if you want
      ]);
    }

    // Restaurant Owner
    if (isOwner) {
      return dedupeByHref([
        { href: homeHref, label: "Home" },
        { href: "/restaurants/orders", label: "Restaurant Orders" },
        { href: "/restaurants/menu", label: "Manage Menu" },
        { href: "/restaurants/settings", label: "Restaurant Settings" },
      ]);
    }

    // Grocery Owner (✅ this is what you want in screenshot)
    if (isGroceryOwner) {
      return dedupeByHref([
        { href: homeHref, label: "Home" },
        { href: "/groceries/owner/orders", label: "Grocery Orders" },
        { href: "/groceries/owner/items", label: "Manage Menu" },
        { href: "/groceries/owner/settings", label: "Grocery Settings" },
      ]);
    }

    // Admin (✅ remove duplicate)
    if (isAdmin) {
      return dedupeByHref([
        { href: homeHref, label: "Home" },
        // add more admin links later if you want
      ]);
    }

    return dedupeByHref([{ href: homeHref, label: "Home" }]);
  }, [homeHref, isLoggedIn, isCustomer, isDelivery, isOwner, isGroceryOwner, isAdmin]);

  const roleBadgeText = useMemo(() => {
    if (!isLoggedIn) return "guest";
    return role || "user";
  }, [isLoggedIn, role]);

  return (
    <header style={headerWrap}>
      <div style={mainHeaderRow}>
        {/* Left: Brand */}
        <Link href={homeHref} style={{ ...brand, textDecoration: "none", color: "inherit" }}>
          <div style={brandMark} aria-hidden="true">
            🍔
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={brandName}>HomyFod</div>
            <div style={brandSub}>Food • Groceries</div>
          </div>
        </Link>

        {/* Center nav (desktop) */}
        {!isMobile ? (
          <div style={centerNavWrap}>
            <nav style={centerNav} aria-label="Primary" className="hf-center-nav">
              {centerItems.map((it) => {
                const active = isActive(it.href);
                return (
                  <Link key={`${it.href}-${it.label}`} href={it.href} style={navLink(it.href)}>
                    {it.label}
                    {active ? <span style={underline} /> : null}
                  </Link>
                );
              })}
            </nav>
          </div>
        ) : (
          <div style={{ flex: 1 }} />
        )}

        {/* Right actions */}
        <div style={rightActions}>
          {err ? (
            <span style={{ color: "#b00020", fontSize: 12, fontWeight: 900, whiteSpace: "nowrap" }}>{err}</span>
          ) : null}
          {loading ? (
            <span style={{ fontSize: 12, color: "rgba(15,23,42,0.55)", fontWeight: 900 }}>Loading…</span>
          ) : null}

          {!isMobile ? (
            <>
              <span style={badge}>{roleBadgeText}</span>

              {isLoggedIn ? (
                <>
                  <Link href="/profile" style={actionBtn}>
                    Profile
                  </Link>
                  <Link href="/settings" style={actionBtn}>
                    Settings
                  </Link>
                  <button onClick={handleLogout} style={actionBtnPrimary}>
                    Logout
                  </button>
                </>
              ) : null}
            </>
          ) : (
            <>
              <span style={badge}>{roleBadgeText}</span>
              <button onClick={() => setMenuOpen((v) => !v)} style={hamburgerBtn} aria-label="Menu">
                {menuOpen ? "✕" : "☰"} <span style={{ fontSize: 13, fontWeight: 950 }}>Menu</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Mobile menu */}
      {isMobile && menuOpen ? (
        <div style={mobileMenuPanel}>
          <div style={mobileSection}>
            <div style={{ fontWeight: 1000, marginBottom: 10, color: "#0b1220" }}>Navigation</div>

            <div style={mobileGrid}>
              {centerItems.map((it) => (
                <MobileLink key={`${it.href}-${it.label}`} href={it.href}>
                  {it.label}
                </MobileLink>
              ))}
            </div>
          </div>

          {isLoggedIn ? (
            <div style={mobileSection}>
              <div style={{ fontWeight: 1000, marginBottom: 10, color: "#0b1220" }}>Account</div>
              <div style={mobileGrid}>
                <MobileLink href="/profile">Profile</MobileLink>
                <MobileLink href="/settings">Settings</MobileLink>

                <button
                  onClick={handleLogout}
                  style={{
                    ...actionBtnPrimary,
                    width: "100%",
                    justifyContent: "center",
                    borderRadius: 12,
                    gridColumn: "1 / -1",
                    padding: "12px 12px",
                  }}
                >
                  Logout
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <style jsx global>{`
        a:hover {
          opacity: 0.95;
        }
        .hf-center-nav::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </header>
  );
}