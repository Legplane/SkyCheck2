import axios from 'axios';
import type { FloodResult, RiskLevel } from '../types';

// ─────────────────────────────────────────────────────────────────
// Flood Risk Service — Multi-point elevation + rainfall analysis
//
// Improvements over V1:
//  1. Checks BOTH start AND destination elevation (takes the worst)
//  2. Philippines-calibrated thresholds — the original 5m / 15m
//     thresholds were too aggressive; true flood-prone PH areas
//     (Pampanga, Bulacan lowlands) sit at 3–8m, while Olongapo
//     barangays average 12–25m.
//  3. Considers Open-Meteo precipitation (mm) more heavily
//  4. Graceful fallback: if Topo API fails, returns UNKNOWN
//  5. Elevation cache + request throttling to avoid Topo API 429
// ─────────────────────────────────────────────────────────────────

const TOPO_BASE = 'https://api.opentopodata.org/v1/srtm30m';

// Philippines flood-elevation thresholds (metres ASL)
// Based on PHIVOLCS / NDRRMC flood hazard map data for Central Luzon
const FLOOD_THRESHOLDS = {
  CRITICAL_ELEV:  8,    // below this = HIGH flood zone (Pampanga lowlands, coastal Olongapo)
  MODERATE_ELEV: 20,    // below this = MEDIUM flood zone (lower Subic, riverine Zambales)
  // above 20m = LOW regardless of rain (upland areas)

  RAIN_HIGH_PROB: 70,   // % precipitation probability → HIGH concern
  RAIN_MED_PROB:  45,   // % → MEDIUM concern
  HEAVY_PRECIP:    8,   // mm accumulated → significant runoff
  MOD_PRECIP:      3,   // mm → moderate runoff
};

interface ElevationPoint {
  lat: number;
  lon: number;
  label: string;
}

interface CachedElevation {
  elevation: number;
  cachedAt: number;
}

const elevationCache = new Map<string, CachedElevation>();
const ELEVATION_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const TOPO_MIN_INTERVAL_MS = 350; // keep calls under free-tier per-second limits
const TOPO_COOLDOWN_AFTER_429_MS = 5 * 60 * 1000; // 5 minutes
let lastTopoCallAt = 0;
let topoQueue: Promise<void> = Promise.resolve();
let topo429CooldownUntil = 0;
const inFlightByBatchKey = new Map<string, Promise<Map<string, number>>>();

function cacheKey(lat: number, lon: number): string {
  return `${Math.round(lat * 1000) / 1000},${Math.round(lon * 1000) / 1000}`;
}

function getCachedElevation(lat: number, lon: number): number | null {
  const key = cacheKey(lat, lon);
  const cached = elevationCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.cachedAt > ELEVATION_CACHE_TTL_MS) {
    elevationCache.delete(key);
    return null;
  }
  return cached.elevation;
}

function setCachedElevation(lat: number, lon: number, elevation: number): void {
  elevationCache.set(cacheKey(lat, lon), { elevation, cachedAt: Date.now() });
}

async function throttleTopoRequest(): Promise<void> {
  topoQueue = topoQueue.then(async () => {
    const waitMs = Math.max(0, TOPO_MIN_INTERVAL_MS - (Date.now() - lastTopoCallAt));
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    lastTopoCallAt = Date.now();
  });
  return topoQueue;
}

async function getElevations(points: ElevationPoint[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  const missing: ElevationPoint[] = [];

  for (const point of points) {
    const cached = getCachedElevation(point.lat, point.lon);
    if (cached !== null) {
      result.set(point.label, cached);
    } else {
      missing.push(point);
    }
  }

  if (missing.length === 0) return result;

  if (Date.now() < topo429CooldownUntil) {
    return result;
  }

  const locationStr = missing.map(p => `${p.lat},${p.lon}`).join('|');
  const batchKey = missing
    .map((p) => cacheKey(p.lat, p.lon))
    .sort()
    .join('|');

  let requestPromise = inFlightByBatchKey.get(batchKey);
  if (!requestPromise) {
    requestPromise = (async () => {
      await throttleTopoRequest();
      const { data } = await axios.get<{
        results: Array<{ elevation: number | null }>;
        status: string;
      }>(`${TOPO_BASE}?locations=${locationStr}`, { timeout: 7000 });

      const fetched = new Map<string, number>();
      data.results.forEach((r, i) => {
        if (r.elevation !== null && r.elevation !== undefined) {
          const point = missing[i];
          fetched.set(point.label, r.elevation);
          setCachedElevation(point.lat, point.lon, r.elevation);
        }
      });
      return fetched;
    })();
    inFlightByBatchKey.set(batchKey, requestPromise);
  }

  try {
    const fetched = await requestPromise;
    for (const [label, elevation] of fetched.entries()) {
      result.set(label, elevation);
    }
    return result;
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 429) {
      topo429CooldownUntil = Date.now() + TOPO_COOLDOWN_AFTER_429_MS;
      console.warn('[Flood] Open-Topo-Data 429 — pausing elevation calls for 5 minutes');
      return result;
    }
    throw err;
  } finally {
    inFlightByBatchKey.delete(batchKey);
  }
}

