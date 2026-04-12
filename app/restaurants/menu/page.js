"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import supabase from "@/lib/supabase";

/* =========================
   PREMIUM THEME (inline safe)
   ========================= */

const pageBg = {
  minHeight: "calc(100vh - 64px)",
  padding: 20,
  background:
    "radial-gradient(1200px 600px at 20% 10%, rgba(255,140,0,0.22), transparent 62%), radial-gradient(900px 520px at 80% 18%, rgba(80,160,255,0.20), transparent 58%), linear-gradient(180deg, #f7f7fb, #ffffff)",
};

const heroGlass = {
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
  fontSize: 34,
  fontWeight: 1000,
  color: "#0b1220",
  letterSpacing: -0.2,
};

const subText = {
  marginTop: 8,
  color: "rgba(17,24,39,0.7)",
  fontWeight: 800,
};

const cardGlass = {
  borderRadius: 18,
  padding: 14,
  background: "rgba(255,255,255,0.78)",
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 12px 36px rgba(0,0,0,0.08)",
  backdropFilter: "blur(10px)",
};

const panelGlass = {
  borderRadius: 18,
  padding: 16,
  background: "rgba(255,255,255,0.75)",
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 12px 36px rgba(0,0,0,0.07)",
  backdropFilter: "blur(10px)",
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
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
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
  gap: 8,
};

const btnSmall = {
  ...btnLight,
  padding: "8px 12px",
  borderRadius: 14,
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

const noteBox = {
  marginTop: 12,
  padding: 12,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(255,255,255,0.85)",
  borderRadius: 14,
  color: "rgba(17,24,39,0.75)",
  fontWeight: 900,
  fontSize: 12,
};

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.9)",
  outline: "none",
  fontWeight: 850,
};

const label = {
  fontWeight: 950,
  fontSize: 12,
  marginBottom: 6,
  color: "rgba(17,24,39,0.75)",
};

/* ✅ UI FIX: customer-like grid (fixed card width, no stretch) */
const grid = {
  marginTop: 14,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(260px, 320px))",
  gap: 12,
  justifyContent: "start",
  alignItems: "start",
};

const imgWrap = {
  width: "100%",
  height: 150,
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.08)",
  overflow: "hidden",
  background: "rgba(0,0,0,0.03)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const img = { width: "100%", height: "100%", objectFit: "cover" };

const imgPlaceholder = {
  color: "rgba(17,24,39,0.45)",
  fontSize: 12,
  fontWeight: 950,
};

const tag = {
  fontSize: 12,
  padding: "5px 10px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.7)",
  fontWeight: 900,
  color: "rgba(17,24,39,0.8)",
};

const comboChip = {
  ...tag,
  cursor: "pointer",
  padding: "9px 14px",
  background: "rgba(255,255,255,0.92)",
};

const comboChipActive = {
  ...comboChip,
  background: "rgba(17,24,39,0.92)",
  border: "1px solid rgba(17,24,39,0.92)",
  color: "#fff",
};

const comboSelectedCard = {
  ...cardGlass,
  padding: 12,
};

const comboSavedCard = {
  ...cardGlass,
  padding: 14,
};

const badgeVeg = {
  fontSize: 11,
  padding: "3px 8px",
  borderRadius: 999,
  border: "1px solid rgba(34,197,94,0.35)",
  background: "rgba(34,197,94,0.10)",
  fontWeight: 1000,
  color: "rgba(17,24,39,0.85)",
};

const badgeNonVeg = {
  fontSize: 11,
  padding: "3px 8px",
  borderRadius: 999,
  border: "1px solid rgba(239,68,68,0.30)",
  background: "rgba(239,68,68,0.10)",
  fontWeight: 1000,
  color: "rgba(17,24,39,0.85)",
};

const badgeBest = {
  fontSize: 11,
  padding: "3px 8px",
  borderRadius: 999,
  border: "1px solid rgba(59,130,246,0.30)",
  background: "rgba(59,130,246,0.10)",
  fontWeight: 1000,
  color: "rgba(17,24,39,0.85)",
};

const badgeIn = {
  fontSize: 11,
  padding: "3px 8px",
  borderRadius: 999,
  border: "1px solid rgba(16,185,129,0.25)",
  background: "rgba(16,185,129,0.10)",
  fontWeight: 1000,
  color: "rgba(17,24,39,0.85)",
};

const badgeOut = {
  fontSize: 11,
  padding: "3px 8px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(0,0,0,0.06)",
  fontWeight: 1000,
  color: "rgba(17,24,39,0.75)",
};

const toastBox = {
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

const overlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  overflowY: "auto",
  zIndex: 9998,
};

const modal = {
  width: "min(820px, 100%)",
  maxHeight: "calc(100vh - 32px)",
  borderRadius: 18,
  border: "1px solid rgba(255,255,255,0.16)",
  background: "rgba(255,255,255,0.92)",
  boxShadow: "0 30px 80px rgba(0,0,0,0.30)",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
};

const modalHeader = {
  padding: 14,
  borderBottom: "1px solid rgba(0,0,0,0.08)",
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
};

const modalBody = { padding: 14, overflowY: "auto", flex: 1 };

const split2 = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 };
const split3 = { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 };

/* =========================================================
   ✅ CURRENCY SUPPORT (SAFE, FORMATTING ONLY)
   - Default stays INR to avoid breaking old behavior
   - Uses localStorage "foodapp_currency" just like cart page
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

  // Preserve OLD look: INR had no decimals
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

function pick(obj, keys, fallback = null) {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null && String(obj[k]).trim() !== "") return obj[k];
  }
  return fallback;
}

function safeNumber(v, fallback = 0) {
  const n = Number(v);
  return isFinite(n) ? n : fallback;
}

// (kept for backward compatibility; no longer used in UI)
function moneyINR(v) {
  const n = Number(v || 0);
  if (!isFinite(n)) return "₹0";
  return `₹${n.toFixed(0)}`;
}

function normalizeRole(r) {
  return String(r || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function normCuisine(v) {
  return String(v || "").trim().toLowerCase().replace(/\s+/g, "_");
}

function text(v) {
  return String(v || "").trim();
}

async function fetchMenuItemMetaMap(itemIds) {
  const ids = Array.isArray(itemIds) ? itemIds.map((id) => text(id)).filter(Boolean) : [];
  if (!ids.length) return {};
  const res = await fetch(`/api/menu-item-meta?item_ids=${encodeURIComponent(ids.join(","))}`, { cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) throw new Error(json?.error || "Unable to load menu item pricing.");
  return json.items || {};
}

async function saveMenuItemMeta(itemId, meta) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error("Please sign in again.");
  const res = await fetch("/api/menu-item-meta", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ itemId, meta }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) throw new Error(json?.error || "Unable to save menu item pricing.");
  return json.meta || meta;
}

async function fetchOwnerComboDeals(kind, entityId) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error("Please sign in again.");
  const res = await fetch(`/api/combo-deals?kind=${encodeURIComponent(kind)}&entity_id=${encodeURIComponent(entityId)}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) throw new Error(json?.error || "Unable to load combo deals.");
  return Array.isArray(json?.combos) ? json.combos : [];
}

async function saveOwnerComboDeals(kind, entityId, combos) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error("Please sign in again.");
  const res = await fetch("/api/combo-deals", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ kind, entityId, combos }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) throw new Error(json?.error || "Unable to save combo deals.");
  return Array.isArray(json?.combos) ? json.combos : [];
}

function buildVariantLabel(value, unit) {
  const rawValue = String(value || "").trim();
  const rawUnit = String(unit || "").trim();
  if (!rawValue && !rawUnit) return "";
  return [rawValue, rawUnit].filter(Boolean).join(" ");
}

function priceSummary(item) {
  const base = safeNumber(item?.price, 0);
  const original = safeNumber(item?.original_price, 0);
  const discount = safeNumber(item?.discount_price, 0);
  const effective = discount > 0 ? discount : base;
  const compareAt = original > effective ? original : base > effective ? base : 0;
  const percent = compareAt > effective ? Math.max(1, Math.round(((compareAt - effective) / compareAt) * 100)) : 0;
  return { effective, compareAt, percent };
}

/* =========================
   MAIN PAGE
   ========================= */

