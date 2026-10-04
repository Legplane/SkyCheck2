import type { LatLngBoundsLiteral } from 'leaflet';

// ─────────────────────────────────────────────────────────────────
// SkyCheck service area: Olongapo, Subic, Bataan.
// Keep in sync with skycheck-backend/src/constants/coverage.ts.
// Rectangular bounding box (covers Bataan peninsula + Subic Bay area).
// ─────────────────────────────────────────────────────────────────
export const COVERAGE_BOUNDS = {
  south: 14.38,
  north: 15.0,
  west:  120.1,
  east:  120.65,
} as const;

export const COVERAGE_AREA_LABEL = 'Olongapo, Subic and Bataan';

export const COVERAGE_OUT_OF_AREA_MESSAGE =
  `SkyCheck currently covers ${COVERAGE_AREA_LABEL} only. Please choose a location inside this area.`;

// Leaflet format: [[south, west], [north, east]]
export const COVERAGE_LEAFLET_BOUNDS: LatLngBoundsLiteral = [
  [COVERAGE_BOUNDS.south, COVERAGE_BOUNDS.west],
  [COVERAGE_BOUNDS.north, COVERAGE_BOUNDS.east],
];

// Nominatim viewbox format: left,top,right,bottom (lon,lat,lon,lat)
export const COVERAGE_NOMINATIM_VIEWBOX =
  `${COVERAGE_BOUNDS.west},${COVERAGE_BOUNDS.north},${COVERAGE_BOUNDS.east},${COVERAGE_BOUNDS.south}`;

export function isWithinCoverage(lat: number, lon: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  return (
    lat >= COVERAGE_BOUNDS.south && lat <= COVERAGE_BOUNDS.north &&
    lon >= COVERAGE_BOUNDS.west  && lon <= COVERAGE_BOUNDS.east
  );
}
