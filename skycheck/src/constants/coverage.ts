import type { LatLngBoundsLiteral } from 'leaflet';

// ─────────────────────────────────────────────────────────────────
// SkyCheck service area: Olongapo, Subic, Bataan.
// Keep in sync with skycheck-backend/src/constants/coverage.ts.
// Bounding box is a fast pre-filter; the polygon below is the real boundary.
// ─────────────────────────────────────────────────────────────────
export const COVERAGE_BOUNDS = {
  south: 14.38,
  north: 15.0,
  west:  120.1,
  east:  120.65,
} as const;

// Service-area polygon [lat, lon], clockwise from the north-west corner.
// Hugs Olongapo + Subic + Castillejos (Zambales side) and the whole Bataan
// peninsula incl. Corregidor, with ~3–5 km margin. Excludes Pampanga (Lubao,
// Clark), Manila/Cavite, and the rest of Zambales (Iba and north).
const COVERAGE_POLYGON: ReadonlyArray<readonly [number, number]> = [
  [14.99, 120.05],
  [14.99, 120.30],
  [14.95, 120.40],
  [14.88, 120.53],
  [14.78, 120.62],
  [14.60, 120.66],
  [14.45, 120.66],
  [14.36, 120.64],
  [14.35, 120.54],
  [14.38, 120.42],
  [14.50, 120.32],
  [14.62, 120.28],
  [14.72, 120.17],
];

/** Ray-casting point-in-polygon. */
function insidePolygon(lat: number, lon: number): boolean {
  let inside = false;
  for (let i = 0, j = COVERAGE_POLYGON.length - 1; i < COVERAGE_POLYGON.length; j = i++) {
    const [latI, lonI] = COVERAGE_POLYGON[i];
    const [latJ, lonJ] = COVERAGE_POLYGON[j];
    const crosses = (lonI > lon) !== (lonJ > lon) &&
      lat < ((latJ - latI) * (lon - lonI)) / (lonJ - lonI) + latI;
    if (crosses) inside = !inside;
  }
  return inside;
}

/** Leaflet [lat, lon] outline of the service area (for drawing on the map). */
export const COVERAGE_OUTLINE: [number, number][] = COVERAGE_POLYGON.map(([a, b]) => [a, b]);

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
  if (
    lat < COVERAGE_BOUNDS.south || lat > COVERAGE_BOUNDS.north ||
    lon < COVERAGE_BOUNDS.west  || lon > COVERAGE_BOUNDS.east
  ) return false;
  return insidePolygon(lat, lon);
}
