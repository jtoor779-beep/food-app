"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, Marker, Polyline, CircleMarker } from "react-leaflet";

/**
 * Fix default marker icons in Next.js
 */
function fixLeafletIcons() {
  if (typeof window === "undefined") return;

  // prevent duplicate overrides safely
  if (L.Icon.Default.prototype._getIconUrl) {
    delete L.Icon.Default.prototype._getIconUrl;
  }

  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });
}

function clamp01(x) {
  const n = Number(x);
  if (!isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function lerpLatLng(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
}

function isActiveDeliveryStatus(status) {
  const s = String(status || "").toLowerCase();
  return s === "delivering" || s === "picked_up" || s === "on_the_way";
}

function toLL(obj, fallback) {
  const lat = Number(obj?.lat);
  const lng = Number(obj?.lng);
  if (isFinite(lat) && isFinite(lng)) return [lat, lng];
  return fallback;
}

// Haversine distance (km)
function haversineKm(a, b) {
  try {
    const [lat1, lon1] = a;
    const [lat2, lon2] = b;
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const s1 = Math.sin(dLat / 2) ** 2;
    const s2 = Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.asin(Math.sqrt(s1 + s2));
    const km = R * c;
    return isFinite(km) ? km : 0;
  } catch {
    return 0;
  }
}

function fmtDistance(km) {
  if (!isFinite(km)) return "—";
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

function fmtEtaFromKm(km, speedKmh = 25) {
  const s = Math.max(5, Number(speedKmh || 25)); // avoid crazy small speeds
  const hours = km / s;
  const mins = Math.round(hours * 60);
  if (!isFinite(mins) || mins <= 0) return "—";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

function fmtTimeShort(ts) {
  try {
    if (!ts) return "";
    return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default function CustomerTrackingMap({
  pickup,
  drop,
  driver = null, // ✅ NEW: live driver position: {lat,lng}
  driverUpdatedAt = null, // ✅ NEW: timestamp
  status = "pending",
  height = 320,
  // ✅ NEW: safe fallback center (prevents India issue if coords missing)
  // Default: Bakersfield, CA
  fallbackCenter = { lat: 35.3733, lng: -119.0187 },
}) {
  const mapRef = useRef(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    fixLeafletIcons();
  }, []);

  // ✅ HARD FIX: stop India fallback
  const fallbackLL = useMemo(() => toLL(fallbackCenter, [35.3733, -119.0187]), [fallbackCenter]);

  const pickupLL = useMemo(() => toLL(pickup, fallbackLL), [pickup, fallbackLL]);
  const dropLL = useMemo(() => toLL(drop, fallbackLL), [drop, fallbackLL]);

  // OLD DEMO progress (kept)
  const progressBase = useMemo(() => {
    const s = String(status || "").toLowerCase();
    if (s.includes("pending")) return 0.02;
    if (s.includes("preparing")) return 0.15;
    if (s.includes("ready")) return 0.35;
    if (s.includes("picked")) return 0.55;
    if (s.includes("on_the_way") || s.includes("on the way") || s.includes("delivering")) return 0.75;
    if (s.includes("delivered")) return 1.0;
    return 0.1;
  }, [status]);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1200);
    return () => clearInterval(id);
  }, []);

  const progress = useMemo(() => {
    const wobble = (Math.sin(tick / 2) + 1) / 2;
    return clamp01(progressBase + wobble * 0.06);
  }, [progressBase, tick]);

  const hasLiveDriver = useMemo(() => {
    const lat = Number(driver?.lat);
    const lng = Number(driver?.lng);
    return isFinite(lat) && isFinite(lng);
  }, [driver]);

  const active = useMemo(() => isActiveDeliveryStatus(status), [status]);

  // ✅ driverLL uses LIVE GPS if present, otherwise demo simulation
  const driverLL = useMemo(() => {
    if (active && hasLiveDriver) return [Number(driver.lat), Number(driver.lng)];
    // demo driver position
    return lerpLatLng(pickupLL, dropLL, progress);
  }, [active, hasLiveDriver, driver, pickupLL, dropLL, progress]);

  // Center
  const center = useMemo(() => lerpLatLng(pickupLL, dropLL, 0.5), [pickupLL, dropLL]);

  // ✅ Route lines
  const routeFull = useMemo(() => [pickupLL, dropLL], [pickupLL, dropLL]);
  const routeToDriver = useMemo(() => [pickupLL, driverLL], [pickupLL, driverLL]);
  const routeToDrop = useMemo(() => [driverLL, dropLL], [driverLL, dropLL]);

  // ✅ Distance remaining + ETA (only meaningful during delivery)
  const remainingKm = useMemo(() => {
    if (!active) return null;
    return haversineKm(driverLL, dropLL);
  }, [active, driverLL, dropLL]);

  const eta = useMemo(() => {
    if (!active || remainingKm == null) return null;
    return fmtEtaFromKm(remainingKm, 25);
  }, [active, remainingKm]);

  // ✅ HARD FIX: Destroy map when component unmounts (stops “already initialized”)
  useEffect(() => {
    return () => {
      try {
        if (mapRef.current) {
          mapRef.current.off();
          mapRef.current.remove();
          mapRef.current = null;
        }
      } catch {}
    };
  }, []);

  // ✅ Key forces clean re-init ONLY when pickup/drop/status changes
  // (DO NOT include driver coords — that causes constant remounts & leaflet glitches)
  const mapKey = useMemo(() => {
    return `${pickupLL[0]}-${pickupLL[1]}-${dropLL[0]}-${dropLL[1]}-${String(status || "")}`;
  }, [pickupLL, dropLL, status]);

  // ✅ Fit bounds (nice view) - also runs when driver moves
  useEffect(() => {
    try {
      const map = mapRef.current;
      if (!map) return;
      const bounds = L.latLngBounds([pickupLL, dropLL, driverLL]);
      map.fitBounds(bounds, { padding: [30, 30] });
    } catch {}
  }, [pickupLL, dropLL, driverLL]);

  const topBar = useMemo(() => {
    const liveText = active ? (hasLiveDriver ? "LIVE GPS" : "GPS (demo)") : "Tracking";
    const distText = active ? `Distance remaining: ${fmtDistance(remainingKm ?? 0)}` : "";
    const etaText = active ? `ETA: ${eta || "—"}` : "";
    const upd = active && hasLiveDriver ? `Updated: ${fmtTimeShort(driverUpdatedAt) || "—"}` : "";
    return { liveText, distText, etaText, upd };
  }, [active, hasLiveDriver, remainingKm, eta, driverUpdatedAt]);

  return (
    <div
      style={{
        width: "100%",
        height,
        borderRadius: 16,
        overflow: "hidden",
        border: "1px solid rgba(0,0,0,0.12)",
        background: "rgba(255,255,255,0.75)",
        position: "relative",
      }}
    >
      {/* ✅ TOP INFO BAR (only shows ETA/distance during delivery) */}
      <div
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          right: 10,
          zIndex: 999,
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 10px",
          borderRadius: 14,
          background: "rgba(255,255,255,0.88)",
          border: "1px solid rgba(0,0,0,0.10)",
          backdropFilter: "blur(8px)",
          boxShadow: "0 10px 24px rgba(0,0,0,0.08)",
          fontWeight: 900,
          color: "rgba(17,24,39,0.82)",
          fontSize: 12,
        }}
      >
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <span
            style={{
              padding: "4px 8px",
              borderRadius: 999,
              border: "1px solid rgba(59,130,246,0.20)",
              background: "rgba(239,246,255,0.95)",
              color: "#1e40af",
              fontWeight: 1000,
            }}
          >
            {topBar.liveText}
          </span>

          {active ? (
            <>
              <span>{topBar.distText}</span>
              <span>{topBar.etaText}</span>
            </>
          ) : null}
        </div>

        <div style={{ opacity: 0.8 }}>{topBar.upd}</div>
      </div>

      {!mounted ? (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 900,
            color: "rgba(17,24,39,0.7)",
          }}
        >
          Loading map…
        </div>
      ) : (
        <MapContainer
          key={mapKey}
          center={center}
          zoom={13}
          style={{ width: "100%", height: "100%" }}
          scrollWheelZoom={false}
          whenCreated={(map) => {
            mapRef.current = map;
          }}
        >
          <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

          {/* faint base route pickup -> drop */}
          <Polyline positions={routeFull} pathOptions={{ opacity: 0.25, weight: 4 }} />

          {/* ✅ PROFESSIONAL ROUTE: pickup -> driver -> drop */}
          {active ? (
            <>
              <Polyline positions={routeToDriver} pathOptions={{ opacity: 0.95, weight: 6 }} />
              <Polyline positions={routeToDrop} pathOptions={{ opacity: 0.45, weight: 6, dashArray: "10 10" }} />
            </>
          ) : null}

          <Marker position={pickupLL} />
          <Marker position={dropLL} />

          {/* Driver */}
          <CircleMarker center={driverLL} radius={9} pathOptions={{ color: "#0b1220", fillColor: "#0b1220", fillOpacity: 0.9 }} />
        </MapContainer>
      )}
    </div>
  );
}
