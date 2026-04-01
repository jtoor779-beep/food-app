import supabase from "@/lib/supabase";

export const APP_CURRENCY_STORAGE_KEY = "foodapp_currency";
export const DEFAULT_APP_CURRENCY = "USD";

export function normalizeAppCurrency(value, fallback = DEFAULT_APP_CURRENCY) {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "USD" || normalized === "INR") return normalized;
  return String(fallback || DEFAULT_APP_CURRENCY).trim().toUpperCase() || DEFAULT_APP_CURRENCY;
}

export function formatAppMoney(value, currency = DEFAULT_APP_CURRENCY) {
  const amount = Number(value || 0);
  const normalizedCurrency = normalizeAppCurrency(currency);
  const fractionDigits = normalizedCurrency === "INR" ? 0 : 2;

  if (!Number.isFinite(amount)) {
    return normalizedCurrency === "USD" ? "$0.00" : "₹0";
  }

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: normalizedCurrency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(amount);
  } catch {
    if (normalizedCurrency === "USD") {
      return `$${amount.toFixed(2)}`;
    }
    return `₹${Math.round(amount)}`;
  }
}

export function getStoredAppCurrency(fallback = DEFAULT_APP_CURRENCY) {
  if (typeof window === "undefined") return normalizeAppCurrency(fallback);
  try {
    return normalizeAppCurrency(localStorage.getItem(APP_CURRENCY_STORAGE_KEY), fallback);
  } catch {
    return normalizeAppCurrency(fallback);
  }
}

export async function fetchAppCurrencyFromDB(fallback = DEFAULT_APP_CURRENCY) {
  try {
    const { data, error } = await supabase
      .from("system_settings")
      .select("key, default_currency, value_json, updated_at")
      .order("updated_at", { ascending: false })
      .limit(10);

    if (error) return normalizeAppCurrency(fallback);

    const rows = Array.isArray(data) ? data : [];
    if (!rows.length) return normalizeAppCurrency(fallback);

    const globalRow = rows.find((row) => String(row?.key || "").toLowerCase() === "global");
    const row = globalRow || rows[0];
    return normalizeAppCurrency(row?.default_currency || row?.value_json?.default_currency, fallback);
  } catch {
    return normalizeAppCurrency(fallback);
  }
}

export async function syncAppCurrency(fallback = DEFAULT_APP_CURRENCY) {
  const dbCurrency = await fetchAppCurrencyFromDB(fallback);

  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(APP_CURRENCY_STORAGE_KEY, dbCurrency);
    } catch {
      // ignore storage failures
    }
  }

  return dbCurrency;
}
