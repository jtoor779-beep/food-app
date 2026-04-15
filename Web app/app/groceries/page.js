"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import supabase from "@/lib/supabase";
import { readGlobalCity, subscribeGlobalCity } from "@/lib/globalLocation";

function clean(v) {
  return String(v || "").trim();
}

function normalizeCityKey(v) {
  return clean(v).toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function cityMatches(inputCity, rowCity) {
  const a = normalizeCityKey(inputCity);
  const b = normalizeCityKey(rowCity);
  if (!a) return true;
  if (!b) return false;
  if (b.includes(a) || a.includes(b)) return true;
  const aFirst = a.split(" ")[0] || "";
  const bFirst = b.split(" ")[0] || "";
  return !!(aFirst && bFirst && (aFirst === bFirst || bFirst.startsWith(aFirst) || aFirst.startsWith(bFirst)));
}

// demo helpers (used for rating/eta only)
function hashNum(s) {
  let h = 0;
  const str = String(s || "");
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}
function demoRating(id) {
  const n = hashNum(id) % 45;
  return (3.6 + n / 100).toFixed(1);
}
function demoEta(id) {
  const n = hashNum(id) % 26;
  return 15 + n; // 15..40 mins
}
function demoFreeDelivery(id) {
  return hashNum(id) % 10 >= 5;
}

// filter helpers
function isApprovedRow(r) {
  const a = String(r?.approval_status || "").toLowerCase();
  if (a) return a === "approved";
  return true;
}
function isEnabledRow(r) {
  if (typeof r?.is_disabled === "boolean") return !r.is_disabled;
  if (typeof r?.disabled === "boolean") return !r.disabled;
  if (typeof r?.enabled === "boolean") return !!r.enabled;
  if (typeof r?.is_active === "boolean") return !!r.is_active;
  return true;
}
function isOpenNowRow(r) {
  // IMPORTANT: do NOT use is_open column (it doesn't exist)
  if (typeof r?.accepting_orders === "boolean") return !!r.accepting_orders;
  if (typeof r?.is_open === "boolean") return !!r.is_open; // fallback if you ever add later
  return true;
}

export default function GroceriesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState("");

  const [stores, setStores] = useState([]);
  const [reviewStatsByStore, setReviewStatsByStore] = useState({});
  const [isGuest, setIsGuest] = useState(true);

  const [profileCity, setProfileCity] = useState("");
  const [cityInput, setCityInput] = useState("");
  const [activeCity, setActiveCity] = useState("");

  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("recommended"); // recommended | rating | eta | az

  const title = useMemo(() => {
    if (activeCity) return `Groceries near ${activeCity}`;
    return "Groceries";
  }, [activeCity]);
  function getRatingNumber(storeId) {
    const stat = reviewStatsByStore?.[storeId];
    if (stat?.count > 0) return Number(stat.average || 0);
    return 0;
  }

  async function loadStoreReviewStats(storeIds) {
    const ids = Array.from(new Set((storeIds || []).filter(Boolean)));
    if (!ids.length) {
      setReviewStatsByStore({});
      return;
    }

    try {
      const { data, error } = await supabase
        .from("reviews")
        .select("target_id, rating")
        .eq("target_type", "grocery")
        .eq("is_visible", true)
        .in("target_id", ids);

      if (error) throw error;

      const stats = {};
      for (const id of ids) stats[id] = { sum: 0, count: 0, average: 0 };

      for (const row of data || []) {
        const id = row?.target_id;
        const rating = Number(row?.rating || 0);
        if (!id || !Number.isFinite(rating)) continue;
        if (!stats[id]) stats[id] = { sum: 0, count: 0, average: 0 };
        stats[id].sum += rating;
        stats[id].count += 1;
      }

      for (const id of Object.keys(stats)) {
        const count = Number(stats[id].count || 0);
        stats[id].average = count > 0 ? stats[id].sum / count : 0;
      }

      setReviewStatsByStore(stats);
    } catch {
      setReviewStatsByStore({});
    }
  }

  async function loadProfileCity() {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;

    if (!user) {
      setIsGuest(true);
      setProfileCity("");
      return "";
    }

    setIsGuest(false);

    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .select("city")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profErr) throw profErr;

    const c = clean(prof?.city);
    setProfileCity(c);
    return c;
  }

  // REAL loader from DB
  async function loadStores(city) {
    setLoading(true);
    setErrMsg("");

    try {
      // IMPORTANT: only select columns that exist
      // (NO is_open here)
      const c = clean(city);
      const q = supabase
        .from("grocery_stores")
        .select("id, name, city, image_url, approval_status, is_disabled, accepting_orders")
        .order("name", { ascending: true });

      const { data, error } = await q;
      if (error) throw error;

      const allRows = Array.isArray(data) ? data : [];
      let rows = allRows;
      if (c) {
        rows = allRows.filter((row) => cityMatches(c, row?.city));
        if (!rows.length) rows = allRows;
      }

      setStores(rows);
      await loadStoreReviewStats(rows.map((row) => row?.id));
    } catch (e) {
      setErrMsg(e?.message || String(e));
      setStores([]);
      setReviewStatsByStore({});
    } finally {
      setLoading(false);
    }
  }

  async function init() {
    setLoading(true);
    setErrMsg("");
    try {
      const c = await loadProfileCity();
      const selectedCity = clean(readGlobalCity() || c);
      setActiveCity(selectedCity);
      setCityInput(selectedCity);
      await loadStores(selectedCity);
    } catch (e) {
      setErrMsg(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    init();

    const unsubscribe = subscribeGlobalCity((city) => {
      const nextCity = clean(city);
      setActiveCity(nextCity);
      setCityInput(nextCity);
      loadStores(nextCity);
    });

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function applyCity() {
    const c = clean(cityInput);
    setActiveCity(c);
    await loadStores(c);
  }

  const processed = useMemo(() => {
    let list = Array.isArray(stores) ? [...stores] : [];

    // HARD filter: approved + enabled
    list = list.filter((r) => isApprovedRow(r) && isEnabledRow(r));

    const s = clean(search).toLowerCase();
    if (s) {
      list = list.filter((r) => {
        const nm = String(r?.name || "").toLowerCase();
        const ct = String(r?.city || "").toLowerCase();
        return nm.includes(s) || ct.includes(s);
      });
    }

    if (sortBy === "az") {
      list.sort((a, b) => String(a?.name || "").localeCompare(String(b?.name || "")));
    } else if (sortBy === "rating") {
      list.sort((a, b) => getRatingNumber(b?.id) - getRatingNumber(a?.id));
    } else if (sortBy === "eta") {
      list.sort((a, b) => Number(demoEta(a?.id)) - Number(demoEta(b?.id)));
    } else {
      list.sort((a, b) => hashNum(a?.id) - hashNum(b?.id));
    }

    return list;
  }, [stores, search, sortBy]);

  return (
    <main style={pageBg}>
      <div style={{ width: "100%", margin: 0 }}>
        {/* Guest banner */}
        {isGuest ? (
          <div style={guestBanner}>
            <div style={{ fontWeight: 950 }}>Browsing as Guest</div>
            <div style={{ color: "rgba(17,24,39,0.72)", fontWeight: 800 }}>
              You can explore stores & items. Login is required only when you place an order.
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link href="/login" style={btnSmallDarkLink}>
                Login
              </Link>
              <Link href="/signup" style={btnSmallOutlineLink}>
                Sign Up
              </Link>
            </div>
          </div>
        ) : null}

        {/* Search + sort */}
        <div style={filtersBar}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search store name or city..."
            style={searchInput}
            autoComplete="off"
          />

          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={selectMini}>
            <option value="recommended">Recommended</option>
            <option value="rating">Top Rated </option>
            <option value="eta">Fast Delivery </option>
            <option value="az">A-Z</option>
          </select>

          <div style={{ marginTop: 6, color: "rgba(17,24,39,0.6)", fontWeight: 800, fontSize: 12 }}>
            Showing <b>{processed.length}</b> store(s)
          </div>
        </div>

        {errMsg ? <div style={alertErr}>{errMsg}</div> : null}

        {loading ? <div style={{ marginTop: 14, color: "rgba(17,24,39,0.7)", fontWeight: 800 }}>Loading...</div> : null}

        {!loading && processed.length === 0 ? (
          <div style={emptyBox}>No grocery stores found{activeCity ? ` in ${activeCity}.` : "."}</div>
        ) : null}

        {!loading && processed.length > 0 ? (
          <div style={grid}>
            {processed.map((r) => {
              const rid = r?.id;
              const rating = getRatingNumber(rid).toFixed(1);
              const eta = demoEta(rid);
              const free = demoFreeDelivery(rid);
              const open = isOpenNowRow(r);

              return (
                <div
                  key={rid}
                  style={{ ...cardGlass, cursor: "pointer" }}
                  onClick={() => router.push(`/groceries/menu?store_id=${rid}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      router.push(`/groceries/menu?store_id=${rid}`);
                    }
                  }}
                  role="link"
                  tabIndex={0}
                >
                  <div style={imgWrap}>
                    {r.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.image_url} alt={r.name} style={img} />
                    ) : (
                      <div style={imgPlaceholder}>No Image</div>
                    )}

                    <div style={topBadges}>
                      <span style={badgeDark}>Rating {rating}</span>
                      <span style={badgeLight}>{eta} mins</span>
                    </div>
                  </div>

                  <div style={{ padding: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                      <div style={{ fontSize: 16, fontWeight: 1000, color: "#0b1220" }}>{r.name || "Grocery Store"}</div>
                      <span style={open ? openPill : closedPill}>{open ? "Open" : "Closed"}</span>
                    </div>

                    <div style={{ fontSize: 12, color: "rgba(17,24,39,0.65)", marginTop: 6, fontWeight: 800 }}>
                      {r.city ? `${r.city}` : "City not set"} | {free ? "Free delivery " : "Delivery "}
                    </div>

                    <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <span style={tag}>Fresh</span>
                      <span style={tag}>Everyday items</span>
                      <span style={tag}>Fast delivery</span>
                      {free ? <span style={tagStrong}>Offer</span> : null}
                    </div>

                    <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <Link href={`/groceries/menu?store_id=${rid}`} style={btnSmallDarkLink} onClick={(e) => e.stopPropagation()}>
                        Open Store
                      </Link>
                      <Link href={`/groceries/menu?store_id=${rid}`} style={btnSmallOutlineLink} onClick={(e) => e.stopPropagation()}>
                        View
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </main>
  );
}

/* ===== Premium inline styles ===== */

const pageBg = {
  minHeight: "calc(100vh - 64px)",
  padding: 20,
  background:
    "radial-gradient(1200px 600px at 20% 10%, rgba(16,185,129,0.18), transparent 62%), radial-gradient(900px 520px at 80% 18%, rgba(80,160,255,0.18), transparent 58%), linear-gradient(180deg, #f7f7fb, #ffffff)",
};

const heroGlass = {
  borderRadius: 20,
  padding: 18,
  background: "rgba(255,255,255,0.78)",
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 14px 44px rgba(0,0,0,0.09)",
  backdropFilter: "blur(10px)",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const pill = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 12px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.7)",
  fontSize: 12,
  fontWeight: 950,
  color: "rgba(17,24,39,0.85)",
};

const heroTitle = {
  margin: "10px 0 0 0",
  fontSize: 30,
  fontWeight: 1000,
  color: "#0b1220",
  letterSpacing: -0.2,
};

const subText = {
  marginTop: 8,
  color: "rgba(17,24,39,0.7)",
  fontWeight: 700,
};

const controlsGlass = {
  borderRadius: 18,
  padding: 14,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 12px 36px rgba(0,0,0,0.07)",
  backdropFilter: "blur(10px)",
  display: "flex",
  flexDirection: "column",
  gap: 10,
  minWidth: 320,
};

const input = {
  padding: 10,
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.9)",
  minWidth: 220,
  outline: "none",
  fontWeight: 800,
};

const btnPrimary = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(17,24,39,0.95)",
  background: "rgba(17,24,39,0.95)",
  color: "#fff",
  cursor: "pointer",
  fontWeight: 950,
  boxShadow: "0 10px 22px rgba(17,24,39,0.16)",
};

const filtersBar = {
  marginTop: 14,
  borderRadius: 18,
  padding: 14,
  background: "rgba(255,255,255,0.74)",
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 12px 36px rgba(0,0,0,0.07)",
  backdropFilter: "blur(10px)",
};

const searchInput = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.12)",
  outline: "none",
  background: "rgba(255,255,255,0.9)",
  fontSize: 14,
  fontWeight: 800,
  marginBottom: 10,
};

const selectMini = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.9)",
  fontWeight: 900,
  fontSize: 13,
  outline: "none",
  marginBottom: 10,
};

const guestBanner = {
  marginTop: 14,
  borderRadius: 18,
  padding: 14,
  background: "rgba(255,255,255,0.78)",
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 12px 36px rgba(0,0,0,0.07)",
  backdropFilter: "blur(10px)",
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
};

const btnSmallDarkLink = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(17,24,39,0.95)",
  background: "rgba(17,24,39,0.95)",
  color: "#fff",
  textDecoration: "none",
  fontWeight: 950,
};

const btnSmallOutlineLink = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.85)",
  color: "#111827",
  textDecoration: "none",
  fontWeight: 950,
};

const alertErr = {
  marginTop: 12,
  padding: 12,
  border: "1px solid #fecaca",
  background: "rgba(254,242,242,0.9)",
  borderRadius: 14,
  color: "#7f1d1d",
  fontWeight: 900,
};

const emptyBox = {
  marginTop: 12,
  padding: 14,
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.75)",
  color: "rgba(17,24,39,0.7)",
  fontWeight: 800,
};

const grid = {
  marginTop: 14,
  marginLeft: -12,
  marginRight: -12,
  width: "calc(100% + 24px)",
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
  gap: 12,
};

const cardGlass = {
  borderRadius: 18,
  background: "rgba(255,255,255,0.78)",
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 12px 36px rgba(0,0,0,0.08)",
  backdropFilter: "blur(10px)",
  overflow: "hidden",
};

const imgWrap = {
  height: 190,
  background: "rgba(0,0,0,0.03)",
  borderBottom: "1px solid rgba(0,0,0,0.06)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  position: "relative",
};

const img = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
};

const imgPlaceholder = {
  color: "rgba(17,24,39,0.45)",
  fontSize: 12,
  fontWeight: 950,
};

const topBadges = {
  position: "absolute",
  top: 10,
  left: 10,
  right: 10,
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  pointerEvents: "none",
};

const badgeDark = {
  padding: "6px 10px",
  borderRadius: 999,
  background: "rgba(17,24,39,0.92)",
  color: "#fff",
  fontWeight: 950,
  fontSize: 12,
  border: "1px solid rgba(255,255,255,0.14)",
};

const badgeLight = {
  padding: "6px 10px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.85)",
  color: "rgba(17,24,39,0.85)",
  fontWeight: 950,
  fontSize: 12,
  border: "1px solid rgba(0,0,0,0.12)",
};

const openPill = {
  padding: "4px 10px",
  borderRadius: 999,
  border: "1px solid rgba(16,185,129,0.30)",
  background: "rgba(236,253,245,0.90)",
  color: "#065f46",
  fontWeight: 950,
  fontSize: 12,
};

const closedPill = {
  padding: "4px 10px",
  borderRadius: 999,
  border: "1px solid rgba(239,68,68,0.25)",
  background: "rgba(254,242,242,0.90)",
  color: "#7f1d1d",
  fontWeight: 950,
  fontSize: 12,
};

const tag = {
  fontSize: 12,
  padding: "5px 10px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.7)",
  color: "rgba(17,24,39,0.8)",
  fontWeight: 900,
};

const tagStrong = {
  ...tag,
  border: "1px solid rgba(17,24,39,0.16)",
  background: "rgba(17,24,39,0.92)",
  color: "#fff",
};