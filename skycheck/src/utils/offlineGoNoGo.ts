import type {
  AnnouncementsResponse, CombinedRisk, GoNoGoFactor, GoNoGoResult, GoNoGoVerdict,
  HealthCheck, RiskLevel, Route,
} from '../types';
import { RISK } from '../constants/risk';
import {
  ageMinutes, forecastWindow, formatAge, freshnessOf,
  type CachedWeather, type Freshness,
} from './offline';

// ─────────────────────────────────────────────────────────────────
// Offline Go / No-Go estimate
//
// Differences from a plain "read the cached snapshot" approach:
//   • looks at the cached hourly forecast for the coming commute window,
//     not only the moment the data was cached
//   • penalises old data and never returns a plain GO on stale/expired data
//   • warns when the cache was fetched far from the user's current position
//   • folds in cached saved-route risk and cached school/gov announcements
//   • reports a confidence level so the UI can be honest about it
// ─────────────────────────────────────────────────────────────────

export type OfflineConfidence = 'high' | 'medium' | 'low';

export interface OfflineGoNoGoResult extends GoNoGoResult {
  offline: {
    confidence: OfflineConfidence;
    freshness: Freshness;
    dataAgeMin: number;
    dataAgeLabel: string;
    /** user's position vs. where the weather was cached (metres), null if unknown */
    distanceM: number | null;
    notes: string[];
  };
}

export interface OfflineInputs {
  health: HealthCheck;
  cached: CachedWeather;
  routes?: Route[];
  announcements?: AnnouncementsResponse | null;
  now?: Date;
}

const RANK: Record<RiskLevel, number> = { UNKNOWN: 0, LOW: 1, MEDIUM: 2, HIGH: 3 };

function rainLevel(prob: number): RiskLevel {
  if (prob >= RISK.WEATHER.RAIN_HIGH) return 'HIGH';
  if (prob >= RISK.WEATHER.RAIN_MED) return 'MEDIUM';
  return 'LOW';
}

function worse(a: RiskLevel, b: RiskLevel): RiskLevel {
  return RANK[a] >= RANK[b] ? a : b;
}

