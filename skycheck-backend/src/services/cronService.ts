import cron from 'node-cron';
import { PrismaClient, AlertType } from '@prisma/client';
import { fetchWeatherData, effectiveWindKmH } from './weatherService';
import { evaluateRouteCombinedRisk } from './combinedRiskService';
import { getCacheSize } from './weatherCache';
import { RISK } from '../constants/risk';
import type { RiskLevel, CurrentWeather } from '../types';

const prisma = new PrismaClient();

export function startRiskCron(): void {
  cron.schedule('*/15 * * * *', async () => {
    console.log(`[Cron] Risk refresh — ${new Date().toISOString()} cache:${getCacheSize()}`);
    try {
      const routes = await prisma.route.findMany({ include: { user: true } });
      let updated = 0, fired = 0;

      for (const route of routes) {
        try {
          const sw = await fetchWeatherData(route.startLat, route.startLon);
          await sleep(500);
          const dw = await fetchWeatherData(route.destLat, route.destLon);

          const risk = await evaluateRouteCombinedRisk(
            route.startLat, route.startLon,
            route.destLat,  route.destLon,
            sw.current, dw.current,
          );

          const prev = route.lastOverallRisk as RiskLevel;
          await prisma.route.update({
            where: { id: route.id },
            data: {
              lastWeatherRisk: risk.weather,
              lastTrafficRisk: risk.traffic,
              lastFloodRisk:   risk.flood,
              lastOverallRisk: risk.overall,
              lastRiskBasis:   risk.basis,
              lastRiskAt:      new Date(),
            },
          });
          updated++;

          // Only alert if risk actually worsened AND user wants alerts
          if (riskScore(risk.overall) > riskScore(prev) && route.user.morningAlerts) {
            // Determine the actual cause so the alert title is accurate
            const worstW = riskScore(sw.current.precipitationProbability.toString()) > 0
              ? sw.current : dw.current;
            await createRiskAlert(route, risk, worstW);
            fired++;
          }
        } catch (err) {
          console.error(`[Cron] Route ${route.id}:`, (err as Error).message);
        }
        await sleep(3000);
      }
      console.log(`[Cron] Done — ${updated} updated, ${fired} alerts`);
    } catch (err) {
      console.error('[Cron] Fatal:', err);
    }
  });
  console.log('[Cron] Risk refresh scheduled every 15 min (staggered)');
}

export function startMorningAlertCron(): void {
  cron.schedule('30 21 * * *', async () => {
    console.log('[Cron] Morning alerts');
    try {
      const routes = await prisma.route.findMany({
        include: { user: true },
        where:   { user: { morningAlerts: true } },
      });
      for (const route of routes) {
        const overall = route.lastOverallRisk as RiskLevel;
        if (overall === 'HIGH' || overall === 'MEDIUM') {
          const sw = await fetchWeatherData(route.startLat, route.startLon).catch(() => null);
          if (sw) {
            await createRiskAlert(route, {
              overall,
              weather: route.lastWeatherRisk as RiskLevel,
              traffic: route.lastTrafficRisk as RiskLevel,
              flood:   route.lastFloodRisk   as RiskLevel,
              basis:   route.lastRiskBasis,
            }, sw.current, true);
          }
        }
        await sleep(500);
      }
      console.log('[Cron] Morning done');
    } catch (err) {
      console.error('[Cron] Morning error:', err);
    }
  });
  console.log('[Cron] Morning alert scheduled (5:30 AM PHT)');
}

