"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import supabase from "@/lib/supabase";
import { fetchReviewsByTarget, summarizeReviews } from "@/lib/reviews";

/* =========================
    Suspense Wrapper (Next.js build fix)
   ========================= */
export default function GroceryMenuPage() {
  return (
    <Suspense
      fallback={
        <main style={pageBg}>
          <div style={{ maxWidth: 980, margin: "0 auto", fontWeight: 900, color: "rgba(17,24,39,0.7)" }}>
            Loading groceries...
          </div>
        </main>
      }
    >
      <GroceryMenuInner />
    </Suspense>
  );
}

/* =========================
   Page (your original logic)
   ========================= */
function GroceryMenuInner() {
  const router = useRouter();
  const params = useSearchParams();
  const storeId = clean(params.get("store_id"));

  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState("");

  const [store, setStore] = useState(null);
  const [items, setItems] = useState([]);

  //  Currency (SAFE: default INR so old behavior stays)
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);

  //  categories + subcategories
  const [categories, setCategories] = useState([]); // grocery_categories
  const [subcategories, setSubcategories] = useState([]); // grocery_subcategories

  //  selected category/subcategory filters
  const [categoryId, setCategoryId] = useState("all"); // "all" | uuid
  const [subcategoryId, setSubcategoryId] = useState("all"); // "all" | uuid

  // UI filters (grocery-safe)
  const [search, setSearch] = useState("");
  const [onlyInStock, setOnlyInStock] = useState(false);
  const [onlyBest, setOnlyBest] = useState(false);
  const [sortBy, setSortBy] = useState("recommended"); // recommended | price_asc | price_desc | az | newest
  const [priceCap, setPriceCap] = useState(0); // 0 = no cap, else <= cap

  // details modal (OLD LOGIC KEPT - but we will not use it now)
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [activeItem, setActiveItem] = useState(null);

  // cart
  const [cartCount, setCartCount] = useState(0);
  const [cartItems, setCartItems] = useState([]);

  const [storeReviews, setStoreReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);

  //  NEW: categories drawer for mobile
  const [catDrawerOpen, setCatDrawerOpen] = useState(false);

  //  Read currency preference once (NO writes, no old logic impact)
  useEffect(() => {
    try {
      const c = localStorage.getItem("foodapp_currency");
      setCurrency(normalizeCurrency(c));
    } catch {
      setCurrency(DEFAULT_CURRENCY);
    }
  }, []);

  function refreshCartCount() {
    const c = readCart();
    const count = (c || []).reduce((sum, it) => sum + (Number(it?.qty || 0) || 0), 0);
    setCartItems(Array.isArray(c) ? c : []);
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

      //  Load categories (active)
      const { data: cats, error: cErr } = await supabase
        .from("grocery_categories")
        .select("id, store_id, name, slug, sort_order, is_active")
        .eq("store_id", storeId)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (cErr) throw cErr;

      const catList = Array.isArray(cats) ? cats.filter((x) => x?.is_active !== false) : [];
      setCategories(catList);

      //  Load subcategories (active)
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
          "id, store_id, name, description, price, price_usd, image_url, category, category_id, subcategory_id, is_available, in_stock, is_veg, is_best_seller, is_recommended, is_taxable, created_at"
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

  async function loadStoreReviews() {
    if (!storeId) {
      setStoreReviews([]);
      return;
    }

    setReviewsLoading(true);
    try {
      const rows = await fetchReviewsByTarget(supabase, { targetType: "grocery", targetId: storeId });
      setStoreReviews(rows || []);
    } catch {
      setStoreReviews([]);
    } finally {
      setReviewsLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    loadStoreReviews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  useEffect(() => {
    refreshCartCount();
    const onStorage = () => refreshCartCount();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // close drawer on ESC
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") setCatDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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

  // lookup maps
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

  const selectedCategoryName = useMemo(() => {
    if (categoryId === "all") return "";
    return clean(catMap.get(String(categoryId))?.name);
  }, [categoryId, catMap]);

  const selectedSubcategoryName = useMemo(() => {
    if (subcategoryId === "all") return "";
    return clean(subMap.get(String(subcategoryId))?.name);
  }, [subcategoryId, subMap]);

  const cartQtyMap = useMemo(() => {
    const map = new Map();
    (cartItems || []).forEach((item) => {
      const id = String(item?.id || "");
      if (!id) return;
      map.set(id, Number(item?.qty || 0) || 0);
    });
    return map;
  }, [cartItems]);

  const visibleSubcategories = useMemo(() => {
    if (categoryId === "all") return [];
    const cid = String(categoryId);
    return (subcategories || []).filter((s) => String(s?.category_id) === cid);
  }, [subcategories, categoryId]);

  function legacySubName(it) {
    return (
      clean(it?.subcategory) ||
      clean(it?.sub_category) ||
      clean(it?.subCategory) ||
      clean(it?.subcategory_name) ||
      ""
    );
  }

  function isTaxableGrocery(it) {
    if (typeof it?.is_taxable === "boolean") return it.is_taxable;
    const s = String(it?.is_taxable ?? it?.taxable ?? "").toLowerCase();
    if (s === "false" || s === "0" || s === "no") return false;
    return true;
  }

  function getItemPrice(it, cur) {
    const c = normalizeCurrency(cur);

    if (c === "USD") {
      if (it?.price_usd !== null && it?.price_usd !== undefined) {
        const usd = Number(it.price_usd);
        if (Number.isFinite(usd)) return usd;
      }
      return num(it?.price);
    }

    return num(it?.price);
  }

  const processed = useMemo(() => {
    let list = Array.isArray(items) ? [...items] : [];

    if (categoryId !== "all") {
      const cid = String(categoryId);
      const wantName = lower(selectedCategoryName);

      list = list.filter((x) => {
        const hasId = !!x?.category_id;
        if (hasId) return String(x?.category_id) === cid;
        if (!wantName) return false;
        return lower(x?.category) === wantName;
      });
    }

    if (subcategoryId !== "all") {
      const sid = String(subcategoryId);
      const wantSub = lower(selectedSubcategoryName);

      list = list.filter((x) => {
        const hasId = !!x?.subcategory_id;
        if (hasId) return String(x?.subcategory_id) === sid;
        if (!wantSub) return false;
        return lower(legacySubName(x)) === wantSub;
      });
    }

    const q = clean(search).toLowerCase();
    if (q) {
      list = list.filter((x) => {
        const n = clean(x?.name).toLowerCase();
        const d = clean(x?.description).toLowerCase();

        const legacy = clean(x?.category).toLowerCase();
        const catName = clean(catMap.get(String(x?.category_id || ""))?.name).toLowerCase();
        const subName = clean(subMap.get(String(x?.subcategory_id || ""))?.name).toLowerCase();
        const legSub = lower(legacySubName(x));

        return n.includes(q) || d.includes(q) || legacy.includes(q) || catName.includes(q) || subName.includes(q) || legSub.includes(q);
      });
    }

    if (onlyInStock) list = list.filter((x) => !!x?.in_stock);
    if (onlyBest) list = list.filter((x) => !!x?.is_best_seller);

    if (priceCap > 0) list = list.filter((x) => getItemPrice(x, currency) <= priceCap);

    if (sortBy === "az") {
      list.sort((a, b) => clean(a?.name).localeCompare(clean(b?.name)));
    } else if (sortBy === "price_asc") {
      list.sort((a, b) => getItemPrice(a, currency) - getItemPrice(b, currency));
    } else if (sortBy === "price_desc") {
      list.sort((a, b) => getItemPrice(b, currency) - getItemPrice(a, currency));
    } else if (sortBy === "newest") {
      list.sort((a, b) => new Date(b?.created_at || 0) - new Date(a?.created_at || 0));
    } else {
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
    currency,
  ]);

  function addToCart(item) {
    if (!item?.id) return;

    const cart = readCart() || [];
    const idx = cart.findIndex((x) => x?.id === item.id);
    const chosenPrice = getItemPrice(item, currency);

    if (idx >= 0) {
      cart[idx].qty = (Number(cart[idx].qty || 0) || 0) + 1;

      if (typeof cart[idx].is_taxable !== "boolean") {
        cart[idx].is_taxable = isTaxableGrocery(item);
      }
    } else {
      const catName = clean(catMap.get(String(item?.category_id || ""))?.name) || item.category || "General";

      cart.push({
        id: item.id,
        store_id: item.store_id,
        name: item.name,
        price: num(chosenPrice),
        image_url: item.image_url || "",
        category: catName,
        qty: 1,
        item_type: "grocery",
        is_taxable: isTaxableGrocery(item),
      });
    }

    writeCart(cart);
    refreshCartCount();
  }

  function removeFromCart(item) {
    if (!item?.id) return;

    const cart = readCart() || [];
    const idx = cart.findIndex((x) => x?.id === item.id);
    if (idx < 0) return;

    const nextQty = (Number(cart[idx].qty || 0) || 0) - 1;
    if (nextQty <= 0) cart.splice(idx, 1);
    else cart[idx].qty = nextQty;

    writeCart(cart);
    refreshCartCount();
  }

  function openDetails(item) {
    if (!item?.id) return;

    setActiveItem(item || null);
    setDetailsOpen(false);

    const sid = encodeURIComponent(String(storeId || item?.store_id || ""));
    const iid = encodeURIComponent(String(item.id));

    router.push(`/groceries/product?store_id=${sid}&item_id=${iid}`);
  }

  function clearFilters() {
    setSearch("");
    setOnlyInStock(false);
    setOnlyBest(false);
    setSortBy("recommended");
    setPriceCap(0);
    setCategoryId("all");
    setSubcategoryId("all");
    setCatDrawerOpen(false);
  }

  function displayCategoryLabel(it) {
    const catName = clean(catMap.get(String(it?.category_id || ""))?.name);
    return catName || clean(it?.category) || "General";
  }

  function displaySubcategoryLabel(it) {
    const subName = clean(subMap.get(String(it?.subcategory_id || ""))?.name);
    if (subName) return subName;
    const leg = legacySubName(it);
    return leg || "";
  }

  const activeCategoryTitle = useMemo(() => {
    if (categoryId === "all") return "All Categories";
    return clean(catMap.get(String(categoryId))?.name) || "Category";
  }, [categoryId, catMap]);

  const activeSubTitle = useMemo(() => {
    if (subcategoryId === "all") return "";
    return clean(subMap.get(String(subcategoryId))?.name) || "";
  }, [subcategoryId, subMap]);

  const reviewSummary = useMemo(() => summarizeReviews(storeReviews), [storeReviews]);

  function reviewerDisplayName(review) {
    const raw = String(review?.reviewer_name || "").trim();
    if (raw && raw.toLowerCase() !== "customer") return raw;
    return "Customer";
  }

  function renderReviewStars(rating, size = 14) {
    const value = Math.max(1, Math.min(5, Math.round(Number(rating || 0))));
    return (
      <div style={{ display: "inline-flex", alignItems: "center", gap: 2 }} aria-label={`${value} out of 5 stars`}>
        {[1, 2, 3, 4, 5].map((idx) => (
          <span
            key={idx}
            style={{
              fontSize: size,
              lineHeight: 1,
              color: idx <= value ? "#F4B400" : "rgba(15,23,42,0.22)",
            }}
          >
            {"\u2605"}
          </span>
        ))}
      </div>
    );
  }

  function pickCategory(id) {
    setCategoryId(id);
    setSubcategoryId("all");
  }
  function pickSubcategory(id) {
    setSubcategoryId(id);
  }

  const CategoriesPanel = (
    <div style={catPanel}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div style={{ fontWeight: 1000, color: "#0b1220" }}>Categories</div>
        <button onClick={() => setCatDrawerOpen(false)} style={btnCloseSmall} aria-label="Close categories">
          X
        </button>
      </div>

      <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
        <button
          onClick={() => {
            pickCategory("all");
            setCatDrawerOpen(false);
          }}
          style={categoryId === "all" ? catItemOn : catItemOff}
        >
          All Categories
        </button>

        {(categories || []).map((c) => (
          <button
            key={c.id}
            onClick={() => pickCategory(String(c.id))}
            style={String(categoryId) === String(c.id) ? catItemOn : catItemOff}
            title={c.name}
          >
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
            <span style={catChevron}>&gt;</span>
          </button>
        ))}
      </div>

      {categoryId !== "all" ? (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 950, color: "rgba(17,24,39,0.78)", fontSize: 12, marginBottom: 8 }}>
            Subcategories
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <button
              onClick={() => {
                pickSubcategory("all");
                setCatDrawerOpen(false);
              }}
              style={subcategoryId === "all" ? subItemOn : subItemOff}
            >
              All in {activeCategoryTitle}
            </button>

            {visibleSubcategories.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  pickSubcategory(String(s.id));
                  setCatDrawerOpen(false);
                }}
                style={String(subcategoryId) === String(s.id) ? subItemOn : subItemOff}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button onClick={clearFilters} style={btnGhost} title="Clear all filters">
          Clear All
        </button>
        <Link href="/cart" style={btnLight}>
          Cart {cartCount > 0 ? `(${cartCount})` : ""}
        </Link>
      </div>
    </div>
  );

  return (
    <main style={pageBg}>
      {/*  Responsive CSS (proper way) */}
      <style jsx global>{`
        @media (max-width: 980px) {
          .grocery_layout {
            grid-template-columns: 1fr !important;
          }
          .grocery_sidebar {
            display: none !important;
          }
          .grocery_catbtn {
            display: inline-flex !important;
          }
        }

        @media (max-width: 680px) {
          .grocery_store_hero {
            padding: 14px !important;
            border-radius: 16px !important;
            gap: 10px !important;
            background: linear-gradient(180deg, rgba(255, 255, 255, 0.9), rgba(247, 252, 250, 0.96)) !important;
            box-shadow: 0 10px 28px rgba(15, 23, 42, 0.08) !important;
          }
          .grocery_store_hero_left,
          .grocery_store_hero_right {
            min-width: 0 !important;
            width: 100% !important;
          }
          .grocery_store_title {
            font-size: 44px !important;
            line-height: 0.98 !important;
            letter-spacing: -0.9px !important;
            margin-top: 8px !important;
          }
          .grocery_store_sub {
            margin-top: 6px !important;
            font-size: 14px !important;
            font-weight: 900 !important;
            color: rgba(15, 23, 42, 0.62) !important;
          }
          .grocery_store_actions {
            margin-top: 10px !important;
            display: grid !important;
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 8px !important;
            width: 100% !important;
          }
          .grocery_store_actions button,
          .grocery_store_actions a {
            justify-content: center !important;
            text-align: center !important;
            padding: 10px 8px !important;
            border-radius: 12px !important;
            font-size: 13px !important;
            font-weight: 900 !important;
            min-height: 42px !important;
          }
          .grocery_store_info {
            margin-top: 2px !important;
            padding: 12px !important;
            border-radius: 14px !important;
          }
          .grocery_store_info_title {
            font-size: 13px !important;
            font-weight: 1000 !important;
          }
          .grocery_store_info_row {
            margin-top: 8px !important;
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 8px !important;
          }
          .grocery_store_chip {
            width: 100% !important;
            text-align: center !important;
            justify-content: center !important;
            font-size: 12px !important;
            padding: 7px 9px !important;
          }
          .grocery_search_panel {
            padding: 12px !important;
            border-radius: 16px !important;
          }
          .grocery_search_head {
            display: block !important;
          }
          .grocery_search_title {
            margin-bottom: 8px !important;
          }
          .grocery_search_tools {
            display: flex !important;
            gap: 8px !important;
            flex-wrap: wrap !important;
            align-items: center !important;
          }
          .grocery_search_meta {
            margin-top: 8px !important;
            display: grid !important;
            grid-template-columns: 1fr !important;
            gap: 8px !important;
            align-items: start !important;
          }
          .grocery_search_count {
            margin-left: 0 !important;
          }
          .grocery_search_inputs {
            margin-top: 8px !important;
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 8px !important;
          }
          .grocery_search_input_main {
            grid-column: 1 / -1 !important;
          }
          .grocery_search_select {
            min-width: 0 !important;
          }
          .grocery_search_toggles {
            margin-top: 10px !important;
          }

          .grocery_items_grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 10px !important;
            margin-left: -16px !important;
            margin-right: -16px !important;
            width: calc(100% + 20px) !important;
          }
          .grocery_item_card {
            border-radius: 18px !important;
          }
          .grocery_item_media {
            height: 138px !important;
          }
          .grocery_top_badges {
            top: 8px !important;
            left: 8px !important;
            right: 8px !important;
            gap: 6px !important;
          }
          .grocery_badge_price,
          .grocery_badge_category {
            padding: 5px 9px !important;
            font-size: 10px !important;
            line-height: 1.15 !important;
          }
          .grocery_badge_category {
            max-width: 62% !important;
            white-space: nowrap !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
          }
          .grocery_tap_hint {
            display: none !important;
          }
          .grocery_item_body {
            padding: 12px !important;
          }
          .grocery_item_title {
            font-size: 16px !important;
            line-height: 1.12 !important;
            font-weight: 1000 !important;
            letter-spacing: -0.3px !important;
            display: -webkit-box !important;
            -webkit-line-clamp: 3 !important;
            -webkit-box-orient: vertical !important;
            overflow: hidden !important;
            min-height: 54px !important;
          }
          .grocery_item_desc {
            font-size: 11px !important;
            line-height: 1.35 !important;
          }
          .grocery_stock_pill_in {
            display: none !important;
          }
          .grocery_stock_pill_out {
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            padding: 5px 10px !important;
            font-size: 11px !important;
            font-weight: 950 !important;
          }
          .grocery_item_actions {
            margin-top: 10px !important;
            gap: 8px !important;
          }
          .grocery_btn_add,
          .grocery_btn_details {
            padding: 8px 10px !important;
            font-size: 11px !important;
          }
          .grocery_btn_details {
            padding: 7px 10px !important;
          }

          .grocery_modal_backdrop {
            align-items: flex-end !important;
            padding: 0 !important;
            background: rgba(15, 23, 42, 0.45) !important;
          }
          .grocery_modal_card {
            width: 100% !important;
            max-height: 88vh !important;
            overflow-y: auto !important;
            border-radius: 20px 20px 0 0 !important;
            padding: 12px !important;
            box-shadow: 0 -18px 44px rgba(0, 0, 0, 0.22) !important;
          }
          .grocery_modal_head {
            position: sticky;
            top: 0;
            z-index: 2;
            background: rgba(255, 255, 255, 0.92);
            backdrop-filter: blur(8px);
            border-bottom: 1px solid rgba(0, 0, 0, 0.06);
            padding-bottom: 8px;
            margin-bottom: 8px;
          }
          .grocery_modal_title {
            font-size: 24px !important;
            line-height: 1.08 !important;
            letter-spacing: -0.4px !important;
          }
          .grocery_modal_grid {
            grid-template-columns: 1fr !important;
            gap: 10px !important;
          }
          .grocery_modal_img {
            height: 190px !important;
            border-radius: 14px !important;
          }
          .grocery_modal_price {
            font-size: 34px !important;
            line-height: 1 !important;
            letter-spacing: -0.6px !important;
          }
          .grocery_modal_meta {
            font-size: 12px !important;
          }
          .grocery_modal_desc {
            font-size: 13px !important;
            line-height: 1.35 !important;
          }
          .grocery_modal_actions {
            margin-top: 12px !important;
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 8px !important;
            align-items: stretch !important;
          }
          .grocery_modal_add,
          .grocery_modal_cart {
            width: 100% !important;
            justify-content: center !important;
            text-align: center !important;
            padding: 11px 10px !important;
            font-size: 13px !important;
          }
        }
      `}</style>

      {/*  Drawer overlay for mobile */}
      {catDrawerOpen ? (
        <div
          style={drawerOverlay}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setCatDrawerOpen(false);
          }}
        >
          <div style={drawerSheet}>{CategoriesPanel}</div>
        </div>
      ) : null}

      <div style={{ width: "100%", margin: 0 }}>
        {/* HERO */}
        <div style={heroWrap} className="grocery_store_hero">
          <div style={heroLeft} className="grocery_store_hero_left">
            <div style={pill}>Groceries</div>
            <h1 style={heroTitle} className="grocery_store_title">
              {store?.name || "Grocery Store"}
            </h1>
            <div style={subText} className="grocery_store_sub">
              In {store?.city || "City not set"}
            </div>

            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }} className="grocery_store_actions">
              <button onClick={() => router.push("/groceries")} style={btnLight}>
                Stores
              </button>
              <button onClick={loadAll} style={btnDark} disabled={loading}>
                Refresh
              </button>
              <Link href="/cart" style={btnLight}>
                Cart {cartCount > 0 ? `(${cartCount})` : ""}
              </Link>
            </div>
          </div>
          <div style={heroRight} className="grocery_store_hero_right">
            <div style={infoCard} className="grocery_store_info">
              <div style={{ fontWeight: 1000, color: "#0b1220" }} className="grocery_store_info_title">
                Snapshot
              </div>
              <div style={infoRow} className="grocery_store_info_row">
                <span style={miniPill} className="grocery_store_chip">
                  Items {stats.total}
                </span>
                <span style={miniPill} className="grocery_store_chip">
                  Stock {stats.inS}
                </span>
                <span style={miniPill} className="grocery_store_chip">
                  Best {stats.best}
                </span>
                <span style={storeOpen ? openPill : closedPill} className="grocery_store_chip">
                  {storeOpen ? "Open" : "Closed"}
                </span>
              </div>

              {!storeOpen ? <div style={alertMini}>Store is not accepting orders right now (or pending/disabled).</div> : null}
            </div>
          </div>
        </div>

        {errMsg ? <div style={alertErr}>{errMsg}</div> : null}

        <div style={panelGlass}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 1000, color: "#0b1220" }}>Customer Reviews</div>
              <div style={{ marginTop: 4, color: "rgba(17,24,39,0.65)", fontWeight: 800, fontSize: 13 }}>
                {reviewSummary.count
                  ? `${reviewSummary.averageText}/5 from ${reviewSummary.count} customer review${reviewSummary.count === 1 ? "" : "s"}`
                  : "No reviews yet. Delivered customers can add the first review from their grocery orders page."}
              </div>
            </div>
            {reviewSummary.count ? (
              <div style={reviewScorePill}>
                <div style={{ fontWeight: 1000, color: "#0b1220" }}>{reviewSummary.averageText}</div>
                {renderReviewStars(reviewSummary.average, 13)}
              </div>
            ) : null}
          </div>

          {reviewsLoading ? (
            <div style={{ marginTop: 12, color: "rgba(17,24,39,0.65)", fontWeight: 800 }}>Loading reviews...</div>
          ) : storeReviews.length ? (
            <div style={reviewScrollList}>
              {storeReviews.map((review) => (
                <div key={review.id} style={reviewCard}>
                  <div style={reviewRowTop}>
                    <div style={reviewerName}>{reviewerDisplayName(review)}</div>
                    <div style={reviewTopMeta}>
                      {renderReviewStars(review.rating, 14)}
                      <span style={reviewDateText}>{new Date(review.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {review.title ? <div style={reviewTitle}>{review.title}</div> : null}
                  {review.comment ? <div style={reviewComment}>{review.comment}</div> : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {/*  NEW LAYOUT */}
        <div className="grocery_layout" style={layoutWrap}>
          <aside className="grocery_sidebar" style={sidebarDesktop}>
            {CategoriesPanel}
          </aside>

          <section style={{ minWidth: 0 }}>
            {/* FILTER BAR */}
            <div style={panelGlass} className="grocery_search_panel">
              <div
                style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}
                className="grocery_search_head"
              >
                <div style={{ fontWeight: 1000, color: "#0b1220" }} className="grocery_search_title">
                  Search
                </div>

                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }} className="grocery_search_tools">
                  <button className="grocery_catbtn" onClick={() => setCatDrawerOpen(true)} style={btnCatMobile} title="Open categories">
                    Categories
                  </button>

                  <button onClick={clearFilters} style={btnGhost}>
                    Clear
                  </button>
                </div>
              </div>

              <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }} className="grocery_search_meta">
                <span style={crumbPill}>Category: {activeCategoryTitle}</span>
                {activeSubTitle ? <span style={crumbPill}>Sub: {activeSubTitle}</span> : null}

                <span style={{ marginLeft: "auto", fontWeight: 900, color: "rgba(17,24,39,0.65)", fontSize: 12 }} className="grocery_search_count">
                  Showing <b>{processed.length}</b> item(s)
                </span>
              </div>

              <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1.4fr 0.6fr 0.6fr", gap: 10 }} className="grocery_search_inputs">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search items..."
                  style={input}
                  autoComplete="off"
                  className="grocery_search_input_main"
                />

                <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={input} className="grocery_search_select">
                  <option value="recommended">Sort: Recommended</option>
                  <option value="newest">Sort: Newest</option>
                  <option value="az">Sort: A-Z</option>
                  <option value="price_asc">Sort: Price (Low to High)</option>
                  <option value="price_desc">Sort: Price (High to Low)</option>
                </select>

                <select value={String(priceCap)} onChange={(e) => setPriceCap(Number(e.target.value || 0))} style={input} className="grocery_search_select">
                  <option value="0">Price: Any</option>
                  <option value="99">Under Rs 99</option>
                  <option value="199">Under Rs 199</option>
                  <option value="299">Under Rs 299</option>
                  <option value="499">Under Rs 499</option>
                </select>
              </div>

              <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }} className="grocery_item_actions grocery_search_toggles">
                <button onClick={() => setOnlyBest((v) => !v)} style={onlyBest ? chipOn : chipOff}>
                  Bestseller
                </button>
                <button onClick={() => setOnlyInStock((v) => !v)} style={onlyInStock ? chipOn : chipOff}>
                  In stock
                </button>
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
            {loading ? <div style={{ marginTop: 14, fontWeight: 900, color: "rgba(17,24,39,0.7)" }}>Loading...</div> : null}

            {!loading && processed.length === 0 ? <div style={emptyBox}>No items found. Try clearing filters.</div> : null}

            {!loading && processed.length > 0 ? (
              <div style={grid} className="grocery_items_grid">
                {processed.map((it) => {
                  const itemQty = cartQtyMap.get(String(it?.id || "")) || 0;

                  return (
                    <div key={it.id} style={cardGlass} className="grocery_item_card">
                      <div style={imgWrap} className="grocery_item_media" onClick={() => openDetails(it)} title="Tap for details">
                        {it.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={it.image_url} alt={it.name} style={img} />
                        ) : (
                          <div style={imgPlaceholder}>No Image</div>
                        )}

                        <div style={topBadges} className="grocery_top_badges">
                          <span style={badgeDark} className="grocery_badge_price">
                            {money(getItemPrice(it, currency), currency)}
                          </span>
                          <span style={badgeLight} className="grocery_badge_category">
                            {displayCategoryLabel(it)}
                          </span>
                        </div>

                        <div style={tapHint} className="grocery_tap_hint">
                          Tap for details
                        </div>
                      </div>

                      <div style={{ padding: 12 }} className="grocery_item_body">
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                          <div style={{ fontSize: 15, fontWeight: 1000, color: "#0b1220", flex: 1, minWidth: 0 }} className="grocery_item_title">
                            {it.name || "Item"}
                          </div>
                          <span
                            style={it.in_stock ? openPill : closedPill}
                            className={it.in_stock ? "grocery_stock_pill_in" : "grocery_stock_pill_out"}
                          >
                            {it.in_stock ? "In stock" : "Out of stock"}
                          </span>
                        </div>

                        {it.description ? (
                          <div style={{ marginTop: 6, fontSize: 12, fontWeight: 850, color: "rgba(17,24,39,0.68)" }} className="grocery_item_desc">
                            {clampText(it.description, 80)}
                          </div>
                        ) : null}

                        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {displaySubcategoryLabel(it) ? <span style={tag}>{displaySubcategoryLabel(it)}</span> : null}
                          {it.is_best_seller ? <span style={tagStrong}>Best</span> : null}
                          {it.is_recommended ? <span style={tagStrong}>Rec</span> : null}
                          {isTaxableGrocery(it) ? <span style={tagStrong}>TAXABLE</span> : null}
                        </div>

                        <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }} className="grocery_item_actions">
                          {itemQty > 0 ? (
                            <div style={qtyBox}>
                              <button onClick={() => removeFromCart(it)} style={qtyBtn}>
                                -
                              </button>
                              <div style={{ fontWeight: 1000 }}>{itemQty}</div>
                              <button onClick={() => addToCart(it)} style={qtyBtn} disabled={!storeOpen || !it?.in_stock}>
                                +
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => addToCart(it)}
                              style={btnAdd}
                              className="grocery_btn_add"
                              disabled={!storeOpen || !it?.in_stock}
                              title={!storeOpen ? "Store closed" : !it?.in_stock ? "Out of stock" : "Add to cart"}
                            >
                              + Add to Cart
                            </button>
                          )}

                          <button onClick={() => openDetails(it)} style={btnGhost} className="grocery_btn_details">
                            Details
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </section>
        </div>

        {/* DETAILS MODAL (OLD WORK KEPT) */}
        {detailsOpen ? (
          <div style={modalBackdrop} className="grocery_modal_backdrop" onClick={() => setDetailsOpen(false)}>
            <div style={modalCard} className="grocery_modal_card" onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }} className="grocery_modal_head">
                <div style={{ fontWeight: 1000, fontSize: 16, color: "#0b1220" }} className="grocery_modal_title">
                  {activeItem?.name || "Item details"}
                </div>
                <button onClick={() => setDetailsOpen(false)} style={btnClose}>
                  X
                </button>
              </div>

              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }} className="grocery_modal_grid">
                <div style={modalImgWrap} className="grocery_modal_img">
                  {activeItem?.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={activeItem.image_url} alt={activeItem.name} style={modalImg} />
                  ) : (
                    <div style={imgPlaceholder}>No Image</div>
                  )}
                </div>

                <div>
                  <div style={{ fontWeight: 1000, fontSize: 18, color: "#0b1220" }} className="grocery_modal_price">
                    {money(getItemPrice(activeItem, currency), currency)}
                  </div>

                  <div style={{ marginTop: 8, fontWeight: 900, color: "rgba(17,24,39,0.7)" }} className="grocery_modal_meta">
                    Category: {activeItem ? displayCategoryLabel(activeItem) : "General"}
                  </div>

                  {activeItem && displaySubcategoryLabel(activeItem) ? (
                    <div style={{ marginTop: 6, fontWeight: 900, color: "rgba(17,24,39,0.65)", fontSize: 13 }} className="grocery_modal_meta">
                      Subcategory: {displaySubcategoryLabel(activeItem)}
                    </div>
                  ) : null}

                  <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span style={activeItem?.in_stock ? openPill : closedPill}>{activeItem?.in_stock ? "In stock" : "Out of stock"}</span>
                    {activeItem?.is_best_seller ? <span style={tagStrong}>Best</span> : null}
                    {activeItem?.is_recommended ? <span style={tagStrong}>Rec</span> : null}
                    {activeItem ? (isTaxableGrocery(activeItem) ? <span style={tagStrong}>TAXABLE</span> : null) : null}
                  </div>

                  {activeItem?.description ? (
                    <div style={{ marginTop: 12, fontWeight: 850, color: "rgba(17,24,39,0.75)" }} className="grocery_modal_desc">
                      {activeItem.description}
                    </div>
                  ) : (
                    <div style={{ marginTop: 12, fontWeight: 850, color: "rgba(17,24,39,0.55)" }} className="grocery_modal_desc">
                      No description added.
                    </div>
                  )}

                  <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }} className="grocery_modal_actions">
                    {(cartQtyMap.get(String(activeItem?.id || "")) || 0) > 0 ? (
                      <div style={qtyBox}>
                        <button onClick={() => removeFromCart(activeItem)} style={qtyBtn}>
                          -
                        </button>
                        <div style={{ fontWeight: 1000 }}>{cartQtyMap.get(String(activeItem?.id || "")) || 0}</div>
                        <button onClick={() => addToCart(activeItem)} style={qtyBtn} disabled={!storeOpen || !activeItem?.in_stock}>
                          +
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => addToCart(activeItem)} style={btnAdd} className="grocery_modal_add" disabled={!storeOpen || !activeItem?.in_stock}>
                        + Add to Cart
                      </button>
                    )}
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
   Helpers
   ========================= */
