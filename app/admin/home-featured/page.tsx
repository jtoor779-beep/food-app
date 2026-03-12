"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import supabase from "@/lib/supabase";

function money(v: any) {
  const n = Number(v || 0);
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

type RestaurantRef = { id: string; name: string | null };
type MenuItemRef = { id: string; name: string | null; restaurant_id: string | null; price?: number | null; image_url?: string | null; in_stock?: boolean | null };
type GroceryStoreRef = { id: string; name: string | null };
type GroceryItemRef = { id: string; name: string | null; store_id: string | null; price?: number | null; image_url?: string | null; in_stock?: boolean | null };

type HomeFeaturedItemRow = {
  id: string;
  item_type: "menu" | "grocery" | string | null;
  menu_item_id: string | null;
  grocery_item_id: string | null;
  sort_order: number | null;
  is_enabled: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export default function AdminHomeFeaturedPage() {
  const [featuredLoading, setFeaturedLoading] = useState(false);
  const [featuredSaving, setFeaturedSaving] = useState(false);
  const [featuredError, setFeaturedError] = useState<string>("");
  const [homeFeaturedRows, setHomeFeaturedRows] = useState<HomeFeaturedItemRow[]>([]);
  const [featuredId, setFeaturedId] = useState<string>("");
  const [featuredItemType, setFeaturedItemType] = useState<"menu" | "grocery">("menu");
  const [selectedMenuItemId, setSelectedMenuItemId] = useState<string>("");
  const [selectedGroceryItemId, setSelectedGroceryItemId] = useState<string>("");
  const [featuredSortOrder, setFeaturedSortOrder] = useState<string>("0");
  const [featuredEnabled, setFeaturedEnabled] = useState<boolean>(true);

  const [restaurantRefs, setRestaurantRefs] = useState<RestaurantRef[]>([]);
  const [menuItemRefs, setMenuItemRefs] = useState<MenuItemRef[]>([]);
  const [groceryStoreRefs, setGroceryStoreRefs] = useState<GroceryStoreRef[]>([]);
  const [groceryItemRefs, setGroceryItemRefs] = useState<GroceryItemRef[]>([]);

  const restaurantNameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of restaurantRefs) m.set(String(r.id), String(r.name || "Restaurant"));
    return m;
  }, [restaurantRefs]);

  const groceryStoreNameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of groceryStoreRefs) m.set(String(s.id), String(s.name || "Grocery Store"));
    return m;
  }, [groceryStoreRefs]);

  const menuItemOptions = useMemo(() => [...menuItemRefs].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""))), [menuItemRefs]);
  const groceryItemOptions = useMemo(() => [...groceryItemRefs].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""))), [groceryItemRefs]);

  function resetFeaturedForm() {
    setFeaturedId("");
    setFeaturedItemType("menu");
    setSelectedMenuItemId("");
    setSelectedGroceryItemId("");
    setFeaturedSortOrder("0");
    setFeaturedEnabled(true);
  }

  function loadFeaturedIntoForm(row: HomeFeaturedItemRow) {
    const t = String(row?.item_type || "menu").toLowerCase() === "grocery" ? "grocery" : "menu";
    setFeaturedId(String(row?.id || ""));
    setFeaturedItemType(t);
    setSelectedMenuItemId(String(row?.menu_item_id || ""));
    setSelectedGroceryItemId(String(row?.grocery_item_id || ""));
    setFeaturedSortOrder(String(Number(row?.sort_order ?? 0)));
    setFeaturedEnabled(row?.is_enabled !== false);
  }

  async function loadHomeFeaturedItems(selectId?: string) {
    setFeaturedLoading(true);
    setFeaturedError("");
    try {
      const { data, error } = await supabase
        .from("home_featured_items")
        .select("id, item_type, menu_item_id, grocery_item_id, sort_order, is_enabled, created_at, updated_at")
        .order("sort_order", { ascending: true })
        .order("updated_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) {
        setFeaturedError(`Home featured items load failed: ${error.message}`);
        return;
      }

      const rows: HomeFeaturedItemRow[] = Array.isArray(data) ? (data as any) : [];
      setHomeFeaturedRows(rows);

      const desiredId = selectId || featuredId;
      const pick = (desiredId && rows.find((r) => String(r.id) === String(desiredId))) || (rows.length ? rows[0] : null);

      if (pick) loadFeaturedIntoForm(pick);
      else resetFeaturedForm();
    } finally {
      setFeaturedLoading(false);
    }
  }

  async function loadFeaturedOptions() {
    setFeaturedError("");
    try {
      const [restaurantsRes, menuItemsRes, groceryStoresRes, groceryItemsRes] = await Promise.all([
        supabase.from("restaurants").select("id,name").order("name", { ascending: true }).limit(2000),
        supabase.from("menu_items").select("id,name,restaurant_id,price,image_url,in_stock").order("name", { ascending: true }).limit(5000),
        supabase.from("grocery_stores").select("id,name").order("name", { ascending: true }).limit(2000),
        supabase.from("grocery_items").select("id,name,store_id,price,image_url,in_stock").order("name", { ascending: true }).limit(5000),
      ]);

      if (!restaurantsRes.error) setRestaurantRefs(Array.isArray(restaurantsRes.data) ? (restaurantsRes.data as any) : []);
      if (!menuItemsRes.error) setMenuItemRefs(Array.isArray(menuItemsRes.data) ? (menuItemsRes.data as any) : []);
      if (!groceryStoresRes.error) setGroceryStoreRefs(Array.isArray(groceryStoresRes.data) ? (groceryStoresRes.data as any) : []);
      if (!groceryItemsRes.error) setGroceryItemRefs(Array.isArray(groceryItemsRes.data) ? (groceryItemsRes.data as any) : []);
    } catch (e: any) {
      setFeaturedError(`Home featured options load failed: ${e?.message || String(e)}`);
    }
  }

  async function saveHomeFeaturedItem() {
    setFeaturedSaving(true);
    setFeaturedError("");
    try {
      const sortOrderNum = Number(featuredSortOrder || 0);
      const payload: any = {
        item_type: featuredItemType,
        menu_item_id: featuredItemType === "menu" ? selectedMenuItemId || null : null,
        grocery_item_id: featuredItemType === "grocery" ? selectedGroceryItemId || null : null,
        sort_order: Number.isFinite(sortOrderNum) ? sortOrderNum : 0,
        is_enabled: Boolean(featuredEnabled),
      };

      if (featuredItemType === "menu" && !payload.menu_item_id) {
        setFeaturedError("Please select a restaurant item first.");
        return;
      }

      if (featuredItemType === "grocery" && !payload.grocery_item_id) {
        setFeaturedError("Please select a grocery item first.");
        return;
      }

      if (featuredId) {
        const { error } = await supabase.from("home_featured_items").update(payload).eq("id", featuredId);
        if (error) {
          setFeaturedError(`Save failed: ${error.message}`);
          return;
        }
        await loadHomeFeaturedItems(featuredId);
      } else {
        const { data, error } = await supabase.from("home_featured_items").insert(payload).select("id").limit(1);
        if (error) {
          setFeaturedError(`Insert failed: ${error.message}`);
          return;
        }
        const newId = Array.isArray(data) && data[0]?.id ? String(data[0].id) : "";
        await loadHomeFeaturedItems(newId || undefined);
      }
    } finally {
      setFeaturedSaving(false);
    }
  }

  async function deleteHomeFeaturedItem(id: string) {
    if (!id) return;
    const ok = window.confirm("Delete this Home featured item? This cannot be undone.");
    if (!ok) return;

    setFeaturedSaving(true);
    setFeaturedError("");
    try {
      const { error } = await supabase.from("home_featured_items").delete().eq("id", id);
      if (error) {
        setFeaturedError(`Delete failed: ${error.message}`);
        return;
      }
      const nextId = featuredId === id ? undefined : featuredId;
      await loadHomeFeaturedItems(nextId);
    } finally {
      setFeaturedSaving(false);
    }
  }

  useEffect(() => {
    loadHomeFeaturedItems();
    loadFeaturedOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const card: React.CSSProperties = {
    padding: 16,
    borderRadius: 18,
    background: "#FFFFFF",
    border: "1px solid rgba(15, 23, 42, 0.10)",
    boxShadow: "0 14px 36px rgba(15, 23, 42, 0.08)",
  };

  const btnPrimary: React.CSSProperties = {
    padding: "10px 14px",
    borderRadius: 14,
    background: "linear-gradient(135deg, rgba(255,140,0,1), rgba(255,220,160,0.95))",
    border: "1px solid rgba(255,140,0,0.35)",
    color: "#0B1220",
    fontWeight: 950,
    cursor: "pointer",
    boxShadow: "0 14px 36px rgba(255,140,0,0.14)",
  };

  const btnGhost: React.CSSProperties = {
    padding: "10px 12px",
    borderRadius: 14,
    background: "rgba(255,255,255,0.85)",
    border: "1px solid rgba(15, 23, 42, 0.12)",
    color: "#0B1220",
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: "0 10px 26px rgba(15,23,42,0.06)",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  };

  const pill: React.CSSProperties = {
    padding: "10px 12px",
    borderRadius: 16,
    background: "rgba(255,255,255,0.88)",
    border: "1px solid rgba(15, 23, 42, 0.10)",
    fontSize: 12,
    fontWeight: 900,
    opacity: 0.9,
    height: "fit-content",
    boxShadow: "0 10px 26px rgba(15,23,42,0.06)",
  };

  const input: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid rgba(15,23,42,0.12)",
    outline: "none",
    background: "rgba(255,255,255,0.95)",
    fontWeight: 700,
  };

  const select: React.CSSProperties = {
    ...input,
    cursor: "pointer",
  };

  const smallLabel: React.CSSProperties = { fontSize: 12, fontWeight: 900, opacity: 0.75, marginBottom: 6 };
  const selectedFeaturedId = featuredId;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 950, letterSpacing: -0.3 }}>Home Featured</div>
          <div style={{ fontSize: 13, opacity: 0.75, marginTop: 4, lineHeight: 1.5 }}>
            Controls exactly which restaurant items and grocery items show on Home page.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <Link href="/admin" style={btnGhost}>
            ← Back to Dashboard
          </Link>

          <button onClick={() => loadHomeFeaturedItems()} style={btnGhost} disabled={featuredLoading || featuredSaving}>
            {featuredLoading ? "Loading..." : `Reload (${homeFeaturedRows.length})`}
          </button>

          <button
            onClick={() => resetFeaturedForm()}
            style={btnGhost}
            disabled={featuredLoading || featuredSaving}
            title="Create a new Home featured item"
          >
            ➕ Add New
          </button>

          <button onClick={saveHomeFeaturedItem} style={btnPrimary} disabled={featuredSaving || featuredLoading}>
            {featuredSaving ? "Saving..." : featuredId ? "Save Changes" : "Save New Item"}
          </button>

          <div
            style={{
              ...pill,
              background: featuredEnabled ? "rgba(34,197,94,0.10)" : "rgba(239,68,68,0.10)",
            }}
          >
            {featuredEnabled ? "Enabled ✅" : "Disabled ❌"}
          </div>

          {featuredId ? (
            <button
              onClick={() => deleteHomeFeaturedItem(featuredId)}
              style={{
                ...btnGhost,
                border: "1px solid rgba(239,68,68,0.22)",
                background: "rgba(239,68,68,0.08)",
              }}
              disabled={featuredSaving}
              title="Delete selected Home featured item"
            >
              🗑️ Delete
            </button>
          ) : null}
        </div>
      </div>

      <div style={{ ...card, display: "grid", gridTemplateColumns: "0.95fr 1.05fr", gap: 14 }}>
        <div
          style={{
            borderRadius: 18,
            border: "1px solid rgba(15,23,42,0.10)",
            background: "rgba(255,255,255,0.70)",
            boxShadow: "0 14px 36px rgba(15, 23, 42, 0.06)",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: 12, borderBottom: "1px solid rgba(15,23,42,0.08)" }}>
            <div style={{ fontSize: 12, fontWeight: 950, opacity: 0.9 }}>Featured Items List</div>
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4, lineHeight: 1.4 }}>
              Click an item to edit. Sort Order decides Home display order.
            </div>
          </div>

          <div style={{ maxHeight: 360, overflow: "auto" }}>
            {homeFeaturedRows.length === 0 ? (
              <div style={{ padding: 12, fontSize: 12, opacity: 0.75, fontWeight: 850 }}>No Home featured items yet.</div>
            ) : (
              homeFeaturedRows.map((row) => {
                const id = String(row.id || "");
                const type = String(row.item_type || "menu").toLowerCase() === "grocery" ? "grocery" : "menu";
                const menuRef = type === "menu" ? menuItemRefs.find((x) => String(x.id) === String(row.menu_item_id || "")) : null;
                const groceryRef = type === "grocery" ? groceryItemRefs.find((x) => String(x.id) === String(row.grocery_item_id || "")) : null;
                const titleText = type === "menu" ? String(menuRef?.name || "Menu item") : String(groceryRef?.name || "Grocery item");
                const subText =
                  type === "menu"
                    ? restaurantNameMap.get(String(menuRef?.restaurant_id || "")) || "Restaurant"
                    : groceryStoreNameMap.get(String(groceryRef?.store_id || "")) || "Grocery Store";
                const isSel = selectedFeaturedId && id === String(selectedFeaturedId);

                return (
                  <button
                    key={id}
                    onClick={() => loadFeaturedIntoForm(row)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: 12,
                      border: "none",
                      borderBottom: "1px solid rgba(15,23,42,0.06)",
                      background: isSel ? "rgba(255,140,0,0.10)" : "transparent",
                      cursor: "pointer",
                    }}
                    title={id}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                      <div style={{ fontSize: 12, fontWeight: 950, color: "#0F172A" }}>
                        {type === "menu" ? "🍽️ Restaurant Item" : "🛒 Grocery Item"}{" "}
                        <span style={{ opacity: 0.7, fontWeight: 900 }}>• {row.is_enabled !== false ? "Enabled" : "Disabled"}</span>
                      </div>
                      <div style={{ fontSize: 11, opacity: 0.7, fontWeight: 900 }}>Sort: {Number(row.sort_order ?? 0)}</div>
                    </div>

                    <div style={{ fontSize: 12, fontWeight: 900, marginTop: 6, color: "#0F172A" }}>{titleText}</div>
                    <div style={{ fontSize: 11, opacity: 0.72, marginTop: 4, fontWeight: 800 }}>{subText}</div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div style={{ display: "grid", gap: 14 }}>
          <div
            style={{
              borderRadius: 18,
              border: "1px solid rgba(15,23,42,0.10)",
              background: "rgba(255,255,255,0.70)",
              boxShadow: "0 14px 36px rgba(15, 23, 42, 0.06)",
              padding: 14,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ fontSize: 12, fontWeight: 950, opacity: 0.85 }}>
                Editing:{" "}
                <span style={{ opacity: 0.9 }}>
                  {featuredId ? `Existing featured item (${featuredId.slice(0, 8)}…)` : "New featured item (not saved yet)"}
                </span>
              </div>
              <button
                onClick={() => resetFeaturedForm()}
                style={{ ...btnGhost, padding: "8px 10px" }}
                disabled={featuredSaving}
                title="Clear the form to create a new Home featured item"
              >
                Clear Form
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
              <div>
                <div style={smallLabel}>Item Type</div>
                <select
                  value={featuredItemType}
                  onChange={(e) => setFeaturedItemType(String(e.target.value) === "grocery" ? "grocery" : "menu")}
                  style={select}
                  disabled={featuredSaving}
                >
                  <option value="menu">Restaurant / Menu Item</option>
                  <option value="grocery">Grocery Item</option>
                </select>
              </div>

              <div>
                <div style={smallLabel}>Sort Order</div>
                <input
                  value={featuredSortOrder}
                  onChange={(e) => setFeaturedSortOrder(e.target.value)}
                  placeholder="0"
                  style={input}
                  type="number"
                />
              </div>
            </div>

            {featuredItemType === "menu" ? (
              <div style={{ marginTop: 12 }}>
                <div style={smallLabel}>Select Restaurant Item</div>
                <select value={selectedMenuItemId} onChange={(e) => setSelectedMenuItemId(e.target.value)} style={select}>
                  <option value="">Select menu item...</option>
                  {menuItemOptions.map((item) => {
                    const restName = restaurantNameMap.get(String(item.restaurant_id || "")) || "Restaurant";
                    const priceText = item.price !== null && item.price !== undefined ? ` • ${money(item.price)}` : "";
                    return (
                      <option key={item.id} value={item.id}>
                        {String(item.name || "Item")} — {restName}
                        {priceText}
                      </option>
                    );
                  })}
                </select>
              </div>
            ) : (
              <div style={{ marginTop: 12 }}>
                <div style={smallLabel}>Select Grocery Item</div>
                <select value={selectedGroceryItemId} onChange={(e) => setSelectedGroceryItemId(e.target.value)} style={select}>
                  <option value="">Select grocery item...</option>
                  {groceryItemOptions.map((item) => {
                    const storeName = groceryStoreNameMap.get(String(item.store_id || "")) || "Grocery Store";
                    const priceText = item.price !== null && item.price !== undefined ? ` • ${money(item.price)}` : "";
                    return (
                      <option key={item.id} value={item.id}>
                        {String(item.name || "Item")} — {storeName}
                        {priceText}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}

            <div style={{ marginTop: 12 }}>
              <div style={smallLabel}>Enabled</div>
              <button
                onClick={() => setFeaturedEnabled((v) => !v)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 14,
                  border: "1px solid rgba(15,23,42,0.12)",
                  background: featuredEnabled ? "rgba(34,197,94,0.10)" : "rgba(239,68,68,0.10)",
                  fontWeight: 950,
                  cursor: "pointer",
                }}
              >
                {featuredEnabled ? "Enabled ✅" : "Disabled ❌"}
              </button>
            </div>

            {featuredError ? (
              <div
                style={{
                  marginTop: 12,
                  padding: 12,
                  borderRadius: 14,
                  background: "rgba(239,68,68,0.08)",
                  border: "1px solid rgba(239,68,68,0.20)",
                  color: "#7F1D1D",
                  fontSize: 12,
                  fontWeight: 850,
                  lineHeight: 1.5,
                }}
              >
                {featuredError}
                <div style={{ marginTop: 6, fontWeight: 750, opacity: 0.9 }}>
                  If this says table does not exist, next step is to run the SQL for <b>home_featured_items</b>.
                </div>
              </div>
            ) : null}
          </div>

          <div
            style={{
              borderRadius: 18,
              border: "1px solid rgba(15,23,42,0.10)",
              background: "rgba(255,255,255,0.70)",
              boxShadow: "0 14px 36px rgba(15, 23, 42, 0.06)",
              padding: 14,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 950, opacity: 0.9 }}>Preview</div>

            {featuredItemType === "menu" ? (
              (() => {
                const item = menuItemRefs.find((x) => String(x.id) === String(selectedMenuItemId || ""));
                const restName = restaurantNameMap.get(String(item?.restaurant_id || "")) || "Restaurant";
                return item ? (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 950, color: "#0F172A" }}>{String(item.name || "Item")}</div>
                    <div style={{ fontSize: 12, opacity: 0.74, marginTop: 4 }}>{restName}</div>
                    <div style={{ fontSize: 12, opacity: 0.74, marginTop: 6 }}>
                      Price: <b>{money(item.price)}</b> • {item.in_stock === false ? "Out of stock" : "In stock"}
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: 10, fontSize: 12, opacity: 0.72, fontWeight: 850 }}>Select a restaurant item to preview.</div>
                );
              })()
            ) : (
              (() => {
                const item = groceryItemRefs.find((x) => String(x.id) === String(selectedGroceryItemId || ""));
                const storeName = groceryStoreNameMap.get(String(item?.store_id || "")) || "Grocery Store";
                return item ? (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 950, color: "#0F172A" }}>{String(item.name || "Item")}</div>
                    <div style={{ fontSize: 12, opacity: 0.74, marginTop: 4 }}>{storeName}</div>
                    <div style={{ fontSize: 12, opacity: 0.74, marginTop: 6 }}>
                      Price: <b>{money(item.price)}</b> • {item.in_stock === false ? "Out of stock" : "In stock"}
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: 10, fontSize: 12, opacity: 0.72, fontWeight: 850 }}>Select a grocery item to preview.</div>
                );
              })()
            )}

            <div style={{ marginTop: 12, fontSize: 12, opacity: 0.72, lineHeight: 1.5 }}>
              Home page will show these admin-selected items first, based on <b>Sort Order</b>.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
