import axios from 'axios';
import type { CurrentWeather, HourlyForecast, RiskLevel } from '../types';
import { RISK, getWeatherLabel, getWeatherIcon } from '../constants/risk';
import { getCachedWeather, setCachedWeather, type WeatherCachePayload } from './weatherCache';
import {
  accuWeatherGeoposition,
  accuWeatherCurrent,
  accuWeatherHourly24,
  accuWeatherIconToWmo,
  type AWCurrent,
  type AWHourly,
} from './accuWeatherService';

const BASE = 'https://api.open-meteo.com/v1/forecast';

interface OpenMeteoResponse {
  current: {
    time:                      number;
    temperature_2m:            number;
    apparent_temperature:      number;
    relative_humidity_2m:      number;
    precipitation_probability?: number;
    precipitation:             number;
    wind_speed_10m:            number;
    wind_gusts_10m?:           number;
    weather_code:              number;
  };
  hourly: {
    time:                      number[];
    temperature_2m:            number[];
    apparent_temperature?:     number[];
    relative_humidity_2m?:     number[];
    precipitation_probability: number[];
    precipitation?:            number[];
    rain?:                     number[];
    showers?:                  number[];
    cloud_cover?:              number[];
    wind_speed_10m?:           number[];
    wind_gusts_10m?:           number[];
    weather_code:              number[];
  };
  minutely_15?: {
    time:          number[];
    precipitation: number[];
    rain?:         number[];
    showers?:      number[];
    weather_code?: number[];
  };
}

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function safeNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function nearestHourlyIndex(times: number[], targetUnix: number): number {
  if (times.length === 0) return -1;
  let best = 0;
  let bestDiff = Math.abs(times[0]! - targetUnix);
  for (let i = 1; i < times.length; i++) {
    const diff = Math.abs(times[i]! - targetUnix);
    if (diff < bestDiff) {
      best = i;
      bestDiff = diff;
    }
  }
  return best;
}

