import type { RiskLevel, CombinedRisk, CurrentWeather } from '../types';
import { maxRisk, riskScore } from '../constants/risk';
import { evaluateWeatherRisk } from './weatherService';
import { fetchTrafficLevel } from './trafficService';
import { evaluateFloodRisk, evaluateRouteFloodRisk } from './floodService';

// ─────────────────────────────────────────────────────────────────
// Combined Risk Service — V2
//
// For dashboard (single point): evaluates weather + traffic + flood
//   at the user's current GPS location.
//
// For routes (two points): evaluates weather at BOTH start and dest,
//   takes the worst weather; evaluates flood at BOTH points; evaluates
//   traffic at the start point (representative of route conditions).
// ─────────────────────────────────────────────────────────────────

// Dashboard / single-point evaluation
export async function evaluateCombinedRisk(
  lat: number,
  lon: number,
  current: CurrentWeather,
): Promise<CombinedRisk> {
  const [trafficResult, floodResult] = await Promise.allSettled([
    fetchTrafficLevel(lat, lon),
    evaluateFloodRisk(lat, lon, current.precipitationProbability, current.precipitation),
  ]);

  const weatherRisk: RiskLevel = evaluateWeatherRisk(current);
  const trafficRisk: RiskLevel = trafficResult.status === 'fulfilled' ? trafficResult.value.riskLevel : 'UNKNOWN';
  const trafficRatio            = trafficResult.status === 'fulfilled' ? trafficResult.value.congestionRatio : undefined;
  const trafficSource           = trafficResult.status === 'fulfilled' ? trafficResult.value.source : undefined;
  const trafficCurrentKmh       = trafficResult.status === 'fulfilled' ? trafficResult.value.currentSpeed : undefined;
  const trafficFreeFlowKmh      = trafficResult.status === 'fulfilled' ? trafficResult.value.freeFlowSpeed : undefined;
  const floodRisk: RiskLevel    = floodResult.status === 'fulfilled' ? floodResult.value.riskLevel : 'UNKNOWN';
  const elevation               = floodResult.status === 'fulfilled' ? floodResult.value.elevation : undefined;

  const overall = maxRisk(weatherRisk, trafficRisk, floodRisk);
  const basis   = buildBasisText(current, weatherRisk, trafficRisk, floodRisk, trafficRatio, elevation, trafficSource);

  return {
    overall, weather: weatherRisk, traffic: trafficRisk, flood: floodRisk,
    trafficRatio, trafficSource, trafficCurrentKmh, trafficFreeFlowKmh,
    elevation, basis,
  };
}

// Route-aware evaluation — uses BOTH endpoints for weather + flood
export async function evaluateRouteCombinedRisk(
  startLat: number, startLon: number,
  destLat:  number, destLon:  number,
  startWeather: CurrentWeather,
  destWeather:  CurrentWeather,
): Promise<CombinedRisk> {
  // Weather: evaluate both endpoints, take worst
  const startWeatherRisk = evaluateWeatherRisk(startWeather);
  const destWeatherRisk  = evaluateWeatherRisk(destWeather);
  const weatherRisk      = maxRisk(startWeatherRisk, destWeatherRisk);

  // Use the worse weather data for flood and tip generation
  const worstWeather = riskScore(startWeatherRisk) >= riskScore(destWeatherRisk)
    ? startWeather
    : destWeather;

  const [trafficResult, floodResult] = await Promise.allSettled([
    // Traffic at start — most relevant for departure
    fetchTrafficLevel(startLat, startLon),
    // Flood at both endpoints — takes worst (lowest elevation)
    evaluateRouteFloodRisk(
      startLat, startLon, destLat, destLon,
      Math.max(startWeather.precipitationProbability, destWeather.precipitationProbability),
      Math.max(startWeather.precipitation, destWeather.precipitation),
    ),
  ]);

  const trafficRisk: RiskLevel = trafficResult.status === 'fulfilled' ? trafficResult.value.riskLevel : 'UNKNOWN';
  const trafficRatio            = trafficResult.status === 'fulfilled' ? trafficResult.value.congestionRatio : undefined;
  const trafficSource           = trafficResult.status === 'fulfilled' ? trafficResult.value.source : undefined;
  const trafficCurrentKmh       = trafficResult.status === 'fulfilled' ? trafficResult.value.currentSpeed : undefined;
  const trafficFreeFlowKmh      = trafficResult.status === 'fulfilled' ? trafficResult.value.freeFlowSpeed : undefined;
  const floodRisk: RiskLevel    = floodResult.status === 'fulfilled' ? floodResult.value.riskLevel : 'UNKNOWN';
  const elevation               = floodResult.status === 'fulfilled' ? floodResult.value.elevation : undefined;

  const overall = maxRisk(weatherRisk, trafficRisk, floodRisk);
  const basis   = buildBasisText(worstWeather, weatherRisk, trafficRisk, floodRisk, trafficRatio, elevation, trafficSource);

  return {
    overall, weather: weatherRisk, traffic: trafficRisk, flood: floodRisk,
    trafficRatio, trafficSource, trafficCurrentKmh, trafficFreeFlowKmh,
    elevation, basis,
  };
}

// ── Basis text builder ────────────────────────────────────────────
function buildBasisText(
  w: CurrentWeather,
  weatherRisk: RiskLevel,
  trafficRisk: RiskLevel,
  floodRisk:   RiskLevel,
  trafficRatio?: number,
  elevation?: number,
  trafficSource?: 'tomtom' | 'heuristic',
): string {
  const parts: string[] = [];

  if (weatherRisk !== 'LOW') {
    parts.push(`Rain prob ${w.precipitationProbability}%`);
  }

  if (trafficRisk !== 'LOW' && trafficRisk !== 'UNKNOWN' && trafficRatio !== undefined) {
    const label = trafficSource === 'tomtom' ? 'Live traffic flow' : 'Estimated traffic flow';
    parts.push(`${label} ${Math.round(trafficRatio * 100)}%`);
  }

  if (floodRisk !== 'LOW' && elevation !== undefined && elevation >= 0) {
    parts.push(`Elevation ${elevation}m`);
  }

  if (parts.length === 0) return 'Clear conditions — great day to commute!';
  return `Based on ${parts.join(' · ')}`;
}
