import axios from 'axios';

// ─────────────────────────────────────────────────────────────────
// AccuWeather (optional) — set ACCUWEATHER_API_KEY in the environment.
// Used to improve current conditions + short hourly forecast when a
// subscription is available. Falls back to Open-Meteo if calls fail.
// Docs: https://developer.accuweather.com/
// ─────────────────────────────────────────────────────────────────

const AW_BASE = 'https://dataservice.accuweather.com';
const GEO_TTL_MS = 24 * 60 * 60 * 1000;
const FORECAST_TTL_MS = 30 * 60 * 1000;

const geoCache = new Map<string, { cachedAt: number; result: AccuGeoResult | null }>();
const currentCache = new Map<string, { cachedAt: number; result: AWCurrent | null }>();
const hourlyCache = new Map<string, { cachedAt: number; result: AWHourly[] }>();
let quotaCooldownUntil = 0;

export interface AccuGeoResult {
  locationKey: string;
  placeName:   string;
}

interface AWGeoResponse {
  Key?:            string | number;
  LocalizedName?:  string;
  EnglishName?:    string;
}

function coordCacheKey(lat: number, lon: number): string {
  return `${Math.round(lat * 100) / 100},${Math.round(lon * 100) / 100}`;
}

function getFresh<T>(cache: Map<string, { cachedAt: number; result: T }>, key: string, ttlMs: number): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > ttlMs) {
    cache.delete(key);
    return null;
  }
  return entry.result;
}

function remember<T>(cache: Map<string, { cachedAt: number; result: T }>, key: string, result: T): T {
  cache.set(key, { cachedAt: Date.now(), result });
  return result;
}

function isAccuWeatherCoolingDown(): boolean {
  return Date.now() < quotaCooldownUntil;
}

function setAccuWeatherCooldown(hours: number): void {
  quotaCooldownUntil = Date.now() + hours * 60 * 60 * 1000;
}

function shouldCooldown(e: unknown): boolean {
  if (!axios.isAxiosError(e)) return false;
  const status = e.response?.status;
  return status === 401 || status === 403 || status === 429;
}

function logAccuWeatherFailure(label: string, e: unknown): void {
  const status = axios.isAxiosError(e) ? e.response?.status : null;
  const code = axios.isAxiosError(e) ? e.code : null;
  if (status === 429) console.warn(`[Weather] AccuWeather ${label} daily limit reached - using Open-Meteo fallback today`);
  else if (status === 401 || status === 403) console.warn(`[Weather] AccuWeather ${label} key rejected - using Open-Meteo fallback`);
  else if (code === 'ECONNABORTED') console.warn(`[Weather] AccuWeather ${label} timed out - using Open-Meteo fallback`);
  else console.warn(`[Weather] AccuWeather ${label} failed - using Open-Meteo fallback`);
}

export function accuWeatherAvailable(): boolean {
  return !isAccuWeatherCoolingDown();
}

/** AccuWeather icon (1–44+) → WMO-style code used by risk + labels in this app */
export function accuWeatherIconToWmo(icon: number): number {
  if ([1, 2, 33, 34].includes(icon)) return 0;
  if ([3, 4, 30, 31, 32, 35, 36].includes(icon)) return 2;
  if ([5, 6, 7, 8, 38].includes(icon)) return 3;
  if ([11, 37, 39, 40].includes(icon)) return 61;
  if ([12, 18, 26, 29].includes(icon)) return 63;
  if ([13, 14].includes(icon)) return 65;
  if ([15, 16, 17, 41, 42].includes(icon)) return 95;
  if ([19, 20, 21, 22, 23, 24, 25].includes(icon)) return 71;
  if ([43, 44].includes(icon)) return 45;
  return 2;
}

export interface AWCurrent {
  EpochTime:              number;
  WeatherText:            string;
  WeatherIcon:            number;
  Temperature:            { Metric: { Value: number } };
  RealFeelTemperature:    { Metric: { Value: number } };
  RelativeHumidity:       number;
  Wind:                   { Speed: { Metric: { Value: number } } };
  HasPrecipitation?:      boolean;
  PrecipitationSummary?:  { Precipitation?: { Metric?: { Value?: number } } };
}

export interface AWHourly {
  EpochDateTime:              number;
  WeatherIcon:                number;
  IconPhrase:                 string;
  Temperature:                { Value: number };
  RealFeelTemperature?:       { Value: number };
  RelativeHumidity?:          number;
  PrecipitationProbability?:  number;
  RainProbability?:           number;
  ThunderstormProbability?:   number;
  TotalLiquid?:               { Value?: number };
  Rain?:                      { Value?: number };
  CloudCover?:                number;
}

export async function accuWeatherGeoposition(
  lat: number, lon: number, apiKey: string, force = false,
): Promise<AccuGeoResult | null> {
  if (!force && isAccuWeatherCoolingDown()) return null;
  const cacheKey = coordCacheKey(lat, lon);
  const cached = getFresh(geoCache, cacheKey, GEO_TTL_MS);
  if (cached !== null) return cached;

  try {
    const { data } = await axios.get<AWGeoResponse>(`${AW_BASE}/locations/v1/cities/geoposition/search`, {
      params: { apikey: apiKey, q: `${lat},${lon}` },
      timeout: 5000,
    });
    if (data?.Key === undefined || data?.Key === null) return remember(geoCache, cacheKey, null);
    const placeName = (data.LocalizedName || data.EnglishName || '').trim();
    return remember(geoCache, cacheKey, { locationKey: String(data.Key), placeName });
  } catch (e) {
    logAccuWeatherFailure('geoposition', e);
    if (shouldCooldown(e)) setAccuWeatherCooldown(24);
    return null;
  }
}

export async function accuWeatherCurrent(locationKey: string, apiKey: string, force = false): Promise<AWCurrent | null> {
  if (!force && isAccuWeatherCoolingDown()) return null;
  const cacheKey = locationKey;
  const cached = getFresh(currentCache, cacheKey, FORECAST_TTL_MS);
  if (cached !== null) return cached;

  try {
    const { data } = await axios.get<AWCurrent[]>(`${AW_BASE}/currentconditions/v1/${locationKey}`, {
      params: { apikey: apiKey, details: true, metric: true },
      timeout: 5000,
    });
    const row = data?.[0];
    return remember(currentCache, cacheKey, row ?? null);
  } catch (e) {
    logAccuWeatherFailure('current conditions', e);
    if (shouldCooldown(e)) setAccuWeatherCooldown(24);
    return null;
  }
}

export async function accuWeatherHourly24(locationKey: string, apiKey: string, force = false): Promise<AWHourly[]> {
  if (!force && isAccuWeatherCoolingDown()) return [];
  const cacheKey = locationKey;
  const cached = getFresh(hourlyCache, cacheKey, FORECAST_TTL_MS);
  if (cached !== null) return cached;

  try {
    const { data } = await axios.get<AWHourly[]>(`${AW_BASE}/forecasts/v1/hourly/24hour/${locationKey}`, {
      params: { apikey: apiKey, metric: true, details: true },
      timeout: 5000,
    });
    return remember(hourlyCache, cacheKey, Array.isArray(data) ? data : []);
  } catch (e) {
    logAccuWeatherFailure('hourly forecast', e);
    if (shouldCooldown(e)) setAccuWeatherCooldown(24);
    return [];
  }
}
