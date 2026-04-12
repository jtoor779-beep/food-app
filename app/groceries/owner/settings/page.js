"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import supabase from "@/lib/supabase";
import { getStoreAvailability } from "@/lib/storeAvailability";

/* =========================
   PREMIUM THEME (same vibe)
   ========================= */

const pageBg = {
  minHeight: "calc(100vh - 64px)",
  padding: 20,
  background:
    "radial-gradient(1200px 600px at 20% 10%, rgba(255,140,0,0.22), transparent 62%), radial-gradient(900px 520px at 80% 18%, rgba(80,160,255,0.20), transparent 58%), linear-gradient(180deg, #f7f7fb, #ffffff)",
};

const cardGlass = {
  borderRadius: 18,
  padding: 16,
  background: "rgba(255,255,255,0.78)",
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 12px 36px rgba(0,0,0,0.08)",
  backdropFilter: "blur(10px)",
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
  fontSize: 32,
  fontWeight: 1000,
  color: "#0b1220",
  letterSpacing: -0.2,
};

const subText = {
  marginTop: 8,
  color: "rgba(17,24,39,0.7)",
  fontWeight: 800,
};

const inputStyle = {
  width: "100%",
  padding: "12px 12px",
  borderRadius: 14,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.9)",
  outline: "none",
  fontWeight: 850,
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

const btnDanger = {
  border: "1px solid #dc2626",
  background: "#dc2626",
  color: "#fff",
  fontWeight: 950,
  padding: "10px 14px",
  borderRadius: 999,
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  boxShadow: "0 12px 30px rgba(220,38,38,0.18)",
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

const alertInfo = {
  marginTop: 12,
  padding: 12,
  border: "1px solid rgba(16,185,129,0.25)",
  background: "rgba(236,253,245,0.95)",
  borderRadius: 14,
  color: "#065f46",
  fontWeight: 900,
};

const imgBox = {
  marginTop: 12,
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.75)",
  padding: 12,
};

const imgRow = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
};

const imgPreviewWrap = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
  alignItems: "center",
};

const preview = {
  width: 84,
  height: 84,
  borderRadius: 14,
  objectFit: "cover",
  border: "1px solid rgba(0,0,0,0.10)",
  background: "rgba(0,0,0,0.03)",
};

const tinyNote = {
  marginTop: 8,
  fontSize: 12,
  fontWeight: 850,
  color: "rgba(17,24,39,0.65)",
};

// NEW: location box styling
const locBox = {
  marginTop: 12,
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.75)",
  padding: 12,
};

function normalizeRole(r) {
  return String(r || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function pick(obj, keys, fallback = "") {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null && String(obj[k]).trim() !== "") return obj[k];
  }
  return fallback;
}

function safeName(s) {
  return String(s || "")
    .trim()
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 80);
}

// NEW: numeric helper
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function defaultTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Los_Angeles";
  } catch {
    return "America/Los_Angeles";
  }
}

function toDateTimeInputValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

