"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import supabase from "@/lib/supabase";

type Restaurant = {
  id: string;
  name: string | null;

  // ✅ NEW: restaurant profile picture (works if your table/view has it)
  image_url?: string | null;

  // optional
  is_enabled?: boolean | null;
  approval_status?: string | null;
  is_approved?: boolean | null;
  approved?: boolean | null;
};

type MenuItem = {
  id: string;
  restaurant_id: string;
  name: string | null;
  price: number | null;
  cuisine?: string | null;
  image_url?: string | null;

  // premium extras
  is_veg?: boolean | null;
  is_best_seller?: boolean | null;
  in_stock?: boolean | null;

  description?: string | null;
};

/* ===========================
   ✅ Groceries types (NEW)
   =========================== */

type GroceryStore = {
  id: string;
  name: string | null;
  image_url?: string | null;

  // optional flags if you have them
  is_enabled?: boolean | null;
  approval_status?: string | null;
  is_approved?: boolean | null;
  approved?: boolean | null;
};

type GroceryItem = {
  id: string;
  store_id: string;
  name: string | null;
  price: number | null;
  image_url?: string | null;

  // optional
  in_stock?: boolean | null;
  is_best_seller?: boolean | null;
  description?: string | null;
};

function normalizeRole(r: unknown) {
  return String(r || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

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

function tagsFromName(name: string) {
  const n = (name || "").toLowerCase();
  const tags: string[] = [];
  if (n.includes("pizza")) tags.push("pizza");
  if (
    n.includes("butter") ||
    n.includes("paneer") ||
    n.includes("dal") ||
    n.includes("naan") ||
    n.includes("roti")
  )
    tags.push("indian");
  if (
    n.includes("tandoori") ||
    n.includes("amritsari") ||
    n.includes("chole") ||
    n.includes("rajma")
  )
    tags.push("punjabi");
  if (tags.length === 0) tags.push("recommended");
  return Array.from(new Set(tags));
}

const CATEGORIES = [
  { key: "recommended", label: "Recommended" },
  { key: "punjabi", label: "Punjabi" },
  { key: "indian", label: "Indian" },
  { key: "pizza", label: "Pizza" },
];

type CartItem = {
  menu_item_id: string;
  restaurant_id: string;
  name: string;
  price_each: number;
  qty: number;
  image_url?: string | null;
};

/**
 * ✅ Cart helpers
 * Your project has TWO keys in different pages:
 * - Home uses: cart_items
 * - Menu uses: foodapp_cart
 * We support BOTH so nothing breaks.
 */
function getCart(): CartItem[] {
  try {
    const a = localStorage.getItem("foodapp_cart");
    if (a) return JSON.parse(a) || [];
  } catch {}
  try {
    const b = localStorage.getItem("cart_items");
    if (b) return JSON.parse(b) || [];
  } catch {}
  return [];
}
function setCart(items: CartItem[]) {
  try {
    const payload = JSON.stringify(items || []);
    localStorage.setItem("foodapp_cart", payload);
    localStorage.setItem("cart_items", payload);
    window.dispatchEvent(new Event("storage"));
  } catch {}
}

// helpers for ETA/rating UI values (no "demo" text shown anywhere)
function hashNum(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
function demoEta(id: string) {
  const n = hashNum(id) % 26;
  return 18 + n;
}
function demoRating(id: string) {
  const n = hashNum(id) % 45;
  return (3.6 + n / 100).toFixed(1);
}

function niceDesc(it: MenuItem, restaurantName: string) {
  const base =
    it.description?.trim() ||
    `Freshly prepared ${it.name || "dish"} from ${restaurantName}. Made with quality ingredients and packed for fast delivery.`;
  return base;
}

function niceGroceryDesc(it: GroceryItem, storeName: string) {
  const base =
    it.description?.trim() ||
    `Fresh ${it.name || "item"} from ${storeName}. Carefully packed and ready for delivery.`;
  return base;
}

/**
 * ✅ Approval / enabled inference (works with multiple schemas)
 */
function isRestaurantEnabled(r: Restaurant) {
  if (typeof r.is_enabled === "boolean") return r.is_enabled;
  return true; // if column missing, assume enabled
}
function isRestaurantApproved(r: Restaurant) {
  // 1) approval_status string
  if (typeof r.approval_status === "string") {
    return String(r.approval_status || "").toLowerCase() === "approved";
  }
  // 2) is_approved boolean
  if (typeof r.is_approved === "boolean") return r.is_approved;
  // 3) approved boolean
  if (typeof (r as any).approved === "boolean") return (r as any).approved;
  // if column missing, assume approved (dev-friendly)
  return true;
}

// ✅ Reuse same logic for grocery stores (safe)
function isGroceryStoreEnabled(r: GroceryStore) {
  if (typeof r.is_enabled === "boolean") return r.is_enabled;
  return true;
}
function isGroceryStoreApproved(r: GroceryStore) {
  if (typeof r.approval_status === "string") {
    return String(r.approval_status || "").toLowerCase() === "approved";
  }
  if (typeof r.is_approved === "boolean") return r.is_approved;
  if (typeof (r as any).approved === "boolean") return (r as any).approved;
  return true;
}

export default function CustomerHomeDashboard() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string>("");
  const [err, setErr] = useState("");

  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);

  // ✅ NEW grocery state
  const [groceryStores, setGroceryStores] = useState<GroceryStore[]>([]);
  const [groceryItems, setGroceryItems] = useState<GroceryItem[]>([]);

  const [q, setQ] = useState("");
  const [activeCat, setActiveCat] = useState<string>("recommended");

  const [vegOnly, setVegOnly] = useState(false);
  const [bestsellerOnly, setBestsellerOnly] = useState(false);
  const [under199, setUnder199] = useState(false);
  const [inStockOnly, setInStockOnly] = useState(false);

  const [restSort, setRestSort] = useState<"name" | "eta" | "rating">("name");

  const [city, setCity] = useState<string>("Not set");
  const [editCity, setEditCity] = useState(false);
  const [cityDraft, setCityDraft] = useState("");

  const [recent, setRecent] = useState<string[]>([]);

  const [toast, setToast] = useState<string>("");
  const [cartCount, setCartCount] = useState<number>(0);
  const [cartMap, setCartMap] = useState<Record<string, number>>({});

  const [selected, setSelected] = useState<MenuItem | null>(null);

  // ✅ NEW grocery modal (optional, but safe)
  const [selectedGrocery, setSelectedGrocery] = useState<GroceryItem | null>(null);

  function refreshCartState() {
    const c = getCart();
    const count = c.reduce((s, x) => s + Number(x.qty || 0), 0);
    setCartCount(count);

    const m: Record<string, number> = {};
    for (const ci of c) m[ci.menu_item_id] = Number(ci.qty || 0);
    setCartMap(m);
  }

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(""), 1600);
  }

  function saveRecent(term: string) {
    const t = (term || "").trim();
    if (!t) return;
    const next = [t, ...recent.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, 8);
    setRecent(next);
    try {
      localStorage.setItem("recent_searches", JSON.stringify(next));
    } catch {}
  }

  const restaurantMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of restaurants) m.set(r.id, r.name || "Restaurant");
    return m;
  }, [restaurants]);

  function getRestaurantName(rid: string) {
    return restaurantMap.get(rid) || "Restaurant";
  }

  const groceryStoreMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of groceryStores) m.set(s.id, s.name || "Grocery Store");
    return m;
  }, [groceryStores]);

  function getGroceryStoreName(sid: string) {
    return groceryStoreMap.get(sid) || "Grocery Store";
  }

  function enforceSingleRestaurantOrConfirm(targetRestaurantId: string) {
    const cart = getCart();
    if (cart.length === 0) return true;

    const cartRestaurant = cart[0]?.restaurant_id;
    if (!cartRestaurant || cartRestaurant === targetRestaurantId) return true;

    const ok = confirm("Your cart has items from another restaurant.\n\nClear cart and continue?");
    if (!ok) return false;

    setCart([]);
    return true;
  }

  function setItemQty(item: MenuItem, nextQty: number) {
    if (!item?.id || !item.restaurant_id) {
      showToast("Item missing id/restaurant. Please refresh.");
      return;
    }

    if (item.in_stock === false) {
      showToast("Out of stock");
      return;
    }

    const price_each = Number(item.price || 0);
    if (!Number.isFinite(price_each) || price_each <= 0) {
      showToast("Invalid price. Please fix item price.");
      return;
    }

    if (!enforceSingleRestaurantOrConfirm(item.restaurant_id)) return;

    const cart = getCart();
    const idx = cart.findIndex((x) => x.menu_item_id === item.id);

    if (nextQty <= 0) {
      if (idx >= 0) cart.splice(idx, 1);
      setCart(cart);
      refreshCartState();
      showToast("Removed ✅");
      return;
    }

    if (idx >= 0) {
      cart[idx] = { ...cart[idx], qty: nextQty };
    } else {
      cart.push({
        menu_item_id: item.id,
        restaurant_id: item.restaurant_id,
        name: item.name || "Item",
        price_each,
        qty: nextQty,
        image_url: item.image_url || null,
      });
    }

    setCart(cart);
    refreshCartState();
    showToast("Updated ✅");
  }

  function inc(item: MenuItem) {
    const cur = cartMap[item.id] || 0;
    setItemQty(item, cur + 1);
  }

  function dec(item: MenuItem) {
    const cur = cartMap[item.id] || 0;
    setItemQty(item, cur - 1);
  }

  /**
   * ✅ SAFE SELECT:
   * Try multiple select column sets until one works (prevents "column does not exist" crashes).
   */
  async function safeSelect(table: string, attempts: string[]) {
    let lastErr: any = null;
    for (const cols of attempts) {
      const res = await supabase.from(table).select(cols);
      if (!res.error) return res;
      lastErr = res.error;
    }
    return { data: null as any, error: lastErr };
  }

  /**
   * ✅ SAFE SELECT across table name options (NEW)
   * We try multiple possible table/view names so your app doesn't crash if naming differs.
   */
  async function safeSelectFromTables(tables: string[], attempts: string[]) {
    let lastErr: any = null;
    for (const t of tables) {
      const res = await safeSelect(t, attempts);
      if (!res.error) return { ...res, tableUsed: t };
      lastErr = res.error;
    }
    return { data: null as any, error: lastErr, tableUsed: null as any };
  }

  /**
   * ✅ Load using views first
   * ✅ Fallback to base tables if views missing / blocked / empty
   */
  async function loadData() {
    setLoading(true);
    setErr("");

    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr && !String(userErr?.message || "").toLowerCase().includes("auth session missing")) {
        throw userErr;
      }

      const user = userData?.user;

      // role check
      if (user?.id) {
        const { data: prof, error: profErr } = await supabase
          .from("profiles")
          .select("role")
          .eq("user_id", user.id)
          .maybeSingle();

        if (profErr) throw profErr;

        const r = normalizeRole((prof as any)?.role);
        setRole(r);

        if (r === "restaurant_owner") {
          router.push("/restaurants/orders");
          return;
        }
      } else {
        setRole("");
      }

      // 1) Try views (restaurants_public + menu_items_public)
      let restList: Restaurant[] = [];
      let itemList: MenuItem[] = [];

      try {
        const restRes = await safeSelect("restaurants_public", [
          "id, name, image_url, is_enabled",
          "id, name, image_url",
          "id, name, is_enabled",
          "id, name",
        ]);
        if (restRes.error) throw restRes.error;

        restList = (restRes.data || []) as Restaurant[];

        const itemRes = await safeSelect("menu_items_public", [
          "id, restaurant_id, name, price, cuisine, image_url, is_veg, is_best_seller, in_stock, description",
          "id, restaurant_id, name, price, cuisine, image_url, is_veg, is_best_seller, in_stock",
          "id, restaurant_id, name, price, image_url, is_veg, is_best_seller, in_stock",
          "id, restaurant_id, name, price, image_url",
        ]);
        if (itemRes.error) throw itemRes.error;

        itemList = (itemRes.data || []) as MenuItem[];

        // sort newest-like
        itemList = [...itemList].sort((a, b) => String(b.id).localeCompare(String(a.id)));
      } catch (viewErr: any) {
        // 2) Fallback: base tables + client filtering
        const viewMsg = String(viewErr?.message || viewErr || "");
        console.warn("Views failed, fallback to tables:", viewMsg);

        const restRes = await safeSelect("restaurants", [
          "id, name, image_url, is_enabled, approval_status, is_approved, approved",
          "id, name, image_url, is_enabled, approval_status, approved",
          "id, name, image_url, is_enabled, approval_status",
          "id, name, image_url, is_enabled",
          "id, name, image_url",
          "id, name, is_enabled, approval_status, is_approved, approved",
          "id, name, is_enabled, approval_status, approved",
          "id, name, is_enabled, approval_status",
          "id, name, is_enabled",
          "id, name",
        ]);
        if (restRes.error) throw restRes.error;

        const rawRestaurants = (restRes.data || []) as Restaurant[];
        restList = rawRestaurants.filter((r) => isRestaurantEnabled(r) && isRestaurantApproved(r));

        const approvedIds = new Set(restList.map((r) => r.id));

        const itemRes = await safeSelect("menu_items", [
          "id, restaurant_id, name, price, cuisine, image_url, is_veg, is_best_seller, in_stock, description",
          "id, restaurant_id, name, price, cuisine, image_url, is_veg, is_best_seller, in_stock",
          "id, restaurant_id, name, price, cuisine, image_url",
          "id, restaurant_id, name, price, image_url",
        ]);
        if (itemRes.error) throw itemRes.error;

        const rawItems = (itemRes.data || []) as MenuItem[];
        itemList = rawItems.filter((it) => approvedIds.has(it.restaurant_id));

        // newest-like
        itemList = [...itemList].sort((a, b) => String(b.id).localeCompare(String(a.id)));
      }

      // extra safety
      const approvedIds = new Set(restList.map((r) => r.id));
      const safeItems = itemList.filter((it) => approvedIds.has(it.restaurant_id));

      setRestaurants(restList);
      setItems(safeItems);

      /* ===========================
         ✅ NEW: Load groceries (safe)
         =========================== */

      let gStores: GroceryStore[] = [];
      let gItems: GroceryItem[] = [];

      try {
        const gsRes = await safeSelectFromTables(
          ["grocery_stores_public", "groceries_stores_public", "grocery_stores", "groceries_stores"],
          [
            "id, name, image_url, is_enabled, approval_status, is_approved, approved",
            "id, name, image_url, is_enabled",
            "id, name, image_url",
            "id, name",
          ]
        );

        if (!gsRes.error) {
          const raw = (gsRes.data || []) as GroceryStore[];
          gStores = raw.filter((s) => isGroceryStoreEnabled(s) && isGroceryStoreApproved(s));
        }

        const storeIds = new Set(gStores.map((s) => s.id));

        const giRes = await safeSelectFromTables(
          ["grocery_items_public", "groceries_items_public", "grocery_items", "groceries_items"],
          [
            "id, store_id, name, price, image_url, in_stock, is_best_seller, description",
            "id, store_id, name, price, image_url, in_stock",
            "id, store_id, name, price, image_url",
            "id, store_id, name, price",
          ]
        );

        if (!giRes.error) {
          const raw = (giRes.data || []) as GroceryItem[];

          if (storeIds.size > 0) gItems = raw.filter((it) => storeIds.has(it.store_id));
          else gItems = raw;

          gItems = [...gItems].sort((a, b) => String(b.id).localeCompare(String(a.id)));
        }
      } catch (gErr: any) {
        console.warn("Groceries load warning:", gErr?.message || String(gErr));
      }

      setGroceryStores(gStores);
      setGroceryItems(gItems);

      refreshCartState();
    } catch (e: any) {
      setErr(e?.message || String(e));
      setRestaurants([]);
      setItems([]);
      setGroceryStores([]);
      setGroceryItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();

    try {
      const c = localStorage.getItem("foodapp_city");
      if (c) setCity(c);

      const rs = localStorage.getItem("recent_searches");
      if (rs) {
        const arr = JSON.parse(rs);
        if (Array.isArray(arr)) setRecent(arr.slice(0, 8));
      }
    } catch {}

    const onStorage = () => refreshCartState();
    window.addEventListener("storage", onStorage);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelected(null);
        setSelectedGrocery(null);
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (q.trim().length >= 3) saveRecent(q);
    }, 700);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { recommended: items.length, punjabi: 0, indian: 0, pizza: 0 };
    for (const it of items) {
      const c = normCuisine(it.cuisine);
      const tags = c ? [c] : tagsFromName(it.name || "");
      for (const t of tags) if (counts[t] !== undefined) counts[t] += 1;
    }
    return counts;
  }, [items]);

  const featuredItems = useMemo(() => {
    const s = q.trim().toLowerCase();
    let base = items;

    if (s) {
      base = base.filter((it) => {
        const itemName = (it.name || "").toLowerCase();
        const restName = (restaurantMap.get(it.restaurant_id) || "").toLowerCase();
        return itemName.includes(s) || restName.includes(s);
      });
    }

    base = base.filter((it) => {
      const c = normCuisine(it.cuisine);
      if (activeCat === "recommended") return true;
      if (c) return c === activeCat;
      return tagsFromName(it.name || "").includes(activeCat);
    });

    if (vegOnly) base = base.filter((x) => x.is_veg === true);
    if (bestsellerOnly) base = base.filter((x) => x.is_best_seller === true);
    if (under199) base = base.filter((x) => Number(x.price || 0) > 0 && Number(x.price || 0) <= 199);
    if (inStockOnly) base = base.filter((x) => x.in_stock !== false);

    return base.slice(0, 12);
  }, [items, q, activeCat, restaurantMap, vegOnly, bestsellerOnly, under199, inStockOnly]);

  const featuredGroceryItems = useMemo(() => {
    const s = q.trim().toLowerCase();
    let base = groceryItems;

    if (s) {
      base = base.filter((it) => {
        const itemName = (it.name || "").toLowerCase();
        const storeName = (groceryStoreMap.get(it.store_id) || "").toLowerCase();
        return itemName.includes(s) || storeName.includes(s);
      });
    }

    const next = [...base];
    next.sort((a, b) => {
      const as = a.in_stock === false ? 1 : 0;
      const bs = b.in_stock === false ? 1 : 0;
      if (as !== bs) return as - bs;

      const ab = a.is_best_seller ? 0 : 1;
      const bb = b.is_best_seller ? 0 : 1;
      if (ab !== bb) return ab - bb;

      return String(b.id).localeCompare(String(a.id));
    });

    return next.slice(0, 8);
  }, [groceryItems, q, groceryStoreMap]);

  const filteredGroceryStores = useMemo(() => {
    const s = q.trim().toLowerCase();
    let base = groceryStores;

    if (s) base = base.filter((r) => (r.name || "").toLowerCase().includes(s));
    return base.slice(0, 12);
  }, [groceryStores, q]);

  const filteredRestaurants = useMemo(() => {
    const s = q.trim().toLowerCase();
    let base = restaurants;

    if (s) base = base.filter((r) => (r.name || "").toLowerCase().includes(s));

    const next = [...base];
    if (restSort === "name") next.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    if (restSort === "eta") next.sort((a, b) => demoEta(a.id) - demoEta(b.id));
    if (restSort === "rating") next.sort((a, b) => Number(demoRating(b.id)) - Number(demoRating(a.id)));

    return next;
  }, [restaurants, q, restSort]);

  function saveCity() {
    const v = cityDraft.trim();
    setCity(v ? v : "Not set");
    setEditCity(false);
    setCityDraft("");
    try {
      localStorage.setItem("foodapp_city", v ? v : "Not set");
    } catch {}
    showToast("✅ Location saved");
  }

  return (
    <main style={pageBg}>
      {toast ? <div style={toastBox}>{toast}</div> : null}

      {cartCount > 0 ? (
        <Link href="/cart" style={floatingCart}>
          Cart ({cartCount}) →
        </Link>
      ) : null}

      {/* Dish Details Modal */}
      {selected ? (
        <div
          style={modalOverlay}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSelected(null);
          }}
        >
          <div style={modalCard}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <div style={{ fontWeight: 1000, fontSize: 16, color: "#0b1220" }}>Dish Details</div>
              <button onClick={() => setSelected(null)} style={btnTiny}>
                ✕ Close
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
              <div style={{ ...imgWrap, height: 240 }}>
                {selected.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={selected.image_url} alt={selected.name || "dish"} style={img} />
                ) : (
                  <div style={imgPlaceholder}>No image</div>
                )}
                <div style={cardTopBadges}>
                  <span style={badgeDark}>⭐ {demoRating(selected.restaurant_id)}</span>
                  <span style={badgeLight}>{demoEta(selected.restaurant_id)} mins</span>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 20, fontWeight: 1000, color: "#0b1220" }}>{selected.name || "Dish"}</div>
                <div style={{ marginTop: 6, fontWeight: 900, color: "rgba(17,24,39,0.75)" }}>
                  {getRestaurantName(selected.restaurant_id)}
                </div>

                <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  {selected.is_veg === true ? <span style={badgeVeg}>VEG</span> : null}
                  {selected.is_veg === false ? <span style={badgeNonVeg}>NON-VEG</span> : null}
                  {selected.is_best_seller ? <span style={badgeBest}>BEST</span> : null}
                  {selected.in_stock === false ? <span style={badgeOut}>OUT</span> : null}
                  <span style={badgeLight}>{money(selected.price)}</span>
                </div>

                <div style={{ marginTop: 10, color: "rgba(17,24,39,0.72)", fontWeight: 800, lineHeight: 1.5 }}>
                  {niceDesc(selected, getRestaurantName(selected.restaurant_id))}
                </div>

                <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {(() => {
                    const c = normCuisine(selected.cuisine);
                    const tags = c ? [c] : tagsFromName(selected.name || "");
                    return tags.slice(0, 4).map((t) => (
                      <span key={t} style={tag}>
                        {t}
                      </span>
                    ));
                  })()}
                </div>

                <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 950, color: "rgba(17,24,39,0.8)" }}>Quantity</div>
                  <div style={stepper}>
                    <button
                      onClick={() => dec(selected)}
                      style={stepBtn}
                      disabled={(cartMap[selected.id] || 0) <= 0}
                    >
                      –
                    </button>
                    <div style={stepQty}>{cartMap[selected.id] || 0}</div>
                    <button onClick={() => inc(selected)} style={stepBtn} disabled={selected.in_stock === false}>
                      +
                    </button>
                  </div>

                  <Link href="/cart" style={btnSmallOutline}>
                    Go to Cart
                  </Link>
                  <Link href="/menu" style={btnSmallOutline}>
                    Open Menu
                  </Link>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 12, color: "rgba(17,24,39,0.55)", fontWeight: 800, fontSize: 12 }}>
              Tip: Press <b>Esc</b> to close.
            </div>
          </div>
        </div>
      ) : null}

      {/* ✅ Grocery Details Modal (NEW, safe + optional) */}
      {selectedGrocery ? (
        <div
          style={modalOverlay}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSelectedGrocery(null);
          }}
        >
          <div style={modalCard}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <div style={{ fontWeight: 1000, fontSize: 16, color: "#0b1220" }}>Grocery Item</div>
              <button onClick={() => setSelectedGrocery(null)} style={btnTiny}>
                ✕ Close
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
              <div style={{ ...imgWrap, height: 240 }}>
                {selectedGrocery.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={selectedGrocery.image_url} alt={selectedGrocery.name || "item"} style={img} />
                ) : (
                  <div style={imgPlaceholder}>No image</div>
                )}
                <div style={cardTopBadges}>
                  <span style={badgeDark}>⭐ {demoRating(selectedGrocery.store_id)}</span>
                  <span style={badgeLight}>{demoEta(selectedGrocery.store_id)} mins</span>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 20, fontWeight: 1000, color: "#0b1220" }}>
                  {selectedGrocery.name || "Item"}
                </div>
                <div style={{ marginTop: 6, fontWeight: 900, color: "rgba(17,24,39,0.75)" }}>
                  {getGroceryStoreName(selectedGrocery.store_id)}
                </div>

                <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  {selectedGrocery.is_best_seller ? <span style={badgeBest}>BEST</span> : null}
                  {selectedGrocery.in_stock === false ? <span style={badgeOut}>OUT</span> : null}
                  <span style={badgeLight}>{money(selectedGrocery.price)}</span>
                </div>

                <div style={{ marginTop: 10, color: "rgba(17,24,39,0.72)", fontWeight: 800, lineHeight: 1.5 }}>
                  {niceGroceryDesc(selectedGrocery, getGroceryStoreName(selectedGrocery.store_id))}
                </div>

                <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <Link href="/groceries" style={btnSmallOutline}>
                    Open Groceries
                  </Link>
                  <Link href={`/groceries?store=${encodeURIComponent(selectedGrocery.store_id)}`} style={btnSmallOutline}>
                    Open Store
                  </Link>
                </div>

                <div style={{ marginTop: 10, color: "rgba(17,24,39,0.55)", fontWeight: 800, fontSize: 12 }}>
                  Note: Groceries uses a separate cart/dashboard (no mixing).
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div style={{ width: "100%", margin: 0 }}>
        <div style={topBar}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={locPill}>📍 Location</span>
            {!editCity ? (
              <>
                <span style={locText}>
                  Your City: <b>{city}</b>
                </span>
                <button
                  onClick={() => {
                    setCityDraft(city === "Not set" ? "" : city);
                    setEditCity(true);
                  }}
                  style={btnTiny}
                >
                  Change
                </button>
              </>
            ) : (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <input
                  value={cityDraft}
                  onChange={(e) => setCityDraft(e.target.value)}
                  placeholder="e.g. Bakersfield"
                  style={cityInput}
                />
                <button onClick={saveCity} style={btnTinyDark}>
                  Save
                </button>
                <button onClick={() => setEditCity(false)} style={btnTiny}>
                  Cancel
                </button>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/cart" style={miniLink}>
              Cart ({cartCount})
            </Link>
            <Link href="/orders" style={miniLink}>
              My Orders
            </Link>
          </div>
        </div>

        <div style={heroGlass}>
          <div style={{ minWidth: 260 }}>
            <h1 style={heroTitle}>What are you craving today?</h1>

            <div style={{ color: "rgba(17,24,39,0.72)", marginTop: 8, fontWeight: 600 }}>
              Explore restaurants, browse items, and place an order.
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Link href="/restaurants" style={btnGhost}>
              Browse Restaurants
            </Link>
            <Link href="/menu" style={btnGhost}>
              Open Menu
            </Link>

            {/* ✅ NEW: Groceries quick button */}
            <Link href="/groceries" style={btnGhost}>
              Groceries
            </Link>

            <Link href="/cart" style={btnPrimary}>
              Cart ({cartCount})
            </Link>
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search restaurants or dishes…"
            style={search}
          />
        </div>

        {recent.length > 0 ? (
          <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <span style={miniHint}>Recent:</span>
            {recent.slice(0, 6).map((r) => (
              <button key={r} onClick={() => setQ(r)} style={chipMini}>
                {r}
              </button>
            ))}
            <button
              onClick={() => {
                setRecent([]);
                try {
                  localStorage.removeItem("recent_searches");
                } catch {}
              }}
              style={chipMiniGhost}
            >
              Clear
            </button>
          </div>
        ) : null}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
          {CATEGORIES.map((c) => (
            <button key={c.key} onClick={() => setActiveCat(c.key)} style={activeCat === c.key ? chipActive : chip}>
              {c.label}{" "}
              <span style={countPill}>{c.key === "recommended" ? items.length : categoryCounts[c.key] || 0}</span>
            </button>
          ))}
          <button onClick={loadData} style={chip}>
            Refresh
          </button>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
          <button onClick={() => setVegOnly((v) => !v)} style={vegOnly ? chipActive : chip}>
            Veg Only
          </button>
          <button onClick={() => setBestsellerOnly((v) => !v)} style={bestsellerOnly ? chipActive : chip}>
            Bestseller
          </button>
          <button onClick={() => setUnder199((v) => !v)} style={under199 ? chipActive : chip}>
            Under ₹199
          </button>
          <button onClick={() => setInStockOnly((v) => !v)} style={inStockOnly ? chipActive : chip}>
            In Stock
          </button>
        </div>

        {err ? <div style={alertErr}>{err}</div> : null}
        {loading ? (
          <div style={{ marginTop: 12, color: "rgba(17,24,39,0.7)", fontWeight: 700 }}>Loading dashboard…</div>
        ) : null}

        {!loading ? (
          <>
            <div style={rowTitle}>
              <h2 style={sectionTitle}>
                {activeCat === "recommended"
                  ? "Recommended for you"
                  : `Top ${CATEGORIES.find((x) => x.key === activeCat)?.label || ""}`}
              </h2>
              <span style={subtle}>
                {vegOnly || bestsellerOnly || under199 || inStockOnly ? "Filters applied" : "Top picks"}
              </span>
            </div>

            {featuredItems.length === 0 ? (
              <div style={emptyBox}>No items found. Try clearing filters or searching another keyword.</div>
            ) : (
              <div style={grid}>
                {featuredItems.map((it) => {
                  const c = normCuisine(it.cuisine);
                  const tags = c ? [c] : tagsFromName(it.name || "");
                  const out = it.in_stock === false;
                  const qty = cartMap[it.id] || 0;

                  return (
                    <div key={it.id} style={cardGlass}>
                      <div
                        style={{ ...imgWrap, cursor: "pointer" }}
                        onClick={() => setSelected(it)}
                        title="Click to view details"
                      >
                        {it.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={it.image_url} alt={it.name || "item"} style={img} />
                        ) : (
                          <div style={imgPlaceholder}>No image</div>
                        )}

                        <div style={cardTopBadges}>
                          <span style={badgeDark}>⭐ {demoRating(it.restaurant_id)}</span>
                          <span style={badgeLight}>{demoEta(it.restaurant_id)} mins</span>
                        </div>
                      </div>

                      <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <button onClick={() => setSelected(it)} style={titleBtn} title="Open details">
                          {it.name || "Item"}
                        </button>
                        <div style={{ fontWeight: 950, color: "#111827" }}>{money(it.price)}</div>
                      </div>

                      <div style={{ marginTop: 6, color: "rgba(17,24,39,0.65)", fontSize: 13, fontWeight: 700 }}>
                        {getRestaurantName(it.restaurant_id)}
                      </div>

                      <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {it.is_veg === true ? <span style={badgeVeg}>VEG</span> : null}
                        {it.is_veg === false ? <span style={badgeNonVeg}>NON-VEG</span> : null}
                        {it.is_best_seller ? <span style={badgeBest}>BEST</span> : null}
                        {out ? <span style={badgeOut}>OUT</span> : null}
                        {tags.slice(0, 2).map((t) => (
                          <span key={t} style={tag}>
                            {t}
                          </span>
                        ))}
                      </div>

                      <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        {qty <= 0 ? (
                          <button
                            onClick={() => inc(it)}
                            style={{
                              ...btnSmallPrimaryBtn,
                              opacity: out ? 0.55 : 1,
                              cursor: out ? "not-allowed" : "pointer",
                            }}
                            disabled={out}
                          >
                            + Add to cart
                          </button>
                        ) : (
                          <div style={stepper}>
                            <button onClick={() => dec(it)} style={stepBtn}>
                              –
                            </button>
                            <div style={stepQty}>{qty}</div>
                            <button onClick={() => inc(it)} style={stepBtn} disabled={out}>
                              +
                            </button>
                          </div>
                        )}

                        <button onClick={() => setSelected(it)} style={btnSmallOutlineBtn}>
                          Details
                        </button>
                      </div>

                      <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <Link href="/menu" style={btnSmallOutline}>
                          View in Menu
                        </Link>
                        <Link href="/restaurants" style={btnSmallOutline}>
                          Restaurant
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ===========================
                ✅ NEW SECTION: Groceries row
               =========================== */}
            <div style={rowTitle}>
              <h2 style={sectionTitle}>Groceries for you</h2>
              <span style={subtle}>{featuredGroceryItems.length > 0 ? "Fresh picks" : "No grocery items yet"}</span>
            </div>

            {featuredGroceryItems.length === 0 ? (
              <div style={emptyBox}>
                No grocery items found. Once your grocery tables/views are connected, they will show here.
              </div>
            ) : (
              <div style={grid}>
                {featuredGroceryItems.map((it) => {
                  const out = it.in_stock === false;

                  return (
                    <div key={it.id} style={cardGlass}>
                      <div
                        style={{ ...imgWrap, cursor: "pointer" }}
                        onClick={() => setSelectedGrocery(it)}
                        title="Click to view details"
                      >
                        {it.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={it.image_url} alt={it.name || "item"} style={img} />
                        ) : (
                          <div style={imgPlaceholder}>No image</div>
                        )}

                        <div style={cardTopBadges}>
                          <span style={badgeDark}>⭐ {demoRating(it.store_id)}</span>
                          <span style={badgeLight}>{demoEta(it.store_id)} mins</span>
                        </div>
                      </div>

                      <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <button onClick={() => setSelectedGrocery(it)} style={titleBtn} title="Open details">
                          {it.name || "Item"}
                        </button>
                        <div style={{ fontWeight: 950, color: "#111827" }}>{money(it.price)}</div>
                      </div>

                      <div style={{ marginTop: 6, color: "rgba(17,24,39,0.65)", fontSize: 13, fontWeight: 700 }}>
                        {getGroceryStoreName(it.store_id)}
                      </div>

                      <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {it.is_best_seller ? <span style={badgeBest}>BEST</span> : null}
                        {out ? <span style={badgeOut}>OUT</span> : null}
                        <span style={tag}>grocery</span>
                      </div>

                      <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <Link href="/groceries" style={btnSmallOutline}>
                          Open Groceries
                        </Link>
                        <Link href={`/groceries?store=${encodeURIComponent(it.store_id)}`} style={btnSmallOutline}>
                          Open Store
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={rowTitle}>
              <h2 style={sectionTitle}>Grocery Stores</h2>
              <span style={subtle}>{filteredGroceryStores.length > 0 ? "Nearby stores" : "No stores yet"}</span>
            </div>

            {filteredGroceryStores.length === 0 ? (
              <div style={emptyBox}>No grocery stores found yet.</div>
            ) : (
              <div style={grid}>
                {filteredGroceryStores.slice(0, 12).map((s) => (
                  <div key={s.id} style={cardGlass}>
                    <div style={{ ...imgWrap, height: 130 }}>
                      {s.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={s.image_url} alt={s.name || "store"} style={img} />
                      ) : (
                        <div style={imgPlaceholder}>No image</div>
                      )}
                      <div style={cardTopBadges}>
                        <span style={badgeDark}>⭐ {demoRating(s.id)}</span>
                        <span style={badgeLight}>{demoEta(s.id)} mins</span>
                      </div>
                    </div>

                    <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontWeight: 950, fontSize: 16, color: "#111827" }}>{s.name || "Grocery Store"}</div>
                    </div>

                    <div style={{ marginTop: 8, color: "rgba(17,24,39,0.65)", fontSize: 13, fontWeight: 700 }}>
                      Fresh groceries • Quick delivery
                    </div>

                    <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                      <Link href={`/groceries?store=${encodeURIComponent(s.id)}`} style={btnSmallOutline}>
                        Open Store
                      </Link>
                      <Link href="/groceries" style={btnSmallOutline}>
                        Browse Groceries
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={rowTitle}>
              <h2 style={sectionTitle}>Restaurants</h2>

              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <span style={miniHint}>Sort:</span>
                <select value={restSort} onChange={(e) => setRestSort(e.target.value as any)} style={selectMini}>
                  <option value="name">Name</option>
                  <option value="eta">Delivery time</option>
                  <option value="rating">Rating</option>
                </select>
              </div>
            </div>

            {filteredRestaurants.length === 0 ? (
              <div style={emptyBox}>No restaurants match your search.</div>
            ) : (
              <div style={grid}>
                {filteredRestaurants.slice(0, 12).map((r) => (
                  <div key={r.id} style={cardGlass}>
                    <div style={{ ...imgWrap, height: 130 }}>
                      {r.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.image_url} alt={r.name || "restaurant"} style={img} />
                      ) : (
                        <div style={imgPlaceholder}>No image</div>
                      )}
                      <div style={cardTopBadges}>
                        <span style={badgeDark}>⭐ {demoRating(r.id)}</span>
                        <span style={badgeLight}>{demoEta(r.id)} mins</span>
                      </div>
                    </div>

                    <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontWeight: 950, fontSize: 16, color: "#111827" }}>{r.name || "Restaurant"}</div>
                    </div>

                    <div style={{ marginTop: 8, color: "rgba(17,24,39,0.65)", fontSize: 13, fontWeight: 700 }}>
                      Fast delivery • Highly rated
                    </div>
                  <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                      <Link href={`/restaurants/${r.id}`} style={btnSmallOutline}>
                        Open Menu
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : null}
      </div>
    </main>
  );
}

/* ======= Styles (inline only) ======= */

const pageBg: React.CSSProperties = {
  minHeight: "calc(100vh - 64px)",
  padding: 20,
  background:
    "radial-gradient(1200px 600px at 20% 10%, rgba(255,140,0,0.22), transparent 62%), radial-gradient(900px 520px at 80% 18%, rgba(80,160,255,0.20), transparent 58%), linear-gradient(180deg, #f7f7fb, #ffffff)",
};

const topBar: React.CSSProperties = {
  borderRadius: 18,
  padding: 12,
  background: "rgba(255,255,255,0.78)",
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
  backdropFilter: "blur(10px)",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 12,
};

const locPill: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.75)",
  fontWeight: 950,
  fontSize: 12,
};

const locText: React.CSSProperties = {
  fontWeight: 800,
  color: "rgba(17,24,39,0.8)",
  fontSize: 13,
};

const btnTiny: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.85)",
  fontWeight: 950,
  cursor: "pointer",
  fontSize: 12,
};

const btnTinyDark: React.CSSProperties = {
  ...btnTiny,
  border: "1px solid rgba(17,24,39,0.95)",
  background: "rgba(17,24,39,0.95)",
  color: "#fff",
};

const cityInput: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.12)",
  outline: "none",
  background: "rgba(255,255,255,0.95)",
  fontSize: 13,
  fontWeight: 800,
  width: 210,
};

const miniLink: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(255,255,255,0.75)",
  textDecoration: "none",
  fontWeight: 950,
  color: "#111827",
  fontSize: 12,
};

const heroGlass: React.CSSProperties = {
  borderRadius: 20,
  padding: 18,
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

const heroTitle: React.CSSProperties = {
  margin: "0 0 0 0",
  fontSize: 34,
  fontWeight: 1000,
  color: "#0b1220",
  letterSpacing: -0.2,
};

const btnPrimary: React.CSSProperties = {
  padding: "11px 14px",
  borderRadius: 14,
  border: "1px solid rgba(17,24,39,0.95)",
  background: "rgba(17,24,39,0.95)",
  color: "#fff",
  textDecoration: "none",
  fontWeight: 950,
  boxShadow: "0 12px 30px rgba(17,24,39,0.18)",
};

const btnGhost: React.CSSProperties = {
  padding: "11px 14px",
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.75)",
  color: "#111827",
  textDecoration: "none",
  fontWeight: 950,
};

const search: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.12)",
  outline: "none",
  background: "rgba(255,255,255,0.85)",
  fontSize: 14,
  boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
};

const chip: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.7)",
  cursor: "pointer",
  fontWeight: 900,
  color: "rgba(17,24,39,0.85)",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
};

const chipActive: React.CSSProperties = {
  ...chip,
  border: "1px solid rgba(17,24,39,0.9)",
  background: "rgba(17,24,39,0.92)",
  color: "#fff",
};

const countPill: React.CSSProperties = {
  padding: "4px 8px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.16)",
  border: "1px solid rgba(255,255,255,0.18)",
  fontSize: 12,
  fontWeight: 900,
};

const chipMini: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.8)",
  cursor: "pointer",
  fontWeight: 900,
  fontSize: 12,
};

