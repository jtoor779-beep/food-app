"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import supabase from "@/lib/supabase";

type AnyRow = Record<string, any>;
type ChannelType = "all" | "restaurant" | "grocery" | "other";
type DateRangeType = "all" | "today" | "7d" | "30d" | "this_month" | "custom";

type RevenueRow = {
  id: string;
  created_at: string;
  status: string;
  amount: number;
  channel: ChannelType | "other";
  outletId: string;
  outletName: string;
  paymentMethod: string;
  customerName: string;
  currency: string;
  raw: AnyRow;
};

const TOTAL_COLS = ["total_amount", "total", "grand_total", "amount", "order_total", "total_price"];
const STATUS_COLS = ["status", "order_status", "payment_status"];
const DATE_COLS = ["created_at", "paid_at", "delivered_at", "picked_up_at"];
const RESTAURANT_ID_COLS = ["restaurant_id", "vendor_id", "merchant_id"];
const GROCERY_ID_COLS = ["grocery_id", "grocery_store_id", "mart_id", "shop_id", "store_id"];
const PAYMENT_COLS = ["payment_method", "payment_type", "method", "payment_mode"];
const CUSTOMER_NAME_COLS = ["customer_name", "full_name", "name", "user_name"];

const PLATFORM_FEE_COLS = [
  "platform_fee",
  "platform_fee_amount",
  "commission_amount",
  "service_fee",
  "service_fee_amount",
  "commission",
  "admin_fee",
  "platform_commission",
];
const TAX_COLS = ["tax_amount", "gst_amount", "tax", "gst", "tax_total", "tax_value", "taxes"];
const TIP_COLS = ["tip_amount", "tip", "driver_tip", "delivery_tip", "tip_value"];
const DELIVERY_FEE_COLS = ["delivery_fee", "delivery_fee_amount", "delivery_charge", "delivery_charge_amount", "shipping_fee", "delivery_total"];
const DELIVERY_PAYOUT_COLS = ["delivery_payout", "driver_payout", "courier_payout"];
const DISCOUNT_COLS = ["discount_amount", "discount", "coupon_discount", "discount_total"];
const SUBTOTAL_COLS = ["subtotal_amount", "subtotal", "sub_total"];

const COMPLETED_STATUSES = ["delivered", "completed", "complete", "paid", "success", "accepted", "fulfilled"];
const CANCELLED_STATUSES = ["cancelled", "canceled", "rejected", "failed", "refund", "refunded"];

// ✅ Base columns known to be safe in your current orders table.
const SAFE_ORDER_SELECT_BASE = [
  "id",
  "user_id",
  "restaurant_id",
  "status",
  "total",
  "created_at",
  "customer_name",
  "delivery_fee",
  "delivery_payout",
  "tip_amount",
  "picked_up_at",
  "delivered_at",
  "discount_amount",
  "subtotal_amount",
  "total_amount",
  "payment_status",
  "paid_at",
  "payment_method",
  "currency",
  "platform_fee",
  "tax_amount",
  "coupon_code",
];

const ORDER_SELECT_ATTEMPTS = [
  [...SAFE_ORDER_SELECT_BASE, "store_id", "grocery_store_id", "order_type", "category", "type", "source_type", "commission_amount", "gst_amount"].join(","),
  [...SAFE_ORDER_SELECT_BASE, "store_id", "order_type", "category", "type", "source_type", "commission_amount", "gst_amount"].join(","),
  [...SAFE_ORDER_SELECT_BASE, "order_type", "category", "type", "source_type", "commission_amount", "gst_amount"].join(","),
  [...SAFE_ORDER_SELECT_BASE, "store_id", "commission_amount", "gst_amount"].join(","),
  [...SAFE_ORDER_SELECT_BASE, "commission_amount", "gst_amount"].join(","),
  [...SAFE_ORDER_SELECT_BASE, "store_id", "commission_amount"].join(","),
  [...SAFE_ORDER_SELECT_BASE, "commission_amount"].join(","),
  [...SAFE_ORDER_SELECT_BASE, "store_id", "gst_amount"].join(","),
  [...SAFE_ORDER_SELECT_BASE, "gst_amount"].join(","),
  [...SAFE_ORDER_SELECT_BASE, "store_id"].join(","),
  SAFE_ORDER_SELECT_BASE.join(","),
];

