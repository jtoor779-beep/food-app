"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import supabase from "@/lib/supabase";

/* =========================
   Helpers
   ========================= */
function clean(v) {
  return String(v || "").trim();
}
function lower(v) {
  return clean(v).toLowerCase();
}
function money(v) {
  const n = Number(v || 0);
  return `₹${n.toFixed(0)}`;
}
function clampText(s, max = 90) {
  const str = String(s ?? "");
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + "…";
}
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/* =========================
   Cart (localStorage)
   =========================
   IMPORTANT FIX:
   Your /cart page is reading from "cart_items".
   Previously groceries saved into "grocery_cart_items" so /cart looked empty.
*/
const CART_KEY = "cart_items"; // ✅ same key used by restaurant cart page

function readCart() {
  try {
    // ✅ primary: cart_items (shared cart page)
    const a = localStorage.getItem(CART_KEY);
    if (a) return JSON.parse(a);

    // ✅ fallback: older grocery keys (so nothing breaks if already stored)
    const b = localStorage.getItem("grocery_cart_items");
    if (b) return JSON.parse(b);

    const c = localStorage.getItem("grocery_cart");
    if (c) return JSON.parse(c);

    return [];
  } catch {
    return [];
  }
}

function writeCart(items) {
  // ✅ write to primary key so /cart page reads it
  localStorage.setItem(CART_KEY, JSON.stringify(items));

  // ✅ also keep a backup in grocery key (optional, helps future separate grocery cart page)
  try {
    localStorage.setItem("grocery_cart_items", JSON.stringify(items));
  } catch {}
}

/* =========================
   Page
   ========================= */