const chipMiniGhost: React.CSSProperties = {
  ...chipMini,
  background: "rgba(255,255,255,0.55)",
  color: "rgba(17,24,39,0.75)",
};

const miniHint: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  color: "rgba(17,24,39,0.6)",
};

const rowTitle: React.CSSProperties = {
  marginTop: 22,
  marginBottom: 10,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
};

const sectionTitle: React.CSSProperties = {
  margin: 0,
  fontSize: 20,
  fontWeight: 950,
  color: "#0b1220",
};

const subtle: React.CSSProperties = {
  color: "rgba(17,24,39,0.55)",
  fontSize: 12,
  fontWeight: 900,
};

/** ✅ ONLY CHANGE IS HERE: fixed-width grid like restaurant cards, no stretching */
const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(260px, 260px))",
  gap: 12,
  justifyContent: "start",
};

const cardGlass: React.CSSProperties = {
  borderRadius: 18,
  padding: 14,
  background: "rgba(255,255,255,0.78)",
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 12px 36px rgba(0,0,0,0.08)",
  backdropFilter: "blur(10px)",
};

const imgWrap: React.CSSProperties = {
  width: "100%",
  height: 150,
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.08)",
  overflow: "hidden",
  background: "rgba(0,0,0,0.03)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  position: "relative",
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

