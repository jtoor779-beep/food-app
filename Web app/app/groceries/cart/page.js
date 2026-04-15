"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import supabase from "@/lib/supabase";

/* =========================
   Grocery Cart (separate cart)
   - Primary keys:
     1) grocery_cart_items
     2) foodapp_grocery_cart
   - Legacy fallback read:
     3) cart_items
   ========================= */

function safeJsonParse(v, fallback) {
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}

function primaryKey() {
  return "grocery_cart_items";
}

function secondaryKey() {
  return "foodapp_grocery_cart";
}

function fallbackKey() {
  return "cart_items"; // legacy restaurant cart key (read only as last fallback)
}

function readKey(k) {
  if (typeof window === "undefined") return [];
  return safeJsonParse(localStorage.getItem(k) || "[]", []);
}

function writeKey(k, items) {
  if (typeof window === "undefined") return;
  localStorage.setItem(k, JSON.stringify(items || []));
}

function removeKey(k) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(k);
}

function moneyINR(v) {
  const n = Number(v || 0);
  return `₹${n.toFixed(0)}`;
}

function clean(v) {
  return String(v || "").trim();
}

function clampText(s, max = 44) {
  const str = String(s ?? "");
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + "…";
}

/* =========================
   ✅ PRICE HELPERS (SAFE)
   - Prefer unit_price (variant-selected price)
   - Fallback to price (old behavior)
   ========================= */
function getUnitPrice(it) {
  const up = Number(it?.unit_price);
  if (Number.isFinite(up) && up > 0) return up;
  const p = Number(it?.price);
  if (Number.isFinite(p) && p >= 0) return p;
  return 0;
}

function calcSubtotal(items) {
  return (items || []).reduce((sum, it) => {
    const price = getUnitPrice(it);
    const qty = Number(it?.qty || 1);
    return sum + price * qty;
  }, 0);
}

/* =========================
   ✅ Tax helpers (SAFE)
   - If item.is_taxable missing => default true (backward compatible)
   ========================= */
function normalizeIsTaxable(it) {
  if (typeof it?.is_taxable === "boolean") return it.is_taxable;
  const s = String(it?.is_taxable ?? it?.taxable ?? "").toLowerCase();
  if (s === "false" || s === "0" || s === "no") return false;
  return true; // default true
}

function calcTaxableSubtotal(items) {
  return (items || []).reduce((sum, it) => {
    if (!normalizeIsTaxable(it)) return sum;
    const price = getUnitPrice(it);
    const qty = Number(it?.qty || 1);
    return sum + price * qty;
  }, 0);
}

/* =========================
   ✅ Platform fee helpers (SAFE)
   - Default 0 (so no breaking)
   - Configurable via localStorage:
     - grocery_platform_fee_mode: "percent" | "flat"
     - grocery_platform_fee_value: number (e.g. 2 for 2% OR 10 for ₹10)
     - grocery_platform_fee_cap: optional max cap
   ========================= */
function getPlatformFeeConfig() {
  if (typeof window === "undefined") {
    return { mode: "percent", value: 0, cap: null };
  }

  const modeRaw = String(localStorage.getItem("grocery_platform_fee_mode") || "percent")
    .trim()
    .toLowerCase();

  const mode = modeRaw === "flat" ? "flat" : "percent";

  const valueNum = Number(localStorage.getItem("grocery_platform_fee_value") || 0);
  const value = Number.isFinite(valueNum) ? valueNum : 0;

  const capNum = Number(localStorage.getItem("grocery_platform_fee_cap") || "");
  const cap = Number.isFinite(capNum) && capNum > 0 ? capNum : null;

  return { mode, value, cap };
}

