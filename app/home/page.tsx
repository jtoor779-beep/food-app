"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
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
  category?: string | null;

  // optional
  in_stock?: boolean | null;
  is_best_seller?: boolean | null;
  description?: string | null;
};

type HomeFilterCategory = {
  id?: string | null;
  key?: string | null;
  label?: string | null;
  sort_order?: number | null;
  is_enabled?: boolean | null;
};

type HomepageCategoryRule = {
  id: string;
  key: string;
  label: string;
  kind: "restaurant" | "grocery";
  match_type: "cuisine" | "category";
  match_value: string;
  item_limit: number;
  sort_order: number;
  is_enabled: boolean;
};

type HomepageCategorySection = {
  id: string;
  key: string;
  label: string;
  kind: "restaurant" | "grocery";
  sort_order: number;
  items: Array<MenuItem | GroceryItem>;
};

function normalizeRole(r: unknown) {
  return String(r || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function cleanText(v: unknown) {
  return String(v || "").trim();
}

function normalizeHomepageRuleKey(value: unknown) {
  return cleanText(value)
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeHomepageCategoryAdminRules(value: unknown): HomepageCategoryRule[] {
  if (!value || typeof value !== "object") return [];

  const sections = Array.isArray((value as any)?.sections) ? (value as any).sections : [];

  return sections
    .map((row: any) => {
      const kind = cleanText(row?.kind).toLowerCase() === "grocery" ? "grocery" : "restaurant";
      const matchType = kind === "grocery" ? "category" : "cuisine";
      const label = cleanText(row?.label);
      const matchValue = cleanText(row?.match_value);
      const itemLimit = Math.max(1, Number(row?.item_limit || 8) || 8);
      const sortOrder = Number.isFinite(Number(row?.sort_order)) ? Number(row.sort_order) : 0;
      const isEnabled = row?.is_enabled !== false;

      if (!label || !matchValue || !isEnabled) return null;

      return {
        id: cleanText(row?.id) || `${kind}_${normalizeHomepageRuleKey(label)}`,
        key: cleanText(row?.key) || normalizeHomepageRuleKey(label),
        label,
        kind,
        match_type: matchType as "cuisine" | "category",
        match_value: matchValue,
        item_limit: itemLimit,
        sort_order: sortOrder,
        is_enabled: isEnabled,
      };
    })
    .filter(Boolean)
    .sort(
      (a: any, b: any) =>
        Number(a?.sort_order || 0) - Number(b?.sort_order || 0) ||
        String(a?.label || "").localeCompare(String(b?.label || ""))
    ) as HomepageCategoryRule[];
}

function buildHomepageCategorySectionsFromRules(
  items: Array<MenuItem | GroceryItem>,
  kind: "restaurant" | "grocery",
  rules: HomepageCategoryRule[]
): HomepageCategorySection[] {
  const filteredRules = (rules || []).filter((rule) => rule.kind === kind && rule.is_enabled !== false);
  if (!filteredRules.length) return [];

  return filteredRules
    .map((rule) => {
      const ruleValue = cleanText(rule.match_value).toLowerCase();
      const matchedItems = (items || [])
        .filter((item) => {
          const rawValue =
            kind === "restaurant"
              ? cleanText((item as MenuItem)?.cuisine).toLowerCase()
              : cleanText((item as GroceryItem)?.category).toLowerCase();
          if (!rawValue || !ruleValue) return false;
          return rawValue === ruleValue || rawValue.includes(ruleValue) || ruleValue.includes(rawValue);
        })
        .filter((item, index, arr) => arr.findIndex((row) => String((row as any)?.id) === String((item as any)?.id)) === index)
        .slice(0, Math.max(1, Number(rule.item_limit || 8) || 8));

      if (!matchedItems.length) return null;

      return {
        id: rule.id,
        key: rule.key,
        label: rule.label,
        kind,
        sort_order: Number(rule.sort_order || 0),
        items: matchedItems,
      };
    })
    .filter(Boolean) as HomepageCategorySection[];
}

/* =========================================================
   ✅ CURRENCY SUPPORT (DB + localStorage, SAFE)
   - Source of truth: public.system_settings.default_currency
   - We still keep localStorage "foodapp_currency" for speed,
     but we ALWAYS sync it from DB on app load.
   ========================================================= */

const DEFAULT_CURRENCY = "INR";

function normalizeCurrency(c: unknown) {
  const v = String(c || "").trim().toUpperCase();
  if (v === "USD") return "USD";
  if (v === "INR") return "INR";
  return DEFAULT_CURRENCY;
}

function money(v: unknown, currency: string = DEFAULT_CURRENCY) {
  const n = Number(v || 0);
  const cur = normalizeCurrency(currency);

  if (!isFinite(n)) {
    return cur === "USD" ? "$0.00" : "₹0";
  }

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

/**
 * ✅ Read currency from DB (system_settings)
 * We support multiple schemas:
 * - column: default_currency
 * - JSON: value_json.default_currency
 * - optional key-based row ("global"), but also works if you store just 1 row
 */
async function fetchCurrencyFromDB(): Promise<string> {
  try {
    const { data, error } = await supabase
      .from("system_settings")
      .select("key, default_currency, value_json, updated_at")
      .order("updated_at", { ascending: false })
      .limit(10);

    if (error) return DEFAULT_CURRENCY;

    const rows = Array.isArray(data) ? (data as any[]) : [];
    if (rows.length === 0) return DEFAULT_CURRENCY;

    // Prefer "global" row if exists, else latest row
    const globalRow = rows.find((r) => String(r?.key || "").toLowerCase() === "global");
    const row = globalRow || rows[0];

    const col = row?.default_currency;
    if (col) return normalizeCurrency(col);

    const jsonCur = row?.value_json?.default_currency;
    if (jsonCur) return normalizeCurrency(jsonCur);

    return DEFAULT_CURRENCY;
  } catch {
    return DEFAULT_CURRENCY;
  }
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
  if (n.includes("butter") || n.includes("paneer") || n.includes("dal") || n.includes("naan") || n.includes("roti"))
    tags.push("indian");
  if (n.includes("tandoori") || n.includes("amritsari") || n.includes("chole") || n.includes("rajma")) tags.push("punjabi");
  if (tags.length === 0) tags.push("recommended");
  return Array.from(new Set(tags));
}

const DEFAULT_CATEGORIES = [
  { key: "recommended", label: "Recommended" },
  { key: "punjabi", label: "Punjabi" },
  { key: "indian", label: "Indian" },
  { key: "pizza", label: "Pizza" },
];

/* =========================================================
   ✅ HOME CACHE (SAFE, SPEED ONLY)
   - Shows last good homepage data instantly
   - Fresh data still loads in background
   - Does NOT change business/cart logic
   ========================================================= */
const HOME_CACHE_KEY = "foodapp_home_cache_v2";
const HOME_CACHE_MAX_AGE_MS = 1000 * 60 * 15;

type HomeCachePayload = {
  ts: number;
  restaurants?: Restaurant[];
  items?: MenuItem[];
  groceryStores?: GroceryStore[];
  groceryItems?: GroceryItem[];
  homeCategories?: { key: string; label: string }[];
  featuredMenuIds?: string[];
  featuredGroceryIds?: string[];
  homeBanners?: BannerItem[];
  homeBanner?: { url: string; type: "video" | "image"; poster?: string | null } | null;
  bannerIndex?: number;
  homeBannerFx?: HomeBannerFx;
};

function readHomeCache(): HomeCachePayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(HOME_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const ts = Number(parsed?.ts || 0);
    if (!ts || Date.now() - ts > HOME_CACHE_MAX_AGE_MS) return null;
    return parsed as HomeCachePayload;
  } catch {
    return null;
  }
}

function writeHomeCache(payload: Omit<HomeCachePayload, "ts">) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      HOME_CACHE_KEY,
      JSON.stringify({
        ts: Date.now(),
        ...payload,
      })
    );
  } catch {}
}

type CartItem = {
  menu_item_id: string;
  restaurant_id: string;
  name: string;
  price_each: number;
  qty: number;
  image_url?: string | null;
};

type GroceryCartItem = {
  grocery_item_id: string;
  store_id: string;
  name: string;
  price_each: number;
  qty: number;
  image_url?: string | null;
};