const cardTopBadges: React.CSSProperties = {
  position: "absolute",
  top: 10,
  left: 10,
  right: 10,
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  pointerEvents: "none",
};

const badgeDark: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 999,
  background: "rgba(17,24,39,0.92)",
  color: "#fff",
  fontWeight: 950,
  fontSize: 12,
  border: "1px solid rgba(255,255,255,0.14)",
};

const badgeLight: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.85)",
  color: "rgba(17,24,39,0.85)",
  fontWeight: 950,
  fontSize: 12,
  border: "1px solid rgba(0,0,0,0.12)",
};

const badgeVeg: React.CSSProperties = {
  padding: "4px 8px",
  borderRadius: 999,
  border: "1px solid rgba(16,185,129,0.30)",
  background: "rgba(236,253,245,0.90)",
  color: "#065f46",
  fontWeight: 950,
  fontSize: 11,
};

const badgeNonVeg: React.CSSProperties = {
  padding: "4px 8px",
  borderRadius: 999,
  border: "1px solid rgba(239,68,68,0.25)",
  background: "rgba(254,242,242,0.90)",
  color: "#7f1d1d",
  fontWeight: 950,
  fontSize: 11,
};

const badgeBest: React.CSSProperties = {
  padding: "4px 8px",
  borderRadius: 999,
  border: "1px solid rgba(99,102,241,0.25)",
  background: "rgba(238,242,255,0.95)",
  color: "#3730a3",
  fontWeight: 950,
  fontSize: 11,
};

