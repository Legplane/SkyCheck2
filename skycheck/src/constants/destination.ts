import type { NominatimResult } from '../types';

// ─────────────────────────────────────────────────────────────────
// Fixed destination for every route: Gordon College, Bacon Street,
// West Tapinac, Olongapo City. Users cannot choose another destination.
// Coordinates are the campus pin from Wikipedia (14.83293, 120.28217);
// adjust here if the pin ever looks off (right-click the campus in
// Google Maps → copy lat,lon).
// ─────────────────────────────────────────────────────────────────
export const GORDON_COLLEGE: NominatimResult = {
  placeId: -1,
  displayName: 'Gordon College, Bacon Street, West Tapinac, Olongapo City, Zambales',
  lat: 14.83293,
  lon: 120.28217,
};