export function buildOfflineGoNoGo({
  health, cached, routes = [], announcements = null, now = new Date(),
}: OfflineInputs): OfflineGoNoGoResult {
  const { snapshot } = cached;
  const current = snapshot.current;
  const factors: GoNoGoFactor[] = [];
  const notes: string[] = [];
  let score = 100;
  let verdict: GoNoGoVerdict = 'GO';
  let primaryReason = 'All cached conditions are within safe range';

  const ageMin = ageMinutes(cached.updatedAt, now.getTime());
  const freshness = freshnessOf(ageMin);
  const ageLabel = formatAge(ageMin);
  const win = forecastWindow(snapshot, now, 180);

  // ── Health ──────────────────────────────────────────────────────
  const severeHealth = health.overallFeeling === 'severe' || health.hasDifficulty
    || (health.hasFever && (health.feverTemp ?? 38) >= 39);
  const sickHealth = health.overallFeeling === 'sick' || (health.hasFever && (health.feverTemp ?? 38) >= 38);
  const mildHealth = health.overallFeeling === 'mild' || health.hasCough || health.hasSoreThroat
    || health.hasFatigue || health.hasHeadache || health.hasBodyPain || health.hasVomiting;

  if (severeHealth) {
    factors.push({ category: 'HEALTH', label: 'Health Status', status: 'DANGER', detail: 'Severe symptoms reported - do not commute' });
    score -= 100;
    verdict = 'DO_NOT_GO';
    primaryReason = 'Your health condition is too poor to commute safely';
  } else if (sickHealth) {
    factors.push({ category: 'HEALTH', label: 'Health Status', status: 'DANGER', detail: 'Feeling sick or feverish - commuting is risky' });
    score -= 60;
    verdict = 'OWN_RISK';
    primaryReason = 'You are feeling unwell';
  } else if (mildHealth) {
    factors.push({ category: 'HEALTH', label: 'Health Status', status: 'CAUTION', detail: 'Mild symptoms reported - monitor your condition' });
    score -= 20;
    verdict = 'OWN_RISK';
    primaryReason = 'You have mild symptoms today';
  } else {
    factors.push({ category: 'HEALTH', label: 'Health Status', status: 'OK', detail: 'Feeling well - no symptoms reported' });
  }

  if (health.hasChronicCondition) {
    factors.push({ category: 'HEALTH', label: 'Chronic Condition', status: 'CAUTION', detail: 'Underlying condition - take extra care with heat and rain' });
    score -= 10;
    if (verdict === 'GO') {
      verdict = 'OWN_RISK';
      primaryReason = 'Underlying condition requires extra caution';
    }
  }

  // ── Weather: worst of "when cached" and "coming 3 hours" ────────
  const rainProb = Math.max(current.precipitationProbability, win.maxRainProb);
  const weatherRisk = worse(snapshot.risk.weather, rainLevel(rainProb));
  const fromForecast = win.slotsUsed > 0 && win.maxRainProb > current.precipitationProbability;
  const rainText = fromForecast
    ? `Cached forecast shows up to ${rainProb}% rain in the next few hours`
    : `Cached rain chance is ${rainProb}%`;

  if (weatherRisk === 'HIGH') {
    factors.push({ category: 'WEATHER', label: 'Weather Risk', status: 'DANGER', detail: `${rainText} - high` });
    score -= 35;
    if (verdict === 'GO') {
      verdict = 'OWN_RISK';
      primaryReason = 'Elevated cached rain risk for your commute';
    }
  } else if (weatherRisk === 'MEDIUM') {
    factors.push({ category: 'WEATHER', label: 'Weather Risk', status: 'CAUTION', detail: `${rainText} - elevated` });
    score -= 15;
  } else {
    factors.push({ category: 'WEATHER', label: 'Weather Risk', status: 'OK', detail: `${rainText} - low` });
  }
  if (win.slotsUsed === 0 && ageMin > 60) {
    notes.push('Cached forecast no longer covers the coming hours.');
  }

  // ── Flood: bump one level when heavy rain is forecast ───────────
  let floodRisk: RiskLevel = snapshot.risk.flood;
  if (floodRisk !== 'UNKNOWN' && rainProb >= RISK.FLOOD.RAIN_PROB_HIGH && floodRisk === 'LOW') {
    floodRisk = 'MEDIUM';
  }
  if (floodRisk === 'HIGH') {
    factors.push({ category: 'FLOOD', label: 'Flood Risk', status: 'DANGER', detail: 'Cached flood risk is high' });
    score -= 35;
    if (weatherRisk === 'HIGH') {
      verdict = 'DO_NOT_GO';
      primaryReason = 'Cached severe weather and flood risk - do not travel';
    } else if (verdict === 'GO') {
      verdict = 'OWN_RISK';
      primaryReason = 'High cached flood risk on your route';
    }
  } else if (floodRisk === 'MEDIUM') {
    factors.push({ category: 'FLOOD', label: 'Flood Risk', status: 'CAUTION', detail: 'Cached flood risk is possible' });
    score -= 15;
  } else if (floodRisk === 'UNKNOWN') {
    factors.push({ category: 'FLOOD', label: 'Flood Risk', status: 'CAUTION', detail: 'Flood check unavailable offline' });
    score -= 8;
  } else {
    factors.push({ category: 'FLOOD', label: 'Flood Risk', status: 'OK', detail: 'Cached flood risk is low' });
  }

  // ── Heat: add the forecast temperature rise to the feels-like ───
  const tempRise = win.maxTemp !== null ? Math.max(0, win.maxTemp - current.temperature) : 0;
  const heat = Math.round(current.feelsLike + tempRise);
  if (heat >= RISK.WEATHER.HEAT_HIGH) {
    factors.push({ category: 'HEAT', label: 'Heat Index', status: 'DANGER', detail: `Heat index up to ~${heat}°C - avoid long exposure` });
    score -= 25;
  } else if (heat >= RISK.WEATHER.HEAT_MED) {
    factors.push({ category: 'HEAT', label: 'Heat Index', status: 'CAUTION', detail: `Heat index up to ~${heat}°C - stay hydrated` });
    score -= 15;
  } else {
    factors.push({ category: 'HEAT', label: 'Heat Index', status: 'OK', detail: `Heat index around ${heat}°C` });
  }

  // ── Traffic + saved routes (last known) ─────────────────────────
  let trafficRisk: RiskLevel = snapshot.risk.traffic;
  const routeRisks = routes.map((r) => r.risk).filter((r): r is CombinedRisk => !!r);
  if (routeRisks.length) {
    for (const rr of routeRisks) trafficRisk = worse(trafficRisk, rr.traffic);
  }
  if (trafficRisk === 'HIGH') {
    factors.push({ category: 'TRAFFIC', label: 'Traffic', status: 'DANGER', detail: 'Last known traffic is heavy' });
    score -= 15;
  } else if (trafficRisk === 'MEDIUM') {
    factors.push({ category: 'TRAFFIC', label: 'Traffic', status: 'CAUTION', detail: 'Last known traffic is moderate' });
    score -= 5;
  } else if (trafficRisk === 'UNKNOWN') {
    factors.push({ category: 'TRAFFIC', label: 'Traffic', status: 'CAUTION', detail: 'Traffic check unavailable offline' });
    score -= 5;
  } else {
    factors.push({ category: 'TRAFFIC', label: 'Traffic', status: 'OK', detail: 'Last known traffic is light' });
  }

  const worstRoute = routeRisks.reduce<RiskLevel>((acc, r) => worse(acc, r.overall), 'UNKNOWN');
  if (routeRisks.length && worstRoute === 'HIGH') {
    factors.push({ category: 'TRAFFIC', label: 'Saved Routes', status: 'DANGER', detail: 'At least one saved route was HIGH risk at last check' });
    score -= 10;
    if (verdict === 'GO') {
      verdict = 'OWN_RISK';
      primaryReason = 'A saved route was high risk at last check';
    }
  }

  // ── School / government (cached announcements) ──────────────────
  const nowMs = now.getTime();
  const activeSchool = announcements?.school.find((a) =>
    Date.parse(a.effectiveAt) <= nowMs && (!a.expiresAt || Date.parse(a.expiresAt) > nowMs));
  const activeGov = (announcements?.gov ?? []).filter((a) =>
    Date.parse(a.effectiveAt) <= nowMs && (!a.expiresAt || Date.parse(a.expiresAt) > nowMs));
  let schoolStatus = 'UNKNOWN';
  let schoolTitle: string | null = null;

  if (activeSchool) {
    schoolStatus = activeSchool.status;
    schoolTitle = activeSchool.title;
    if (activeSchool.status === 'SUSPENDED') {
      factors.push({ category: 'SCHOOL', label: 'Class Status', status: 'DANGER', detail: 'Classes suspended (from cached announcement)' });
      verdict = 'DO_NOT_GO';
      primaryReason = 'Classes are officially suspended';
      score -= 60;
    } else if (activeSchool.status === 'ONLINE') {
      factors.push({ category: 'SCHOOL', label: 'Class Status', status: 'OK', detail: 'Classes are online (from cached announcement)' });
    } else {
      factors.push({ category: 'SCHOOL', label: 'Class Status', status: 'OK', detail: `${activeSchool.status} classes (from cached announcement)` });
    }
  } else {
    factors.push({
      category: 'SCHOOL', label: 'Class Status', status: 'CAUTION',
      detail: announcements ? 'No active school announcement in your cached list' : 'School announcements are not refreshed offline',
    });
  }

  const govCritical = activeGov.some((a) => a.severity === 'CRITICAL' || a.severity === 'WARNING');
  if (activeGov.length) {
    factors.push({
      category: 'GOVERNMENT', label: 'Gov Advisory',
      status: govCritical ? 'DANGER' : 'CAUTION',
      detail: `${activeGov.length} advisory(ies) in your cached list - verify when online`,
    });
    if (govCritical) {
      score -= 30;
      if (verdict === 'GO') {
        verdict = 'OWN_RISK';
        primaryReason = 'Government advisory in effect (cached)';
      }
    }
  } else {
    factors.push({ category: 'GOVERNMENT', label: 'Gov Advisory', status: 'CAUTION', detail: 'Government advisories are not refreshed offline' });
  }

  // ── Data quality: age + distance ────────────────────────────────
  const stalePenalty = freshness === 'expired' ? 20 : freshness === 'stale' ? 10 : freshness === 'aging' ? 4 : 0;
  score -= stalePenalty;
  if (freshness !== 'fresh') {
    factors.push({
      category: 'WEATHER', label: 'Data Freshness',
      status: freshness === 'aging' ? 'CAUTION' : 'DANGER',
      detail: `Weather was last fetched ${ageLabel}${freshness === 'aging' ? '' : ' - conditions may have changed'}`,
    });
  }
  if ((freshness === 'stale' || freshness === 'expired') && verdict === 'GO') {
    verdict = 'OWN_RISK';
    primaryReason = `Cached data is ${ageLabel} - conditions may have changed`;
  }

  if (cached.distanceM !== null && cached.distanceM > 3_000) {
    const km = (cached.distanceM / 1000).toFixed(1);
    notes.push(`Weather was cached about ${km} km from your current location.`);
    score -= 5;
  }

  score = Math.max(0, Math.min(100, score));

  // ── Confidence ──────────────────────────────────────────────────
  let confidence: OfflineConfidence = 'high';
  if (freshness === 'aging' || (cached.distanceM ?? 0) > 3_000 || win.slotsUsed === 0) confidence = 'medium';
  if (freshness === 'stale' || freshness === 'expired') confidence = 'low';

  const recommendation = verdict === 'DO_NOT_GO'
    ? 'Based on cached data and your health check, staying home is safest.'
    : verdict === 'OWN_RISK'
      ? 'Proceed with caution. This is based on cached offline data, so verify conditions when internet returns.'
      : confidence === 'high'
        ? 'Safe to go based on recent cached data. Recheck once internet is available.'
        : 'Looks fine on cached data, but it is not fully current. Recheck once internet is available.';

  const risk: CombinedRisk = {
    ...snapshot.risk,
    weather: weatherRisk,
    flood: floodRisk,
    traffic: trafficRisk,
    overall: [weatherRisk, floodRisk, trafficRisk].reduce<RiskLevel>(worse, 'LOW'),
  };

  return {
    verdict,
    primaryReason,
    factors,
    safetyScore: score,
    recommendation,
    weather: {
      temperature: current.temperature,
      feelsLike: current.feelsLike,
      weatherLabel: current.weatherLabel,
      weatherIcon: current.weatherIcon,
      rainProb,
    },
    risk,
    schoolStatus,
    schoolTitle,
    govAdvisories: activeGov.map((a) => ({ source: a.source, title: a.title, severity: a.severity })),
    healthSummary: {
      overallFeeling: health.overallFeeling,
      hasFever: health.hasFever,
      hasChronicCondition: health.hasChronicCondition,
    },
    evaluatedAt: now.toISOString(),
    offline: {
      confidence, freshness, dataAgeMin: ageMin, dataAgeLabel: ageLabel,
      distanceM: cached.distanceM, notes,
    },
  };
}
