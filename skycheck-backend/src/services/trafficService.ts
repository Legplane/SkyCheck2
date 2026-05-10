import axios from 'axios';
import type { TrafficResult, RiskLevel } from '../types';
import { RISK } from '../constants/risk';

// ─────────────────────────────────────────────────────────────────
// Traffic Service — TomTom Traffic Flow API
// ─────────────────────────────────────────────────────────────────
// WHY TomTom:
//   • Completely free, NO credit card required — ever
//   • 2,500 non-tile requests/day free Freemium plan
//   • Sign up at: https://developer.tomtom.com
//   • Good Philippines urban coverage (Olongapo, Subic, Metro Manila)
//
// Automatic fallback:
//   If TOMTOM_API_KEY is missing OR TomTom returns an error, the
//   service falls back to a Philippines-specific time-of-day
//   rush-hour heuristic — giving a useful estimate instead of UNKNOWN.
// ─────────────────────────────────────────────────────────────────

const TOMTOM_BASE = 'https://api.tomtom.com/traffic/services/4/flowSegmentData/relative0/10/json';

interface TomTomFlowResponse {
  flowSegmentData: {
    currentSpeed:       number;
    freeFlowSpeed:      number;
    currentTravelTime:  number;
    freeFlowTravelTime: number;
    confidence:         number;
    roadClosure:        boolean;
  };
}

export async function fetchTrafficLevel(lat: number, lon: number): Promise<TrafficResult> {
  const TOMTOM_KEY = process.env.TOMTOM_API_KEY;

  if (TOMTOM_KEY) {
    try {
      const { data } = await axios.get<TomTomFlowResponse>(TOMTOM_BASE, {
        params: { key: TOMTOM_KEY, point: `${lat},${lon}` },
        timeout: 6000,
      });

      const { currentSpeed, freeFlowSpeed, confidence, roadClosure } = data.flowSegmentData;

      if (confidence < 0.3 || roadClosure) {
        return rushHourFallback('low confidence');
      }

      const ratio = freeFlowSpeed > 0 ? currentSpeed / freeFlowSpeed : 1;
      return {
        congestionRatio: Math.round(ratio * 100) / 100,
        currentSpeed:    Math.round(currentSpeed),
        freeFlowSpeed:   Math.round(freeFlowSpeed),
        riskLevel:       trafficRiskFromRatio(ratio),
        source:          'tomtom',
      };
    } catch (err: unknown) {
      const status = axios.isAxiosError(err) ? err.response?.status : null;
      if (status === 404) return rushHourFallback('no road segment at coordinates');
      if (status === 429) {
        console.warn('[Traffic] TomTom daily limit exceeded — using rush-hour fallback');
        return rushHourFallback('daily limit reached');
      }
      console.error('[Traffic] TomTom error:', err);
      return rushHourFallback('TomTom API unavailable');
    }
  }

  console.warn('[Traffic] TOMTOM_API_KEY not set — using rush-hour heuristic');
  return rushHourFallback('no API key configured');
}

// ─────────────────────────────────────────────────────────────────
// Philippines Rush-Hour Heuristic (PHT = UTC+8)
// Based on MMDA/DPWH published Metro Luzon traffic data.
// Covers Olongapo, Subic, Angeles, Pampanga corridors.
//
//  06:30 – 09:00  Morning rush    → HIGH
//  09:00 – 11:30  Mid-morning     → LOW
//  11:30 – 13:30  Lunch rush      → MEDIUM
//  13:30 – 16:30  Afternoon lull  → LOW
//  16:30 – 20:00  Evening rush    → HIGH
//  20:00 – 06:30  Night           → LOW
// ─────────────────────────────────────────────────────────────────
function manilaWeekend(): boolean {
  const wd = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    weekday: 'short',
  }).format(new Date());
  return wd === 'Sat' || wd === 'Sun';
}

function rushHourFallback(reason: string): TrafficResult {
  const now      = new Date();
  const phtHour  = (now.getUTCHours() + 8) % 24;
  const phtMin   = now.getUTCMinutes();
  const t        = phtHour + phtMin / 60;
  const weekend  = manilaWeekend();

  let riskLevel: RiskLevel;
  let congestionRatio: number;

  // Weekends: same corridor pattern but typically lighter than weekday peaks (MMDA-style buckets softened one notch).
  if      (t >= 6.5  && t < 9.0)  {
    riskLevel = weekend ? 'MEDIUM' : 'HIGH';
    congestionRatio = weekend ? 0.58 : 0.42;
  }
  else if (t >= 9.0  && t < 11.5) { riskLevel = 'LOW';    congestionRatio = weekend ? 0.88 : 0.85; }
  else if (t >= 11.5 && t < 13.5) {
    riskLevel = weekend ? 'LOW' : 'MEDIUM';
    congestionRatio = weekend ? 0.78 : 0.65;
  }
  else if (t >= 13.5 && t < 16.5) { riskLevel = 'LOW';    congestionRatio = 0.88; }
  else if (t >= 16.5 && t < 20.0) {
    riskLevel = weekend ? 'MEDIUM' : 'HIGH';
    congestionRatio = weekend ? 0.52 : 0.38;
  }
  else                              { riskLevel = 'LOW';    congestionRatio = 0.92; }

  console.info(`[Traffic] Heuristic (${reason}) → ${riskLevel} @ PHT ${phtHour}:${String(Math.round(phtMin)).padStart(2,'0')}${weekend ? ' (weekend)' : ''}`);

  return {
    congestionRatio,
    currentSpeed: 0,
    freeFlowSpeed: 0,
    riskLevel,
    source: 'heuristic',
    label: reason,
  };
}

function trafficRiskFromRatio(ratio: number): RiskLevel {
  if (ratio < RISK.TRAFFIC.RATIO_HIGH) return 'HIGH';
  if (ratio < RISK.TRAFFIC.RATIO_MED)  return 'MEDIUM';
  return 'LOW';
}
