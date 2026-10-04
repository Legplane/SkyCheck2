// ─────────────────────────────────────────────────────────────────
// SkyCheck service area: Olongapo, Subic, Bataan.
// Keep in sync with skycheck/src/constants/coverage.ts (frontend).
// Rectangular bounding box (covers Bataan peninsula + Subic Bay area).
// ─────────────────────────────────────────────────────────────────
export const COVERAGE_BOUNDS = {
  south: 14.38,
  north: 15.0,
  west:  120.1,
  east:  120.65,
} as const;

export const COVERAGE_AREA_LABEL = 'Olongapo, Subic and Bataan';

export const COVERAGE_ERROR_MESSAGE =
  `SkyCheck currently covers ${COVERAGE_AREA_LABEL} only. Please choose a start and destination inside this area.`;

export function isWithinCoverage(lat: unknown, lon: unknown): boolean {
  if (typeof lat !== 'number' || typeof lon !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  return (
    lat >= COVERAGE_BOUNDS.south && lat <= COVERAGE_BOUNDS.north &&
    lon >= COVERAGE_BOUNDS.west  && lon <= COVERAGE_BOUNDS.east
  );
}

export function routeWithinCoverage(
  startLat: unknown, startLon: unknown,
  destLat: unknown,  destLon: unknown,
): boolean {
  return isWithinCoverage(startLat, startLon) && isWithinCoverage(destLat, destLon);
}
