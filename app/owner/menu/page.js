"use client";

import { useEffect, useMemo, useState } from "react";
import supabase from "@/lib/supabase";

function money(v) {
  const n = Number(v || 0);
  return `₹${n.toFixed(0)}`;
}

function extFromName(name) {
  const p = String(name || "").split(".");
  if (p.length < 2) return "";
  return p[p.length - 1].toLowerCase();
}

function safeCuisine(v) {
  return String(v || "").trim().toLowerCase();
}

function clean(v) {
  return String(v || "").trim();
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

export default function OwnerManageMenuPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const [userEmail, setUserEmail] = useState("");

  const [restaurant, setRestaurant] = useState(null);
  const [items, setItems] = useState([]);
  const [combos, setCombos] = useState([]);
  const [comboBusy, setComboBusy] = useState(false);
  const [comboTitle, setComboTitle] = useState("");
  const [comboOriginalPrice, setComboOriginalPrice] = useState("");
  const [comboDiscountPrice, setComboDiscountPrice] = useState("");
  const [comboSelectedIds, setComboSelectedIds] = useState([]);
  const [comboSearch, setComboSearch] = useState("");

  // Add form
  const [name, setName] = useState("");
  const [price, setPrice] = useState(0);
  const [cuisine, setCuisine] = useState("recommended");
  const [vegChoice, setVegChoice] = useState("unknown"); // unknown | veg | non_veg
  const [bestSeller, setBestSeller] = useState(false);
  const [inStock, setInStock] = useState(true);
  const [newFile, setNewFile] = useState(null);

  function flashOk(msg) {
    setOk(msg);
    window.setTimeout(() => setOk(""), 1500);
  }

  async function load() {
    setLoading(true);
    setErr("");

    try {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user?.id) throw new Error("Not logged in.");
      setUserEmail(user.email || "");

      // Owner restaurant (single)
      const { data: r, error: rErr } = await supabase
        .from("restaurants")
        .select("id, name, owner_user_id")
        .eq("owner_user_id", user.id)
        .maybeSingle();

      if (rErr) throw rErr;
      if (!r?.id) throw new Error("No restaurant found for this owner. Create restaurant first.");
      setRestaurant(r);

      const { data: list, error: mErr } = await supabase
        .from("menu_items")
        .select("id, restaurant_id, name, price, cuisine, image_url, is_veg, is_best_seller, in_stock")
        .eq("restaurant_id", r.id)
        .order("id", { ascending: false });

      if (mErr) throw mErr;
      setItems(list || []);
      const comboList = await fetchOwnerComboDeals("restaurant", r.id).catch(() => []);
      setCombos(comboList);
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function uploadImage(restaurantId, file) {
    // IMPORTANT: path must start with restaurantId to match your RLS policy
    const ext = extFromName(file?.name || "");
    const fileName = `${crypto.randomUUID()}${ext ? "." + ext : ""}`;
    const path = `${restaurantId}/${fileName}`;

    const { error: upErr } = await supabase.storage.from("menu-images").upload(path, file, {
      cacheControl: "3600",
      upsert: true,
    });
    if (upErr) throw upErr;

    const { data } = supabase.storage.from("menu-images").getPublicUrl(path);
    return data.publicUrl;
  }

  async function addItem() {
    setErr("");
    setOk("");

    try {
      if (!restaurant?.id) throw new Error("Restaurant missing.");
      if (!String(name || "").trim()) throw new Error("Item name required.");
      if (!price || Number(price) <= 0) throw new Error("Price must be > 0.");

      const is_veg =
        vegChoice === "unknown" ? null : vegChoice === "veg" ? true : false;

      // 1) Insert item first
      const { data: inserted, error: insErr } = await supabase
        .from("menu_items")
        .insert({
          restaurant_id: restaurant.id,
          name: String(name).trim(),
          price: Number(price),
          cuisine: safeCuisine(cuisine),
          is_veg,
          is_best_seller: !!bestSeller,
          in_stock: !!inStock,
        })
        .select("id, restaurant_id, name, price, cuisine, image_url, is_veg, is_best_seller, in_stock")
        .single();

      if (insErr) throw insErr;

      // 2) Optional image upload
      let finalRow = inserted;

      if (newFile) {
        const url = await uploadImage(restaurant.id, newFile);
        const { data: upd, error: uErr } = await supabase
          .from("menu_items")
          .update({ image_url: url })
          .eq("id", finalRow.id)
          .select("id, restaurant_id, name, price, cuisine, image_url, is_veg, is_best_seller, in_stock")
          .single();

        if (uErr) throw uErr;
        finalRow = upd;
      }

      setItems((prev) => [finalRow, ...prev]);

      // Reset form
      setName("");
      setPrice(0);
      setCuisine("recommended");
      setVegChoice("unknown");
      setBestSeller(false);
      setInStock(true);
      setNewFile(null);

      flashOk("✅ Item added");
    } catch (e) {
      setErr(e?.message || String(e));
    }
  }

  async function updateItem(id, patch) {
    setErr("");
    setOk("");

    try {
      const { data: upd, error } = await supabase
        .from("menu_items")
        .update(patch)
        .eq("id", id)
        .select("id, restaurant_id, name, price, cuisine, image_url, is_veg, is_best_seller, in_stock")
        .single();

      if (error) throw error;

      setItems((prev) => prev.map((x) => (x.id === id ? upd : x)));
      flashOk("✅ Saved");
    } catch (e) {
      setErr(e?.message || String(e));
    }
  }

  async function updateItemImage(item, file) {
    setErr("");
    setOk("");

    try {
      if (!restaurant?.id) throw new Error("Restaurant missing.");
      const url = await uploadImage(restaurant.id, file);
      await updateItem(item.id, { image_url: url });
    } catch (e) {
      setErr(e?.message || String(e));
    }
  }

  async function deleteItem(id) {
    setErr("");
    setOk("");

    try {
      const ok = confirm("Delete this item?");
      if (!ok) return;

      const { error } = await supabase.from("menu_items").delete().eq("id", id);
      if (error) throw error;

      setItems((prev) => prev.filter((x) => x.id !== id));
      flashOk("✅ Deleted");
    } catch (e) {
      setErr(e?.message || String(e));
    }
  }

  function toggleComboItem(itemId) {
    setComboSelectedIds((prev) => {
      const id = clean(itemId);
      if (!id) return prev;
      return prev.includes(id) ? prev.filter((row) => row !== id) : [...prev, id];
    });
  }

  async function addComboDeal() {
    setErr("");
    setOk("");

    try {
      if (!restaurant?.id) throw new Error("Restaurant missing.");
      const title = clean(comboTitle);
      if (!title) throw new Error("Combo title required.");
      if ((comboSelectedIds || []).length < 2) throw new Error("Select at least 2 menu items for the combo.");

      const original = Number(comboOriginalPrice || 0);
      const discount = Number(comboDiscountPrice || 0);
      if (!Number.isFinite(original) || original <= 0) throw new Error("Original combo price must be greater than 0.");
      if (!Number.isFinite(discount) || discount <= 0) throw new Error("Discount combo price must be greater than 0.");
      if (discount >= original) throw new Error("Discount combo price must be smaller than original price.");

      const selectedItems = (items || []).filter((item) => comboSelectedIds.includes(item.id));
      if (selectedItems.length < 2) throw new Error("Selected items could not be found. Refresh and try again.");

      setComboBusy(true);
      const nextCombos = await saveOwnerComboDeals("restaurant", restaurant.id, [
        ...combos,
        {
          title,
          original_price: original,
          discount_price: discount,
          image_url: clean(selectedItems[0]?.image_url) || null,
          items: selectedItems.map((item) => ({ item_id: item.id })),
        },
      ]);

      setCombos(nextCombos);
      setComboTitle("");
      setComboOriginalPrice("");
      setComboDiscountPrice("");
      setComboSelectedIds([]);
      flashOk("Combo deal saved");
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setComboBusy(false);
    }
  }

  async function deleteComboDeal(comboId) {
    setErr("");
    setOk("");

    try {
      if (!restaurant?.id) throw new Error("Restaurant missing.");
      setComboBusy(true);
      const nextCombos = await saveOwnerComboDeals(
        "restaurant",
        restaurant.id,
        (combos || []).filter((combo) => clean(combo?.id) !== clean(comboId))
      );
      setCombos(nextCombos);
      flashOk("Combo deal removed");
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setComboBusy(false);
    }
  }

  const title = useMemo(() => restaurant?.name || "Owner", [restaurant]);
  const comboPickerItems = useMemo(() => {
    const q = clean(comboSearch).toLowerCase();
    const list = Array.isArray(items) ? items : [];
    if (!q) return list.slice(0, 30);
    return list
      .filter((item) => `${item?.name || ""} ${item?.cuisine || ""}`.toLowerCase().includes(q))
      .slice(0, 30);
  }, [comboSearch, items]);

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
      <h1 style={{ margin: 0 }}>Owner: Manage Menu</h1>
      <div style={{ color: "#6b7280", marginTop: 6 }}>
        Restaurant: <b>{title}</b>
        {userEmail ? <span> • {userEmail}</span> : null}
      </div>

      {err ? <div style={alertErr}>{err}</div> : null}
      {ok ? <div style={alertOk}>{ok}</div> : null}
      {loading ? <div style={{ marginTop: 12, color: "#6b7280" }}>Loading…</div> : null}

      {!loading && restaurant ? (
        <>
          <div style={box}>
            <h2 style={{ marginTop: 0 }}>Add new item</h2>

            <div style={row}>
              <div style={col}>
                <label style={label}>Item name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} style={input} />
              </div>

              <div style={col}>
                <label style={label}>Price</label>
                <input
                  value={price || ""}
                  onChange={(e) => setPrice(Number(e.target.value || 0))}
                  type="number"
                  style={input}
                />
              </div>

              <div style={col}>
                <label style={label}>Cuisine</label>
                <select value={cuisine} onChange={(e) => setCuisine(e.target.value)} style={input}>
                  <option value="recommended">recommended</option>
                  <option value="punjabi">punjabi</option>
                  <option value="indian">indian</option>
                  <option value="pizza">pizza</option>
                </select>
                <div style={{ color: "#6b7280", fontSize: 12, marginTop: 6 }}>
                  Tip: cuisine helps customer filters.
                </div>
              </div>
            </div>

            <div style={row}>
              <div style={col}>
                <label style={label}>Veg / Non-Veg</label>
                <select value={vegChoice} onChange={(e) => setVegChoice(e.target.value)} style={input}>
                  <option value="unknown">not set</option>
                  <option value="veg">veg</option>
                  <option value="non_veg">non-veg</option>
                </select>
              </div>

              <div style={col}>
                <label style={label}>Best Seller</label>
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8 }}>
                  <input type="checkbox" checked={bestSeller} onChange={(e) => setBestSeller(e.target.checked)} />
                  <span style={{ fontWeight: 800 }}>Show in Best Sellers</span>
                </div>
              </div>

              <div style={col}>
                <label style={label}>In Stock</label>
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8 }}>
                  <input type="checkbox" checked={inStock} onChange={(e) => setInStock(e.target.checked)} />
                  <span style={{ fontWeight: 800 }}>{inStock ? "Available" : "Out of stock"}</span>
                </div>
              </div>
            </div>

            <div style={row}>
              <div style={{ flex: 1 }}>
                <label style={label}>Image (optional)</label>
                <input type="file" accept="image/*" onChange={(e) => setNewFile(e.target.files?.[0] || null)} />
              </div>

              <div style={{ display: "flex", alignItems: "flex-end" }}>
                <button onClick={addItem} style={btnPrimary}>
                  Add Item
                </button>
              </div>
            </div>
          </div>

          <h2 style={{ marginTop: 20 }}>Menu items</h2>

          <div style={box}>
            <h2 style={{ marginTop: 0 }}>Restaurant combo deals</h2>
            <div style={{ color: "#6b7280", fontWeight: 700 }}>
              Select items from your menu, set the original price and the offer price, and this combo will show on the customer home page.
            </div>

            <div style={row}>
              <div style={col}>
                <label style={label}>Combo title</label>
                <input value={comboTitle} onChange={(e) => setComboTitle(e.target.value)} style={input} placeholder="Family Combo" />
              </div>

              <div style={col}>
                <label style={label}>Original price</label>
                <input
                  value={comboOriginalPrice}
                  onChange={(e) => setComboOriginalPrice(e.target.value)}
                  type="number"
                  style={input}
                  placeholder="29.99"
                />
              </div>

              <div style={col}>
                <label style={label}>Discount price</label>
                <input
                  value={comboDiscountPrice}
                  onChange={(e) => setComboDiscountPrice(e.target.value)}
                  type="number"
                  style={input}
                  placeholder="21.99"
                />
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <div style={{ marginBottom: 10, display: "grid", gridTemplateColumns: "1.3fr 0.7fr 0.7fr", gap: 10 }}>
                <input
                  value={comboSearch}
                  onChange={(e) => setComboSearch(e.target.value)}
                  style={input}
                  placeholder="Search menu items for combo..."
                />
                <div style={comboInfoPill}>Showing {comboPickerItems.length}</div>
                <div style={comboInfoPill}>Selected {comboSelectedIds.length}</div>
              </div>
              <div style={label}>Select menu items</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {comboPickerItems.map((item) => {
                  const active = comboSelectedIds.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => toggleComboItem(item.id)}
                      style={active ? comboChipActive : comboChip}
                    >
                      {item.name}
                    </button>
                  );
                })}
              </div>
              {comboPickerItems.length === 0 ? <div style={{ marginTop: 10, color: "#6b7280", fontWeight: 700 }}>No items match this search.</div> : null}
            </div>

            <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ color: "#6b7280", fontWeight: 800 }}>Selected: {comboSelectedIds.length} items</div>
              <button onClick={addComboDeal} style={btnPrimary} disabled={comboBusy}>
                {comboBusy ? "Saving..." : "Create Combo Deal"}
              </button>
            </div>

            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              {(combos || []).length === 0 ? (
                <div style={emptyBox}>No combo deals yet.</div>
              ) : (
                (combos || []).map((combo) => (
                  <div key={combo.id} style={itemCard}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontWeight: 900, fontSize: 18 }}>{combo.title}</div>
                        <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                          <span style={{ color: "#9ca3af", textDecoration: "line-through", fontWeight: 800 }}>
                            {money(combo.original_price)}
                          </span>
                          <span style={{ fontWeight: 900 }}>{money(combo.discount_price || combo.price)}</span>
                        </div>
                        <div style={{ marginTop: 8, color: "#6b7280", fontWeight: 700 }}>
                          {Array.isArray(combo.items) ? combo.items.map((item) => item.name || "Item").join(" • ") : ""}
                        </div>
                      </div>

                      <button onClick={() => deleteComboDeal(combo.id)} style={btnDanger} disabled={comboBusy}>
                        Delete Combo
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {items.length === 0 ? (
            <div style={emptyBox}>No items yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {items.map((it) => (
                <div key={it.id} style={itemCard}>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ width: 140 }}>
                      <div style={{ fontWeight: 900, marginBottom: 8 }}>Photo</div>
                      <div style={photoBox}>
                        {it.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={it.image_url}
                            alt={it.name || "item"}
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        ) : (
                          <div style={{ color: "#9ca3af", fontWeight: 800, fontSize: 12 }}>No image</div>
                        )}
                      </div>

                      <div style={{ marginTop: 8 }}>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) updateItemImage(it, f);
                          }}
                        />
                      </div>
                    </div>

                    <div style={{ flex: 1, minWidth: 260 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                        <div style={{ fontWeight: 900, fontSize: 18 }}>{it.name}</div>
                        <div style={{ fontWeight: 900 }}>{money(it.price)}</div>
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                          gap: 10,
                          marginTop: 12,
                        }}
                      >
                        <div>
                          <label style={label}>Name</label>
                          <input
                            value={it.name || ""}
                            onChange={(e) => updateItem(it.id, { name: e.target.value })}
                            style={input}
                          />
                        </div>

                        <div>
                          <label style={label}>Price</label>
                          <input
                            type="number"
                            value={Number(it.price || 0)}
                            onChange={(e) => updateItem(it.id, { price: Number(e.target.value || 0) })}
                            style={input}
                          />
                        </div>

                        <div>
                          <label style={label}>Cuisine</label>
                          <select
                            value={it.cuisine || "recommended"}
                            onChange={(e) => updateItem(it.id, { cuisine: e.target.value })}
                            style={input}
                          >
                            <option value="recommended">recommended</option>
                            <option value="punjabi">punjabi</option>
                            <option value="indian">indian</option>
                            <option value="pizza">pizza</option>
                          </select>
                        </div>

                        <div>
                          <label style={label}>Veg / Non-Veg</label>
                          <select
                            value={it.is_veg === null ? "unknown" : it.is_veg ? "veg" : "non_veg"}
                            onChange={(e) => {
                              const v = e.target.value;
                              updateItem(it.id, { is_veg: v === "unknown" ? null : v === "veg" });
                            }}
                            style={input}
                          >
                            <option value="unknown">not set</option>
                            <option value="veg">veg</option>
                            <option value="non_veg">non-veg</option>
                          </select>
                        </div>

                        <div>
                          <label style={label}>Best Seller</label>
                          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8 }}>
                            <input
                              type="checkbox"
                              checked={!!it.is_best_seller}
                              onChange={(e) => updateItem(it.id, { is_best_seller: e.target.checked })}
                            />
                            <span style={{ fontWeight: 800 }}>Show in Best Sellers</span>
                          </div>
                        </div>

                        <div>
                          <label style={label}>In Stock</label>
                          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8 }}>
                            <input
                              type="checkbox"
                              checked={!!it.in_stock}
                              onChange={(e) => updateItem(it.id, { in_stock: e.target.checked })}
                            />
                            <span style={{ fontWeight: 800 }}>{it.in_stock ? "Available" : "Out of stock"}</span>
                          </div>
                        </div>
                      </div>

                      <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
                        <button onClick={() => deleteItem(it.id)} style={btnDanger}>
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: 8, color: "#6b7280", fontSize: 12 }}>Item ID: {it.id}</div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : null}
    </main>
  );
}

