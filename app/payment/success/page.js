"use client";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import supabase from "@/lib/supabase";

function clampText(s, max = 140) {
  const str = String(s ?? "");
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + "…";
}

function moneyFromCents(cents, currency = "USD") {
  const n = Number(cents || 0);
  const val = isFinite(n) ? n / 100 : 0;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
    }).format(val);
  } catch {
    return `${val.toFixed(2)} ${currency || ""}`.trim();
  }
}

function num(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

/* =========================================================
   ✅ CART READERS (ROBUST) - MATCH YOUR CART PAGE KEYS
   ========================================================= */

function safeParse(raw) {
  try {
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Restaurant cart keys used in your app/cart/page.js */
function readRestaurantCart() {
  const keys = ["foodapp_cart", "cart_items"];
  for (const k of keys) {
    try {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return { key: k, items: parsed };
    } catch {}
  }
  return { key: null, items: [] };
}

function clearRestaurantCart() {
  const keys = ["foodapp_cart", "cart_items"];
  for (const k of keys) {
    try {
      localStorage.removeItem(k);
    } catch {}
  }
  // keep your cart page in sync
  try {
    window.dispatchEvent(new Event("foodapp_cart_updated"));
  } catch {}
}

/** ✅ Grocery cart keys used in your app/cart/page.js */
const GROCERY_CART_KEY = "grocery_cart_items";
const GROCERY_FALLBACK_KEY = "grocery_cart";

/** Read groceries cart from EXACT keys your cart page uses */
function readGroceriesCart() {
  const keys = [GROCERY_CART_KEY, GROCERY_FALLBACK_KEY];

  for (const k of keys) {
    try {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return { key: k, items: parsed };
    } catch {}
  }

  // ✅ fallback: if something old is left in storage, we can still try
  try {
    const raw2 = localStorage.getItem("grocery_cart_items");
    const parsed2 = safeParse(raw2);
    if (Array.isArray(parsed2) && parsed2.length) return { key: "grocery_cart_items", items: parsed2 };
  } catch {}

  return { key: null, items: [] };
}

/** Clear groceries cart from EXACT keys your cart page uses */
function clearGroceriesCart() {
  const keys = [GROCERY_CART_KEY, GROCERY_FALLBACK_KEY];

  for (const k of keys) {
    try {
      localStorage.removeItem(k);
    } catch {}
  }

  try {
    window.dispatchEvent(new Event("foodapp_cart_updated"));
  } catch {}
}

/** Extract restaurant_id from restaurant cart items */
function inferRestaurantIdFromItems(items) {
  if (!Array.isArray(items) || !items.length) return null;
  for (const it of items) {
    const rid = it?.restaurant_id || it?.restaurantId || it?.restaurant?.id || it?.restaurant?.uuid;
    if (rid) return rid;
  }
  return null;
}

/** Extract store_id from grocery cart items */
function inferStoreIdFromItems(items) {
  if (!Array.isArray(items) || !items.length) return null;

  for (const it of items) {
    const storeId =
      it?.store_id ||
      it?.storeId ||
      it?.grocery_store_id ||
      it?.groceryStoreId ||
      it?.store?.id ||
      it?.store?.store_id ||
      it?.store?.uuid;

    if (storeId) return storeId;
  }
  return null;
}

/** best-effort mapping for grocery_order_items schema */
function mapCartItemToGroceryOrderItem(it, orderId) {
  const qty = Math.max(
    1,
    Math.floor(
      num(
        it?.qty ??
          it?.quantity ??
          it?.count ??
          it?.cart_qty ??
          it?.cartQuantity ??
          1,
        1
      )
    )
  );

  const priceEach = num(
    it?.price_each ??
      it?.priceEach ??
      it?.unit_price ??
      it?.unitPrice ??
      it?.price ??
      it?.amount ??
      0,
    0
  );

  const groceryItemId =
    it?.grocery_item_id ||
    it?.groceryItemId ||
    it?.item_id ||
    it?.itemId ||
    it?.id ||
    null;

  const name =
    it?.item_name ||
    it?.itemName ||
    it?.name ||
    it?.title ||
    it?.product_name ||
    it?.productName ||
    null;

  return {
    order_id: orderId,
    grocery_item_id: groceryItemId, // nullable
    item_id: groceryItemId, // nullable
    item_name: name, // nullable
    name: name, // nullable
    qty, // NOT NULL
    quantity: qty, // optional
    price_each: priceEach, // nullable
    price: priceEach * qty, // nullable
  };
}

/** Restaurant order_items mapping */
function mapCartItemToRestaurantOrderItem(it, orderId) {
  const qty = Math.max(1, Math.floor(num(it?.qty ?? it?.quantity ?? 1, 1)));

  // ✅ Prefer price_each from restaurant cart shape
  const priceEach = num(it?.price_each ?? it?.priceEach ?? it?.price ?? it?.amount ?? 0, 0);

  // ✅ Prefer menu_item_id (correct in your cart items)
  const menuItemId = it?.menu_item_id || it?.menuItemId || null;

  return {
    order_id: orderId,
    menu_item_id: menuItemId,
    qty,
    price_each: priceEach,
  };
}

/** read saved address from your cart page */
function readSavedAddress() {
  try {
    const raw = localStorage.getItem("foodapp_saved_address");
    if (!raw) return null;
    const a = JSON.parse(raw);
    return {
      customer_name: String(a?.customer_name || ""),
      phone: String(a?.phone || ""),
      address_line1: String(a?.address_line1 || ""),
      address_line2: String(a?.address_line2 || ""),
      landmark: String(a?.landmark || ""),
      instructions: String(a?.instructions || ""),
    };
  } catch {
    return null;
  }
}

/** Detect order type if Stripe metadata isn't available */
function detectOrderTypeFromLocalStorage() {
  try {
    const r = readRestaurantCart();
    const g = readGroceriesCart();
    if ((g?.items || []).length > 0 && (r?.items || []).length === 0) return "grocery";
    if ((r?.items || []).length > 0 && (g?.items || []).length === 0) return "restaurant";
    if ((g?.items || []).length > 0) return "grocery";
    if ((r?.items || []).length > 0) return "restaurant";
  } catch {}
  return "restaurant";
}

function PaymentSuccessInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const sessionId = sp.get("session_id") || "";

  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState("");
  const [data, setData] = useState(null);

  const [copied, setCopied] = useState(false);

  // order creation status
  const [orderSaving, setOrderSaving] = useState(false);
  const [orderSaved, setOrderSaved] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [orderSaveErr, setOrderSaveErr] = useState("");

  // redirect countdown
  const [redirectIn, setRedirectIn] = useState(null);

  // Prevent multiple runs
  const createdOnceRef = useRef(false);
  const redirectOnceRef = useRef(false);
  const clearCartOnceRef = useRef(false);

  // computed type + redirect target
  const [orderType, setOrderType] = useState("restaurant"); // "restaurant" | "grocery"
  const [successRedirect, setSuccessRedirect] = useState(""); // optional override

  const shortId = useMemo(() => {
    if (!sessionId) return "";
    return sessionId.length > 32 ? sessionId.slice(0, 24) + "…" + sessionId.slice(-8) : sessionId;
  }, [sessionId]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setErrMsg("");
      setData(null);

      // reset order UI on new session
      setOrderSaving(false);
      setOrderSaved(false);
      setOrderId("");
      setOrderSaveErr("");
      createdOnceRef.current = false;

      // reset redirect state on new session
      setRedirectIn(null);
      redirectOnceRef.current = false;

      // reset cart clear guard on new session
      clearCartOnceRef.current = false;

      // reset type on new session
      setOrderType("restaurant");
      setSuccessRedirect("");

      if (!sessionId) {
        setErrMsg("Missing session_id. Please return to cart and try again.");
        setLoading(false);
        return;
      }

      try {
        const r = await fetch(`/api/stripe/verify-session?session_id=${encodeURIComponent(sessionId)}`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });

        const j = await r.json().catch(() => null);
        if (!j || !j.ok) {
          throw new Error(j?.error || "Unable to verify payment.");
        }

        if (cancelled) return;
        setData(j);

        const metaOrderType =
          String(j?.order_type || j?.metadata?.order_type || j?.meta?.order_type || "").toLowerCase().trim() || "";

        const detected = detectOrderTypeFromLocalStorage();
        const finalType = metaOrderType === "grocery" || metaOrderType === "restaurant" ? metaOrderType : detected;

        setOrderType(finalType);

        const redirect =
          String(j?.success_redirect || j?.metadata?.success_redirect || j?.meta?.success_redirect || "").trim() || "";
        if (redirect) setSuccessRedirect(redirect);

        if (!j.paid) {
          setErrMsg("Payment not confirmed yet. If you just paid, refresh in a moment.");
        }
      } catch (e) {
        if (cancelled) return;
        setErrMsg(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  /* =========================================================
     ✅ ORDER CREATION AFTER PAID (GROCERY OR RESTAURANT)
     ========================================================= */

  useEffect(() => {
    let cancelled = false;

    async function createOrderIfPaid() {
      setOrderSaveErr("");

      const paidNow = !!data?.paid;
      if (!paidNow) return;

      if (createdOnceRef.current) return;
      createdOnceRef.current = true;

      if (!sessionId) return;

      try {
        setOrderSaving(true);

        // current user
        const { data: sess } = await supabase.auth.getSession();
        const user = sess?.session?.user || null;
        const userId = user?.id || null;

        const amountCents = num(data?.amount_total, 0);
        const totalAmount = amountCents / 100;
        const currency = data?.currency || "USD";
        const email = data?.email || user?.email || null;

        // ---------------------------
        // ✅ GROCERY FLOW
        // ---------------------------
        if (orderType === "grocery") {
          const existing = await supabase
            .from("grocery_orders")
            .select("id")
            .eq("stripe_session_id", sessionId)
            .maybeSingle();

          if (cancelled) return;

          if (existing?.data?.id) {
            const existingId = String(existing.data.id);
            setOrderId(existingId);
            setOrderSaved(true);

            // ensure items exist too (idempotent)
            try {
              const alreadyHasItems = await supabase
                .from("grocery_order_items")
                .select("id")
                .eq("order_id", existingId)
                .limit(1);

              const hasAny = Array.isArray(alreadyHasItems?.data) && alreadyHasItems.data.length > 0;

              if (!hasAny) {
                const cart = typeof window !== "undefined" ? readGroceriesCart() : { key: null, items: [] };
                const items = Array.isArray(cart.items) ? cart.items : [];
                if (items.length) {
                  const payload = items.map((it) => mapCartItemToGroceryOrderItem(it, existingId));
                  const insItems = await supabase.from("grocery_order_items").insert(payload);
                  if (insItems?.error) {
                    setOrderSaveErr(`Order saved, but items not saved: ${insItems.error.message}`);
                  }
                }
              }
            } catch (e) {
              setOrderSaveErr(`Order saved, but items check failed: ${e?.message || String(e)}`);
            }

            setOrderSaving(false);
            return;
          }

          // Read grocery cart
          const cart = typeof window !== "undefined" ? readGroceriesCart() : { key: null, items: [] };
          const items = Array.isArray(cart.items) ? cart.items : [];

          // store_id required
          const storeId =
            String(data?.store_id || data?.metadata?.store_id || data?.meta?.store_id || "").trim() ||
            inferStoreIdFromItems(items);

          if (!storeId) {
            throw new Error(
              "Cart store_id not found. grocery_orders requires store_id. Please ensure grocery cart items include store_id."
            );
          }

          const orderPayload = {
            stripe_session_id: sessionId,
            user_id: userId,
            store_id: storeId,
            status: "preparing",
            total_amount: totalAmount,
            currency,
            email,
          };

          let insertedOrderId = null;

          const tryPayloads = [
            orderPayload,
            {
              stripe_session_id: sessionId,
              user_id: userId,
              store_id: storeId,
              status: "preparing",
              total_amount: totalAmount,
            },
            {
              stripe_session_id: sessionId,
              user_id: userId,
              store_id: storeId,
              total_amount: totalAmount,
            },
            {
              stripe_session_id: sessionId,
              user_id: userId,
              store_id: storeId,
            },
          ];

          let lastErr = null;
          for (const p of tryPayloads) {
            const ins = await supabase.from("grocery_orders").insert(p).select("id").single();
            if (ins?.data?.id) {
              insertedOrderId = ins.data.id;
              lastErr = null;
              break;
            }
            lastErr = ins?.error || lastErr;
          }

          if (cancelled) return;

          if (!insertedOrderId) {
            throw new Error(lastErr?.message || "Grocery order insert failed.");
          }

          // Insert grocery_order_items (idempotent)
          if (items.length) {
            try {
              const alreadyHasItems = await supabase
                .from("grocery_order_items")
                .select("id")
                .eq("order_id", insertedOrderId)
                .limit(1);

              const hasAny = Array.isArray(alreadyHasItems?.data) && alreadyHasItems.data.length > 0;

              if (!hasAny) {
                const payload = items.map((it) => mapCartItemToGroceryOrderItem(it, insertedOrderId));
                const insItems = await supabase.from("grocery_order_items").insert(payload);

                if (insItems?.error) {
                  setOrderSaveErr(`Order saved, but items not saved: ${insItems.error.message}`);
                }
              }
            } catch (e) {
              setOrderSaveErr(`Order saved, but items insert failed: ${e?.message || String(e)}`);
            }
          }

          setOrderId(String(insertedOrderId));
          setOrderSaved(true);
          return;
        }

        // ---------------------------
        // ✅ RESTAURANT FLOW
        // ---------------------------
        let existingRestOrderId = null;
        try {
          const ex = await supabase
            .from("orders")
            .select("id")
            .eq("stripe_session_id", sessionId)
            .maybeSingle();

          if (ex?.data?.id) existingRestOrderId = String(ex.data.id);
        } catch {
          existingRestOrderId = null;
        }

        if (cancelled) return;

        if (existingRestOrderId) {
          setOrderId(existingRestOrderId);
          setOrderSaved(true);

          // ensure order_items exist too
          try {
            const alreadyHasItems = await supabase
              .from("order_items")
              .select("id")
              .eq("order_id", existingRestOrderId)
              .limit(1);

            const hasAny = Array.isArray(alreadyHasItems?.data) && alreadyHasItems.data.length > 0;

            if (!hasAny) {
              const cart = typeof window !== "undefined" ? readRestaurantCart() : { key: null, items: [] };
              const items = Array.isArray(cart.items) ? cart.items : [];
              if (items.length) {
                const payload = items.map((it) => mapCartItemToRestaurantOrderItem(it, existingRestOrderId));
                const insItems = await supabase.from("order_items").insert(payload);
                if (insItems?.error) {
                  setOrderSaveErr(`Order saved, but items not saved: ${insItems.error.message}`);
                }
              }
            }
          } catch (e) {
            setOrderSaveErr(`Order saved, but items check failed: ${e?.message || String(e)}`);
          }

          setOrderSaving(false);
          return;
        }

        const cart = typeof window !== "undefined" ? readRestaurantCart() : { key: null, items: [] };
        const rItems = Array.isArray(cart.items) ? cart.items : [];

        const restaurantId =
          String(data?.restaurant_id || data?.metadata?.restaurant_id || data?.meta?.restaurant_id || "").trim() ||
          inferRestaurantIdFromItems(rItems);

        if (!restaurantId) {
          throw new Error("Restaurant cart restaurant_id not found. Please ensure restaurant cart items include restaurant_id.");
        }

        if (!rItems.length) {
          throw new Error("Restaurant cart is empty. Please return to cart and try again.");
        }

        const subtotalAmount = rItems.reduce(
          (s, it) => s + num(it?.price_each ?? it?.price ?? 0, 0) * Math.max(1, Math.floor(num(it?.qty ?? 1, 1))),
          0
        );

        const addr = typeof window !== "undefined" ? readSavedAddress() : null;

        const baseOrder = {
          user_id: userId,
          restaurant_id: restaurantId,
          status: "pending",
          total_amount: totalAmount,
          subtotal_amount: subtotalAmount,
          total: totalAmount,
          currency,
          email,
          payment_method: "stripe",
          stripe_session_id: sessionId,
          customer_name: addr?.customer_name || null,
          phone: addr?.phone || null,
          address_line1: addr?.address_line1 || null,
          address_line2: addr?.address_line2 || null,
          landmark: addr?.landmark || null,
          instructions: addr?.instructions || null,
        };

        const tryOrderPayloads = [
          baseOrder,
          (() => {
            const p = { ...baseOrder };
            delete p.currency;
            delete p.email;
            delete p.payment_method;
            delete p.stripe_session_id;
            return p;
          })(),
          (() => {
            const p = { ...baseOrder };
            delete p.currency;
            delete p.email;
            delete p.payment_method;
            return p;
          })(),
          (() => {
            const p = { ...baseOrder };
            delete p.currency;
            delete p.email;
            return p;
          })(),
          {
            user_id: userId,
            restaurant_id: restaurantId,
            status: "pending",
            total_amount: totalAmount,
            subtotal_amount: subtotalAmount,
          },
          {
            user_id: userId,
            restaurant_id: restaurantId,
            status: "pending",
            total: totalAmount,
          },
          {
            user_id: userId,
            restaurant_id: restaurantId,
            status: "pending",
            total_amount: totalAmount,
          },
        ];

        let newOrderId = null;
        let lastErr = null;

        for (const p of tryOrderPayloads) {
          const ins = await supabase.from("orders").insert(p).select("id").single();
          if (ins?.data?.id) {
            newOrderId = ins.data.id;
            lastErr = null;
            break;
          }
          lastErr = ins?.error || lastErr;
        }

        if (cancelled) return;

        if (!newOrderId) {
          throw new Error(lastErr?.message || "Restaurant order insert failed.");
        }

        // insert order_items (idempotent)
        try {
          const alreadyHasItems = await supabase
            .from("order_items")
            .select("id")
            .eq("order_id", newOrderId)
            .limit(1);

          const hasAny = Array.isArray(alreadyHasItems?.data) && alreadyHasItems.data.length > 0;

          if (!hasAny) {
            const payload = rItems.map((it) => mapCartItemToRestaurantOrderItem(it, newOrderId));
            // filter bad rows (no menu_item_id)
            const cleaned = payload.filter((x) => !!x.menu_item_id);
            if (!cleaned.length) {
              setOrderSaveErr("Order saved, but items missing menu_item_id in cart. Please re-add items and try again.");
            } else {
              const insItems = await supabase.from("order_items").insert(cleaned);
              if (insItems?.error) {
                setOrderSaveErr(`Order saved, but items not saved: ${insItems.error.message}`);
              }
            }
          }
        } catch (e) {
          setOrderSaveErr(`Order saved, but items insert failed: ${e?.message || String(e)}`);
        }

        setOrderId(String(newOrderId));
        setOrderSaved(true);
      } catch (e) {
        if (cancelled) return;
        setOrderSaveErr(e?.message || String(e));
      } finally {
        if (!cancelled) setOrderSaving(false);
      }
    }

    createOrderIfPaid();
    return () => {
      cancelled = true;
    };
  }, [data, sessionId, orderType]);

  /* =========================================================
     ✅ CLEAR CORRECT CART AFTER SUCCESS (ONLY ONCE)
     ========================================================= */

  useEffect(() => {
    const paidNow = !!data?.paid;
    if (!paidNow || !orderSaved || orderSaving) return;

    if (clearCartOnceRef.current) return;
    clearCartOnceRef.current = true;

    try {
      if (typeof window !== "undefined") {
        if (orderType === "grocery") clearGroceriesCart();
        else clearRestaurantCart();
      }
    } catch {}
  }, [data, orderSaved, orderSaving, orderType]);

  /* =========================================================
     ✅ AUTO REDIRECT AFTER SAVED (COUNTDOWN)
     ========================================================= */

  useEffect(() => {
    const paidNow = !!data?.paid;
    if (!paidNow || !orderSaved || orderSaving) return;
    if (redirectOnceRef.current) return;

    redirectOnceRef.current = true;

    const fallback = orderType === "grocery" ? "/orders" : "/orders";
    const target = successRedirect || fallback;

    let seconds = 5;
    setRedirectIn(seconds);

    const t = setInterval(() => {
      seconds -= 1;
      setRedirectIn(seconds);
      if (seconds <= 0) {
        clearInterval(t);
        router.push(target);
      }
    }, 1000);

    return () => clearInterval(t);
  }, [data, orderSaved, orderSaving, router, orderType, successRedirect]);

  async function copySession() {
    try {
      await navigator.clipboard.writeText(sessionId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  const paid = !!data?.paid;
  const amountText = data ? moneyFromCents(data.amount_total, data.currency) : "";
  const email = data?.email || "";

  const orderStatusText = paid
    ? orderSaving
      ? "Saving order to database…"
      : orderSaved
      ? `Order saved ✅ ${orderId ? `(ID: ${clampText(orderId, 28)})` : ""}`
      : orderSaveErr
      ? "Order not saved"
      : "Preparing order…"
    : "Waiting for payment confirmation…";

  const typePill = orderType === "grocery" ? "Grocery Order" : "Restaurant Order";

  const showRedirect = paid && orderSaved && !orderSaving && typeof redirectIn === "number";

  return (
    <main style={pageBg}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <div style={heroGlass}>
          <div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <div style={paid ? pillOk : pillWarn}>{paid ? "Payment Verified ✅" : "Checking Payment…"}</div>
              <div style={pillSoft}>{typePill}</div>
            </div>

            <h1 style={title}>{paid ? "Thank you! 🎉" : "Almost there…"}</h1>

            <div style={sub}>
              {paid
                ? "Your payment is confirmed. We’re preparing your order now."
                : "We’re verifying your Stripe payment securely. Please wait a moment."}
            </div>

            <div style={{ marginTop: 10, ...tinyNote }}>
              <b>Order Status:</b> {orderStatusText}
            </div>

            {showRedirect ? (
              <div style={{ marginTop: 6, ...tinyNote }}>
                Redirecting in <b>{Math.max(0, redirectIn)}</b>s…
              </div>
            ) : null}

            <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link href="/orders" style={btnPrimary}>
                View My Orders
              </Link>
              <Link href="/" style={btnGhost}>
                Back to Home
              </Link>
              <button onClick={() => router.push("/cart")} style={btnGhostBtn}>
                Back to Cart
              </button>
              <button onClick={() => window.location.reload()} style={btnGhostBtn} title="Re-check Stripe payment status">
                Refresh Status
              </button>
            </div>

            {loading ? <div style={{ marginTop: 12, ...tinyNote }}>Verifying…</div> : null}
            {errMsg ? <div style={alertErr}>{errMsg}</div> : null}

            {paid && orderSaveErr ? (
              <div
                style={{
                  ...alertErr,
                  border: "1px solid rgba(245,158,11,0.25)",
                  background: "rgba(255,251,235,0.95)",
                  color: "#92400e",
                }}
              >
                {orderSaveErr}
              </div>
            ) : null}
          </div>

          <div style={sideCard}>
            <div style={{ fontWeight: 1000, color: "#0b1220" }}>Payment Details</div>
            <div style={{ marginTop: 6, fontSize: 12, fontWeight: 850, color: "rgba(17,24,39,0.65)" }}>
              Verified from Stripe using session_id
            </div>

            <div style={sessionBox}>
              <div style={sessionText}>{shortId || "session_id not found"}</div>
              {sessionId ? (
                <button onClick={copySession} style={copyBtn}>
                  {copied ? "Copied ✅" : "Copy"}
                </button>
              ) : null}
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
              <div style={row}>
                <span style={k}>Status</span>
                <span style={v}>{data?.status ? String(data.status) : "—"}</span>
              </div>
              <div style={row}>
                <span style={k}>Payment</span>
                <span style={v}>{data?.payment_status ? String(data.payment_status) : "—"}</span>
              </div>
              <div style={row}>
                <span style={k}>Amount</span>
                <span style={v}>{data ? amountText : "—"}</span>
              </div>
              <div style={row}>
                <span style={k}>Email</span>
                <span style={v}>{email || "—"}</span>
              </div>

              <div style={row}>
                <span style={k}>Order Type</span>
                <span style={v}>{orderType || "—"}</span>
              </div>

              <div style={row}>
                <span style={k}>DB Order</span>
                <span style={v}>
                  {orderSaving ? "saving…" : orderSaved ? "saved ✅" : paid ? (orderSaveErr ? "failed" : "pending…") : "—"}
                </span>
              </div>
            </div>

            <div style={tinyNote}>Full session_id: {clampText(sessionId || "—", 120)}</div>
          </div>
        </div>

        <div style={infoCard}>
          <div style={infoTitle}>What’s done ✅</div>
          <div style={infoText}>
            ✅ Payment verified → ✅ order saved in DB (grocery or restaurant) → ✅ correct cart cleared → ✅ redirect.
          </div>
        </div>
      </div>
    </main>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense
      fallback={
        <main style={pageBg}>
          <div style={{ maxWidth: 980, margin: "0 auto" }}>
            <div style={heroGlass}>
              <div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <div style={pillWarn}>Checking Payment…</div>
                  <div style={pillSoft}>Preparing…</div>
                </div>

                <h1 style={title}>Loading…</h1>
                <div style={sub}>Verifying your payment securely.</div>

                <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <Link href="/orders" style={btnPrimary}>
                    View My Orders
                  </Link>
                  <Link href="/" style={btnGhost}>
                    Back to Home
                  </Link>
                </div>
              </div>

              <div style={sideCard}>
                <div style={{ fontWeight: 1000, color: "#0b1220" }}>Payment Details</div>
                <div style={{ marginTop: 10, ...tinyNote }}>Loading session…</div>
              </div>
            </div>

            <div style={infoCard}>
              <div style={infoTitle}>Please wait…</div>
              <div style={infoText}>We’re loading your confirmation page.</div>
            </div>
          </div>
        </main>
      }
    >
      <PaymentSuccessInner />
    </Suspense>
  );
}

/* ===== Premium inline styles ===== */

const pageBg = {
  minHeight: "calc(100vh - 64px)",
  padding: 20,
  background:
    "radial-gradient(1200px 600px at 20% 10%, rgba(16,185,129,0.18), transparent 62%), radial-gradient(900px 520px at 80% 18%, rgba(80,160,255,0.18), transparent 58%), linear-gradient(180deg, #f7f7fb, #ffffff)",
};

const heroGlass = {
  borderRadius: 22,
  padding: 18,
  background: "rgba(255,255,255,0.82)",
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 16px 52px rgba(0,0,0,0.10)",
  backdropFilter: "blur(10px)",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 14,
  flexWrap: "wrap",
};

const pillOk = {
  display: "inline-flex",
  padding: "8px 12px",
  borderRadius: 999,
  border: "1px solid rgba(16,185,129,0.22)",
  background: "rgba(236,253,245,0.95)",
  color: "#065f46",
  fontWeight: 950,
  fontSize: 12,
};

const pillWarn = {
  display: "inline-flex",
  padding: "8px 12px",
  borderRadius: 999,
  border: "1px solid rgba(245,158,11,0.22)",
  background: "rgba(255,251,235,0.95)",
  color: "#92400e",
  fontWeight: 950,
  fontSize: 12,
};

const pillSoft = {
  display: "inline-flex",
  padding: "8px 12px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(255,255,255,0.80)",
  color: "rgba(17,24,39,0.75)",
  fontWeight: 950,
  fontSize: 12,
};

const title = {
  margin: "12px 0 0 0",
  fontSize: 34,
  fontWeight: 1000,
  color: "#0b1220",
  letterSpacing: -0.2,
};

const sub = {
  marginTop: 10,
  fontWeight: 850,
  color: "rgba(17,24,39,0.72)",
  lineHeight: "22px",
  maxWidth: 520,
};

const sideCard = {
  minWidth: 320,
  maxWidth: 420,
  borderRadius: 18,
  padding: 14,
  background: "rgba(255,255,255,0.72)",
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 12px 36px rgba(0,0,0,0.07)",
  backdropFilter: "blur(10px)",
};

const sessionBox = {
  marginTop: 10,
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(255,255,255,0.90)",
  padding: 10,
  display: "flex",
  gap: 10,
  alignItems: "center",
  justifyContent: "space-between",
};

const sessionText = {
  fontWeight: 950,
  color: "#0b1220",
  fontSize: 13,
  wordBreak: "break-all",
};

const copyBtn = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.95)",
  cursor: "pointer",
  fontWeight: 950,
};

const tinyNote = {
  marginTop: 10,
  fontSize: 12,
  fontWeight: 850,
  color: "rgba(17,24,39,0.65)",
  lineHeight: "18px",
};

const btnPrimary = {
  padding: "12px 14px",
  borderRadius: 14,
  border: "1px solid rgba(17,24,39,0.95)",
  background: "rgba(17,24,39,0.95)",
  color: "#fff",
  textDecoration: "none",
  fontWeight: 950,
  boxShadow: "0 12px 26px rgba(17,24,39,0.16)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const btnGhost = {
  padding: "12px 14px",
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.90)",
  color: "#0b1220",
  textDecoration: "none",
  fontWeight: 950,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const btnGhostBtn = {
  ...btnGhost,
  cursor: "pointer",
};

const alertErr = {
  marginTop: 12,
  padding: 12,
  borderRadius: 16,
  border: "1px solid rgba(239,68,68,0.25)",
  background: "rgba(254,242,242,0.9)",
  color: "#7f1d1d",
  fontWeight: 900,
};

const infoCard = {
  marginTop: 14,
  borderRadius: 18,
  padding: 14,
  background: "rgba(255,255,255,0.78)",
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 12px 36px rgba(0,0,0,0.07)",
  backdropFilter: "blur(10px)",
};

const infoTitle = {
  fontWeight: 1000,
  color: "#0b1220",
  fontSize: 14,
};

const infoText = {
  marginTop: 6,
  fontWeight: 850,
  color: "rgba(17,24,39,0.70)",
  lineHeight: "20px",
};

const row = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "center",
};

const k = {
  fontWeight: 900,
  color: "rgba(17,24,39,0.65)",
  fontSize: 12,
};

const v = {
  fontWeight: 1000,
  color: "#0b1220",
  fontSize: 12,
};