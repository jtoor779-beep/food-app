"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import supabase from "@/lib/supabase";

type Restaurant = { id: string; name: string | null };

type MenuItem = {
  id: string;
  restaurant_id: string;
  name: string | null;
  price: number | null;
  cuisine?: string | null;
  image_url?: string | null;

  // ✅ real owner controls
  is_veg: boolean | null;
  is_best_seller: boolean;
  in_stock: boolean;
};

type CartItem = {
  menu_item_id: string;
  restaurant_id: string;
  name: string;
  price_each: number;
  qty: number;
  image_url?: string | null;

  // ✅ new optional field (other pages will ignore if not used)
  note?: string;
};

function money(v: unknown) {
  const n = Number(v || 0);
  return `₹${n.toFixed(0)}`;
}

function normCuisine(v: unknown) {
  return String(v || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

const CATEGORIES = [
  { key: "recommended", label: "Recommended" },
  { key: "punjabi", label: "Punjabi" },
  { key: "indian", label: "Indian" },
  { key: "pizza", label: "Pizza" },
];

type SortKey = "recommended" | "price_low" | "price_high" | "newest";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "recommended", label: "Recommended" },
  { key: "price_low", label: "Price: Low → High" },
  { key: "price_high", label: "Price: High → Low" },
  { key: "newest", label: "Newest" },
];