/* styles */
const box = {
  marginTop: 14,
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 16,
};

const row = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
  marginTop: 10,
};

const col = {
  flex: 1,
  minWidth: 220,
};

const label = {
  display: "block",
  fontWeight: 900,
  fontSize: 12,
  color: "#374151",
  marginBottom: 6,
};

const input = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #e5e7eb",
  background: "#fff",
  outline: "none",
  fontWeight: 700,
};

const btnPrimary = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid #111827",
  background: "#111827",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

const btnDanger = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid #ef4444",
  background: "#fff",
  color: "#ef4444",
  fontWeight: 900,
  cursor: "pointer",
};

const alertErr = {
  marginTop: 12,
  padding: 12,
  border: "1px solid #fecaca",
  background: "#fef2f2",
  borderRadius: 12,
  color: "#7f1d1d",
  fontWeight: 800,
};

const alertOk = {
  marginTop: 12,
  padding: 12,
  border: "1px solid #86efac",
  background: "#f0fdf4",
  borderRadius: 12,
  color: "#065f46",
  fontWeight: 900,
};

const emptyBox = {
  marginTop: 8,
  padding: 14,
  borderRadius: 14,
  border: "1px solid #eee",
  background: "#fff",
  color: "#6b7280",
  fontWeight: 800,
};

const itemCard = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  padding: 14,
};

const photoBox = {
  width: 140,
  height: 110,
  borderRadius: 12,
  border: "1px solid #e5e7eb",
  overflow: "hidden",
  background: "#fafafa",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const comboChip = {
  padding: "9px 12px",
  borderRadius: 999,
  border: "1px solid #e5e7eb",
  background: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const comboChipActive = {
  ...comboChip,
  border: "1px solid #111827",
  background: "#111827",
  color: "#fff",
};

const comboInfoPill = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #e5e7eb",
  background: "#f8fafc",
  color: "#475569",
  fontWeight: 800,
};