const badgeOut: React.CSSProperties = {
  padding: "4px 8px",
  borderRadius: 999,
  border: "1px solid rgba(245,158,11,0.30)",
  background: "rgba(254,243,199,0.90)",
  color: "#92400e",
  fontWeight: 950,
  fontSize: 11,
};

const tag: React.CSSProperties = {
  fontSize: 12,
  padding: "5px 10px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.7)",
  color: "rgba(17,24,39,0.8)",
  fontWeight: 900,
};

const btnSmallOutline: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.75)",
  color: "#111827",
  textDecoration: "none",
  fontWeight: 950,
  fontSize: 13,
};

const btnSmallOutlineBtn: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.75)",
  color: "#111827",
  fontWeight: 950,
  fontSize: 13,
  cursor: "pointer",
};

const btnSmallPrimaryBtn: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 12,
  border: "1px solid rgba(17,24,39,0.95)",
  background: "rgba(17,24,39,0.95)",
  color: "#fff",
  fontWeight: 950,
  fontSize: 13,
  cursor: "pointer",
  boxShadow: "0 10px 22px rgba(17,24,39,0.16)",
};

const emptyBox: React.CSSProperties = {
  padding: 14,
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.75)",
  color: "rgba(17,24,39,0.7)",
  fontWeight: 700,
};

