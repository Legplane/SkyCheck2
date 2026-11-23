import axios from 'axios';
import type { CurrentWeather, HourlyForecast } from '../types';
import { getWeatherLabel, getWeatherIcon } from '../constants/risk';

// ─────────────────────────────────────────────────────────────────
// MET Norway Locationforecast — free, no API key, no daily cap.
// Used as a FALLBACK when Open-Meteo returns 429 (its free tier is
// limited per IP, and Render shares egress IPs between customers).
// Terms: https://api.met.no/doc/TermsOfService — requires an
// identifying User-Agent. Set MET_NO_USER_AGENT to your app + contact.
// ─────────────────────────────────────────────────────────────────

const MET_URL = 'https://api.met.no/weatherapi/locationforecast/2.0/complete';
const USER_AGENT =
  process.env.MET_NO_USER_AGENT?.trim() || 'SkyCheck/1.0 (https://github.com/skycheck; contact: set MET_NO_USER_AGENT)';

interface MetDetails {
  air_temperature?: number;
  relative_humidity?: number;
  wind_speed?: number;           // m/s
  wind_speed_of_gust?: number;   // m/s
  cloud_area_fraction?: number;
  precipitation_amount?: number;
  probability_of_precipitation?: number;
}
interface MetStep {
  time: string;
  data: {
    instant: { details: MetDetails };
    next_1_hours?: { summary?: { symbol_code?: string }; details?: MetDetails };
    next_6_hours?: { summary?: { symbol_code?: string }; details?: MetDetails };
  };
}
interface MetResponse {
  properties: { timeseries: MetStep[] };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** MET symbol_code (e.g. "lightrainshowers_day") → WMO code used by the rest of the app */
export function metSymbolToWmo(symbol?: string): number {
  if (!symbol) return 3;
  const s = symbol.replace(/_(day|night|polartwilight)$/, '');
  if (s.includes('thunder')) return 95;
  if (s.includes('sleet') || s.includes('snow')) return 63;
  if (s === 'heavyrain') return 65;
  if (s === 'heavyrainshowers') return 82;
  if (s === 'rainshowers') return 81;
  if (s === 'lightrainshowers') return 80;
  if (s === 'rain') return 63;
  if (s === 'lightrain') return 61;
  if (s === 'fog') return 45;
  if (s === 'clearsky') return 0;
  if (s === 'fair') return 1;
  if (s === 'partlycloudy') return 2;
  return 3; // cloudy / unknown
}

function rainProbability(details: MetDetails | undefined, wmo: number, cloud: number): number {
  const mm = num(details?.precipitation_amount);
  const given = details?.probability_of_precipitation;
  if (typeof given === 'number' && Number.isFinite(given)) return clamp(given);
  // MET often omits probability outside the Nordics — derive from amount + symbol.
  let p = 0;
  if (mm >= 2.5) p = 90;
  else if (mm >= 1) p = 80;
  else if (mm >= 0.3) p = 65;
  else if (mm > 0) p = 45;
  if ([95, 96, 99, 65, 82].includes(wmo)) p = Math.max(p, 85);
  else if ([61, 63, 80, 81].includes(wmo)) p = Math.max(p, 60);
  else if (p === 0 && wmo === 3 && cloud >= 90) p = 10;
  return clamp(p);
}

/** Steadman apparent temperature (°C) — same family of formula Open-Meteo uses */
function apparentTemp(tC: number, rh: number, windMs: number): number {
  const e = (rh / 100) * 6.105 * Math.exp((17.27 * tC) / (237.7 + tC));
  return tC + 0.33 * e - 0.7 * windMs - 4;
}

const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-PH', {
    hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Manila',
  });

export async function fetchMetNorwayForecast(lat: number, lon: number): Promise<{
  current: CurrentWeather;
  hourly: HourlyForecast[];
}> {
  const { data } = await axios.get<MetResponse>(MET_URL, {
    params: { lat: lat.toFixed(4), lon: lon.toFixed(4) },
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    timeout: 10000,
  });

  const series = data?.properties?.timeseries ?? [];
  if (series.length === 0) throw new Error('MET Norway returned no timeseries');

  const nowMs = Date.now();
  // Latest step that is not in the future = "current"
  let idx = 0;
  for (let i = 0; i < series.length; i++) {
    if (new Date(series[i].time).getTime() <= nowMs) idx = i; else break;
  }

  const step = series[idx];
  const inst = step.data.instant.details;
  const next1 = step.data.next_1_hours;
  const wmo = metSymbolToWmo(next1?.summary?.symbol_code ?? step.data.next_6_hours?.summary?.symbol_code);
  const temp = num(inst.air_temperature, 28);
  const rh = num(inst.relative_humidity, 75);
  const windMs = num(inst.wind_speed);
  const gustKmh = inst.wind_speed_of_gust !== undefined ? Math.round(num(inst.wind_speed_of_gust) * 3.6) : undefined;
  const cloud = num(inst.cloud_area_fraction, 50);
  const mm = num(next1?.details?.precipitation_amount);

  const current: CurrentWeather = {
    temperature: round1(temp),
    feelsLike: round1(apparentTemp(temp, rh, windMs)),
    humidity: clamp(rh),
    precipitationProbability: rainProbability(next1?.details, wmo, cloud),
    precipitation: round1(mm),
    windSpeed: Math.round(windMs * 3.6),
    windGust: gustKmh && gustKmh > 0 ? gustKmh : undefined,
    weatherCode: wmo,
    weatherLabel: getWeatherLabel(wmo),
    weatherIcon: getWeatherIcon(wmo),
    updatedAt: new Date(step.time).toISOString(),
  };

  const hourly: HourlyForecast[] = [];
  for (let i = idx + 1; i < series.length && hourly.length < 6; i++) {
    const s = series[i];
    const n1 = s.data.next_1_hours;
    if (!n1) break; // beyond ~60h MET only gives 6-hourly steps
    const code = metSymbolToWmo(n1.summary?.symbol_code);
    hourly.push({
      time: timeLabel(s.time),
      temperature: round1(num(s.data.instant.details.air_temperature, temp)),
      weatherCode: code,
      weatherIcon: getWeatherIcon(code),
      precipitationProbability: rainProbability(n1.details, code, num(s.data.instant.details.cloud_area_fraction, 50)),
    });
  }

  return { current, hourly };
}
