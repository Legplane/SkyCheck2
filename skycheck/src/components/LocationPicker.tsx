import { useState } from 'react';
import { MapContainer, TileLayer, Marker, Polygon, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { X, MapPin } from 'lucide-react';
import {
  COVERAGE_LEAFLET_BOUNDS, COVERAGE_OUTLINE, COVERAGE_AREA_LABEL, isWithinCoverage,
} from '../constants/coverage';
import { useGeoStore, FALLBACK_LOCATION } from '../store/geoStore';

const pinIcon = L.divIcon({
  className: '',
  html: `<div style="background:#1A56C4;width:18px;height:18px;border-radius:50%;border:3px solid white;box-shadow:0 1px 6px rgba(0,0,0,0.4)"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

function ClickHandler({ onPick }: { onPick: (lat: number, lon: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

interface LocationPickerProps {
  onClose: () => void;
}

/**
 * Lets the user drop a pin when GPS is weak or unavailable (typical on laptops).
 * Only points inside the SkyCheck service area can be confirmed.
 */
export default function LocationPicker({ onClose }: LocationPickerProps) {
  const lat = useGeoStore((s) => s.lat);
  const lon = useGeoStore((s) => s.lon);
  const setManualLocation = useGeoStore((s) => s.setManualLocation);

  const [pin, setPin] = useState<{ lat: number; lon: number } | null>(null);
  const [error, setError] = useState('');

  const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY;
  const tileUrl = MAPTILER_KEY
    ? `https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key=${MAPTILER_KEY}`
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

  function handlePick(la: number, lo: number) {
    if (!isWithinCoverage(la, lo)) {
      setPin(null);
      setError(`That spot is outside ${COVERAGE_AREA_LABEL}. Pick a place inside the dashed area.`);
      return;
    }
    setError('');
    setPin({ lat: la, lon: lo });
  }

  function confirm() {
    if (!pin) return;
    if (!setManualLocation(pin.lat, pin.lon)) {
      setError(`That spot is outside ${COVERAGE_AREA_LABEL}.`);
      return;
    }
    onClose();
  }

  const center: [number, number] = isWithinCoverage(lat, lon)
    ? [lat, lon]
    : [FALLBACK_LOCATION.lat, FALLBACK_LOCATION.lon];

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-card-lg">
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <MapPin size={16} className="text-primary-600" /> Set my location
          </h2>
          <button type="button" onClick={onClose} className="p-2 -mr-2 text-gray-500 rounded-xl hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>
        <p className="px-4 text-xs text-gray-500 leading-relaxed">
          Tap the map where you are. Weather and risk will use this pin until you refresh your GPS.
        </p>

        <div className="mt-3 h-72">
          <MapContainer
            center={center}
            zoom={14}
            minZoom={9}
            maxBounds={COVERAGE_LEAFLET_BOUNDS}
            maxBoundsViscosity={1.0}
            zoomControl
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer url={tileUrl} attribution="© OpenStreetMap contributors" />
            <Polygon
              positions={COVERAGE_OUTLINE}
              interactive={false}
              pathOptions={{ color: '#1A56C4', weight: 1.5, dashArray: '6 6', fillOpacity: 0.03 }}
            />
            <ClickHandler onPick={handlePick} />
            {pin && <Marker position={[pin.lat, pin.lon]} icon={pinIcon} />}
          </MapContainer>
        </div>

        {error && <p className="px-4 pt-3 text-xs text-red-600">{error}</p>}

        <div className="p-4 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 border border-gray-200 text-gray-700 font-semibold rounded-xl text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={!pin}
            className="flex-1 py-3 bg-primary-600 text-white font-semibold rounded-xl text-sm disabled:opacity-40"
          >
            Use this location
          </button>
        </div>
      </div>
    </div>
  );
}
