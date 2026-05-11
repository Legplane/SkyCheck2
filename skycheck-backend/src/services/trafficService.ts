import axios from 'axios';
import type { TrafficResult, RiskLevel } from '../types';
import { RISK } from '../constants/risk';

const TOMTOM_BASE = 'https://api.tomtom.com/traffic/services/4/flowSegmentData/relative0/10/json';
const TRAFFIC_TTL_MS = 10 * 60 * 1000;
const trafficCache = new Map<string, { cachedAt: number; result: TrafficResult }>();
const routeTrafficCache = new Map<string, { cachedAt: number; result: TrafficResult }>();

interface TomTomFlowResponse {
  flowSegmentData: {
    currentSpeed: number;
    freeFlowSpeed: number;
    currentTravelTime: number;
    freeFlowTravelTime: number;
    confidence: number;
    roadClosure: boolean;
  };
}

export async function fetchTrafficLevel(lat: number, lon: number): Promise<TrafficResult> {
  const cached = getCachedTraffic(lat, lon);
  if (cached) return cached;

  const live = await fetchTomTomPoint(lat, lon, 'near you');
  if (live) return cacheTraffic(lat, lon, live);

  return rushHourFallback('TomTom point unavailable/timeout', lat, lon);
}

export async function fetchRouteTrafficLevel(
  startLat: number,
  startLon: number,
  destLat: number,
  destLon: number,
): Promise<TrafficResult> {
  const cached = getCachedRouteTraffic(startLat, startLon, destLat, destLon);
  if (cached) return cached;

  const midLat = (startLat + destLat) / 2;
  const midLon = (startLon + destLon) / 2;
  const samples = await Promise.allSettled([
    fetchTomTomPoint(startLat, startLon, 'route start'),
    fetchTomTomPoint(midLat, midLon, 'route middle'),
    fetchTomTomPoint(destLat, destLon, 'route destination'),
  ]);

  const live = samples
    .filter((sample): sample is PromiseFulfilledResult<TrafficResult | null> => sample.status === 'fulfilled')
    .map(sample => sample.value)
    .filter((sample): sample is TrafficResult => Boolean(sample));

  if (live.length > 0) {
    const worst = live.reduce((slowest, sample) =>
      sample.congestionRatio < slowest.congestionRatio ? sample : slowest,
    );
    const currentSpeed = live.reduce((sum, sample) => sum + sample.currentSpeed, 0) / live.length;
    const freeFlowSpeed = live.reduce((sum, sample) => sum + sample.freeFlowSpeed, 0) / live.length;

    return cacheRouteTraffic(startLat, startLon, destLat, destLon, {
      congestionRatio: worst.congestionRatio,
      currentSpeed: Math.round(currentSpeed),
      freeFlowSpeed: Math.round(freeFlowSpeed),
      riskLevel: worst.riskLevel,
      volumeLevel: worst.volumeLevel,
      source: 'tomtom',
      label: `Route traffic volume: ${trafficVolumeLabel(worst.volumeLevel)} (${live.length}/3 TomTom samples)`,
    });
  }

  return cacheRouteTraffic(
    startLat,
    startLon,
    destLat,
    destLon,
    rushHourFallback('route TomTom unavailable/timeout', midLat, midLon),
  );
}

async function fetchTomTomPoint(lat: number, lon: number, label: string): Promise<TrafficResult | null> {
  const TOMTOM_KEY = cleanTomTomKey(process.env.TOMTOM_API_KEY);
  if (!TOMTOM_KEY) {
    console.warn('[Traffic] TOMTOM_API_KEY not set - using rush-hour heuristic');
    return null;
  }

  try {
    const { data } = await axios.get<TomTomFlowResponse>(TOMTOM_BASE, {
      params: { key: TOMTOM_KEY, point: `${lat},${lon}` },
      timeout: 4500,
    });

    const { currentSpeed, freeFlowSpeed, confidence, roadClosure } = data.flowSegmentData;
    if (confidence < 0.3 || roadClosure || freeFlowSpeed <= 0) return null;

    const ratio = currentSpeed / freeFlowSpeed;
    const riskLevel = trafficRiskFromRatio(ratio);
    return {
      congestionRatio: Math.round(ratio * 100) / 100,
      currentSpeed: Math.round(currentSpeed),
      freeFlowSpeed: Math.round(freeFlowSpeed),
      riskLevel,
      volumeLevel: riskLevel === 'HIGH' ? 'HIGH' : riskLevel === 'MEDIUM' ? 'MEDIUM' : 'LOW',
      source: 'tomtom',
      label: `TomTom ${label} traffic volume: ${trafficVolumeLabel(riskLevel)}`,
    };
  } catch (err: unknown) {
    const status = axios.isAxiosError(err) ? err.response?.status : null;
    if (status === 429) console.warn('[Traffic] TomTom daily limit exceeded - using time-based fallback');
    else if (status === 401 || status === 403) console.warn('[Traffic] TomTom key rejected - using time-based fallback');
    else if (status !== 404) console.warn('[Traffic] TomTom unavailable - using time-based fallback');
    return null;
  }
}

