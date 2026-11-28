import { clearWeatherCache } from './weatherCache';
import { clearAccuWeatherForecastCache } from './accuWeatherService';
import { clearTrafficCache } from './trafficService';

// ─────────────────────────────────────────────────────────────────
// Manual "refresh" support.
//
// Weather (15 min), AccuWeather (90 min) and traffic (10 min) are cached
// in memory so the free-tier APIs are not hammered. When a user taps a
// refresh button the client sends `refresh=1`, and the route handler calls
// forceFreshData() so the next lookups go to the providers.
//
// To protect API quotas, caches are cleared at most once per
// MIN_FORCE_INTERVAL_MS — data fetched within that window is already fresh.
// ─────────────────────────────────────────────────────────────────

const MIN_FORCE_INTERVAL_MS = 60 * 1000;
let lastForcedAt = 0;

/** Clears live-data caches. Returns true if they were cleared, false if throttled. */
export function forceFreshData(): boolean {
  const now = Date.now();
  if (now - lastForcedAt < MIN_FORCE_INTERVAL_MS) return false;
  lastForcedAt = now;
  clearWeatherCache();
  clearAccuWeatherForecastCache();
  clearTrafficCache();
  return true;
}

export function isRefreshRequested(value: unknown): boolean {
  return value === true || value === '1' || value === 'true';
}