function calcPlatformFee(subtotal) {
  const s = Number(subtotal || 0);
  if (!Number.isFinite(s) || s <= 0) return 0;

  const cfg = getPlatformFeeConfig();
  let fee = 0;

  if (cfg.mode === "flat") {
    fee = Number(cfg.value || 0);
  } else {
    const pct = Number(cfg.value || 0);
    fee = (s * pct) / 100;
  }

  if (!Number.isFinite(fee) || fee < 0) fee = 0;

  fee = Math.round(fee);

  if (cfg.cap != null) {
    fee = Math.min(fee, cfg.cap);
  }

  return fee;
}

/* =========================
   ✅ Cart identity helper (SAFE)
   - prefer cart_key (supports variants)
   - fallback to id
   ========================= */
function getCartKey(it) {
  return String(it?.cart_key || it?.key || it?.id || it?.item_id || "");
}

export default function GroceryCartPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(true);

  const [items, setItems] = useState([]);
  const [errMsg, setErrMsg] = useState("");
  const [infoMsg, setInfoMsg] = useState("");

  // store context (optional)
  const [storeId, setStoreId] = useState("");
  const [storeName, setStoreName] = useState("");
  const [storeCity, setStoreCity] = useState("");

  // coupon + tip (demo)
  const [coupon, setCoupon] = useState("");
  const [couponApplied, setCouponApplied] = useState(false);

  const [tip, setTip] = useState(0);
  const tipOptions = [0, 10, 20, 30, 50];

  // delivery form (saved on device)
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [addr1, setAddr1] = useState("");
  const [addr2, setAddr2] = useState("");
  const [landmark, setLandmark] = useState("");
  const [instructions, setInstructions] = useState("");

  const [paymentMethod, setPaymentMethod] = useState("cod");
  const [saveAddress, setSaveAddress] = useState(true);

  const subtotal = useMemo(() => calcSubtotal(items), [items]);

  const taxableSubtotal = useMemo(() => calcTaxableSubtotal(items), [items]);

  const deliveryFee = useMemo(() => {
    if (items.length === 0) return 0;
    return 25;
  }, [items.length]);

  const platformFee = useMemo(() => {
    if (items.length === 0) return 0;
    return calcPlatformFee(subtotal);
  }, [items.length, subtotal]);

  const tax = useMemo(() => {
    const rate = 0.05;
    return Math.round(taxableSubtotal * rate);
  }, [taxableSubtotal]);

  const couponDiscount = useMemo(() => {
    if (!couponApplied) return 0;
    const c = clean(coupon).toUpperCase();
    if (c === "OFF10") return 10;
    if (c === "OFF20") return 20;
    return 0;
  }, [coupon, couponApplied]);

  const totalPayable = useMemo(() => {
    const t = subtotal + deliveryFee + platformFee + tax + tip - couponDiscount;
    return Math.max(0, Math.round(t));
  }, [subtotal, deliveryFee, platformFee, tax, tip, couponDiscount]);

  const totalItems = useMemo(() => {
    return (items || []).reduce((sum, it) => sum + Number(it?.qty || 1), 0);
  }, [items]);

  const canCheckout = useMemo(() => {
    if (items.length === 0) return false;
    if (!clean(customerName)) return false;
    if (!clean(phone)) return false;
    if (!clean(addr1)) return false;
    return true;
  }, [items.length, customerName, phone, addr1]);

  function persistAddressIfNeeded() {
    if (typeof window === "undefined") return;

    const groceryPayload = { customerName, phone, addr1, addr2, landmark, instructions };

    const successPayload = {
      customer_name: customerName,
      phone: phone,
      address_line1: addr1,
      address_line2: addr2,
      landmark: landmark,
      instructions: instructions,
    };

    if (!saveAddress) return;

    try {
      localStorage.setItem("grocery_delivery_details", JSON.stringify(groceryPayload));
    } catch {}

    try {
      localStorage.setItem("foodapp_saved_address", JSON.stringify(successPayload));
    } catch {}
  }

  function loadSavedAddress() {
    const saved = safeJsonParse(localStorage.getItem("grocery_delivery_details") || "null", null);
    if (saved) {
      setCustomerName(saved.customerName || "");
      setPhone(saved.phone || "");
      setAddr1(saved.addr1 || "");
      setAddr2(saved.addr2 || "");
      setLandmark(saved.landmark || "");
      setInstructions(saved.instructions || "");
      return;
    }

    const saved2 = safeJsonParse(localStorage.getItem("foodapp_saved_address") || "null", null);
    if (saved2) {
      setCustomerName(saved2.customer_name || "");
      setPhone(saved2.phone || "");
      setAddr1(saved2.address_line1 || "");
      setAddr2(saved2.address_line2 || "");
      setLandmark(saved2.landmark || "");
      setInstructions(saved2.instructions || "");
    }
  }

  function persistFeeBreakdownForSuccess() {
    if (typeof window === "undefined") return;

    const payload = {
      totals: {
        subtotal,
        delivery_fee: deliveryFee,
        platform_fee: platformFee,
        tax,
        tip,
        discount: couponDiscount,
        payable: totalPayable,
      },
      meta: {
        order_type: "grocery",
        store_id: storeId || "",
        store_name: storeName || "",
      },
      ts: Date.now(),
    };

    try {
      localStorage.setItem("grocery_cart_totals", JSON.stringify(payload));
    } catch {}

    try {
      localStorage.setItem("foodapp_cart_breakdown", JSON.stringify(payload));
    } catch {}
  }

  function sync(nextItems) {
    setItems(nextItems);

    // ✅ write to BOTH grocery cart keys so all pages stay in sync
    writeKey(primaryKey(), nextItems);
    writeKey(secondaryKey(), nextItems);

    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("storage"));
    }
  }

  function normalizeCartItem(it) {
    const qty = Math.max(1, Number(it?.qty || it?.quantity || 1));
    const is_taxable = normalizeIsTaxable(it);
    const unit_price = getUnitPrice(it);
    const variant_label = clean(it?.variant_label || it?.variant || it?.weight_label || "");
    const cart_key = clean(it?.cart_key || it?.key || "") || "";

    return {
      ...it,
      qty,
      price: Number(it?.price || 0),
      unit_price,
      name: it?.name || it?.item_name || "Item",
      image_url: it?.image_url || it?.image || it?.photo_url || "",
      category: it?.category || it?.type || "",
      id: it?.id || it?.item_id || it?.menu_item_id || cryptoRandomId(),
      cart_key,
      is_taxable,
      variant_label,
    };
  }

  function cryptoRandomId() {
    try {
      return "tmp_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
    } catch {
      return "tmp_" + Date.now();
    }
  }

  function loadCartWithFallbackAndMigrate() {
    // 1) primary grocery key
    const primary = readKey(primaryKey());
    if (Array.isArray(primary) && primary.length > 0) {
      const normalized = primary.map(normalizeCartItem);
      writeKey(secondaryKey(), normalized);
      return normalized;
    }

    // 2) second grocery key used by home page
    const secondary = readKey(secondaryKey());
    if (Array.isArray(secondary) && secondary.length > 0) {
      const normalized = secondary.map(normalizeCartItem);
      writeKey(primaryKey(), normalized);
      setInfoMsg("✅ Synced grocery cart items.");
      return normalized;
    }

    // 3) last fallback: legacy cart_items
    const fallback = readKey(fallbackKey());
    if (Array.isArray(fallback) && fallback.length > 0) {
      const normalized = fallback.map(normalizeCartItem);
      writeKey(primaryKey(), normalized);
      writeKey(secondaryKey(), normalized);
      setInfoMsg("✅ Imported items into Grocery Cart.");
      return normalized;
    }

    return [];
  }

  async function init() {
    setLoading(true);
    setErrMsg("");
    setInfoMsg("");

    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      setIsGuest(!user);

      const sid = localStorage.getItem("grocery_active_store_id") || "";
      const sname = localStorage.getItem("grocery_active_store_name") || "";
      const scity = localStorage.getItem("grocery_active_store_city") || "";
      setStoreId(sid);
      setStoreName(sname);
      setStoreCity(scity);

      const cart = loadCartWithFallbackAndMigrate();
      setItems(cart);

      loadSavedAddress();
    } catch (e) {
      setErrMsg(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    init();

    // ✅ keep page live-updated when cart changes elsewhere
    const onStorage = () => {
      const cart = loadCartWithFallbackAndMigrate();
      setItems(cart);
    };

    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener("storage", onStorage);
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clearCart() {
    const ok = confirm("Clear grocery cart?");
    if (!ok) return;

    setItems([]);
    removeKey(primaryKey());
    removeKey(secondaryKey());

    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("storage"));
    }

    setCoupon("");
    setCouponApplied(false);
    setTip(0);
  }

  function removeItem(keyOrId) {
    const target = String(keyOrId || "");
    const next = items.filter((x) => getCartKey(x) !== target);
    sync(next);
  }

  function changeQty(keyOrId, delta) {
    const target = String(keyOrId || "");
    const next = items.map((x) => {
      if (getCartKey(x) !== target) return x;
      const q = Number(x?.qty || 1) + delta;
      return { ...x, qty: Math.max(1, q) };
    });
    sync(next);
  }

  function applyCoupon() {
    setErrMsg("");
    setInfoMsg("");
    const c = clean(coupon).toUpperCase();
    if (!c) {
      setCouponApplied(false);
      return;
    }
    if (c === "OFF10" || c === "OFF20") {
      setCouponApplied(true);
      setInfoMsg(`✅ Coupon applied: ${c}`);
    } else {
      setCouponApplied(false);
      setErrMsg("Invalid coupon (demo: try OFF10 or OFF20).");
    }
  }

  async function handleCheckout() {
    setErrMsg("");
    setInfoMsg("");

    if (isGuest) {
      router.push("/login");
      return;
    }

    if (!canCheckout) {
      setErrMsg("Please fill Name, Phone, and Address Line 1.");
      return;
    }

    persistAddressIfNeeded();
    persistFeeBreakdownForSuccess();

    setInfoMsg("✅ Details saved. Continue to payment…");

    try {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {}
  }

  return (
    <main style={pageBg}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={heroGlass}>
          <div>
            <div style={pill}>Groceries</div>
            <h1 style={heroTitle}>Cart</h1>
            <div style={subText}>Review items • Delivery details • Checkout</div>

            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link href="/groceries" style={btnPillLight}>
                ← Back to Stores
              </Link>
              {storeId ? (
                <Link href={`/groceries/menu?store_id=${storeId}`} style={btnPillLight}>
                  ← Back to Store
                </Link>
              ) : null}
              <button onClick={clearCart} style={btnPillDark} disabled={items.length === 0}>
                Clear Cart
              </button>
            </div>
          </div>

          <div style={controlsGlass}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span style={tag}>Total items: {totalItems}</span>
              {storeName ? <span style={tag}>Store: {storeName}</span> : null}
              {storeCity ? <span style={tag}>City: {storeCity}</span> : null}
              {isGuest ? <span style={tagStrong}>Guest</span> : <span style={tagStrong}>Logged in</span>}
            </div>

            <div style={{ marginTop: 10, fontSize: 12, fontWeight: 850, color: "rgba(17,24,39,0.65)" }}>
              Reads both grocery cart keys and auto-syncs them.
            </div>
          </div>
        </div>

        {errMsg ? <div style={alertErr}>{errMsg}</div> : null}
        {infoMsg ? <div style={alertOk}>{infoMsg}</div> : null}

        {loading ? <div style={{ marginTop: 14, fontWeight: 900, color: "rgba(17,24,39,0.7)" }}>Loading…</div> : null}

        <div style={mainGrid}>
          <div style={panelGlass}>
            <div style={panelTitleRow}>
              <div>
                <div style={panelTitle}>Items</div>
                <div style={panelSub}>Adjust quantities or remove items.</div>
              </div>

              <button onClick={clearCart} style={btnSmallOutline} disabled={items.length === 0}>
                Clear Cart
              </button>
            </div>

            {items.length === 0 ? (
              <div style={emptyBox}>
                Your grocery cart is empty. Go to{" "}
                <Link href="/groceries" style={linkStrong}>
                  Groceries
                </Link>{" "}
                and add items.
              </div>
            ) : (
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                {items.map((raw) => {
                  const it = normalizeCartItem(raw);
                  const key = getCartKey(it);

                  const qty = Number(it?.qty || 1);
                  const unitPrice = getUnitPrice(it);
                  const line = qty * unitPrice;

                  return (
                    <div key={key} style={itemRow}>
                      <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
                        <div style={thumb}>
                          {it?.image_url ? (
                            <img src={it.image_url} alt={it?.name || "Item"} style={thumbImg} />
                          ) : (
                            <div style={thumbPh}>No Image</div>
                          )}
                        </div>

                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 1000, color: "#0b1220", fontSize: 14 }}>
                            {it?.name || "Item"}
                          </div>

                          {clean(it?.variant_label) ? (
                            <div style={{ marginTop: 4, display: "inline-flex", gap: 8, flexWrap: "wrap" }}>
                              <span style={variantPill}>Option: {it.variant_label}</span>
                            </div>
                          ) : null}

                          <div style={{ marginTop: 4, color: "rgba(17,24,39,0.68)", fontWeight: 850, fontSize: 12 }}>
                            {it?.category ? clampText(it.category, 26) : "Grocery item"} • {moneyINR(unitPrice)} each • Line:{" "}
                            {moneyINR(line)}
                          </div>

                          <div style={{ marginTop: 4, fontSize: 12, fontWeight: 850, color: "rgba(17,24,39,0.58)" }}>
                            {normalizeIsTaxable(it) ? "Taxable" : "Non-taxable"}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <div style={qtyBox}>
                          <button onClick={() => changeQty(key, -1)} style={qtyBtn}>−</button>
                          <div style={qtyNum}>{qty}</div>
                          <button onClick={() => changeQty(key, +1)} style={qtyBtn}>+</button>
                        </div>

                        <button onClick={() => removeItem(key)} style={btnSmallDanger}>
                          Remove
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ marginTop: 16, borderTop: "1px solid rgba(0,0,0,0.08)", paddingTop: 14 }}>
              <div style={panelTitle}>Offers</div>
              <div style={panelSub}>Enter your coupon code</div>

              <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <input
                  value={coupon}
                  onChange={(e) => setCoupon(e.target.value)}
                  placeholder="Enter coupon code"
                  style={{ ...input, flex: 1, minWidth: 240 }}
                />
                <button onClick={applyCoupon} style={btnPrimary}>
                  Apply
                </button>
              </div>

              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 950, color: "#0b1220" }}>Tip delivery partner:</div>
                <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {tipOptions.map((t) => (
                    <button key={t} onClick={() => setTip(t)} style={t === tip ? chipOn : chipOff}>
                      {t === 0 ? "No tip" : moneyINR(t)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div style={panelGlass}>
            <div style={panelTitleRow}>
              <div>
                <div style={panelTitle}>Delivery Details</div>
                <div style={panelSub}>Enter delivery details to place the order.</div>
              </div>
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
              <div>
                <div style={label}>Customer Name</div>
                <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} style={input} />
              </div>

              <div>
                <div style={label}>Phone</div>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} style={input} />
              </div>

              <div>
                <div style={label}>Address Line 1</div>
                <input value={addr1} onChange={(e) => setAddr1(e.target.value)} style={input} />
              </div>

              <div>
                <div style={label}>Address Line 2 (optional)</div>
                <input value={addr2} onChange={(e) => setAddr2(e.target.value)} style={input} />
              </div>

              <div>
                <div style={label}>Landmark (optional)</div>
                <input value={landmark} onChange={(e) => setLandmark(e.target.value)} style={input} />
              </div>

              <div>
                <div style={label}>Delivery Instructions (optional)</div>
                <input value={instructions} onChange={(e) => setInstructions(e.target.value)} style={input} />
              </div>

              <div style={{ marginTop: 2 }}>
                <div style={label}>Payment Method (demo)</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button onClick={() => setPaymentMethod("cod")} style={paymentMethod === "cod" ? chipOn : chipOff}>
                    Cash on Delivery
                  </button>
                  <button onClick={() => setPaymentMethod("upi")} style={paymentMethod === "upi" ? chipOn : chipOff}>
                    UPI
                  </button>
                  <button onClick={() => setPaymentMethod("card")} style={paymentMethod === "card" ? chipOn : chipOff}>
                    Card
                  </button>
                </div>
              </div>

              <label style={checkLabel}>
                <input type="checkbox" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} />
                Save this address on this device
              </label>
            </div>

            <div style={summaryBox}>
              <div style={summaryTitle}>Total items</div>
              <div style={summaryVal}>{totalItems}</div>

              <div style={summaryLine} />

              <div style={summaryRow}>
                <div style={summaryKey}>Subtotal</div>
                <div style={summaryVal}>{moneyINR(subtotal)}</div>
              </div>

              <div style={summaryRow}>
                <div style={summaryKey}>Taxable subtotal</div>
                <div style={summaryVal}>{moneyINR(taxableSubtotal)}</div>
              </div>

              <div style={summaryRow}>
                <div style={summaryKey}>Delivery fee</div>
                <div style={summaryVal}>{moneyINR(deliveryFee)}</div>
              </div>

              <div style={summaryRow}>
                <div style={summaryKey}>Platform fee</div>
                <div style={summaryVal}>{moneyINR(platformFee)}</div>
              </div>

              <div style={summaryRow}>
                <div style={summaryKey}>Tax (5%)</div>
                <div style={summaryVal}>{moneyINR(tax)}</div>
              </div>

              <div style={summaryRow}>
                <div style={summaryKey}>Tip</div>
                <div style={summaryVal}>{moneyINR(tip)}</div>
              </div>
              <div style={summaryRow}>
                <div style={summaryKey}>Coupon</div>
                <div style={summaryVal}>{couponDiscount ? `- ${moneyINR(couponDiscount)}` : moneyINR(0)}</div>
              </div>

              <div style={summaryLine} />

              <div style={summaryRowBig}>
                <div style={summaryBigKey}>Payable</div>
                <div style={summaryBigVal}>{moneyINR(totalPayable)}</div>
              </div>

              <button
                onClick={handleCheckout}
                style={isGuest ? btnCheckoutMuted : btnCheckout}
                disabled={!canCheckout || items.length === 0}
                title={!canCheckout ? "Fill Name, Phone, Address Line 1" : ""}
              >
                {isGuest ? "Login to Place Order" : "Checkout →"}
              </button>

              <div style={{ marginTop: 10, fontSize: 12, fontWeight: 850, color: "rgba(17,24,39,0.65)" }}>
                Note: DB order create will be next step.
              </div>

              <div style={{ marginTop: 10, fontSize: 12, fontWeight: 850, color: "rgba(17,24,39,0.60)" }}>
                Platform fee config (optional): set <b>grocery_platform_fee_mode</b> (percent/flat) +{" "}
                <b>grocery_platform_fee_value</b>.
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

/* =========================
   Premium Inline Styles
   ========================= */

const pageBg = {
  minHeight: "calc(100vh - 64px)",
  padding: 20,
  background:
    "radial-gradient(1200px 600px at 20% 10%, rgba(16,185,129,0.18), transparent 62%), radial-gradient(900px 520px at 80% 18%, rgba(80,160,255,0.18), transparent 58%), linear-gradient(180deg, #f7f7fb, #ffffff)",
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
  fontSize: 30,
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
  minWidth: 320,
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

const mainGrid = {
  marginTop: 14,
  display: "grid",
  gridTemplateColumns: "1.2fr 0.8fr",
  gap: 14,
  alignItems: "start",
};

const panelGlass = {
  borderRadius: 18,
  padding: 14,
  background: "rgba(255,255,255,0.74)",
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 12px 36px rgba(0,0,0,0.07)",
  backdropFilter: "blur(10px)",
};

const panelTitleRow = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
  flexWrap: "wrap",
};

const panelTitle = {
  fontWeight: 1000,
  fontSize: 16,
  color: "#0b1220",
};

const panelSub = {
  marginTop: 4,
  fontSize: 12,
  fontWeight: 800,
  color: "rgba(17,24,39,0.65)",
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

const btnSmallOutline = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.9)",
  cursor: "pointer",
  fontWeight: 950,
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

const emptyBox = {
  marginTop: 12,
  padding: 14,
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.75)",
  color: "rgba(17,24,39,0.7)",
  fontWeight: 800,
};

const linkStrong = {
  fontWeight: 1000,
  color: "#111",
  textDecoration: "none",
};

const itemRow = {
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.78)",
  boxShadow: "0 10px 22px rgba(0,0,0,0.06)",
  padding: 12,
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap",
};

const thumb = {
  width: 56,
  height: 56,
  borderRadius: 14,
  overflow: "hidden",
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(0,0,0,0.03)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const thumbImg = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
};

const thumbPh = {
  fontSize: 11,
  fontWeight: 950,
  color: "rgba(17,24,39,0.5)",
};

const qtyBox = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.9)",
};

