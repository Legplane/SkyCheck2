import type { QueryClient } from '@tanstack/react-query';
import type { HealthCheck, HealthCheckPayload, WeatherSnapshot } from '../types';

// ─────────────────────────────────────────────────────────────────
// Offline helpers — make cached data trustworthy:
//   • pick the cached weather that best matches where the user is now
//   • know how old it is and how much to trust it
//   • never reuse yesterday's health check as "today's"
//   • queue an offline health check and sync it when internet returns
// ─────────────────────────────────────────────────────────────────

export const MANILA_TZ = 'Asia/Manila';

/** Today's calendar date in the Philippines, "YYYY-MM-DD". */
export function manilaToday(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MANILA_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Minutes since midnight in Manila. */
export function manilaMinutesOfDay(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: MANILA_TZ, hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === 'hour')!.value) % 24;
  const m = Number(parts.find((p) => p.type === 'minute')!.value);
  return h * 60 + m;
}

/** True only when the record belongs to today's Manila calendar day. */
export function isHealthCheckForToday(h: HealthCheck | null | undefined): h is HealthCheck {
  return !!h && typeof h.checkDate === 'string' && h.checkDate.slice(0, 10) === manilaToday();
}

// ── Cached weather lookup ─────────────────────────────────────────
export interface CachedWeather {
  snapshot: WeatherSnapshot;
  /** epoch ms when this snapshot was fetched */
  updatedAt: number;
  /** metres between the cached query's coordinates and the user's position (null if unknown) */
  distanceM: number | null;
}

function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Best cached weather for the user's position: prefer the closest query,
 * break near-ties (within 1 km) by freshness. Falls back to the newest entry.
 */
export function findBestCachedWeather(
  qc: QueryClient,
  lat: number,
  lon: number,
): CachedWeather | null {
  const candidates: CachedWeather[] = [];
  for (const [key, snapshot] of qc.getQueriesData<WeatherSnapshot>({ queryKey: ['weather'] })) {
    if (!snapshot?.current) continue;
    const state = qc.getQueryState(key);
    const qLat = typeof key[1] === 'number' ? key[1] : null;
    const qLon = typeof key[2] === 'number' ? key[2] : null;
    candidates.push({
      snapshot,
      updatedAt: state?.dataUpdatedAt || Date.parse(snapshot.current.updatedAt) || 0,
      distanceM: qLat !== null && qLon !== null ? distanceM(lat, lon, qLat, qLon) : null,
    });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => {
    const da = a.distanceM ?? Number.MAX_SAFE_INTEGER;
    const db = b.distanceM ?? Number.MAX_SAFE_INTEGER;
    if (Math.abs(da - db) > 1_000) return da - db;
    return b.updatedAt - a.updatedAt;
  });
  return candidates[0];
}

// ── Freshness ─────────────────────────────────────────────────────
export type Freshness = 'fresh' | 'aging' | 'stale' | 'expired';

export function ageMinutes(updatedAt: number, now = Date.now()): number {
  return Math.max(0, Math.round((now - updatedAt) / 60_000));
}

export function freshnessOf(minutes: number): Freshness {
  if (minutes <= 60)  return 'fresh';
  if (minutes <= 180) return 'aging';
  if (minutes <= 360) return 'stale';
  return 'expired';
}

export function formatAge(minutes: number): string {
  if (minutes < 2) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m >= 10 ? `${h}h ${m}m ago` : `${h}h ago`;
}

// ── Forecast window ───────────────────────────────────────────────
export interface ForecastWindow {
  /** highest rain probability across the commute window (%) */
  maxRainProb: number;
  /** highest forecast temperature in the window (°C) */
  maxTemp: number | null;
  /** how many hourly slots of the cached forecast actually cover the window */
  slotsUsed: number;
}

/**
 * Looks at cached hourly slots ("HH:MM", Manila) that fall between now and
 * now + windowMin, so the offline estimate reflects the coming commute rather
 * than the moment the data was cached.
 */
export function forecastWindow(
  snapshot: WeatherSnapshot,
  now: Date = new Date(),
  windowMin = 180,
): ForecastWindow {
  const nowMin = manilaMinutesOfDay(now);
  let maxRain = -1;
  let maxTemp: number | null = null;
  let used = 0;

  for (const slot of snapshot.hourly ?? []) {
    const [hh, mm] = slot.time.split(':').map(Number);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) continue;
    const slotMin = hh * 60 + mm;
    // include the slot that contains "now" (up to 59 min earlier)
    const delta = ((slotMin - nowMin + 1440) % 1440);
    const covers = delta <= windowMin || delta >= 1440 - 59;
    if (!covers) continue;
    used += 1;
    maxRain = Math.max(maxRain, slot.precipitationProbability);
    maxTemp = maxTemp === null ? slot.temperature : Math.max(maxTemp, slot.temperature);
  }

  return {
    maxRainProb: maxRain < 0 ? snapshot.current.precipitationProbability : maxRain,
    maxTemp,
    slotsUsed: used,
  };
}

// ── Offline health-check sync queue ───────────────────────────────
const PENDING_HEALTH_KEY = 'skycheck-pending-health';

interface PendingHealth { payload: HealthCheckPayload; date: string; savedAt: string }

export function queuePendingHealth(payload: HealthCheckPayload): void {
  try {
    const item: PendingHealth = { payload, date: manilaToday(), savedAt: new Date().toISOString() };
    localStorage.setItem(PENDING_HEALTH_KEY, JSON.stringify(item));
  } catch { /* storage unavailable */ }
}

/** Returns the queued check only if it is still for today (older ones are dropped). */
export function readPendingHealth(): PendingHealth | null {
  try {
    const raw = localStorage.getItem(PENDING_HEALTH_KEY);
    if (!raw) return null;
    const item = JSON.parse(raw) as PendingHealth;
    if (item.date !== manilaToday()) {
      localStorage.removeItem(PENDING_HEALTH_KEY);
      return null;
    }
    return item;
  } catch {
    return null;
  }
}

export function clearPendingHealth(): void {
  try { localStorage.removeItem(PENDING_HEALTH_KEY); } catch { /* ignore */ }
}