type HomeFeaturedRow = {
  id?: string | number | null;
  is_enabled?: boolean | null;
  sort_order?: number | null;
  item_type?: string | null;
  entity_type?: string | null;
  type?: string | null;

  menu_item_id?: string | null;
  restaurant_item_id?: string | null;
  food_item_id?: string | null;
  item_id?: string | null;

  grocery_item_id?: string | null;
  grocery_product_id?: string | null;
  store_item_id?: string | null;
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

const CART_EVT = "foodapp_cart_updated";
const GROCERY_CART_KEY = "grocery_cart_items";
const GROCERY_FALLBACK_KEY = "grocery_cart";
const CART_ITEMS_KEY = "cart_items";

function safeParse(raw: unknown) {
  try {
    return raw ? JSON.parse(String(raw)) : [];
  } catch {
    return [];
  }
}

function clampMoney(v: unknown, min: number, max: number, fallback: number) {
  const n = Number(v);
  if (!isFinite(n)) return fallback;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function sanitizeQty(qty: unknown) {
  const n = Number(qty);
  if (!isFinite(n)) return 1;
  const i = Math.floor(n);
  if (i <= 0) return 1;
  if (i > 20) return 1;
  return i;
}

function asBoolLocal(v: unknown, fallback = true) {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v === 1;
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return fallback;
  if (s === "true" || s === "1" || s === "yes") return true;
  if (s === "false" || s === "0" || s === "no") return false;
  return fallback;
}

function normalizeGroceryCartShape(arr: unknown): GroceryCartItem[] {
  const list = Array.isArray(arr) ? arr : [];
  return list
    .map((x: any) => {
      const rawId = x?.id || x?.grocery_item_id || x?.item_id || null;
      const unit_price = clampMoney(x?.unit_price ?? x?.price_each ?? x?.price, 0, 100000, 0);

      return {
        id: rawId,
        grocery_item_id: rawId,
        store_id: x?.store_id,
        name: x?.name,
        price: clampMoney(x?.price ?? x?.price_each, 0, 100000, unit_price),
        unit_price,
        price_each: unit_price,
        qty: sanitizeQty(x?.qty),
        image_url: x?.image_url || "",
        category: x?.category || "General",
        item_type: x?.item_type || "grocery",
        variant_label: String(x?.variant_label || x?.variant || x?.weight_label || "").trim(),
        cart_key:
          String(
            x?.cart_key ||
              x?.key ||
              (rawId && x?.variant_label ? `${rawId}__${String(x.variant_label).trim()}` : "")
          ).trim() || null,
        is_taxable: asBoolLocal(x?.is_taxable, true),
      } as any;
    })
    .filter((x: any) => x.id && x.store_id && x.qty > 0);
}

function readGroceryFromCartItemsKey(): GroceryCartItem[] {
  const raw = safeParse(localStorage.getItem(CART_ITEMS_KEY));
  if (!Array.isArray(raw) || raw.length === 0) return [];

  const maybeGrocery = raw.filter((x: any) => {
    if (!x) return false;
    const hasGroceryMarker = String(x?.item_type || "").toLowerCase() === "grocery";
    const looksGroceryOld = !!x?.id && !!x?.store_id && !x?.menu_item_id && !x?.restaurant_id;
    const looksGroceryNew = !!x?.grocery_item_id && !!x?.store_id && !x?.menu_item_id && !x?.restaurant_id;
    return hasGroceryMarker || looksGroceryOld || looksGroceryNew;
  });

  return normalizeGroceryCartShape(maybeGrocery);
}

/**
 * ✅ Grocery cart helpers
 * Read count/state using SAME source logic as app/cart/page.
 */
function getGroceryCart(): GroceryCartItem[] {
  const rawA = safeParse(localStorage.getItem(GROCERY_CART_KEY));
  const rawB = safeParse(localStorage.getItem(GROCERY_FALLBACK_KEY));

  const a = normalizeGroceryCartShape(rawA);
  const b = normalizeGroceryCartShape(rawB);
  const c = a.length === 0 && b.length === 0 ? readGroceryFromCartItemsKey() : [];

  if (a.length === 0 && b.length === 0 && c.length === 0) return [];

  const chosen = a.length > 0 ? a : b.length > 0 ? b : c;
  const sid = chosen[0]?.store_id;
  return chosen.filter((x: any) => x.store_id === sid);
}

function setGroceryCart(items: GroceryCartItem[]) {
  try {
    const cleaned = normalizeGroceryCartShape(items);
    const payload = JSON.stringify(cleaned || []);
    localStorage.setItem(GROCERY_CART_KEY, payload);
    localStorage.setItem(GROCERY_FALLBACK_KEY, payload);
    localStorage.setItem("foodapp_grocery_cart", payload);
    window.dispatchEvent(new Event(CART_EVT));
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
  const base = it.description?.trim() || `Fresh ${it.name || "item"} from ${storeName}. Carefully packed and ready for delivery.`;
  return base;
}

function inferMediaTypeFromUrl(url: string): "video" | "image" {
  const u = String(url || "").toLowerCase();
  if (
    u.endsWith(".mp4") ||
    u.endsWith(".webm") ||
    u.endsWith(".mov") ||
    u.includes(".mp4?") ||
    u.includes(".webm?") ||
    u.includes(".mov?")
  ) {
    return "video";
  }
  return "image";
}

function normalizeFeaturedType(v: unknown) {
  const t = String(v || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

  if (t === "menu" || t === "menu_item" || t === "restaurant" || t === "restaurant_item" || t === "food" || t === "food_item") {
    return "menu";
  }
  if (t === "grocery" || t === "grocery_item" || t === "store_item" || t === "grocery_product") {
    return "grocery";
  }
  return "";
}

function getFeaturedMenuId(row: HomeFeaturedRow) {
  return String(row?.menu_item_id || row?.restaurant_item_id || row?.food_item_id || "").trim();
}

function getFeaturedGroceryId(row: HomeFeaturedRow) {
  return String(row?.grocery_item_id || row?.grocery_product_id || row?.store_item_id || "").trim();
}

function normalizeFilterCategoryKey(v: unknown) {
  return String(v || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
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

type HeroSlide = {
  key: string;
  kind: "food" | "grocery";
  title: string;
  subtitle: string;
  image_url: string;
  hrefPrimary: string;
  hrefSecondary?: string;
  badge?: string;
};

type BannerItem = { id?: string; url: string; type: "video" | "image"; poster?: string | null };

type HomeBannerFx = {
  animation: "none" | "fade" | "slide-left" | "slide-up" | "zoom-in";
  duration_ms: number;
};

const DEFAULT_HOME_BANNER_FX: HomeBannerFx = {
  animation: "none",
  duration_ms: 800,
};

function normalizeHomeBannerFx(v: any): HomeBannerFx {
  const rawAnim = String(v?.animation || "").trim().toLowerCase();
  const animation =
    rawAnim === "fade" || rawAnim === "slide-left" || rawAnim === "slide-up" || rawAnim === "zoom-in"
      ? rawAnim
      : "none";

  const rawMs = Number(v?.duration_ms);
  const duration_ms = Number.isFinite(rawMs) ? Math.max(200, Math.min(3000, Math.round(rawMs))) : 800;

  return { animation: animation as HomeBannerFx["animation"], duration_ms };
}

export default function CustomerHomeDashboard() {
  const router = useRouter();
  const showLegacyHomeBanner = false;

  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string>("");
  const [err, setErr] = useState("");

  // ✅ currency (synced from DB)
  const [currency, setCurrency] = useState<string>(DEFAULT_CURRENCY);

  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);

  // ✅ NEW grocery state
  const [groceryStores, setGroceryStores] = useState<GroceryStore[]>([]);
  const [groceryItems, setGroceryItems] = useState<GroceryItem[]>([]);

  // ✅ NEW: admin-controlled home featured ids (safe)
  const [featuredMenuIds, setFeaturedMenuIds] = useState<string[]>([]);
  const [featuredGroceryIds, setFeaturedGroceryIds] = useState<string[]>([]);
  const [homeFeaturedReady, setHomeFeaturedReady] = useState(false);

  // ✅ NEW: admin-controlled filter categories
  const [homeCategories, setHomeCategories] = useState<{ key: string; label: string }[]>(DEFAULT_CATEGORIES);
  const [homepageCategoryRules, setHomepageCategoryRules] = useState<HomepageCategoryRule[]>([]);

  const [q, setQ] = useState("");
  const [activeCat, setActiveCat] = useState<string>("recommended");

  const [vegOnly, setVegOnly] = useState(false);
  const [bestsellerOnly, setBestsellerOnly] = useState(false);
  const [under199, setUnder199] = useState(false);
  const [inStockOnly, setInStockOnly] = useState(false);

  // kept for old logic safety (restaurants section removed from UI)
  const [restSort, setRestSort] = useState<"name" | "eta" | "rating">("name");

  const [recent, setRecent] = useState<string[]>([]);

  const [toast, setToast] = useState<string>("");
  const [cartCount, setCartCount] = useState<number>(0);
  const [cartMap, setCartMap] = useState<Record<string, number>>({});

  // ✅ NEW: grocery cart state
  const [groceryCartCount, setGroceryCartCount] = useState<number>(0);
  const [groceryCartMap, setGroceryCartMap] = useState<Record<string, number>>({});

  const [selected, setSelected] = useState<MenuItem | null>(null);

  // ✅ NEW grocery modal (optional, but safe)
  const [selectedGrocery, setSelectedGrocery] = useState<GroceryItem | null>(null);

  // ✅ PRO UI: sticky controls state
  const [stickyOn, setStickyOn] = useState(false);

  // ✅ PRO HERO: slideshow state
  const [heroTab, setHeroTab] = useState<"featured" | "food" | "groceries">("featured");
  const [heroIndex, setHeroIndex] = useState(0);
  const [heroPaused, setHeroPaused] = useState(false);
  const [heroBump, setHeroBump] = useState(0); // used to reset index when tab changes or data changes

  // ✅ NEW: Admin-managed Home Banner (video/image)
  const [homeBanner, setHomeBanner] = useState<{ url: string; type: "video" | "image"; poster?: string | null } | null>(null);

  // ✅ NEW: playlist banner items
  const [homeBanners, setHomeBanners] = useState<BannerItem[]>([]);
  const [bannerIndex, setBannerIndex] = useState(0);
  const bannerTimerRef = useRef<number | null>(null);
  const bannerVideoRef = useRef<HTMLVideoElement | null>(null);
  const bannerPrevRef = useRef<BannerItem | null>(null);

  // ✅ NEW: prevents hero from showing food/grocery images before banner load finishes
  const [bannerReady, setBannerReady] = useState(false);
  const [homeBannerFx, setHomeBannerFx] = useState<HomeBannerFx>(DEFAULT_HOME_BANNER_FX);
  const [leavingBanner, setLeavingBanner] = useState<BannerItem | null>(null);
  const [leavingBannerKey, setLeavingBannerKey] = useState(0);

  function renderBannerMedia(banner: BannerItem, layerKey: string) {
    if (banner.type === "video") {
      return (
        <video
          key={`${layerKey}-${banner.url}`}
          src={banner.url}
          poster={banner.poster || undefined}
          style={heroSplashVideo}
          autoPlay
          muted
          playsInline
          loop={false}
          controls={false}
          disablePictureInPicture
          disableRemotePlayback
          controlsList="nodownload noplaybackrate noremoteplayback"
          onEnded={() => {
            if (bannerTimerRef.current) {
              window.clearTimeout(bannerTimerRef.current);
              bannerTimerRef.current = null;
            }
            bannerNext();
          }}
          onError={() => {
            if (bannerTimerRef.current) {
              window.clearTimeout(bannerTimerRef.current);
              bannerTimerRef.current = null;
            }
            bannerTimerRef.current = window.setTimeout(() => bannerNext(), 1200);
          }}
          ref={(el) => {
            bannerVideoRef.current = el;
          }}
        />
      );
    }

    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        key={`${layerKey}-${banner.url}`}
        src={banner.url}
        alt="Banner"
        style={heroSplashImg}
      />
    );
  }

  function getHomeBannerAnimStyle(): React.CSSProperties {
    const fx = normalizeHomeBannerFx(homeBannerFx);
    const ms = fx.duration_ms;

    if (fx.animation === "fade") {
      return { animation: `hfBannerFade ${ms}ms ease both` };
    }
    if (fx.animation === "slide-left") {
      return { animation: `hfBannerSlideLeft ${ms}ms cubic-bezier(0.2, 0.8, 0.2, 1) both` };
    }
    if (fx.animation === "slide-up") {
      return { animation: `hfBannerSlideUp ${ms}ms cubic-bezier(0.2, 0.8, 0.2, 1) both` };
    }
    if (fx.animation === "zoom-in") {
      return { animation: `hfBannerZoomIn ${ms}ms ease both` };
    }
    return {};
  }

  function getHomeBannerAnimOutStyle(): React.CSSProperties {
    const fx = normalizeHomeBannerFx(homeBannerFx);
    const ms = fx.duration_ms;

    if (fx.animation === "fade") {
      return { animation: `hfBannerFadeOut ${ms}ms ease both` };
    }
    if (fx.animation === "slide-left") {
      return { animation: `hfBannerSlideLeftOut ${ms}ms cubic-bezier(0.2, 0.8, 0.2, 1) both` };
    }
    if (fx.animation === "slide-up") {
      return { animation: `hfBannerSlideUpOut ${ms}ms cubic-bezier(0.2, 0.8, 0.2, 1) both` };
    }
    if (fx.animation === "zoom-in") {
      return { animation: `hfBannerZoomOut ${ms}ms ease both` };
    }
    return {};
  }
  function refreshCartState() {
    const c = getCart();
    const count = c.reduce((s, x) => s + Number(x.qty || 0), 0);
    setCartCount(count);

    const m: Record<string, number> = {};
    for (const ci of c) m[ci.menu_item_id] = Number(ci.qty || 0);
    setCartMap(m);

    const gc = getGroceryCart();
    const gCount = gc.reduce((s, x) => s + Number(x.qty || 0), 0);
    setGroceryCartCount(gCount);

    const gm: Record<string, number> = {};
    for (const ci of gc) gm[ci.grocery_item_id] = Number(ci.qty || 0);
    setGroceryCartMap(gm);
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

  function setGroceryItemQty(item: GroceryItem, nextQty: number) {
    if (!item?.id || !item.store_id) {
      showToast("Grocery item missing id/store. Please refresh.");
      return;
    }

    if (item.in_stock === false) {
      showToast("Out of stock");
      return;
    }

    const price_each = Number(item.price || 0);
    if (!Number.isFinite(price_each) || price_each <= 0) {
      showToast("Invalid price. Please fix grocery item price.");
      return;
    }

    const cart = getGroceryCart();
    const idx = cart.findIndex((x) => x.grocery_item_id === item.id);

    if (nextQty <= 0) {
      if (idx >= 0) cart.splice(idx, 1);
      setGroceryCart(cart);
      refreshCartState();
      showToast("Removed from grocery cart ✅");
      return;
    }

    if (idx >= 0) {
      cart[idx] = { ...cart[idx], qty: nextQty };
    } else {
      cart.push({
        grocery_item_id: item.id,
        store_id: item.store_id,
        name: item.name || "Item",
        price_each,
        qty: nextQty,
        image_url: item.image_url || null,
      });
    }

    setGroceryCart(cart);
    refreshCartState();
    showToast("Grocery cart updated ✅");
  }

  function incGrocery(item: GroceryItem) {
    const cur = groceryCartMap[item.id] || 0;
    setGroceryItemQty(item, cur + 1);
  }

  function decGrocery(item: GroceryItem) {
    const cur = groceryCartMap[item.id] || 0;
    setGroceryItemQty(item, cur - 1);
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
   * ✅ QUIET SAFE SELECT:
   * Use select("*") for optional/uncertain tables so we avoid
   * repeated 400 errors from trying many column combinations.
   */
  async function quietSelectAll(table: string) {
    try {
      const res = await supabase.from(table).select("*");
      return res;
    } catch (e: any) {
      return { data: null as any, error: e };
    }
  }

  /**
   * ✅ SAFE SELECT across table name options (NEW)
   * Reduced guesses + select("*") on optional tables to keep DevTools clean.
   */
  async function quietSelectFromTables(tables: string[]) {
    let lastErr: any = null;
    for (const t of tables) {
      const res = await quietSelectAll(t);
      if (!res.error) return { ...res, tableUsed: t };
      lastErr = res.error;
    }
    return { data: null as any, error: lastErr, tableUsed: null as any };
  }

  function clearBannerTimer() {
    if (bannerTimerRef.current) {
      window.clearTimeout(bannerTimerRef.current);
      bannerTimerRef.current = null;
    }
  }

  function bannerNext() {
    setBannerIndex((i) => {
      const len = homeBanners.length;
      if (len <= 1) return 0;
      const next = i + 1;
      return next >= len ? 0 : next;
    });
  }

  /**
   * ✅ Load using views first
   * ✅ Fallback to base tables if views missing / blocked / empty
   */
  async function loadData(opts?: { silent?: boolean }) {
    const silent = !!opts?.silent;

    if (!silent) setLoading(true);
    setErr("");
    if (!silent) setBannerReady(false); // ✅ prevents hero image flash until banner attempt completes
    if (!silent) setHomeFeaturedReady(false);

    async function loadRestaurantsAndItems() {
      let restList: Restaurant[] = [];
      let itemList: MenuItem[] = [];

      try {
        const [restRes, itemRes] = await Promise.all([
          safeSelect("restaurants_public", ["id, name, image_url, is_enabled", "id, name, image_url", "id, name, is_enabled", "id, name"]),
          safeSelect("menu_items_public", [
            "id, restaurant_id, name, price, cuisine, image_url, is_veg, is_best_seller, in_stock, description",
            "id, restaurant_id, name, price, cuisine, image_url, is_veg, is_best_seller, in_stock",
            "id, restaurant_id, name, price, image_url, is_veg, is_best_seller, in_stock",
            "id, restaurant_id, name, price, image_url",
          ]),
        ]);

        if (restRes.error) throw restRes.error;
        if (itemRes.error) throw itemRes.error;

        restList = (restRes.data || []) as Restaurant[];
        itemList = ((itemRes.data || []) as MenuItem[]).sort((a, b) => String(b.id).localeCompare(String(a.id)));
      } catch (viewErr: any) {
        const viewMsg = String(viewErr?.message || viewErr || "");
        console.warn("Views failed, fallback to tables:", viewMsg);

        const [restRes, itemRes] = await Promise.all([
          safeSelect("restaurants", [
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
          ]),
          safeSelect("menu_items", [
            "id, restaurant_id, name, price, cuisine, image_url, is_veg, is_best_seller, in_stock, description",
            "id, restaurant_id, name, price, cuisine, image_url, is_veg, is_best_seller, in_stock",
            "id, restaurant_id, name, price, cuisine, image_url",
            "id, restaurant_id, name, price, image_url",
          ]),
        ]);

        if (restRes.error) throw restRes.error;
        if (itemRes.error) throw itemRes.error;

        const rawRestaurants = (restRes.data || []) as Restaurant[];
        restList = rawRestaurants.filter((r) => isRestaurantEnabled(r) && isRestaurantApproved(r));

        const approvedIds = new Set(restList.map((r) => r.id));
        const rawItems = (itemRes.data || []) as MenuItem[];
        itemList = rawItems
          .filter((it) => approvedIds.has(it.restaurant_id))
          .sort((a, b) => String(b.id).localeCompare(String(a.id)));
      }

      const approvedIds = new Set(restList.map((r) => r.id));
      const safeItems = itemList.filter((it) => approvedIds.has(it.restaurant_id));

      return { restList, safeItems };
    }

    async function loadGroceries() {
      let gStores: GroceryStore[] = [];
      let gItems: GroceryItem[] = [];

      try {
        const [gsRes, giRes] = await Promise.all([
          quietSelectFromTables(["grocery_stores_public", "grocery_stores"]),
          quietSelectFromTables(["grocery_items_public", "grocery_items"]),
        ]);

        if (!gsRes.error) {
          const raw = (gsRes.data || []) as GroceryStore[];
          gStores = raw.filter((s) => isGroceryStoreEnabled(s) && isGroceryStoreApproved(s));
        }

        if (!giRes.error) {
          const raw = (giRes.data || []) as GroceryItem[];
          const storeIds = new Set(gStores.map((s) => s.id));
          if (storeIds.size > 0) gItems = raw.filter((it) => storeIds.has(it.store_id));
          else gItems = raw;
          gItems = [...gItems].sort((a, b) => String(b.id).localeCompare(String(a.id)));
        }
      } catch (gErr: any) {
        console.warn("Groceries load warning:", gErr?.message || String(gErr));
      }

      return { gStores, gItems };
    }

    async function loadHomeCategories() {
      try {
        const filterRes = await quietSelectFromTables([
          "home_filter_categories",
          "home_filters",
          "homepage_filter_categories",
        ]);

        if (!filterRes.error && Array.isArray(filterRes.data) && filterRes.data.length > 0) {
          const dynamicCats = (filterRes.data as HomeFilterCategory[])
            .filter((row) => row?.is_enabled !== false)
            .sort((a, b) => {
              const ao = Number(a?.sort_order ?? 1e9);
              const bo = Number(b?.sort_order ?? 1e9);
              if (ao !== bo) return ao - bo;
              return String(a?.id || "").localeCompare(String(b?.id || ""));
            })
            .map((row) => {
              const key = normalizeFilterCategoryKey(row?.key || row?.label || "");
              const label = String(row?.label || row?.key || "").trim();
              return key && label ? { key, label } : null;
            })
            .filter(Boolean) as { key: string; label: string }[];

          const safeDynamic = Array.from(new Map(dynamicCats.map((x) => [x.key, x])).values());
          return [{ key: "recommended", label: "Recommended" }, ...safeDynamic];
        }
      } catch (fcErr: any) {
        console.warn("Home filter categories load warning:", fcErr?.message || String(fcErr));
      }

      return [{ key: "recommended", label: "Recommended" }];
    }

    async function loadHomeBannerData() {
      try {
        const bannerRes = await quietSelectFromTables(["home_banners", "app_banners", "banners"]);

        if (!bannerRes.error && Array.isArray(bannerRes.data) && bannerRes.data.length > 0) {
          const enabled = (bannerRes.data as any[]).filter((x) => x?.is_enabled !== false && !!x?.media_url);

          enabled.sort((a, b) => {
            const ao = Number(a?.sort_order ?? 1e9);
            const bo = Number(b?.sort_order ?? 1e9);
            if (ao !== bo) return ao - bo;
            const ac = String(a?.created_at || "");
            const bc = String(b?.created_at || "");
            if (ac && bc && ac !== bc) return bc.localeCompare(ac);
            return String(b?.id || "").localeCompare(String(a?.id || ""));
          });

          const list: BannerItem[] = enabled
            .map((row) => {
              const url = String(row?.media_url || "").trim();
              const mtRaw = String(row?.media_type || "").toLowerCase();
              const type = mtRaw === "video" ? "video" : mtRaw === "image" ? "image" : inferMediaTypeFromUrl(url);
              const poster = row?.poster_url ? String(row.poster_url) : null;
              return { id: row?.id ? String(row.id) : undefined, url, type, poster };
            })
            .filter((x) => !!x.url);

          const top = list[0] || null;
          return {
            homeBanners: list,
            homeBanner: top?.url ? { url: top.url, type: top.type, poster: top.poster ?? null } : null,
            bannerIndex: 0,
          };
        }
      } catch (bErr: any) {
        console.warn("Home banner load warning:", bErr?.message || String(bErr));
      }

      return { homeBanners: [], homeBanner: null, bannerIndex: 0 };
    }

    async function loadHomeBannerFxSettings() {
      try {
        const { data, error } = await supabase
          .from("system_settings")
          .select("key, value_json")
          .eq("key", "home_banner_settings")
          .maybeSingle();

        if (error) return DEFAULT_HOME_BANNER_FX;

        const cfg = (data as any)?.value_json || {};
        if (!cfg || !cfg.animation) {
          try {
            const raw = localStorage.getItem("hf_home_banner_fx");
            if (raw) return normalizeHomeBannerFx(JSON.parse(raw));
          } catch {}
        }

        return normalizeHomeBannerFx(cfg);
      } catch {
        try {
          const raw = localStorage.getItem("hf_home_banner_fx");
          if (raw) return normalizeHomeBannerFx(JSON.parse(raw));
        } catch {}
        return DEFAULT_HOME_BANNER_FX;
      }
    }

    async function loadHomepageCategoryRules() {
      try {
        const { data, error } = await supabase
          .from("system_settings")
          .select("key, value_json, updated_at")
          .eq("key", "app_homepage_categories")
          .order("updated_at", { ascending: false })
          .limit(1);

        if (error) throw error;

        const latest = Array.isArray(data) ? data[0] : null;
        return normalizeHomepageCategoryAdminRules(latest?.value_json || {});
      } catch (rulesErr: any) {
        console.warn("Homepage category rules load warning:", rulesErr?.message || String(rulesErr));
        return [];
      }
    }

    async function loadHomeFeaturedData(safeItems: MenuItem[], gItems: GroceryItem[]) {
      try {
        const homeFeaturedRes = await quietSelectFromTables([
          "home_featured_items",
          "home_page_featured_items",
          "featured_home_items",
        ]);

        if (!homeFeaturedRes.error && Array.isArray(homeFeaturedRes.data) && homeFeaturedRes.data.length > 0) {
          const rows = (homeFeaturedRes.data as HomeFeaturedRow[])
            .filter((row) => row?.is_enabled !== false)
            .sort((a, b) => {
              const ao = Number(a?.sort_order ?? 1e9);
              const bo = Number(b?.sort_order ?? 1e9);
              if (ao !== bo) return ao - bo;
              return String(a?.id || "").localeCompare(String(b?.id || ""));
            });

          const nextMenuIds: string[] = [];
          const nextGroceryIds: string[] = [];

          for (const row of rows) {
            const rowType = normalizeFeaturedType(row?.item_type || row?.entity_type || row?.type);

            if (rowType === "menu") {
              const mid = getFeaturedMenuId(row);
              if (mid) nextMenuIds.push(mid);
              continue;
            }

            if (rowType === "grocery") {
              const gid = getFeaturedGroceryId(row);
              if (gid) nextGroceryIds.push(gid);
              continue;
            }

            const mid = getFeaturedMenuId(row);
            if (mid) {
              nextMenuIds.push(mid);
              continue;
            }

            const gid = getFeaturedGroceryId(row);
            if (gid) {
              nextGroceryIds.push(gid);
              continue;
            }

            const fallbackItemId = String(row?.item_id || "").trim();
            if (fallbackItemId) {
              if (safeItems.some((x) => x.id === fallbackItemId)) nextMenuIds.push(fallbackItemId);
              else if (gItems.some((x) => x.id === fallbackItemId)) nextGroceryIds.push(fallbackItemId);
            }
          }

          return {
            featuredMenuIds: Array.from(new Set(nextMenuIds)),
            featuredGroceryIds: Array.from(new Set(nextGroceryIds)),
          };
        }
      } catch (hfErr: any) {
        console.warn("Home featured items load warning:", hfErr?.message || String(hfErr));
      }

      return { featuredMenuIds: [], featuredGroceryIds: [] };
    }

    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr && !String(userErr?.message || "").toLowerCase().includes("auth session missing")) {
        throw userErr;
      }

      const user = userData?.user;

      if (user?.id) {
        const { data: prof, error: profErr } = await supabase.from("profiles").select("role").eq("user_id", user.id).maybeSingle();
        if (profErr) throw profErr;

        const r = normalizeRole((prof as any)?.role);
        setRole(r);

        if (r === "owner" || r === "restaurant_owner") {
          router.push("/restaurants/dashboard");
          return;
        }

        if (r === "grocery_owner") {
          router.push("/groceries/owner/dashboard");
          return;
        }
      } else {
        setRole("");
      }

      const [restaurantData, groceryData, nextCategories, nextBannerData, nextBannerFx, nextHomepageCategoryRules] = await Promise.all([
        loadRestaurantsAndItems(),
        loadGroceries(),
        loadHomeCategories(),
        loadHomeBannerData(),
        loadHomeBannerFxSettings(),
        loadHomepageCategoryRules(),
      ]);

      setRestaurants(restaurantData.restList);
      setItems(restaurantData.safeItems);
      setGroceryStores(groceryData.gStores);
      setGroceryItems(groceryData.gItems);
      setHomeCategories(nextCategories);
      setHomeBanners(nextBannerData.homeBanners);
      setHomeBanner(nextBannerData.homeBanner);
      setBannerIndex(nextBannerData.bannerIndex);
      setBannerReady(true);
      setHomeBannerFx(nextBannerFx);
      setHomepageCategoryRules(nextHomepageCategoryRules);
      refreshCartState();
      setLoading(false);

      const nextFeaturedData = await loadHomeFeaturedData(restaurantData.safeItems, groceryData.gItems);
      setFeaturedMenuIds(nextFeaturedData.featuredMenuIds);
      setFeaturedGroceryIds(nextFeaturedData.featuredGroceryIds);
      setHomeFeaturedReady(true);

      writeHomeCache({
        restaurants: restaurantData.restList,
        items: restaurantData.safeItems,
        groceryStores: groceryData.gStores,
        groceryItems: groceryData.gItems,
        homeCategories: nextCategories,
        featuredMenuIds: nextFeaturedData.featuredMenuIds,
        featuredGroceryIds: nextFeaturedData.featuredGroceryIds,
        homeBanners: nextBannerData.homeBanners,
        homeBanner: nextBannerData.homeBanner,
        bannerIndex: nextBannerData.bannerIndex,
        homeBannerFx: nextBannerFx,
      });
    } catch (e: any) {
      setErr(e?.message || String(e));
      if (!silent) {
        setRestaurants([]);
        setItems([]);
        setGroceryStores([]);
        setGroceryItems([]);
        setHomeCategories([{ key: "recommended", label: "Recommended" }]);
        setFeaturedMenuIds([]);
        setFeaturedGroceryIds([]);
        setHomeFeaturedReady(true);
        setHomeBanners([]);
        setHomeBanner(null);
        setBannerIndex(0);
        setBannerReady(true);
        setHomeBannerFx(DEFAULT_HOME_BANNER_FX);
        setHomepageCategoryRules([]);
      }
    } finally {
      setLoading(false);
    }
  }

  function hydrateHomeFromCache() {
    const cached = readHomeCache();
    if (!cached) return false;

    setRestaurants(Array.isArray(cached.restaurants) ? cached.restaurants : []);
    setItems(Array.isArray(cached.items) ? cached.items : []);
    setGroceryStores(Array.isArray(cached.groceryStores) ? cached.groceryStores : []);
    setGroceryItems(Array.isArray(cached.groceryItems) ? cached.groceryItems : []);
    setHomeCategories(
      Array.isArray(cached.homeCategories) && cached.homeCategories.length > 0
        ? cached.homeCategories
        : [{ key: "recommended", label: "Recommended" }]
    );
    setFeaturedMenuIds(Array.isArray(cached.featuredMenuIds) ? cached.featuredMenuIds : []);
    setFeaturedGroceryIds(Array.isArray(cached.featuredGroceryIds) ? cached.featuredGroceryIds : []);
    setHomeFeaturedReady(true);
    setHomeBanners(Array.isArray(cached.homeBanners) ? cached.homeBanners : []);
    setHomeBanner(cached.homeBanner || null);
    setBannerIndex(Number(cached.bannerIndex || 0) || 0);
    setBannerReady(true);
    setHomeBannerFx(normalizeHomeBannerFx(cached.homeBannerFx));
    setLoading(false);
    return true;
  }

  useEffect(() => {
    // ✅ Currency bootstrap:
    // 1) quick set from localStorage for instant UI
    // 2) then fetch from DB and override localStorage (source of truth)
    (async () => {
      try {
        const c = localStorage.getItem("foodapp_currency");
        setCurrency(normalizeCurrency(c));
      } catch {
        setCurrency(DEFAULT_CURRENCY);
      }

      const dbCur = await fetchCurrencyFromDB();
      const normalized = normalizeCurrency(dbCur);

      setCurrency(normalized);
      try {
        localStorage.setItem("foodapp_currency", normalized);
      } catch {}
    })();

    const hasWarmCache = hydrateHomeFromCache();
    loadData({ silent: hasWarmCache });

    try {
      const rs = localStorage.getItem("recent_searches");
      if (rs) {
        const arr = JSON.parse(rs);
        if (Array.isArray(arr)) setRecent(arr.slice(0, 8));
      }
    } catch {}

    const onStorage = () => refreshCartState();
    const onCartUpdated = () => refreshCartState();
    const onFocus = () => refreshCartState();
    const onPageShow = () => refreshCartState();

    window.addEventListener("storage", onStorage);
    window.addEventListener(CART_EVT, onCartUpdated);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onPageShow);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelected(null);
        setSelectedGrocery(null);
      }
    };
    window.addEventListener("keydown", onKey);

    // ✅ PRO UI: sticky controls on scroll
    const onScroll = () => {
      setStickyOn(window.scrollY > 120);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CART_EVT, onCartUpdated);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll as any);
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

  useEffect(() => {
    const hasActive = homeCategories.some((c) => c.key === activeCat);
    if (!hasActive) setActiveCat("recommended");
  }, [homeCategories, activeCat]);

  // ✅ Banner rotation controller (no visual effects)
  const activeBanner: BannerItem | null = useMemo(() => {
    if (homeBanners && homeBanners.length > 0) {
      return homeBanners[bannerIndex] || homeBanners[0] || null;
    }
    if (homeBanner?.url) return { url: homeBanner.url, type: homeBanner.type, poster: homeBanner.poster ?? null };
    return null;
  }, [homeBanners, bannerIndex, homeBanner]);
  const bannerFrameKey = useMemo(() => {
    const url = activeBanner?.url || "none";
    const fx = normalizeHomeBannerFx(homeBannerFx);
    return `banner-frame-${bannerIndex}-${url}-${fx.animation}-${fx.duration_ms}`;
  }, [activeBanner?.url, bannerIndex, homeBannerFx]);

  useEffect(() => {
    const next = activeBanner || null;
    const prev = bannerPrevRef.current;
    const fx = normalizeHomeBannerFx(homeBannerFx);

    if (prev?.url && next?.url && prev.url !== next.url && fx.animation !== "none") {
      setLeavingBanner(prev);
      setLeavingBannerKey((n) => n + 1);

      const clearMs = Math.max(220, fx.duration_ms + 100);
      const t = window.setTimeout(() => {
        setLeavingBanner((current) => (current?.url === prev.url ? null : current));
      }, clearMs);

      bannerPrevRef.current = next;
      return () => window.clearTimeout(t);
    }

    bannerPrevRef.current = next;
    setLeavingBanner(null);
  }, [activeBanner?.url, bannerIndex, homeBannerFx]);

  useEffect(() => {
    if (bannerTimerRef.current) {
      window.clearTimeout(bannerTimerRef.current);
      bannerTimerRef.current = null;
    }

    if (!bannerReady) return;
    if (!activeBanner?.url) return;
    if (homeBanners.length <= 1) return;

    if (activeBanner.type === "image") {
      bannerTimerRef.current = window.setTimeout(() => {
        bannerNext();
      }, 5000);
    } else {
      bannerTimerRef.current = window.setTimeout(() => {
        bannerNext();
      }, 16000);
    }

    return () => {
      if (bannerTimerRef.current) {
        window.clearTimeout(bannerTimerRef.current);
        bannerTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bannerReady, activeBanner?.url, activeBanner?.type, bannerIndex, homeBanners.length]);

  const categoryCounts = useMemo(() => {
    const sourceItems =
      homeFeaturedReady && featuredMenuIds.length > 0
        ? (featuredMenuIds.map((id) => items.find((it) => it.id === id)).filter(Boolean) as MenuItem[])
        : [];

    const baseItems = homeFeaturedReady && featuredMenuIds.length > 0 ? sourceItems : items;

    const counts: Record<string, number> = { recommended: baseItems.length };

    for (const cat of homeCategories) {
      if (cat.key !== "recommended") counts[cat.key] = 0;
    }

    for (const it of baseItems) {
      const c = normCuisine(it.cuisine);
      const tags = c ? [c] : tagsFromName(it.name || "");
      for (const t of tags) if (counts[t] !== undefined) counts[t] += 1;
    }
    return counts;
  }, [items, homeCategories, featuredMenuIds, homeFeaturedReady]);

  const featuredItems = useMemo(() => {
    const s = q.trim().toLowerCase();
    const featuredIdSet = new Set(featuredMenuIds);
    let base = items;

    // ✅ NEW: if admin selected featured menu items, home uses only those
    if (homeFeaturedReady && featuredMenuIds.length > 0) {
      base = featuredMenuIds
        .map((id) => items.find((it) => it.id === id))
        .filter(Boolean) as MenuItem[];
    }

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

    if (homeFeaturedReady && featuredIdSet.size > 0) return base.slice(0, 12);

    return base.slice(0, 12);
  }, [items, q, activeCat, restaurantMap, vegOnly, bestsellerOnly, under199, inStockOnly, featuredMenuIds, homeFeaturedReady]);

  const featuredGroceryItems = useMemo(() => {
    const s = q.trim().toLowerCase();
    const featuredIdSet = new Set(featuredGroceryIds);
    let base = groceryItems;

    // ✅ NEW: if admin selected featured grocery items, home uses only those
    if (homeFeaturedReady && featuredGroceryIds.length > 0) {
      base = featuredGroceryIds
        .map((id) => groceryItems.find((it) => it.id === id))
        .filter(Boolean) as GroceryItem[];
    }

    if (s) {
      base = base.filter((it) => {
        const itemName = (it.name || "").toLowerCase();
        const storeName = (groceryStoreMap.get(it.store_id) || "").toLowerCase();
        return itemName.includes(s) || storeName.includes(s);
      });
    }

    const next = [...base];
    next.sort((a, b) => {
      const af = featuredIdSet.has(a.id) ? 0 : 1;
      const bf = featuredIdSet.has(b.id) ? 0 : 1;
      if (af !== bf) return af - bf;

      const as = a.in_stock === false ? 1 : 0;
      const bs = b.in_stock === false ? 1 : 0;
      if (as !== bs) return as - bs;

      const ab = a.is_best_seller ? 0 : 1;
      const bb = b.is_best_seller ? 0 : 1;
      if (ab !== bb) return ab - bb;

      return String(b.id).localeCompare(String(a.id));
    });

    return next.slice(0, 8);
  }, [groceryItems, q, groceryStoreMap, featuredGroceryIds, homeFeaturedReady]);

  const isDefaultHomepageView =
    activeCat === "recommended" && !q.trim() && !vegOnly && !bestsellerOnly && !under199 && !inStockOnly;

  const homepageCategorySections = useMemo(() => {
    if (!isDefaultHomepageView || homepageCategoryRules.length === 0) return [];

    const baseMenuItems =
      homeFeaturedReady && featuredMenuIds.length > 0
        ? (featuredMenuIds.map((id) => items.find((it) => it.id === id)).filter(Boolean) as MenuItem[])
        : items;

    const baseGroceryItems =
      homeFeaturedReady && featuredGroceryIds.length > 0
        ? (featuredGroceryIds.map((id) => groceryItems.find((it) => it.id === id)).filter(Boolean) as GroceryItem[])
        : groceryItems;

    const restaurantSections = buildHomepageCategorySectionsFromRules(baseMenuItems, "restaurant", homepageCategoryRules);
    const grocerySections = buildHomepageCategorySectionsFromRules(baseGroceryItems, "grocery", homepageCategoryRules);

    return [...restaurantSections, ...grocerySections].sort(
      (a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0) || a.label.localeCompare(b.label)
    );
  }, [
    isDefaultHomepageView,
    homepageCategoryRules,
    homeFeaturedReady,
    featuredMenuIds,
    featuredGroceryIds,
    items,
    groceryItems,
  ]);

  // kept for old logic safety; not rendered (rows removed)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const filteredGroceryStores = useMemo(() => {
    const s = q.trim().toLowerCase();
    let base = groceryStores;
    if (s) base = base.filter((r) => (r.name || "").toLowerCase().includes(s));
    return base.slice(0, 12);
  }, [groceryStores, q]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

  // ✅ PRO UI: skeleton helpers
  const skeletonCards = useMemo(() => Array.from({ length: 8 }).map((_, i) => i), []);
  const skeletonTitle = useMemo(() => Array.from({ length: 6 }).map((_, i) => i), []);

  /* ===========================
     ✅ PRO HERO: Slides builder
     =========================== */

  const heroFoodSlides = useMemo<HeroSlide[]>(() => {
    const source =
      homeFeaturedReady && featuredMenuIds.length > 0
        ? featuredMenuIds.map((id) => items.find((x) => x.id === id)).filter(Boolean)
        : items;

    const pick = (source as MenuItem[]).filter((x) => !!x.image_url).slice(0, 12);
    return pick.map((it) => ({
      key: `food-${it.id}`,
      kind: "food",
      title: it.name || "Featured dish",
      subtitle: getRestaurantName(it.restaurant_id),
      image_url: String(it.image_url || ""),
      hrefPrimary: "/menu",
      hrefSecondary: "/restaurants",
      badge: it.is_best_seller ? "Best Seller" : it.is_veg === true ? "Veg" : it.is_veg === false ? "Non-Veg" : "Food",
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, restaurantMap, featuredMenuIds, homeFeaturedReady]);

  const heroGrocerySlides = useMemo<HeroSlide[]>(() => {
    const source =
      homeFeaturedReady && featuredGroceryIds.length > 0
        ? featuredGroceryIds.map((id) => groceryItems.find((x) => x.id === id)).filter(Boolean)
        : groceryItems;

    const pick = (source as GroceryItem[]).filter((x) => !!x.image_url).slice(0, 12);
    return pick.map((it) => ({
      key: `grocery-${it.id}`,
      kind: "grocery",
      title: it.name || "Featured item",
      subtitle: getGroceryStoreName(it.store_id),
      image_url: String(it.image_url || ""),
      hrefPrimary: "/groceries",
      hrefSecondary: `/groceries?store=${encodeURIComponent(it.store_id)}`,
      badge: it.is_best_seller ? "Best Seller" : it.in_stock === false ? "Out of stock" : "Grocery",
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groceryItems, groceryStoreMap, featuredGroceryIds, homeFeaturedReady]);

  const heroSlides = useMemo<HeroSlide[]>(() => {
    const food = heroFoodSlides;
    const groc = heroGrocerySlides;

    if (heroTab === "food") return food;
    if (heroTab === "groceries") return groc;

    const mixed: HeroSlide[] = [];
    for (let i = 0; i < 10; i++) {
      if (food[i]) mixed.push(food[i]);
      if (groc[i]) mixed.push(groc[i]);
      if (mixed.length >= 10) break;
    }
    return mixed;
  }, [heroTab, heroFoodSlides, heroGrocerySlides]);

  useEffect(() => {
    setHeroIndex(0);
    setHeroBump((n) => n + 1);
  }, [heroTab, heroFoodSlides.length, heroGrocerySlides.length]);

  useEffect(() => {
    if (heroPaused) return;
    if (!heroSlides || heroSlides.length <= 1) return;

    const t = window.setInterval(() => {
      setHeroIndex((i) => {
        const next = i + 1;
        return next >= heroSlides.length ? 0 : next;
      });
    }, 3600);

    return () => window.clearInterval(t);
  }, [heroPaused, heroSlides, heroBump]);

  const activeHero = heroSlides[heroIndex] || null;

  const heroThumbs = useMemo(() => {
    return (heroSlides || []).slice(0, 8);
  }, [heroSlides]);

  function renderRestaurantCard(it: MenuItem) {
    const c = normCuisine(it.cuisine);
    const tags = c ? [c] : tagsFromName(it.name || "");
    const out = it.in_stock === false;
    const qty = cartMap[it.id] || 0;

    return (
      <div key={it.id} className="premiumCard" style={cardGlass}>
        <div style={{ ...imgWrap, cursor: "pointer" }} onClick={() => setSelected(it)} title="Click to view details">
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
          <div style={{ fontWeight: 950, color: "#111827" }}>{money(it.price, currency)}</div>
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
  }

  function renderGroceryCard(it: GroceryItem) {
    const out = it.in_stock === false;
    const qty = groceryCartMap[it.id] || 0;

    return (
      <div key={it.id} className="premiumCard" style={cardGlass}>
        <div style={{ ...imgWrap, cursor: "pointer" }} onClick={() => setSelectedGrocery(it)} title="Click to view details">
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
          <div style={{ fontWeight: 950, color: "#111827" }}>{money(it.price, currency)}</div>
        </div>

        <div style={{ marginTop: 6, color: "rgba(17,24,39,0.65)", fontSize: 13, fontWeight: 700 }}>
          {getGroceryStoreName(it.store_id)}
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {it.is_best_seller ? <span style={badgeBest}>BEST</span> : null}
          {out ? <span style={badgeOut}>OUT</span> : null}
          <span style={tag}>{cleanText(it.category) || "grocery"}</span>
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {qty <= 0 ? (
            <button
              onClick={() => incGrocery(it)}
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
              <button onClick={() => decGrocery(it)} style={stepBtn}>
                –
              </button>
              <div style={stepQty}>{qty}</div>
              <button onClick={() => incGrocery(it)} style={stepBtn} disabled={out}>
                +
              </button>
            </div>
          )}

          <button onClick={() => setSelectedGrocery(it)} style={btnSmallOutlineBtn}>
            Details
          </button>
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
  }

  function renderHomepageCategorySection(section: HomepageCategorySection) {
    return (
      <section key={`${section.kind}-${section.key}`}>
        <div style={rowTitle}>
          <h2 style={sectionTitle}>{section.label}</h2>
          <span style={subtle}>{section.kind === "grocery" ? "Fresh picks" : "Top picks"}</span>
        </div>

        <div className="hfScrollRow" style={scrollRow}>
          {section.kind === "grocery"
            ? section.items.map((item) => renderGroceryCard(item as GroceryItem))
            : section.items.map((item) => renderRestaurantCard(item as MenuItem))}
        </div>
      </section>
    );
  }

  return (
    <main style={pageBg}>
      <style jsx global>{`
        .premiumCard {
          transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease;
          will-change: transform;
        }
        .premiumCard:hover {
          transform: translateY(-4px);
          box-shadow: 0 18px 54px rgba(0, 0, 0, 0.12);
          border-color: rgba(17, 24, 39, 0.14);
        }
        .skeleton {
          position: relative;
          overflow: hidden;
          background: rgba(0, 0, 0, 0.06);
        }
        .skeleton::after {
          content: "";
          position: absolute;
          inset: 0;
          transform: translateX(-100%);
          background: linear-gradient(
            90deg,
            rgba(255, 255, 255, 0) 0%,
            rgba(255, 255, 255, 0.55) 45%,
            rgba(255, 255, 255, 0) 100%
          );
          animation: shimmer 1.15s infinite;
        }
        @keyframes shimmer {
          100% {
            transform: translateX(100%);
          }
        }

        @keyframes hfBannerFade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes hfBannerSlideLeft {
          from { opacity: 0; transform: translateX(24px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes hfBannerSlideUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes hfBannerZoomIn {
          from { opacity: 0; transform: scale(1.06); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes hfBannerFadeOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        @keyframes hfBannerSlideLeftOut {
          from { opacity: 1; transform: translateX(0); }
          to { opacity: 0; transform: translateX(-24px); }
        }
        @keyframes hfBannerSlideUpOut {
          from { opacity: 1; transform: translateY(0); }
          to { opacity: 0; transform: translateY(-24px); }
        }
        @keyframes hfBannerZoomOut {
          from { opacity: 1; transform: scale(1); }
          to { opacity: 0; transform: scale(0.97); }
        }

        /* ✅ Mobile: Filters in ONE horizontal scroll row */
        @media (max-width: 640px) {
          .filtersScrollRow {
            flex-wrap: nowrap !important;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            padding-bottom: 8px;
          }
          .filtersScrollRow > * {
            flex: 0 0 auto;
          }
          .filtersScrollRow::-webkit-scrollbar {
            height: 8px;
          }
          .filtersScrollRow::-webkit-scrollbar-thumb {
            background: rgba(15, 23, 42, 0.18);
            border-radius: 999px;
          }
        }

        /* ✅ Mobile: make cards 1-row horizontal scroll */
        .hfScrollRow {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(260px, 260px));
          justify-content: start;
          gap: 12px;
        }
        @media (max-width: 640px) {
          .hfScrollRow {
            display: flex;
            flex-wrap: nowrap;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            padding-bottom: 10px;
            scroll-snap-type: x mandatory;
          }
          .hfScrollRow > * {
            flex: 0 0 82%;
            max-width: 82%;
            scroll-snap-align: start;
          }
          .hfScrollRow::-webkit-scrollbar {
            height: 8px;
          }
          .hfScrollRow::-webkit-scrollbar-thumb {
            background: rgba(15, 23, 42, 0.18);
            border-radius: 999px;
          }
        }
      `}</style>

      {toast ? <div style={toastBox}>{toast}</div> : null}

      {cartCount > 0 ? (
        <Link href="/cart" style={floatingCart}>
          Cart ({cartCount}) →
        </Link>
      ) : null}

      {groceryCartCount > 0 ? (
        <Link href="/cart" style={floatingGroceryCart}>
          Grocery Cart ({groceryCartCount}) →
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
                  <span style={badgeLight}>{money(selected.price, currency)}</span>
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
                    <button onClick={() => dec(selected)} style={stepBtn} disabled={(cartMap[selected.id] || 0) <= 0}>
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

      {/* ✅ Grocery Details Modal */}
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
                <div style={{ fontSize: 20, fontWeight: 1000, color: "#0b1220" }}>{selectedGrocery.name || "Item"}</div>
                <div style={{ marginTop: 6, fontWeight: 900, color: "rgba(17,24,39,0.75)" }}>
                  {getGroceryStoreName(selectedGrocery.store_id)}
                </div>

                <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  {selectedGrocery.is_best_seller ? <span style={badgeBest}>BEST</span> : null}
                  {selectedGrocery.in_stock === false ? <span style={badgeOut}>OUT</span> : null}
                  <span style={badgeLight}>{money(selectedGrocery.price, currency)}</span>
                </div>

                <div style={{ marginTop: 10, color: "rgba(17,24,39,0.72)", fontWeight: 800, lineHeight: 1.5 }}>
                  {niceGroceryDesc(selectedGrocery, getGroceryStoreName(selectedGrocery.store_id))}
                </div>

                <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 950, color: "rgba(17,24,39,0.8)" }}>Quantity</div>
                  <div style={stepper}>
                    <button onClick={() => decGrocery(selectedGrocery)} style={stepBtn} disabled={(groceryCartMap[selectedGrocery.id] || 0) <= 0}>
                      –
                    </button>
                    <div style={stepQty}>{groceryCartMap[selectedGrocery.id] || 0}</div>
                    <button onClick={() => incGrocery(selectedGrocery)} style={stepBtn} disabled={selectedGrocery.in_stock === false}>
                      +
                    </button>
                  </div>
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
                  Note: Groceries uses a separate cart/dashboard (no mixing). Current grocery cart: <b>{groceryCartCount}</b>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div
        style={{
          width: "100%",
        }}
      >
        {showLegacyHomeBanner ? (
          <div style={heroBanner} aria-label="Home banner">
            <div style={heroSplashMedia}>
              {!bannerReady ? (
                <div style={heroImgPlaceholder}>Loading banner…</div>
              ) : activeBanner?.url ? (
                <>
                  {leavingBanner?.url ? (
                    <div
                      key={`banner-leaving-${leavingBannerKey}-${leavingBanner.url}`}
                      style={{
                        position: "absolute",
                        inset: 0,
                        zIndex: 1,
                        ...getHomeBannerAnimOutStyle(),
                      }}
                    >
                      {renderBannerMedia(leavingBanner, `banner-leaving-${leavingBannerKey}`)}
                    </div>
                  ) : null}

                  <div
                    key={bannerFrameKey}
                    style={{
                      position: "absolute",
                      inset: 0,
                      zIndex: 2,
                      ...getHomeBannerAnimStyle(),
                    }}
                  >
                    {renderBannerMedia(activeBanner, `banner-${bannerIndex}`)}
                  </div>
                </>
              ) : (
                <div style={heroImgPlaceholder}>Banner not set (add in admin)</div>
              )}
            </div>
          </div>
        ) : null}

        {/* ✅ Sticky Search + Filters Bar */}
        <div style={{ ...stickyWrap, ...(stickyOn ? stickyWrapOn : null) }}>
          <div style={{ ...stickyInner, ...(stickyOn ? stickyInnerOn : null) }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search restaurants, grocery items, or stores..." style={search} />

            <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              {recent.length > 0 ? (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
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
              ) : (
                <span />
              )}
            </div>

            <div className="filtersScrollRow" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
              {homeCategories.map((c) => (
                <button key={c.key} onClick={() => setActiveCat(c.key)} style={activeCat === c.key ? chipActive : chip}>
                  {c.label} <span style={countPill}>{c.key === "recommended" ? featuredItems.length : categoryCounts[c.key] || 0}</span>
                </button>
              ))}
              <button onClick={() => loadData()} style={chip}>
                Refresh
              </button>

              <button onClick={() => setVegOnly((v) => !v)} style={vegOnly ? chipActive : chip}>
                Veg Only
              </button>
              <button onClick={() => setBestsellerOnly((v) => !v)} style={bestsellerOnly ? chipActive : chip}>
                Bestseller
              </button>
              <button onClick={() => setUnder199((v) => !v)} style={under199 ? chipActive : chip}>
                Under {currency === "USD" ? "$199" : "₹199"}
              </button>
              <button onClick={() => setInStockOnly((v) => !v)} style={inStockOnly ? chipActive : chip}>
                In Stock
              </button>
            </div>
          </div>
        </div>

        {err ? <div style={alertErr}>{err}</div> : null}

        {/* ✅ Skeleton loader */}
        {loading ? (
          <>
            <div style={rowTitle}>
              <h2 style={sectionTitle}>Loading picks…</h2>
              <span style={subtle}>Please wait</span>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
              {skeletonTitle.map((i) => (
                <div
                  key={i}
                  className="skeleton"
                  style={{
                    height: 36,
                    width: 120,
                    borderRadius: 999,
                    border: "1px solid rgba(0,0,0,0.08)",
                    background: "rgba(255,255,255,0.65)",
                  }}
                />
              ))}
            </div>

            <div style={{ marginTop: 12, ...grid }}>
              {skeletonCards.map((i) => (
                <div key={i} className="premiumCard" style={cardGlass}>
                  <div className="skeleton" style={{ ...imgWrap, height: 150 }} />
                  <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                    <div className="skeleton" style={{ height: 16, width: "78%", borderRadius: 10 }} />
                    <div className="skeleton" style={{ height: 12, width: "55%", borderRadius: 10 }} />
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <div className="skeleton" style={{ height: 22, width: 62, borderRadius: 999 }} />
                      <div className="skeleton" style={{ height: 22, width: 72, borderRadius: 999 }} />
                      <div className="skeleton" style={{ height: 22, width: 58, borderRadius: 999 }} />
                    </div>
                    <div style={{ display: "flex", gap: 10 }}>
                      <div className="skeleton" style={{ height: 34, width: 120, borderRadius: 12 }} />
                      <div className="skeleton" style={{ height: 34, width: 90, borderRadius: 12 }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            {homepageCategorySections.length > 0 ? (
              <>{homepageCategorySections.map((section) => renderHomepageCategorySection(section))}</>
            ) : (
              <>
                <div style={rowTitle}>
                  <h2 style={sectionTitle}>
                    {activeCat === "recommended" ? "Recommended for you" : `Top ${homeCategories.find((x) => x.key === activeCat)?.label || ""}`}
                  </h2>
                  <span style={subtle}>
                    {vegOnly || bestsellerOnly || under199 || inStockOnly
                      ? "Filters applied"
                      : q.trim()
                        ? "Search results"
                        : "Top picks"}
                  </span>
                </div>

                {featuredItems.length === 0 ? (
                  <div style={emptyBox}>No items found. Try clearing filters or ask admin to add Home featured items.</div>
                ) : (
                  <div className="hfScrollRow" style={scrollRow}>
                    {featuredItems.map((it) => renderRestaurantCard(it))}
                  </div>
                )}

                <div style={rowTitle}>
                  <h2 style={sectionTitle}>Groceries for you</h2>
                  <span style={subtle}>
                    {featuredGroceryItems.length > 0 ? (q.trim() ? "Matching grocery picks" : "Fresh picks") : "No grocery items yet"}
                  </span>
                </div>

                {featuredGroceryItems.length === 0 ? (
                  <div style={emptyBox}>No grocery items found. Once admin adds Home featured grocery items, they will show here.</div>
                ) : (
                  <div className="hfScrollRow" style={scrollRow}>
                    {featuredGroceryItems.map((it) => renderGroceryCard(it))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}

/* ======= Styles (inline only) ======= */

const proFont =
  'Okra, Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji"';

const pageBg: React.CSSProperties = {
  minHeight: "calc(100vh - 64px)",
  padding: 20,
  background:
    "radial-gradient(1200px 600px at 20% 10%, rgba(255,140,0,0.22), transparent 62%), radial-gradient(900px 520px at 80% 18%, rgba(80,160,255,0.20), transparent 58%), linear-gradient(180deg, #f7f7fb, #ffffff)",
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
  whiteSpace: "nowrap",
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

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(260px, 260px))",
  gap: 12,
  justifyContent: "start",
};

const scrollRow: React.CSSProperties = {
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

const floatingGroceryCart: React.CSSProperties = {
  position: "fixed",
  right: 16,
  bottom: 72,
  zIndex: 9999,
  padding: "12px 14px",
  borderRadius: 999,
  border: "1px solid rgba(22,163,74,0.95)",
  background: "rgba(22,163,74,0.95)",
  color: "#fff",
  textDecoration: "none",
  fontWeight: 950,
  boxShadow: "0 14px 40px rgba(0,0,0,0.22)",
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

const stickyWrap: React.CSSProperties = {
  position: "sticky",
  top: 74,
  zIndex: 50,
  marginTop: 0,
  transition: "all 180ms ease",
};

const stickyWrapOn: React.CSSProperties = {
  top: 64,
};

const stickyInner: React.CSSProperties = {
  borderRadius: 18,
  padding: 14,
  background: "rgba(255,255,255,0.70)",
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 10px 30px rgba(0,0,0,0.05)",
  backdropFilter: "blur(10px)",
  transition: "all 180ms ease",
};

const stickyInnerOn: React.CSSProperties = {
  background: "rgba(255,255,255,0.88)",
  boxShadow: "0 18px 55px rgba(0,0,0,0.10)",
  border: "1px solid rgba(17,24,39,0.10)",
};

const heroBanner: React.CSSProperties = {
  marginTop: -24,
  marginLeft: -20,
  marginRight: -20,
  width: "calc(100% + 40px)",
  borderRadius: 0,
  border: "none",
  background: "#fff",
  boxShadow: "none",
  overflow: "hidden",
  position: "relative",
};

const heroSplashMedia: React.CSSProperties = {
  position: "relative",
  width: "100%",
  height: "clamp(300px, 38vw, 440px)",
  borderRadius: 0,
  overflow: "hidden",
  background: "#f3f4f6",
};

const heroSplashImg: React.CSSProperties = {
  display: "block",
  width: "100%",
  height: "100%",
  objectFit: "cover",
};

const heroSplashVideo: React.CSSProperties = {
  display: "block",
  width: "100%",
  height: "100%",
  objectFit: "cover",
  background: "transparent",
};

const heroImgPlaceholder: React.CSSProperties = {
  width: "100%",
  height: "100%",
  display: "grid",
  placeItems: "center",
  color: "rgba(17,24,39,0.60)",
  fontWeight: 950,
  background: "rgba(255,255,255,0.70)",
};