function cleanTomTomKey(value: string | undefined): string | null {
  const key = value?.trim();
  if (!key || key === 'your_tomtom_api_key_here') return null;
  return key;
}

function trafficCacheKey(lat: number, lon: number): string {
  return `${Math.round(lat * 1000) / 1000},${Math.round(lon * 1000) / 1000}`;
}

function routeTrafficCacheKey(startLat: number, startLon: number, destLat: number, destLon: number): string {
  return `${trafficCacheKey(startLat, startLon)}>${trafficCacheKey(destLat, destLon)}`;
}

function getCachedTraffic(lat: number, lon: number): TrafficResult | null {
  const entry = trafficCache.get(trafficCacheKey(lat, lon));
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > TRAFFIC_TTL_MS) {
    trafficCache.delete(trafficCacheKey(lat, lon));
    return null;
  }
  return entry.result;
}

function cacheTraffic(lat: number, lon: number, result: TrafficResult): TrafficResult {
  trafficCache.set(trafficCacheKey(lat, lon), { cachedAt: Date.now(), result });
  return result;
}

function getCachedRouteTraffic(startLat: number, startLon: number, destLat: number, destLon: number): TrafficResult | null {
  const key = routeTrafficCacheKey(startLat, startLon, destLat, destLon);
  const entry = routeTrafficCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > TRAFFIC_TTL_MS) {
    routeTrafficCache.delete(key);
    return null;
  }
  return entry.result;
}

function cacheRouteTraffic(startLat: number, startLon: number, destLat: number, destLon: number, result: TrafficResult): TrafficResult {
  routeTrafficCache.set(routeTrafficCacheKey(startLat, startLon, destLat, destLon), { cachedAt: Date.now(), result });
  return result;
}

function manilaWeekend(): boolean {
  const wd = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    weekday: 'short',
  }).format(new Date());
  return wd === 'Sat' || wd === 'Sun';
}

function rushHourFallback(reason: string, lat = 14.8386, lon = 120.2842): TrafficResult {
  const now = new Date();
  const phtHour = (now.getUTCHours() + 8) % 24;
  const phtMin = now.getUTCMinutes();
  const t = phtHour + phtMin / 60;
  const weekend = manilaWeekend();

  let riskLevel: RiskLevel;
  let congestionRatio: number;

  if (t >= 6.5 && t < 9.0) {
    riskLevel = weekend ? 'MEDIUM' : 'HIGH';
    congestionRatio = weekend ? 0.58 : 0.42;
  } else if (t >= 9.0 && t < 11.5) {
    riskLevel = 'LOW';
    congestionRatio = weekend ? 0.88 : 0.85;
  } else if (t >= 11.5 && t < 13.5) {
    riskLevel = weekend ? 'LOW' : 'MEDIUM';
    congestionRatio = weekend ? 0.78 : 0.65;
  } else if (t >= 13.5 && t < 16.5) {
    riskLevel = 'LOW';
    congestionRatio = 0.88;
  } else if (t >= 16.5 && t < 20.0) {
    riskLevel = weekend ? 'MEDIUM' : 'HIGH';
    congestionRatio = weekend ? 0.52 : 0.38;
  } else {
    riskLevel = 'LOW';
    congestionRatio = 0.92;
  }

  console.info(`[Traffic] Time-based fallback (${reason}) -> ${riskLevel} @ PHT ${phtHour}:${String(Math.round(phtMin)).padStart(2, '0')}${weekend ? ' weekend' : ''}`);

  return cacheTraffic(lat, lon, {
    congestionRatio,
    currentSpeed: 0,
    freeFlowSpeed: 0,
    riskLevel,
    volumeLevel: riskLevel === 'HIGH' ? 'HIGH' : riskLevel === 'MEDIUM' ? 'MEDIUM' : 'LOW',
    source: 'heuristic',
    label: `Time-based estimate: ${trafficVolumeLabel(riskLevel)} (${reason})`,
  });
}

function trafficRiskFromRatio(ratio: number): RiskLevel {
  if (ratio < RISK.TRAFFIC.RATIO_HIGH) return 'HIGH';
  if (ratio < RISK.TRAFFIC.RATIO_MED) return 'MEDIUM';
  return 'LOW';
}

function trafficVolumeLabel(level: RiskLevel): string {
  if (level === 'HIGH') return 'High';
  if (level === 'MEDIUM') return 'Moderate';
  if (level === 'LOW') return 'Low';
  return 'Unknown';
}