function toNum(v: any) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function money(v: any) {
  const n = toNum(v);
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function money2(v: any) {
  const n = toNum(v);
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function currencySymbol(code: any) {
  const c = String(code || "USD").trim().toUpperCase();
  if (c === "USD") return "$";
  if (c === "AUD") return "A$";
  if (c === "INR") return "₹";
  if (c === "CAD") return "C$";
  if (c === "EUR") return "€";
  if (c === "GBP") return "£";
  return `${c} `;
}

function formatMoney(v: any, code: any) {
  return `${currencySymbol(code)}${money(v)}`;
}

function formatMoney2(v: any, code: any) {
  return `${currencySymbol(code)}${money2(v)}`;
}

function normalize(s: any) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth() {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getRangeStart(range: DateRangeType, customFrom: string) {
  if (range === "all") return new Date(0);
  if (range === "today") return startOfToday();
  if (range === "7d") return daysAgo(6);
  if (range === "30d") return daysAgo(29);
  if (range === "this_month") return startOfMonth();
  if (range === "custom" && customFrom) {
    const d = new Date(customFrom);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  return daysAgo(6);
}

function getRangeEnd(range: DateRangeType, customTo: string) {
  if (range === "custom" && customTo) {
    const d = new Date(customTo);
    d.setHours(23, 59, 59, 999);
    return d;
  }
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

function getValue(row: AnyRow, cols: string[]) {
  for (const c of cols) {
    const v = row?.[c];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return null;
}

function pickNumFromCols(row: AnyRow, cols: string[]) {
  return toNum(getValue(row, cols));
}

function pickStatus(row: AnyRow) {
  return normalize(getValue(row, STATUS_COLS));
}

function pickDate(row: AnyRow) {
  const v = getValue(row, DATE_COLS);
  return v ? String(v) : "";
}

function pickOutletId(row: AnyRow, channel: ChannelType | "other") {
  if (channel === "restaurant") return String(getValue(row, RESTAURANT_ID_COLS) || "");
  if (channel === "grocery") return String(getValue(row, GROCERY_ID_COLS) || "");
  return String(row?.store_id || row?.merchant_id || row?.vendor_id || row?.id || "");
}

function safeDateText(value: string) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function dayKey(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString().slice(0, 10);
}

function dayLabel(d: Date) {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function makeOutletFilterKey(channel: string, outletId: string, outletName: string) {
  const cleanName = String(outletName || "").trim();
  if (cleanName && cleanName !== "Restaurant" && cleanName !== "Grocery Store" && cleanName !== "Other") {
    return `${channel}:name:${normalize(cleanName)}`;
  }
  return `${channel}:id:${String(outletId || cleanName || "unknown")}`;
}

function detectChannel(row: AnyRow): ChannelType | "other" {
  const typeGuess = normalize(
    row?.order_type ||
      row?.category ||
      row?.type ||
      row?.store_type ||
      row?.service_type ||
      row?.merchant_type ||
      row?.source_type ||
      row?.business_type
  );

  const hasRestaurantId = RESTAURANT_ID_COLS.some((c) => row?.[c] !== undefined && row?.[c] !== null && row?.[c] !== "");
  const hasGrocerySpecificId = ["grocery_id", "grocery_store_id", "mart_id", "shop_id"].some(
    (c) => row?.[c] !== undefined && row?.[c] !== null && row?.[c] !== ""
  );
  const hasStoreId = row?.store_id !== undefined && row?.store_id !== null && row?.store_id !== "";

  if (typeGuess.includes("grocery") || typeGuess.includes("mart")) return "grocery";
  if (typeGuess.includes("restaurant") || typeGuess.includes("food") || typeGuess.includes("kitchen")) return "restaurant";
  if (hasGrocerySpecificId) return "grocery";
  if (hasRestaurantId) return "restaurant";
  if (hasStoreId) return "grocery";
  return "other";
}

function detectOutletName(
  row: AnyRow,
  channel: ChannelType | "other",
  restaurantMap: Record<string, string>,
  groceryMap: Record<string, string>
) {
  const outletId = pickOutletId(row, channel);

  if (channel === "restaurant") {
    if (outletId && restaurantMap[outletId]) return restaurantMap[outletId];
    return (
      String(row?.restaurant_name || row?.vendor_name || row?.merchant_name || row?.store_name || row?.business_name || "").trim() ||
      "Restaurant"
    );
  }

  if (channel === "grocery") {
    if (outletId && groceryMap[outletId]) return groceryMap[outletId];
    return (
      String(row?.grocery_name || row?.shop_name || row?.mart_name || row?.store_name || row?.business_name || "").trim() ||
      "Grocery Store"
    );
  }

  return (
    String(row?.merchant_name || row?.store_name || row?.business_name || row?.restaurant_name || row?.grocery_name || "").trim() ||
    "Other"
  );
}

function buildRows(
  rawOrders: AnyRow[],
  restaurantMap: Record<string, string>,
  groceryMap: Record<string, string>,
  forcedChannel?: ChannelType
) {
  const rows: RevenueRow[] = [];

  for (const row of rawOrders || []) {
    const amount = pickNumFromCols(row, TOTAL_COLS);
    const created_at = pickDate(row);
    const status = pickStatus(row);
    const channel = forcedChannel || detectChannel(row);
    const outletId = pickOutletId(row, channel);
    const outletName = detectOutletName(row, channel, restaurantMap, groceryMap);
    const paymentMethod = String(getValue(row, PAYMENT_COLS) || "Unknown");
    const customerName = String(getValue(row, CUSTOMER_NAME_COLS) || row?.profiles?.full_name || row?.profiles?.name || "Customer");
    const currency = String(row?.currency || "USD").trim().toUpperCase() || "USD";

    rows.push({
      id: String(row?.id || `${created_at}-${amount}-${Math.random()}`),
      created_at,
      status,
      amount,
      channel,
      outletId,
      outletName,
      paymentMethod,
      customerName,
      currency,
      raw: row,
    });
  }

  return rows;
}

function MiniBarChart({
  title,
  subtitle,
  values,
  labels,
}: {
  title: string;
  subtitle?: string;
  values: number[];
  labels: string[];
}) {
  const max = Math.max(1, ...values);

  return (
    <div
      style={{
        padding: 16,
        borderRadius: 18,
        background: "#FFFFFF",
        border: "1px solid rgba(15, 23, 42, 0.10)",
        boxShadow: "0 14px 36px rgba(15, 23, 42, 0.08)",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 900, color: "#0F172A" }}>{title}</div>
      {subtitle ? <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>{subtitle}</div> : null}

      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", marginTop: 14, height: 150 }}>
        {values.map((v, i) => {
          const h = Math.max(8, Math.round((v / max) * 140));
          return (
            <div key={i} style={{ flex: 1, minWidth: 20, textAlign: "center" }}>
              <div
                title={`${labels[i]}: ${v}`}
                style={{
                  height: h,
                  borderRadius: 12,
                  background: "linear-gradient(180deg, rgba(255,140,0,0.95), rgba(255,220,160,0.95))",
                  border: "1px solid rgba(255,140,0,0.25)",
                  boxShadow: "0 10px 26px rgba(255,140,0,0.12)",
                }}
              />
              <div style={{ marginTop: 8, fontSize: 11, opacity: 0.7 }}>{labels[i]}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AdminRevenuePage() {
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");

  const [range, setRange] = useState<DateRangeType>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [channelFilter, setChannelFilter] = useState<ChannelType>("all");
  const [statusFilter, setStatusFilter] = useState<"completed" | "all" | "cancelled">("completed");
  const [outletFilter, setOutletFilter] = useState("all");
  const [searchText, setSearchText] = useState("");

  const [rows, setRows] = useState<RevenueRow[]>([]);
  const [restaurantMap, setRestaurantMap] = useState<Record<string, string>>({});
  const [groceryMap, setGroceryMap] = useState<Record<string, string>>({});
  const [sourceNote, setSourceNote] = useState("");
  const [defaultCurrency, setDefaultCurrency] = useState("USD");
  const [platformPercents, setPlatformPercents] = useState({ commission: 10, gst: 5 });

  function load() {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setErrorText("");

        let ordersData: AnyRow[] = [];
        let ordersErrorMessage = "";
        let ordersSelectUsed = SAFE_ORDER_SELECT_BASE.join(",");
        let commissionPercent = 10;
        let gstPercent = 5;

        for (const selectCols of ORDER_SELECT_ATTEMPTS) {
          const res = await supabase.from("orders").select(selectCols).order("created_at", { ascending: false }).limit(5000);
          if (!res.error && Array.isArray(res.data)) {
            ordersData = res.data as AnyRow[];
            ordersSelectUsed = selectCols;
            ordersErrorMessage = "";
            break;
          }
          ordersErrorMessage = res.error?.message || "Failed to read orders table.";
        }

        try {
          const platformRes = await supabase
            .from("system_settings")
            .select("value_json, commission_percent, gst_percent")
            .eq("key", "platform")
            .maybeSingle();
          if (!platformRes.error && platformRes.data) {
            const vj = (platformRes.data as AnyRow)?.value_json || {};
            const c = Number(vj?.commission_percent ?? (platformRes.data as AnyRow)?.commission_percent);
            const g = Number(vj?.gst_percent ?? (platformRes.data as AnyRow)?.gst_percent);
            if (Number.isFinite(c) && c >= 0) commissionPercent = c;
            if (Number.isFinite(g) && g >= 0) gstPercent = g;
          }
        } catch {}

        const [groceryOrdersRes, groceryStoresRes, groceryCategoriesRes, groceryItemsRes, grocerySubcategoriesRes] = await Promise.allSettled([
          supabase.from("grocery_orders").select("*").limit(5000),
          supabase.from("grocery_stores").select("id,name").limit(2000),
          supabase.from("grocery_categories").select("store_id").limit(5000),
          supabase.from("grocery_items").select("store_id").limit(5000),
          supabase.from("grocery_subcategories").select("store_id").limit(5000),
        ]);

        const groceryOrdersData = groceryOrdersRes.status === "fulfilled" && Array.isArray(groceryOrdersRes.value.data) ? groceryOrdersRes.value.data : [];
        const groceryStoreRows = groceryStoresRes.status === "fulfilled" && Array.isArray(groceryStoresRes.value.data) ? groceryStoresRes.value.data : [];
        const groceryCategoryRows = groceryCategoriesRes.status === "fulfilled" && Array.isArray(groceryCategoriesRes.value.data) ? groceryCategoriesRes.value.data : [];
        const groceryItemRows = groceryItemsRes.status === "fulfilled" && Array.isArray(groceryItemsRes.value.data) ? groceryItemsRes.value.data : [];
        const grocerySubcategoryRows = grocerySubcategoriesRes.status === "fulfilled" && Array.isArray(grocerySubcategoriesRes.value.data) ? grocerySubcategoriesRes.value.data : [];

        const restMap: Record<string, string> = {};
        const groMap: Record<string, string> = {};
        let restaurantErrorMessage = "";

        const restaurantSelectAttempts = [
          "id,name",
          "id,business_name",
          "id,store_name",
          "id,restaurant_name",
          "id",
        ];

        for (const selectCols of restaurantSelectAttempts) {
          const restRes = await supabase.from("restaurants").select(selectCols).limit(2000);
          if (!restRes.error && Array.isArray(restRes.data)) {
            const restaurantRows = restRes.data as AnyRow[];
            for (const r of restaurantRows) {
              const restaurantId = String(r?.id || "").trim();
              const name = String(
                getValue(r, ["name", "business_name", "store_name", "restaurant_name"]) ||
                  `Restaurant ${restaurantId.slice(0, 8)}`
              );
              if (restaurantId) restMap[restaurantId] = name;
            }
            restaurantErrorMessage = "";
            break;
          }
          restaurantErrorMessage = restRes.error?.message || "Failed to read restaurants table.";
        }

        for (const row of groceryStoreRows as AnyRow[]) {
          const storeId = String(row?.id || row?.store_id || "").trim();
          const storeName = String(
            row?.name || row?.business_name || row?.store_name || row?.shop_name || row?.mart_name || "Grocery Store"
          ).trim() || "Grocery Store";
          if (storeId) groMap[storeId] = storeName;
        }

        for (const row of groceryOrdersData as AnyRow[]) {
          const storeId = String(row?.store_id || row?.grocery_store_id || row?.shop_id || row?.mart_id || row?.id || "").trim();
          const storeName = String(
            row?.store_name || row?.grocery_name || row?.shop_name || row?.mart_name || row?.business_name || row?.name || "Grocery Store"
          ).trim() || "Grocery Store";
          if (storeId) groMap[storeId] = storeName;
        }

        for (const row of [...groceryCategoryRows, ...groceryItemRows, ...grocerySubcategoryRows]) {
          const storeId = String(row?.store_id || "").trim();
          if (storeId && !groMap[storeId]) groMap[storeId] = "Grocery Store";
        }

        if (!alive) return;

        const restaurantRows = buildRows(ordersData, restMap, groMap);
        const groceryRows = buildRows(groceryOrdersData, restMap, groMap, "grocery");
        const built = [...restaurantRows, ...groceryRows];

        const currencyCounts: Record<string, number> = {};
        for (const row of built) {
          const c = String(row.currency || "USD").toUpperCase();
          currencyCounts[c] = (currencyCounts[c] || 0) + 1;
        }
        const pickedCurrency = Object.entries(currencyCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "USD";

        const supportsCommissionAmount = ordersSelectUsed.includes("commission_amount");
        const supportsGstAmount = ordersSelectUsed.includes("gst_amount");

        setDefaultCurrency(pickedCurrency);
        setRestaurantMap(restMap);
        setGroceryMap(groMap);
        setRows(built);
        setPlatformPercents({ commission: commissionPercent, gst: gstPercent });
        setSourceNote(
          `Revenue sources: orders → restaurants, grocery_orders → groceries. Outlet dropdown still loads all restaurants from DB and known grocery stores. Financial cards sum directly from raw filtered rows. Orders columns in use: platform_fee${supportsCommissionAmount ? " / commission_amount" : ""}, tax_amount${supportsGstAmount ? " / gst_amount" : ""}, tip_amount, delivery_fee, delivery_payout, discount_amount, subtotal_amount, total_amount. Grocery_orders: tip_amount, delivery_fee, delivery_payout, total_amount. Display currency defaults to ${pickedCurrency}.`
        );

        const errors: string[] = [];
        if (ordersErrorMessage) errors.push(`orders: ${ordersErrorMessage}`);
        if (groceryOrdersRes.status === "fulfilled" && groceryOrdersRes.value.error) errors.push(`grocery_orders: ${groceryOrdersRes.value.error.message}`);
        if (groceryStoresRes.status === "fulfilled" && groceryStoresRes.value.error) errors.push(`grocery_stores: ${groceryStoresRes.value.error.message}`);
        if (restaurantErrorMessage) errors.push(`restaurants: ${restaurantErrorMessage}`);
        if (groceryCategoriesRes.status === "fulfilled" && groceryCategoriesRes.value.error) errors.push(`grocery_categories: ${groceryCategoriesRes.value.error.message}`);
        if (groceryItemsRes.status === "fulfilled" && groceryItemsRes.value.error) errors.push(`grocery_items: ${groceryItemsRes.value.error.message}`);
        if (grocerySubcategoriesRes.status === "fulfilled" && grocerySubcategoriesRes.value.error) errors.push(`grocery_subcategories: ${grocerySubcategoriesRes.value.error.message}`);
        if (groceryOrdersRes.status === "rejected") errors.push(`grocery_orders: ${String(groceryOrdersRes.reason)}`);
        if (groceryStoresRes.status === "rejected") errors.push(`grocery_stores: ${String(groceryStoresRes.reason)}`);
        if (groceryCategoriesRes.status === "rejected") errors.push(`grocery_categories: ${String(groceryCategoriesRes.reason)}`);
        if (groceryItemsRes.status === "rejected") errors.push(`grocery_items: ${String(groceryItemsRes.reason)}`);
        if (grocerySubcategoriesRes.status === "rejected") errors.push(`grocery_subcategories: ${String(grocerySubcategoriesRes.reason)}`);

        if (errors.length) {
          setErrorText(errors.join(" | "));
        } else if (!built.length) {
          setErrorText("No revenue rows found yet in orders or grocery_orders for the selected filters.");
        }
      } catch (e: any) {
        if (!alive) return;
        setErrorText(e?.message || "Failed to load revenue page.");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredRows = useMemo(() => {
    const start = getRangeStart(range, customFrom);
    const end = getRangeEnd(range, customTo);
    const q = normalize(searchText);

    return rows.filter((row) => {
      const created = row.created_at ? new Date(row.created_at) : null;
      const status = normalize(row.status);
      const hay = normalize(`${row.outletName} ${row.customerName} ${row.paymentMethod} ${row.id}`);

      // allow rows without date when "All Time" is selected
      if (range !== "all") {
        if (!created || Number.isNaN(created.getTime())) return false;
        if (created < start || created > end) return false;
      }
      if (channelFilter !== "all" && row.channel !== channelFilter) return false;

      if (statusFilter === "completed" && !COMPLETED_STATUSES.includes(status)) return false;
      if (statusFilter === "cancelled" && !CANCELLED_STATUSES.includes(status)) return false;

      if (outletFilter !== "all") {
        const outletKey = makeOutletFilterKey(row.channel, row.outletId, row.outletName);
        if (outletKey !== outletFilter) return false;
      }

      if (q && !hay.includes(q)) return false;

      return true;
    });
  }, [rows, range, customFrom, customTo, channelFilter, statusFilter, outletFilter, searchText]);

  const displayCurrency = useMemo(() => {
    const counts: Record<string, number> = {};
    const source = filteredRows.length ? filteredRows : rows;
    for (const row of source) {
      const c = String(row.currency || defaultCurrency || "USD").toUpperCase();
      counts[c] = (counts[c] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || defaultCurrency || "USD";
  }, [filteredRows, rows, defaultCurrency]);

  const summary = useMemo(() => {
    let completedRevenue = 0;
    let cancelledRevenue = 0;
    let revenueOrders = 0;
    let completedOrders = 0;
    let cancelledOrders = 0;
    let restaurantRevenue = 0;
    let groceryRevenue = 0;
    let otherRevenue = 0;
    let platformFeeRevenue = 0;
    let deliveryFeeRevenue = 0;
    let driverPayouts = 0;
    let tipRevenue = 0;
    let taxRevenue = 0;
    let discountValue = 0;
    let subtotalRevenue = 0;

    const payMap: Record<string, number> = {};
    const outletMap: Record<string, { name: string; channel: string; revenue: number; orders: number }> = {};

    for (const row of filteredRows) {
      const status = normalize(row.status);
      const raw = row.raw || {};
      const rowAmount = pickNumFromCols(raw, TOTAL_COLS) || toNum(row.amount);
      const storedPlatformFee = pickNumFromCols(raw, PLATFORM_FEE_COLS);
      const storedTaxAmount = pickNumFromCols(raw, TAX_COLS);
      const rowTipAmount = pickNumFromCols(raw, TIP_COLS);
      const rowDeliveryFee = pickNumFromCols(raw, DELIVERY_FEE_COLS);
      const payoutFromCols = pickNumFromCols(raw, DELIVERY_PAYOUT_COLS);
      const rowDeliveryPayout = payoutFromCols > 0 ? payoutFromCols : rowDeliveryFee + rowTipAmount;
      const rowDiscountAmount = pickNumFromCols(raw, DISCOUNT_COLS);
      const rowSubtotalAmount = pickNumFromCols(raw, SUBTOTAL_COLS);
      const feeBase = rowSubtotalAmount > 0 ? rowSubtotalAmount : Math.max(0, rowAmount);
      const rowPlatformFee =
        storedPlatformFee > 0 || row.channel !== "grocery"
          ? storedPlatformFee
          : Math.round(feeBase * (Math.max(0, Number(platformPercents.commission || 0)) / 100));
      const rowTaxAmount =
        storedTaxAmount > 0 || row.channel !== "grocery"
          ? storedTaxAmount
          : Math.round(feeBase * (Math.max(0, Number(platformPercents.gst || 0)) / 100));

      platformFeeRevenue += rowPlatformFee;
      deliveryFeeRevenue += rowDeliveryFee;
      driverPayouts += rowDeliveryPayout;
      tipRevenue += rowTipAmount;
      taxRevenue += rowTaxAmount;
      discountValue += rowDiscountAmount;
      subtotalRevenue += rowSubtotalAmount;

      const includeInRevenue =
        statusFilter === "all" ? !CANCELLED_STATUSES.includes(status) : COMPLETED_STATUSES.includes(status);

      if (includeInRevenue) {
        completedRevenue += rowAmount;
        revenueOrders += 1;

        if (row.channel === "restaurant") restaurantRevenue += rowAmount;
        else if (row.channel === "grocery") groceryRevenue += rowAmount;
        else otherRevenue += rowAmount;

        payMap[row.paymentMethod] = (payMap[row.paymentMethod] || 0) + rowAmount;

        const key = makeOutletFilterKey(row.channel, row.outletId, row.outletName);
        if (!outletMap[key]) {
          outletMap[key] = { name: row.outletName, channel: row.channel, revenue: 0, orders: 0 };
        }
        outletMap[key].revenue += rowAmount;
        outletMap[key].orders += 1;
      }

      if (COMPLETED_STATUSES.includes(status)) {
        completedOrders += 1;
      }

      if (CANCELLED_STATUSES.includes(status)) {
        cancelledRevenue += rowAmount;
        cancelledOrders += 1;
      }
    }

    const avgOrderValue = revenueOrders ? completedRevenue / revenueOrders : 0;
    const completionRate = filteredRows.length ? Math.round((completedOrders / filteredRows.length) * 100) : 0;
    const netPlatformProfit = platformFeeRevenue + deliveryFeeRevenue - driverPayouts;

    const topOutlets = Object.entries(outletMap)
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);

    const paymentBreakdown = Object.entries(payMap)
      .map(([name, revenue]) => ({ name, revenue }))
      .sort((a, b) => b.revenue - a.revenue);

    return {
      completedRevenue,
      cancelledRevenue,
      completedOrders,
      cancelledOrders,
      totalOrders: filteredRows.length,
      restaurantRevenue,
      groceryRevenue,
      otherRevenue,
      platformFeeRevenue,
      deliveryFeeRevenue,
      driverPayouts,
      tipRevenue,
      taxRevenue,
      discountValue,
      subtotalRevenue,
      netPlatformProfit,
      avgOrderValue,
      completionRate,
      topOutlets,
      paymentBreakdown,
    };
  }, [filteredRows, statusFilter, platformPercents]);

  const chartData = useMemo(() => {
    const start = getRangeStart(range, customFrom);
    const end = getRangeEnd(range, customTo);
    const allDays: Date[] = [];
    const loop = new Date(start);
    loop.setHours(0, 0, 0, 0);
    while (loop <= end && allDays.length < 45) {
      allDays.push(new Date(loop));
      loop.setDate(loop.getDate() + 1);
    }

    const keys = allDays.map(dayKey);
    const labels = allDays.map(dayLabel);
    const revenueByDay: Record<string, number> = {};
    const ordersByDay: Record<string, number> = {};

    for (const k of keys) {
      revenueByDay[k] = 0;
      ordersByDay[k] = 0;
    }

    for (const row of filteredRows) {
      const status = normalize(row.status);
      if (!COMPLETED_STATUSES.includes(status)) continue;
      const d = new Date(row.created_at);
      if (Number.isNaN(d.getTime())) continue;
      const k = dayKey(d);
      if (revenueByDay[k] !== undefined) {
        revenueByDay[k] += row.amount;
        ordersByDay[k] += 1;
      }
    }

    return {
      labels,
      revenueValues: keys.map((k) => Math.round(revenueByDay[k] || 0)),
      orderValues: keys.map((k) => ordersByDay[k] || 0),
    };
  }, [filteredRows, range, customFrom, customTo]);

  const outletOptions = useMemo(() => {
    const seen: Record<string, { key: string; label: string }> = {};

    if (channelFilter === "all" || channelFilter === "restaurant") {
      for (const [id, name] of Object.entries(restaurantMap)) {
        const key = makeOutletFilterKey("restaurant", id, name || "Restaurant");
        if (!seen[key]) seen[key] = { key, label: `Restaurant • ${name || "Restaurant"}` };
      }
    }

    if (channelFilter === "all" || channelFilter === "grocery") {
      for (const [id, name] of Object.entries(groceryMap)) {
        const key = makeOutletFilterKey("grocery", id, name || "Grocery Store");
        if (!seen[key]) seen[key] = { key, label: `Grocery • ${name || "Grocery Store"}` };
      }
    }

    for (const row of rows) {
      if (channelFilter !== "all" && row.channel !== channelFilter) continue;
      const key = makeOutletFilterKey(row.channel, row.outletId, row.outletName);
      if (!seen[key]) {
        const prefix = row.channel === "restaurant" ? "Restaurant" : row.channel === "grocery" ? "Grocery" : "Other";
        seen[key] = { key, label: `${prefix} • ${row.outletName}` };
      }
    }

    return Object.values(seen).sort((a, b) => a.label.localeCompare(b.label));
  }, [rows, restaurantMap, groceryMap, channelFilter]);

  useEffect(() => {
    if (outletFilter === "all") return;
    const exists = outletOptions.some((o) => o.key === outletFilter);
    if (!exists) setOutletFilter("all");
  }, [outletFilter, outletOptions]);

  const grid: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(12, 1fr)",
    gap: 14,
  };

  const card = (span: number): React.CSSProperties => ({
    gridColumn: `span ${span}`,
    padding: 16,
    borderRadius: 18,
    background: "#FFFFFF",
    border: "1px solid rgba(15, 23, 42, 0.10)",
    boxShadow: "0 14px 36px rgba(15, 23, 42, 0.08)",
  });

  const title: React.CSSProperties = { fontSize: 12, opacity: 0.72, fontWeight: 800 };
  const value: React.CSSProperties = { fontSize: 28, fontWeight: 950, marginTop: 6, letterSpacing: -0.3 };

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

  const inputBase: React.CSSProperties = {
    padding: "11px 12px",
    borderRadius: 14,
    background: "#FFFFFF",
    border: "1px solid rgba(15, 23, 42, 0.12)",
    color: "#0B1220",
    fontWeight: 700,
    outline: "none",
    minWidth: 160,
  };

  const rowsForTable = filteredRows.slice(0, 20);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 950, letterSpacing: -0.3 }}>Revenue</div>
          <div style={{ fontSize: 13, opacity: 0.75, marginTop: 4, lineHeight: 1.5 }}>
            Pro revenue overview with filters, channel split, outlet ranking, payment breakdown, financial fee tracking, and recent order revenue tracking.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={() => load()} style={btnPrimary}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>

          <Link href="/admin/orders" style={btnGhost}>
            📦 Orders
          </Link>

          <Link href="/admin" style={btnGhost}>
            ← Dashboard
          </Link>
        </div>
      </div>

      <div style={{ ...card(12), marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 900 }}>Filters</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
          <select value={range} onChange={(e) => setRange(e.target.value as DateRangeType)} style={inputBase}>
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="this_month">This Month</option>
            <option value="custom">Custom Range</option>
          </select>

          {range === "custom" ? (
            <>
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} style={inputBase} />
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} style={inputBase} />
            </>
          ) : null}

          <select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value as ChannelType)} style={inputBase}>
            <option value="all">All Categories</option>
            <option value="restaurant">Restaurants</option>
            <option value="grocery">Groceries</option>
            <option value="other">Other</option>
          </select>

          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} style={inputBase}>
            <option value="completed">Completed Revenue</option>
            <option value="all">All Statuses</option>
            <option value="cancelled">Cancelled / Failed</option>
          </select>

          <select value={outletFilter} onChange={(e) => setOutletFilter(e.target.value)} style={{ ...inputBase, minWidth: 220 }}>
            <option value="all">All Stores / Restaurants</option>
            {outletOptions.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>

          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search outlet / customer / payment..."
            style={{ ...inputBase, minWidth: 260, flex: 1 }}
          />
        </div>

        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.72 }}>{sourceNote}</div>
        {errorText ? <div style={{ marginTop: 8, fontSize: 12, color: "#B42318", fontWeight: 700 }}>{errorText}</div> : null}
      </div>

      <div style={grid}>
        <div style={card(3)}>
          <div style={title}>Total Revenue</div>
          <div style={value}>{formatMoney(summary.completedRevenue, displayCurrency)}</div>
          <div style={{ fontSize: 12, opacity: 0.65, marginTop: 6 }}>Completed revenue in current filters</div>
        </div>

        <div style={card(3)}>
          <div style={title}>Completed Orders</div>
          <div style={value}>{summary.completedOrders}</div>
          <div style={{ fontSize: 12, opacity: 0.65, marginTop: 6 }}>Delivered / completed / paid</div>
        </div>

        <div style={card(3)}>
          <div style={title}>Average Order Value</div>
          <div style={value}>{formatMoney(summary.avgOrderValue, displayCurrency)}</div>
          <div style={{ fontSize: 12, opacity: 0.65, marginTop: 6 }}>Completed revenue ÷ completed orders</div>
        </div>

        <div style={card(3)}>
          <div style={title}>Completion Rate</div>
          <div style={value}>{summary.completionRate}%</div>
          <div style={{ fontSize: 12, opacity: 0.65, marginTop: 6 }}>Within the filtered result set</div>
        </div>

        <div style={card(4)}>
          <div style={title}>Restaurant Revenue</div>
          <div style={value}>{formatMoney(summary.restaurantRevenue, displayCurrency)}</div>
          <div style={{ fontSize: 12, opacity: 0.65, marginTop: 6 }}>Completed restaurant orders only</div>
        </div>

        <div style={card(4)}>
          <div style={title}>Grocery Revenue</div>
          <div style={value}>{formatMoney(summary.groceryRevenue, displayCurrency)}</div>
          <div style={{ fontSize: 12, opacity: 0.65, marginTop: 6 }}>Completed grocery orders only</div>
        </div>

        <div style={card(4)}>
          <div style={title}>Cancelled / Failed Value</div>
          <div style={value}>{formatMoney(summary.cancelledRevenue, displayCurrency)}</div>
          <div style={{ fontSize: 12, opacity: 0.65, marginTop: 6 }}>Rejected / cancelled / refunded rows</div>
        </div>

        <div style={card(3)}>
          <div style={title}>Platform Fee Earned</div>
          <div style={value}>{formatMoney(summary.platformFeeRevenue, displayCurrency)}</div>
          <div style={{ fontSize: 12, opacity: 0.65, marginTop: 6 }}>From stored platform/service fee; grocery fallback uses platform % setting when missing</div>
        </div>

        <div style={card(3)}>
          <div style={title}>Delivery Fees Collected</div>
          <div style={value}>{formatMoney(summary.deliveryFeeRevenue, displayCurrency)}</div>
          <div style={{ fontSize: 12, opacity: 0.65, marginTop: 6 }}>From delivery_fee on completed rows</div>
        </div>

        <div style={card(3)}>
          <div style={title}>Driver Payouts</div>
          <div style={value}>{formatMoney(summary.driverPayouts, displayCurrency)}</div>
          <div style={{ fontSize: 12, opacity: 0.65, marginTop: 6 }}>From delivery_payout on completed rows</div>
        </div>

        <div style={card(3)}>
          <div style={title}>Net Platform Profit</div>
          <div style={value}>{formatMoney(summary.netPlatformProfit, displayCurrency)}</div>
          <div style={{ fontSize: 12, opacity: 0.65, marginTop: 6 }}>Platform fee + delivery fees − driver payouts</div>
        </div>

        <div style={card(3)}>
          <div style={title}>Tax Collected</div>
          <div style={value}>{formatMoney(summary.taxRevenue, displayCurrency)}</div>
          <div style={{ fontSize: 12, opacity: 0.65, marginTop: 6 }}>From stored tax/gst; grocery fallback uses gst % setting when missing</div>
        </div>

        <div style={card(3)}>
          <div style={title}>Tips Collected</div>
          <div style={value}>{formatMoney(summary.tipRevenue, displayCurrency)}</div>
          <div style={{ fontSize: 12, opacity: 0.65, marginTop: 6 }}>From tip_amount on completed rows</div>
        </div>

        <div style={card(3)}>
          <div style={title}>Discount Value</div>
          <div style={value}>{formatMoney(summary.discountValue, displayCurrency)}</div>
          <div style={{ fontSize: 12, opacity: 0.65, marginTop: 6 }}>From discount fields on filtered rows</div>
        </div>

        <div style={card(3)}>
          <div style={title}>Subtotal Before Tax/Fees</div>
          <div style={value}>{formatMoney(summary.subtotalRevenue, displayCurrency)}</div>
          <div style={{ fontSize: 12, opacity: 0.65, marginTop: 6 }}>From subtotal fields on filtered rows</div>
        </div>

        <div style={{ gridColumn: "span 6" }}>
          <MiniBarChart
            title="Revenue Trend"
            subtitle="Daily completed revenue in selected range"
            values={chartData.revenueValues.length ? chartData.revenueValues : [0]}
            labels={chartData.labels.length ? chartData.labels : [""]}
          />
        </div>

        <div style={{ gridColumn: "span 6" }}>
          <MiniBarChart
            title="Order Trend"
            subtitle="Daily completed revenue orders in selected range"
            values={chartData.orderValues.length ? chartData.orderValues : [0]}
            labels={chartData.labels.length ? chartData.labels : [""]}
          />
        </div>

        <div style={card(6)}>
          <div style={{ fontSize: 13, fontWeight: 900 }}>Top Revenue Outlets</div>
          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {summary.topOutlets.length ? (
              summary.topOutlets.map((item, index) => (
                <div
                  key={item.key}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: 12,
                    borderRadius: 14,
                    background: "rgba(255,255,255,0.80)",
                    border: "1px solid rgba(15, 23, 42, 0.08)",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 12, opacity: 0.65, fontWeight: 800 }}>
                      #{index + 1} • {item.channel}
                    </div>
                    <div style={{ fontWeight: 900, marginTop: 4 }}>{item.name}</div>
                    <div style={{ fontSize: 12, opacity: 0.68, marginTop: 4 }}>{item.orders} orders</div>
                  </div>
                  <div style={{ fontWeight: 950, fontSize: 18 }}>{formatMoney(item.revenue, displayCurrency)}</div>
                </div>
              ))
            ) : (
              <div style={{ fontSize: 13, opacity: 0.7 }}>No outlet data found in current filters.</div>
            )}
          </div>
        </div>

        <div style={card(6)}>
          <div style={{ fontSize: 13, fontWeight: 900 }}>Payment Breakdown</div>
          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {summary.paymentBreakdown.length ? (
              summary.paymentBreakdown.slice(0, 8).map((item) => (
                <div
                  key={item.name}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: 12,
                    borderRadius: 14,
                    background: "rgba(255,255,255,0.80)",
                    border: "1px solid rgba(15, 23, 42, 0.08)",
                  }}
                >
                  <div style={{ fontWeight: 800 }}>{item.name}</div>
                  <div style={{ fontWeight: 950 }}>{formatMoney(item.revenue, displayCurrency)}</div>
                </div>
              ))
            ) : (
              <div style={{ fontSize: 13, opacity: 0.7 }}>No payment method data available.</div>
            )}
          </div>
        </div>

        <div style={card(12)}>
          <div style={{ fontSize: 13, fontWeight: 900 }}>Recent Revenue Orders</div>
          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
              <thead>
                <tr>
                  {["Date", "Order ID", "Category", "Outlet", "Customer", "Payment", "Status", "Amount"].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: "left",
                        fontSize: 12,
                        padding: "12px 10px",
                        borderBottom: "1px solid rgba(15, 23, 42, 0.08)",
                        opacity: 0.72,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rowsForTable.length ? (
                  rowsForTable.map((row) => (
                    <tr key={row.id}>
                      <td style={{ padding: "12px 10px", borderBottom: "1px solid rgba(15, 23, 42, 0.06)", fontSize: 13 }}>
                        {safeDateText(row.created_at)}
                      </td>
                      <td style={{ padding: "12px 10px", borderBottom: "1px solid rgba(15, 23, 42, 0.06)", fontSize: 13, fontWeight: 800 }}>
                        {row.id}
                      </td>
                      <td style={{ padding: "12px 10px", borderBottom: "1px solid rgba(15, 23, 42, 0.06)", fontSize: 13, textTransform: "capitalize" }}>
                        {row.channel}
                      </td>
                      <td style={{ padding: "12px 10px", borderBottom: "1px solid rgba(15, 23, 42, 0.06)", fontSize: 13 }}>
                        {row.outletName}
                      </td>
                      <td style={{ padding: "12px 10px", borderBottom: "1px solid rgba(15, 23, 42, 0.06)", fontSize: 13 }}>
                        {row.customerName}
                      </td>
                      <td style={{ padding: "12px 10px", borderBottom: "1px solid rgba(15, 23, 42, 0.06)", fontSize: 13 }}>
                        {row.paymentMethod}
                      </td>
                      <td style={{ padding: "12px 10px", borderBottom: "1px solid rgba(15, 23, 42, 0.06)", fontSize: 13 }}>
                        {row.status || "unknown"}
                      </td>
                      <td style={{ padding: "12px 10px", borderBottom: "1px solid rgba(15, 23, 42, 0.06)", fontSize: 13, fontWeight: 900 }}>
                        {formatMoney2(row.amount, row.currency || displayCurrency)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} style={{ padding: 18, fontSize: 13, opacity: 0.7 }}>
                      No rows found for current revenue filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
