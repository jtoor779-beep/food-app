"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import supabase from "@/lib/supabase";

/* =========================================================
   ✅ CURRENCY SUPPORT (SAFE, NO OLD LOGIC CHANGED)
   - Default stays INR (preserve old behavior)
   - If localStorage "foodapp_currency" is set to "USD",
     this page will format prices in USD.
   ========================================================= */

const DEFAULT_CURRENCY = "INR";

function normalizeCurrency(c) {
  const v = String(c || "").trim().toUpperCase();
  if (v === "USD") return "USD";
  if (v === "INR") return "INR";
  return DEFAULT_CURRENCY;
}

function money(v, currency = DEFAULT_CURRENCY) {
  const n = Number(v || 0);
  if (!isFinite(n)) return currency === "USD" ? "$0.00" : "₹0";

  const cur = normalizeCurrency(currency);

  // Preserve OLD look: INR had no decimals (₹123)
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
    return cur === "USD" ? `$${fixed}` : `₹${Number(fixed).toFixed(0)}`;
  }
}

/* =========================
   ✅ Suspense Wrapper (Next.js build fix)
   ========================= */
export default function GroceryProductPage() {
  return (
    <Suspense
      fallback={
        <main style={pageBg}>
          <div style={{ maxWidth: 980, margin: "0 auto", fontWeight: 900, color: "rgba(17,24,39,0.7)" }}>
            Loading product…
          </div>
        </main>
      }
    >
      <GroceryProductInner />
    </Suspense>
  );
}