function buildNextOpeningValue(timeValue) {
  const next = new Date();
  next.setDate(next.getDate() + 1);
  const match = String(timeValue || "").match(/^(\d{1,2}):(\d{2})/);
  if (match) next.setHours(Number(match[1]), Number(match[2]), 0, 0);
  else next.setHours(9, 0, 0, 0);
  const offset = next.getTimezoneOffset();
  const local = new Date(next.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

export default function GroceryOwnerSettingsPage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");

  const [userId, setUserId] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [role, setRole] = useState("");

  const [stores, setStores] = useState([]);
  const [storeId, setStoreId] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  // Create / Edit fields
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  // âœ… NEW: Store location (lat/lng)
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [gettingGps, setGettingGps] = useState(false);
  const [savingLoc, setSavingLoc] = useState(false);
  const [opensAtTime, setOpensAtTime] = useState("");
  const [closesAtTime, setClosesAtTime] = useState("");
  const [timeZone, setTimeZone] = useState(defaultTimeZone());
  const [manualNextOpenAt, setManualNextOpenAt] = useState("");
  const [acceptingOrders, setAcceptingOrders] = useState(true);
  const [savingAvailability, setSavingAvailability] = useState(false);

  const activeStore = useMemo(() => stores.find((s) => s.id === storeId) || null, [stores, storeId]);
  const isCreateMode = showCreate || !activeStore;
  const availability = useMemo(
    () =>
      getStoreAvailability({
        approval_status: activeStore?.approval_status || "approved",
        is_disabled: !!activeStore?.is_disabled,
        accepting_orders: acceptingOrders,
        opens_at_time: opensAtTime || null,
        closes_at_time: closesAtTime || null,
        timezone: timeZone || defaultTimeZone(),
        manual_next_open_at: manualNextOpenAt || null,
      }),
    [acceptingOrders, activeStore?.approval_status, activeStore?.is_disabled, closesAtTime, manualNextOpenAt, opensAtTime, timeZone]
  );

  /* =========================
     NEW: Store Image Upload
     ========================= */
  const BUCKET = "grocery-store-images";
  const fileRef = useRef(null);

  const [uploadingImg, setUploadingImg] = useState(false);
  const [imgFile, setImgFile] = useState(null);
  const [imgPreviewUrl, setImgPreviewUrl] = useState("");

  function resetStoreFields() {
    setName("");
    setCity("");
    setImageUrl("");
    setPhone("");
    setAddress("");
    setLat("");
    setLng("");
    setOpensAtTime("");
    setClosesAtTime("");
    setTimeZone(defaultTimeZone());
    setManualNextOpenAt("");
    setAcceptingOrders(true);
    resetImagePicker();
  }

  function hydrateStoreFields(nextStore) {
    if (!nextStore?.id) {
      resetStoreFields();
      return;
    }

    setStoreId(nextStore.id);
    setName(pick(nextStore, ["name", "store_name"], ""));
    setCity(pick(nextStore, ["city"], ""));
    setImageUrl(pick(nextStore, ["image_url", "logo_url", "banner_url"], ""));
    setPhone(pick(nextStore, ["phone", "store_phone"], ""));
    setAddress(pick(nextStore, ["address", "address_line1", "store_address"], ""));

    const la = pick(nextStore, ["lat", "location_lat", "latitude"], "");
    const lo = pick(nextStore, ["lng", "location_lng", "longitude"], "");
    setLat(la !== "" ? String(la) : "");
    setLng(lo !== "" ? String(lo) : "");
    setOpensAtTime(pick(nextStore, ["opens_at_time"], ""));
    setClosesAtTime(pick(nextStore, ["closes_at_time"], ""));
    setTimeZone(pick(nextStore, ["timezone"], defaultTimeZone()));
    setManualNextOpenAt(toDateTimeInputValue(pick(nextStore, ["manual_next_open_at"], "")));
    setAcceptingOrders(nextStore?.accepting_orders !== false);

    resetImagePicker();
  }

  async function loadOwnerStores(uid) {
    const { data, error } = await supabase
      .from("grocery_stores")
      .select("*")
      .eq("owner_user_id", uid)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }

  function resetImagePicker() {
    setImgFile(null);
    try {
      if (imgPreviewUrl) URL.revokeObjectURL(imgPreviewUrl);
    } catch {}
    setImgPreviewUrl("");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function uploadStoreImage() {
    setErr("");
    setInfo("");

    if (!userId) return setErr("No user session.");
    if (!imgFile) return setErr("Please choose an image first.");

    // For new store (not created yet), still allow upload and use "new-store"
    const sid = storeId || "new-store";
    const fileExt = imgFile.name?.split(".").pop() || "jpg";
    const fileName = safeName(imgFile.name || `store.${fileExt}`);
    const path = `stores/${userId}/${sid}/${Date.now()}_${fileName}`;

    setUploadingImg(true);
    try {
      // Upload
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, imgFile, {
        cacheControl: "3600",
        upsert: true,
        contentType: imgFile.type || "image/jpeg",
      });
      if (upErr) throw upErr;

      // Public URL
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const publicUrl = pub?.publicUrl || "";

      if (!publicUrl) throw new Error("Upload succeeded but public URL was empty.");

      // Put URL in the input field so Save/Create will store it in DB
      setImageUrl(publicUrl);
      setInfo("Store image uploaded. Now click Save Changes or Create Store to save it in the database.");
      resetImagePicker();
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setUploadingImg(false);
    }
  }

  function onPickFile(e) {
    const f = e?.target?.files?.[0];
    if (!f) return;
    setErr("");
    setInfo("");

    // basic validation
    const okType = String(f.type || "").startsWith("image/");
    if (!okType) {
      if (fileRef.current) fileRef.current.value = "";
      return setErr("Please select an image file (jpg/png/webp).");
    }
    const maxMB = 6;
    if (f.size > maxMB * 1024 * 1024) {
      if (fileRef.current) fileRef.current.value = "";
      return setErr(`Image too large. Please use under ${maxMB}MB.`);
    }

    setImgFile(f);

    try {
      if (imgPreviewUrl) URL.revokeObjectURL(imgPreviewUrl);
    } catch {}

    try {
      const localUrl = URL.createObjectURL(f);
      setImgPreviewUrl(localUrl);
    } catch {
      setImgPreviewUrl("");
    }
  }

  // âœ… NEW: Use current GPS (browser)
  async function useMyCurrentGps() {
    setErr("");
    setInfo("");

    if (!navigator?.geolocation) {
      setErr("Geolocation not supported on this device/browser.");
      return;
    }

    setGettingGps(true);
    try {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        });
      });

      const la = pos?.coords?.latitude;
      const lo = pos?.coords?.longitude;
      if (la == null || lo == null) throw new Error("Could not read GPS coordinates.");

      setLat(String(la));
      setLng(String(lo));
      setInfo("GPS captured. Now click Save Location to store it.");
    } catch (e) {
      setErr(e?.message || "Failed to get GPS. Please allow location permission.");
    } finally {
      setGettingGps(false);
    }
  }

  // âœ… NEW: Save lat/lng to DB for existing store
  async function saveLocationToDb() {
    setErr("");
    setInfo("");

    if (!storeId) {
      setErr("Create the store first, then you can save location.");
      return;
    }

    const la = num(lat);
    const lo = num(lng);
    if (la == null || lo == null) {
      setErr("Please set valid latitude & longitude first (Use my current GPS).");
      return;
    }

    setSavingLoc(true);
    try {
      const { data, error } = await supabase
        .from("grocery_stores")
        .update({ lat: la, lng: lo })
        .eq("id", storeId)
        .select("*")
        .single();

      if (error) throw error;

      setStores((prev) => prev.map((s) => (s.id === data.id ? data : s)));
      setInfo("Location saved for your grocery store.");
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setSavingLoc(false);
    }
  }

  async function deleteStore() {
    setErr("");
    setInfo("");

    if (!storeId) {
      setErr("No store found to delete.");
      return;
    }

    const ok = window.confirm(
      "Are you sure you want to delete this grocery store? This action cannot be undone."
    );
    if (!ok) return;

    setDeleting(true);
    try {
      const { error } = await supabase
        .from("grocery_stores")
        .delete()
        .eq("id", storeId)
        .eq("owner_user_id", userId);

      if (error) throw error;

      const list = await loadOwnerStores(userId);
      setStores(list);

      if (list.length > 0) {
        hydrateStoreFields(list[0]);
        setShowCreate(false);
      } else {
        setStoreId("");
        resetStoreFields();
        setShowCreate(true);
      }

      setInfo("Grocery store deleted successfully.");
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setDeleting(false);
    }
  }

  function googleMapsLink() {
    const la = num(lat);
    const lo = num(lng);
    if (la == null || lo == null) return "";
    return `https://www.google.com/maps?q=${la},${lo}`;
  }

  async function loadEverything() {
    setErr("");
    setInfo("");
    setChecking(true);

    try {
      const { data: sess } = await supabase.auth.getSession();
      const user = sess?.session?.user;

      if (!user) {
        router.push("/login");
        return;
      }

      setUserId(user.id);
      setUserEmail(user.email || "");

      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profErr) throw profErr;

      const r = normalizeRole(prof?.role);
      setRole(r);

      if (r !== "grocery_owner") {
        setErr("Access denied: This page is only for Grocery Owners.");
        return;
      }

      const list = await loadOwnerStores(user.id);
      setStores(list);

      if (list.length > 0) {
        const selected = (storeId && list.find((s) => s.id === storeId)) || list[0];
        hydrateStoreFields(selected);
        setShowCreate(false);
      } else {
        setStoreId("");
        resetStoreFields();
        setShowCreate(true);
      }
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    loadEverything();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createStore() {
    setErr("");
    setInfo("");
    setLoading(true);

    try {
      if (!userId) throw new Error("No user session.");
      if (role !== "grocery_owner") throw new Error("Only grocery owners can create a store.");

      if (!name.trim()) throw new Error("Please enter store name.");
      if (!city.trim()) throw new Error("Please enter city.");

      const la = num(lat);
      const lo = num(lng);

      const payload = {
        owner_user_id: userId,
        name: name.trim(),
        city: city.trim(),
        image_url: imageUrl.trim() || null,
        phone: phone.trim() || null,
        address: address.trim() || null,
        lat: la,
        lng: lo,
        approval_status: "pending",
        is_disabled: false,
        accepting_orders: true,
        timezone: defaultTimeZone(),
      };

      const { data, error } = await supabase.from("grocery_stores").insert(payload).select("*").single();
      if (error) throw error;

      const list = await loadOwnerStores(userId);
      setStores(list);
      hydrateStoreFields(data);
      setShowCreate(false);

      const la2 = pick(data, ["lat"], "");
      const lo2 = pick(data, ["lng"], "");
      setLat(la2 !== "" ? String(la2) : lat);
      setLng(lo2 !== "" ? String(lo2) : lng);

      setInfo("Grocery store created. Status: Pending approval.");
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function saveStore() {
    setErr("");
    setInfo("");
    setLoading(true);

    try {
      if (!storeId) throw new Error("No store found to update.");
      if (!name.trim()) throw new Error("Please enter store name.");
      if (!city.trim()) throw new Error("Please enter city.");

      const la = num(lat);
      const lo = num(lng);

      const payload = {
        name: name.trim(),
        city: city.trim(),
        image_url: imageUrl.trim() || null,
        phone: phone.trim() || null,
        address: address.trim() || null,
        lat: la,
        lng: lo,
        timezone: timeZone || defaultTimeZone(),
      };

      const { data, error } = await supabase
        .from("grocery_stores")
        .update(payload)
        .eq("id", storeId)
        .select("*")
        .single();

      if (error) throw error;

      setStores((prev) => prev.map((s) => (s.id === data.id ? data : s)));

      const la2 = pick(data, ["lat"], "");
      const lo2 = pick(data, ["lng"], "");
      setLat(la2 !== "" ? String(la2) : lat);
      setLng(lo2 !== "" ? String(lo2) : lng);

      setInfo("Saved.");
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function saveAvailability() {
    setErr("");
    setInfo("");
    setSavingAvailability(true);

    try {
      if (!storeId) throw new Error("No store found to update.");

      const payload = {
        opens_at_time: opensAtTime || null,
        closes_at_time: closesAtTime || null,
        timezone: timeZone || defaultTimeZone(),
        manual_next_open_at: manualNextOpenAt ? new Date(manualNextOpenAt).toISOString() : null,
      };

      const { data, error } = await supabase
        .from("grocery_stores")
        .update(payload)
        .eq("id", storeId)
        .select("*")
        .single();

      if (error) throw error;

      setStores((prev) => prev.map((store) => (store.id === data.id ? data : store)));
      hydrateStoreFields(data);
      setInfo("Open and close timing saved.");
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setSavingAvailability(false);
    }
  }

  async function setStoreOpenState(nextOpen) {
    setErr("");
    setInfo("");
    setSavingAvailability(true);

    try {
      if (!storeId) throw new Error("No store found to update.");

      if (!nextOpen && !manualNextOpenAt) {
        const suggested = buildNextOpeningValue(opensAtTime);
        setManualNextOpenAt(suggested);
        throw new Error("Set the next opening time, then click Close Until Next Open again.");
      }

      const payload = nextOpen
        ? {
            accepting_orders: true,
            manual_next_open_at: null,
            timezone: timeZone || defaultTimeZone(),
          }
        : {
            accepting_orders: false,
            manual_next_open_at: new Date(manualNextOpenAt).toISOString(),
            timezone: timeZone || defaultTimeZone(),
          };

      const { data, error } = await supabase
        .from("grocery_stores")
        .update(payload)
        .eq("id", storeId)
        .select("*")
        .single();

      if (error) throw error;

      setStores((prev) => prev.map((store) => (store.id === data.id ? data : store)));
      hydrateStoreFields(data);
      setInfo(nextOpen ? "Store is open for customers." : "Store closed until the next opening time.");
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setSavingAvailability(false);
    }
  }

  if (checking) {
    return (
      <main style={pageBg}>
        <div style={{ maxWidth: 980, margin: "0 auto" }}>Checking session...</div>
      </main>
    );
  }

  return (
    <main style={pageBg}>
      <div style={{ Width: "100", margin: "0 auto" }}>
        <div style={heroGlass}>
          <div style={{ minWidth: 260 }}>
            <div style={pill}>Grocery Owner</div>
            <h1 style={heroTitle}>Grocery Store Settings</h1>
            <div style={subText}>Create stores, switch stores, and update each grocery location safely.</div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={loadEverything} style={btnLight}>
              Refresh
            </button>
            <button onClick={() => { setShowCreate(true); setStoreId(""); resetStoreFields(); setErr(""); setInfo(""); }} style={btnDark}>
              + Add Grocery Store
            </button>
            <button onClick={() => router.push("/groceries/owner/dashboard")} style={btnLight}>
              Go to Dashboard
            </button>
            <button onClick={() => router.push("/groceries")} style={btnLight}>
              View Grocery Stores
            </button>
          </div>
        </div>

        <div style={{ ...cardGlass, marginTop: 12 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <span style={pill}>Email: {userEmail || "-"}</span>
            <span style={pill}>Role: {role || "-"}</span>
            <span style={pill}>Store: {activeStore?.name || "Not selected yet"}</span>
            <span style={pill}>Store ID: {storeId || "-"}</span>
            <span style={pill}>Stores: {stores.length}</span>
          </div>

          {err ? <div style={alertErr}>{err}</div> : null}
          {info ? <div style={alertInfo}>{info}</div> : null}
        </div>

        <div style={{ ...cardGlass, marginTop: 12 }}>
          {stores.length > 0 ? (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 1000, color: "#0b1220", fontSize: 14 }}>Switch Grocery Store</div>
              <div style={{ marginTop: 8, color: "rgba(17,24,39,0.68)", fontWeight: 850 }}>
                Choose which grocery store you want to edit, or create a new one.
              </div>
              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "minmax(260px, 1fr) auto auto", gap: 12, alignItems: "end" }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 950, marginBottom: 6, color: "rgba(17,24,39,0.75)" }}>Selected Store</div>
                  <select value={storeId} onChange={(e) => { const nextId = e.target.value; setStoreId(nextId); const nextStore = stores.find((s) => s.id === nextId); hydrateStoreFields(nextStore); setShowCreate(false); }} style={inputStyle}>
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {pick(s, ["name", "store_name"], "Store")} - {pick(s, ["city"], "City")}
                      </option>
                    ))}
                  </select>
                </div>
                <button onClick={() => { const nextStore = stores.find((s) => s.id === storeId); hydrateStoreFields(nextStore); setShowCreate(false); }} style={btnLight}>
                  Edit Selected
                </button>
                <button onClick={() => { setShowCreate(true); setStoreId(""); resetStoreFields(); }} style={btnDark}>
                  Create Another Store
                </button>
              </div>
            </div>
          ) : null}

          {!isCreateMode && activeStore ? (
            <div style={{ ...locBox, marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: 1000, color: "#0b1220", fontSize: 13 }}>Open / close control</div>
                  <div style={{ marginTop: 6, color: "rgba(17,24,39,0.70)", fontWeight: 850, fontSize: 12 }}>
                    Customers can still browse your grocery items while closed, but they cannot add to cart or place orders.
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span
                    style={
                      availability.isOpen
                        ? pill
                        : { ...pill, background: "rgba(254,242,242,0.92)", border: "1px solid #fecaca", color: "#991b1b" }
                    }
                  >
                    {availability.statusLabel}
                  </span>
                  {availability.customerMessage ? <span style={pill}>{availability.customerMessage}</span> : null}
                </div>
              </div>

              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 950, marginBottom: 6, color: "rgba(17,24,39,0.75)" }}>Daily open time</div>
                  <input type="time" value={opensAtTime} onChange={(e) => setOpensAtTime(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 950, marginBottom: 6, color: "rgba(17,24,39,0.75)" }}>Daily close time</div>
                  <input type="time" value={closesAtTime} onChange={(e) => setClosesAtTime(e.target.value)} style={inputStyle} />
                </div>
              </div>

              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 950, marginBottom: 6, color: "rgba(17,24,39,0.75)" }}>Timezone</div>
                  <input value={timeZone} onChange={(e) => setTimeZone(e.target.value)} style={inputStyle} placeholder="America/Los_Angeles" />
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 950, marginBottom: 6, color: "rgba(17,24,39,0.75)" }}>Next opening time after manual close</div>
                  <input type="datetime-local" value={manualNextOpenAt} onChange={(e) => setManualNextOpenAt(e.target.value)} style={inputStyle} />
                </div>
              </div>

              <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button onClick={saveAvailability} style={btnLight} disabled={savingAvailability || loading}>
                  {savingAvailability ? "Saving..." : "Save Hours"}
                </button>
                <button onClick={() => setStoreOpenState(true)} style={btnDark} disabled={savingAvailability || loading}>
                  Open Now
                </button>
                <button onClick={() => setStoreOpenState(false)} style={btnLight} disabled={savingAvailability || loading}>
                  Close Until Next Open
                </button>
              </div>

              <div style={tinyNote}>
                {availability.scheduleText ? `Daily hours: ${availability.scheduleText}. ` : ""}
                {availability.nextOpenText || "Choose the next opening time before closing so customers can see when you will reopen."}
              </div>
            </div>
          ) : null}

          {isCreateMode ? (
            <>
              <div style={{ fontWeight: 1000, color: "#0b1220", fontSize: 14 }}>{stores.length > 0 ? "Create Another Grocery Store" : "Create your Grocery Store"}</div>
              <div style={{ marginTop: 8, color: "rgba(17,24,39,0.68)", fontWeight: 850 }}>
                Add a new grocery store under the same owner account, just like restaurant owners can.
              </div>

              {/* âœ… NEW: Store Location (Create) */}
              <div style={locBox}>
                <div style={{ fontWeight: 1000, color: "#0b1220", fontSize: 13 }}>Store Location</div>
                <div style={{ marginTop: 6, color: "rgba(17,24,39,0.70)", fontWeight: 850, fontSize: 12 }}>
                  Tip: Click <b>Use my current GPS</b>, then create the store. After create, you can also Save Location again.
                </div>

                <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 950, marginBottom: 6, color: "rgba(17,24,39,0.75)" }}>
                      Latitude
                    </div>
                    <input value={lat} onChange={(e) => setLat(e.target.value)} style={inputStyle} placeholder="e.g. 35.3291" />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 950, marginBottom: 6, color: "rgba(17,24,39,0.75)" }}>
                      Longitude
                    </div>
                    <input value={lng} onChange={(e) => setLng(e.target.value)} style={inputStyle} placeholder="e.g. -119.0894" />
                  </div>
                </div>

                <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <button onClick={useMyCurrentGps} style={btnDark} disabled={gettingGps}>
                    {gettingGps ? "Getting GPS..." : "Use my current GPS"}
                  </button>

                  {googleMapsLink() ? (
                    <a href={googleMapsLink()} target="_blank" rel="noreferrer" style={btnLight}>
                      Open in Google Maps
                    </a>
                  ) : (
                    <span style={{ fontSize: 12, fontWeight: 850, color: "rgba(17,24,39,0.65)" }}>
                      Add lat/lng to enable Maps link
                    </span>
                  )}
                </div>
              </div>

              {/* Store Image Upload (Create) */}
              <div style={imgBox}>
                <div style={{ fontWeight: 1000, color: "#0b1220", fontSize: 13 }}>Store Picture</div>
                <div style={imgRow}>
                  <div style={imgPreviewWrap}>
                    {/* Current URL preview if exists */}
                    {imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imageUrl} alt="Store" style={preview} />
                    ) : (
                      <div
                        style={{
                          ...preview,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 900,
                          color: "rgba(17,24,39,0.55)",
                        }}
                      >
                        No Image
                      </div>
                    )}

                    {/* Local selected preview */}
                    {imgPreviewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imgPreviewUrl} alt="Selected" style={preview} />
                    ) : null}

                    <div>
                      <input ref={fileRef} type="file" accept="image/*" onChange={onPickFile} style={{ display: "block" }} />
                      <div style={tinyNote}>
                        Bucket: <b>{BUCKET}</b> - Upload sets the image URL automatically.
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button onClick={uploadStoreImage} style={btnDark} disabled={uploadingImg || !imgFile}>
                      {uploadingImg ? "Uploading..." : "Upload Image"}
                    </button>
                    <button onClick={resetImagePicker} style={btnLight} disabled={uploadingImg && !!imgFile}>
                      Clear
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 950, marginBottom: 6, color: "rgba(17,24,39,0.75)" }}>Store Name</div>
                  <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} placeholder="e.g. Homy Grocery" />
                </div>

                <div>
                  <div style={{ fontSize: 12, fontWeight: 950, marginBottom: 6, color: "rgba(17,24,39,0.75)" }}>City</div>
                  <input value={city} onChange={(e) => setCity(e.target.value)} style={inputStyle} placeholder="e.g. Bakersfield" />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 950, marginBottom: 6, color: "rgba(17,24,39,0.75)" }}>
                    Image URL (auto after upload)
                  </div>
                  <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} style={inputStyle} placeholder="https://..." />
                </div>

                <div>
                  <div style={{ fontSize: 12, fontWeight: 950, marginBottom: 6, color: "rgba(17,24,39,0.75)" }}>Phone (optional)</div>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} placeholder="+1..." />
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 950, marginBottom: 6, color: "rgba(17,24,39,0.75)" }}>Address (optional)</div>
                <input value={address} onChange={(e) => setAddress(e.target.value)} style={inputStyle} placeholder="Street address" />
              </div>

              <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button onClick={createStore} style={btnDark} disabled={loading}>
                  {loading ? "Creating..." : "Create Store"}
                </button>
              </div>

              <div style={{ marginTop: 12, fontSize: 12, fontWeight: 850, color: "rgba(17,24,39,0.7)" }}>
                After creating store, status will be <b>pending</b>. Admin can approve later.
              </div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 1000, color: "#0b1220", fontSize: 14 }}>Update Store Info</div>

              {/* âœ… NEW: Store Location (Update) */}
              <div style={locBox}>
                <div style={{ fontWeight: 1000, color: "#0b1220", fontSize: 13 }}>Store Location</div>
                <div style={{ marginTop: 6, color: "rgba(17,24,39,0.70)", fontWeight: 850, fontSize: 12 }}>
                  This location is used as <b>Pickup</b> for customer tracking, so it won&apos;t show 0,0.
                </div>

                <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 950, marginBottom: 6, color: "rgba(17,24,39,0.75)" }}>
                      Latitude
                    </div>
                    <input value={lat} onChange={(e) => setLat(e.target.value)} style={inputStyle} placeholder="e.g. 35.3291" />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 950, marginBottom: 6, color: "rgba(17,24,39,0.75)" }}>
                      Longitude
                    </div>
                    <input value={lng} onChange={(e) => setLng(e.target.value)} style={inputStyle} placeholder="e.g. -119.0894" />
                  </div>
                </div>

                <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <button onClick={useMyCurrentGps} style={btnDark} disabled={gettingGps}>
                    {gettingGps ? "Getting GPS..." : "Use my current GPS"}
                  </button>

                  <button onClick={saveLocationToDb} style={btnDark} disabled={savingLoc}>
                    {savingLoc ? "Saving location..." : "Save Location"}
                  </button>

                  {googleMapsLink() ? (
                    <a href={googleMapsLink()} target="_blank" rel="noreferrer" style={btnLight}>
                      Open in Google Maps
                    </a>
                  ) : (
                    <span style={{ fontSize: 12, fontWeight: 850, color: "rgba(17,24,39,0.65)" }}>
                      Add lat/lng to enable Maps link
                    </span>
                  )}

                  <span style={{ fontSize: 12, fontWeight: 900, color: "rgba(17,24,39,0.65)" }}>
                    Saved:{" "}
                    <b>
                      {num(lat) != null ? Number(lat).toFixed(6) : "-"}, {num(lng) != null ? Number(lng).toFixed(6) : "-"}
                    </b>
                  </span>
                </div>
              </div>

              {/* Store Image Upload (Update) */}
              <div style={imgBox}>
                <div style={{ fontWeight: 1000, color: "#0b1220", fontSize: 13 }}>Store Picture</div>

                <div style={imgRow}>
                  <div style={imgPreviewWrap}>
                    {imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imageUrl} alt="Store" style={preview} />
                    ) : (
                      <div
                        style={{
                          ...preview,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 900,
                          color: "rgba(17,24,39,0.55)",
                        }}
                      >
                        No Image
                      </div>
                    )}

                    {imgPreviewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imgPreviewUrl} alt="Selected" style={preview} />
                    ) : null}

                    <div>
                      <input ref={fileRef} type="file" accept="image/*" onChange={onPickFile} style={{ display: "block" }} />
                      <div style={tinyNote}>
                        Upload will set Image URL. After upload, click <b>Save Changes</b>.
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button onClick={uploadStoreImage} style={btnDark} disabled={uploadingImg || !imgFile}>
                      {uploadingImg ? "Uploading..." : "Upload Image"}
                    </button>
                    <button onClick={resetImagePicker} style={btnLight} disabled={uploadingImg && !!imgFile}>
                      Clear
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 950, marginBottom: 6, color: "rgba(17,24,39,0.75)" }}>Store Name</div>
                  <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
                </div>

                <div>
                  <div style={{ fontSize: 12, fontWeight: 950, marginBottom: 6, color: "rgba(17,24,39,0.75)" }}>City</div>
                  <input value={city} onChange={(e) => setCity(e.target.value)} style={inputStyle} />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 950, marginBottom: 6, color: "rgba(17,24,39,0.75)" }}>
                    Image URL (auto after upload)
                  </div>
                  <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} style={inputStyle} />
                </div>

                <div>
                  <div style={{ fontSize: 12, fontWeight: 950, marginBottom: 6, color: "rgba(17,24,39,0.75)" }}>Phone</div>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} />
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 950, marginBottom: 6, color: "rgba(17,24,39,0.75)" }}>Address</div>
                <input value={address} onChange={(e) => setAddress(e.target.value)} style={inputStyle} />
              </div>

              <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button onClick={saveStore} style={btnDark} disabled={loading || deleting}>
                  {loading ? "Saving..." : "Save Changes"}
                </button>

                <button onClick={() => router.push("/groceries/owner/dashboard")} style={btnLight}>
                  Go to Dashboard
                </button>

                <button onClick={() => router.push("/groceries/owner/items")} style={btnLight}>
                  Manage Menu
                </button>

                <button onClick={deleteStore} style={btnDanger} disabled={deleting || loading}>
                  {deleting ? "Deleting..." : "Delete Store"}
                </button>
              </div>

              <div style={{ marginTop: 12, fontSize: 12, fontWeight: 850, color: "rgba(17,24,39,0.7)" }}>
                Store status: <b>{String(activeStore?.approval_status || "pending")}</b> - Disabled: <b>{String(!!activeStore?.is_disabled)}</b>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}










