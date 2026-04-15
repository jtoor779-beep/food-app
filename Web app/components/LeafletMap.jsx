"use client";

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";

// Fix default marker icon paths in Next.js
const iconRetinaUrl = "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png";
const iconUrl = "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png";
const shadowUrl = "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png";

const DefaultIcon = L.icon({
  iconRetinaUrl,
  iconUrl,
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;

export default function LeafletMap({
  center = [30.7333, 76.7794], // Chandigarh default
  zoom = 13,
  marker = [30.7333, 76.7794],
  label = "Location",
  height = 320,
}) {
  return (
    <div style={{ width: "100%", height, borderRadius: 16, overflow: "hidden", border: "1px solid rgba(0,0,0,0.12)" }}>
      <MapContainer center={center} zoom={zoom} style={{ width: "100%", height: "100%" }} scrollWheelZoom={true}>
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={marker}>
          <Popup>{label}</Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}