const BUCKET = "menu-images"; // ✅ as per your screenshot

export default function RestaurantManageMenuPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const [note, setNote] = useState("");

  // ✅ Currency state (default INR; reads preference once)
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);

  // identity
  const [ownerEmail, setOwnerEmail] = useState("");
  const [role, setRole] = useState("");
  const [ownerId, setOwnerId] = useState("");

  // owner restaurants
  const [restaurants, setRestaurants] = useState([]);
  const [restaurantId, setRestaurantId] = useState("");
  const [restaurantName, setRestaurantName] = useState("");

  // items
  const [items, setItems] = useState([]);
  const [comboDeals, setComboDeals] = useState([]);
  const [comboBusy, setComboBusy] = useState(false);
  const [comboTitle, setComboTitle] = useState("");
  const [comboOriginalPrice, setComboOriginalPrice] = useState("");
  const [comboDiscountPrice, setComboDiscountPrice] = useState("");
  const [comboSearch, setComboSearch] = useState("");
  const [comboSelectedIds, setComboSelectedIds] = useState([]);
  const [comboVariantByItemId, setComboVariantByItemId] = useState({});

  // filters
  const [q, setQ] = useState("");
  const [vegMode, setVegMode] = useState("all"); // all | veg | non_veg
  const [stockMode, setStockMode] = useState("all"); // all | in | out | best

  // modal
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // form
  const [editingId, setEditingId] = useState(null);

  const [fName, setFName] = useState("");
  const [fOriginalPrice, setFOriginalPrice] = useState("");
  const [fDiscountPrice, setFDiscountPrice] = useState("");
  const [fCuisine, setFCuisine] = useState("");
  const [fIsVeg, setFIsVeg] = useState(true);
  const [fInStock, setFInStock] = useState(true);
  const [fBest, setFBest] = useState(false);
  const [fImageUrl, setFImageUrl] = useState("");

  // ✅ Taxable flag (default true)
  const [isTaxable, setIsTaxable] = useState(true);

  // PRO fields (safe-save)
  const [fDescription, setFDescription] = useState("");
  const [fSpiceLevel, setFSpiceLevel] = useState("medium"); // mild | medium | hot | extra_hot
  const [fAllergens, setFAllergens] = useState(""); // comma separated
  const [fCalories, setFCalories] = useState("");
  const [fPrepMins, setFPrepMins] = useState("");
  const [variantUnit, setVariantUnit] = useState("lb");
  const [variantLabel, setVariantLabel] = useState("");
  const [variantOriginalPrice, setVariantOriginalPrice] = useState("");
  const [variantDiscountPrice, setVariantDiscountPrice] = useState("");
  const [variantInStock, setVariantInStock] = useState(true);
  const [weightOptions, setWeightOptions] = useState([]);

  const fileRef = useRef(null);

  // ✅ Read currency preference once (NO writes)
  useEffect(() => {
    try {
      const c = localStorage.getItem("foodapp_currency");
      setCurrency(normalizeCurrency(c));
    } catch {
      setCurrency(DEFAULT_CURRENCY);
    }
  }, []);

  function showToast(msg) {
    setToast(msg);
    window.setTimeout(() => setToast(""), 1400);
  }

  function openAddModal() {
    setEditingId(null);
    setFName("");
    setFOriginalPrice("");
    setFDiscountPrice("");
    setFCuisine("");
    setFIsVeg(true);
    setFInStock(true);
    setFBest(false);
    setFImageUrl("");

    // ✅ Default tax ON for new items
    setIsTaxable(true);

    setFDescription("");
    setFSpiceLevel("medium");
    setFAllergens("");
    setFCalories("");
    setFPrepMins("");
    setVariantUnit("lb");
    setVariantLabel("");
    setVariantOriginalPrice("");
    setVariantDiscountPrice("");
    setVariantInStock(true);
    setWeightOptions([]);

    setModalOpen(true);
  }

  function openEditModal(it) {
    setEditingId(it.id);
    setFName(it.name || "");
    setFOriginalPrice(String(pick(it, ["original_price"], it.price ?? "") || ""));
    setFDiscountPrice(String(pick(it, ["discount_price"], "") || ""));
    setFCuisine(it.cuisine || "");
    setFIsVeg(it.is_veg === true);
    setFInStock(it.in_stock !== false);
    setFBest(it.is_best_seller === true);
    setFImageUrl(it.image_url || "");

    // ✅ Load from DB if exists, otherwise default true
    setIsTaxable(it?.is_taxable === false ? false : true);

    setFDescription(pick(it, ["description", "item_description"], "") || "");
    setFSpiceLevel(pick(it, ["spice_level", "spicy_level"], "medium") || "medium");
    setFAllergens(pick(it, ["allergens", "allergy_info"], "") || "");
    setFCalories(String(pick(it, ["calories", "kcal"], "") || ""));
    setFPrepMins(String(pick(it, ["prep_mins", "prep_time_mins"], "") || ""));
    setVariantUnit("lb");
    setVariantLabel("");
    setVariantOriginalPrice("");
    setVariantDiscountPrice("");
    setVariantInStock(true);
    const variants = Array.isArray(it?.variants)
      ? it.variants.map((row, idx) => ({
          ...row,
          id: text(row?.id) || `variant_${idx + 1}`,
          label: text(row?.label),
          unit: text(row?.unit) || "lb",
          value: row?.value == null ? null : safeNumber(row?.value, 0),
          price: safeNumber(row?.price, 0),
          original_price: safeNumber(pick(row, ["original_price"], row?.price), 0),
          discount_price: safeNumber(pick(row, ["discount_price"], 0), 0) || null,
          discount_percent: safeNumber(pick(row, ["discount_percent"], 0), 0) || 0,
          in_stock: row?.in_stock !== false,
          is_default: row?.is_default === true || idx === 0,
          sort_order: safeNumber(row?.sort_order, idx),
        }))
      : [];
    setWeightOptions(variants);

    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setSaving(false);
    setNote("");
  }

  function addWeightOption() {
    const label = buildVariantLabel(variantLabel, variantUnit);
    const originalPrice = safeNumber(variantOriginalPrice, NaN);
    const discountPrice = safeNumber(variantDiscountPrice, 0);
    const effectivePrice = discountPrice > 0 ? discountPrice : originalPrice;
    if (!label) return setErr("Enter variant value and unit.");
    if (!isFinite(originalPrice) || originalPrice <= 0) return setErr("Variant original price must be > 0.");
    if (discountPrice > 0 && discountPrice >= originalPrice) return setErr("Variant discount price must be smaller than original price.");
    if ((weightOptions || []).some((row) => text(row?.label).toLowerCase() === label.toLowerCase())) {
      return setErr("This variant already exists.");
    }
    setWeightOptions((prev) => [
      ...(prev || []),
      {
        id: `local_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        label,
        unit: variantUnit,
        value: safeNumber(variantLabel, null),
        price: effectivePrice,
        original_price: originalPrice,
        discount_price: discountPrice > 0 ? discountPrice : null,
        discount_percent: discountPrice > 0 ? Math.max(1, Math.round(((originalPrice - discountPrice) / originalPrice) * 100)) : 0,
        in_stock: !!variantInStock,
        is_default: (prev || []).length === 0,
        sort_order: (prev || []).length,
      },
    ]);
    setVariantLabel("");
    setVariantOriginalPrice("");
    setVariantDiscountPrice("");
    setVariantInStock(true);
  }

  async function loadIdentity() {
    const { data } = await supabase.auth.getSession();
    const session = data?.session;
    if (!session?.user) throw new Error("Not logged in.");

    setOwnerEmail(session.user.email || "");
    setOwnerId(session.user.id);

    const { data: prof } = await supabase.from("profiles").select("role").eq("user_id", session.user.id).maybeSingle();
    setRole(normalizeRole(prof?.role || "restaurant_owner"));

    return session.user.id;
  }

  async function loadOwnerRestaurants(uid) {
    // ✅ OWNER ONLY: fix issue - owner must ONLY see their restaurants
    const { data, error } = await supabase
      .from("restaurants")
      .select("id, name")
      .eq("owner_user_id", uid)
      .order("id", { ascending: false });

    if (error) throw error;

    const list = data || [];
    setRestaurants(list);

    if (!restaurantId && list.length > 0) {
      setRestaurantId(list[0].id);
      setRestaurantName(list[0].name || "");
    } else {
      const found = list.find((x) => x.id === restaurantId);
      if (found) setRestaurantName(found.name || "");
    }

    if (list.length === 0) {
      setRestaurantId("");
      setRestaurantName("");
      setItems([]);
    }
  }

  async function loadMenu(rid) {
    if (!rid) {
      setItems([]);
      setComboDeals([]);
      return;
    }

    const { data, error } = await supabase.from("menu_items").select("*").eq("restaurant_id", rid).order("id", { ascending: false });
    if (error) throw error;
    const rows = data || [];
    let metaMap = {};
    try {
      metaMap = await fetchMenuItemMetaMap(rows.map((row) => row.id));
    } catch {}

    setItems(
      rows.map((row) => {
        const meta = metaMap?.[String(row.id)] || {};
        const variants = Array.isArray(meta?.variants) ? meta.variants : [];
        const defaultVariant = variants.find((variant) => variant?.is_default) || variants[0] || null;
        return {
          ...row,
          original_price: meta?.original_price || row?.price || null,
          discount_price: meta?.discount_price || null,
          discount_percent: meta?.discount_percent || null,
          variants,
          variants_count: variants.length,
          price: defaultVariant?.price || row?.price,
        };
      })
    );

    const nextCombos = await fetchOwnerComboDeals("restaurant", rid).catch(() => []);
    setComboDeals(nextCombos);
  }

  async function loadAll() {
    setLoading(true);
    setErr("");
    setNote("");
    try {
      const uid = await loadIdentity();
      await loadOwnerRestaurants(uid);
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!restaurantId) return;
    setLoading(true);
    setErr("");
    setNote("");

    loadMenu(restaurantId)
      .catch((e) => setErr(e?.message || String(e)))
      .finally(() => setLoading(false));

    const found = restaurants.find((r) => r.id === restaurantId);
    if (found) setRestaurantName(found.name || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  const kpi = useMemo(() => {
    const total = items.length;
    const inStock = items.filter((x) => x.in_stock !== false).length;
    const outStock = total - inStock;
    const best = items.filter((x) => x.is_best_seller === true).length;
    return { total, inStock, outStock, best };
  }, [items]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    let base = [...items];

    if (s) base = base.filter((x) => String(x.name || "").toLowerCase().includes(s));

    if (vegMode !== "all") {
      base = base.filter((x) => {
        if (vegMode === "veg") return x.is_veg === true;
        return x.is_veg === false;
      });
    }

    if (stockMode !== "all") {
      base = base.filter((x) => {
        if (stockMode === "in") return x.in_stock !== false;
        if (stockMode === "out") return x.in_stock === false;
        if (stockMode === "best") return x.is_best_seller === true;
        return true;
      });
    }

    return base;
  }, [items, q, vegMode, stockMode]);

  const comboPickerItems = useMemo(() => {
    const searchTerm = text(comboSearch).toLowerCase();
    const base = [...filtered];
    if (!searchTerm) return base.slice(0, 30);
    return base
      .filter((item) =>
        `${item?.name || ""} ${item?.cuisine || ""} ${item?.description || ""}`.toLowerCase().includes(searchTerm)
      )
      .slice(0, 30);
  }, [comboSearch, filtered]);

  async function tryUpdateMenuItemFields(itemId, patch) {
    let anySaved = false;
    let anyFailed = false;

    for (const [k, v] of Object.entries(patch)) {
      try {
        const { error } = await supabase.from("menu_items").update({ [k]: v }).eq("id", itemId);
        if (error) anyFailed = true;
        else anySaved = true;
      } catch {
        anyFailed = true;
      }
    }

    return { anySaved, anyFailed };
  }

  async function saveItem() {
    setErr("");
    setNote("");
    setSaving(true);

    if (!restaurantId) {
      setErr("Please create/select a restaurant first.");
      setSaving(false);
      return;
    }

    const name = text(fName);
    const originalPrice = safeNumber(fOriginalPrice, 0);
    const discountPrice = safeNumber(fDiscountPrice, 0);
    const effectivePrice = discountPrice > 0 ? discountPrice : originalPrice;
    const cuisine = text(fCuisine);

    if (!name) {
      setErr("Item name is required.");
      setSaving(false);
      return;
    }
    if (!originalPrice || originalPrice <= 0) {
      setErr("Original price must be > 0");
      setSaving(false);
      return;
    }
    if (discountPrice > 0 && discountPrice >= originalPrice) {
      setErr("Discount price must be smaller than original price.");
      setSaving(false);
      return;
    }
    if (!effectivePrice || effectivePrice <= 0) {
      setErr("Price must be > 0");
      setSaving(false);
      return;
    }

    const basePayload = {
      restaurant_id: restaurantId,
      name,
      price: effectivePrice,
      cuisine: cuisine || null,
      image_url: text(fImageUrl) || null,
      is_veg: !!fIsVeg,
      in_stock: !!fInStock,
      is_best_seller: !!fBest,
    };

    const desiredExtras = {
      description: text(fDescription) || null,
      spice_level: text(fSpiceLevel) || null,
      allergens: text(fAllergens) || null,
      calories: fCalories === "" ? null : safeNumber(fCalories, null),
      prep_mins: fPrepMins === "" ? null : safeNumber(fPrepMins, null),

      // ✅ Taxable flag (safe-save; requires menu_items.is_taxable column)
      is_taxable: !!isTaxable,
      original_price: originalPrice > effectivePrice ? originalPrice : null,
      discount_price: discountPrice > 0 && discountPrice < Math.max(originalPrice || 0, effectivePrice) ? discountPrice : null,
      discount_percent:
        originalPrice > effectivePrice
          ? Math.max(1, Math.round(((originalPrice - effectivePrice) / originalPrice) * 100))
          : null,
    };
    const metaPayload = {
      original_price: originalPrice,
      discount_price: discountPrice > 0 && discountPrice < Math.max(originalPrice || 0, effectivePrice) ? discountPrice : null,
      discount_percent:
        originalPrice > effectivePrice
          ? Math.max(1, Math.round(((originalPrice - effectivePrice) / originalPrice) * 100))
          : 0,
      variants: (Array.isArray(weightOptions) ? weightOptions : []).map((row, idx) => ({
        id: text(row?.id) || `variant_${idx + 1}`,
        label: text(row?.label),
        unit: text(row?.unit) || null,
        value: row?.value == null ? null : safeNumber(row?.value, 0),
        price: safeNumber(row?.price, 0),
        original_price: safeNumber(row?.original_price ?? row?.price, 0),
        discount_price: safeNumber(row?.discount_price, 0) || null,
        discount_percent: safeNumber(row?.discount_percent, 0) || 0,
        in_stock: row?.in_stock !== false,
        is_default: row?.is_default === true || idx === 0,
        sort_order: idx,
      })),
    };

    try {
      if (!editingId) {
        const { data: inserted, error: insErr } = await supabase.from("menu_items").insert([basePayload]).select("*").maybeSingle();
        if (insErr) throw insErr;

        const newId = inserted?.id;
        if (newId) {
          const { anyFailed } = await tryUpdateMenuItemFields(newId, desiredExtras);
          await saveMenuItemMeta(newId, metaPayload);
          if (anyFailed) {
            setNote(
              "Note: Some pro fields (description/spice/allergens/calories/prep/taxable/pricing) may not be saved because your menu_items table may not have those columns yet. UI still works."
            );
          }
        }

        showToast("Item added ✅");
      } else {
        const { error: upErr } = await supabase.from("menu_items").update(basePayload).eq("id", editingId);
        if (upErr) throw upErr;

        const { anyFailed } = await tryUpdateMenuItemFields(editingId, desiredExtras);
        await saveMenuItemMeta(editingId, metaPayload);
        if (anyFailed) {
          setNote(
            "Note: Some pro fields (description/spice/allergens/calories/prep/taxable/pricing) may not be saved because your menu_items table may not have those columns yet. UI still works."
          );
        }

        showToast("Item updated ✅");
      }

      await loadMenu(restaurantId);
      closeModal();
    } catch (e) {
      setErr(e?.message || String(e));
      setSaving(false);
    }
  }

  async function toggleField(it, field, next) {
    setErr("");
    try {
      const { error } = await supabase.from("menu_items").update({ [field]: next }).eq("id", it.id);
      if (error) throw error;
      setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, [field]: next } : x)));
    } catch (e) {
      setErr(e?.message || String(e));
    }
  }

  async function deleteItem(it) {
    const ok = confirm(`Delete "${it.name}"? This cannot be undone.`);
    if (!ok) return;

    setErr("");
    try {
      const { error } = await supabase.from("menu_items").delete().eq("id", it.id);
      if (error) throw error;
      setItems((prev) => prev.filter((x) => x.id !== it.id));
      showToast("Deleted ✅");
    } catch (e) {
      setErr(e?.message || String(e));
    }
  }

  async function uploadImage(file) {
    setErr("");
    setNote("");

    if (!file) return;
    if (!restaurantId) return setErr("Select restaurant first.");

    try {
      const ext = file.name.split(".").pop() || "jpg";
      const cleanName = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${restaurantId}/${Date.now()}_${cleanName}`;

      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        cacheControl: "3600",
        upsert: true,
        contentType: file.type || `image/${ext}`,
      });

      if (upErr) throw upErr;

      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const publicUrl = data?.publicUrl;

      if (!publicUrl) {
        setNote("Uploaded, but could not get public URL. Check bucket is PUBLIC.");
        return;
      }

      setFImageUrl(publicUrl);
      showToast("Image uploaded ✅");
    } catch (e) {
      setErr(e?.message || String(e));
    }
  }

  const chipBtn = (active) => ({
    ...btnSmall,
    ...(active ? btnDark : {}),
  });

  function toggleComboItem(item) {
    setComboSelectedIds((prev) => {
      const id = text(item?.id);
      const exists = prev.includes(id);
      const next = exists ? prev.filter((row) => row !== id) : [...prev, id];
      if (!exists) {
        const variants = Array.isArray(item?.variants) ? item.variants : [];
        const defaultVariant = variants.find((variant) => variant?.is_default) || variants[0] || null;
        if (defaultVariant?.label) {
          setComboVariantByItemId((current) => ({ ...current, [id]: String(defaultVariant.label) }));
        }
      }
      return next;
    });
  }

  async function createComboDeal() {
    setErr("");
    setNote("");

    try {
      if (!restaurantId) throw new Error("Restaurant missing.");
      const title = text(comboTitle);
      if (!title) throw new Error("Combo title required.");
      if ((comboSelectedIds || []).length < 2) throw new Error("Select at least 2 menu items.");

      const original = safeNumber(comboOriginalPrice, 0);
      const discount = safeNumber(comboDiscountPrice, 0);
      if (!(original > 0)) throw new Error("Original combo price must be greater than 0.");
      if (!(discount > 0)) throw new Error("Discount combo price must be greater than 0.");
      if (discount >= original) throw new Error("Discount combo price must be smaller than original price.");

      const selectedRows = (items || []).filter((item) => comboSelectedIds.includes(item.id));
      if (selectedRows.length < 2) throw new Error("Selected items were not found.");

      setComboBusy(true);
      const nextCombos = await saveOwnerComboDeals("restaurant", restaurantId, [
        ...(comboDeals || []),
        {
          title,
          original_price: original,
          discount_price: discount,
          image_url: text(selectedRows[0]?.image_url) || null,
          items: selectedRows.map((item) => ({
            item_id: item.id,
            selected_variant_label: text(comboVariantByItemId[item.id]) || null,
          })),
        },
      ]);
      setComboDeals(nextCombos);
      setComboTitle("");
      setComboOriginalPrice("");
      setComboDiscountPrice("");
      setComboSearch("");
      setComboSelectedIds([]);
      setComboVariantByItemId({});
      showToast("Combo deal saved ✅");
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setComboBusy(false);
    }
  }

  async function deleteComboDeal(comboId) {
    setErr("");
    setNote("");
    try {
      if (!restaurantId) throw new Error("Restaurant missing.");
      setComboBusy(true);
      const nextCombos = await saveOwnerComboDeals(
        "restaurant",
        restaurantId,
        (comboDeals || []).filter((combo) => text(combo?.id) !== text(comboId))
      );
      setComboDeals(nextCombos);
      showToast("Combo deal removed ✅");
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setComboBusy(false);
    }
  }

  return (
    <main style={pageBg}>
      {toast ? <div style={toastBox}>{toast}</div> : null}
      <div style={{ width: "100%", margin: "0 auto" }}>
        {/* HERO (NO DUPLICATES HERE) */}
        <div style={heroGlass}>
          <div style={{ minWidth: 260 }}>
            <div style={pill}>Owner</div>
            <h1 style={heroTitle}>Manage Menu</h1>
            <div style={subText}>Add • Edit • Price • Stock • Best seller • Images • Pro Fields</div>
          </div>

          {/* ✅ Only ONE set of buttons (fix duplicate problem) */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <Link href="/restaurants/dashboard" style={btnLight}>
              Home
            </Link>
            <Link href="/restaurants/orders" style={btnLight}>
              Restaurant Orders
            </Link>
            <Link href="/restaurants/settings" style={btnLight}>
              Restaurant Settings
            </Link>
            <button onClick={openAddModal} style={btnDark}>
              + Add Item
            </button>
          </div>
        </div>

        {/* Identity */}
        <div style={{ ...cardGlass, marginTop: 12 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <span style={pill}>Owner: {ownerEmail || "-"}</span>
            <span style={pill}>Role: {role || "-"}</span>
            <span style={pill}>Restaurant: {restaurantName || "-"}</span>
            <span style={pill}>Restaurant ID: {restaurantId || "-"}</span>
            <span style={pill}>Currency: {currency}</span>
          </div>
          {err ? <div style={alertErr}>{err}</div> : null}
          {note ? <div style={noteBox}>{note}</div> : null}
        </div>

        {/* Restaurant Switch + Refresh (MULTI RESTAURANTS SUPPORT) */}
        <div style={{ ...panelGlass, marginTop: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "end" }}>
            <div>
              <div style={label}>Switch Restaurant (Owner only)</div>
              <select
                value={restaurantId}
                onChange={(e) => setRestaurantId(e.target.value)}
                style={inputStyle}
                disabled={restaurants.length <= 1}
              >
                {restaurants.length === 0 ? (
                  <option value="">No restaurant found</option>
                ) : (
                  restaurants.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name || "Restaurant"}
                    </option>
                  ))
                )}
              </select>
              <div style={{ marginTop: 6, fontSize: 12, fontWeight: 850, color: "rgba(17,24,39,0.65)" }}>
                ✅ Owner can only manage their own restaurants. If you want multiple restaurants, add them in Restaurant Settings.
              </div>
            </div>

            <button onClick={() => restaurantId && loadMenu(restaurantId)} style={btnSmall} disabled={!restaurantId}>
              Refresh Menu
            </button>
          </div>

          {/* KPI */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginTop: 12 }}>
            <div style={{ ...cardGlass, padding: 12 }}>
              <div style={{ fontSize: 18, fontWeight: 1000, color: "#0b1220" }}>{kpi.total}</div>
              <div style={{ fontSize: 12, fontWeight: 900, color: "rgba(17,24,39,0.65)" }}>Total Items</div>
            </div>
            <div style={{ ...cardGlass, padding: 12 }}>
              <div style={{ fontSize: 18, fontWeight: 1000, color: "#0b1220" }}>{kpi.inStock}</div>
              <div style={{ fontSize: 12, fontWeight: 900, color: "rgba(17,24,39,0.65)" }}>In Stock</div>
            </div>
            <div style={{ ...cardGlass, padding: 12 }}>
              <div style={{ fontSize: 18, fontWeight: 1000, color: "#0b1220" }}>{kpi.outStock}</div>
              <div style={{ fontSize: 12, fontWeight: 900, color: "rgba(17,24,39,0.65)" }}>Out of Stock</div>
            </div>
            <div style={{ ...cardGlass, padding: 12 }}>
              <div style={{ fontSize: 18, fontWeight: 1000, color: "#0b1220" }}>{kpi.best}</div>
              <div style={{ fontSize: 12, fontWeight: 900, color: "rgba(17,24,39,0.65)" }}>Best Sellers</div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div style={{ ...panelGlass, marginTop: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr 1fr", gap: 10, alignItems: "end" }}>
            <div>
              <div style={label}>Search</div>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your menu…" style={inputStyle} />
            </div>

            <div>
              <div style={label}>Veg / Non-Veg</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => setVegMode("all")} style={chipBtn(vegMode === "all")}>
                  All
                </button>
                <button onClick={() => setVegMode("veg")} style={chipBtn(vegMode === "veg")}>
                  Veg
                </button>
                <button onClick={() => setVegMode("non_veg")} style={chipBtn(vegMode === "non_veg")}>
                  Non-Veg
                </button>
              </div>
            </div>

            <div>
              <div style={label}>Stock / Best Seller</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => setStockMode("all")} style={chipBtn(stockMode === "all")}>
                  All Stock
                </button>
                <button onClick={() => setStockMode("in")} style={chipBtn(stockMode === "in")}>
                  In Stock
                </button>
                <button onClick={() => setStockMode("out")} style={chipBtn(stockMode === "out")}>
                  Out
                </button>
                <button onClick={() => setStockMode("best")} style={chipBtn(stockMode === "best")}>
                  Best
                </button>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button
              onClick={() => {
                setQ("");
                setVegMode("all");
                setStockMode("all");
              }}
              style={btnSmall}
            >
              Reset
            </button>
            <div style={{ ...pill, background: "rgba(255,255,255,0.85)" }}>
              Showing: <span style={{ fontWeight: 1000 }}>{filtered.length}</span> items
            </div>
          </div>
        </div>

        {loading ? <div style={{ marginTop: 12, color: "rgba(17,24,39,0.7)", fontWeight: 900 }}>Loading…</div> : null}

        <div style={{ ...panelGlass, marginTop: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 1000, color: "#0b1220" }}>Restaurant Combo Deals</div>
              <div style={{ marginTop: 4, color: "rgba(17,24,39,0.7)", fontWeight: 850 }}>
                Search your menu, select items, choose sizes if the item has variants, and show the combo on the customer home row.
              </div>
            </div>
            <div style={pill}>Live: {(comboDeals || []).length}</div>
          </div>

          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1.2fr 0.8fr 0.8fr", gap: 10 }}>
            <div>
              <div style={label}>Combo title</div>
              <input value={comboTitle} onChange={(e) => setComboTitle(e.target.value)} placeholder="Weekend Food Saver" style={inputStyle} />
            </div>
            <div>
              <div style={label}>Original price</div>
              <input value={comboOriginalPrice} onChange={(e) => setComboOriginalPrice(e.target.value)} placeholder="24.99" style={inputStyle} />
            </div>
            <div>
              <div style={label}>Discount price</div>
              <input value={comboDiscountPrice} onChange={(e) => setComboDiscountPrice(e.target.value)} placeholder="19.99" style={inputStyle} />
            </div>
          </div>

          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1.2fr 0.8fr 0.8fr", gap: 10, alignItems: "center" }}>
            <input
              value={comboSearch}
              onChange={(e) => setComboSearch(e.target.value)}
              placeholder="Search items for combo..."
              style={inputStyle}
            />
            <div style={{ ...pill, justifyContent: "center" }}>Showing: {comboPickerItems.length}</div>
            <div style={{ ...pill, justifyContent: "center" }}>Selected: {comboSelectedIds.length}</div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={label}>Select menu items</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
              {comboPickerItems.map((item) => {
                const active = comboSelectedIds.includes(item.id);
                const variants = Array.isArray(item?.variants) ? item.variants : [];
                return (
                  <div key={`restaurant-combo-item-${item.id}`} style={comboSavedCard}>
                    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                      <div style={{ width: 68, height: 68, borderRadius: 14, overflow: "hidden", background: "#f4f4f5", flexShrink: 0 }}>
                        {item?.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.image_url} alt={item.name || "item"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : null}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 1000, color: "#0b1220" }}>{item.name}</div>
                        <div style={{ marginTop: 4, color: "rgba(17,24,39,0.68)", fontWeight: 850, fontSize: 13 }}>
                          {variants.length > 0 ? `${variants.length} variant(s)` : "No variants"}
                        </div>
                        {variants.length > 0 ? (
                          <div style={{ marginTop: 8 }}>
                            <select
                              value={text(comboVariantByItemId[item.id]) || text(variants.find((variant) => variant?.is_default)?.label) || text(variants[0]?.label)}
                              onChange={(e) =>
                                setComboVariantByItemId((current) => ({
                                  ...current,
                                  [item.id]: e.target.value,
                                }))
                              }
                              style={{ ...inputStyle, minWidth: 190 }}
                            >
                              {variants.map((variant, index) => (
                                <option key={`${item.id}-${variant?.id || variant?.label || index}`} value={text(variant?.label)}>
                                  {variant?.label || "Size"}{Number(variant?.price || 0) > 0 ? ` - ${money(variant.price, currency)}` : ""}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                      <span style={active ? pill : tag}>{active ? "Added to combo" : "Not added"}</span>
                      <button
                        type="button"
                        onClick={() => toggleComboItem(item)}
                        style={active ? btnSmall : btnDark}
                        disabled={comboBusy}
                      >
                        {active ? "Remove" : "Add"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            {!comboPickerItems.length ? (
              <div style={{ marginTop: 10, color: "rgba(17,24,39,0.65)", fontWeight: 850 }}>
                No menu items match this combo search/filter.
              </div>
            ) : null}
          </div>

          {comboSelectedIds.length > 0 ? (
            <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
              {(items || [])
                .filter((item) => comboSelectedIds.includes(item.id))
                .map((item) => {
                  const variants = Array.isArray(item?.variants) ? item.variants : [];
                  return (
                    <div key={`restaurant-combo-selected-${item.id}`} style={comboSelectedCard}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                        <div>
                          <div style={{ fontWeight: 1000, color: "#0b1220" }}>{item.name}</div>
                          <div style={{ marginTop: 4, color: "rgba(17,24,39,0.68)", fontWeight: 850, fontSize: 13 }}>
                            {variants.length > 0 ? `Chosen variant: ${text(comboVariantByItemId[item.id]) || text(variants.find((variant) => variant?.is_default)?.label) || text(variants[0]?.label)}` : "No variants"}
                          </div>
                        </div>
                        {variants.length > 0 ? (
                          <select
                            value={text(comboVariantByItemId[item.id])}
                            onChange={(e) =>
                              setComboVariantByItemId((current) => ({
                                ...current,
                                [item.id]: e.target.value,
                              }))
                            }
                            style={{ ...inputStyle, minWidth: 180, maxWidth: 240 }}
                          >
                            {variants.map((variant, index) => (
                              <option key={`${item.id}-${variant?.id || variant?.label || index}`} value={text(variant?.label)}>
                                {variant?.label || "Size"}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span style={tag}>No sizes</span>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          ) : null}

          <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div style={pill}>Selected: {comboSelectedIds.length} item(s)</div>
            <button type="button" onClick={createComboDeal} style={btnDark} disabled={comboBusy || !restaurantId}>
              {comboBusy ? "Saving..." : "Create Combo Deal"}
            </button>
          </div>

          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
            {(comboDeals || []).length === 0 ? (
              <div style={{ color: "rgba(17,24,39,0.65)", fontWeight: 850 }}>No combo deals yet.</div>
            ) : (
              (comboDeals || []).map((combo) => (
                <div key={combo.id} style={comboSavedCard}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
                    <div style={{ flex: 1, minWidth: 260 }}>
                      <div style={{ fontSize: 18, fontWeight: 1000, color: "#0b1220" }}>{combo.title}</div>
                      <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <span style={{ ...tag, textDecoration: "line-through", opacity: 0.7 }}>{money(combo.original_price, currency)}</span>
                        <span style={pill}>{money(combo.discount_price || combo.price, currency)}</span>
                      </div>
                      <div style={{ marginTop: 8, color: "rgba(17,24,39,0.7)", fontWeight: 850 }}>
                        {Array.isArray(combo.items)
                          ? combo.items
                              .map((item) => `${item.name || "Item"}${text(item?.selected_variant_label) ? ` (${text(item.selected_variant_label)})` : ""}`)
                              .join(" • ")
                          : ""}
                      </div>
                    </div>

                    <button type="button" onClick={() => deleteComboDeal(combo.id)} style={btnSmall} disabled={comboBusy}>
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {!loading ? (
          filtered.length === 0 ? (
            <div style={{ ...cardGlass, marginTop: 12, color: "rgba(17,24,39,0.7)", fontWeight: 900 }}>No items found.</div>
          ) : (
            <div style={grid}>
              {filtered.map((it) => {
                const isVeg = it.is_veg === true;
                const isNonVeg = it.is_veg === false;
                const out = it.in_stock === false;

                const desc = pick(it, ["description", "item_description"], "");
                const spice = pick(it, ["spice_level", "spicy_level"], "");
                const allergens = pick(it, ["allergens", "allergy_info"], "");
                const calories = pick(it, ["calories", "kcal"], "");
                const prep = pick(it, ["prep_mins", "prep_time_mins"], "");
                const pricing = priceSummary(it);

                const taxable = it?.is_taxable === false ? false : true;

                return (
                  <div key={it.id} style={cardGlass}>
                    <div style={imgWrap}>
                      {it.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={it.image_url} alt={it.name || "item"} style={img} />
                      ) : (
                        <div style={imgPlaceholder}>No image</div>
                      )}
                    </div>

                    <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontWeight: 1000, color: "#0b1220", display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {it.name || "Item"}
                        {isVeg ? <span style={badgeVeg}>VEG</span> : null}
                        {isNonVeg ? <span style={badgeNonVeg}>NON-VEG</span> : null}
                        {it.is_best_seller ? <span style={badgeBest}>BEST</span> : null}
                        {!out ? <span style={badgeIn}>IN</span> : <span style={badgeOut}>OUT</span>}
                      </div>

                      {/* ✅ Currency formatted */}
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <div style={{ fontWeight: 1000, color: "#0b1220" }}>{money(pricing.effective, currency)}</div>
                        {pricing.compareAt > pricing.effective ? (
                          <div style={{ fontWeight: 900, color: "rgba(17,24,39,0.45)", textDecoration: "line-through" }}>
                            {money(pricing.compareAt, currency)}
                          </div>
                        ) : null}
                        {pricing.percent > 0 ? <span style={badgeBest}>{pricing.percent}% OFF</span> : null}
                      </div>
                    </div>

                    <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {it.cuisine ? <span style={tag}>{normCuisine(it.cuisine)}</span> : null}
                      <span style={tag}>{taxable ? "TAXABLE" : "NO TAX"}</span>
                      {desc ? <span style={tag}>desc</span> : null}
                      {spice ? <span style={tag}>spice:{String(spice)}</span> : null}
                      {calories ? <span style={tag}>{String(calories)} kcal</span> : null}
                      {prep ? <span style={tag}>prep:{String(prep)}m</span> : null}
                      {allergens ? <span style={tag}>allergens</span> : null}
                    </div>

                    {desc ? (
                      <div style={{ marginTop: 8, fontSize: 12, fontWeight: 850, color: "rgba(17,24,39,0.70)" }}>
                        {String(desc).slice(0, 120)}
                        {String(desc).length > 120 ? "…" : ""}
                      </div>
                    ) : null}

                    <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button onClick={() => openEditModal(it)} style={{ ...btnSmall, flex: 1 }}>
                        Edit
                      </button>

                      <button onClick={() => toggleField(it, "in_stock", !out)} style={{ ...btnSmall, flex: 1 }}>
                        {out ? "Mark In Stock" : "Mark Out"}
                      </button>

                      <button
                        onClick={() => toggleField(it, "is_best_seller", !(it.is_best_seller === true))}
                        style={{ ...btnSmall, flex: 1 }}
                      >
                        {it.is_best_seller ? "Unbest" : "Best"}
                      </button>

                      <button onClick={() => deleteItem(it)} style={{ ...btnSmall, flex: 1 }}>
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : null}

        <div style={{ height: 20 }} />
      </div>

      {/* MODAL */}
      {modalOpen ? (
        <div style={overlay} onMouseDown={closeModal}>
          <div style={modal} onMouseDown={(e) => e.stopPropagation()}>
            <div style={modalHeader}>
              <div>
                <div style={{ fontWeight: 1000, color: "#0b1220" }}>{editingId ? "Edit Item" : "Add Item"}</div>
                <div style={{ fontSize: 12, fontWeight: 850, color: "rgba(17,24,39,0.65)" }}>
                  Bucket: <b>{BUCKET}</b> • Restaurant: <b>{restaurantName || "-"}</b> • Currency: <b>{currency}</b>
                </div>
              </div>

              <button onClick={closeModal} style={{ ...btnLight, borderRadius: 12 }}>
                ✕
              </button>
            </div>

            <div style={modalBody}>
              {err ? <div style={alertErr}>{err}</div> : null}
              {note ? <div style={noteBox}>{note}</div> : null}

              <div style={{ display: "grid", gap: 10 }}>
                <div>
                  <div style={label}>Item Name</div>
                  <input value={fName} onChange={(e) => setFName(e.target.value)} placeholder="e.g. Chicken Biryani" style={inputStyle} />
                </div>

                <div style={split2}>
                  <div>
                    <div style={label}>Original Price</div>
                    <input value={fOriginalPrice} onChange={(e) => setFOriginalPrice(e.target.value)} placeholder="e.g. 249" style={inputStyle} />
                  </div>

                  <div>
                    <div style={label}>Discount Price</div>
                    <input value={fDiscountPrice} onChange={(e) => setFDiscountPrice(e.target.value)} placeholder="e.g. 199" style={inputStyle} />
                  </div>
                </div>

                <div style={split2}>

                  <div>
                    <div style={label}>Cuisine / Tag</div>
                    <input value={fCuisine} onChange={(e) => setFCuisine(e.target.value)} placeholder="e.g. Punjabi" style={inputStyle} />
                  </div>
                </div>

                {/* PRO fields */}
                <div>
                  <div style={label}>Description</div>
                  <textarea
                    value={fDescription}
                    onChange={(e) => setFDescription(e.target.value)}
                    placeholder="e.g. Slow-cooked basmati rice with tender chicken, aromatic spices..."
                    style={{ ...inputStyle, minHeight: 90, resize: "vertical" }}
                  />
                </div>

                <div style={split3}>
                  <div>
                    <div style={label}>Spice Level</div>
                    <select value={fSpiceLevel} onChange={(e) => setFSpiceLevel(e.target.value)} style={inputStyle}>
                      <option value="mild">Mild</option>
                      <option value="medium">Medium</option>
                      <option value="hot">Hot</option>
                      <option value="extra_hot">Extra Hot</option>
                    </select>
                  </div>
                  <div>
                    <div style={label}>Calories (optional)</div>
                    <input value={fCalories} onChange={(e) => setFCalories(e.target.value)} placeholder="e.g. 450" style={inputStyle} />
                  </div>
                  <div>
                    <div style={label}>Prep Time (mins)</div>
                    <input value={fPrepMins} onChange={(e) => setFPrepMins(e.target.value)} placeholder="e.g. 20" style={inputStyle} />
                  </div>
                </div>

                <div>
                  <div style={label}>Allergens (comma separated)</div>
                  <input value={fAllergens} onChange={(e) => setFAllergens(e.target.value)} placeholder="e.g. milk, nuts, gluten" style={inputStyle} />
                </div>

                <div style={{ ...panelGlass, padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontWeight: 1000, color: "#0b1220" }}>Item Variants</div>
                      <div style={{ fontSize: 12, fontWeight: 850, color: "rgba(17,24,39,0.65)" }}>
                        Add sizes like oz, lb, kg, pcs. Customers can choose from these options.
                      </div>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 900, color: "rgba(17,24,39,0.65)" }}>
                      Variants: <b>{weightOptions.length}</b>
                    </div>
                  </div>

                  <div style={{ ...split2, marginTop: 10 }}>
                    <div>
                      <div style={label}>Variant Value</div>
                      <input value={variantLabel} onChange={(e) => setVariantLabel(e.target.value)} placeholder="e.g. 0.5 or 1" style={inputStyle} />
                    </div>
                    <div>
                      <div style={label}>Unit</div>
                      <select value={variantUnit} onChange={(e) => setVariantUnit(e.target.value)} style={inputStyle}>
                        {["oz", "lb", "kg", "g", "ml", "l", "pcs", "pack", "box", "tray"].map((unit) => (
                          <option key={unit} value={unit}>{unit}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div style={{ ...split3, marginTop: 10 }}>
                    <div>
                      <div style={label}>Variant Original Price</div>
                      <input value={variantOriginalPrice} onChange={(e) => setVariantOriginalPrice(e.target.value)} placeholder="e.g. 349" style={inputStyle} />
                    </div>
                    <div>
                      <div style={label}>Variant Discount Price</div>
                      <input value={variantDiscountPrice} onChange={(e) => setVariantDiscountPrice(e.target.value)} placeholder="e.g. 299" style={inputStyle} />
                    </div>
                    <div>
                      <div style={label}>Preview</div>
                      <div style={{ ...inputStyle, minHeight: 44, display: "flex", alignItems: "center" }}>
                        {variantOriginalPrice
                          ? `${money(safeNumber(variantDiscountPrice, 0) > 0 ? safeNumber(variantDiscountPrice, 0) : safeNumber(variantOriginalPrice, 0), currency)}${safeNumber(variantDiscountPrice, 0) > 0 ? ` from ${money(safeNumber(variantOriginalPrice, 0), currency)}` : ""}`
                          : "Enter variant prices"}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                    <button onClick={() => setVariantInStock(true)} style={{ ...btnSmall, ...(variantInStock ? btnDark : {}), borderRadius: 14 }}>
                      Variant In Stock
                    </button>
                    <button onClick={() => setVariantInStock(false)} style={{ ...btnSmall, ...(!variantInStock ? btnDark : {}), borderRadius: 14 }}>
                      Variant Out
                    </button>
                    <button onClick={addWeightOption} style={{ ...btnSmall, ...btnDark, borderRadius: 14 }}>
                      Add Variant
                    </button>
                  </div>

                  {weightOptions.length ? (
                    <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                      {weightOptions.map((variant, idx) => (
                        <div key={variant.id || `${variant.label}-${idx}`} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "10px 12px", borderRadius: 14, border: "1px solid rgba(0,0,0,0.08)", background: "rgba(255,255,255,0.9)" }}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                            <span style={tag}>{variant.label}</span>
                            <span style={tag}>{money(variant.price, currency)}</span>
                            {safeNumber(variant?.discount_price, 0) > 0 ? (
                              <>
                                <span style={{ ...tag, textDecoration: "line-through", opacity: 0.7 }}>{money(variant.original_price, currency)}</span>
                                <span style={badgeBest}>{safeNumber(variant.discount_percent, 0)}% OFF</span>
                              </>
                            ) : null}
                            <span style={variant.in_stock ? badgeIn : badgeOut}>{variant.in_stock ? "In stock" : "Out"}</span>
                            {variant.is_default ? <span style={badgeBest}>Default</span> : null}
                          </div>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button onClick={() => setWeightOptions((prev) => (prev || []).map((row) => ({ ...row, is_default: row.id === variant.id })))} style={btnSmall}>
                              Make Default
                            </button>
                            <button onClick={() => setWeightOptions((prev) => (prev || []).filter((row) => row.id !== variant.id).map((row, rowIndex) => ({ ...row, sort_order: rowIndex, is_default: rowIndex === 0 ? true : !!row.is_default })))} style={btnSmall}>
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ marginTop: 10, fontSize: 12, fontWeight: 850, color: "rgba(17,24,39,0.65)" }}>
                      No variants added. Customer will use the regular item price.
                    </div>
                  )}
                </div>

                {/* Image upload */}
                <div style={{ ...panelGlass, padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 1000, color: "#0b1220" }}>Item Image</div>
                      <div style={{ fontSize: 12, fontWeight: 850, color: "rgba(17,24,39,0.65)" }}>
                        Upload to bucket: <b>{BUCKET}</b>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={(e) => uploadImage(e.target.files?.[0])}
                      />
                      <button onClick={() => fileRef.current?.click?.()} style={btnSmall}>
                        Upload Image
                      </button>
                    </div>
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <div style={label}>Image URL (auto-filled after upload)</div>
                    <input value={fImageUrl} onChange={(e) => setFImageUrl(e.target.value)} placeholder="Paste image URL here" style={inputStyle} />
                  </div>
                </div>

                {/* Toggles */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <button onClick={() => setFIsVeg(true)} style={{ ...btnSmall, ...(fIsVeg ? btnDark : {}), borderRadius: 14 }}>
                    Veg
                  </button>
                  <button onClick={() => setFIsVeg(false)} style={{ ...btnSmall, ...(!fIsVeg ? btnDark : {}), borderRadius: 14 }}>
                    Non-Veg
                  </button>

                  <button onClick={() => setFInStock(true)} style={{ ...btnSmall, ...(fInStock ? btnDark : {}), borderRadius: 14 }}>
                    In Stock: YES
                  </button>
                  <button onClick={() => setFInStock(false)} style={{ ...btnSmall, ...(!fInStock ? btnDark : {}), borderRadius: 14 }}>
                    In Stock: NO
                  </button>

                  <button onClick={() => setFBest(true)} style={{ ...btnSmall, ...(fBest ? btnDark : {}), borderRadius: 14 }}>
                    Best Seller: YES
                  </button>
                  <button onClick={() => setFBest(false)} style={{ ...btnSmall, ...(!fBest ? btnDark : {}), borderRadius: 14 }}>
                    Best Seller: NO
                  </button>

                  {/* ✅ Taxable toggle */}
                  <button onClick={() => setIsTaxable(true)} style={{ ...btnSmall, ...(isTaxable ? btnDark : {}), borderRadius: 14 }}>
                    Taxable: YES
                  </button>
                  <button onClick={() => setIsTaxable(false)} style={{ ...btnSmall, ...(!isTaxable ? btnDark : {}), borderRadius: 14 }}>
                    Taxable: NO
                  </button>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
                  <button onClick={saveItem} style={btnDark} disabled={saving}>
                    {saving ? "Saving..." : editingId ? "Save Changes" : "Add Item"}
                  </button>
                  <button onClick={closeModal} style={btnLight} disabled={saving}>
                    Cancel
                  </button>
                </div>

                <div style={{ fontSize: 12, fontWeight: 850, color: "rgba(17,24,39,0.65)" }}>
                  Note: Upload stores image as <b>{BUCKET}/{`{restaurantId}`}</b> and saves public URL into <b>menu_items.image_url</b>.
                  Extra pro fields save only if columns exist (otherwise UI still works).
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
