"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import supabase from "@/lib/supabase";

function normalizeRole(r) {
  return String(r || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

const BUCKET = "restaurant-images";

/* =========================
   PREMIUM THEME (customer profile style)
   ========================= */

const pageBg = {
  minHeight: "calc(100vh - 64px)",
  padding: 20,
  background:
    "radial-gradient(1200px 600px at 20% 10%, rgba(255,140,0,0.18), transparent 62%), radial-gradient(900px 520px at 80% 18%, rgba(80,160,255,0.16), transparent 58%), linear-gradient(180deg, #f7f7fb, #ffffff)",
};

const shell = {
  width: "min(1200px, 100%)",
  margin: "0 auto",
};

const heroGlass = {
  borderRadius: 20,
  padding: 18,
  background: "rgba(255,255,255,0.80)",
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 14px 44px rgba(0,0,0,0.09)",
  backdropFilter: "blur(10px)",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
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
  fontWeight: 850,
};

const pill = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 12px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.08)",
  background: "rgba(255,255,255,0.72)",
  fontSize: 12,
  fontWeight: 950,
  color: "rgba(17,24,39,0.85)",
};

const grid2 = {
  marginTop: 12,
  display: "grid",
  gridTemplateColumns: "1fr 1.25fr",
  gap: 12,
};

const cardGlass = {
  borderRadius: 18,
  padding: 14,
  background: "rgba(255,255,255,0.80)",
  border: "1px solid rgba(0,0,0,0.08)",
  boxShadow: "0 12px 36px rgba(0,0,0,0.08)",
  backdropFilter: "blur(10px)",
};

const cardTitle = {
  fontWeight: 1000,
  color: "#0b1220",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
};

const cardHint = {
  marginTop: 6,
  fontSize: 12,
  fontWeight: 850,
  color: "rgba(17,24,39,0.65)",
};

const btnDark = {
  border: "1px solid rgba(17,24,39,0.95)",
  background: "rgba(17,24,39,0.95)",
  color: "#fff",
  fontWeight: 950,
  padding: "10px 14px",
  borderRadius: 12,
  cursor: "pointer",
  boxShadow: "0 12px 30px rgba(17,24,39,0.18)",
};

const btnLight = {
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.92)",
  color: "#111",
  fontWeight: 900,
  padding: "10px 14px",
  borderRadius: 12,
  cursor: "pointer",
};

const btnSmall = {
  ...btnLight,
  padding: "9px 12px",
  borderRadius: 12,
  fontWeight: 950,
};

const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  background: "rgba(255,255,255,0.92)",
  outline: "none",
  fontWeight: 850,
};

const label = {
  fontWeight: 950,
  fontSize: 12,
  marginBottom: 6,
  color: "rgba(17,24,39,0.75)",
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
  border: "1px solid rgba(16,185,129,0.25)",
  background: "rgba(236,253,245,0.9)",
  borderRadius: 14,
  color: "#065f46",
  fontWeight: 900,
};

const divider = {
  height: 1,
  background: "rgba(0,0,0,0.08)",
  margin: "12px 0",
};

const imgWrap = {
  width: "100%",
  height: 210,
  borderRadius: 16,
  border: "1px solid rgba(0,0,0,0.08)",
  overflow: "hidden",
  background: "rgba(0,0,0,0.03)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const img = { width: "100%", height: "100%", objectFit: "cover" };

const metaRow = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
};

const tiny = {
  fontSize: 12,
  fontWeight: 850,
  color: "rgba(17,24,39,0.65)",
};

function toFixed6(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "";
  return String(Number(x.toFixed(6)));
}