// ─────────────────────────────────────────────────────────────────
// createRiskAlert — determines actual cause before writing title/body
// This fixes "Rain Likely" appearing when rain is 2% but heat/traffic
// is the real trigger.
// ─────────────────────────────────────────────────────────────────
async function createRiskAlert(
  route: { id: string; userId: string; label: string | null; startAddress: string; destAddress: string; departTime: string },
  risk:  { overall: RiskLevel; weather: RiskLevel; traffic: RiskLevel; flood: RiskLevel; basis: string },
  weather: CurrentWeather,
  isMorning = false,
): Promise<void> {
  const name   = route.label ?? `${route.startAddress.split(',')[0]} → ${route.destAddress.split(',')[0]}`;
  const prefix = isMorning ? 'Morning Alert — ' : '';
  const R      = RISK.WEATHER;

  // Determine the actual primary cause
  const isRainCause  = weather.precipitationProbability >= R.RAIN_MED || weather.precipitation >= 3
                       || [51,53,55,61,63,65,80,81,82,95,96,99].includes(weather.weatherCode);
  const isHeatCause  = weather.feelsLike >= R.HEAT_MED;
  const isWindCause  = effectiveWindKmH(weather) >= R.WIND_MED;
  const isFloodCause = risk.flood === 'HIGH' || risk.flood === 'MEDIUM';
  const isTraffic    = risk.traffic === 'HIGH' || risk.traffic === 'MEDIUM';

  let alertType: AlertType = 'WEATHER';
  let title = '';
  let body  = '';

  if (risk.overall === 'HIGH') {
    if (risk.flood === 'HIGH') {
      alertType = 'FLOOD';
      title = `${prefix}HIGH RISK — Flood Alert`;
      body  = `${name}: Avoid low-lying and flood-prone roads. ${risk.basis}`;
    } else if (weather.precipitationProbability >= R.RAIN_HIGH || [82,95,96,99].includes(weather.weatherCode)) {
      alertType = 'WEATHER';
      title = `${prefix}HIGH RISK — Severe Weather`;
      body  = `${name}: Leave by ${route.departTime}. Bring raincoat. ${risk.basis}`;
    } else if (risk.traffic === 'HIGH') {
      alertType = 'TRAFFIC';
      title = `${prefix}HIGH RISK — Heavy Traffic`;
      body  = `${name}: Leave 20+ minutes early. Budget extra fare. ${risk.basis}`;
    } else if (weather.feelsLike >= R.HEAT_HIGH) {
      alertType = 'WEATHER';
      title = `${prefix}HIGH RISK — Extreme Heat`;
      body  = `${name}: Heat index ${weather.feelsLike}°C. Stay hydrated. ${risk.basis}`;
    } else {
      alertType = 'WEATHER';
      title = `${prefix}HIGH RISK — Poor Conditions`;
      body  = `${name}: ${risk.basis}`;
    }
  } else if (risk.overall === 'MEDIUM') {
    if (isFloodCause) {
      alertType = 'FLOOD';
      title = `${prefix}MEDIUM RISK — Possible Flooding`;
      body  = `${name}: Monitor low-elevation areas on your route. ${risk.basis}`;
    } else if (isRainCause && !isHeatCause && !isTraffic) {
      // Only say "Rain Likely" if rain is actually the cause
      alertType = 'WEATHER';
      title = `${prefix}MEDIUM RISK — Rain Likely`;
      body  = `${name}: Bring umbrella. Allow extra commute time. ${risk.basis}`;
    } else if (isHeatCause && !isRainCause) {
      alertType = 'WEATHER';
      title = `${prefix}MEDIUM RISK — High Heat Index`;
      body  = `${name}: Heat index ${weather.feelsLike}°C. Stay hydrated during your commute. ${risk.basis}`;
    } else if (isWindCause && !isRainCause && !isHeatCause) {
      alertType = 'WEATHER';
      title = `${prefix}MEDIUM RISK — Strong Winds`;
      body  = `${name}: Wind ${weather.windSpeed} km/h${
        weather.windGust !== undefined && weather.windGust > weather.windSpeed
          ? ` · gusts ${weather.windGust}`
          : ''
      }. Take care on motorcycles. ${risk.basis}`;
    } else if (isTraffic && !isRainCause && !isHeatCause) {
      // Traffic-only MEDIUM — no weather alert needed
      alertType = 'TRAFFIC';
      title = `${prefix}MEDIUM RISK — Moderate Traffic`;
      body  = `${name}: Allow a few extra minutes for your commute. ${risk.basis}`;
    } else {
      // Mixed causes
      alertType = 'WEATHER';
      const causes: string[] = [];
      if (isHeatCause)  causes.push(`heat index ${weather.feelsLike}°C`);
      if (isRainCause)  causes.push(`rain ${weather.precipitationProbability}%`);
      if (isTraffic)    causes.push('moderate traffic');
      title = `${prefix}MEDIUM RISK — ${causes.length ? causes.map(c => c[0].toUpperCase() + c.slice(1)).join(' & ') : 'Use Caution'}`;
      body  = `${name}: ${risk.basis}`;
    }
  }

  if (!title) return;

  // Deduplicate — skip if same route+type+level alerted in last 30 min
  const recent = await prisma.alert.findFirst({
    where: {
      userId:    route.userId,
      routeId:   route.id,
      type:      alertType,
      riskLevel: risk.overall,
      createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) },
    },
  });
  if (recent) return;

  await prisma.alert.create({
    data: { userId: route.userId, routeId: route.id, type: alertType, riskLevel: risk.overall, title, body },
  });

  console.log(`[Alert] Created: "${title}" for ${name}`);
}

function riskScore(level: string): number {
  return { HIGH: 3, MEDIUM: 2, LOW: 1, UNKNOWN: 0 }[level] ?? 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