const alertErr: React.CSSProperties = {
  marginTop: 12,
  padding: 12,
  border: "1px solid #fecaca",
  background: "rgba(254,242,242,0.9)",
  borderRadius: 14,
  color: "#7f1d1d",
  fontWeight: 800,
};

const toastBox: React.CSSProperties = {
  position: "fixed",
  top: 16,
  left: "50%",
  transform: "translateX(-50%)",
  padding: "10px 14px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.9)",
  fontWeight: 950,
  zIndex: 9999,
  boxShadow: "0 12px 32px rgba(0,0,0,0.10)",
};

const floatingCart: React.CSSProperties = {
  position: "fixed",
  right: 16,
  bottom: 16,
  zIndex: 9999,
  padding: "12px 14px",
  borderRadius: 999,
  border: "1px solid rgba(17,24,39,0.95)",
  background: "rgba(17,24,39,0.95)",
  color: "#fff",
  textDecoration: "none",
  fontWeight: 950,
  boxShadow: "0 14px 40px rgba(0,0,0,0.22)",
};

const selectMini: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.85)",
  fontWeight: 900,
  fontSize: 12,
  outline: "none",
};

const stepper: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 8px",
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.85)",
};

const stepBtn: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.95)",
  fontWeight: 1000,
  cursor: "pointer",
};

const stepQty: React.CSSProperties = {
  minWidth: 22,
  textAlign: "center",
  fontWeight: 1000,
  color: "#0b1220",
};

const titleBtn: React.CSSProperties = {
  border: "none",
  background: "transparent",
  padding: 0,
  margin: 0,
  textAlign: "left",
  fontWeight: 950,
  color: "#111827",
  cursor: "pointer",
  fontSize: 16,
  lineHeight: 1.2,
};

const modalOverlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(17,24,39,0.55)",
  zIndex: 10000,
  display: "grid",
  placeItems: "center",
  padding: 16,
};

const modalCard: React.CSSProperties = {
  width: "min(980px, 100%)",
  borderRadius: 18,
  padding: 14,
  background: "rgba(255,255,255,0.92)",
  border: "1px solid rgba(0,0,0,0.10)",
  boxShadow: "0 20px 60px rgba(0,0,0,0.28)",
  backdropFilter: "blur(10px)",
};