function googleMapsLink(lat, lng) {
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return "";
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

/* =========================
   Leaflet Map Picker (SSR-safe)
   ========================= */
const LocationPickerMap = dynamic(
  async () => {
    const mod = await import("react-leaflet");
    const { MapContainer, TileLayer, Marker, useMapEvents } = mod;

    function ClickMarker({ value, onChange }) {
      useMapEvents({
        click(e) {
          const lat = Number(e?.latlng?.lat);
          const lng = Number(e?.latlng?.lng);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
          onChange({ lat, lng });
        },
      });

      if (!value?.lat || !value?.lng) return null;
      return <Marker position={[value.lat, value.lng]} />;
    }

    return function LocationPickerMapInner({
      value,
      onChange,
      height = 260,
      defaultCenter = { lat: 35.3733, lng: -119.0187 }, // Bakersfield-ish default
      defaultZoom = 12,
    }) {
      const center = value?.lat && value?.lng ? { lat: value.lat, lng: value.lng } : defaultCenter;

      return (
        <div style={{ borderRadius: 16, overflow: "hidden", border: "1px solid rgba(0,0,0,0.10)", background: "rgba(255,255,255,0.8)" }}>
          <MapContainer center={[center.lat, center.lng]} zoom={defaultZoom} style={{ width: "100%", height }} scrollWheelZoom>
            <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <ClickMarker value={value} onChange={onChange} />
          </MapContainer>
        </div>
      );
    };
  },
  { ssr: false }
);

export default function RestaurantSettingsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [switching, setSwitching] = useState(false);

  const [errMsg, setErrMsg] = useState("");
  const [infoMsg, setInfoMsg] = useState("");

  const [ownerEmail, setOwnerEmail] = useState("");
  const [userId, setUserId] = useState("");

  // all restaurants for this owner
  const [restaurants, setRestaurants] = useState([]);

  // currently selected/active restaurant
  const [restaurantId, setRestaurantId] = useState("");
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [file, setFile] = useState(null);

  // ✅ Location for selected restaurant
  const [lat, setLat] = useState(null);
  const [lng, setLng] = useState(null);

  const [isNewOwnerNoRestaurant, setIsNewOwnerNoRestaurant] = useState(false);

  // Add new restaurant UI
  const [showAddNew, setShowAddNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCity, setNewCity] = useState("");
  const [newFile, setNewFile] = useState(null);

  // ✅ Location for new restaurant
  const [newLat, setNewLat] = useState(null);
  const [newLng, setNewLng] = useState(null);

  const selectedLocation = useMemo(() => {
    if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return null;
    return { lat: Number(lat), lng: Number(lng) };
  }, [lat, lng]);

  const newLocation = useMemo(() => {
    if (!Number.isFinite(Number(newLat)) || !Number.isFinite(Number(newLng))) return null;
    return { lat: Number(newLat), lng: Number(newLng) };
  }, [newLat, newLng]);

  async function uploadImageIfAny(uid, fileToUpload) {
    if (!fileToUpload) return { url: null };

    const safeName = String(fileToUpload.name || "image").replace(/\s+/g, "_");
    const path = `${uid}/${Date.now()}-${safeName}`;

    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, fileToUpload, { upsert: true });

    if (upErr) throw upErr;

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return { url: pub?.publicUrl || null };
  }

  async function setActiveRestaurantOnProfile(restId, uid) {
    if (!restId || !uid) return;
    const { error } = await supabase.from("profiles").update({ active_restaurant_id: restId }).eq("user_id", uid);
    if (error) throw error;
  }

  async function loadOwnerRestaurants(uid) {
    const { data, error } = await supabase
      .from("restaurants")
      .select("id, name, city, image_url, owner_user_id, lat, lng")
      .eq("owner_user_id", uid)
      .order("name", { ascending: true });

    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }

  function hydrateSelectedRestaurant(rest) {
    if (!rest?.id) return;
    setRestaurantId(rest.id);
    setName(rest.name || "");
    setCity(rest.city || "");
    setImageUrl(rest.image_url || "");
    setFile(null);

    setLat(Number.isFinite(Number(rest?.lat)) ? Number(rest.lat) : null);
    setLng(Number.isFinite(Number(rest?.lng)) ? Number(rest.lng) : null);
  }

  async function loadAll() {
    setLoading(true);
    setErrMsg("");
    setInfoMsg("");

    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;

      const user = userData?.user;
      if (!user) {
        router.push("/login");
        return;
      }

      setOwnerEmail(user.email || "");
      setUserId(user.id);

      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("role, active_restaurant_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profErr) throw profErr;

      const role = normalizeRole(prof?.role);
      if (role !== "restaurant_owner") {
        router.push("/orders");
        return;
      }

      const list = await loadOwnerRestaurants(user.id);
      setRestaurants(list);

      // ✅ New owner: no restaurants
      if (!list.length) {
        setIsNewOwnerNoRestaurant(true);
        setRestaurantId("");
        setName("");
        setCity("");
        setImageUrl("");
        setShowAddNew(true);

        // reset new form
        setNewName("");
        setNewCity("");
        setNewFile(null);
        setNewLat(null);
        setNewLng(null);
        return;
      }

      setIsNewOwnerNoRestaurant(false);

      // pick active from profile if exists, else first
      const activeId = prof?.active_restaurant_id || null;
      const chosen = activeId ? list.find((r) => r.id === activeId) : null;
      const selected = chosen || list[0];

      hydrateSelectedRestaurant(selected);

      // ensure profile active is set
      if (!activeId || activeId !== selected.id) {
        await setActiveRestaurantOnProfile(selected.id, user.id);
      }
    } catch (e) {
      setErrMsg(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  async function switchRestaurant(id) {
    if (!id) return;
    setSwitching(true);
    setErrMsg("");
    setInfoMsg("");
    try {
      const chosen = restaurants.find((r) => r.id === id);
      if (!chosen) throw new Error("Restaurant not found.");

      hydrateSelectedRestaurant(chosen);
      await setActiveRestaurantOnProfile(chosen.id, userId);

      setInfoMsg("✅ Switched restaurant.");
    } catch (e) {
      setErrMsg(e?.message || String(e));
    } finally {
      setSwitching(false);
    }
  }

  function getBrowserGPS(setterLat, setterLng) {
    return new Promise((resolve, reject) => {
      if (!navigator?.geolocation) {
        reject(new Error("GPS not supported in this browser."));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const la = Number(pos?.coords?.latitude);
          const ln = Number(pos?.coords?.longitude);
          if (!Number.isFinite(la) || !Number.isFinite(ln)) {
            reject(new Error("Could not read GPS coordinates."));
            return;
          }
          setterLat(la);
          setterLng(ln);
          resolve({ lat: la, lng: ln });
        },
        (err) => reject(new Error(err?.message || "GPS permission denied.")),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });
  }

  async function saveSelectedRestaurantLocation() {
    setSaving(true);
    setErrMsg("");
    setInfoMsg("");
    try {
      if (!restaurantId) throw new Error("Restaurant not loaded.");
      if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
        throw new Error("Please pick restaurant location on map (lat/lng).");
      }

      const payload = { lat: Number(lat), lng: Number(lng) };

      const { data: updated, error } = await supabase
        .from("restaurants")
        .update(payload)
        .eq("id", restaurantId)
        .select("id, lat, lng")
        .single();

      if (error) throw error;

      setLat(Number(updated?.lat));
      setLng(Number(updated?.lng));

      // refresh list (so future switches have lat/lng)
      const list = await loadOwnerRestaurants(userId);
      setRestaurants(list);

      setInfoMsg("✅ Location saved (lat/lng).");
    } catch (e) {
      setErrMsg(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  async function createRestaurantFromAddForm() {
    setSaving(true);
    setErrMsg("");
    setInfoMsg("");

    try {
      if (!userId) throw new Error("Not logged in.");
      if (!newName.trim()) throw new Error("Please enter restaurant name.");
      if (!newCity.trim()) throw new Error("Please enter city.");

      // ✅ Require location for new restaurants
      if (!Number.isFinite(Number(newLat)) || !Number.isFinite(Number(newLng))) {
        throw new Error("Please set restaurant location (pick on map or use GPS).");
      }

      let newImageUrl = null;
      if (newFile) {
        const up = await uploadImageIfAny(userId, newFile);
        newImageUrl = up.url;
      }

      const insertPayload = {
        owner_user_id: userId,
        name: newName.trim(),
        city: newCity.trim(),
        image_url: newImageUrl,
        lat: Number(newLat),
        lng: Number(newLng),
      };

      const { data: created, error: insErr } = await supabase
        .from("restaurants")
        .insert(insertPayload)
        .select("id, name, city, image_url, lat, lng")
        .single();

      if (insErr) throw insErr;

      // update profile active restaurant to the new one
      await setActiveRestaurantOnProfile(created.id, userId);

      // reload list and select the new one
      const list = await loadOwnerRestaurants(userId);
      setRestaurants(list);

      hydrateSelectedRestaurant(created);

      // reset "add new"
      setNewName("");
      setNewCity("");
      setNewFile(null);
      setNewLat(null);
      setNewLng(null);

      setShowAddNew(false);
      setIsNewOwnerNoRestaurant(false);

      setInfoMsg("✅ New restaurant created successfully (with location).");
    } catch (e) {
      setErrMsg(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  async function saveChanges() {
    setSaving(true);
    setErrMsg("");
    setInfoMsg("");

    try {
      if (!restaurantId) throw new Error("Restaurant not loaded.");
      if (!name.trim()) throw new Error("Please enter restaurant name.");
      if (!city.trim()) throw new Error("Please enter city.");

      let newImageUrl = null;
      if (file) {
        const up = await uploadImageIfAny(userId, file);
        newImageUrl = up.url;
      }

      const payload = { name: name.trim(), city: city.trim() };
      if (newImageUrl) payload.image_url = newImageUrl;

      const { data: updated, error: updErr } = await supabase
        .from("restaurants")
        .update(payload)
        .eq("id", restaurantId)
        .select("id, name, city, image_url, lat, lng")
        .single();

      if (updErr) throw updErr;

      setName(updated?.name || "");
      setCity(updated?.city || "");
      setImageUrl(updated?.image_url || "");
      setFile(null);

      // keep location state in sync (in case row had values)
      setLat(Number.isFinite(Number(updated?.lat)) ? Number(updated.lat) : lat);
      setLng(Number.isFinite(Number(updated?.lng)) ? Number(updated.lng) : lng);

      // refresh restaurant list names for dropdown
      const list = await loadOwnerRestaurants(userId);
      setRestaurants(list);

      setInfoMsg("✅ Name + city + image saved successfully.");
    } catch (e) {
      setErrMsg(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main style={pageBg}>
      <div style={shell}>
        {/* HERO */}
        <div style={heroGlass}>
          <div style={{ minWidth: 260 }}>
            <div style={pill}>{isNewOwnerNoRestaurant ? "Owner • Setup" : "Owner • Restaurant Settings"}</div>
            <h1 style={heroTitle}>{isNewOwnerNoRestaurant ? "Create Restaurant" : "Restaurant Settings"}</h1>
            <div style={subText}>
              {isNewOwnerNoRestaurant
                ? "First time setup: name, city, image & location"
                : "Edit name, city, image & location • Add multiple restaurants"}
            </div>
          </div>

          <div style={metaRow}>
            <span style={pill}>Owner: {ownerEmail || "-"}</span>
            <span style={pill}>Active: {restaurantId ? String(restaurantId).slice(0, 8) + "…" : "-"}</span>
            <button
              onClick={loadAll}
              style={btnLight}
              disabled={loading || saving || switching}
              title="Reload everything"
            >
              Reload
            </button>
          </div>
        </div>

        {errMsg ? <div style={alertErr}>{errMsg}</div> : null}
        {infoMsg ? <div style={alertOk}>{infoMsg}</div> : null}
        {loading ? <div style={{ marginTop: 12, fontWeight: 900, color: "rgba(17,24,39,0.75)" }}>Loading…</div> : null}

        {!loading ? (
          <>
            {/* Switch + Add New controls (only when owner already has restaurants) */}
            {!isNewOwnerNoRestaurant ? (
              <div style={{ ...cardGlass, marginTop: 12 }}>
                <div style={cardTitle}>
                  <div>
                    <div style={{ fontWeight: 1000, color: "#0b1220" }}>Restaurant selector</div>
                    <div style={cardHint}>Switch between your restaurants, or add a new one.</div>
                  </div>

                  <button
                    onClick={() => {
                      setShowAddNew((v) => !v);
                      setErrMsg("");
                      setInfoMsg("");
                    }}
                    style={btnLight}
                    disabled={saving || switching}
                  >
                    {showAddNew ? "Close Add New" : "+ Add New Restaurant"}
                  </button>
                </div>

                <div style={divider} />

                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "end" }}>
                  <div>
                    <div style={label}>Select Restaurant</div>
                    <select
                      value={restaurantId || ""}
                      onChange={(e) => switchRestaurant(e.target.value)}
                      disabled={switching}
                      style={inputStyle}
                    >
                      {restaurants.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name || "Restaurant"} {r.city ? `(${r.city})` : ""}
                        </option>
                      ))}
                    </select>
                    <div style={{ marginTop: 6, ...tiny }}>
                      Tip: Active restaurant saves into <b>profiles.active_restaurant_id</b>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <div style={{ ...pill, background: "rgba(255,255,255,0.9)" }}>
                      {switching ? "Switching…" : "Ready"}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {/* ADD NEW Restaurant (new owner or add another) */}
            {(isNewOwnerNoRestaurant || showAddNew) ? (
              <div style={{ ...cardGlass, marginTop: 12 }}>
                <div style={cardTitle}>
                  <div>
                    <div style={{ fontWeight: 1000, color: "#0b1220" }}>
                      {isNewOwnerNoRestaurant ? "Create your first restaurant" : "Add another restaurant"}
                    </div>
                    <div style={cardHint}>Location is required. Use GPS or click the map to drop the pin.</div>
                  </div>
                  <span style={pill}>Bucket: {BUCKET}</span>
                </div>

                <div style={divider} />

                <div style={grid2}>
                  {/* LEFT (form) */}
                  <div style={{ ...cardGlass, boxShadow: "none" }}>
                    <div style={{ fontWeight: 1000, color: "#0b1220" }}>Restaurant details</div>
                    <div style={{ marginTop: 12 }}>
                      <div style={label}>Restaurant Name</div>
                      <input
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="e.g. Toor Kitchen"
                        style={inputStyle}
                      />
                    </div>

                    <div style={{ marginTop: 12 }}>
                      <div style={label}>City</div>
                      <input
                        value={newCity}
                        onChange={(e) => setNewCity(e.target.value)}
                        placeholder="e.g. Bakersfield"
                        style={inputStyle}
                      />
                    </div>

                    <div style={{ marginTop: 12 }}>
                      <div style={label}>Restaurant Image (optional)</div>
                      <input type="file" accept="image/*" onChange={(e) => setNewFile(e.target.files?.[0] || null)} />
                      <div style={{ marginTop: 8, ...tiny }}>
                        Upload will store image in <b>{BUCKET}</b> and save its public URL.
                      </div>
                    </div>

                    <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={async () => {
                          setErrMsg("");
                          setInfoMsg("");
                          try {
                            await getBrowserGPS(setNewLat, setNewLng);
                            setInfoMsg("✅ GPS captured. Now you can fine-tune pin on map.");
                          } catch (e) {
                            setErrMsg(e?.message || String(e));
                          }
                        }}
                        style={btnLight}
                        disabled={saving}
                      >
                        Use my current GPS
                      </button>

                      <button onClick={createRestaurantFromAddForm} disabled={saving} style={btnDark}>
                        {saving ? "Creating…" : isNewOwnerNoRestaurant ? "Create Restaurant" : "Create New Restaurant"}
                      </button>
                    </div>

                    <div style={{ marginTop: 10, ...tiny }}>
                      Lat: <b>{toFixed6(newLat) || "-"}</b> • Lng: <b>{toFixed6(newLng) || "-"}</b>
                      {newLat && newLng ? (
                        <>
                          {" "}
                          •{" "}
                          <a href={googleMapsLink(newLat, newLng)} target="_blank" rel="noreferrer" style={{ fontWeight: 950, color: "#0b1220" }}>
                            Open in Google Maps
                          </a>
                        </>
                      ) : null}
                    </div>

                    <div style={{ marginTop: 10, ...tiny }}>
                      Storage bucket: <b>{BUCKET}</b>
                    </div>
                  </div>

                  {/* RIGHT (map) */}
                  <div style={{ ...cardGlass, boxShadow: "none" }}>
                    <div style={{ fontWeight: 1000, color: "#0b1220" }}>Restaurant location (Required)</div>
                    <div style={{ marginTop: 8, ...tiny }}>Click on map to drop/adjust the pin.</div>
                    <div style={{ marginTop: 10 }}>
                      <LocationPickerMap
                        value={newLocation}
                        onChange={({ lat: la, lng: ln }) => {
                          setNewLat(la);
                          setNewLng(ln);
                        }}
                        height={320}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {/* EDIT Selected Restaurant */}
            {!isNewOwnerNoRestaurant ? (
              <div style={{ marginTop: 12, ...grid2 }}>
                {/* LEFT: Account/Restaurant card (customer-like) */}
                <div style={cardGlass}>
                  <div style={cardTitle}>
                    <div>
                      <div style={{ fontWeight: 1000, color: "#0b1220" }}>Restaurant profile</div>
                      <div style={cardHint}>Update name, city and image for the selected restaurant.</div>
                    </div>
                    <span style={pill}>ID: {restaurantId ? String(restaurantId).slice(0, 8) + "…" : "-"}</span>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <div style={imgWrap}>
                      {imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={imageUrl} alt="Restaurant" style={img} />
                      ) : (
                        <div style={{ fontWeight: 950, color: "rgba(17,24,39,0.55)" }}>No image uploaded yet</div>
                      )}
                    </div>

                    <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                      <label style={{ ...btnLight, display: "inline-flex", gap: 8, alignItems: "center" }}>
                        <span style={{ fontWeight: 950 }}>Choose Image</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => setFile(e.target.files?.[0] || null)}
                          style={{ display: "none" }}
                        />
                      </label>

                      <div style={tiny}>{file ? `Selected: ${file?.name || "image"}` : "Tip: Use wide image for best look."}</div>
                    </div>
                  </div>

                  <div style={divider} />

                  <div>
                    <div style={label}>Restaurant Name</div>
                    <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Toor Kitchen" style={inputStyle} />
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <div style={label}>City</div>
                    <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Bakersfield" style={inputStyle} />
                  </div>

                  <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button onClick={saveChanges} disabled={saving} style={btnDark}>
                      {saving ? "Saving…" : "Save Changes"}
                    </button>

                    <button onClick={loadAll} disabled={saving} style={btnLight}>
                      Reload
                    </button>
                  </div>

                  <div style={{ marginTop: 10, ...tiny }}>
                    Storage bucket: <b>{BUCKET}</b>
                  </div>
                </div>

                {/* RIGHT: Location card (customer-like) */}
                <div style={cardGlass}>
                  <div style={cardTitle}>
                    <div>
                      <div style={{ fontWeight: 1000, color: "#0b1220" }}>Restaurant location</div>
                      <div style={cardHint}>Use GPS or click map to place your pin. Save it to enable delivery tracking.</div>
                    </div>
                    <span style={pill}>Secure • Saved in Supabase</span>
                  </div>

                  <div style={divider} />

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <button
                      type="button"
                      onClick={async () => {
                        setErrMsg("");
                        setInfoMsg("");
                        try {
                          await getBrowserGPS(setLat, setLng);
                          setInfoMsg("✅ GPS captured. Now you can fine-tune pin on map.");
                        } catch (e) {
                          setErrMsg(e?.message || String(e));
                        }
                      }}
                      style={btnLight}
                      disabled={saving}
                    >
                      Use my current GPS
                    </button>

                    <button type="button" onClick={saveSelectedRestaurantLocation} disabled={saving} style={btnDark}>
                      {saving ? "Saving…" : "Save Location"}
                    </button>

                    <div style={tiny}>
                      Lat: <b>{toFixed6(lat) || "-"}</b> • Lng: <b>{toFixed6(lng) || "-"}</b>
                      {lat && lng ? (
                        <>
                          {" "}
                          •{" "}
                          <a href={googleMapsLink(lat, lng)} target="_blank" rel="noreferrer" style={{ fontWeight: 950, color: "#0b1220" }}>
                            Open in Google Maps
                          </a>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <div style={{ marginTop: 10, ...tiny }}>Click on map to drop/adjust the pin.</div>

                  <div style={{ marginTop: 10 }}>
                    <LocationPickerMap
                      value={selectedLocation}
                      onChange={({ lat: la, lng: ln }) => {
                        setLat(la);
                        setLng(ln);
                      }}
                      height={360}
                    />
                  </div>

                  <div style={{ marginTop: 10, ...tiny }}>
                    Tip: If you don’t see a marker, set GPS once or click map to drop it.
                  </div>
                </div>
              </div>
            ) : null}

            <div style={{ height: 24 }} />
          </>
        ) : null}
      </div>

      {/* responsive fix */}
      <style jsx>{`
        @media (max-width: 980px) {
          div[style*="grid-template-columns: 1fr 1.25fr"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </main>
  );
}