"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import supabase from "@/lib/supabase";

async function resolveRole(userId: string) {
  // Try profiles.role first
  const { data: prof } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (prof?.role) return prof.role;

  // Fallback: if user owns a restaurant => owner
  const { data: owned } = await supabase
    .from("restaurants")
    .select("id")
    .eq("owner_user_id", userId)
    .limit(1)
    .maybeSingle();

  if (owned?.id) return "restaurant_owner";

  return "customer";
}

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string>("");
  const [role, setRole] = useState<string>("guest");

  useEffect(() => {
    let mounted = true;

    async function boot() {
      setLoading(true);

      const { data } = await supabase.auth.getSession();
      const session = data?.session;

      if (!session?.user) {
        router.replace("/login");
        return;
      }

      const r = await resolveRole(session.user.id);

      if (!mounted) return;

      setEmail(session.user.email || "");
      setRole(r);

      // Owner-only guard
      if (r !== "restaurant_owner") {
        router.replace("/");
        return;
      }

      setLoading(false);
    }

    boot();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      boot();
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe();
    };
  }, [router]);

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (loading) {
    return <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>Loading…</div>;
  }

  return (
    <div>
      {/* Owner Navbar */}
      <div style={{ borderBottom: "1px solid #eee", background: "#fff" }}>
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
            <span style={{ fontWeight: 900 }}>🍔 Food App</span>
            <span
              style={{
                fontSize: 12,
                padding: "4px 10px",
                borderRadius: 999,
                border: "1px solid #e5e7eb",
              }}
            >
              {role}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Link style={navLink(pathname, "/owner/orders")} href="/owner/orders">
              Owner Orders
            </Link>
            <Link style={navLink(pathname, "/owner/menu")} href="/owner/menu">
              Manage Menu
            </Link>
            <Link style={navLink(pathname, "/profile")} href="/profile">
              Profile
            </Link>
            <Link style={navLink(pathname, "/settings")} href="/settings">
              Settings
            </Link>
            <button onClick={logout} style={btn}>
              Logout
            </button>
          </div>
        </div>

        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 16px 10px", color: "#6b7280", fontSize: 12 }}>
          Logged in: <b>{email}</b>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto" }}>{children}</div>
    </div>
  );
}

function navLink(pathname: string, href: string) {
  const active = pathname === href;
  return {
    textDecoration: "none",
    fontWeight: 800,
    padding: "8px 12px",
    borderRadius: 999,
    border: active ? "1px solid #111827" : "1px solid #e5e7eb",
    background: active ? "#111827" : "#fff",
    color: active ? "#fff" : "#111827",
    fontSize: 13,
  } as const;
}

const btn = {
  padding: "9px 12px",
  borderRadius: 999,
  border: "1px solid #e5e7eb",
  background: "#fff",
  fontWeight: 900,
  cursor: "pointer",
} as const;
