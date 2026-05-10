import type { NominatimResult } from '../types';

// ─────────────────────────────────────────────────────────────────
// Nominatim Geocoding Service
// Free OSM geocoding. Limit to PH (countrycodes=ph).
// Usage policy: max 1 request/second — use 300ms debounce on input.
// ─────────────────────────────────────────────────────────────────

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'SkyCheck-StudentApp/1.0 (gordoncollege.edu.ph)';

export async function searchAddress(query: string): Promise<NominatimResult[]> {
  if (!query || query.trim().length < 3) return [];

  const params = new URLSearchParams({
    q: query,
    format: 'json',
    limit: '5',
    countrycodes: 'ph',
    addressdetails: '1',
  });

  const response = await fetch(`${NOMINATIM_BASE}?${params}`, {
    headers: { 'User-Agent': USER_AGENT },
  });

  if (!response.ok) throw new Error('Geocoding search failed');

  const raw = await response.json();

  return raw.map((item: {
    place_id: number;
    display_name: string;
    lat: string;
    lon: string;
  }) => ({
    placeId:     item.place_id,
    displayName: item.display_name,
    lat:         parseFloat(item.lat),
    lon:         parseFloat(item.lon),
  }));
}

// Short display name (remove long country/region suffix)
export function shortenAddress(displayName: string): string {
  const parts = displayName.split(', ');
  return parts.slice(0, 3).join(', ');
}