const qtyBtn = {
  width: 34,
  height: 34,
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.95)",
  cursor: "pointer",
  fontWeight: 1000,
  color: "#111827",
};

const qtyNum = {
  minWidth: 18,
  textAlign: "center",
  fontWeight: 1000,
  color: "#0b1220",
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

const checkLabel = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  fontWeight: 900,
  color: "rgba(17,24,39,0.85)",
  marginTop: 8,
};

const summaryBox = {
  marginTop: 14,
  borderRadius: 18,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.78)",
  boxShadow: "0 12px 26px rgba(0,0,0,0.06)",
  padding: 14,
};

const summaryTitle = {
  fontWeight: 1000,
  color: "#0b1220",
};

const summaryKey = {
  fontWeight: 900,
  color: "rgba(17,24,39,0.7)",
};

const summaryVal = {
  fontWeight: 1000,
  color: "#0b1220",
};

const summaryLine = {
  height: 1,
  background: "rgba(0,0,0,0.08)",
  margin: "10px 0",
};

const summaryRow = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
  marginTop: 8,
};

const summaryRowBig = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
  marginTop: 10,
};

const summaryBigKey = {
  fontWeight: 1000,
  color: "#0b1220",
  fontSize: 14,
};

const summaryBigVal = {
  fontWeight: 1000,
  color: "#0b1220",
  fontSize: 16,
};

const btnCheckout = {
  marginTop: 12,
  width: "100%",
  padding: "12px 14px",
  borderRadius: 14,
  border: "1px solid rgba(17,24,39,0.95)",
  background: "rgba(17,24,39,0.95)",
  color: "#fff",
  cursor: "pointer",
  fontWeight: 1000,
  boxShadow: "0 12px 26px rgba(17,24,39,0.16)",
};

const btnCheckoutMuted = {
  ...btnCheckout,
  background: "rgba(107,114,128,0.95)",
  border: "1px solid rgba(107,114,128,0.95)",
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

const variantPill = {
  fontSize: 12,
  padding: "5px 10px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(255,255,255,0.85)",
  color: "rgba(17,24,39,0.82)",
  fontWeight: 950,
};