function getCart(): CartItem[] {
  try {
    const raw = localStorage.getItem("cart_items");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setCart(items: CartItem[]) {
  localStorage.setItem("cart_items", JSON.stringify(items));
}

/** Deterministic demo stats based on restaurant id */
function seededUnit(seed: string, salt: string) {
  const str = `${seed}__${salt}`;
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}
function seededInt(seed: string, salt: string, min: number, max: number) {
  const u = seededUnit(seed, salt);
  return Math.floor(u * (max - min + 1)) + min;
}
function seededRating(seed: string) {
  const u = seededUnit(seed, "rating");
  const val = 4.1 + u * 0.7;
  return (Math.round(val * 10) / 10).toFixed(1);
}

export default function RestaurantPage() {
  const router = useRouter();
  const params = useParams();
  const restaurantId = String(params?.id || "");

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [items, setItems] = useState<MenuItem[]>([]);

  const [q, setQ] = useState("");
  const [activeCat, setActiveCat] = useState("recommended");

  const [toast, setToast] = useState("");
  const [cartCount, setCartCount] = useState(0);
  const [cartTotal, setCartTotal] = useState(0);

  // controls
  const [sortKey, setSortKey] = useState<SortKey>("recommended");
  const [vegFilter, setVegFilter] = useState<"all" | "veg" | "non_veg">("all");

  // ✅ NEW premium quick filters
  const [bestOnly, setBestOnly] = useState(false);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [under199Only, setUnder199Only] = useState(false);

  // ✅ Dish Details Modal (premium)
  const [openDish, setOpenDish] = useState<MenuItem | null>(null);
  const [dishNote, setDishNote] = useState("");

  // stable demo stats (avoid hydration mismatch)
  const [rating, setRating] = useState<string>("4.5");
  const [etaMin, setEtaMin] = useState<number>(25);
  const [etaMax, setEtaMax] = useState<number>(35);
  const [deliveryFee, setDeliveryFee] = useState<number>(20);

  useEffect(() => {
    if (!restaurantId) return;
    setRating(seededRating(restaurantId));
    const mn = seededInt(restaurantId, "etaMin", 20, 28);
    const mx = seededInt(restaurantId, "etaMax", 30, 40);
    setEtaMin(mn);
    setEtaMax(mx);
    setDeliveryFee(seededInt(restaurantId, "fee", 0, 40));
  }, [restaurantId]);

  function refreshCartStats() {
    const c = getCart();
    setCartCount(c.reduce((s, x) => s + Number(x.qty || 0), 0));
    setCartTotal(c.reduce((s, x) => s + Number(x.qty || 0) * Number(x.price_each || 0), 0));
  }

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(""), 1200);
  }

  function readNoteForItem(menuItemId: string) {
    try {
      const raw = localStorage.getItem("cart_notes");
      const obj = raw ? JSON.parse(raw) : {};
      return String(obj?.[menuItemId] || "");
    } catch {
      return "";
    }
  }

  function writeNoteForItem(menuItemId: string, note: string) {
    try {
      const raw = localStorage.getItem("cart_notes");
      const obj = raw ? JSON.parse(raw) : {};
      obj[menuItemId] = note;
      localStorage.setItem("cart_notes", JSON.stringify(obj));
    } catch {}
  }

  function addOne(item: MenuItem, overrideNote?: string) {
    if (!item?.id || !item.restaurant_id) return showToast("Missing item data.");
    if (item.in_stock === false) return showToast("Out of stock.");

    const price_each = Number(item.price || 0);
    if (!Number.isFinite(price_each) || price_each <= 0) return showToast("Invalid price.");

    const cart = getCart();

    // one restaurant per cart
    if (cart.length > 0) {
      const cartRestaurant = cart[0]?.restaurant_id;
      if (cartRestaurant && cartRestaurant !== item.restaurant_id) {
        const ok = confirm("Your cart has items from another restaurant.\n\nClear cart and add this item?");
        if (!ok) return;
        setCart([]);
      }
    }

    const updated = getCart();
    const idx = updated.findIndex((x) => x.menu_item_id === item.id);

    const noteToSave = typeof overrideNote === "string" ? overrideNote : readNoteForItem(item.id);

    if (idx >= 0) {
      updated[idx] = { ...updated[idx], qty: Number(updated[idx].qty || 0) + 1, note: noteToSave || updated[idx].note };
    } else {
      updated.push({
        menu_item_id: item.id,
        restaurant_id: item.restaurant_id,
        name: item.name || "Item",
        price_each,
        qty: 1,
        image_url: item.image_url || null,
        note: noteToSave || "",
      });
    }

    setCart(updated);
    refreshCartStats();
    showToast("Added to cart ✅");
  }

  function removeOne(item: MenuItem) {
    const updated = getCart();
    const idx = updated.findIndex((x) => x.menu_item_id === item.id);
    if (idx < 0) return;

    const nextQty = Number(updated[idx].qty || 0) - 1;
    if (nextQty <= 0) updated.splice(idx, 1);
    else updated[idx] = { ...updated[idx], qty: nextQty };

    setCart(updated);
    refreshCartStats();
  }

  function getQty(menuItemId: string) {
    const c = getCart();
    const row = c.find((x) => x.menu_item_id === menuItemId);
    return row ? Number(row.qty || 0) : 0;
  }

  async function load() {
    setLoading(true);
    setErr("");

    try {
      if (!restaurantId) throw new Error("Missing restaurant id.");

      const { data: rest, error: restErr } = await supabase
        .from("restaurants")
        .select("id, name")
        .eq("id", restaurantId)
        .maybeSingle();

      if (restErr) throw restErr;
      if (!rest?.id) throw new Error("Restaurant not found.");
      setRestaurant(rest as Restaurant);

      const { data: list, error: itemErr } = await supabase
        .from("menu_items")
        .select("id, restaurant_id, name, price, cuisine, image_url, is_veg, is_best_seller, in_stock")
        .eq("restaurant_id", restaurantId)
        .order("id", { ascending: false });

      if (itemErr) throw itemErr;

      setItems((list || []) as MenuItem[]);
      refreshCartStats();
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const onStorage = () => refreshCartStats();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  const bestSellers = useMemo(() => items.filter((x) => x.is_best_seller === true).slice(0, 6), [items]);
  const recommended = useMemo(() => items.slice(0, 6), [items]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    let base = items;

    if (s) base = base.filter((it) => (it.name || "").toLowerCase().includes(s));

    // cuisine tabs
    base = base.filter((it) => {
      const c = normCuisine(it.cuisine);
      if (activeCat === "recommended") return true;
      return c === activeCat;
    });

    // veg/non-veg filter (REAL DB field)
    if (vegFilter !== "all") {
      base = base.filter((it) => {
        if (vegFilter === "veg") return it.is_veg === true;
        if (vegFilter === "non_veg") return it.is_veg === false;
        return true;
      });
    }

    // ✅ NEW premium quick filters
    if (bestOnly) base = base.filter((it) => it.is_best_seller === true);
    if (inStockOnly) base = base.filter((it) => it.in_stock !== false);
    if (under199Only) base = base.filter((it) => Number(it.price || 0) > 0 && Number(it.price || 0) <= 199);

    // sort
    const withPrice = base.map((x) => ({ ...x, _p: Number(x.price || 0) }));
    if (sortKey === "price_low") withPrice.sort((a, b) => a._p - b._p);
    if (sortKey === "price_high") withPrice.sort((a, b) => b._p - a._p);
    // newest/recommended keep as-is

    return withPrice.map(({ _p, ...rest }) => rest);
  }, [items, q, activeCat, vegFilter, sortKey, bestOnly, inStockOnly, under199Only]);

  function openDishModal(it: MenuItem) {
    setOpenDish(it);
    const existing = readNoteForItem(it.id);
    setDishNote(existing);
  }

  function closeDishModal() {
    setOpenDish(null);
    setDishNote("");
  }

  const openDishQty = openDish?.id ? getQty(openDish.id) : 0;

  return (
    <main style={pageWrap}>
      {toast ? <div style={toastBox}>{toast}</div> : null}

      {/* Top actions */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={() => router.push("/")} style={btnOutlineBtn}>
          ← Home
        </button>
        <Link href="/restaurants" style={btnOutline}>
          All Restaurants
        </Link>
        <Link href="/cart" style={btnPrimary}>
          Cart ({cartCount})
        </Link>
      </div>

      {/* Hero */}
      <div style={heroGlass}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ color: "rgba(17,24,39,0.65)", fontWeight: 900, fontSize: 12 }}>Restaurant</div>
          <h1 style={{ margin: "6px 0 0 0", fontWeight: 1000, letterSpacing: -0.2 }}>{restaurant?.name || "..."}</h1>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
            <span style={pill}>⭐ {rating}</span>
            <span style={pill}>⏱ {etaMin}-{etaMax} mins</span>
            <span style={pill}>{deliveryFee === 0 ? "Free delivery" : `Delivery ₹${deliveryFee}`}</span>
            <span style={pill}>📍 Nearby</span>
          </div>

          <div style={{ marginTop: 10, color: "rgba(17,24,39,0.62)", fontWeight: 800 }}>
            Best Sellers • Real Veg/Non-Veg • In Stock toggle • Quantity controls • Dish details popup
          </div>
        </div>

        <div style={{ minWidth: 320 }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search items…" style={search} />

          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} style={select}>
              {SORTS.map((s) => (
                <option key={s.key} value={s.key}>
                  Sort: {s.label}
                </option>
              ))}
            </select>

            <select value={vegFilter} onChange={(e) => setVegFilter(e.target.value as any)} style={select}>
              <option value="all">All</option>
              <option value="veg">Veg</option>
              <option value="non_veg">Non-Veg</option>
            </select>
          </div>

          {/* ✅ Premium quick filter chips */}
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
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
              }}
              style={chip}
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {err ? <div style={alertErr}>{err}</div> : null}
      {loading ? <div style={{ marginTop: 12, color: "rgba(17,24,39,0.65)", fontWeight: 800 }}>Loading…</div> : null}

      {!loading ? (
        <>
          <h2 style={{ marginTop: 18, marginBottom: 10 }}>🔥 Best Sellers</h2>
          {bestSellers.length === 0 ? (
            <div style={emptyBox}>No best sellers yet (owner can enable Best Seller).</div>
          ) : (
            <div style={grid}>
              {bestSellers.map((it) => (
                <DishCard
                  key={it.id}
                  it={it}
                  qty={getQty(it.id)}
                  onAdd={() => addOne(it)}
                  onRemove={() => removeOne(it)}
                  onOpen={() => openDishModal(it)}
                />
              ))}
            </div>
          )}

          <h2 style={{ marginTop: 22, marginBottom: 10 }}>✅ Recommended</h2>
          {recommended.length === 0 ? (
            <div style={emptyBox}>No items yet.</div>
          ) : (
            <div style={grid}>
              {recommended.map((it) => (
                <DishCard
                  key={it.id}
                  it={it}
                  qty={getQty(it.id)}
                  onAdd={() => addOne(it)}
                  onRemove={() => removeOne(it)}
                  onOpen={() => openDishModal(it)}
                />
              ))}
            </div>
          )}

          <h2 style={{ marginTop: 22, marginBottom: 10 }}>Menu</h2>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            {CATEGORIES.map((c) => (
              <button key={c.key} onClick={() => setActiveCat(c.key)} style={activeCat === c.key ? chipActive : chip}>
                {c.label}
              </button>
            ))}
            <button onClick={load} style={chip}>
              Refresh
            </button>
          </div>

          {filtered.length === 0 ? (
            <div style={emptyBox}>No items found.</div>
          ) : (
            <div style={grid}>
              {filtered.map((it) => (
                <DishCard
                  key={it.id}
                  it={it}
                  qty={getQty(it.id)}
                  onAdd={() => addOne(it)}
                  onRemove={() => removeOne(it)}
                  onOpen={() => openDishModal(it)}
                />
              ))}
            </div>
          )}
        </>
      ) : null}

      {/* Sticky cart bar */}
      {cartCount > 0 ? (
        <div style={stickyBar}>
          <div style={{ fontWeight: 950 }}>
            {cartCount} item{cartCount === 1 ? "" : "s"} • Total {money(cartTotal)}
          </div>
          <Link href="/cart" style={btnPrimary}>
            View Cart →
          </Link>
        </div>
      ) : null}

      {/* ✅ Dish Details Modal */}
      {openDish ? (
        <div
          style={modalOverlay}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDishModal();
          }}
        >
          <div style={modalCard}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
              <div style={{ fontWeight: 1000, fontSize: 18 }}>{openDish.name || "Dish"}</div>
              <button onClick={closeDishModal} style={modalClose}>
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

                {/* Demo description (premium feel) */}
                <div style={{ marginTop: 10, color: "rgba(17,24,39,0.72)", fontWeight: 700, lineHeight: 1.35 }}>
                  Freshly prepared, high quality ingredients, and packed with flavor. (demo description)
                </div>

                {/* Special instructions */}
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontWeight: 950, marginBottom: 6 }}>Special instructions (optional)</div>
                  <textarea
                    value={dishNote}
                    onChange={(e) => setDishNote(e.target.value)}
                    placeholder="e.g. Less spicy, no onions, extra sauce…"
                    style={noteBox}
                  />
                  <button
                    onClick={() => {
                      writeNoteForItem(openDish.id, dishNote);
                      showToast("Note saved ✅");
                    }}
                    style={{ ...btnOutlineBtn, marginTop: 8 }}
                  >
                    Save Note
                  </button>
                </div>

                {/* Qty control inside modal */}
                <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                  {openDishQty > 0 ? (
                    <div style={qtyBox}>
                      <button onClick={() => removeOne(openDish)} style={qtyBtn}>
                        −
                      </button>
                      <div style={{ fontWeight: 1000 }}>{openDishQty}</div>
                      <button
                        onClick={() => addOne(openDish, dishNote)}
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
                      onClick={() => addOne(openDish, dishNote)}
                      disabled={openDish.in_stock === false}
                      style={{
                        ...btnSmallPrimaryBtn,
                        opacity: openDish.in_stock === false ? 0.5 : 1,
                        cursor: openDish.in_stock === false ? "not-allowed" : "pointer",
                        width: "auto",
                        padding: "12px 14px",
                      }}
                    >
                      {openDish.in_stock === false ? "Out of stock" : "+ Add to cart"}
                    </button>
                  )}

                  <div style={{ fontWeight: 950 }}>
                    Subtotal:{" "}
                    {money(Number(openDish.price || 0) * Math.max(1, openDishQty || 0))}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
              <button onClick={closeDishModal} style={btnOutlineBtn}>
                Continue browsing
              </button>
              <Link href="/cart" style={btnPrimary}>
                Go to Cart →
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function DishCard({
  it,
  qty,
  onAdd,
  onRemove,
  onOpen,
}: {
  it: MenuItem;
  qty: number;
  onAdd: () => void;
  onRemove: () => void;
  onOpen: () => void;
}) {
  const cuisine = normCuisine(it.cuisine);

  const isVeg = it.is_veg === true;
  const isNonVeg = it.is_veg === false;
  const out = it.in_stock === false;

  return (
    <div style={card}>
      <div style={imgWrapClickable} onClick={onOpen} title="Open details">
        {it.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={it.image_url} alt={it.name || "item"} style={img} />
        ) : (
          <div style={imgPlaceholder}>No image</div>
        )}
        <div style={detailsHint}>Tap for details</div>
      </div>

      <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", gap: 10 }}>
        <button onClick={onOpen} style={dishTitleBtn} title="Open details">
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
        {cuisine ? <span style={tag}>{cuisine}</span> : null}
        {it.is_best_seller ? <span style={tagStrong}>BEST</span> : null}
      </div>

      <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        {qty > 0 ? (
          <div style={qtyBox}>
            <button onClick={onRemove} style={qtyBtn}>
              −
            </button>
            <div style={{ fontWeight: 950 }}>{qty}</div>
            <button
              onClick={onAdd}
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
            onClick={onAdd}
            disabled={out}
            style={{
              ...btnSmallPrimaryBtn,
              opacity: out ? 0.5 : 1,
              cursor: out ? "not-allowed" : "pointer",
            }}
          >
            {out ? "Out of stock" : "+ Add to cart"}
          </button>
        )}

        <button onClick={onOpen} style={btnMiniOutline}>
          Details
        </button>
      </div>
    </div>
  );
}

