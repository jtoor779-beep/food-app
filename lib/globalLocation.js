export const GLOBAL_CITY_KEY = "foodapp_global_city";
export const GLOBAL_LOCATION_EVENT = "foodapp_location_updated";

export function cleanCity(value) {
  return String(value || "").trim();
}

export function readGlobalCity() {
  if (typeof window === "undefined") return "";
  try {
    return cleanCity(window.localStorage.getItem(GLOBAL_CITY_KEY));
  } catch {
    return "";
  }
}

export function writeGlobalCity(value) {
  if (typeof window === "undefined") return "";
  const city = cleanCity(value);
  try {
    if (city) {
      window.localStorage.setItem(GLOBAL_CITY_KEY, city);
    } else {
      window.localStorage.removeItem(GLOBAL_CITY_KEY);
    }
  } catch {}

  try {
    window.dispatchEvent(new CustomEvent(GLOBAL_LOCATION_EVENT, { detail: { city } }));
  } catch {}

  return city;
}

export function subscribeGlobalCity(onChange) {
  if (typeof window === "undefined" || typeof onChange !== "function") return () => {};

  const onStorage = (e) => {
    if (e?.key && e.key !== GLOBAL_CITY_KEY) return;
    onChange(readGlobalCity());
  };

  const onCustom = (e) => {
    const city = cleanCity(e?.detail?.city);
    onChange(city);
  };

  window.addEventListener("storage", onStorage);
  window.addEventListener(GLOBAL_LOCATION_EVENT, onCustom);

  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(GLOBAL_LOCATION_EVENT, onCustom);
  };
}