function isRainCode(code: number): boolean {
  return [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(code);
}

function minutelyPrecipForHour(
  minutely: OpenMeteoResponse['minutely_15'],
  hourUnix: number,
): { totalMm: number; wetSlots: number; rainCode: boolean } {
  if (!minutely?.time?.length) return { totalMm: 0, wetSlots: 0, rainCode: false };

  const start = hourUnix;
  const end = hourUnix + 60 * 60;
  let totalMm = 0;
  let wetSlots = 0;
  let rainCode = false;

  for (let i = 0; i < minutely.time.length; i++) {
    const t = minutely.time[i]!;
    if (t < start || t >= end) continue;

    const precip = Math.max(
      safeNumber(minutely.precipitation[i], 0),
      safeNumber(minutely.rain?.[i], 0) + safeNumber(minutely.showers?.[i], 0),
    );
    if (precip > 0.02) wetSlots++;
    totalMm += precip;

    const code = safeNumber(minutely.weather_code?.[i], 0);
    if (isRainCode(code)) rainCode = true;
  }

  return { totalMm: roundOne(totalMm), wetSlots, rainCode };
}

function calibratedRainProbability(args: {
  hourlyProbability: number;
  hourlyPrecipitation: number;
  hourlyRain: number;
  hourlyShowers: number;
  hourlyWeatherCode: number;
  cloudCover: number;
  minutelyTotalMm: number;
  minutelyWetSlots: number;
  minutelyRainCode: boolean;
  hoursFromNow: number;
}): number {
  const base = clampPercent(args.hourlyProbability);
  const hourlyWetMm = Math.max(args.hourlyPrecipitation, args.hourlyRain + args.hourlyShowers);
  const wetCode = isRainCode(args.hourlyWeatherCode) || args.minutelyRainCode;

  let calibrated = base;

  if (args.minutelyTotalMm >= 2) calibrated = Math.max(calibrated, 90);
  else if (args.minutelyTotalMm >= 1) calibrated = Math.max(calibrated, 80);
  else if (args.minutelyTotalMm >= 0.3) calibrated = Math.max(calibrated, 65);
  else if (args.minutelyTotalMm >= 0.1 || args.minutelyWetSlots > 0) calibrated = Math.max(calibrated, 50);
  else if (hourlyWetMm >= 1) calibrated = Math.max(calibrated, 70);
  else if (hourlyWetMm >= 0.3 || wetCode) calibrated = Math.max(calibrated, 55);

  // For the next few hours, a dry 15-minute model is a strong local signal.
  if (args.hoursFromNow <= 3 && args.minutelyTotalMm < 0.05 && !wetCode && hourlyWetMm < 0.1) {
    const dryCap = args.cloudCover >= 85 ? 45 : args.cloudCover >= 65 ? 35 : 25;
    calibrated = Math.min(Math.round(base * 0.65), dryCap);
  }

  return clampPercent(calibrated);
}

function heatIndexC(tempC: number, humidity: number): number {
  if (tempC < 27 || humidity < 40) return tempC;
  const t = (tempC * 9) / 5 + 32;
  const rh = clampPercent(humidity);
  let hi = -42.379
    + 2.04901523 * t
    + 10.14333127 * rh
    - 0.22475541 * t * rh
    - 0.00683783 * t * t
    - 0.05481717 * rh * rh
    + 0.00122874 * t * t * rh
    + 0.00085282 * t * rh * rh
    - 0.00000199 * t * t * rh * rh;

  if (rh < 13 && t >= 80 && t <= 112) {
    hi -= ((13 - rh) / 4) * Math.sqrt((17 - Math.abs(t - 95)) / 17);
  } else if (rh > 85 && t >= 80 && t <= 87) {
    hi += ((rh - 85) / 10) * ((87 - t) / 5);
  }

  return roundOne(((hi - 32) * 5) / 9);
}

function calibratedFeelsLike(tempC: number, apparentC: number, humidity: number): number {
  const heatIndex = heatIndexC(tempC, humidity);
  if (tempC >= 27 && humidity >= 55) {
    return roundOne(Math.max(apparentC, heatIndex));
  }
  return roundOne(apparentC);
}

function blendPercent(primary: number, secondary: number, primaryWeight = 0.6): number {
  const p = clampPercent(primary);
  const s = clampPercent(secondary);
  return clampPercent((p * primaryWeight) + (s * (1 - primaryWeight)));
}

function accuWeatherRainProbability(h: AWHourly): number | undefined {
  const candidates = [
    h.RainProbability,
    h.PrecipitationProbability,
    h.ThunderstormProbability !== undefined ? Math.round(h.ThunderstormProbability * 0.8) : undefined,
  ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (candidates.length === 0) return undefined;
  return Math.max(...candidates.map(clampPercent));
}

/** Max of sustained and gust @ 10 m — matches how conditions feel on a bike or when walking */
export function effectiveWindKmH(w: CurrentWeather): number {
  return Math.round(Math.max(w.windSpeed, w.windGust ?? w.windSpeed));
}

function mergeAccuWeatherReadings(
  om: { current: CurrentWeather; hourly: HourlyForecast[] },
  awCurrent: AWCurrent,
  awHourly: AWHourly[],
): { current: CurrentWeather; hourly: HourlyForecast[] } {
  const nowUnix = Math.floor(Date.now() / 1000);
  const wmo = accuWeatherIconToWmo(awCurrent.WeatherIcon);
  const precipMm =
    awCurrent.PrecipitationSummary?.Precipitation?.Metric?.Value ?? om.current.precipitation;

  let rainProb = om.current.precipitationProbability;
  const nextHr = awHourly.find(h => h.EpochDateTime >= nowUnix);
  const awRainProb = nextHr ? accuWeatherRainProbability(nextHr) : undefined;
  if (awRainProb !== undefined) {
    rainProb = blendPercent(awRainProb, rainProb, 0.65);
  }

  const awHourlyLiquid = nextHr
    ? Math.max(
      safeNumber(nextHr.TotalLiquid?.Value, 0),
      safeNumber(nextHr.Rain?.Value, 0),
    )
    : 0;

  const current: CurrentWeather = {
    ...om.current,
    temperature:              roundOne(awCurrent.Temperature.Metric.Value),
    feelsLike:                calibratedFeelsLike(
      awCurrent.Temperature.Metric.Value,
      awCurrent.RealFeelTemperature.Metric.Value,
      awCurrent.RelativeHumidity,
    ),
    humidity:                 awCurrent.RelativeHumidity,
    windSpeed:                Math.round(awCurrent.Wind.Speed.Metric.Value),
    precipitation:            roundOne(Math.max(precipMm, awHourlyLiquid)),
    precipitationProbability: rainProb,
    weatherCode:              wmo,
    weatherLabel:             awCurrent.WeatherText?.trim() || getWeatherLabel(wmo),
    weatherIcon:              getWeatherIcon(wmo),
    updatedAt:                new Date(awCurrent.EpochTime * 1000).toISOString(),
    windGust:                 undefined,
  };

  const hourly: HourlyForecast[] = [];
  for (const h of awHourly) {
    if (h.EpochDateTime < nowUnix) continue;
    const code = accuWeatherIconToWmo(h.WeatherIcon);
    const omSameHour = om.hourly.find(row => row.time === new Date(h.EpochDateTime * 1000).toLocaleTimeString('en-PH', {
      hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Manila',
    }));
    const awProb = accuWeatherRainProbability(h);
    const omProb = omSameHour?.precipitationProbability ?? 0;
    const liquidMm = Math.max(safeNumber(h.TotalLiquid?.Value, 0), safeNumber(h.Rain?.Value, 0));
    const rainProbability = awProb !== undefined
      ? blendPercent(awProb, omProb, liquidMm > 0 ? 0.75 : 0.65)
      : omProb;

    hourly.push({
      time: new Date(h.EpochDateTime * 1000).toLocaleTimeString('en-PH', {
        hour:   '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: 'Asia/Manila',
      }),
      temperature: roundOne(h.Temperature.Value),
      weatherCode: code,
      weatherIcon: getWeatherIcon(code),
      precipitationProbability: rainProbability,
    });
    if (hourly.length >= 6) break;
  }

  if (hourly.length < 6) {
    const seen = new Set(hourly.map(h => h.time));
    for (const h of om.hourly) {
      if (hourly.length >= 6) break;
      if (!seen.has(h.time)) {
        hourly.push(h);
        seen.add(h.time);
      }
    }
  }

  return { current, hourly: hourly.slice(0, 6) };
}

function mergeAccuWeatherCurrentOnly(base: CurrentWeather, aw: AWCurrent): CurrentWeather {
  const wmo = accuWeatherIconToWmo(aw.WeatherIcon);
  const precipMm = aw.PrecipitationSummary?.Precipitation?.Metric?.Value ?? base.precipitation;
  return {
    ...base,
    temperature:   roundOne(aw.Temperature.Metric.Value),
    feelsLike:       calibratedFeelsLike(
      aw.Temperature.Metric.Value,
      aw.RealFeelTemperature.Metric.Value,
      aw.RelativeHumidity,
    ),
    humidity:        aw.RelativeHumidity,
    windSpeed:       Math.round(aw.Wind.Speed.Metric.Value),
    precipitation:   precipMm,
    weatherCode:     wmo,
    weatherLabel:    aw.WeatherText?.trim() || getWeatherLabel(wmo),
    weatherIcon:     getWeatherIcon(wmo),
    updatedAt:       new Date(aw.EpochTime * 1000).toISOString(),
    windGust:        undefined,
  };
}

async function fetchOpenMeteoForecast(lat: number, lon: number): Promise<{
  current: CurrentWeather;
  hourly: HourlyForecast[];
}> {
  // DEM elevation sharpens statistical downscaling for hills/coasts (same grid Open-Meteo uses for cells)
  let demElevation: number | undefined;
  try {
    const { data } = await axios.get<{ elevation: number[] }>(
      'https://api.open-meteo.com/v1/elevation',
      { params: { latitude: lat, longitude: lon }, timeout: 4000 },
    );
    const e = data?.elevation?.[0];
    if (typeof e === 'number' && Number.isFinite(e)) demElevation = e;
  } catch {
    /* forecast still valid without explicit elevation */
  }

  const params = new URLSearchParams({
    latitude: lat.toString(), longitude: lon.toString(),
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation_probability,precipitation,wind_speed_10m,wind_gusts_10m,weather_code',
    hourly: 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation_probability,precipitation,rain,showers,cloud_cover,wind_speed_10m,wind_gusts_10m,weather_code',
    minutely_15: 'precipitation,rain,showers,weather_code',
    timezone: 'Asia/Manila',
    forecast_days: '1',
    forecast_hours: '12',
    forecast_minutely_15: '24',
    wind_speed_unit: 'kmh',
    temperature_unit: 'celsius',
    precipitation_unit: 'mm',
    timeformat: 'unixtime',
  });
  if (demElevation !== undefined) params.set('elevation', String(Math.round(demElevation)));

  let data: OpenMeteoResponse;
  try {
    const res = await axios.get<OpenMeteoResponse>(`${BASE}?${params}`, { timeout: 12000 });
    data = res.data;
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 429) {
      console.warn('[Weather] 429 — retry in 3s');
      await new Promise(r => setTimeout(r, 3000));
      const retry = await axios.get<OpenMeteoResponse>(`${BASE}?${params}`, { timeout: 12000 });
      data = retry.data;
    } else throw err;
  }

  const c = data.current;
  const obsUnix = typeof c.time === 'number' && !Number.isNaN(c.time) ? c.time : Math.floor(Date.now() / 1000);
  const nowUnix = Math.floor(Date.now() / 1000);
  const nearestIdx = nearestHourlyIndex(data.hourly.time, obsUnix);
  const nearestRainProb = nearestIdx >= 0
    ? safeNumber(data.hourly.precipitation_probability[nearestIdx], 0)
    : 0;
  const nearestPrecip = nearestIdx >= 0
    ? Math.max(
      safeNumber(data.hourly.precipitation?.[nearestIdx], c.precipitation),
      safeNumber(data.hourly.rain?.[nearestIdx], 0) + safeNumber(data.hourly.showers?.[nearestIdx], 0),
    )
    : c.precipitation;
  const nearestHumidity = nearestIdx >= 0
    ? safeNumber(data.hourly.relative_humidity_2m?.[nearestIdx], c.relative_humidity_2m)
    : c.relative_humidity_2m;
  const nearestFeelsLike = nearestIdx >= 0
    ? safeNumber(data.hourly.apparent_temperature?.[nearestIdx], c.apparent_temperature)
    : c.apparent_temperature;
  const gustRaw = c.wind_gusts_10m;
  const gust = typeof gustRaw === 'number' && Number.isFinite(gustRaw) ? Math.round(gustRaw) : undefined;
  const nearestMinutely = minutelyPrecipForHour(data.minutely_15, obsUnix - (obsUnix % 3600));
  const rainProbability = calibratedRainProbability({
    hourlyProbability: c.precipitation_probability ?? nearestRainProb,
    hourlyPrecipitation: safeNumber(data.hourly.precipitation?.[nearestIdx], c.precipitation),
    hourlyRain: safeNumber(data.hourly.rain?.[nearestIdx], 0),
    hourlyShowers: safeNumber(data.hourly.showers?.[nearestIdx], 0),
    hourlyWeatherCode: safeNumber(data.hourly.weather_code[nearestIdx], c.weather_code),
    cloudCover: safeNumber(data.hourly.cloud_cover?.[nearestIdx], 100),
    minutelyTotalMm: nearestMinutely.totalMm,
    minutelyWetSlots: nearestMinutely.wetSlots,
    minutelyRainCode: nearestMinutely.rainCode,
    hoursFromNow: 0,
  });

  const current: CurrentWeather = {
    temperature:              roundOne(safeNumber(c.temperature_2m)),
    feelsLike:                calibratedFeelsLike(
      safeNumber(c.temperature_2m),
      nearestFeelsLike,
      nearestHumidity,
    ),
    humidity:                 clampPercent(nearestHumidity),
    precipitationProbability: clampPercent(rainProbability),
    precipitation:            roundOne(nearestPrecip),
    windSpeed:                Math.round(safeNumber(c.wind_speed_10m)),
    windGust:                 gust !== undefined && gust > 0 ? gust : undefined,
    weatherCode:              c.weather_code,
    weatherLabel:             getWeatherLabel(c.weather_code),
    weatherIcon:              getWeatherIcon(c.weather_code),
    updatedAt:                new Date(obsUnix * 1000).toISOString(),
  };

  const hourly: HourlyForecast[] = [];
  for (let i = 0; i < data.hourly.time.length && hourly.length < 6; i++) {
    const hourUnix = data.hourly.time[i];
    if (hourUnix >= nowUnix - 15 * 60) {
      const code = safeNumber(data.hourly.weather_code[i], c.weather_code);
      const minutely = minutelyPrecipForHour(data.minutely_15, hourUnix);
      const hoursFromNow = Math.max(0, (hourUnix - nowUnix) / 3600);
      hourly.push({
        time: new Date(hourUnix * 1000).toLocaleTimeString('en-PH', {
          hour:   '2-digit',
          minute: '2-digit',
          hour12: true,
          timeZone: 'Asia/Manila',
        }),
        temperature: roundOne(safeNumber(data.hourly.temperature_2m[i], c.temperature_2m)),
        weatherCode: code,
        weatherIcon: getWeatherIcon(code),
        precipitationProbability: calibratedRainProbability({
          hourlyProbability: safeNumber(data.hourly.precipitation_probability[i], 0),
          hourlyPrecipitation: safeNumber(data.hourly.precipitation?.[i], 0),
          hourlyRain: safeNumber(data.hourly.rain?.[i], 0),
          hourlyShowers: safeNumber(data.hourly.showers?.[i], 0),
          hourlyWeatherCode: code,
          cloudCover: safeNumber(data.hourly.cloud_cover?.[i], 100),
          minutelyTotalMm: minutely.totalMm,
          minutelyWetSlots: minutely.wetSlots,
          minutelyRainCode: minutely.rainCode,
          hoursFromNow,
        }),
      });
    }
  }

  return { current, hourly };
}

export async function fetchWeatherData(lat: number, lon: number): Promise<{
  current: CurrentWeather;
  hourly: HourlyForecast[];
  weatherRisk: RiskLevel;
  providerPlaceName?: string;
}> {
  const cached = getCachedWeather(lat, lon);
  if (cached) {
    return {
      current:              cached.current,
      hourly:               cached.hourly,
      weatherRisk:          cached.weatherRisk,
      ...(cached.providerPlaceName ? { providerPlaceName: cached.providerPlaceName } : {}),
    };
  }

  const awKey = process.env.ACCUWEATHER_API_KEY?.trim();
  const om = await fetchOpenMeteoForecast(lat, lon);

  if (!awKey) {
    const payload: WeatherCachePayload = {
      current: om.current,
      hourly: om.hourly,
      weatherRisk: evaluateWeatherRisk(om.current),
    };
    setCachedWeather(lat, lon, payload);
    return payload;
  }

  const awGeo = await accuWeatherGeoposition(lat, lon, awKey);
  if (!awGeo?.locationKey) {
    const payload: WeatherCachePayload = {
      current: om.current,
      hourly: om.hourly,
      weatherRisk: evaluateWeatherRisk(om.current),
    };
    setCachedWeather(lat, lon, payload);
    return payload;
  }

  const [awCur, awHr] = await Promise.all([
    accuWeatherCurrent(awGeo.locationKey, awKey),
    accuWeatherHourly24(awGeo.locationKey, awKey),
  ]);

  let mergedCurrent = om.current;
  let mergedHourly = om.hourly;

  if (awCur && awHr.length > 0) {
    const merged = mergeAccuWeatherReadings(om, awCur, awHr);
    mergedCurrent = merged.current;
    mergedHourly = merged.hourly;
  } else if (awCur) {
    mergedCurrent = mergeAccuWeatherCurrentOnly(om.current, awCur);
  }

  const placeSanitized = awGeo.placeName
    ? awGeo.placeName.replace(/^City of /i, '').replace(/^Municipality of /i, '').trim()
    : '';

  const payload: WeatherCachePayload = {
    current: mergedCurrent,
    hourly: mergedHourly,
    weatherRisk: evaluateWeatherRisk(mergedCurrent),
    ...(placeSanitized ? { providerPlaceName: placeSanitized } : {}),
  };

  setCachedWeather(lat, lon, payload);
  return payload;
}

// ─────────────────────────────────────────────────────────────────
// evaluateWeatherRisk — precipitation probability only
// Used for dashboard + Go/No-Go "weather risk" chip. Heat, wind,
// hourly precip, etc. appear in other factors (tips, flood, HEAT row).
// Thresholds from RISK.WEATHER RAIN_HIGH / RAIN_MED (%).
// ─────────────────────────────────────────────────────────────────
export function evaluateWeatherRisk(w: CurrentWeather): RiskLevel {
  const R = RISK.WEATHER;
  const p = w.precipitationProbability;
  if (p >= R.RAIN_HIGH) return 'HIGH';
  if (p >= R.RAIN_MED) return 'MEDIUM';
  return 'LOW';
}

// ─────────────────────────────────────────────────────────────────
// buildWeatherBasis — ABSOLUTE STRICT, value-gated
// Every part only included if its value >= its threshold.
// No hardcoded strings like "Traffic slowed by rain".
// ─────────────────────────────────────────────────────────────────
export function buildWeatherBasis(
  w: CurrentWeather,
  weatherRisk: RiskLevel,
  trafficRisk: RiskLevel,
  trafficRatio?: number,
  floodRisk?: RiskLevel,
  elevation?: number,
): string {
  const R = RISK.WEATHER;
  const parts: string[] = [];

  if (w.precipitationProbability >= R.RAIN_MED)  parts.push(`Rain prob ${w.precipitationProbability}%`);
  const wEff = effectiveWindKmH(w);
  if (wEff >= R.WIND_MED) {
    parts.push(
      w.windGust !== undefined && w.windGust > w.windSpeed
        ? `Wind ${w.windSpeed} km/h · gusts ${w.windGust}`
        : `Wind ${wEff} km/h`,
    );
  }
  if (w.feelsLike                >= R.HEAT_MED)  parts.push(`Heat index ${w.feelsLike}°C`);
  if (w.precipitation            >= 3)            parts.push(`Precipitation ${w.precipitation}mm`);

  if ((trafficRisk === 'MEDIUM' || trafficRisk === 'HIGH') && trafficRatio !== undefined)
    parts.push(`Traffic flow ${Math.round(trafficRatio * 100)}%`);

  if (floodRisk && floodRisk !== 'LOW' && floodRisk !== 'UNKNOWN'
      && elevation !== undefined && elevation >= 0)
    parts.push(`Elevation ${elevation}m`);

  if (parts.length === 0) {
    if (trafficRisk === 'MEDIUM' && trafficRatio !== undefined)
      return `Traffic flow ${Math.round(trafficRatio * 100)}%`;
    if (trafficRisk === 'HIGH') return 'Heavy traffic congestion';
    return 'Clear skies, light traffic — safe to commute';
  }
  return `Based on ${parts.join(' · ')}`;
}

// ─────────────────────────────────────────────────────────────────
// getCommuteTips — value-gated, no false positives
// ─────────────────────────────────────────────────────────────────
export function getCommuteTips(
  weatherRisk: RiskLevel,
  trafficRisk: RiskLevel,
  floodRisk:   RiskLevel,
  weather?:    CurrentWeather,
): string[] {
  const tips: string[] = [];
  const R = RISK.WEATHER;
  const rain    = weather?.precipitationProbability ?? 0;
  const precip  = weather?.precipitation ?? 0;
  const feelsLk = weather?.feelsLike ?? 0;
  const wind    = weather ? effectiveWindKmH(weather) : 0;
  const wCode   = weather?.weatherCode ?? 0;
  const isRain  = precip >= 1 || [51,53,55,61,63,65,80,81,82,95,96,99].includes(wCode);
  const phtH    = (new Date().getUTCHours() + 8) % 24;
  const isDay   = phtH >= 6 && phtH < 18;

  if (rain >= R.RAIN_HIGH)    { tips.push('Heavy rain — bring umbrella and raincoat'); tips.push('Leave 20–30 min earlier'); }
  else if (isRain)              tips.push('It is raining — bring an umbrella');
  else if (rain >= 40)          tips.push('Rain likely — bring umbrella just in case');
  else if (rain >= 20)          tips.push('Slight rain chance — consider an umbrella');

  if (isDay && feelsLk >= R.HEAT_HIGH)  tips.push('Extreme heat — wear light clothing and carry water');
  else if (isDay && feelsLk >= R.HEAT_MED) tips.push('Hot day — stay hydrated');

  if (wind >= R.WIND_HIGH) tips.push('Strong winds — careful on motorcycles');
  else if (wind >= R.WIND_MED) tips.push('Breezy — secure loose items');

  if (trafficRisk === 'HIGH')        tips.push('Heavy traffic — budget extra time and ₱200 for Maxim');
  else if (trafficRisk === 'MEDIUM') tips.push('Moderate traffic — allow a few extra minutes');
  else if (trafficRisk === 'LOW' && tips.length === 0) tips.push('Light traffic — smooth commute expected');

  if (floodRisk === 'HIGH')        tips.push('Flood risk — avoid low-lying roads');
  else if (floodRisk === 'MEDIUM') tips.push('Possible flooding in low-elevation areas');

  return [...new Set(tips)].slice(0, 4);
}
