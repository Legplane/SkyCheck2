import type { RiskLevel } from '../types';

// ─────────────────────────────────────────────────────────────────
// Risk constants — V3, PAGASA-calibrated
// Must stay in sync with skycheck-backend/src/constants/risk.ts
// ─────────────────────────────────────────────────────────────────

export const RISK = {
  WEATHER: {
    RAIN_HIGH:  60,   // % precipitation probability → HIGH
    RAIN_MED:   40,   // % → MEDIUM  (was 30 — raised to reduce false alerts)
    WIND_HIGH:  50,   // km/h → HIGH  (was 15 — 15 km/h is just a breeze)
    WIND_MED:   30,   // km/h → MEDIUM (was 10)
    HEAT_HIGH:  42,   // °C apparent → HIGH  (PAGASA "Danger" level)
    HEAT_MED:   33,   // °C apparent → MEDIUM (PAGASA "Extreme Caution")
  },
  TRAFFIC: {
    RATIO_HIGH: 0.50,
    RATIO_MED:  0.75,
  },
  FLOOD: {
    ELEV_HIGH:       8,
    ELEV_MED:       20,
    RAIN_PROB_HIGH: 55,
    RAIN_PROB_MED:  35,
    PRECIP_HIGH:     8,
  },
} as const;

export const RISK_COLORS: Record<RiskLevel, string> = {
  HIGH:    'bg-red-500   text-white',
  MEDIUM:  'bg-amber-500 text-white',
  LOW:     'bg-green-500 text-white',
  UNKNOWN: 'bg-gray-400  text-white',
};

export const RISK_BORDER_COLORS: Record<RiskLevel, string> = {
  HIGH:    'border-red-500',
  MEDIUM:  'border-amber-500',
  LOW:     'border-green-500',
  UNKNOWN: 'border-gray-400',
};

export const RISK_TEXT_COLORS: Record<RiskLevel, string> = {
  HIGH:    'text-red-600',
  MEDIUM:  'text-amber-600',
  LOW:     'text-green-600',
  UNKNOWN: 'text-gray-500',
};

export const RISK_BG_LIGHT: Record<RiskLevel, string> = {
  HIGH:    'bg-red-50   border border-red-200',
  MEDIUM:  'bg-amber-50 border border-amber-200',
  LOW:     'bg-green-50 border border-green-200',
  UNKNOWN: 'bg-gray-50  border border-gray-200',
};

export const RISK_LABELS: Record<RiskLevel, string> = {
  HIGH:    'HIGH RISK',
  MEDIUM:  'MEDIUM RISK',
  LOW:     'LOW RISK',
  UNKNOWN: 'UNKNOWN',
};

export const RISK_EMOJI: Record<RiskLevel, string> = {
  HIGH:    '🔴',
  MEDIUM:  '🟡',
  LOW:     '🟢',
  UNKNOWN: '⚪',
};

export function riskScore(level: RiskLevel): number {
  return { HIGH: 3, MEDIUM: 2, LOW: 1, UNKNOWN: 0 }[level];
}

export function maxRisk(...levels: RiskLevel[]): RiskLevel {
  return levels.reduce(
    (best, l) => riskScore(l) > riskScore(best) ? l : best,
    'LOW' as RiskLevel,
  );
}
