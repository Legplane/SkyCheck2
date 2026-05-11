import type { RiskLevel } from '../types';
import { RISK } from '../constants/risk';

// ─────────────────────────────────────────────────────────────────
// Go / No-Go Decision Engine
//
// Inputs:
//   • weatherRisk, floodRisk, trafficRisk, heatIndex
//   • healthScore (computed from HealthCheck)
//   • schoolStatus (F2F | ONLINE | SUSPENDED | HYBRID)
//   • activeGovAdvisories (severity array)
//
// Output:
//   • verdict:  GO | OWN_RISK | DO_NOT_GO
//   • reason:   Primary reason string
//   • factors:  All contributing factors (for display)
//   • score:    0–100 safety score
// ─────────────────────────────────────────────────────────────────

export type GoNoGoVerdict = 'GO' | 'OWN_RISK' | 'DO_NOT_GO';

export interface GoNoGoInput {
  // Weather
  weatherRisk:  RiskLevel;
  floodRisk:    RiskLevel;
  trafficRisk:  RiskLevel;
  heatIndex:    number;       // °C apparent / feels-like (Open-Meteo)
  rainProb:     number;       // 0–100
  windSpeed:    number;       // km/h
  /** Recent hourly precip sum used with flood model (mm) */
  recentPrecipMm?: number;
  /** Terrain elevation metres ASL when flood model resolved it; omit if unknown */
  floodElevationM?: number;

  trafficRatio?: number;       // currentSpeed / freeFlow (TomTom) or heuristic ratio
  trafficSource?: 'tomtom' | 'heuristic';
  trafficCurrentKmh?: number;
  trafficFreeFlowKmh?: number;
  trafficVolumeLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
  trafficLabel?: string;

  // Health
  hasFever:           boolean;
  feverTemp:          number | null;
  hasCough:           boolean;
  hasSoreThroat:      boolean;
  hasFatigue:         boolean;
  hasDifficultyBreath:boolean;
  hasHeadache:        boolean;
  hasBodyPain:        boolean;
  hasVomiting:        boolean;
  hasChronicCondition:boolean;
  overallFeeling:     string;  // well | mild | sick | severe

  // Institutional
  schoolStatus:       string;  // F2F | ONLINE | SUSPENDED | HYBRID
  govSeverities:      string[];// e.g. ['WARNING', 'ADVISORY']
}

export interface GoNoGoResult {
  verdict:      GoNoGoVerdict;
  primaryReason:string;
  factors:      GoNoGoFactor[];
  safetyScore:  number;        // 0–100 (100 = safest)
  recommendation: string;      // one-sentence advice
}

export interface GoNoGoFactor {
  category: 'HEALTH' | 'WEATHER' | 'FLOOD' | 'TRAFFIC' | 'SCHOOL' | 'GOVERNMENT' | 'HEAT';
  label:    string;
  status:   'OK' | 'CAUTION' | 'DANGER';
  detail:   string;
}

