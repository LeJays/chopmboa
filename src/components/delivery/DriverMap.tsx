/**
 * DriverMap – carte OpenStreetMap affichant les livreurs actifs.
 * Utilise react-leaflet + tuiles OSM gratuites (aucune clé API requise).
 */
import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { formatFcfa } from "@/lib/chopmboa";

// Fix pour les icônes Leaflet cassées avec les bundlers (Vite/Webpack)
// Leaflet cherche les images en relatif depuis son propre chemin, on les override.
delete (L.Icon.Default.prototype as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

export interface DriverLocation {
  userId: string;
  fullName: string;
  avatarUrl?: string | null;
  lat: number;
  lng: number;
  updatedAt: string;
  activeOrders: {
    id: string;
    orderNumber: string;
    status: string;
    customerName: string | null;
    deliveryAddress: string | null;
    totalFcfa: number;
  }[];
}

/** Crée une icône moto colorée pour chaque livreur */
function makeDriverIcon(initials: string) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44">
      <ellipse cx="18" cy="42" rx="8" ry="2.5" fill="rgba(0,0,0,0.2)"/>
      <circle cx="18" cy="18" r="18" fill="#f97316"/>
      <text x="18" y="23" text-anchor="middle" font-size="13" font-weight="bold"
            font-family="system-ui,sans-serif" fill="white">${initials}</text>
      <polygon points="12,36 18,44 24,36" fill="#f97316"/>
    </svg>`;
  return L.divIcon({
    html: svg,
    className: "",
    iconSize: [36, 44],
    iconAnchor: [18, 44],
    popupAnchor: [0, -44],
  });
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/** Composant interne qui recentre la carte quand les drivers changent */
function AutoBounds({ drivers }: { drivers: DriverLocation[] }) {
  const map = useMap();
  useEffect(() => {
    if (drivers.length === 0) return;
    const bounds = L.latLngBounds(drivers.map((d) => [d.lat, d.lng]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
  }, [drivers, map]);
  return null;
}

/** Formate "il y a X min" */
function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `il y a ${diff}s`;
  return `il y a ${Math.floor(diff / 60)}min`;
}

interface DriverMapProps {
  drivers: DriverLocation[];
  /** Centre par défaut si aucun livreur (coordonnées du restaurant ou Yaoundé) */
  center?: [number, number];
  height?: number;
}

export function DriverMap({ drivers, center = [3.848, 11.502], height = 420 }: DriverMapProps) {
  return (
    <div style={{ height, borderRadius: "0.75rem", overflow: "hidden", border: "1px solid hsl(var(--border))" }}>
      <MapContainer
        center={drivers.length > 0 ? [drivers[0].lat, drivers[0].lng] : center}
        zoom={13}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {drivers.map((driver) => (
          <Marker
            key={driver.userId}
            position={[driver.lat, driver.lng]}
            icon={makeDriverIcon(getInitials(driver.fullName))}
          >
            <Popup minWidth={200}>
              <div style={{ fontFamily: "system-ui, sans-serif", fontSize: 13 }}>
                <p style={{ fontWeight: 700, margin: "0 0 4px" }}>🏍️ {driver.fullName}</p>
                <p style={{ color: "#888", margin: "0 0 6px", fontSize: 11 }}>
                  Mis à jour {timeAgo(driver.updatedAt)}
                </p>
                {driver.activeOrders.length === 0 ? (
                  <p style={{ color: "#888" }}>Aucune course active</p>
                ) : (
                  driver.activeOrders.map((o) => (
                    <div
                      key={o.id}
                      style={{
                        background: "#fff7ed",
                        border: "1px solid #fed7aa",
                        borderRadius: 6,
                        padding: "6px 8px",
                        marginBottom: 4,
                      }}
                    >
                      <p style={{ fontWeight: 600, margin: 0 }}>
                        {o.orderNumber} — {formatFcfa(o.totalFcfa)}
                      </p>
                      {o.customerName && (
                        <p style={{ margin: "2px 0 0", color: "#555" }}>👤 {o.customerName}</p>
                      )}
                      {o.deliveryAddress && (
                        <p style={{ margin: "2px 0 0", color: "#555" }}>📍 {o.deliveryAddress}</p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </Popup>
          </Marker>
        ))}
        {drivers.length > 1 && <AutoBounds drivers={drivers} />}
      </MapContainer>
    </div>
  );
}