/* ===== Premium styles (inline only) ===== */

const pageWrap: React.CSSProperties = {
  maxWidth: 1100,
  margin: "0 auto",
  padding: 16,
  paddingBottom: 96,
  minHeight: "calc(100vh - 64px)",
  background:
    "radial-gradient(1200px 600px at 20% 10%, rgba(255,140,0,0.18), transparent 62%), radial-gradient(900px 520px at 80% 18%, rgba(80,160,255,0.16), transparent 58%), linear-gradient(180deg, #f7f7fb, #ffffff)",
};

const heroGlass: React.CSSProperties = {
  marginTop: 12,
  borderRadius: 18,
  padding: 16,
  background: "rgba(255,255,255,0.78)",
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 14px 44px rgba(0,0,0,0.09)",
  backdropFilter: "blur(10px)",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const pill: React.CSSProperties = {
  fontSize: 12,
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.75)",
  fontWeight: 950,
  color: "#111827",
};

const search: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.12)",
  outline: "none",
  background: "rgba(255,255,255,0.9)",
  fontSize: 14,
  fontWeight: 800,
};

const select: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.9)",
  fontWeight: 900,
  cursor: "pointer",
};

const chip: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.8)",
  cursor: "pointer",
  fontWeight: 900,
};

const chipActive: React.CSSProperties = {
  ...chip,
  border: "1px solid rgba(17,24,39,0.95)",
  background: "rgba(17,24,39,0.95)",
  color: "#fff",
};

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 12,
};

