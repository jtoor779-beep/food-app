"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import supabase from "@/lib/supabase";

function money(v) {
  const n = Number(v || 0);
  return `₹${n.toFixed(0)}`;
}

function normCuisine(v) {
  return String(v || "")
    .trim()
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/\s+/g, "_");
}

/**
 * Cart helpers (localStorage)
 * ✅ COMPAT MODE: supports BOTH keys so nothing breaks
 * - Old key: foodapp_cart
 * - New key used elsewhere: cart_items
 */
function getCart() {
  try {
    const rawA = localStorage.getItem("cart_items");
    if (rawA) {
      const a = JSON.parse(rawA);
      if (Array.isArray(a)) return a;
    }
  } catch {}
  try {
    const rawB = localStorage.getItem("foodapp_cart");
    return rawB ? JSON.parse(rawB) : [];
  } catch {
    return [];
  }
}

function setCart(items) {
  try {
    const v = JSON.stringify(items || []);
    // write to both keys so all pages stay in sync
    localStorage.setItem("cart_items", v);
    localStorage.setItem("foodapp_cart", v);
    window.dispatchEvent(new Event("storage"));
  } catch {
    // ignore
  }
}

/* demo helpers (stable per id) */
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
  return 18 + n; // 18..43
}

export default function MenuPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [restaurants, setRestaurants] = useState([]);
  const [restaurantId, setRestaurantId] = useState("");

  const [items, setItems] = useState([]);

  const [q, setQ] = useState("");
  const [vegMode, setVegMode] = useState("all"); // all | veg | non_veg

  const [toast, setToast] = useState("");
  const [cartCount, setCartCount] = useState(0);

  // detect if user is logged in (but do not block browsing)
  const [isAuthed, setIsAuthed] = useState(false);

  // premium: sort + filters
  const [sortKey, setSortKey] = useState("recommended"); // recommended | price_low | price_high | newest
  const [bestOnly, setBestOnly] = useState(false);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [under199Only, setUnder199Only] = useState(false);

  // Dish Details Modal
  const [openDish, setOpenDish] = useState(null);

  function showToast(msg) {
    setToast(msg);
    window.setTimeout(() => setToast(""), 1600);
  }

  function refreshCartCount() {
    const c = getCart();
    setCartCount(c.reduce((s, x) => s + Number(x.qty || 0), 0));
  }

  function getQty(menuItemId) {
    const c = getCart();
    const row = c.find((x) => x.menu_item_id === menuItemId);
    return row ? Number(row.qty || 0) : 0;
  }

  async function loadRestaurants() {
    /**
     * ✅ IMPORTANT:
     * Use PUBLIC VIEW so customers only see ENABLED restaurants
     * View name: restaurants_public
     */
    const { data, error } = await supabase
      .from("restaurants_public")
      .select("id, name")
      .order("name", { ascending: true });

    if (error) throw error;

    const list = data || [];
    setRestaurants(list);

    // auto-select first restaurant
    if (!restaurantId && list.length > 0) setRestaurantId(list[0].id);

    // if current selected restaurant disappeared, auto-switch
    if (restaurantId && list.length > 0 && !list.find((r) => r.id === restaurantId)) {
      setRestaurantId(list[0].id);
    }

    if (list.length === 0) {
      setRestaurantId("");
      setItems([]);
    }
  }

  async function loadMenu(rid) {
    if (!rid) {
      setItems([]);
      return;
    }

    /**
     * ✅ IMPORTANT:
     * Use PUBLIC VIEW so customers only see items from ENABLED restaurants
     * View name: menu_items_public
     *
     * ✅ Your DB/view DOES NOT have cuisine right now, so we DO NOT request it.
     */
    const { data, error } = await supabase
      .from("menu_items_public")
      .select("id, restaurant_id, name, price, image_url, is_veg, is_best_seller, in_stock")
      .eq("restaurant_id", rid)
      .order("id", { ascending: false });

    if (error) throw error;

    // Keep UI compatible even if cuisine doesn’t exist
    const safe = (data || []).map((x) => ({
      ...x,
      cuisine: x.cuisine ?? null,
    }));

    setItems(safe);
  }

  async function loadAll() {
    setLoading(true);
    setErr("");
    try {
      await loadRestaurants();
      refreshCartCount();
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  // session check (guest vs logged-in)
  async function loadAuth() {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      const has = !!data?.session?.user;
      setIsAuthed(has);
    } catch {
      setIsAuthed(false);
    }
  }

  useEffect(() => {
    loadAll();
    loadAuth();

    const onStorage = () => refreshCartCount();
    window.addEventListener("storage", onStorage);

    // watch login/logout changes
    const { data } = supabase.auth.onAuthStateChange(() => {
      loadAuth();
    });

    // close modal on ESC
    const onKey = (e) => {
      if (e.key === "Escape") setOpenDish(null);
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("storage", onStorage);
      data?.subscription?.unsubscribe?.();
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!restaurantId) return;
    setLoading(true);
    setErr("");
    loadMenu(restaurantId)
      .catch((e) => setErr(e?.message || String(e)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  function addToCart(it) {
    if (it.in_stock === false) return showToast("Out of stock");
    const price_each = Number(it.price || 0);
    if (!price_each || price_each <= 0) return showToast("Invalid price");

    const cart = getCart();

    // enforce one-restaurant cart
    if (cart.length > 0) {
      const cartRestaurant = cart[0]?.restaurant_id;
      if (cartRestaurant && cartRestaurant !== it.restaurant_id) {
        const ok = confirm("Your cart has items from another restaurant.\n\nClear cart and add this item?");
        if (!ok) return;
        setCart([]);
      }
    }

    const updated = getCart();
    const idx = updated.findIndex((x) => x.menu_item_id === it.id);

    if (idx >= 0) updated[idx] = { ...updated[idx], qty: Number(updated[idx].qty || 0) + 1 };
    else
      updated.push({
        menu_item_id: it.id,
        restaurant_id: it.restaurant_id,
        name: it.name || "Item",
        price_each,
        qty: 1,
        image_url: it.image_url || null,
      });

    setCart(updated);
    refreshCartCount();

    if (!isAuthed) showToast("Added ✅ (Login required to place order)");
    else showToast("Added to cart ✅");
  }

  function removeFromCart(it) {
    const updated = getCart();
    const idx = updated.findIndex((x) => x.menu_item_id === it.id);
    if (idx < 0) return;

    const nextQty = Number(updated[idx].qty || 0) - 1;
    if (nextQty <= 0) updated.splice(idx, 1);
    else updated[idx] = { ...updated[idx], qty: nextQty };

    setCart(updated);
    refreshCartCount();
  }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    let base = items;

    if (s) base = base.filter((x) => (x.name || "").toLowerCase().includes(s));

    if (vegMode !== "all") {
      base = base.filter((x) => {
        if (vegMode === "veg") return x.is_veg === true;
        return x.is_veg === false;
      });
    }

    if (bestOnly) base = base.filter((x) => x.is_best_seller === true);
    if (inStockOnly) base = base.filter((x) => x.in_stock !== false);
    if (under199Only) base = base.filter((x) => Number(x.price || 0) > 0 && Number(x.price || 0) <= 199);

    const list = [...base];
    if (sortKey === "price_low") list.sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
    if (sortKey === "price_high") list.sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
    // newest keeps id desc
    // recommended keeps current order
    return list;
  }, [items, q, vegMode, bestOnly, inStockOnly, under199Only, sortKey]);

  const restaurantName = useMemo(() => {
    const r = restaurants.find((x) => x.id === restaurantId);
    return r?.name || "Restaurant";
  }, [restaurants, restaurantId]);

  function openDishModal(it) {
    setOpenDish(it);
  }

  const openQty = openDish ? getQty(openDish.id) : 0;

  return (
    <main style={pageBg}>
      {toast ? <div style={toastBox}>{toast}</div> : null}

      {!isAuthed ? (
        <div style={guestBar}>
          <div style={{ fontWeight: 950 }}>Browsing as Guest</div>
          <div style={{ color: "rgba(17,24,39,0.72)", fontWeight: 800 }}>
            You can explore restaurants & menu. Login is required only when you place an order.
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/login" style={btnSmallOutline}>
              Login
            </Link>
            <Link href="/signup" style={btnSmallPrimary}>
              Sign Up
            </Link>
          </div>
        </div>
      ) : null}

      <div style={heroGlass}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={pill}>Menu</div>
          <h1 style={heroTitle}>{restaurantName}</h1>
          <div style={{ color: "rgba(17,24,39,0.70)", marginTop: 6, fontWeight: 800 }}>
            Pick items and add to cart. Tap any dish to view details.
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
            <span style={badgeDark}>⭐ {demoRating(restaurantId || "0")}</span>
            <span style={badgeLight}>{demoEta(restaurantId || "0")} mins</span>
            <span style={badgeLight}>Best offers</span>
          </div>
        </div>

        <div style={{ minWidth: 360, width: "100%" }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Link href="/" style={btnOutline}>
              Home
            </Link>
            <Link href="/restaurants" style={btnOutline}>
              Restaurants
            </Link>
            <Link href="/cart" style={btnPrimary}>
              Cart ({cartCount})
            </Link>
          </div>
        </div>
      </div>

      {err ? <div style={alertErr}>{err}</div> : null}

      <div style={panelGlass}>
        <div style={controlsGrid}>
          <div>
            <div style={label}>Restaurant</div>
            <select value={restaurantId} onChange={(e) => setRestaurantId(e.target.value)} style={input}>
              {restaurants.length === 0 ? (
                <option value="">No enabled restaurants</option>
              ) : (
                restaurants.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name || "Restaurant"}
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <div style={label}>Search</div>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search menu…" style={input} />
          </div>

          <button
            onClick={() => {
              loadAll();
              restaurantId && loadMenu(restaurantId);
            }}
            style={btnOutlineBtn}
          >
            Refresh
          </button>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
          <button onClick={() => setVegMode("all")} style={vegMode === "all" ? chipActive : chip}>
            All
          </button>
          <button onClick={() => setVegMode("veg")} style={vegMode === "veg" ? chipActive : chip}>
            Veg
          </button>
          <button onClick={() => setVegMode("non_veg")} style={vegMode === "non_veg" ? chipActive : chip}>
            Non-Veg
          </button>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12, alignItems: "center" }}>
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value)} style={selectMini}>
            <option value="recommended">Sort: Recommended</option>
            <option value="newest">Sort: Newest</option>
            <option value="price_low">Sort: Price Low → High</option>
            <option value="price_high">Sort: Price High → Low</option>
          </select>

          <button onClick={() => setBestOnly((v) => !v)} style={bestOnly ? chipActive : chip}>
            Bestseller
          </button>
          <button onClick={() => setInStockOnly((v) => !v)} style={inStockOnly ? chipActive : chip}>
            In stock
          </button>
          <button onClick={() => setUnder199Only((v) => !v)} style={under199Only ? chipActive : chip}>
            Under ₹199
          </button>

          <button
            onClick={() => {
              setBestOnly(false);
              setInStockOnly(false);
              setUnder199Only(false);
              setSortKey("recommended");
            }}
            style={chipGhost}
          >
            Clear
          </button>

          <div style={{ marginLeft: "auto", color: "rgba(17,24,39,0.60)", fontWeight: 900, fontSize: 12 }}>
            Showing <b>{filtered.length}</b> item(s)
          </div>
        </div>
      </div>

      {loading ? <div style={{ marginTop: 12, color: "rgba(17,24,39,0.65)", fontWeight: 800 }}>Loading…</div> : null}

      {!loading ? (
        filtered.length === 0 ? (
          <div style={emptyBox}>
            No items found.
            <div style={{ marginTop: 8, color: "rgba(17,24,39,0.65)", fontWeight: 800, fontSize: 13 }}>
              Items appear here only if the restaurant is enabled (is_active = true).
            </div>
          </div>
        ) : (
          <div style={grid}>
            {filtered.map((it) => {
              const isVeg = it.is_veg === true;
              const isNonVeg = it.is_veg === false;
              const out = it.in_stock === false;
              const qty = getQty(it.id);

              return (
                <div key={it.id} style={cardGlass}>
                  <div style={imgWrapClickable} onClick={() => openDishModal(it)} title="Click to view details">
                    {it.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.image_url} alt={it.name || "item"} style={img} />
                    ) : (
                      <div style={imgPlaceholder}>No image</div>
                    )}
                    <div style={detailsHint}>Tap for details</div>
                  </div>

                  <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <button onClick={() => openDishModal(it)} style={dishTitleBtn} title="Open details">
                      <div style={{ fontWeight: 950, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        {it.name || "Item"}
                        {isVeg ? <span style={badgeVeg}>VEG</span> : null}
                        {isNonVeg ? <span style={badgeNonVeg}>NON-VEG</span> : null}
                        {out ? <span style={badgeOut}>OUT</span> : null}
                      </div>
                    </button>
                    <div style={{ fontWeight: 950 }}>{money(it.price)}</div>
                  </div>

                  <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {it.cuisine ? <span style={tag}>{normCuisine(it.cuisine)}</span> : null}
                    {it.is_best_seller ? <span style={tagStrong}>BEST</span> : null}
                    {it.in_stock === false ? <span style={tag}>out</span> : <span style={tag}>in_stock</span>}
                  </div>

                  <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    {qty > 0 ? (
                      <div style={qtyBox}>
                        <button onClick={() => removeFromCart(it)} style={qtyBtn}>
                          −
                        </button>
                        <div style={{ fontWeight: 1000 }}>{qty}</div>
                        <button
                          onClick={() => addToCart(it)}
                          disabled={out}
                          style={{
                            ...qtyBtn,
                            opacity: out ? 0.5 : 1,
                            cursor: out ? "not-allowed" : "pointer",
                          }}
                        >
                          +
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => addToCart(it)}
                        disabled={out}
                        style={{
                          ...btnSmallPrimaryBtn,
                          opacity: out ? 0.5 : 1,
                          cursor: out ? "not-allowed" : "pointer",
                        }}
                      >
                        {out ? "Out of stock" : "+ Add to Cart"}
                      </button>
                    )}

                    <button onClick={() => openDishModal(it)} style={btnMiniOutline}>
                      Details
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : null}

      {cartCount > 0 ? (
        <div style={stickyBar}>
          <div style={{ fontWeight: 1000 }}>
            {cartCount} item{cartCount === 1 ? "" : "s"} in cart
          </div>
          <Link href="/cart" style={btnPrimary}>
            View Cart →
          </Link>
        </div>
      ) : null}

      {openDish ? (
        <div
          style={modalOverlay}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpenDish(null);
          }}
        >
          <div style={modalCard}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
              <div style={{ fontWeight: 1000, fontSize: 18 }}>{openDish.name || "Dish"}</div>
              <button onClick={() => setOpenDish(null)} style={modalClose}>
                ✕
              </button>
            </div>

            <div style={{ marginTop: 12, display: "flex", gap: 12, flexWrap: "wrap" }}>
              <div style={modalImgWrap}>
                {openDish.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={openDish.image_url} alt={openDish.name || "dish"} style={img} />
                ) : (
                  <div style={imgPlaceholder}>No image</div>
                )}
              </div>

              <div style={{ flex: 1, minWidth: 260 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  {openDish.is_veg === true ? <span style={badgeVeg}>VEG</span> : null}
                  {openDish.is_veg === false ? <span style={badgeNonVeg}>NON-VEG</span> : null}
                  {openDish.is_best_seller ? <span style={tagStrong}>BEST</span> : null}
                  {openDish.in_stock === false ? <span style={badgeOut}>OUT</span> : <span style={tag}>In stock</span>}
                </div>

                <div style={{ marginTop: 10, fontWeight: 1000, fontSize: 18 }}>{money(openDish.price)}</div>
                <div style={{ marginTop: 6, color: "rgba(17,24,39,0.65)", fontWeight: 800 }}>
                  Cuisine: {openDish.cuisine ? String(openDish.cuisine) : "—"}
                </div>

                <div style={{ marginTop: 10, color: "rgba(17,24,39,0.72)", fontWeight: 750, lineHeight: 1.4 }}>
                  Freshly prepared, fast delivery, and premium taste. (demo description)
                </div>

                <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  {openQty > 0 ? (
                    <div style={qtyBox}>
                      <button onClick={() => removeFromCart(openDish)} style={qtyBtn}>
                        −
                      </button>
                      <div style={{ fontWeight: 1000 }}>{openQty}</div>
                      <button
                        onClick={() => addToCart(openDish)}
                        disabled={openDish.in_stock === false}
                        style={{
                          ...qtyBtn,
                          opacity: openDish.in_stock === false ? 0.5 : 1,
                          cursor: openDish.in_stock === false ? "not-allowed" : "pointer",
                        }}
                      >
                        +
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => addToCart(openDish)}
                      disabled={openDish.in_stock === false}
                      style={{
                        ...btnSmallPrimaryBtn,
                        width: "auto",
                        padding: "12px 14px",
                        opacity: openDish.in_stock === false ? 0.5 : 1,
                        cursor: openDish.in_stock === false ? "not-allowed" : "pointer",
                      }}
                    >
                      {openDish.in_stock === false ? "Out of stock" : "+ Add to Cart"}
                    </button>
                  )}

                  <Link href="/cart" style={btnOutline}>
                    Go to Cart
                  </Link>
                </div>

                <div style={{ marginTop: 12, color: "rgba(17,24,39,0.55)", fontWeight: 800, fontSize: 12 }}>
                  Tip: press <b>Esc</b> to close.
                </div>
              </div>
            </div>

            <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
              <button onClick={() => setOpenDish(null)} style={btnOutlineBtn}>
                Continue browsing
              </button>
              <Link href="/cart" style={btnPrimary}>
                View Cart →
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

/* ================== PREMIUM INLINE STYLES ================== */

const pageBg = {
  maxWidth: 1100,
  margin: "0 auto",
  padding: 16,
  paddingBottom: 100,
  minHeight: "calc(100vh - 64px)",
  background:
    "radial-gradient(1200px 600px at 20% 10%, rgba(255,140,0,0.18), transparent 62%), radial-gradient(900px 520px at 80% 18%, rgba(80,160,255,0.16), transparent 58%), linear-gradient(180deg, #f7f7fb, #ffffff)",
};

const heroGlass = {
  background: "rgba(255,255,255,0.78)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 18,
  padding: 16,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-end",
  gap: 12,
  flexWrap: "wrap",
  boxShadow: "0 14px 44px rgba(0,0,0,0.09)",
  backdropFilter: "blur(10px)",
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

const guestBar = {
  marginBottom: 12,
  background: "rgba(255,255,255,0.78)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 18,
  padding: 14,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
  boxShadow: "0 12px 36px rgba(0,0,0,0.07)",
  backdropFilter: "blur(10px)",
};

const panelGlass = {
  marginTop: 12,
  background: "rgba(255,255,255,0.78)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 18,
  padding: 16,
  boxShadow: "0 12px 36px rgba(0,0,0,0.07)",
  backdropFilter: "blur(10px)",
};

const controlsGrid = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr auto",
  gap: 10,
  alignItems: "end",
};

const label = {
  fontWeight: 950,
  fontSize: 12,
  marginBottom: 6,
  color: "rgba(17,24,39,0.75)",
};

const input = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.12)",
  outline: "none",
  fontSize: 14,
  fontWeight: 800,
  background: "rgba(255,255,255,0.9)",
};

const selectMini = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.9)",
  fontWeight: 900,
  fontSize: 13,
  outline: "none",
};

const grid = {
  marginTop: 14,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 12,
};

const cardGlass = {
  background: "rgba(255,255,255,0.78)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 16,
  padding: 14,
  boxShadow: "0 12px 32px rgba(0,0,0,0.08)",
  backdropFilter: "blur(10px)",
};

const imgWrapClickable = {
  width: "100%",
  height: 150,
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.10)",
  overflow: "hidden",
  background: "rgba(0,0,0,0.03)",
  cursor: "pointer",
  position: "relative",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const detailsHint = {
  position: "absolute",
  bottom: 10,
  left: 10,
  padding: "6px 10px",
  borderRadius: 999,
  background: "rgba(17,24,39,0.88)",
  color: "#fff",
  fontWeight: 900,
  fontSize: 12,
};

const img = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
};

const imgPlaceholder = {
  width: "100%",
  height: "100%",
  display: "grid",
  placeItems: "center",
  color: "rgba(17,24,39,0.55)",
  fontWeight: 900,
};

const tag = {
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(255,255,255,0.75)",
  fontWeight: 900,
  fontSize: 12,
  color: "rgba(17,24,39,0.75)",
};

const tagStrong = {
  ...tag,
  border: "1px solid rgba(17,24,39,0.12)",
  background: "rgba(17,24,39,0.95)",
  color: "#fff",
};

const badgeVeg = {
  padding: "4px 8px",
  borderRadius: 999,
  border: "1px solid rgba(16,185,129,0.30)",
  background: "rgba(236,253,245,0.90)",
  color: "#065f46",
  fontWeight: 950,
  fontSize: 11,
};

const badgeNonVeg = {
  padding: "4px 8px",
  borderRadius: 999,
  border: "1px solid rgba(239,68,68,0.25)",
  background: "rgba(254,242,242,0.90)",
  color: "#7f1d1d",
  fontWeight: 950,
  fontSize: 11,
};

const badgeOut = {
  padding: "4px 8px",
  borderRadius: 999,
  border: "1px solid rgba(245,158,11,0.30)",
  background: "rgba(254,243,199,0.90)",
  color: "#92400e",
  fontWeight: 950,
  fontSize: 11,
};

const emptyBox = {
  marginTop: 14,
  background: "rgba(255,255,255,0.78)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 16,
  padding: 16,
  color: "rgba(17,24,39,0.65)",
  fontWeight: 900,
};

const toastBox = {
  position: "fixed",
  right: 16,
  bottom: 16,
  zIndex: 9999,
  background: "rgba(17,24,39,0.92)",
  color: "#fff",
  borderRadius: 14,
  padding: "10px 12px",
  fontWeight: 900,
  boxShadow: "0 14px 40px rgba(0,0,0,0.25)",
  border: "1px solid rgba(255,255,255,0.12)",
};

const alertErr = {
  marginTop: 12,
  borderRadius: 14,
  padding: 12,
  background: "rgba(254,242,242,0.90)",
  border: "1px solid rgba(239,68,68,0.25)",
  color: "#7f1d1d",
  fontWeight: 900,
};

const btnOutline = {
  padding: "10px 12px",
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.85)",
  textDecoration: "none",
  fontWeight: 900,
  color: "#111827",
};

const btnPrimary = {
  padding: "10px 12px",
  borderRadius: 14,
  border: "1px solid rgba(17,24,39,0.95)",
  background: "rgba(17,24,39,0.95)",
  textDecoration: "none",
  fontWeight: 900,
  color: "#fff",
};

const btnOutlineBtn = {
  padding: "10px 12px",
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.85)",
  fontWeight: 900,
  cursor: "pointer",
};

