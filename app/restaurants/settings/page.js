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
      const center =
        value?.lat && value?.lng
          ? { lat: value.lat, lng: value.lng }
          : defaultCenter;

      return (
        <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid #e5e7eb" }}>
          <MapContainer
            center={[center.lat, center.lng]}
            zoom={defaultZoom}
            style={{ width: "100%", height }}
            scrollWheelZoom
          >
            <TileLayer
              attribution='&copy; OpenStreetMap'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <ClickMarker value={value} onChange={onChange} />
          </MapContainer>
        </div>
      );
    };
  },
  { ssr: false }
);

function toFixed6(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "";
  return String(Number(x.toFixed(6)));
}

function googleMapsLink(lat, lng) {
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return "";
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

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

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, fileToUpload, { upsert: true });

    if (upErr) throw upErr;

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return { url: pub?.publicUrl || null };
  }

  async function setActiveRestaurantOnProfile(restId, uid) {
    if (!restId || !uid) return;
    const { error } = await supabase
      .from("profiles")
      .update({ active_restaurant_id: restId })
      .eq("user_id", uid);
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
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 16 }}>
      <h2 style={{ marginBottom: 6 }}>
        {isNewOwnerNoRestaurant ? "Create Restaurant" : "Restaurant Settings"}
      </h2>
      <div style={{ color: "#666", marginBottom: 12 }}>
        {isNewOwnerNoRestaurant
          ? "First time setup: add your kitchen name, city, image & location"
          : "Edit restaurant name, city, image & location • Add multiple restaurants"}
      </div>

      {errMsg ? (
        <div
          style={{
            background: "#ffe7e7",
            border: "1px solid #ffb3b3",
            padding: 10,
            borderRadius: 8,
            color: "#8a1f1f",
            marginBottom: 12,
          }}
        >
          {errMsg}
        </div>
      ) : null}

      {infoMsg ? (
        <div
          style={{
            background: "#e9fff0",
            border: "1px solid #a8f0bf",
            padding: 10,
            borderRadius: 8,
            color: "#0f5b2a",
            marginBottom: 12,
          }}
        >
          {infoMsg}
        </div>
      ) : null}

      {loading ? <div>Loading…</div> : null}

      {!loading ? (
        <>
          {/* Switch + Add New controls */}
          {!isNewOwnerNoRestaurant ? (
            <div
              style={{
                border: "1px solid #eee",
                borderRadius: 12,
                background: "#fff",
                padding: 14,
                marginBottom: 12,
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ color: "#666", fontSize: 13 }}>
                <b>Owner:</b> {ownerEmail || "-"} <br />
                <b>Active Restaurant ID:</b> {restaurantId || "-"}
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ fontWeight: 900 }}>Select Restaurant</div>
                <select
                  value={restaurantId || ""}
                  onChange={(e) => switchRestaurant(e.target.value)}
                  disabled={switching}
                  style={{
                    padding: 10,
                    borderRadius: 10,
                    border: "1px solid #ddd",
                    minWidth: 260,
                    fontWeight: 800,
                  }}
                >
                  {restaurants.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name || "Restaurant"} {r.city ? `(${r.city})` : ""}
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => {
                    setShowAddNew((v) => !v);
                    setErrMsg("");
                    setInfoMsg("");
                  }}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid #ddd",
                    background: "#fff",
                    cursor: "pointer",
                    fontWeight: 900,
                  }}
                >
                  {showAddNew ? "Close Add New" : "+ Add New Restaurant"}
                </button>
              </div>
            </div>
          ) : null}

          {/* Add New Restaurant form */}
          {(isNewOwnerNoRestaurant || showAddNew) ? (
            <div
              style={{
                border: "1px solid #ddd",
                borderRadius: 12,
                background: "#fff",
                padding: 14,
                marginBottom: 12,
              }}
            >
              <h3 style={{ marginTop: 0 }}>
                {isNewOwnerNoRestaurant ? "Create Your First Restaurant" : "Add Another Restaurant"}
              </h3>

              <label style={{ display: "block", fontWeight: 900, marginBottom: 6 }}>
                Restaurant Name
              </label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Toor Kitchen"
                style={{
                  width: "100%",
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  marginBottom: 12,
                }}
              />

              <label style={{ display: "block", fontWeight: 900, marginBottom: 6 }}>
                City
              </label>
              <input
                value={newCity}
                onChange={(e) => setNewCity(e.target.value)}
                placeholder="e.g. Bakersfield"
                style={{
                  width: "100%",
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  marginBottom: 12,
                }}
              />

              <label style={{ display: "block", fontWeight: 900, marginBottom: 6 }}>
                Restaurant Image (optional)
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setNewFile(e.target.files?.[0] || null)}
                style={{ marginBottom: 12 }}
              />

              {/* ✅ NEW: Location picker for new restaurant */}
              <div style={{ marginTop: 10, marginBottom: 10 }}>
                <div style={{ fontWeight: 950, marginBottom: 6 }}>
                  Restaurant Location (Required)
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
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
                    style={{
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "1px solid #ddd",
                      background: "#fff",
                      cursor: "pointer",
                      fontWeight: 900,
                    }}
                  >
                    Use my current GPS
                  </button>

                  <div style={{ fontSize: 13, color: "#666" }}>
                    Lat: <b>{toFixed6(newLat) || "-"}</b> • Lng: <b>{toFixed6(newLng) || "-"}</b>
                    {newLat && newLng ? (
                      <>
                        {" "}
                        •{" "}
                        <a
                          href={googleMapsLink(newLat, newLng)}
                          target="_blank"
                          rel="noreferrer"
                          style={{ fontWeight: 900 }}
                        >
                          Open in Google Maps
                        </a>
                      </>
                    ) : null}
                  </div>
                </div>

                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>
                    Click on map to drop/adjust the pin.
                  </div>
                  <LocationPickerMap
                    value={newLocation}
                    onChange={({ lat: la, lng: ln }) => {
                      setNewLat(la);
                      setNewLng(ln);
                    }}
                    height={260}
                  />
                </div>
              </div>

              <button
                onClick={createRestaurantFromAddForm}
                disabled={saving}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  background: "#111",
                  color: "#fff",
                  cursor: "pointer",
                  fontWeight: 900,
                }}
              >
                {saving
                  ? "Creating…"
                  : isNewOwnerNoRestaurant
                  ? "Create Restaurant"
                  : "Create New Restaurant"}
              </button>

              <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
                Storage bucket: <b>{BUCKET}</b>
              </div>
            </div>
          ) : null}

          {/* Edit Selected Restaurant form */}
          {!isNewOwnerNoRestaurant ? (
            <div
              style={{
                border: "1px solid #ddd",
                borderRadius: 12,
                background: "#fff",
                padding: 14,
              }}
            >
              <h3 style={{ marginTop: 0 }}>Edit Selected Restaurant</h3>

              <label style={{ display: "block", fontWeight: 900, marginBottom: 6 }}>
                Restaurant Name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Toor Kitchen"
                style={{
                  width: "100%",
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  marginBottom: 12,
                }}
              />

              <label style={{ display: "block", fontWeight: 900, marginBottom: 6 }}>
                City
              </label>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. Bakersfield"
                style={{
                  width: "100%",
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  marginBottom: 14,
                }}
              />

              <label style={{ display: "block", fontWeight: 900, marginBottom: 6 }}>
                Restaurant Image
              </label>

              {imageUrl ? (
                <div style={{ marginBottom: 10 }}>
                  <img
                    src={imageUrl}
                    alt="Restaurant"
                    style={{
                      width: "100%",
                      maxWidth: 420,
                      height: 220,
                      objectFit: "cover",
                      borderRadius: 12,
                      border: "1px solid #eee",
                    }}
                  />
                  <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
                    Current image
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 13, color: "#666", marginBottom: 10 }}>
                  No image uploaded yet.
                </div>
              )}

              <input
                type="file"
                accept="image/*"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                style={{ marginBottom: 14 }}
              />

              {/* ✅ NEW: Location section (edit) */}
              <div style={{ marginTop: 10, marginBottom: 14 }}>
                <div style={{ fontWeight: 950, marginBottom: 6 }}>Restaurant Location</div>

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
                    style={{
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "1px solid #ddd",
                      background: "#fff",
                      cursor: "pointer",
                      fontWeight: 900,
                    }}
                  >
                    Use my current GPS
                  </button>

                  <button
                    type="button"
                    onClick={saveSelectedRestaurantLocation}
                    disabled={saving}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "1px solid #ddd",
                      background: "#111",
                      color: "#fff",
                      cursor: "pointer",
                      fontWeight: 900,
                    }}
                  >
                    {saving ? "Saving…" : "Save Location"}
                  </button>

                  <div style={{ fontSize: 13, color: "#666" }}>
                    Lat: <b>{toFixed6(lat) || "-"}</b> • Lng: <b>{toFixed6(lng) || "-"}</b>
                    {lat && lng ? (
                      <>
                        {" "}
                        •{" "}
                        <a
                          href={googleMapsLink(lat, lng)}
                          target="_blank"
                          rel="noreferrer"
                          style={{ fontWeight: 900 }}
                        >
                          Open in Google Maps
                        </a>
                      </>
                    ) : null}
                  </div>
                </div>

                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>
                    Click on map to drop/adjust the pin.
                  </div>
                  <LocationPickerMap
                    value={selectedLocation}
                    onChange={({ lat: la, lng: ln }) => {
                      setLat(la);
                      setLng(ln);
                    }}
                    height={260}
                  />
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  onClick={saveChanges}
                  disabled={saving}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid #ddd",
                    background: "#111",
                    color: "#fff",
                    cursor: "pointer",
                    fontWeight: 900,
                  }}
                >
                  {saving ? "Saving…" : "Save Changes"}
                </button>

                <button
                  onClick={loadAll}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid #ddd",
                    background: "#fff",
                    cursor: "pointer",
                    fontWeight: 800,
                  }}
                >
                  Reload
                </button>
              </div>

              <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
                Storage bucket: <b>{BUCKET}</b>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
