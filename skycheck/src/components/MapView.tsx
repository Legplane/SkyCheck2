import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';

// Fix default Leaflet icon issue with Vite bundler
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const startIcon = L.divIcon({
  className: '',
  html: `<div style="background:#22C55E;width:14px;height:14px;border-radius:50%;border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3)"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const endIcon = L.divIcon({
  className: '',
  html: `<div style="background:#EF4444;width:14px;height:14px;border-radius:50%;border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3)"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

// Auto-fit map bounds to show both markers
function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length >= 2) {
      const bounds = L.latLngBounds(positions);
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 17 });
    } else if (positions.length === 1) {
      map.setView(positions[0], 16);
    }
  }, [map, positions]);
  return null;
}

interface MapViewProps {
  start?: { lat: number; lon: number };
  destination?: { lat: number; lon: number };
  waypoints?: [number, number][];  // decoded from ORS geometry
  className?: string;
}

export default function MapView({ start, destination, waypoints, className }: MapViewProps) {
  const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY;

  // Default center: Olongapo City, PH
  const defaultCenter: [number, number] = [14.8292, 120.2842];

  const positions: [number, number][] = [];
  if (start) positions.push([start.lat, start.lon]);
  if (destination) positions.push([destination.lat, destination.lon]);

  const tileUrl = MAPTILER_KEY
    ? `https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key=${MAPTILER_KEY}`
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

  const attribution = MAPTILER_KEY
    ? '© MapTiler © OpenStreetMap contributors'
    : '© OpenStreetMap contributors';

  return (
    <div className={`rounded-xl overflow-hidden ${className ?? 'h-48'}`}>
      <MapContainer
        center={positions[0] ?? defaultCenter}
        zoom={15}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
        scrollWheelZoom={false}
      >
        <TileLayer url={tileUrl} attribution={attribution} />

        {positions.length > 0 && <FitBounds positions={positions} />}

        {start && <Marker position={[start.lat, start.lon]} icon={startIcon} />}
        {destination && <Marker position={[destination.lat, destination.lon]} icon={endIcon} />}

        {waypoints && waypoints.length > 1 && (
          <Polyline
            positions={waypoints}
            pathOptions={{ color: '#1A56C4', weight: 4, opacity: 0.85 }}
          />
        )}
      </MapContainer>
    </div>
  );
}