const chip = {
  padding: "8px 12px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.75)",
  fontWeight: 900,
  cursor: "pointer",
  color: "rgba(17,24,39,0.85)",
};

const chipActive = {
  ...chip,
  border: "1px solid rgba(17,24,39,0.95)",
  background: "rgba(17,24,39,0.95)",
  color: "#fff",
};

const chipGhost = {
  ...chip,
  background: "rgba(255,255,255,0.55)",
  color: "rgba(17,24,39,0.75)",
};

const btnSmallPrimaryBtn = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 14,
  border: "1px solid rgba(17,24,39,0.95)",
  background: "rgba(17,24,39,0.95)",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

const btnSmallOutline = {
  padding: "8px 12px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.85)",
  textDecoration: "none",
  fontWeight: 900,
  color: "#111827",
};

const btnSmallPrimary = {
  padding: "8px 12px",
  borderRadius: 12,
  border: "1px solid rgba(17,24,39,0.95)",
  background: "rgba(17,24,39,0.95)",
  textDecoration: "none",
  fontWeight: 900,
  color: "#fff",
};

const dishTitleBtn = {
  padding: 0,
  border: "none",
  background: "transparent",
  textAlign: "left",
  cursor: "pointer",
  flex: 1,
};

const qtyBox = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  borderRadius: 12,
  padding: "8px 10px",
  background: "rgba(255,255,255,0.9)",
};

const qtyBtn = {
  width: 34,
  height: 34,
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.95)",
  fontWeight: 950,
  cursor: "pointer",
};

const btnMiniOutline = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.85)",
  color: "#111827",
  fontWeight: 950,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const stickyBar = {
  position: "fixed",
  left: 0,
  right: 0,
  bottom: 0,
  padding: 14,
  borderTop: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(255,255,255,0.95)",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  zIndex: 9999,
};

const modalOverlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.45)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  padding: 16,
  zIndex: 10000,
};

const modalCard = {
  width: "min(980px, 96vw)",
  borderRadius: 18,
  background: "rgba(255,255,255,0.92)",
  border: "1px solid rgba(0,0,0,0.12)",
  boxShadow: "0 18px 70px rgba(0,0,0,0.25)",
  padding: 16,
  backdropFilter: "blur(10px)",
};

const modalClose = {
  width: 40,
  height: 40,
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.9)",
  cursor: "pointer",
  fontWeight: 950,
};

const modalImgWrap = {
  width: 320,
  maxWidth: "100%",
  height: 220,
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.12)",
  overflow: "hidden",
  background: "rgba(0,0,0,0.03)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
