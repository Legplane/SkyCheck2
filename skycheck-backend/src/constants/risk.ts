import type { RiskLevel } from '../types';

// ─────────────────────────────────────────────────────────────────
// SkyCheck Risk Thresholds V3 — Calibrated for the Philippines
//
// Sources:
//   Weather: PAGASA Heat Index Chart (2023), PAGASA Wind Advisory
//   Flood:   PHIVOLCS/NDRRMC Central Luzon Flood Hazard Data
//   Traffic: MMDA Traffic Engineering report (Metro Luzon corridors)
// ─────────────────────────────────────────────────────────────────

export const RISK = {
  WEATHER: {
    // ── Rain ─────────────────────────────────────────────────────
    // PAGASA "Thunderstorm Warning" threshold is ~60% prob
    RAIN_HIGH:  70,   // % precipitation probability → HIGH weather risk
    RAIN_MED:   40,   // % → MEDIUM weather risk (was 30 — too sensitive for PH)

    // ── Wind ─────────────────────────────────────────────────────
    // PAGASA Signal No. 1 begins at sustained winds of 60 km/h.
    // 15 km/h is a light breeze — safe for commuting.
    // 30 km/h = "fresh breeze" — starts affecting bikes & motorcycles
    // 50 km/h = "strong breeze" — dangerous for open vehicles
    WIND_HIGH:  50,   // km/h → HIGH (was 15 — way too low)
    WIND_MED:   30,   // km/h → MEDIUM (was 10)

    // ── Heat Index (PAGASA scale) ────────────────────────────────
    // 27–32°C  = Caution
    // 33–41°C  = Extreme Caution  ← MEDIUM threshold
    // 42–51°C  = Danger           ← HIGH threshold
    // 52°C+    = Extreme Danger
    HEAT_HIGH:  42,   // °C apparent → HIGH (unchanged — correct)
    HEAT_MED:   33,   // °C apparent → MEDIUM (was 38 — too lenient; 38°C is well into danger)

    // Weather risk tier (HIGH/MEDIUM/LOW) is driven only by RAIN_* above —
    // see evaluateWeatherRisk() in weatherService.ts. Wind / heat use the
    // separate thresholds in commute tips and the HEAT assessment factor.
  },
  TRAFFIC: {
    // currentSpeed / freeFlowSpeed ratio
    // < 0.50 = severely congested (HIGH)
    // < 0.75 = moderate congestion (MEDIUM)
    RATIO_HIGH: 0.50,
    RATIO_MED:  0.75,
  },
  FLOOD: {
    // Elevation thresholds (metres ASL) — Central Luzon calibrated
    ELEV_HIGH:  8,    // ≤8m = critical flood zone (Pampanga lowlands, coastal)
    ELEV_MED:   20,   // ≤20m = moderate flood zone (lower Subic, riverine Zambales)

    // Rainfall triggers
    RAIN_PROB_HIGH: 70,   // % → significant flood risk
    RAIN_PROB_MED:  45,   // %
    PRECIP_HIGH:     8,   // mm accumulated → heavy runoff
    PRECIP_MED:      3,   // mm
  },
  ROUTE:  { MAX_PER_USER: 5, CRON_INTERVAL_MIN: 15 },
  AUTH:   { MAX_FAILED: 5, LOCK_MINUTES: 15, JWT_EXPIRE: '24h', VERIFY_EXPIRE_H: 24, RESET_EXPIRE_H: 1 },
} as const;

export function riskScore(level: RiskLevel): number {
  return { HIGH: 3, MEDIUM: 2, LOW: 1, UNKNOWN: 0 }[level];
}

export function maxRisk(...levels: RiskLevel[]): RiskLevel {
  return levels.reduce((best, l) => riskScore(l) > riskScore(best) ? l : best, 'LOW' as RiskLevel);
}

export function getWeatherLabel(code: number): string {
  const map: Record<number, string> = {
    0: 'Clear Sky', 1: 'Mainly Clear', 2: 'Partly Cloudy', 3: 'Overcast',
    45: 'Foggy', 48: 'Icy Fog',
    51: 'Light Drizzle', 53: 'Drizzle', 55: 'Heavy Drizzle',
    61: 'Slight Rain', 63: 'Moderate Rain', 65: 'Heavy Rain',
    80: 'Rain Showers', 81: 'Rain Showers', 82: 'Violent Showers',
    95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Thunderstorm',
  };
  return map[code] ?? 'Unknown';
}

export function getWeatherIcon(code: number): string {
  if ([0, 1].includes(code))        return '☀️';
  if ([2, 3].includes(code))        return '⛅';
  if ([45, 48].includes(code))      return '🌫️';
  if ([51, 53, 55, 61, 63].includes(code)) return '🌧️';
  if ([65, 82].includes(code))      return '⛈️';
  if ([80, 81].includes(code))      return '🌦️';
  if ([95, 96, 99].includes(code))  return '⛈️';
  return '🌡️';
}
