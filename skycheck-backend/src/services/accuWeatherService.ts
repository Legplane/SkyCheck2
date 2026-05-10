import axios from 'axios';

// ─────────────────────────────────────────────────────────────────
// AccuWeather (optional) — set ACCUWEATHER_API_KEY in the environment.
// Used to improve current conditions + short hourly forecast when a
// subscription is available. Falls back to Open-Meteo if calls fail.
// Docs: https://developer.accuweather.com/
// ─────────────────────────────────────────────────────────────────

const AW_BASE = 'https://dataservice.accuweather.com';

export interface AccuGeoResult {
  locationKey: string;
  placeName:   string;
}

interface AWGeoResponse {
  Key?:            string | number;
  LocalizedName?:  string;
  EnglishName?:    string;
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
  PrecipitationProbability?:  number;
}

export async function accuWeatherGeoposition(
  lat: number, lon: number, apiKey: string,
): Promise<AccuGeoResult | null> {
  try {
    const { data } = await axios.get<AWGeoResponse>(`${AW_BASE}/locations/v1/cities/geoposition/search`, {
      params: { apikey: apiKey, q: `${lat},${lon}` },
      timeout: 8000,
    });
    if (data?.Key === undefined || data?.Key === null) return null;
    const placeName = (data.LocalizedName || data.EnglishName || '').trim();
    return { locationKey: String(data.Key), placeName };
  } catch (e) {
    console.warn('[Weather] AccuWeather geoposition failed', e);
    return null;
  }
}

export async function accuWeatherCurrent(locationKey: string, apiKey: string): Promise<AWCurrent | null> {
  try {
    const { data } = await axios.get<AWCurrent[]>(`${AW_BASE}/currentconditions/v1/${locationKey}`, {
      params: { apikey: apiKey, details: true, metric: true },
      timeout: 8000,
    });
    const row = data?.[0];
    return row ?? null;
  } catch (e) {
    console.warn('[Weather] AccuWeather current conditions failed', e);
    return null;
  }
}

export async function accuWeatherHourly24(locationKey: string, apiKey: string): Promise<AWHourly[]> {
  try {
    const { data } = await axios.get<AWHourly[]>(`${AW_BASE}/forecasts/v1/hourly/24hour/${locationKey}`, {
      params: { apikey: apiKey, metric: true },
      timeout: 8000,
    });
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn('[Weather] AccuWeather hourly forecast failed', e);
    return [];
  }
}