export default function GroceryMenuPage() {
  const router = useRouter();
  const params = useSearchParams();
  const storeId = clean(params.get("store_id"));

  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState("");

  const [store, setStore] = useState(null);
  const [items, setItems] = useState([]);

  // ✅ categories + subcategories
  const [categories, setCategories] = useState([]); // grocery_categories
  const [subcategories, setSubcategories] = useState([]); // grocery_subcategories

  // ✅ selected category/subcategory filters
  const [categoryId, setCategoryId] = useState("all"); // "all" | uuid
  const [subcategoryId, setSubcategoryId] = useState("all"); // "all" | uuid

  // UI filters (grocery-safe)
  const [search, setSearch] = useState("");
  const [onlyInStock, setOnlyInStock] = useState(false);
  const [onlyBest, setOnlyBest] = useState(false);
  const [sortBy, setSortBy] = useState("recommended"); // recommended | price_asc | price_desc | az | newest
  const [priceCap, setPriceCap] = useState(0); // 0 = no cap, else <= cap

  // details modal
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [activeItem, setActiveItem] = useState(null);

  // cart
  const [cartCount, setCartCount] = useState(0);

  function refreshCartCount() {
    const c = readCart();
    const count = (c || []).reduce((sum, it) => sum + (Number(it?.qty || 0) || 0), 0);
    setCartCount(count);
  }

  async function loadAll() {
    setErrMsg("");
    setLoading(true);

    try {
      if (!storeId) {
        setLoading(false);
        setErrMsg("Store not found. Please go back to groceries and open a store.");
        return;
      }

      // Load store
      const { data: s, error: sErr } = await supabase
        .from("grocery_stores")
        .select("id, name, city, image_url, accepting_orders, approval_status, is_disabled")
        .eq("id", storeId)
        .maybeSingle();

      if (sErr) throw sErr;
      setStore(s || null);

      // ✅ Load categories (active)
      const { data: cats, error: cErr } = await supabase
        .from("grocery_categories")
        .select("id, store_id, name, slug, sort_order, is_active")
        .eq("store_id", storeId)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (cErr) throw cErr;

      const catList = Array.isArray(cats) ? cats.filter((x) => x?.is_active !== false) : [];
      setCategories(catList);

      // ✅ Load subcategories (active)
      const { data: subs, error: scErr } = await supabase
        .from("grocery_subcategories")
        .select("id, store_id, category_id, name, slug, sort_order, is_active")
        .eq("store_id", storeId)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (scErr) throw scErr;

      const subList = Array.isArray(subs) ? subs.filter((x) => x?.is_active !== false) : [];
      setSubcategories(subList);

      // Load items
      const { data: it, error: itErr } = await supabase
        .from("grocery_items")
        .select(
          "id, store_id, name, description, price, image_url, category, category_id, subcategory_id, is_available, in_stock, is_veg, is_best_seller, is_recommended, created_at"
        )
        .eq("store_id", storeId)
        .order("created_at", { ascending: false });

      if (itErr) throw itErr;

      // show only available items to customers
      const list = Array.isArray(it) ? it.filter((x) => !!x?.is_available) : [];
      setItems(list);
    } catch (e) {
      setErrMsg(e?.message || String(e));
      setStore(null);
      setItems([]);
      setCategories([]);
      setSubcategories([]);
    } finally {
      setLoading(false);
      refreshCartCount();
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  useEffect(() => {
    refreshCartCount();
    const onStorage = () => refreshCartCount();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const storeOpen = useMemo(() => {
    if (!store) return false;
    if (store?.is_disabled) return false;
    const a = String(store?.approval_status || "approved").toLowerCase();
    if (a && a !== "approved") return false;
    if (typeof store?.accepting_orders === "boolean") return !!store.accepting_orders;
    return true;
  }, [store]);

  const stats = useMemo(() => {
    const total = items.length;
    const inS = items.filter((x) => !!x?.in_stock).length;
    const best = items.filter((x) => !!x?.is_best_seller).length;
    return { total, inS, best };
  }, [items]);

  // ✅ quick lookup maps
  const catMap = useMemo(() => {
    const m = new Map();
    (categories || []).forEach((c) => m.set(String(c?.id), c));
    return m;
  }, [categories]);

  const subMap = useMemo(() => {
    const m = new Map();
    (subcategories || []).forEach((s) => m.set(String(s?.id), s));
    return m;
  }, [subcategories]);

  // ✅ selected names (used for legacy fallback matching)
  const selectedCategoryName = useMemo(() => {
    if (categoryId === "all") return "";
    return clean(catMap.get(String(categoryId))?.name);
  }, [categoryId, catMap]);

  const selectedSubcategoryName = useMemo(() => {
    if (subcategoryId === "all") return "";
    return clean(subMap.get(String(subcategoryId))?.name);
  }, [subcategoryId, subMap]);

  const visibleSubcategories = useMemo(() => {
    if (categoryId === "all") return [];
    const cid = String(categoryId);
    return (subcategories || []).filter((s) => String(s?.category_id) === cid);
  }, [subcategories, categoryId]);

  // ✅ legacy subcategory fallback (if you ever store it in a text column later)
  function legacySubName(it) {
    return (
      clean(it?.subcategory) ||
      clean(it?.sub_category) ||
      clean(it?.subCategory) ||
      clean(it?.subcategory_name) ||
      ""
    );
  }

  const processed = useMemo(() => {
    let list = Array.isArray(items) ? [...items] : [];

    // ✅ CATEGORY FILTER (FIXED)
    // If category_id exists -> filter by id
    // Else fallback to legacy string category match
    if (categoryId !== "all") {
      const cid = String(categoryId);
      const wantName = lower(selectedCategoryName);

      list = list.filter((x) => {
        const hasId = !!x?.category_id;
        if (hasId) return String(x?.category_id) === cid;

        // fallback legacy: category text equals selected category name
        if (!wantName) return false;
        return lower(x?.category) === wantName;
      });
    }

    // ✅ SUBCATEGORY FILTER (FIXED)
    // If subcategory_id exists -> filter by id
    // Else fallback to legacy subcategory name match (if exists)
    if (subcategoryId !== "all") {
      const sid = String(subcategoryId);
      const wantSub = lower(selectedSubcategoryName);

      list = list.filter((x) => {
        const hasId = !!x?.subcategory_id;
        if (hasId) return String(x?.subcategory_id) === sid;

        // fallback legacy: try common subcategory text columns
        if (!wantSub) return false;
        return lower(legacySubName(x)) === wantSub;
      });
    }

    const q = clean(search).toLowerCase();
    if (q) {
      list = list.filter((x) => {
        const n = clean(x?.name).toLowerCase();
        const d = clean(x?.description).toLowerCase();

        // show better search by category/subcategory names too
        const legacy = clean(x?.category).toLowerCase();
        const catName = clean(catMap.get(String(x?.category_id || ""))?.name).toLowerCase();
        const subName = clean(subMap.get(String(x?.subcategory_id || ""))?.name).toLowerCase();
        const legSub = lower(legacySubName(x));

        return n.includes(q) || d.includes(q) || legacy.includes(q) || catName.includes(q) || subName.includes(q) || legSub.includes(q);
      });
    }

    if (onlyInStock) list = list.filter((x) => !!x?.in_stock);
    if (onlyBest) list = list.filter((x) => !!x?.is_best_seller);

    if (priceCap > 0) list = list.filter((x) => num(x?.price) <= priceCap);

    // sorting
    if (sortBy === "az") {
      list.sort((a, b) => clean(a?.name).localeCompare(clean(b?.name)));
    } else if (sortBy === "price_asc") {
      list.sort((a, b) => num(a?.price) - num(b?.price));
    } else if (sortBy === "price_desc") {
      list.sort((a, b) => num(b?.price) - num(a?.price));
    } else if (sortBy === "newest") {
      list.sort((a, b) => new Date(b?.created_at || 0) - new Date(a?.created_at || 0));
    } else {
      // recommended: best + recommended first, then in_stock, then newest
      list.sort((a, b) => {
        const ar = (a?.is_best_seller ? 20 : 0) + (a?.is_recommended ? 10 : 0) + (a?.in_stock ? 3 : 0);
        const br = (b?.is_best_seller ? 20 : 0) + (b?.is_recommended ? 10 : 0) + (b?.in_stock ? 3 : 0);
        if (br !== ar) return br - ar;
        return new Date(b?.created_at || 0) - new Date(a?.created_at || 0);
      });
    }

    return list;
  }, [
    items,
    search,
    onlyInStock,
    onlyBest,
    sortBy,
    priceCap,
    categoryId,
    subcategoryId,
    catMap,
    subMap,
    selectedCategoryName,
    selectedSubcategoryName,
  ]);

  function addToCart(item) {
    if (!item?.id) return;

    const cart = readCart() || [];
    const idx = cart.findIndex((x) => x?.id === item.id);

    if (idx >= 0) {
      cart[idx].qty = (Number(cart[idx].qty || 0) || 0) + 1;
    } else {
      // category label shown in cart - prefer new category name, fallback to legacy text
      const catName = clean(catMap.get(String(item?.category_id || ""))?.name) || item.category || "General";

      cart.push({
        id: item.id,
        store_id: item.store_id,
        name: item.name,
        price: num(item.price),
        image_url: item.image_url || "",
        category: catName,
        qty: 1,

        // ✅ optional marker (won’t break anything, helps later if we separate carts)
        item_type: "grocery",
      });
    }

    writeCart(cart);
    refreshCartCount();
  }

  function openDetails(item) {
    setActiveItem(item || null);
    setDetailsOpen(true);
  }

  function clearFilters() {
    setSearch("");
    setOnlyInStock(false);
    setOnlyBest(false);
    setSortBy("recommended");
    setPriceCap(0);

    // ✅ reset
    setCategoryId("all");
    setSubcategoryId("all");
  }

  // ✅ new helper for badge label
  function displayCategoryLabel(it) {
    const catName = clean(catMap.get(String(it?.category_id || ""))?.name);
    return catName || clean(it?.category) || "General";
  }

  function displaySubcategoryLabel(it) {
    const subName = clean(subMap.get(String(it?.subcategory_id || ""))?.name);
    if (subName) return subName;

    // fallback legacy (if exists)
    const leg = legacySubName(it);
    return leg || "";
  }

  return (
    <main style={pageBg}>
      <div style={{ width: "100%", margin: 0 }}>
        {/* HERO */}
        <div style={heroWrap}>
          <div style={heroLeft}>
            <div style={pill}>Groceries</div>
            <h1 style={heroTitle}>{store?.name || "Grocery Store"}</h1>
            <div style={subText}>
              📍 {store?.city || "City not set"} • Browse items & add to cart
            </div>

            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button onClick={() => router.push("/groceries")} style={btnLight}>
                ← Back to Stores
              </button>
              <button onClick={loadAll} style={btnDark} disabled={loading}>
                Refresh
              </button>
              <Link href="/cart" style={btnLight}>
                Go to Cart {cartCount > 0 ? `(${cartCount})` : ""}
              </Link>
            </div>
          </div>

          <div style={heroRight}>
            <div style={infoCard}>
              <div style={{ fontWeight: 1000, color: "#0b1220" }}>Store Info</div>
              <div style={infoRow}>
                <span style={miniPill}>Items: {stats.total}</span>
                <span style={miniPill}>In Stock: {stats.inS}</span>
                <span style={miniPill}>Best: {stats.best}</span>
                <span style={storeOpen ? openPill : closedPill}>{storeOpen ? "Open" : "Closed"}</span>
              </div>

              {!storeOpen ? <div style={alertMini}>Store is not accepting orders right now (or pending/disabled).</div> : null}
            </div>
          </div>
        </div>

        {errMsg ? <div style={alertErr}>{errMsg}</div> : null}

        {/* FILTER BAR */}
        <div style={panelGlass}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <div style={{ fontWeight: 1000, color: "#0b1220" }}>Search</div>
            <button onClick={clearFilters} style={btnGhost}>
              Clear
            </button>
          </div>

          {/* ✅ Category chips */}
          {categories?.length ? (
            <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <button
                onClick={() => {
                  setCategoryId("all");
                  setSubcategoryId("all");
                }}
                style={categoryId === "all" ? chipOn : chipOff}
              >
                All Categories
              </button>

              {categories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setCategoryId(String(c.id));
                    setSubcategoryId("all");
                  }}
                  style={String(categoryId) === String(c.id) ? chipOn : chipOff}
                  title={c.name}
                >
                  {c.name}
                </button>
              ))}
            </div>
          ) : null}

          {/* ✅ Subcategory dropdown (only when category selected) */}
          {categoryId !== "all" ? (
            <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
              <select value={String(subcategoryId)} onChange={(e) => setSubcategoryId(String(e.target.value))} style={input}>
                <option value="all">Subcategory: All</option>
                {visibleSubcategories.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1.4fr 0.6fr 0.6fr", gap: 10 }}>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search items…" style={input} autoComplete="off" />
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={input}>
              <option value="recommended">Sort: Recommended</option>
              <option value="newest">Sort: Newest</option>
              <option value="az">Sort: A–Z</option>
              <option value="price_asc">Sort: Price (Low → High)</option>
              <option value="price_desc">Sort: Price (High → Low)</option>
            </select>

            <select value={String(priceCap)} onChange={(e) => setPriceCap(Number(e.target.value || 0))} style={input}>
              <option value="0">Price: Any</option>
              <option value="99">Under ₹99</option>
              <option value="199">Under ₹199</option>
              <option value="299">Under ₹299</option>
              <option value="499">Under ₹499</option>
            </select>
          </div>

          <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button onClick={() => setOnlyBest((v) => !v)} style={onlyBest ? chipOn : chipOff}>
              Bestseller
            </button>
            <button onClick={() => setOnlyInStock((v) => !v)} style={onlyInStock ? chipOn : chipOff}>
              In stock
            </button>

            <div style={{ marginLeft: "auto", fontWeight: 900, color: "rgba(17,24,39,0.65)", fontSize: 12 }}>
              Showing <b>{processed.length}</b> item(s)
            </div>
          </div>
        </div>

        {/* STORE BANNER IMAGE */}
        {store?.image_url ? (
          <div style={bannerWrap}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={store.image_url} alt={store.name || "Store"} style={bannerImg} />
            <div style={bannerOverlay} />
          </div>
        ) : null}

        {/* ITEMS GRID */}
        {loading ? <div style={{ marginTop: 14, fontWeight: 900, color: "rgba(17,24,39,0.7)" }}>Loading…</div> : null}

        {!loading && processed.length === 0 ? <div style={emptyBox}>No items found. Try clearing filters.</div> : null}

        {!loading && processed.length > 0 ? (
          <div style={grid}>
            {processed.map((it) => (
              <div key={it.id} style={cardGlass}>
                <div style={imgWrap} onClick={() => openDetails(it)} title="Tap for details">
                  {it.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.image_url} alt={it.name} style={img} />
                  ) : (
                    <div style={imgPlaceholder}>No Image</div>
                  )}

                  <div style={topBadges}>
                    <span style={badgeDark}>{money(it.price)}</span>
                    <span style={badgeLight}>{displayCategoryLabel(it)}</span>
                  </div>

                  <div style={tapHint}>Tap for details</div>
                </div>

                <div style={{ padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                    <div style={{ fontSize: 15, fontWeight: 1000, color: "#0b1220" }}>{it.name || "Item"}</div>
                    <span style={it.in_stock ? openPill : closedPill}>{it.in_stock ? "In stock" : "Out"}</span>
                  </div>

                  {it.description ? (
                    <div style={{ marginTop: 6, fontSize: 12, fontWeight: 850, color: "rgba(17,24,39,0.68)" }}>
                      {clampText(it.description, 80)}
                    </div>
                  ) : null}

                  <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {/* show subcategory tag if exists */}
                    {displaySubcategoryLabel(it) ? <span style={tag}>{displaySubcategoryLabel(it)}</span> : null}
                    {it.is_best_seller ? <span style={tagStrong}>Best</span> : null}
                    {it.is_recommended ? <span style={tagStrong}>Rec</span> : null}
                  </div>

                  <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button
                      onClick={() => addToCart(it)}
                      style={btnAdd}
                      disabled={!storeOpen || !it?.in_stock}
                      title={!storeOpen ? "Store closed" : !it?.in_stock ? "Out of stock" : "Add to cart"}
                    >
                      + Add to Cart
                    </button>

                    <button onClick={() => openDetails(it)} style={btnGhost}>
                      Details
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {/* DETAILS MODAL */}
        {detailsOpen ? (
          <div style={modalBackdrop} onClick={() => setDetailsOpen(false)}>
            <div style={modalCard} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                <div style={{ fontWeight: 1000, fontSize: 16, color: "#0b1220" }}>{activeItem?.name || "Item details"}</div>
                <button onClick={() => setDetailsOpen(false)} style={btnClose}>
                  ✕
                </button>
              </div>

              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div style={modalImgWrap}>
                  {activeItem?.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={activeItem.image_url} alt={activeItem.name} style={modalImg} />
                  ) : (
                    <div style={imgPlaceholder}>No Image</div>
                  )}
                </div>

                <div>
                  <div style={{ fontWeight: 1000, fontSize: 18, color: "#0b1220" }}>{money(activeItem?.price)}</div>

                  <div style={{ marginTop: 8, fontWeight: 900, color: "rgba(17,24,39,0.7)" }}>
                    Category: {activeItem ? displayCategoryLabel(activeItem) : "General"}
                  </div>

                  {activeItem && displaySubcategoryLabel(activeItem) ? (
                    <div style={{ marginTop: 6, fontWeight: 900, color: "rgba(17,24,39,0.65)", fontSize: 13 }}>
                      Subcategory: {displaySubcategoryLabel(activeItem)}
                    </div>
                  ) : null}

                  <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span style={activeItem?.in_stock ? openPill : closedPill}>{activeItem?.in_stock ? "In stock" : "Out of stock"}</span>
                    {activeItem?.is_best_seller ? <span style={tagStrong}>Best</span> : null}
                    {activeItem?.is_recommended ? <span style={tagStrong}>Rec</span> : null}
                  </div>

                  {activeItem?.description ? (
                    <div style={{ marginTop: 12, fontWeight: 850, color: "rgba(17,24,39,0.75)" }}>{activeItem.description}</div>
                  ) : (
                    <div style={{ marginTop: 12, fontWeight: 850, color: "rgba(17,24,39,0.55)" }}>No description added.</div>
                  )}

                  <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button onClick={() => addToCart(activeItem)} style={btnAdd} disabled={!storeOpen || !activeItem?.in_stock}>
                      + Add to Cart
                    </button>
                    <Link href="/cart" style={btnLight}>
                      Go to Cart {cartCount > 0 ? `(${cartCount})` : ""}
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}

/* =========================
   Premium inline styles
   ========================= */

const pageBg = {
  minHeight: "calc(100vh - 64px)",
  padding: 20,
  background:
    "radial-gradient(1200px 600px at 20% 10%, rgba(16,185,129,0.18), transparent 62%), radial-gradient(900px 520px at 80% 18%, rgba(80,160,255,0.18), transparent 58%), linear-gradient(180deg, #f7f7fb, #ffffff)",
};

const heroWrap = {
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

const heroLeft = { minWidth: 280 };
const heroRight = { minWidth: 320, flex: "0 0 auto" };

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
  fontSize: 32,
  fontWeight: 1000,
  color: "#0b1220",
  letterSpacing: -0.2,
};

const subText = {
  marginTop: 8,
  color: "rgba(17,24,39,0.7)",
  fontWeight: 800,
};

const infoCard = {
  borderRadius: 18,
  padding: 14,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 12px 36px rgba(0,0,0,0.07)",
  backdropFilter: "blur(10px)",
};

const infoRow = { marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" };

const miniPill = {
  fontSize: 12,
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(255,255,255,0.85)",
  fontWeight: 900,
  color: "rgba(17,24,39,0.82)",
};

const alertMini = {
  marginTop: 10,
  padding: 10,
  borderRadius: 14,
  border: "1px solid rgba(239,68,68,0.20)",
  background: "rgba(254,242,242,0.92)",
  color: "#7f1d1d",
  fontWeight: 900,
  fontSize: 12,
};

const panelGlass = {
  marginTop: 14,
  borderRadius: 18,
  padding: 14,
  background: "rgba(255,255,255,0.74)",
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 12px 36px rgba(0,0,0,0.07)",
  backdropFilter: "blur(10px)",
};

const input = {
  width: "100%",
  padding: 10,
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.9)",
  outline: "none",
  fontWeight: 800,
};

const btnDark = {
  border: "1px solid rgba(17,24,39,0.95)",
  background: "rgba(17,24,39,0.95)",
  color: "#fff",
  fontWeight: 950,
  padding: "10px 14px",
  borderRadius: 999,
  cursor: "pointer",
  boxShadow: "0 12px 30px rgba(17,24,39,0.18)",
};

const btnLight = {
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.9)",
  color: "#111",
  fontWeight: 950,
  padding: "10px 14px",
  borderRadius: 999,
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const btnGhost = {
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.75)",
  color: "#111",
  fontWeight: 950,
  padding: "10px 14px",
  borderRadius: 999,
  cursor: "pointer",
};

const chipOn = {
  padding: "10px 14px",
  borderRadius: 999,
  border: "1px solid rgba(17,24,39,0.18)",
  background: "rgba(17,24,39,0.92)",
  color: "#fff",
  fontWeight: 950,
  cursor: "pointer",
  boxShadow: "0 12px 26px rgba(17,24,39,0.12)",
};

const chipOff = {
  padding: "10px 14px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.9)",
  color: "#111827",
  fontWeight: 950,
  cursor: "pointer",
};

const bannerWrap = {
  marginTop: 14,
  borderRadius: 18,
  border: "1px solid rgba(0,0,0,0.08)",
  overflow: "hidden",
  position: "relative",
  height: 200,
  background: "rgba(0,0,0,0.03)",
  boxShadow: "0 12px 36px rgba(0,0,0,0.07)",
};

const bannerImg = { width: "100%", height: "100%", objectFit: "cover" };
const bannerOverlay = {
  position: "absolute",
  inset: 0,
  background: "linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.85))",
};

const grid = {
  marginTop: 14,
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
  cursor: "pointer",
};

const img = { width: "100%", height: "100%", objectFit: "cover" };

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

const tapHint = {
  position: "absolute",
  bottom: 10,
  left: 10,
  padding: "6px 10px",
  borderRadius: 999,
  background: "rgba(17,24,39,0.82)",
  color: "#fff",
  fontWeight: 950,
  fontSize: 12,
  border: "1px solid rgba(255,255,255,0.14)",
};

const btnAdd = {
  border: "1px solid rgba(17,24,39,0.95)",
  background: "rgba(17,24,39,0.95)",
  color: "#fff",
  fontWeight: 950,
  padding: "10px 14px",
  borderRadius: 12,
  cursor: "pointer",
  boxShadow: "0 10px 22px rgba(17,24,39,0.16)",
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

const emptyBox = {
  marginTop: 12,
  padding: 14,
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.75)",
  color: "rgba(17,24,39,0.7)",
  fontWeight: 800,
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

/* modal */
const modalBackdrop = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.35)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  zIndex: 50,
};

const modalCard = {
  width: "min(980px, 100%)",
  borderRadius: 20,
  padding: 16,
  background: "rgba(255,255,255,0.95)",
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 18px 60px rgba(0,0,0,0.18)",
  backdropFilter: "blur(10px)",
};

const btnClose = {
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.85)",
  borderRadius: 12,
  padding: "8px 10px",
  cursor: "pointer",
  fontWeight: 950,
};

const modalImgWrap = {
  borderRadius: 18,
  overflow: "hidden",
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(0,0,0,0.03)",
  height: 260,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const modalImg = { width: "100%", height: "100%", objectFit: "cover" };