function GroceryProductInner() {
  const router = useRouter();
  const params = useSearchParams();

  const storeId = clean(params.get("store_id"));
  const itemId = clean(params.get("item_id"));

  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState("");

  const [store, setStore] = useState(null);
  const [item, setItem] = useState(null);

  const [categories, setCategories] = useState([]); // grocery_categories
  const [subcategories, setSubcategories] = useState([]); // grocery_subcategories

  const [similar, setSimilar] = useState([]);

  // cart
  const [cartCount, setCartCount] = useState(0);

  // ✅ Currency state (reads localStorage)
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);
  const [isPhone, setIsPhone] = useState(false);

  // ✅ Image Viewer (Zoom)
  const [viewerOpen, setViewerOpen] = useState(false);

  // zoom state
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);

  const viewerRef = useRef(null);
  const pointersRef = useRef(new Map()); // pointerId -> {x,y}
  const pinchStartRef = useRef({ dist: 0, scale: 1, midX: 0, midY: 0 });
  const panStartRef = useRef({ x: 0, y: 0, tx: 0, ty: 0 });

  /* =========================================================
     ✅ NEW: Weight / Variant options (Customer Side)
     - Loads from table: grocery_item_variants
     - If table doesn't exist, everything still works with base price
     ========================================================= */
  const [variants, setVariants] = useState([]); // [{id,label,unit,value,price,in_stock,is_default,sort_order}]
  const [variantsReady, setVariantsReady] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState("");

  useEffect(() => {
    const onResize = () => {
      setIsPhone(typeof window !== "undefined" ? window.innerWidth <= 680 : false);
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ✅ read currency preference once (and listen for changes too)
  useEffect(() => {
    const read = () => {
      try {
        const c = localStorage.getItem("foodapp_currency");
        setCurrency(normalizeCurrency(c));
      } catch {
        setCurrency(DEFAULT_CURRENCY);
      }
    };
    read();

    // keep updated if any other page updates currency and dispatches storage/CART evt
    const onStorage = () => read();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function refreshCartCount() {
    const c = readCart();
    const count = (c || []).reduce((sum, it) => sum + (Number(it?.qty || 0) || 0), 0);
    setCartCount(count);
  }

  // maps
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

  function displayCategoryLabel(it) {
    const catName = clean(catMap.get(String(it?.category_id || ""))?.name);
    return catName || clean(it?.category) || "General";
  }

  function legacySubName(it) {
    return clean(it?.subcategory) || clean(it?.sub_category) || clean(it?.subCategory) || clean(it?.subcategory_name) || "";
  }

  function displaySubcategoryLabel(it) {
    const subName = clean(subMap.get(String(it?.subcategory_id || ""))?.name);
    if (subName) return subName;
    const leg = legacySubName(it);
    return leg || "";
  }

  const storeOpen = useMemo(() => {
    if (!store) return false;
    if (store?.is_disabled) return false;
    const a = String(store?.approval_status || "approved").toLowerCase();
    if (a && a !== "approved") return false;
    if (typeof store?.accepting_orders === "boolean") return !!store.accepting_orders;
    return true;
  }, [store]);

  // ✅ normalize taxable from item row (default true)
  function isTaxableRow(it) {
    if (typeof it?.is_taxable === "boolean") return it.is_taxable;
    const s = String(it?.is_taxable ?? it?.taxable ?? "").toLowerCase();
    if (s === "false" || s === "0" || s === "no") return false;
    return true;
  }

  const selectedVariant = useMemo(() => {
    if (!variantsReady) return null;
    if (!selectedVariantId) return null;
    return (variants || []).find((v) => String(v?.id) === String(selectedVariantId)) || null;
  }, [variants, selectedVariantId, variantsReady]);

  // ✅ effective price shown + used for cart
  const effectivePrice = useMemo(() => {
    const base = num(item?.price);
    if (selectedVariant && Number.isFinite(num(selectedVariant?.price))) {
      return num(selectedVariant.price);
    }
    return base;
  }, [item, selectedVariant]);

  async function loadItemVariantsSafe(itmId) {
    setVariants([]);
    setVariantsReady(false);
    setSelectedVariantId("");

    if (!itmId) {
      setVariantsReady(true);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("grocery_item_variants")
        .select("id, item_id, label, unit, value, price, in_stock, is_default, sort_order, created_at")
        .eq("item_id", itmId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) throw error;

      const list = Array.isArray(data) ? data : [];
      const mapped = list.map((v, idx) => ({
        id: v.id,
        label: clean(v.label),
        unit: clean(v.unit) || "lb",
        value: Number(v.value || 0) || 0,
        price: Number(v.price || 0) || 0,
        in_stock: typeof v.in_stock === "boolean" ? v.in_stock : true,
        is_default: !!v.is_default,
        sort_order: Number(v.sort_order ?? idx) || idx,
      }));

      // keep only valid rows
      const cleaned = mapped.filter((x) => !!x.id && !!clean(x.label));

      // choose default selection:
      // 1) row with is_default
      // 2) first in-stock
      // 3) first row
      let defaultId = "";
      const def = cleaned.find((x) => !!x.is_default);
      if (def?.id) defaultId = String(def.id);
      if (!defaultId) {
        const inS = cleaned.find((x) => !!x.in_stock);
        if (inS?.id) defaultId = String(inS.id);
      }
      if (!defaultId && cleaned[0]?.id) defaultId = String(cleaned[0].id);

      setVariants(cleaned);
      setSelectedVariantId(defaultId);
    } catch (e) {
      // If variants table missing or RLS, we don't break the product page.
      setVariants([]);
      setSelectedVariantId("");
    } finally {
      setVariantsReady(true);
    }
  }

  async function loadAll() {
    setErrMsg("");
    setLoading(true);

    try {
      if (!storeId || !itemId) {
        setErrMsg("Product not found. Please go back and open again.");
        setLoading(false);
        return;
      }

      // store
      const { data: s, error: sErr } = await supabase
        .from("grocery_stores")
        .select("id, name, city, image_url, accepting_orders, approval_status, is_disabled")
        .eq("id", storeId)
        .maybeSingle();
      if (sErr) throw sErr;
      setStore(s || null);

      // categories
      const { data: cats, error: cErr } = await supabase
        .from("grocery_categories")
        .select("id, store_id, name, slug, sort_order, is_active")
        .eq("store_id", storeId)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (cErr) throw cErr;
      setCategories(Array.isArray(cats) ? cats.filter((x) => x?.is_active !== false) : []);

      // subcategories
      const { data: subs, error: scErr } = await supabase
        .from("grocery_subcategories")
        .select("id, store_id, category_id, name, slug, sort_order, is_active")
        .eq("store_id", storeId)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (scErr) throw scErr;
      setSubcategories(Array.isArray(subs) ? subs.filter((x) => x?.is_active !== false) : []);

      // item (try with is_taxable safely)
      const selectWithTax =
        "id, store_id, name, description, price, image_url, category, category_id, subcategory_id, is_available, in_stock, is_veg, is_best_seller, is_recommended, is_taxable, created_at";

      const selectNoTax =
        "id, store_id, name, description, price, image_url, category, category_id, subcategory_id, is_available, in_stock, is_veg, is_best_seller, is_recommended, created_at";

      let it = null;
      let itErr = null;

      const r1 = await supabase.from("grocery_items").select(selectWithTax).eq("store_id", storeId).eq("id", itemId).maybeSingle();

      it = r1.data;
      itErr = r1.error;

      if (itErr) {
        const msg = String(itErr?.message || "").toLowerCase();
        if (msg.includes("is_taxable") && (msg.includes("does not exist") || msg.includes("column") || msg.includes("unknown"))) {
          const r2 = await supabase.from("grocery_items").select(selectNoTax).eq("store_id", storeId).eq("id", itemId).maybeSingle();
          if (r2.error) throw r2.error;
          it = r2.data;
        } else {
          throw itErr;
        }
      }

      if (!it || !it?.is_available) {
        setItem(null);
        setSimilar([]);
        setErrMsg("This item is not available.");
        setLoading(false);
        refreshCartCount();
        return;
      }

      setItem(it);

      // ✅ load variants for customer (safe)
      await loadItemVariantsSafe(it?.id);

      // similar items: same category_id first, fallback to legacy text category
      const { data: all, error: allErr } = await supabase
        .from("grocery_items")
        .select(
          "id, store_id, name, description, price, image_url, category, category_id, subcategory_id, is_available, in_stock, is_best_seller, is_recommended, created_at"
        )
        .eq("store_id", storeId)
        .order("created_at", { ascending: false });

      if (allErr) throw allErr;

      const list = Array.isArray(all) ? all.filter((x) => !!x?.is_available && String(x?.id) !== String(itemId)) : [];

      const cid = it?.category_id ? String(it.category_id) : "";
      const legacyCat = clean(it?.category).toLowerCase();

      let sim = [];
      if (cid) {
        sim = list.filter((x) => String(x?.category_id || "") === cid);
      } else if (legacyCat) {
        sim = list.filter((x) => clean(x?.category).toLowerCase() === legacyCat);
      } else {
        sim = list;
      }

      // rank similar: best + recommended + in stock + newest
      sim.sort((a, b) => {
        const ar = (a?.is_best_seller ? 20 : 0) + (a?.is_recommended ? 10 : 0) + (a?.in_stock ? 3 : 0);
        const br = (b?.is_best_seller ? 20 : 0) + (b?.is_recommended ? 10 : 0) + (b?.in_stock ? 3 : 0);
        if (br !== ar) return br - ar;
        return new Date(b?.created_at || 0) - new Date(a?.created_at || 0);
      });

      setSimilar(sim.slice(0, 10));
    } catch (e) {
      setErrMsg(e?.message || String(e));
      setStore(null);
      setItem(null);
      setSimilar([]);
      setVariants([]);
      setVariantsReady(false);
      setSelectedVariantId("");
    } finally {
      setLoading(false);
      refreshCartCount();
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, itemId]);

  useEffect(() => {
    refreshCartCount();
    const onStorage = () => refreshCartCount();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // ✅ Close viewer on ESC + lock scroll when open
  useEffect(() => {
    if (!viewerOpen) return;

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKey(e) {
      if (e.key === "Escape") setViewerOpen(false);
    }
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [viewerOpen]);

  function addToCart(prod) {
    if (!prod?.id) return;

    const cart = readCart() || [];

    // ✅ Build cart key: base item OR (item+variant) so different weights become different cart lines
    const vId = selectedVariant?.id ? String(selectedVariant.id) : "";
    const cartKey = vId ? `${prod.id}__v__${vId}` : String(prod.id);

    const idx = cart.findIndex((x) => String(x?.cart_key || x?.id) === String(cartKey));

    const unitPrice = effectivePrice;

    if (idx >= 0) {
      cart[idx].qty = (Number(cart[idx].qty || 0) || 0) + 1;
      // keep unit price consistent
      cart[idx].unit_price = num(unitPrice);
      if (vId) {
        cart[idx].variant_id = vId;
        cart[idx].variant_label = clean(selectedVariant?.label);
        cart[idx].variant_unit = clean(selectedVariant?.unit);
        cart[idx].variant_value = Number(selectedVariant?.value || 0) || 0;
        cart[idx].variant_in_stock = typeof selectedVariant?.in_stock === "boolean" ? selectedVariant.in_stock : true;
      }
    } else {
      const catName = displayCategoryLabel(prod) || prod.category || "General";

      cart.push({
        // legacy compatibility:
        id: prod.id,

        // ✅ new unique key to support multiple weights
        cart_key: cartKey,

        store_id: prod.store_id,
        name: prod.name,
        price: num(prod.price), // keep original base price stored too (safe)
        unit_price: num(unitPrice), // ✅ IMPORTANT: actual price used for totals

        image_url: prod.image_url || "",
        category: catName,
        qty: 1,
        item_type: "grocery",

        // ✅ tax flag for cart (default true)
        is_taxable: isTaxableRow(prod),

        // ✅ variant info (optional)
        variant_id: vId || "",
        variant_label: vId ? clean(selectedVariant?.label) : "",
        variant_unit: vId ? clean(selectedVariant?.unit) : "",
        variant_value: vId ? Number(selectedVariant?.value || 0) || 0 : 0,
      });
    }

    writeCart(cart);
    refreshCartCount();
  }

  function goToProduct(prod) {
    const sid = encodeURIComponent(String(storeId || prod?.store_id || ""));
    const iid = encodeURIComponent(String(prod?.id || ""));
    if (!sid || !iid) return;
    router.push(`/groceries/product?store_id=${sid}&item_id=${iid}`);
  }

  // =========================
  // ✅ Image Viewer Controls
  // =========================
  function openViewer() {
    // reset every time open
    setScale(1);
    setTx(0);
    setTy(0);
    pointersRef.current = new Map();
    setViewerOpen(true);
  }

  function closeViewer() {
    setViewerOpen(false);
    setScale(1);
    setTx(0);
    setTy(0);
    pointersRef.current = new Map();
  }

  function resetZoom() {
    setScale(1);
    setTx(0);
    setTy(0);
    pointersRef.current = new Map();
  }

  function clampScale(v) {
    const min = 1;
    const max = 4;
    return Math.max(min, Math.min(max, v));
  }

  function getDist(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function getMid(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  function onViewerPointerDown(e) {
    const el = viewerRef.current;
    if (!el) return;

    // allow dragging even if user starts on image
    try {
      el.setPointerCapture?.(e.pointerId);
    } catch {}

    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const pts = Array.from(pointersRef.current.values());
    if (pts.length === 2) {
      const d = getDist(pts[0], pts[1]);
      const mid = getMid(pts[0], pts[1]);
      pinchStartRef.current = { dist: d || 1, scale: scale || 1, midX: mid.x, midY: mid.y };
    } else if (pts.length === 1) {
      panStartRef.current = { x: e.clientX, y: e.clientY, tx, ty };
    }
  }

  function onViewerPointerMove(e) {
    if (!viewerOpen) return;
    if (!pointersRef.current.has(e.pointerId)) return;

    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = Array.from(pointersRef.current.values());

    // pinch zoom
    if (pts.length === 2) {
      const start = pinchStartRef.current;
      const d = getDist(pts[0], pts[1]);
      const nextScale = clampScale(start.scale * (d / (start.dist || 1)));
      setScale(nextScale);
      return;
    }

    // pan (only if zoomed)
    if (pts.length === 1) {
      if ((scale || 1) <= 1) return;
      const start = panStartRef.current;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      setTx(start.tx + dx);
      setTy(start.ty + dy);
    }
  }

  function onViewerPointerUp(e) {
    pointersRef.current.delete(e.pointerId);

    const pts = Array.from(pointersRef.current.values());
    // if still one pointer after pinch, reset pan start
    if (pts.length === 1) {
      panStartRef.current = { x: pts[0].x, y: pts[0].y, tx, ty };
    }
  }

  function onViewerWheel(e) {
    // desktop zoom
    e.preventDefault();
    const delta = e.deltaY;
    const step = delta > 0 ? -0.12 : 0.12;
    const next = clampScale((scale || 1) + step);
    setScale(next);
    if (next <= 1) {
      setTx(0);
      setTy(0);
    }
  }

  const canAddThis = useMemo(() => {
    if (!storeOpen) return false;
    if (!item?.in_stock) return false;

    // if variants exist, selected variant must be in stock
    if ((variants || []).length > 0) {
      if (!variantsReady) return false;
      const v = selectedVariant;
      if (!v) return false;
      if (typeof v?.in_stock === "boolean" && !v.in_stock) return false;
    }
    return true;
  }, [storeOpen, item, variants, selectedVariant, variantsReady]);

  const productWrapView = isPhone
    ? {
        ...productWrap,
        gridTemplateColumns: "1fr",
        padding: 12,
        gap: 10,
        borderRadius: 16,
      }
    : productWrap;

  const productImgWrapView = isPhone
    ? {
        ...productImgWrap,
        height: 260,
        padding: 8,
        borderRadius: 14,
      }
    : productImgWrap;

  const zoomHintPillView = isPhone
    ? {
        ...zoomHintPill,
        left: "50%",
        transform: "translateX(-50%)",
        bottom: 10,
        fontSize: 11,
      }
    : zoomHintPill;

  const productInfoWrapView = isPhone ? { minWidth: 0 } : { minWidth: 260 };

  const productHeadRowView = isPhone
    ? {
        display: "grid",
        gap: 8,
      }
    : {
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        alignItems: "flex-start",
      };

  const productPriceColView = isPhone
    ? {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
      }
    : {
        display: "grid",
        gap: 8,
        justifyItems: "end",
      };

  const similarWrapView = isPhone
    ? {
        marginTop: 10,
        display: "flex",
        gap: 10,
        overflowX: "auto",
        WebkitOverflowScrolling: "touch",
        paddingBottom: 6,
        scrollSnapType: "x mandatory",
      }
    : grid;

  const similarCardView = isPhone
    ? {
        ...cardGlass,
        flex: "0 0 78%",
        maxWidth: 300,
        minWidth: 250,
        scrollSnapAlign: "start",
      }
    : cardGlass;

  const similarImgWrapView = isPhone
    ? {
        ...imgWrapSmall,
        height: 132,
      }
    : imgWrapSmall;

  const similarBodyView = isPhone
    ? {
        padding: 10,
      }
    : {
        padding: 12,
      };

  const similarTitleView = isPhone
    ? {
        fontSize: 15,
        fontWeight: 1000,
        color: "#0b1220",
        lineHeight: 1.2,
      }
    : {
        fontSize: 14,
        fontWeight: 1000,
        color: "#0b1220",
      };

  return (
    <main style={pageBg}>
      <div style={{ width: "100%", margin: 0 }}>
        <div style={topBar}>
          <Link href={`/groceries/menu?store_id=${encodeURIComponent(storeId || "")}`} style={btnLight}>
            ← Back to Store
          </Link>

          <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <Link href="/cart" style={btnLight}>
              Go to Cart {cartCount > 0 ? `(${cartCount})` : ""}
            </Link>
          </div>
        </div>

        {errMsg ? <div style={alertErr}>{errMsg}</div> : null}

        {loading ? <div style={{ marginTop: 14, fontWeight: 900, color: "rgba(17,24,39,0.7)" }}>Loading…</div> : null}

        {!loading && item ? (
          <>
            {/* PRODUCT CARD */}
            <div style={productWrapView}>
              {/* ✅ Main image area (fixed crop issue + tap to zoom) */}
              <div style={productImgWrapView} onClick={openViewer} title="Tap to zoom">
                {item?.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.image_url} alt={item.name} style={productImg} draggable={false} />
                ) : (
                  <div style={imgPlaceholder}>No Image</div>
                )}

                <div style={zoomHintPillView}>🔎 Tap to zoom</div>
              </div>

              <div style={productInfoWrapView}>
                <div style={productHeadRowView}>
                  <div>
                    <div style={productTitle}>{item?.name || "Item"}</div>
                    <div style={productSub}>
                      {store?.name ? (
                        <>
                          <span style={{ fontWeight: 950 }}>{store.name}</span>
                          <span style={{ opacity: 0.6 }}> • </span>
                          <span>{store?.city || ""}</span>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <div style={productPriceColView}>
                    <div style={priceBig}>{money(effectivePrice, currency)}</div>
                    <span style={item?.in_stock ? openPill : closedPill}>{item?.in_stock ? "In stock" : "Out of stock"}</span>
                  </div>
                </div>

                <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={badgeLight}>Category: {displayCategoryLabel(item)}</span>
                  {displaySubcategoryLabel(item) ? <span style={badgeLight}>Sub: {displaySubcategoryLabel(item)}</span> : null}
                  {item?.is_best_seller ? <span style={tagStrong}>Best</span> : null}
                  {item?.is_recommended ? <span style={tagStrong}>Rec</span> : null}
                  {!storeOpen ? <span style={closedPill}>Store Closed</span> : null}
                </div>

                {/* ✅ NEW: Weight Options Dropdown */}
                {(variants || []).length > 0 ? (
                  <div style={variantBox}>
                    <div style={variantTitleRow}>
                      <div style={{ fontWeight: 1000, color: "#0b1220" }}>Weight Options</div>
                      <span style={badgeLight}>Choose one</span>
                    </div>

                    <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
                      <select
                        value={selectedVariantId}
                        onChange={(e) => setSelectedVariantId(e.target.value)}
                        style={variantSelect}
                        disabled={!variantsReady || !storeOpen}
                        title={!variantsReady ? "Loading options…" : "Select weight option"}
                      >
                        {(variants || []).map((v) => {
                          const disabled = typeof v?.in_stock === "boolean" ? !v.in_stock : false;
                          const priceTxt = money(v?.price, currency);
                          const labelTxt = clean(v?.label) || "Option";
                          return (
                            <option key={v.id} value={v.id} disabled={disabled}>
                              {labelTxt} — {priceTxt} {disabled ? "(Out)" : ""}
                            </option>
                          );
                        })}
                      </select>

                      {selectedVariant ? (
                        <div style={variantHint}>
                          Selected: <b>{clean(selectedVariant.label)}</b> • Price: <b>{money(selectedVariant.price, currency)}</b> •{" "}
                          {selectedVariant?.in_stock ? "In stock" : "Out of stock"}
                        </div>
                      ) : (
                        <div style={variantHint}>Select an option to continue.</div>
                      )}
                    </div>
                  </div>
                ) : null}

                <div style={descBox}>
                  {item?.description ? (
                    <div style={{ fontWeight: 850, color: "rgba(17,24,39,0.78)", lineHeight: 1.55 }}>{item.description}</div>
                  ) : (
                    <div style={{ fontWeight: 850, color: "rgba(17,24,39,0.55)" }}>No description added.</div>
                  )}
                </div>

                <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    onClick={() => addToCart(item)}
                    style={btnAdd}
                    disabled={!canAddThis}
                    title={!storeOpen ? "Store closed" : !item?.in_stock ? "Out of stock" : "Add to cart"}
                  >
                    + Add to Cart
                  </button>

                  <Link href="/cart" style={btnLight}>
                    Go to Cart {cartCount > 0 ? `(${cartCount})` : ""}
                  </Link>
                </div>

                {/* ✅ Note for customer if variants exist and base price differs */}
                {(variants || []).length > 0 ? (
                  <div style={variantNote}>
                    Base price: <b>{money(item?.price, currency)}</b>. Your selected option price is used at checkout.
                  </div>
                ) : null}
              </div>
            </div>

            {/* ✅ FULLSCREEN IMAGE VIEWER */}
            {viewerOpen ? (
              <div style={viewerBackdrop} onClick={closeViewer}>
                <div
                  style={viewerCard}
                  onClick={(e) => e.stopPropagation()}
                  ref={viewerRef}
                  onPointerDown={onViewerPointerDown}
                  onPointerMove={onViewerPointerMove}
                  onPointerUp={onViewerPointerUp}
                  onPointerCancel={onViewerPointerUp}
                  onWheel={onViewerWheel}
                >
                  <div style={viewerTop}>
                    <div style={{ fontWeight: 1000, color: "#0b1220" }}>{item?.name || "Image"}</div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <button onClick={resetZoom} style={viewerBtn}>
                        Reset
                      </button>
                      <button onClick={closeViewer} style={viewerBtnDark}>
                        ✕ Close
                      </button>
                    </div>
                  </div>

                  <div style={viewerStage}>
                    {item?.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.image_url}
                        alt={item.name}
                        draggable={false}
                        style={{
                          ...viewerImg,
                          transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
                        }}
                      />
                    ) : (
                      <div style={imgPlaceholder}>No Image</div>
                    )}
                  </div>

                  <div style={viewerHelp}>
                    <span>Mobile: pinch to zoom, drag to move</span>
                    <span style={{ opacity: 0.6 }}> • </span>
                    <span>Desktop: wheel to zoom, drag to move</span>
                  </div>
                </div>
              </div>
            ) : null}

            {/* YOU MAY ALSO LIKE */}
            <div style={{ marginTop: 16 }}>
              <div style={sectionTitle}>You may also like</div>

              {similar.length === 0 ? (
                <div style={emptyBox}>No similar items found.</div>
              ) : (
                <div style={similarWrapView}>
                  {similar.map((p) => (
                    <div key={p.id} style={similarCardView}>
                      <div style={similarImgWrapView} onClick={() => goToProduct(p)} title="Open product">
                        {p.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.image_url} alt={p.name} style={img} />
                        ) : (
                          <div style={imgPlaceholder}>No Image</div>
                        )}

                        <div style={topBadges}>
                          <span style={badgeDark}>{money(p.price, currency)}</span>
                          <span style={badgeLight}>{displayCategoryLabel(p)}</span>
                        </div>
                      </div>

                      <div style={similarBodyView}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                          <div style={similarTitleView}>{p.name || "Item"}</div>
                          <span style={p.in_stock ? openPill : closedPill}>{p.in_stock ? "In" : "Out"}</span>
                        </div>

                        {p.description ? (
                          <div style={{ marginTop: 6, fontSize: 12, fontWeight: 850, color: "rgba(17,24,39,0.68)" }}>
                            {clampText(p.description, 70)}
                          </div>
                        ) : null}

                        <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                          <button
                            onClick={() => {
                              // When adding from "similar", we use base price because variants are on product page.
                              // Customer can open Details to pick weight option.
                              const cart = readCart() || [];
                              const idx = cart.findIndex((x) => String(x?.cart_key || x?.id) === String(p.id));
                              if (idx >= 0) cart[idx].qty = (Number(cart[idx].qty || 0) || 0) + 1;
                              else {
                                const catName = displayCategoryLabel(p) || p.category || "General";
                                cart.push({
                                  id: p.id,
                                  cart_key: String(p.id),
                                  store_id: p.store_id,
                                  name: p.name,
                                  price: num(p.price),
                                  unit_price: num(p.price),
                                  image_url: p.image_url || "",
                                  category: catName,
                                  qty: 1,
                                  item_type: "grocery",
                                  is_taxable: true,
                                  variant_id: "",
                                  variant_label: "",
                                  variant_unit: "",
                                  variant_value: 0,
                                });
                              }
                              writeCart(cart);
                              refreshCartCount();
                            }}
                            style={btnAddSmall}
                            disabled={!storeOpen || !p?.in_stock}
                            title={!storeOpen ? "Store closed" : !p?.in_stock ? "Out of stock" : "Add to cart"}
                          >
                            + Add
                          </button>

                          <button onClick={() => goToProduct(p)} style={btnGhost}>
                            Details
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
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

const topBar = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  alignItems: "center",
};

const productWrap = {
  marginTop: 14,
  borderRadius: 20,
  padding: 16,
  background: "rgba(255,255,255,0.78)",
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 14px 44px rgba(0,0,0,0.09)",
  backdropFilter: "blur(10px)",
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 14,
};

const productImgWrap = {
  borderRadius: 18,
  overflow: "hidden",
  border: "1px solid rgba(0,0,0,0.08)",
  background: "linear-gradient(180deg, rgba(255,255,255,0.95), rgba(250,250,252,0.95))",
  height: 360,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  position: "relative",
  cursor: "zoom-in",
  padding: 14,
};

const productImg = {
  width: "100%",
  height: "100%",
  objectFit: "contain", // ✅ FIXED: no cropping now
  userSelect: "none",
  WebkitUserSelect: "none",
  WebkitTouchCallout: "none",
};

const zoomHintPill = {
  position: "absolute",
  bottom: 12,
  left: 12,
  padding: "6px 10px",
  borderRadius: 999,
  background: "rgba(17,24,39,0.88)",
  color: "#fff",
  fontWeight: 950,
  fontSize: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  pointerEvents: "none",
};

const productTitle = {
  fontSize: 26,
  fontWeight: 1000,
  color: "#0b1220",
  letterSpacing: -0.2,
};

const productSub = {
  marginTop: 6,
  fontWeight: 850,
  color: "rgba(17,24,39,0.65)",
};

const priceBig = {
  fontSize: 22,
  fontWeight: 1000,
  color: "#0b1220",
};

const descBox = {
  marginTop: 12,
  borderRadius: 16,
  padding: 12,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.80)",
};

const sectionTitle = {
  fontWeight: 1000,
  fontSize: 16,
  color: "#0b1220",
  marginBottom: 10,
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

const btnAddSmall = {
  ...btnAdd,
  padding: "9px 12px",
  borderRadius: 12,
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

const grid = {
  marginTop: 10,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
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

const imgWrapSmall = {
  height: 170,
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

const tagStrong = {
  fontSize: 12,
  padding: "5px 10px",
  borderRadius: 999,
  border: "1px solid rgba(17,24,39,0.16)",
  background: "rgba(17,24,39,0.92)",
  color: "#fff",
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

const alertErr = {
  marginTop: 12,
  padding: 12,
  border: "1px solid #fecaca",
  background: "rgba(254,242,242,0.9)",
  borderRadius: 14,
  color: "#7f1d1d",
  fontWeight: 900,
};

/* =========================
   ✅ Variant UI styles
   ========================= */
const variantBox = {
  marginTop: 12,
  borderRadius: 16,
  padding: 12,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.85)",
  boxShadow: "0 10px 22px rgba(0,0,0,0.06)",
};

const variantTitleRow = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  flexWrap: "wrap",
};

const variantSelect = {
  width: "100%",
  padding: 10,
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.95)",
  outline: "none",
  fontWeight: 900,
};

const variantHint = {
  fontSize: 12,
  fontWeight: 850,
  color: "rgba(17,24,39,0.70)",
};

const variantNote = {
  marginTop: 10,
  fontSize: 12,
  fontWeight: 850,
  color: "rgba(17,24,39,0.60)",
};

/* =========================
   ✅ Fullscreen Viewer Styles
   ========================= */

const viewerBackdrop = {
  position: "fixed",
  inset: 0,
  background: "rgba(2,6,23,0.55)",
  zIndex: 999999,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 14,
};

const viewerCard = {
  width: "min(1100px, 100%)",
  height: "min(720px, 92vh)",
  borderRadius: 20,
  border: "1px solid rgba(255,255,255,0.16)",
  background: "rgba(255,255,255,0.96)",
  boxShadow: "0 30px 120px rgba(0,0,0,0.35)",
  overflow: "hidden",
  display: "grid",
  gridTemplateRows: "auto 1fr auto",
};

const viewerTop = {
  padding: 12,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  borderBottom: "1px solid rgba(0,0,0,0.06)",
  background: "rgba(255,255,255,0.86)",
};

const viewerBtn = {
  padding: "8px 10px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(255,255,255,0.85)",
  cursor: "pointer",
  fontWeight: 950,
  fontSize: 12,
  color: "rgba(2,6,23,0.78)",
};

const viewerBtnDark = {
  ...viewerBtn,
  background: "rgba(17,24,39,0.94)",
  border: "1px solid rgba(17,24,39,0.25)",
  color: "#fff",
};

const viewerStage = {
  position: "relative",
  background: "radial-gradient(900px 520px at 50% 45%, rgba(17,24,39,0.05), transparent 60%), #fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
  touchAction: "none", // ✅ needed for pinch/drag
};

const viewerImg = {
  maxWidth: "92%",
  maxHeight: "92%",
  objectFit: "contain",
  userSelect: "none",
  WebkitUserSelect: "none",
  WebkitTouchCallout: "none",
  cursor: "grab",
};

const viewerHelp = {
  padding: 10,
  borderTop: "1px solid rgba(0,0,0,0.06)",
  background: "rgba(255,255,255,0.86)",
  fontWeight: 850,
  fontSize: 12,
  color: "rgba(17,24,39,0.68)",
  display: "flex",
  justifyContent: "center",
  gap: 6,
  flexWrap: "wrap",
};

/* mobile */
if (typeof window !== "undefined") {
  // keep simple: if narrow screen, grid becomes single column for main product
  // (no runtime error if SSR because this is client component)
}