function clean(v) {
  return String(v || "").trim();
}
function lower(v) {
  return clean(v).toLowerCase();
}

/* =========================
    Currency Helpers (SAFE)
   ========================= */
const DEFAULT_CURRENCY = "INR";

function normalizeCurrency(c) {
  const v = String(c || "").trim().toUpperCase();
  if (v === "USD") return "USD";
  if (v === "INR") return "INR";
  return DEFAULT_CURRENCY;
}

function money(v, currency = DEFAULT_CURRENCY) {
  const n = Number(v || 0);
  if (!isFinite(n)) return currency === "USD" ? "$0.00" : "Rs 0";

  const cur = normalizeCurrency(currency);
  const fractionDigits = cur === "INR" ? 0 : 2;

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: cur,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(n);
  } catch {
    const fixed = n.toFixed(fractionDigits);
    return cur === "USD" ? `$${fixed}` : `Rs ${Number(fixed).toFixed(0)}`;
  }
}

function clampText(s, max = 90) {
  const str = String(s ?? "");
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + "...";
}
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/* =========================
   Cart (localStorage)
   ========================= */
const CART_KEY = "cart_items";

function readCart() {
  try {
    const a = localStorage.getItem(CART_KEY);
    if (a) return JSON.parse(a);

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
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  try {
    localStorage.setItem("grocery_cart_items", JSON.stringify(items));
  } catch {}
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

const btnCatMobile = {
  ...btnGhost,
  display: "none",
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

/*  Layout + sidebar */
const layoutWrap = {
  marginTop: 14,
  display: "grid",
  gridTemplateColumns: "280px 1fr",
  gap: 12,
  alignItems: "start",
};

const sidebarDesktop = {
  position: "sticky",
  top: 86,
  alignSelf: "start",
};

/*  Categories panel */
const catPanel = {
  borderRadius: 18,
  padding: 14,
  background: "rgba(255,255,255,0.76)",
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 12px 36px rgba(0,0,0,0.07)",
  backdropFilter: "blur(10px)",
};

const catItemBase = {
  width: "100%",
  textAlign: "left",
  padding: "10px 12px",
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(255,255,255,0.85)",
  cursor: "pointer",
  fontWeight: 950,
  color: "rgba(17,24,39,0.88)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
};

const catItemOn = {
  ...catItemBase,
  border: "1px solid rgba(17,24,39,0.18)",
  background: "rgba(17,24,39,0.92)",
  color: "#fff",
  boxShadow: "0 10px 22px rgba(17,24,39,0.14)",
};

const catItemOff = { ...catItemBase };

const subItemBase = {
  width: "100%",
  textAlign: "left",
  padding: "9px 12px",
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(255,255,255,0.80)",
  cursor: "pointer",
  fontWeight: 900,
  color: "rgba(17,24,39,0.82)",
};

const subItemOn = {
  ...subItemBase,
  border: "1px solid rgba(16,185,129,0.30)",
  background: "rgba(236,253,245,0.92)",
  color: "#065f46",
};

const subItemOff = { ...subItemBase };

const catChevron = {
  fontWeight: 1000,
  opacity: 0.8,
};

const crumbPill = {
  fontSize: 12,
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(255,255,255,0.85)",
  fontWeight: 900,
  color: "rgba(17,24,39,0.78)",
};

const btnCloseSmall = {
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.85)",
  borderRadius: 12,
  padding: "6px 10px",
  cursor: "pointer",
  fontWeight: 950,
};

/*  Drawer */
const drawerOverlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(17,24,39,0.45)",
  zIndex: 9999,
  display: "grid",
  placeItems: "end center",
  padding: 12,
};

const drawerSheet = {
  width: "min(520px, 100%)",
  borderRadius: 18,
  overflow: "hidden",
  boxShadow: "0 24px 70px rgba(0,0,0,0.35)",
};

const reviewCard = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(15,23,42,0.1)",
  background: "rgba(255,255,255,0.95)",
};

const reviewScorePill = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "7px 12px",
  borderRadius: 999,
  border: "1px solid rgba(15,23,42,0.12)",
  background: "rgba(255,255,255,0.95)",
};

const reviewScrollList = {
  marginTop: 10,
  display: "grid",
  gap: 8,
  maxHeight: 112,
  overflowY: "auto",
  paddingRight: 4,
};

const reviewRowTop = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
  flexWrap: "wrap",
};

const reviewerName = {
  fontWeight: 900,
  color: "#0b1220",
};

const reviewTopMeta = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
};

const reviewDateText = {
  color: "rgba(17,24,39,0.6)",
  fontWeight: 800,
  fontSize: 12,
};

const reviewTitle = {
  marginTop: 4,
  fontWeight: 850,
  color: "#0b1220",
  fontSize: 14,
};

const reviewComment = {
  marginTop: 4,
  color: "rgba(17,24,39,0.76)",
  lineHeight: 1.4,
  fontWeight: 700,
  fontSize: 13,
};