// Single point flood evaluation (for dashboard / weather endpoint)
export async function evaluateFloodRisk(
  lat: number,
  lon: number,
  rainProbability: number,
  precipMm: number,
): Promise<FloodResult> {
  try {
    const elevMap = await getElevations([{ lat, lon, label: 'point' }]);
    const elevation = elevMap.get('point') ?? -1;

    if (elevation < 0) {
      return { elevation: -1, riskLevel: 'UNKNOWN' };
    }

    const riskLevel = calcFloodRisk(elevation, rainProbability, precipMm);
    return { elevation: Math.round(elevation), riskLevel };
  } catch (err) {
    console.warn('[Flood] Open-Topo-Data unavailable — defaulting to UNKNOWN:', err);
    return { elevation: -1, riskLevel: 'UNKNOWN' };
  }
}

// Route flood evaluation — checks BOTH endpoints, returns worst
export async function evaluateRouteFloodRisk(
  startLat: number, startLon: number,
  destLat:  number, destLon:  number,
  rainProbability: number,
  precipMm: number,
): Promise<FloodResult> {
  try {
    const elevMap = await getElevations([
      { lat: startLat, lon: startLon, label: 'start' },
      { lat: destLat,  lon: destLon,  label: 'dest'  },
    ]);

    const startElev = elevMap.get('start') ?? -1;
    const destElev  = elevMap.get('dest')  ?? -1;

    // If either point is below critical threshold, use that
    const worstElev = (startElev >= 0 && destElev >= 0)
      ? Math.min(startElev, destElev)   // lower elevation = higher risk
      : (startElev >= 0 ? startElev : destElev);

    if (worstElev < 0) {
      return { elevation: -1, riskLevel: 'UNKNOWN' };
    }

    const riskLevel = calcFloodRisk(worstElev, rainProbability, precipMm);
    return { elevation: Math.round(worstElev), riskLevel };
  } catch (err) {
    console.warn('[Flood] Route elevation check failed — defaulting UNKNOWN:', err);
    return { elevation: -1, riskLevel: 'UNKNOWN' };
  }
}

// ── Core flood risk calculation ───────────────────────────────────
export function calcFloodRisk(
  elevation: number,
  rainProbability: number,
  precipMm: number,
): RiskLevel {
  const T = FLOOD_THRESHOLDS;

  const isCriticalZone  = elevation <= T.CRITICAL_ELEV;
  const isModerateZone  = elevation <= T.MODERATE_ELEV;
  const isHighRain      = rainProbability >= T.RAIN_HIGH_PROB;
  const isMedRain       = rainProbability >= T.RAIN_MED_PROB;
  const isHeavyPrecip   = precipMm >= T.HEAVY_PRECIP;
  const isModPrecip     = precipMm >= T.MOD_PRECIP;

  // HIGH: critical flood zone + heavy rain or already raining
  if (isCriticalZone && (isHighRain || isHeavyPrecip)) return 'HIGH';

  // HIGH: moderate zone + very heavy ongoing rain
  if (isModerateZone && isHighRain && isHeavyPrecip) return 'HIGH';

  // MEDIUM: critical zone + any meaningful rain
  if (isCriticalZone && (isMedRain || isModPrecip)) return 'MEDIUM';

  // MEDIUM: moderate zone + moderate rain
  if (isModerateZone && isMedRain) return 'MEDIUM';

  return 'LOW';
}