const card: React.CSSProperties = {
  background: "rgba(255,255,255,0.78)",
  border: "1px solid rgba(0,0,0,0.08)",
  borderRadius: 16,
  padding: 14,
  boxShadow: "0 12px 32px rgba(0,0,0,0.08)",
  backdropFilter: "blur(10px)",
};

const imgWrapClickable: React.CSSProperties = {
  width: "100%",
  height: 150,
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.10)",
  overflow: "hidden",
  background: "rgba(0,0,0,0.03)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  position: "relative",
};

const detailsHint: React.CSSProperties = {
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

const img: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
};

const imgPlaceholder: React.CSSProperties = {
  color: "rgba(17,24,39,0.45)",
  fontSize: 12,
  fontWeight: 900,
};

const tag: React.CSSProperties = {
  fontSize: 12,
  padding: "4px 10px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(255,255,255,0.75)",
  color: "rgba(17,24,39,0.8)",
  fontWeight: 900,
};

const tagStrong: React.CSSProperties = {
  ...tag,
  border: "1px solid rgba(17,24,39,0.12)",
  background: "rgba(17,24,39,0.95)",
  color: "#fff",
};

const badgeVeg: React.CSSProperties = {
  fontSize: 11,
  padding: "3px 8px",
  borderRadius: 999,
  border: "1px solid rgba(16,185,129,0.30)",
  background: "rgba(236,253,245,0.90)",
  fontWeight: 950,
};

