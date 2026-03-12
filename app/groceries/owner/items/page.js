"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import supabase from "@/lib/supabase";

/* =========================
   Helpers (keep old logic)
   ========================= */
function clean(v) {
  return String(v || "").trim();
}
function normalizeRole(r) {
  return String(r || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}
function money(v) {
  const n = Number(v || 0);
  return `₹${n.toFixed(0)}`;
}
function clampText(s, max = 80) {
  const str = String(s ?? "");
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + "…";
}
function safeIdPart(v) {
  return String(v || "unknown").replace(/[^\w-]/g, "_");
}
function slugify(v) {
  return String(v || "")
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Try insert/update with different optional columns safely (because your DB may not have them)
async function trySaveWithVariants({ table, mode, matchEq, basePayload, variants }) {
  // mode: "insert" | "update"
  // matchEq: { col, val } for update
  // variants: array of objects to merge into payload
  let lastErr = null;

  for (const extra of variants) {
    try {
      const payload = { ...basePayload, ...(extra || {}) };
      let q = supabase.from(table);

      if (mode === "update") {
        q = q.update(payload).eq(matchEq.col, matchEq.val);
      } else {
        q = q.insert(payload);
      }

      const { error } = await q;
      if (error) throw error;
      return { ok: true };
    } catch (e) {
      lastErr = e;
    }
  }

  return { ok: false, error: lastErr };
}

// ✅ Insert and return created row id (safe: if select not supported, it will throw and we fallback)
async function tryInsertReturningIdWithVariants({ table, basePayload, variants }) {
  let lastErr = null;

  for (const extra of variants) {
    try {
      const payload = { ...basePayload, ...(extra || {}) };
      const { data, error } = await supabase
        .from(table)
        .insert(payload)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      const id = data?.id;
      if (!id) throw new Error("Insert succeeded but could not read inserted id.");
      return { ok: true, id };
    } catch (e) {
      lastErr = e;
    }
  }

  return { ok: false, error: lastErr };
}

export default function GroceryOwnerItemsPage() {
  const router = useRouter();
  const fileRef = useRef(null);

  const [checking, setChecking] = useState(true);
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState("");

  const [stores, setStores] = useState([]);
  const [storeId, setStoreId] = useState("");

  const [items, setItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [busy, setBusy] = useState(false);

  const [errMsg, setErrMsg] = useState("");
  const [infoMsg, setInfoMsg] = useState("");

  // modal open
  const [showModal, setShowModal] = useState(false);
  const [uploading, setUploading] = useState(false);

  // filters + sort
  const [search, setSearch] = useState("");
  const [vegFilter, setVegFilter] = useState("all"); // all | veg | nonveg
  const [stockFilter, setStockFilter] = useState("all"); // all | instock | out | best | rec | available | hidden
  const [sortBy, setSortBy] = useState("newest"); // newest | oldest | price_asc | price_desc | name_asc | name_desc

  // ===== Categories/Subcategories (NEW clean flow) =====
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);

  // selected category for managing subcategories
  const [manageCatId, setManageCatId] = useState("");

  // create inputs (separate from Add Item)
  const [newCatName, setNewCatName] = useState("");
  const [newSubName, setNewSubName] = useState("");

  const [catsLoading, setCatsLoading] = useState(false);
  const [subsLoading, setSubsLoading] = useState(false);

  // ===== Item form =====
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  // We will NOT allow manual typing for category/subcategory
  const [selectedCatId, setSelectedCatId] = useState("");
  const [selectedSubId, setSelectedSubId] = useState("");

  const [isAvailable, setIsAvailable] = useState(true);
  const [inStock, setInStock] = useState(true);
  const [isVeg, setIsVeg] = useState(false);
  const [isBestSeller, setIsBestSeller] = useState(false);
  const [isRecommended, setIsRecommended] = useState(false);

  // ✅ NEW: Taxable toggle (default YES)
  const [isTaxable, setIsTaxable] = useState(true);

  const [editingId, setEditingId] = useState("");

  /* =========================================================
     ✅ NEW: Weight / Variant options (lbs, kg, pack)
     - Safe: if you don't add variants, old price logic stays.
     - We will save variants into table "grocery_item_variants" if it exists.
     ========================================================= */
  const [variantUnit, setVariantUnit] = useState("lb"); // lb | kg | pcs | pack
  const [variantLabel, setVariantLabel] = useState(""); // e.g. "1"
  const [variantPrice, setVariantPrice] = useState(""); // e.g. "20"
  const [variantInStock, setVariantInStock] = useState(true);

  // array of { label: "1 lb", unit: "lb", value: 1, price: 20, in_stock: true, is_default: boolean }
  const [weightOptions, setWeightOptions] = useState([]);

  const canAccess = useMemo(() => {
    return role === "grocery_owner" || role === "admin";
  }, [role]);

  const activeStore = useMemo(() => {
    return stores.find((s) => s.id === storeId) || null;
  }, [stores, storeId]);

  const storeApproved = useMemo(() => {
    return String(activeStore?.approval_status || "pending").toLowerCase() === "approved";
  }, [activeStore]);

  const storeDisabled = useMemo(() => {
    return !!activeStore?.is_disabled;
  }, [activeStore]);

  // ✅ normalize taxable from item row (default true)
  function isTaxableRow(it) {
    if (typeof it?.is_taxable === "boolean") return it.is_taxable;
    const s = String(it?.is_taxable ?? it?.taxable ?? "").toLowerCase();
    if (s === "false" || s === "0" || s === "no") return false;
    return true;
  }

  // ===== Stats =====
  const stats = useMemo(() => {
    const total = items?.length || 0;
    const inS = (items || []).filter((x) => !!x?.in_stock).length;
    const outS = (items || []).filter((x) => !x?.in_stock).length;
    const best = (items || []).filter((x) => !!x?.is_best_seller).length;
    return { total, inS, outS, best };
  }, [items]);

  // ===== Filtered Items =====
  const filteredItems = useMemo(() => {
    let list = Array.isArray(items) ? [...items] : [];

    const q = clean(search).toLowerCase();
    if (q) {
      list = list.filter((it) => {
        const n = clean(it?.name).toLowerCase();
        const d = clean(it?.description).toLowerCase();
        const c = clean(it?.category).toLowerCase();
        return n.includes(q) || d.includes(q) || c.includes(q);
      });
    }

    if (vegFilter === "veg") list = list.filter((it) => !!it?.is_veg);
    if (vegFilter === "nonveg") list = list.filter((it) => !it?.is_veg);

    if (stockFilter === "instock") list = list.filter((it) => !!it?.in_stock);
    if (stockFilter === "out") list = list.filter((it) => !it?.in_stock);
    if (stockFilter === "best") list = list.filter((it) => !!it?.is_best_seller);
    if (stockFilter === "rec") list = list.filter((it) => !!it?.is_recommended);
    if (stockFilter === "available") list = list.filter((it) => !!it?.is_available);
    if (stockFilter === "hidden") list = list.filter((it) => !it?.is_available);

    const numPrice = (v) => {
      const n = Number(v || 0);
      return Number.isFinite(n) ? n : 0;
    };

    list.sort((a, b) => {
      if (sortBy === "oldest") return new Date(a?.created_at || 0) - new Date(b?.created_at || 0);
      if (sortBy === "price_asc") return numPrice(a?.price) - numPrice(b?.price);
      if (sortBy === "price_desc") return numPrice(b?.price) - numPrice(a?.price);
      if (sortBy === "name_asc") return clean(a?.name).localeCompare(clean(b?.name));
      if (sortBy === "name_desc") return clean(b?.name).localeCompare(clean(a?.name));
      return new Date(b?.created_at || 0) - new Date(a?.created_at || 0);
    });

    return list;
  }, [items, search, vegFilter, stockFilter, sortBy]);

  const showingCount = filteredItems?.length || 0;

  function resetFilters() {
    setSearch("");
    setVegFilter("all");
    setStockFilter("all");
    setSortBy("newest");
  }

  function resetVariantsUI() {
    setVariantUnit("lb");
    setVariantLabel("");
    setVariantPrice("");
    setVariantInStock(true);
    setWeightOptions([]);
  }

  function resetForm() {
    setEditingId("");
    setName("");
    setDescription("");
    setPrice("");
    setImageUrl("");
    setSelectedCatId("");
    setSelectedSubId("");
    setIsAvailable(true);
    setInStock(true);
    setIsVeg(false);
    setIsBestSeller(false);
    setIsRecommended(false);

    // ✅ default taxable ON
    setIsTaxable(true);

    // ✅ variants reset
    resetVariantsUI();
  }

  function closeModal() {
    if (busy || uploading) return;
    setShowModal(false);
  }

  function openAdd() {
    setErrMsg("");
    setInfoMsg("");
    resetForm();

    // default to currently selected manage category (nice flow)
    if (manageCatId) setSelectedCatId(manageCatId);
    setShowModal(true);
  }

  // ✅ load variants for editing (safe: if table doesn't exist, ignore)
  async function loadItemVariants(itemId) {
    if (!itemId) return;
    try {
      const { data, error } = await supabase
        .from("grocery_item_variants")
        .select("id, item_id, label, unit, value, price, in_stock, is_default, sort_order, created_at")
        .eq("item_id", itemId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) throw error;

      const list = Array.isArray(data) ? data : [];
      const mapped = list.map((v) => ({
        id: v.id,
        label: clean(v.label),
        unit: clean(v.unit) || "lb",
        value: Number(v.value || 0) || 0,
        price: Number(v.price || 0) || 0,
        in_stock: typeof v.in_stock === "boolean" ? v.in_stock : true,
        is_default: !!v.is_default,
        sort_order: Number(v.sort_order || 0) || 0,
      }));

      // Pick a unit for UI from first variant
      if (mapped?.[0]?.unit) setVariantUnit(mapped[0].unit);
      setWeightOptions(mapped.length ? mapped : []);
    } catch (e) {
      // If table missing, just ignore (keep old behavior)
      setWeightOptions([]);
    }
  }

  function openEdit(row) {
    setEditingId(row?.id || "");
    setName(row?.name || "");
    setDescription(row?.description || "");
    setPrice(String(row?.price ?? ""));
    setImageUrl(row?.image_url || "");
    setIsAvailable(!!row?.is_available);
    setInStock(!!row?.in_stock);
    setIsVeg(!!row?.is_veg);
    setIsBestSeller(!!row?.is_best_seller);
    setIsRecommended(!!row?.is_recommended);

    // ✅ Taxable: default true if not present
    setIsTaxable(isTaxableRow(row));

    // If your grocery_items table contains category as string (it does), try to map it back to a category id by name
    const catName = clean(row?.category);
    if (catName) {
      const match = (categories || []).find((c) => clean(c?.name).toLowerCase() === catName.toLowerCase());
      if (match?.id) setSelectedCatId(match.id);
      else setSelectedCatId("");
    } else {
      setSelectedCatId("");
    }
    setSelectedSubId("");

    // ✅ load variants for this item (safe)
    resetVariantsUI();
    loadItemVariants(row?.id);

    setInfoMsg("");
    setErrMsg("");
    setShowModal(true);
  }

  /* =========================
     Variant UI actions
     ========================= */
  function buildVariantLabel(value, unit) {
    const v = clean(value);
    const u = clean(unit) || "lb";
    if (!v) return "";
    return `${v} ${u}`;
  }

  function addWeightOption() {
    setErrMsg("");
    setInfoMsg("");

    const v = Number(variantLabel);
    if (!Number.isFinite(v) || v <= 0) {
      setErrMsg("Enter a valid weight number (e.g. 1, 2, 5).");
      return;
    }
    const p = Number(variantPrice);
    if (!Number.isFinite(p) || p < 0) {
      setErrMsg("Enter a valid variant price.");
      return;
    }

    const unit = clean(variantUnit) || "lb";
    const label = buildVariantLabel(v, unit);

    // prevent duplicates
    const exists = (weightOptions || []).some((x) => clean(x.label).toLowerCase() === label.toLowerCase());
    if (exists) {
      setErrMsg("This weight option already exists.");
      return;
    }

    const next = [
      ...(weightOptions || []),
      {
        id: `local_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        label,
        unit,
        value: v,
        price: p,
        in_stock: !!variantInStock,
        is_default: (weightOptions || []).length === 0, // first one default automatically
        sort_order: (weightOptions || []).length,
      },
    ];

    setWeightOptions(next);

    // clear inputs but keep unit
    setVariantLabel("");
    setVariantPrice("");
    setVariantInStock(true);
  }

  function removeWeightOption(localId) {
    const next = (weightOptions || []).filter((x) => x.id !== localId);
    // ensure at least one default if list not empty
    if (next.length > 0 && !next.some((x) => x.is_default)) {
      next[0].is_default = true;
    }
    setWeightOptions(next.map((x, idx) => ({ ...x, sort_order: idx })));
  }

  function setDefaultWeightOption(localId) {
    const next = (weightOptions || []).map((x) => ({ ...x, is_default: x.id === localId }));
    setWeightOptions(next);
  }

  /* =========================
     Data loading
     ========================= */
  async function loadSessionAndRole() {
    setErrMsg("");
    setInfoMsg("");
    setChecking(true);

    try {
      const { data: sess, error: sessErr } = await supabase.auth.getSession();
      if (sessErr) throw sessErr;

      const user = sess?.session?.user;
      if (!user) {
        router.push("/login");
        return;
      }

      setUserId(user.id);
      setEmail(user.email || "");

      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profErr) throw profErr;

      const r = normalizeRole(prof?.role);
      setRole(r);

      if (r !== "grocery_owner" && r !== "admin") {
        router.push("/");
        return;
      }

      await loadMyStores(user.id);
    } catch (e) {
      setErrMsg(e?.message || String(e));
    } finally {
      setChecking(false);
    }
  }

  async function loadMyStores(uid) {
    setErrMsg("");

    const { data, error } = await supabase
      .from("grocery_stores")
      .select("id, name, city, image_url, approval_status, is_disabled, accepting_orders, created_at")
      .eq("owner_user_id", uid)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const list = Array.isArray(data) ? data : [];
    setStores(list);

    if (!storeId && list.length > 0) {
      setStoreId(list[0].id);
    }
  }

  async function loadItems(sid) {
    if (!sid) {
      setItems([]);
      return;
    }

    setLoadingItems(true);
    setErrMsg("");

    try {
      // ✅ Try selecting is_taxable (if column exists). If not, fallback safely.
      const selectWithTax =
        "id, store_id, name, description, price, image_url, category, is_available, in_stock, is_veg, is_best_seller, is_recommended, is_taxable, created_at";

      const selectNoTax =
        "id, store_id, name, description, price, image_url, category, is_available, in_stock, is_veg, is_best_seller, is_recommended, created_at";

      let data = null;
      let error = null;

      const r1 = await supabase
        .from("grocery_items")
        .select(selectWithTax)
        .eq("store_id", sid)
        .order("created_at", { ascending: false });
      data = r1.data;
      error = r1.error;

      if (error) {
        const msg = String(error?.message || "").toLowerCase();
        if (
          msg.includes("is_taxable") &&
          (msg.includes("does not exist") || msg.includes("column") || msg.includes("unknown"))
        ) {
          const r2 = await supabase
            .from("grocery_items")
            .select(selectNoTax)
            .eq("store_id", sid)
            .order("created_at", { ascending: false });
          if (r2.error) throw r2.error;
          setItems(Array.isArray(r2.data) ? r2.data : []);
        } else {
          throw error;
        }
      } else {
        setItems(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      setErrMsg(e?.message || String(e));
      setItems([]);
    } finally {
      setLoadingItems(false);
    }
  }

  async function loadCategoriesForStore(sid, { keepSelection } = { keepSelection: true }) {
    if (!sid) {
      setCategories([]);
      setManageCatId("");
      setSubcategories([]);
      return;
    }

    setCatsLoading(true);
    try {
      const { data, error } = await supabase
        .from("grocery_categories")
        .select("id, store_id, name, slug, created_at")
        .eq("store_id", sid)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const list = Array.isArray(data) ? data : [];
      setCategories(list);

      // choose first category as default for management
      if (!keepSelection) {
        setManageCatId(list?.[0]?.id || "");
      } else {
        if (!manageCatId && list?.[0]?.id) setManageCatId(list[0].id);
        // if selected category deleted, reset
        if (manageCatId && !list.some((c) => c.id === manageCatId)) {
          setManageCatId(list?.[0]?.id || "");
        }
      }
    } catch (e) {
      setCategories([]);
      setErrMsg(e?.message || String(e));
    } finally {
      setCatsLoading(false);
    }
  }

  async function loadSubcategoriesForCategory(sid, catId) {
    if (!sid || !catId) {
      setSubcategories([]);
      return;
    }

    setSubsLoading(true);
    try {
      const { data, error } = await supabase
        .from("grocery_subcategories")
        .select("id, store_id, category_id, name, slug, created_at")
        .eq("store_id", sid)
        .eq("category_id", catId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setSubcategories(Array.isArray(data) ? data : []);
    } catch (e) {
      setSubcategories([]);
      setErrMsg(e?.message || String(e));
    } finally {
      setSubsLoading(false);
    }
  }

  /* =========================
     Create Category/Subcategory
     ========================= */
  async function createCategory() {
    const nm = clean(newCatName);
    if (!storeId) return setErrMsg("Select a store first.");
    if (!nm) return setErrMsg("Enter category name.");

    const slug = slugify(nm);
    if (!slug) return setErrMsg("Category name must have letters/numbers.");

    setBusy(true);
    setErrMsg("");
    setInfoMsg("");

    try {
      const { error } = await supabase.from("grocery_categories").insert({
        store_id: storeId,
        name: nm,
        slug,
      });

      if (error) throw error;

      setInfoMsg("✅ Category created");
      setNewCatName("");

      await loadCategoriesForStore(storeId, { keepSelection: false });

      const { data: cats2 } = await supabase
        .from("grocery_categories")
        .select("id, name, slug, created_at")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(10);

      const match = (cats2 || []).find(
        (c) =>
          String(c.slug || "").toLowerCase() === slug.toLowerCase() ||
          String(c.name || "").toLowerCase() === nm.toLowerCase()
      );
      if (match?.id) setManageCatId(match.id);
    } catch (e) {
      setErrMsg(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function createSubcategory() {
    const nm = clean(newSubName);
    if (!storeId) return setErrMsg("Select a store first.");
    if (!manageCatId) return setErrMsg("Select a category first.");
    if (!nm) return setErrMsg("Enter subcategory name.");

    const slug = slugify(nm);
    if (!slug) return setErrMsg("Subcategory name must have letters/numbers.");

    setBusy(true);
    setErrMsg("");
    setInfoMsg("");

    try {
      const { error } = await supabase.from("grocery_subcategories").insert({
        store_id: storeId,
        category_id: manageCatId,
        name: nm,
        slug,
      });

      if (error) throw error;

      setInfoMsg("✅ Subcategory created");
      setNewSubName("");
      await loadSubcategoriesForCategory(storeId, manageCatId);
    } catch (e) {
      setErrMsg(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  /* =========================
     ✅ Save variants (safe)
     ========================= */
  async function saveVariantsForItem(itemId) {
    const list = Array.isArray(weightOptions) ? weightOptions : [];
    if (!itemId) return;
    if (list.length === 0) return;

    const sorted = [...list].sort(
      (a, b) => (Number(a.sort_order || 0) || 0) - (Number(b.sort_order || 0) || 0)
    );
    const hasDefault = sorted.some((x) => !!x.is_default);
    if (!hasDefault && sorted.length > 0) sorted[0].is_default = true;

    const payload = sorted.map((x, idx) => ({
      item_id: itemId,
      label: clean(x.label),
      unit: clean(x.unit) || "lb",
      value: Number(x.value || 0) || 0,
      price: Number(x.price || 0) || 0,
      in_stock: typeof x.in_stock === "boolean" ? x.in_stock : true,
      is_default: !!x.is_default,
      sort_order: idx,
    }));

    try {
      const del = await supabase.from("grocery_item_variants").delete().eq("item_id", itemId);
      if (del.error) throw del.error;

      const ins = await supabase.from("grocery_item_variants").insert(payload);
      if (ins.error) throw ins.error;
    } catch (e) {
      throw new Error(
        (e?.message || String(e)) +
          " | Variants table not ready. Create table: grocery_item_variants (I will give you SQL)."
      );
    }
  }

  /* =========================
     Item Save/Delete/Toggle
     ========================= */
  async function saveItem() {
    setErrMsg("");
    setInfoMsg("");

    if (!storeId) return setErrMsg("Please create/select a store first.");
    if (!clean(name)) return setErrMsg("Please enter product name.");

    if (!selectedCatId) return setErrMsg("Please select a category first.");
    const catObj = (categories || []).find((c) => c.id === selectedCatId);
    const catName = clean(catObj?.name);
    if (!catName) return setErrMsg("Selected category is invalid. Please refresh categories.");

    const p = Number(price || 0);
    if (Number.isNaN(p) || p < 0) return setErrMsg("Price must be a valid number.");

    if (Array.isArray(weightOptions) && weightOptions.length > 0) {
      const bad = weightOptions.some(
        (x) =>
          !Number.isFinite(Number(x.price)) || Number(x.price) < 0 || !clean(x.label)
      );
      if (bad) return setErrMsg("Please fix weight options: label & price must be valid.");
    }

    setBusy(true);

    try {
      const basePayload = {
        store_id: storeId,
        name: clean(name),
        description: clean(description),
        price: p,
        image_url: clean(imageUrl),
        category: catName,
        is_available: !!isAvailable,
        in_stock: !!inStock,
        is_veg: !!isVeg,
        is_best_seller: !!isBestSeller,
        is_recommended: !!isRecommended,
      };

      const subObj = (subcategories || []).find((s) => s.id === selectedSubId);
      const subName = clean(subObj?.name);

      const subVariants = [
        selectedSubId ? { subcategory_id: selectedSubId } : {},
        subName ? { subcategory: subName } : {},
        {},
      ];

      const taxVariants = [{ is_taxable: !!isTaxable }, {}];

      const variants = [];
      for (const sv of subVariants) {
        for (const tv of taxVariants) {
          variants.push({ ...(sv || {}), ...(tv || {}) });
        }
      }

      if (editingId) {
        const res = await trySaveWithVariants({
          table: "grocery_items",
          mode: "update",
          matchEq: { col: "id", val: editingId },
          basePayload,
          variants,
        });
        if (!res.ok) throw res.error;

        if (Array.isArray(weightOptions) && weightOptions.length > 0) {
          await saveVariantsForItem(editingId);
        }

        setInfoMsg("✅ Item updated");
      } else {
        const ins = await tryInsertReturningIdWithVariants({
          table: "grocery_items",
          basePayload,
          variants,
        });

        if (!ins.ok) {
          const res = await trySaveWithVariants({
            table: "grocery_items",
            mode: "insert",
            basePayload,
            variants,
          });
          if (!res.ok) throw res.error;

          if (Array.isArray(weightOptions) && weightOptions.length > 0) {
            setErrMsg(
              "Item saved but variants could not be linked (could not read inserted id). We will fix by ensuring grocery_item_variants table exists + insert returns id."
            );
          } else {
            setInfoMsg("✅ Item added");
          }
        } else {
          const newId = ins.id;

          if (Array.isArray(weightOptions) && weightOptions.length > 0) {
            await saveVariantsForItem(newId);
          }

          setInfoMsg("✅ Item added");
        }
      }

      resetForm();
      setShowModal(false);
      await loadItems(storeId);
    } catch (e) {
      setErrMsg(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function deleteItem(id) {
    if (!id) return;
    const ok = confirm("Delete this item?");
    if (!ok) return;

    setBusy(true);
    setErrMsg("");
    setInfoMsg("");

    try {
      const { error } = await supabase.from("grocery_items").delete().eq("id", id);
      if (error) throw error;

      try {
        await supabase.from("grocery_item_variants").delete().eq("item_id", id);
      } catch {}

      setInfoMsg("🗑️ Item deleted");
      await loadItems(storeId);
    } catch (e) {
      setErrMsg(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function quickToggle(id, patch) {
    setBusy(true);
    setErrMsg("");
    try {
      const { error } = await supabase.from("grocery_items").update(patch).eq("id", id);
      if (error) throw error;
      await loadItems(storeId);
    } catch (e) {
      setErrMsg(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function uploadImageFile(file) {
    if (!file) return;
    if (!storeId) {
      setErrMsg("Select a store first before uploading.");
      return;
    }

    setErrMsg("");
    setInfoMsg("");
    setUploading(true);

    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${safeIdPart(storeId)}/${Date.now()}_${Math.random().toString(16).slice(2)}.${ext}`;

    const bucketsToTry = ["grocery-images", "menu-images"];

    try {
      let publicUrl = "";
      let lastErr = null;

      for (const bucket of bucketsToTry) {
        try {
          const { error: upErr } = await supabase.storage.from(bucket).upload(path, file, {
            cacheControl: "3600",
            upsert: true,
            contentType: file.type || "image/*",
          });

          if (upErr) throw upErr;

          const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
          publicUrl = pub?.publicUrl || "";
          if (!publicUrl) throw new Error("Could not generate public URL.");
          setInfoMsg(`✅ Image uploaded (${bucket})`);
          break;
        } catch (e) {
          lastErr = e;
        }
      }

      if (!publicUrl) throw lastErr || new Error("Upload failed.");

      setImageUrl(publicUrl);
    } catch (e) {
      setErrMsg(
        (e?.message || String(e)) +
          "  |  Create a storage bucket named grocery-images (or menu-images) in Supabase."
      );
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  /* =========================
     Effects
     ========================= */
  useEffect(() => {
    loadSessionAndRole();

    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") router.push("/login");
    });

    return () => data?.subscription?.unsubscribe?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!storeId) {
      setItems([]);
      setCategories([]);
      setSubcategories([]);
      setManageCatId("");
      return;
    }
    loadItems(storeId);
    loadCategoriesForStore(storeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  useEffect(() => {
    if (stores.length > 0 && storeId) {
      const exists = stores.some((s) => s.id === storeId);
      if (!exists) setStoreId(stores[0].id);
    }
    if (stores.length > 0 && !storeId) setStoreId(stores[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stores]);

  useEffect(() => {
    if (!storeId || !manageCatId) {
      setSubcategories([]);
      return;
    }
    loadSubcategoriesForCategory(storeId, manageCatId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, manageCatId]);

  useEffect(() => {
    if (!storeId || !selectedCatId) {
      setSelectedSubId("");
      return;
    }
    loadSubcategoriesForCategory(storeId, selectedCatId);
    setSelectedSubId("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, selectedCatId]);

  if (checking) {
    return (
      <main style={{ padding: 24 }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", fontWeight: 900 }}>Checking…</div>
      </main>
    );
  }

  if (!canAccess) return null;

  return (
    <main style={pageBg}>
      {/* ✅ FIX: width spelling + 100% */}
      <div style={{ width: "100%", maxWidth: 1200, margin: "0 auto" }}>
        {/* ===== HERO ===== */}
        <div style={heroGlass}>
          <div>
            <div style={pill}>Grocery Owner</div>
            <h1 style={heroTitle}>Manage Menu</h1>
            <div style={subText}>Create Categories → Create Subcategories → Add Items (clean)</div>

            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link href="/groceries/owner/dashboard" style={btnPillLight}>
                Home
              </Link>
              <Link href="/groceries/owner/orders" style={btnPillLight}>
                Grocery Orders
              </Link>
              <Link href="/groceries/owner/settings" style={btnPillLight}>
                Grocery Settings
              </Link>

              <button
                type="button"
                onClick={openAdd}
                style={btnPillDark}
                disabled={!storeId || !storeApproved || storeDisabled || busy}
                title={
                  !storeId
                    ? "Select a store first"
                    : !storeApproved
                    ? "Store must be approved by admin"
                    : storeDisabled
                    ? "Store disabled by admin"
                    : "Add item"
                }
              >
                + Add Item
              </button>
            </div>
          </div>

          <div style={controlsGlass}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ fontWeight: 950, color: "#0b1220" }}>Owner:</div>
              <div style={{ color: "rgba(17,24,39,0.72)", fontWeight: 900 }}>{email || "-"}</div>

              <div style={{ width: 12 }} />

              <Link href="/groceries" style={btnSmallOutlineLink}>
                View Grocery Stores
              </Link>
              <button
                type="button"
                onClick={() => {
                  if (storeId) {
                    loadItems(storeId);
                    loadCategoriesForStore(storeId);
                    if (manageCatId) loadSubcategoriesForCategory(storeId, manageCatId);
                  }
                }}
                style={btnSmallOutline}
                disabled={busy || !storeId}
                title="Refresh menu"
              >
                Refresh
              </button>
            </div>

            <div style={{ marginTop: 10 }}>
              <div style={{ fontWeight: 950, color: "#0b1220", marginBottom: 6 }}>
                Switch Store (Owner only)
              </div>
              <select
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                style={input}
                disabled={busy}
              >
                <option value="">-- Select --</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.city ? `(${s.city})` : ""}
                  </option>
                ))}
              </select>

              {stores.length === 0 ? (
                <div style={{ marginTop: 10, fontWeight: 900, color: "rgba(17,24,39,0.7)" }}>
                  You have no store yet. Create one in{" "}
                  <Link href="/groceries/owner/settings" style={{ fontWeight: 1000, color: "#111" }}>
                    Grocery Store Settings
                  </Link>
                  .
                </div>
              ) : null}

              {activeStore ? (
                <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span style={tag}>{clean(activeStore.approval_status) || "pending"}</span>
                  <span style={tag}>{activeStore.is_disabled ? "Disabled" : "Enabled"}</span>
                  <span style={tag}>{activeStore.accepting_orders ? "Accepting orders" : "Not accepting"}</span>
                </div>
              ) : null}
            </div>

            {!storeId ? (
              <div style={alertInfoMini}>✅ Select a store to manage menu.</div>
            ) : !storeApproved ? (
              <div style={alertInfoMini}>⏳ Store is pending. Admin approval required before adding items.</div>
            ) : storeDisabled ? (
              <div style={alertErrMini}>🚫 Store disabled by admin.</div>
            ) : (
              <div style={okMini}>✅ No manual typing inside Add Item</div>
            )}
          </div>
        </div>

        {errMsg ? <div style={alertErr}>{errMsg}</div> : null}
        {infoMsg ? <div style={alertOk}>{infoMsg}</div> : null}

        <div style={identityBar}>
          <span style={pillThin}>Owner: {email || "-"}</span>
          <span style={pillThin}>Role: {role || "-"}</span>
          <span style={pillThin}>Store: {activeStore?.name || "-"}</span>
          <span style={pillThin}>Store ID: {storeId || "-"}</span>
        </div>

        {/* ===== Categories & Subcategories ===== */}
        <div style={panelGlass}>
          <div style={panelHeaderRow}>
            <div>
              <div style={panelTitle}>Categories & Subcategories</div>
              <div style={panelSub}>
                Flow: Create Category → Select Category → Create Subcategory → Add Item (select from dropdown)
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <button
                type="button"
                onClick={() => {
                  if (storeId) loadCategoriesForStore(storeId);
                  if (storeId && manageCatId) loadSubcategoriesForCategory(storeId, manageCatId);
                }}
                style={btnSmallOutline}
                disabled={!storeId || busy}
              >
                Refresh
              </button>
              <span style={tag}>No manual typing inside Add Item ✅</span>
            </div>
          </div>

          <div style={twoColGrid}>
            <div style={miniPanel}>
              <div style={miniPanelTitle}>Create Category</div>

              <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 140px", gap: 10 }}>
                <input
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  style={input}
                  placeholder="e.g. Drinks"
                  disabled={!storeId || busy}
                />
                <button
                  type="button"
                  onClick={createCategory}
                  style={btnPillDark}
                  disabled={!storeId || busy || !clean(newCatName)}
                  title={!storeId ? "Select store first" : "Create category"}
                >
                  {busy ? "..." : "Create"}
                </button>
              </div>

              <div style={{ marginTop: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={miniPanelTitle}>All Categories</div>
                <button
                  type="button"
                  onClick={() => (storeId ? loadCategoriesForStore(storeId) : null)}
                  style={btnTiny}
                  disabled={!storeId || catsLoading || busy}
                >
                  {catsLoading ? "Loading…" : "Refresh"}
                </button>
              </div>

              <div style={{ marginTop: 10 }}>
                <select
                  value={manageCatId}
                  onChange={(e) => setManageCatId(e.target.value)}
                  style={input}
                  disabled={!storeId || busy}
                >
                  <option value="">-- Select Category --</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>

                {!storeId ? (
                  <div style={hint}>Select a store first.</div>
                ) : categories.length === 0 ? (
                  <div style={hint}>No categories yet. Create your first category above.</div>
                ) : null}
              </div>
            </div>

            <div style={miniPanel}>
              <div style={miniPanelTitle}>Create Subcategory (inside selected category)</div>

              <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 140px", gap: 10 }}>
                <input
                  value={newSubName}
                  onChange={(e) => setNewSubName(e.target.value)}
                  style={input}
                  placeholder="e.g. Soda"
                  disabled={!storeId || !manageCatId || busy}
                />
                <button
                  type="button"
                  onClick={createSubcategory}
                  style={btnPillDark}
                  disabled={!storeId || !manageCatId || busy || !clean(newSubName)}
                  title={!manageCatId ? "Select category first" : "Create subcategory"}
                >
                  {busy ? "..." : "Create"}
                </button>
              </div>

              <div style={{ marginTop: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={miniPanelTitle}>Subcategories</div>
                <button
                  type="button"
                  onClick={() => (storeId && manageCatId ? loadSubcategoriesForCategory(storeId, manageCatId) : null)}
                  style={btnTiny}
                  disabled={!storeId || !manageCatId || subsLoading || busy}
                >
                  {subsLoading ? "Loading…" : "Refresh"}
                </button>
              </div>

              <div style={{ marginTop: 10 }}>
                {!manageCatId ? (
                  <div style={hint}>Select a category, then create subcategories.</div>
                ) : subcategories.length === 0 ? (
                  <div style={hint}>No subcategories yet. Create one above.</div>
                ) : (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {subcategories.slice(0, 12).map((s) => (
                      <span key={s.id} style={tag}>
                        {s.name}
                      </span>
                    ))}
                    {subcategories.length > 12 ? <span style={tag}>+{subcategories.length - 12} more</span> : null}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div style={noteRow}>
            <span style={notePill}>
              Note: Your error earlier was because <b>grocery_categories.slug</b> is required. We now auto-generate it.
            </span>
            <span style={notePill}>
              Note: Your <b>grocery_items</b> table doesn’t have “subcategory” column. We safely save subcategory only if your DB supports it.
            </span>
            <span style={notePill}>
              Note: Tax toggle saves to <b>grocery_items.is_taxable</b> if your DB has that column (safe fallback if not).
            </span>
            <span style={notePill}>
              NEW: Weight options save to <b>grocery_item_variants</b> (safe; won’t break if missing).
            </span>
          </div>
        </div>

        {/* ===== Stats + Filters ===== */}
        <div style={panelGlass}>
          <div style={statsRow}>
            <div style={statCard}>
              <div style={statNum}>{stats.total}</div>
              <div style={statLbl}>Total Items</div>
            </div>
            <div style={statCard}>
              <div style={statNum}>{stats.inS}</div>
              <div style={statLbl}>In Stock</div>
            </div>
            <div style={statCard}>
              <div style={statNum}>{stats.outS}</div>
              <div style={statLbl}>Out of Stock</div>
            </div>
            <div style={statCard}>
              <div style={statNum}>{stats.best}</div>
              <div style={statLbl}>Best Sellers</div>
            </div>
          </div>
        </div>

        <div style={panelGlass}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div style={panelTitle}>Search</div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button type="button" onClick={resetFilters} style={btnSmallOutline} disabled={busy}>
                Reset
              </button>
              <span style={tag}>Showing: {showingCount} items</span>
            </div>
          </div>

          <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 12 }}>
            <input value={search} onChange={(e) => setSearch(e.target.value)} style={input} placeholder="Search your menu…" />
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={input}>
              <option value="newest">Sort: Newest</option>
              <option value="oldest">Sort: Oldest</option>
              <option value="price_asc">Sort: Price (Low → High)</option>
              <option value="price_desc">Sort: Price (High → Low)</option>
              <option value="name_asc">Sort: Name (A → Z)</option>
              <option value="name_desc">Sort: Name (Z → A)</option>
            </select>
          </div>

          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={filterGroup}>
              <div style={filterTitle}>Veg / Non-Veg</div>
              <div style={filterRow}>
                <button type="button" onClick={() => setVegFilter("all")} style={vegFilter === "all" ? filterBtnOn : filterBtnOff}>
                  All
                </button>
                <button type="button" onClick={() => setVegFilter("veg")} style={vegFilter === "veg" ? filterBtnOn : filterBtnOff}>
                  Veg
                </button>
                <button type="button" onClick={() => setVegFilter("nonveg")} style={vegFilter === "nonveg" ? filterBtnOn : filterBtnOff}>
                  Non-Veg
                </button>
              </div>
            </div>

            <div style={filterGroup}>
              <div style={filterTitle}>Stock / Best Seller</div>
              <div style={filterRow}>
                <button type="button" onClick={() => setStockFilter("all")} style={stockFilter === "all" ? filterBtnOn : filterBtnOff}>
                  All Stock
                </button>
                <button type="button" onClick={() => setStockFilter("instock")} style={stockFilter === "instock" ? filterBtnOn : filterBtnOff}>
                  In Stock
                </button>
                <button type="button" onClick={() => setStockFilter("out")} style={stockFilter === "out" ? filterBtnOn : filterBtnOff}>
                  Out
                </button>
                <button type="button" onClick={() => setStockFilter("best")} style={stockFilter === "best" ? filterBtnOn : filterBtnOff}>
                  Best
                </button>
                <button type="button" onClick={() => setStockFilter("rec")} style={stockFilter === "rec" ? filterBtnOn : filterBtnOff}>
                  Rec
                </button>
              </div>

              <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button type="button" onClick={() => setStockFilter("available")} style={stockFilter === "available" ? filterBtnOn : filterBtnOff}>
                  Available
                </button>
                <button type="button" onClick={() => setStockFilter("hidden")} style={stockFilter === "hidden" ? filterBtnOn : filterBtnOff}>
                  Hidden
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ===== ITEMS LIST ===== */}
        <div style={panelGlass}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div style={panelTitle}>Your Items</div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <span style={tag}>Showing: {showingCount}</span>
              <button type="button" onClick={() => loadItems(storeId)} style={chip} disabled={busy || !storeId}>
                Refresh
              </button>
            </div>
          </div>

          {loadingItems ? (
            <div style={{ marginTop: 10, fontWeight: 900, color: "rgba(17,24,39,0.7)" }}>Loading items…</div>
          ) : null}

          {!loadingItems && (!filteredItems || filteredItems.length === 0) ? (
            <div style={emptyBox}>No items found for current filters. Try Reset.</div>
          ) : null}

          {!loadingItems && filteredItems?.length ? (
            <div style={grid}>
              {filteredItems.map((it) => (
                <div key={it.id} style={cardGlass}>
                  <div style={imgWrap}>
                    {it.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.image_url} alt={it.name} style={img} />
                    ) : (
                      <div style={imgPlaceholder}>No Image</div>
                    )}

                    <div style={topBadges}>
                      <span style={badgeDark}>{money(it.price)}</span>
                      <span style={badgeLight}>{clean(it.category) || "General"}</span>
                    </div>
                  </div>

                  <div style={{ padding: 12 }}>
                    <div style={{ fontSize: 16, fontWeight: 1000, color: "#0b1220" }}>
                      {it.name || "Item"}
                    </div>

                    {it.description ? (
                      <div style={{ marginTop: 6, color: "rgba(17,24,39,0.7)", fontWeight: 800, fontSize: 12 }}>
                        {clampText(it.description, 110)}
                      </div>
                    ) : null}

                    <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <span style={it.is_available ? openPill : closedPill}>
                        {it.is_available ? "Available" : "Hidden"}
                      </span>
                      <span style={it.in_stock ? openPill : closedPill}>
                        {it.in_stock ? "In stock" : "Out of stock"}
                      </span>
                      {it.is_veg ? <span style={tag}>Veg</span> : null}
                      {it.is_best_seller ? <span style={tagStrong}>Best</span> : null}
                      {it.is_recommended ? <span style={tagStrong}>Rec</span> : null}
                      {typeof it?.is_taxable === "boolean" ? (
                        isTaxableRow(it) ? <span style={tagStrong}>Taxable</span> : <span style={tag}>Non-Tax</span>
                      ) : null}
                    </div>

                    <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <button type="button" onClick={() => openEdit(it)} style={btnSmallOutline} disabled={busy}>
                        Edit
                      </button>

                      <button type="button" onClick={() => deleteItem(it.id)} style={btnSmallDanger} disabled={busy}>
                        Delete
                      </button>

                      <button
                        type="button"
                        onClick={() => quickToggle(it.id, { is_available: !it.is_available })}
                        style={chip}
                        disabled={busy}
                        title="Toggle available"
                      >
                        {it.is_available ? "Hide" : "Show"}
                      </button>

                      <button
                        type="button"
                        onClick={() => quickToggle(it.id, { in_stock: !it.in_stock })}
                        style={chip}
                        disabled={busy}
                        title="Toggle stock"
                      >
                        {it.in_stock ? "Mark Out" : "Mark In"}
                      </button>
                    </div>

                    <div style={{ marginTop: 10, fontSize: 11, fontWeight: 850, color: "rgba(17,24,39,0.55)" }}>
                      Item ID: {it.id}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {/* ===== MODAL ===== */}
      {showModal ? (
        <div
          style={modalOverlay}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div style={modalCard}>
            <div style={modalHeader}>
              <div>
                <div style={{ fontWeight: 1000, fontSize: 16, color: "#0b1220" }}>
                  {editingId ? "Edit Item" : "Add Item"}
                </div>
                <div style={{ fontSize: 12, fontWeight: 850, color: "rgba(17,24,39,0.62)" }}>
                  Store: {activeStore?.name || "-"} • Upload bucket: grocery-images (fallback menu-images)
                </div>
              </div>

              <button type="button" onClick={closeModal} style={iconBtn} disabled={busy || uploading} aria-label="Close">
                ✕
              </button>
            </div>

            {/* ✅ FIX: modalBody scroll + always visible footer */}
            <div style={modalBody}>
              <div style={modalGrid}>
                <div>
                  <div style={label}>Item Name *</div>
                  <input value={name} onChange={(e) => setName(e.target.value)} style={input} placeholder="Coke" />
                </div>

                <div>
                  <div style={label}>Base Price *</div>
                  <input value={price} onChange={(e) => setPrice(e.target.value)} style={input} placeholder="20" inputMode="decimal" />
                  <div style={hintSmall}>Base price is used if you don’t add weight options.</div>
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <div style={variantBox}>
                    <div style={variantTopRow}>
                      <div>
                        <div style={{ fontWeight: 1000, color: "#0b1220" }}>Weight Options (Pro)</div>
                        <div style={{ fontSize: 12, fontWeight: 850, color: "rgba(17,24,39,0.62)" }}>
                          Add multiple weights (lb/kg/etc). Customer will select one on product page.
                        </div>
                      </div>
                      <span style={tag}>Optional ✅</span>
                    </div>

                    <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "140px 120px 1fr 160px 120px", gap: 10, alignItems: "end" }}>
                      <div>
                        <div style={label}>Unit</div>
                        <select value={variantUnit} onChange={(e) => setVariantUnit(e.target.value)} style={input} disabled={busy}>
                          <option value="lb">lb</option>
                          <option value="kg">kg</option>
                          <option value="pcs">pcs</option>
                          <option value="pack">pack</option>
                        </select>
                      </div>

                      <div>
                        <div style={label}>Value</div>
                        <input value={variantLabel} onChange={(e) => setVariantLabel(e.target.value)} style={input} placeholder="1" inputMode="decimal" disabled={busy} />
                      </div>

                      <div>
                        <div style={label}>Label Preview</div>
                        <div style={variantPreview}>
                          {variantLabel ? buildVariantLabel(variantLabel, variantUnit) : <span style={{ opacity: 0.65 }}>e.g. 1 lb</span>}
                        </div>
                      </div>

                      <div>
                        <div style={label}>Price</div>
                        <input value={variantPrice} onChange={(e) => setVariantPrice(e.target.value)} style={input} placeholder="20" inputMode="decimal" disabled={busy} />
                      </div>

                      <div>
                        <div style={label}>Stock</div>
                        <select value={variantInStock ? "yes" : "no"} onChange={(e) => setVariantInStock(e.target.value === "yes")} style={input} disabled={busy}>
                          <option value="yes">In stock</option>
                          <option value="no">Out</option>
                        </select>
                      </div>
                    </div>

                    <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                      <button type="button" onClick={addWeightOption} style={btnSmallOutline} disabled={busy}>
                        + Add Option
                      </button>
                      {weightOptions.length ? (
                        <button type="button" onClick={resetVariantsUI} style={btnSmallDanger} disabled={busy}>
                          Clear Options
                        </button>
                      ) : null}
                      <div style={{ marginLeft: "auto", fontWeight: 900, color: "rgba(17,24,39,0.65)", fontSize: 12 }}>
                        Options: <b>{weightOptions.length}</b>
                      </div>
                    </div>

                    {weightOptions.length ? (
                      <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
                        {weightOptions.map((o) => (
                          <div key={o.id} style={variantRow}>
                            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                              <span style={o.is_default ? tagStrong : tag}>{o.label}</span>
                              <span style={tag}>{money(o.price)}</span>
                              <span style={o.in_stock ? openPill : closedPill}>{o.in_stock ? "In stock" : "Out"}</span>
                              {o.is_default ? <span style={tagStrong}>Default</span> : <span style={tag}>Not default</span>}
                            </div>

                            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                              <button type="button" onClick={() => setDefaultWeightOption(o.id)} style={btnTiny} disabled={busy}>
                                Set Default
                              </button>
                              <button type="button" onClick={() => removeWeightOption(o.id)} style={btnTinyDanger} disabled={busy}>
                                Remove
                              </button>
                            </div>
                          </div>
                        ))}
                        <div style={hintSmall}>
                          Save will store these options in <b>grocery_item_variants</b>. If table doesn’t exist, item still saves but variants won’t.
                        </div>
                      </div>
                    ) : (
                      <div style={hintSmall}>No weight options added. Customer will just see base price.</div>
                    )}
                  </div>
                </div>

                <div>
                  <div style={label}>Category *</div>
                  <select value={selectedCatId} onChange={(e) => setSelectedCatId(e.target.value)} style={input} disabled={!storeId || busy}>
                    <option value="">-- Select Category --</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <div style={hintSmall}>Create categories above (separate section).</div>
                </div>

                <div>
                  <div style={label}>Subcategory (optional)</div>
                  <select value={selectedSubId} onChange={(e) => setSelectedSubId(e.target.value)} style={input} disabled={!storeId || !selectedCatId || busy}>
                    <option value="">-- Select Subcategory --</option>
                    {(subcategories || []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <div style={hintSmall}>Create subcategories above (inside selected category).</div>
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <div style={label}>Description</div>
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} style={textarea} placeholder="Short description…" rows={3} />
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <div style={imgSection}>
                    <div>
                      <div style={{ fontWeight: 1000, color: "#0b1220" }}>Item Image</div>
                      <div style={{ fontSize: 12, fontWeight: 850, color: "rgba(17,24,39,0.6)" }}>
                        Upload to bucket: <b>grocery-images</b> (fallback: <b>menu-images</b>)
                      </div>
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 12, fontWeight: 950, color: "rgba(17,24,39,0.75)", marginBottom: 6 }}>
                          Image URL (auto-filled after upload)
                        </div>
                        <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} style={input} placeholder="https://..." />
                      </div>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-end" }}>
                      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => uploadImageFile(e.target.files?.[0])} />
                      <button
                        type="button"
                        onClick={() => fileRef.current?.click?.()}
                        style={btnPillDark}
                        disabled={uploading || busy || !storeId || !storeApproved || storeDisabled}
                        title={!storeId ? "Select store first" : !storeApproved ? "Store must be approved" : storeDisabled ? "Store disabled" : "Upload image"}
                      >
                        {uploading ? "Uploading…" : "Upload Image"}
                      </button>

                      {imageUrl ? (
                        <div style={{ width: 180, height: 110, borderRadius: 14, overflow: "hidden", border: "1px solid rgba(0,0,0,0.12)" }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={imageUrl} alt="preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        </div>
                      ) : (
                        <div style={previewEmpty}>No preview</div>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <div style={toggleGrid}>
                    <button type="button" onClick={() => setIsVeg(true)} style={isVeg ? toggleOn : toggleOff} disabled={busy}>
                      Veg
                    </button>
                    <button type="button" onClick={() => setIsVeg(false)} style={!isVeg ? toggleOn : toggleOff} disabled={busy}>
                      Non-Veg
                    </button>

                    <button type="button" onClick={() => setInStock(true)} style={inStock ? toggleOn : toggleOff} disabled={busy}>
                      In Stock: YES
                    </button>
                    <button type="button" onClick={() => setInStock(false)} style={!inStock ? toggleOn : toggleOff} disabled={busy}>
                      In Stock: NO
                    </button>

                    <button type="button" onClick={() => setIsBestSeller(true)} style={isBestSeller ? toggleOn : toggleOff} disabled={busy}>
                      Best Seller: YES
                    </button>
                    <button type="button" onClick={() => setIsBestSeller(false)} style={!isBestSeller ? toggleOn : toggleOff} disabled={busy}>
                      Best Seller: NO
                    </button>

                    <button type="button" onClick={() => setIsRecommended(true)} style={isRecommended ? toggleOn : toggleOff} disabled={busy}>
                      Recommended: YES
                    </button>
                    <button type="button" onClick={() => setIsRecommended(false)} style={!isRecommended ? toggleOn : toggleOff} disabled={busy}>
                      Recommended: NO
                    </button>

                    <button type="button" onClick={() => setIsAvailable(true)} style={isAvailable ? toggleOn : toggleOff} disabled={busy}>
                      Available: YES
                    </button>
                    <button type="button" onClick={() => setIsAvailable(false)} style={!isAvailable ? toggleOn : toggleOff} disabled={busy}>
                      Available: NO
                    </button>

                    <button type="button" onClick={() => setIsTaxable(true)} style={isTaxable ? toggleOn : toggleOff} disabled={busy}>
                      Tax: YES
                    </button>
                    <button type="button" onClick={() => setIsTaxable(false)} style={!isTaxable ? toggleOn : toggleOff} disabled={busy}>
                      Tax: NO
                    </button>
                  </div>
                </div>
              </div>

              <div style={modalFooter}>
                <button type="button" onClick={saveItem} style={btnPrimary} disabled={busy || uploading || !storeId || !storeApproved || storeDisabled}>
                  {busy ? "Saving…" : editingId ? "Save Changes" : "Add Item"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setShowModal(false);
                  }}
                  style={btnSmallOutline}
                  disabled={busy || uploading}
                >
                  Cancel
                </button>
              </div>

              <div style={{ marginTop: 10, fontSize: 12, fontWeight: 850, color: "rgba(17,24,39,0.62)" }}>
                Note: Items save to <b>grocery_items</b>. Category/Subcategory are managed separately above.
              </div>
            </div>
          </div>
        </div>
      ) : null}
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
    "radial-gradient(1200px 600px at 20% 10%, rgba(255,140,0,0.18), transparent 62%), radial-gradient(900px 520px at 80% 18%, rgba(80,160,255,0.18), transparent 58%), linear-gradient(180deg, #f7f7fb, #ffffff)",
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
  minWidth: 340,
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

const identityBar = {
  marginTop: 12,
  borderRadius: 16,
  padding: 12,
  background: "rgba(255,255,255,0.70)",
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 12px 28px rgba(0,0,0,0.06)",
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const pillThin = {
  fontSize: 12,
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.75)",
  color: "rgba(17,24,39,0.82)",
  fontWeight: 900,
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

const textarea = {
  width: "100%",
  padding: 10,
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.92)",
  outline: "none",
  fontWeight: 800,
  resize: "vertical",
};

const label = {
  fontWeight: 950,
  color: "#0b1220",
  marginBottom: 6,
  fontSize: 12,
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

const btnSmallOutlineLink = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.85)",
  color: "#111827",
  textDecoration: "none",
  fontWeight: 950,
};

const btnSmallOutline = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.9)",
  cursor: "pointer",
  fontWeight: 950,
};

const btnPillLight = {
  padding: "10px 14px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.85)",
  cursor: "pointer",
  fontWeight: 950,
  color: "#111827",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const btnPillDark = {
  padding: "10px 14px",
  borderRadius: 999,
  border: "1px solid rgba(17,24,39,0.95)",
  background: "rgba(17,24,39,0.95)",
  cursor: "pointer",
  fontWeight: 950,
  color: "#fff",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: "0 12px 26px rgba(17,24,39,0.16)",
};

const btnTiny = {
  padding: "8px 10px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.9)",
  cursor: "pointer",
  fontWeight: 900,
  fontSize: 12,
};

const btnTinyDanger = {
  padding: "8px 10px",
  borderRadius: 999,
  border: "1px solid rgba(239,68,68,0.25)",
  background: "rgba(254,242,242,0.95)",
  cursor: "pointer",
  fontWeight: 900,
  fontSize: 12,
  color: "#7f1d1d",
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

const alertOk = {
  marginTop: 12,
  padding: 12,
  border: "1px solid #bbf7d0",
  background: "rgba(236,253,245,0.92)",
  borderRadius: 14,
  color: "#065f46",
  fontWeight: 900,
};

const alertInfoMini = {
  marginTop: 10,
  padding: 10,
  borderRadius: 14,
  border: "1px solid rgba(16,185,129,0.25)",
  background: "rgba(236,253,245,0.92)",
  color: "#065f46",
  fontWeight: 900,
  fontSize: 12,
};

const alertErrMini = {
  marginTop: 10,
  padding: 10,
  borderRadius: 14,
  border: "1px solid rgba(239,68,68,0.25)",
  background: "rgba(254,242,242,0.92)",
  color: "#7f1d1d",
  fontWeight: 900,
  fontSize: 12,
};

const okMini = {
  marginTop: 10,
  padding: 10,
  borderRadius: 14,
  border: "1px solid rgba(17,24,39,0.12)",
  background: "rgba(17,24,39,0.06)",
  color: "rgba(17,24,39,0.85)",
  fontWeight: 900,
  fontSize: 12,
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

const statsRow = {
  marginTop: 12,
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 12,
};

const statCard = {
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.78)",
  boxShadow: "0 12px 26px rgba(0,0,0,0.06)",
  padding: 14,
};

const statNum = {
  fontSize: 22,
  fontWeight: 1000,
  color: "#0b1220",
};

const statLbl = {
  marginTop: 6,
  fontSize: 12,
  fontWeight: 900,
  color: "rgba(17,24,39,0.62)",
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

const chip = {
  padding: "10px 12px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.7)",
  cursor: "pointer",
  fontWeight: 900,
  color: "rgba(17,24,39,0.85)",
};

const btnSmallDanger = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(239,68,68,0.25)",
  background: "rgba(254,242,242,0.95)",
  cursor: "pointer",
  fontWeight: 950,
  color: "#7f1d1d",
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

const filterGroup = {
  borderRadius: 16,
  padding: 12,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.72)",
  boxShadow: "0 10px 22px rgba(0,0,0,0.06)",
};

const filterTitle = {
  fontSize: 12,
  fontWeight: 950,
  color: "rgba(17,24,39,0.78)",
  marginBottom: 8,
};

const filterRow = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  alignItems: "center",
};

const filterBtnOn = {
  padding: "10px 14px",
  borderRadius: 999,
  border: "1px solid rgba(17,24,39,0.18)",
  background: "rgba(17,24,39,0.92)",
  color: "#fff",
  fontWeight: 950,
  cursor: "pointer",
  boxShadow: "0 12px 26px rgba(17,24,39,0.12)",
};

const filterBtnOff = {
  padding: "10px 14px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.9)",
  color: "#111827",
  fontWeight: 950,
  cursor: "pointer",
};

/* ===== Modal styles ===== */
const modalOverlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(17,24,39,0.55)",
  backdropFilter: "blur(6px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  zIndex: 9999,
};

/* ✅ FIX: maxHeight + flex so body scroll works */
const modalCard = {
  width: "min(920px, 96vw)",
  maxHeight: "92vh",
  borderRadius: 20,
  background: "rgba(255,255,255,0.92)",
  border: "1px solid rgba(0,0,0,0.12)",
  boxShadow: "0 30px 80px rgba(0,0,0,0.25)",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
};

const modalHeader = {
  padding: 14,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  borderBottom: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.8)",
};

const iconBtn = {
  width: 40,
  height: 40,
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.9)",
  cursor: "pointer",
  fontWeight: 1000,
};

/* ✅ FIX: scroll inside modal body */
const modalBody = {
  padding: 14,
  overflowY: "auto",
  flex: 1,
};

const modalGrid = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
};

const imgSection = {
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(255,255,255,0.8)",
  padding: 12,
  display: "grid",
  gridTemplateColumns: "1fr 260px",
  gap: 12,
  alignItems: "start",
};

const previewEmpty = {
  width: 180,
  height: 110,
  borderRadius: 14,
  border: "1px dashed rgba(0,0,0,0.18)",
  background: "rgba(255,255,255,0.7)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "rgba(17,24,39,0.55)",
  fontWeight: 900,
  fontSize: 12,
};

const toggleGrid = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
};

const toggleOn = {
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid rgba(17,24,39,0.18)",
  background: "rgba(17,24,39,0.92)",
  color: "#fff",
  fontWeight: 950,
  cursor: "pointer",
  boxShadow: "0 12px 26px rgba(17,24,39,0.12)",
};

const toggleOff = {
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.92)",
  color: "#111827",
  fontWeight: 950,
  cursor: "pointer",
};

const modalFooter = {
  marginTop: 12,
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  alignItems: "center",
};

/* ===== New small UI styles ===== */
const panelHeaderRow = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 10,
  flexWrap: "wrap",
};

const panelTitle = {
  fontSize: 16,
  fontWeight: 1000,
  color: "#0b1220",
};

const panelSub = {
  marginTop: 6,
  fontSize: 12,
  fontWeight: 850,
  color: "rgba(17,24,39,0.62)",
  lineHeight: 1.4,
};

const twoColGrid = {
  marginTop: 12,
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
};

const miniPanel = {
  borderRadius: 16,
  padding: 12,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.78)",
  boxShadow: "0 10px 22px rgba(0,0,0,0.05)",
};

const miniPanelTitle = {
  fontSize: 13,
  fontWeight: 1000,
  color: "#0b1220",
};

const hint = {
  marginTop: 10,
  fontSize: 12,
  fontWeight: 850,
  color: "rgba(17,24,39,0.62)",
};

const hintSmall = {
  marginTop: 6,
  fontSize: 11,
  fontWeight: 850,
  color: "rgba(17,24,39,0.55)",
};

const noteRow = {
  marginTop: 12,
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  alignItems: "center",
};

const notePill = {
  fontSize: 12,
  padding: "8px 10px",
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.72)",
  color: "rgba(17,24,39,0.78)",
  fontWeight: 850,
};

/* ✅ NEW variant styles */
const variantBox = {
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(255,255,255,0.8)",
  padding: 12,
};

const variantTopRow = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 10,
  flexWrap: "wrap",
};

const variantPreview = {
  width: "100%",
  padding: 10,
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.92)",
  fontWeight: 900,
  color: "rgba(17,24,39,0.85)",
};

const variantRow = {
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.78)",
  padding: 10,
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  flexWrap: "wrap",
  alignItems: "center",
};