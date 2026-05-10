// ─────────────────────────────────────────────────────────────────
// Server-side weather cache — prevents 429 from Open-Meteo
//
// Problem: cron fires 10 concurrent requests (2 per route × 5 routes)
// + dashboard fetch + route-save fetches all hit Open-Meteo at once.
// Open-Meteo's free tier rate-limits concurrent requests → 429.
//
// Solution: in-memory cache keyed by rounded coordinates (3dp ≈ 110m).
// TTL: 15 minutes. Shared across all requests in the same process.
// ─────────────────────────────────────────────────────────────────

import type { CurrentWeather, HourlyForecast, RiskLevel } from '../types';

interface CachedWeather {
  current:     CurrentWeather;
  hourly:      HourlyForecast[];
  weatherRisk: RiskLevel;
  /** AccuWeather locality when that provider supplied the banner name */
  providerPlaceName?: string;
  cachedAt:   number;  // Date.now()
}

/** Payload without timestamp — callers pass this; `setCachedWeather` stamps `cachedAt`. */
export type WeatherCachePayload = Omit<CachedWeather, 'cachedAt'>;

const cache = new Map<string, CachedWeather>();
const TTL_MS = 15 * 60 * 1000;  // 15 minutes

// Round to 3 decimal places (~110m precision) for cache key
function cacheKey(lat: number, lon: number): string {
  return `${Math.round(lat * 1000) / 1000},${Math.round(lon * 1000) / 1000}`;
}

export function getCachedWeather(lat: number, lon: number): CachedWeather | null {
  const key   = cacheKey(lat, lon);
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry;
}

export function setCachedWeather(lat: number, lon: number, data: WeatherCachePayload): void {
  cache.set(cacheKey(lat, lon), { ...data, cachedAt: Date.now() });
}

export function getCacheSize(): number {
  return cache.size;
}

// Clean expired entries every 15 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (now - entry.cachedAt > TTL_MS) cache.delete(key);
  }
}, 15 * 60 * 1000);