const badgeNonVeg: React.CSSProperties = {
  fontSize: 11,
  padding: "3px 8px",
  borderRadius: 999,
  border: "1px solid rgba(239,68,68,0.25)",
  background: "rgba(254,242,242,0.90)",
  fontWeight: 950,
};

const badgeOut: React.CSSProperties = {
  fontSize: 11,
  padding: "3px 8px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(243,244,246,0.90)",
  fontWeight: 950,
};

const qtyBox: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  borderRadius: 12,
  padding: "8px 10px",
  background: "rgba(255,255,255,0.9)",
};

const qtyBtn: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.95)",
  fontWeight: 950,
  cursor: "pointer",
};

const btnPrimary: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(17,24,39,0.95)",
  background: "rgba(17,24,39,0.95)",
  color: "#fff",
  textDecoration: "none",
  fontWeight: 950,
};

const btnOutline: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.85)",
  color: "#111827",
  textDecoration: "none",
  fontWeight: 950,
};

const btnOutlineBtn: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.85)",
  color: "#111827",
  fontWeight: 950,
  cursor: "pointer",
};

const btnSmallPrimaryBtn: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(17,24,39,0.95)",
  background: "rgba(17,24,39,0.95)",
  color: "#fff",
  fontWeight: 950,
};

const btnMiniOutline: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.85)",
  color: "#111827",
  fontWeight: 950,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const dishTitleBtn: React.CSSProperties = {
  padding: 0,
  border: "none",
  background: "transparent",
  textAlign: "left",
  cursor: "pointer",
  flex: 1,
};