function roundMm(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Flood row — combines DEM elevation, rain%, hourly precip (same signals as floodService). */
function buildFloodAssessmentFactor(input: GoNoGoInput): GoNoGoFactor {
  const F = RISK.FLOOD;
  const elev = input.floodElevationM;
  const elevKnown = elev !== undefined && elev >= 0;
  const rain = input.rainProb;
  const mm = input.recentPrecipMm ?? 0;

  if (input.floodRisk === 'HIGH') {
    const geo = elevKnown
      ? ` ~${elev}m ASL ≤${F.ELEV_HIGH}m critical belt — intense runoff when wet.`
      : ' Low coastal / river corridors especially vulnerable.';
    return {
      category: 'FLOOD',
      label: 'Flood Risk',
      status: 'DANGER',
      detail:
        `Heavy inundation potential — rain ${rain}%, ~${roundMm(mm)}mm recent precip.${geo}`,
    };
  }

  if (input.floodRisk === 'MEDIUM') {
    const geo = elevKnown
      ? ` ~${elev}m ASL (≤${F.ELEV_MED}m moderate belt); crosses PH flood-calibrated thresholds at rain ≥${F.RAIN_PROB_MED}% / precip ≥${F.PRECIP_MED}mm.`
      : ` Rain ${rain}% · ~${roundMm(mm)}mm — watch usual ponding spots.`;
    return {
      category: 'FLOOD',
      label: 'Flood Risk',
      status: 'CAUTION',
      detail: `Elevated surface-water risk today.${geo}`,
    };
  }

  if (input.floodRisk === 'UNKNOWN') {
    return {
      category: 'FLOOD',
      label: 'Flood Risk',
      status: 'CAUTION',
      detail:
        `Elevation model unavailable — rainfall-only context (rain ${rain}%, ~${roundMm(mm)}mm). `
        + 'Treat low dips / drainages conservatively.',
    };
  }

  const geo = elevKnown
    ? ` ~${elev}m ASL above calibrated HIGH zone with today's rain (${rain}%, ~${roundMm(mm)}mm).`
    : ` Rain ${rain}% · ~${roundMm(mm)}mm below escalation thresholds once terrain cooperates.`;
  return {
    category: 'FLOOD',
    label: 'Flood Risk',
    status: 'OK',
    detail: `Limited flood concern from rainfall × relief.${geo}`,
  };
}

/** Apparent temperature bands aligned with `RISK.WEATHER` / PAGASA heat-index chart. */
function buildHeatAssessmentFactor(input: GoNoGoInput): GoNoGoFactor {
  const hi = input.heatIndex;
  const H = RISK.WEATHER;
  const r = Math.round(hi);

  if (hi >= H.HEAT_HIGH) {
    return {
      category: 'HEAT',
      label: 'Heat Index',
      status: 'DANGER',
      detail:
        `${r}°C apparent — PAGASA Danger band (≥${H.HEAT_HIGH}°C); heat illness likely under exertion / sun.`,
    };
  }

  if (hi >= H.HEAT_MED) {
    return {
      category: 'HEAT',
      label: 'Heat Index',
      status: 'CAUTION',
      detail:
        `${r}°C apparent — PAGASA Extreme Caution (${H.HEAT_MED}–${H.HEAT_HIGH - 1}°C); hydrate & schedule shade.`,
    };
  }

  return {
    category: 'HEAT',
    label: 'Heat Index',
    status: 'OK',
    detail:
      `${r}°C apparent — below Extreme Caution (${H.HEAT_MED}°C); still hydrate for walking / UV.`,
  };
}

/** TomTom road speeds vs PH weekday/weekend heuristic when API absent. */
function buildTrafficAssessmentFactor(input: GoNoGoInput): GoNoGoFactor {
  const pct =
    input.trafficRatio !== undefined ? Math.round(input.trafficRatio * 100) : undefined;

  if (input.trafficRisk === 'UNKNOWN') {
    return {
      category: 'TRAFFIC',
      label: 'Traffic',
      status: 'CAUTION',
      detail:
        'Live road-speed layer unavailable (configure TOMTOM_API_KEY on the server for GPS-linked flow). '
        + 'Displayed risk falls back to Philippines weekday/weekend rush-hour model.',
    };
  }

  const tomTomLive =
    input.trafficSource === 'tomtom'
    && (input.trafficFreeFlowKmh ?? 0) > 0;

  if (tomTomLive) {
    const cur = input.trafficCurrentKmh ?? 0;
    const ff = input.trafficFreeFlowKmh ?? 0;
    const ratioBit = pct !== undefined ? ` ~${pct}% of free-flow speed.` : '';
    const liveLabel = input.trafficLabel ?? 'Live road-speed reading';
    const status =
      input.trafficRisk === 'HIGH' ? 'DANGER'
      : input.trafficRisk === 'MEDIUM' ? 'CAUTION'
      : 'OK';
    const verb =
      input.trafficRisk === 'HIGH' ? 'Heavy slowdown'
      : input.trafficRisk === 'MEDIUM' ? 'Slower than ideal'
      : 'Road segment moving';
    return {
      category: 'TRAFFIC',
      label: 'Traffic',
      status,
      detail:
        `${liveLabel}: ${verb.toLowerCase()} - observed ~${cur} km/h vs free-flow ~${ff} km/h.${ratioBit} (TomTom)`,
    };
  }

  const ratioBit = pct !== undefined ? ` Modelled flow intensity ~${pct}% of typical free speed.` : '';
  if (input.trafficRisk === 'HIGH') {
    return {
      category: 'TRAFFIC',
      label: 'Traffic',
      status: 'DANGER',
      detail:
        `Peak-hour congestion pattern for Philippines local time — expect long waits / higher fares.${ratioBit} (time-based estimate)`,
    };
  }
  if (input.trafficRisk === 'MEDIUM') {
    return {
      category: 'TRAFFIC',
      label: 'Traffic',
      status: 'CAUTION',
      detail:
        `Moderate delays likely from regional weekday/weekend rush curves.${ratioBit} (time-based estimate)`,
    };
  }
  return {
    category: 'TRAFFIC',
    label: 'Traffic',
    status: 'OK',
    detail:
      `Off-peak / light traffic pattern for this hour.${ratioBit} (time-based estimate)`,
  };
}

export function evaluateGoNoGo(input: GoNoGoInput): GoNoGoResult {
  const factors: GoNoGoFactor[] = [];
  let score = 100;
  let primaryReason = '';
  let verdict: GoNoGoVerdict = 'GO';

  // ── 1. School Status ──────────────────────────────────────────
  if (input.schoolStatus === 'SUSPENDED') {
    factors.push({ category: 'SCHOOL', label: 'Class Status', status: 'DANGER',
      detail: 'Classes are officially suspended — no need to travel' });
    score -= 100;
    primaryReason = 'Classes are suspended';
    verdict = 'DO_NOT_GO';
  } else if (input.schoolStatus === 'ONLINE') {
    factors.push({ category: 'SCHOOL', label: 'Class Status', status: 'CAUTION',
      detail: 'Classes are online — commuting is not required' });
    score -= 40;
    if (verdict === 'GO') { verdict = 'OWN_RISK'; primaryReason = 'Classes are online today'; }
  } else if (input.schoolStatus === 'HYBRID') {
    factors.push({ category: 'SCHOOL', label: 'Class Status', status: 'CAUTION',
      detail: 'Hybrid setup — check which subjects require physical attendance' });
    score -= 10;
  } else {
    factors.push({ category: 'SCHOOL', label: 'Class Status', status: 'OK',
      detail: 'Face-to-face classes are on schedule' });
  }

  // ── 2. Government Advisories ──────────────────────────────────
  const hasCritical = input.govSeverities.includes('CRITICAL');
  const hasWarning  = input.govSeverities.includes('WARNING');
  const hasAdvisory = input.govSeverities.includes('ADVISORY');

  if (hasCritical) {
    factors.push({ category: 'GOVERNMENT', label: 'Gov Advisory', status: 'DANGER',
      detail: 'Critical government advisory in effect — travel is discouraged' });
    score -= 80;
    if (verdict !== 'DO_NOT_GO') { verdict = 'DO_NOT_GO'; primaryReason = 'Critical government advisory'; }
  } else if (hasWarning) {
    factors.push({ category: 'GOVERNMENT', label: 'Gov Advisory', status: 'DANGER',
      detail: 'Government weather warning in effect' });
    score -= 35;
    if (verdict === 'GO') { verdict = 'OWN_RISK'; primaryReason = 'Government weather warning active'; }
  } else if (hasAdvisory) {
    factors.push({ category: 'GOVERNMENT', label: 'Gov Advisory', status: 'CAUTION',
      detail: 'Government advisory — stay informed' });
    score -= 15;
  } else {
    factors.push({ category: 'GOVERNMENT', label: 'Gov Advisory', status: 'OK',
      detail: 'No active government advisories' });
  }

  // ── 3. Health Assessment ──────────────────────────────────────
  const isSick    = input.overallFeeling === 'sick' || input.overallFeeling === 'severe';
  const isMildIll = input.overallFeeling === 'mild';
  const hasFeverHigh = input.hasFever && (input.feverTemp ?? 38) >= 38;
  const hasDanger = input.hasDifficultyBreath || (input.hasFever && (input.feverTemp ?? 38) >= 39);

  if (hasDanger || input.overallFeeling === 'severe') {
    factors.push({ category: 'HEALTH', label: 'Health Status', status: 'DANGER',
      detail: hasDanger
        ? `Severe symptoms detected${input.feverTemp ? ` (${input.feverTemp}°C fever)` : ''} — seek medical attention`
        : 'Feeling severely ill — rest and recover first' });
    score -= 100;
    if (verdict !== 'DO_NOT_GO') { verdict = 'DO_NOT_GO'; primaryReason = 'Your health condition is too poor to commute safely'; }
  } else if (isSick || hasFeverHigh) {
    factors.push({ category: 'HEALTH', label: 'Health Status', status: 'DANGER',
      detail: hasFeverHigh
        ? `Fever ${input.feverTemp ?? '≥38'}°C — you may be contagious`
        : 'Feeling sick — commuting puts you and others at risk' });
    score -= 60;
    if (verdict === 'GO') { verdict = 'OWN_RISK'; primaryReason = 'You are feeling unwell'; }
  } else if (
    isMildIll || input.hasFatigue || input.hasCough || input.hasSoreThroat
    || input.hasHeadache || input.hasBodyPain || input.hasVomiting
  ) {
    const symptoms = [
      input.hasFatigue && 'fatigue',
      input.hasCough   && 'cough',
      input.hasSoreThroat && 'sore throat',
      input.hasHeadache && 'headache',
      input.hasBodyPain && 'body pain',
      input.hasVomiting && 'nausea/vomiting',
    ].filter(Boolean).join(', ');
    factors.push({ category: 'HEALTH', label: 'Health Status', status: 'CAUTION',
      detail: `Mild symptoms (${symptoms || 'mild discomfort'}) — monitor your condition` });
    score -= 20;
    if (input.hasChronicCondition) {
      score -= 15;
      factors.push({ category: 'HEALTH', label: 'Chronic Condition', status: 'CAUTION',
        detail: 'Underlying condition — extra caution in high heat and rain' });
    }
    if (verdict === 'GO') { verdict = 'OWN_RISK'; primaryReason = 'You have mild symptoms today'; }
  } else {
    factors.push({ category: 'HEALTH', label: 'Health Status', status: 'OK',
      detail: input.hasChronicCondition
        ? 'Generally well but has underlying condition — check other risks'
        : 'Feeling well — no symptoms reported' });
    if (input.hasChronicCondition) score -= 5;
  }

  // ── 4. Weather Risk (tier = rain probability only) ───────────
  if (input.weatherRisk === 'HIGH') {
    factors.push({ category: 'WEATHER', label: 'Weather Risk', status: 'DANGER',
      detail: `High rain likelihood — ${input.rainProb}% probability (model forecast)` });
    score -= 35;
    if (verdict === 'GO') { verdict = 'OWN_RISK'; primaryReason = 'Elevated rain risk for your commute'; }
  } else if (input.weatherRisk === 'MEDIUM') {
    factors.push({ category: 'WEATHER', label: 'Weather Risk', status: 'CAUTION',
      detail: `Elevated rain chance — ${input.rainProb}% probability — plan wet-weather gear` });
    score -= 15;
  } else {
    factors.push({ category: 'WEATHER', label: 'Weather Risk', status: 'OK',
      detail: `Low rain likelihood — ${input.rainProb}% probability` });
  }

  // ── 5. Flood Risk ─────────────────────────────────────────────
  factors.push(buildFloodAssessmentFactor(input));
  if (input.floodRisk === 'HIGH') {
    score -= 35;
    if (input.weatherRisk === 'HIGH' && verdict !== 'DO_NOT_GO') {
      verdict = 'DO_NOT_GO';
      primaryReason = 'Combined severe weather and flood risk — do not travel';
    } else if (verdict === 'GO') {
      verdict = 'OWN_RISK';
      primaryReason = 'High flood risk on your route';
    }
  } else if (input.floodRisk === 'MEDIUM') {
    score -= 15;
  } else if (input.floodRisk === 'UNKNOWN') {
    score -= 8;
  }

  // ── 6. Heat Index (PAGASA-aligned bands) ──────────────────────
  factors.push(buildHeatAssessmentFactor(input));
  const H = RISK.WEATHER;
  if (input.heatIndex >= H.HEAT_HIGH) {
    score -= 25;
    if (input.hasChronicCondition && verdict === 'GO') {
      verdict = 'OWN_RISK';
      primaryReason = 'Extreme heat index with underlying health condition';
    }
  } else if (input.heatIndex >= H.HEAT_MED) {
    score -= 15;
  }

  // ── 7. Traffic ────────────────────────────────────────────────
  factors.push(buildTrafficAssessmentFactor(input));
  if (input.trafficRisk === 'UNKNOWN') {
    score -= 5;
  } else if (input.trafficRisk === 'HIGH') {
    score -= 15;
  } else if (input.trafficRisk === 'MEDIUM') {
    score -= 5;
  }

  // ── Final score clamp & recommendation ───────────────────────
  score = Math.max(0, Math.min(100, score));

  if (!primaryReason) {
    if      (verdict === 'GO')       primaryReason = 'All conditions are within safe range';
    else if (verdict === 'OWN_RISK') primaryReason = 'Some conditions require caution';
    else                              primaryReason = 'Conditions are unsafe for commuting';
  }

  const recommendation = buildRecommendation(verdict, input);

  return { verdict, primaryReason, factors, safetyScore: score, recommendation };
}

function buildRecommendation(verdict: GoNoGoVerdict, input: GoNoGoInput): string {
  if (verdict === 'DO_NOT_GO') {
    if (input.schoolStatus === 'SUSPENDED') return 'Classes are officially suspended. Stay home and rest.';
    if (input.overallFeeling === 'severe' || input.hasDifficultyBreath) return 'Seek medical attention immediately. Do not commute.';
    if (input.hasFever) return 'You have a fever. Rest at home and monitor your temperature.';
    return 'Conditions are unsafe. Stay home and check for updates.';
  }
  if (verdict === 'OWN_RISK') {
    if (input.schoolStatus === 'ONLINE') return 'Classes are online. Commuting is optional — attend from home if possible.';
    if (input.overallFeeling === 'mild') return 'You have mild symptoms. If you must go, wear a mask and rest when possible.';
    if (input.weatherRisk === 'HIGH') return 'Severe weather ahead. If you must go, leave early, bring raincoat, and budget extra fare.';
    return 'Proceed with caution. Monitor conditions and have a backup plan.';
  }
  // GO
  if (input.rainProb >= 40) return 'Safe to go — but bring an umbrella. Rain is expected later.';
  if (input.heatIndex >= RISK.WEATHER.HEAT_MED) return 'Safe to go — stay hydrated, seek shade, and wear light clothing.';
  return 'All clear! Safe to commute today. Have a great day.';
}