const emptyBox: React.CSSProperties = {
  padding: 14,
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.78)",
  color: "rgba(17,24,39,0.65)",
  fontWeight: 800,
};

const alertErr: React.CSSProperties = {
  marginTop: 12,
  padding: 12,
  border: "1px solid rgba(239,68,68,0.25)",
  background: "rgba(254,242,242,0.90)",
  borderRadius: 12,
  color: "#7f1d1d",
  fontWeight: 900,
};

const toastBox: React.CSSProperties = {
  position: "fixed",
  top: 16,
  left: "50%",
  transform: "translateX(-50%)",
  padding: "10px 14px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.95)",
  fontWeight: 950,
  zIndex: 9999,
  boxShadow: "0 8px 20px rgba(0,0,0,0.10)",
};

const stickyBar: React.CSSProperties = {
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

const modalOverlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.45)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  padding: 16,
  zIndex: 10000,
};

const modalCard: React.CSSProperties = {
  width: "min(980px, 96vw)",
  borderRadius: 18,
  background: "rgba(255,255,255,0.92)",
  border: "1px solid rgba(0,0,0,0.12)",
  boxShadow: "0 18px 70px rgba(0,0,0,0.25)",
  padding: 16,
  backdropFilter: "blur(10px)",
};

const modalClose: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.9)",
  cursor: "pointer",
  fontWeight: 950,
};

const modalImgWrap: React.CSSProperties = {
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

const noteBox: React.CSSProperties = {
  width: "100%",
  minHeight: 80,
  padding: 12,
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.9)",
  outline: "none",
  resize: "vertical",
  fontWeight: 800,
};
