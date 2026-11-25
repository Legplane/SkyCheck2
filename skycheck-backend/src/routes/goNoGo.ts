import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth';
import { evaluateGoNoGo } from '../services/goNoGoEngine';
import { fetchWeatherData, effectiveWindKmH } from '../services/weatherService';
import { evaluateCombinedRisk, evaluateRouteCombinedRisk } from '../services/combinedRiskService';

const router = Router();
const prisma  = new PrismaClient();
const OLONGAPO_CITY_CENTER = {
  lat: 14.8386,
  lon: 120.2842,
};

// ── POST /go-no-go/evaluate — full Go/No-Go evaluation ─────────────
router.post('/evaluate', requireAuth, async (req: Request, res: Response) => {
  try {
    const { lat, lon, routeId } = req.body;

    if (!lat || !lon) {
      res.status(400).json({ error: 'lat and lon are required.' });
      return;
    }

    // 2. Weather + default risk at city level for stable provider matching
    const { current } = await fetchWeatherData(lat, lon);
    const risk = await evaluateCombinedRisk(OLONGAPO_CITY_CENTER.lat, OLONGAPO_CITY_CENTER.lon, current);

    // 3. Route-specific risk (if routeId provided)
    let routeRisk = risk;
    if (routeId) {
      const route = await prisma.route.findUnique({ where: { id: routeId } });
      if (route && route.userId === req.userId) {
        try {
          const [startWeather, destWeather] = await Promise.all([
            fetchWeatherData(route.startLat, route.startLon),
            fetchWeatherData(route.destLat, route.destLon),
          ]);
          routeRisk = await evaluateRouteCombinedRisk(
            route.startLat, route.startLon,
            route.destLat, route.destLon,
            startWeather.current, destWeather.current,
          );
        } catch {
          routeRisk = {
            ...risk,
            overall: route.lastOverallRisk as any,
            weather: route.lastWeatherRisk as any,
            traffic: route.lastTrafficRisk as any,
            flood:   route.lastFloodRisk   as any,
            basis:   route.lastRiskBasis,
          };
        }
      }
    }

    // 4. Active school announcement
    const now = new Date();
    // Announcements are supplementary: if these lookups fail, degrade to
    // "no announcement" instead of failing the whole evaluation.
    const schoolAnn = await prisma.schoolAnnouncement.findFirst({
      where: {
        effectiveAt: { lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
      },
      orderBy: { effectiveAt: 'desc' },
    }).catch((e: unknown) => {
      console.warn('[GoNoGo] School announcement lookup failed:', (e as Error).message);
      return null;
    });

    // 5. Active gov advisories
    const govAnns = await prisma.govAnnouncement.findMany({
      where: {
        isActive:    true,
        effectiveAt: { lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
      },
    }).catch((e: unknown) => {
      console.warn('[GoNoGo] Gov announcement lookup failed:', (e as Error).message);
      return [] as Array<{ source: string; title: string; severity: string }>;
    });

    // 6. Run the engine
    const result = evaluateGoNoGo({
      weatherRisk:         routeRisk.weather   as any,
      floodRisk:           routeRisk.flood      as any,
      trafficRisk:         routeRisk.traffic    as any,
      heatIndex:           current.feelsLike,
      rainProb:            current.precipitationProbability,
      windSpeed:           effectiveWindKmH(current),
      recentPrecipMm:      current.precipitation,
      floodElevationM:     routeRisk.elevation,

      trafficRatio:        routeRisk.trafficRatio,
      trafficSource:       routeRisk.trafficSource,
      trafficCurrentKmh:   routeRisk.trafficCurrentKmh,
      trafficFreeFlowKmh:  routeRisk.trafficFreeFlowKmh,
      trafficVolumeLevel:  routeRisk.trafficVolumeLevel,
      trafficLabel:        routeRisk.trafficLabel,

      schoolStatus:   schoolAnn?.status ?? 'F2F',
      govSeverities:  govAnns.map(a => a.severity),
    });

    // 7. Return enriched response
    res.json({
      verdict:      result.verdict,
      primaryReason:result.primaryReason,
      factors:      result.factors,
      safetyScore:  result.safetyScore,
      recommendation: result.recommendation,
      weather: {
        temperature: current.temperature,
        feelsLike:   current.feelsLike,
        weatherLabel:current.weatherLabel,
        weatherIcon: current.weatherIcon,
        rainProb:    current.precipitationProbability,
      },
      risk: {
        overall: routeRisk.overall,
        weather: routeRisk.weather,
        traffic: routeRisk.traffic,
        flood:   routeRisk.flood,
        basis:   routeRisk.basis,
        trafficRatio: routeRisk.trafficRatio,
        trafficSource: routeRisk.trafficSource,
        trafficCurrentKmh: routeRisk.trafficCurrentKmh,
        trafficFreeFlowKmh: routeRisk.trafficFreeFlowKmh,
        trafficVolumeLevel: routeRisk.trafficVolumeLevel,
        trafficLabel: routeRisk.trafficLabel,
      },
      schoolStatus: schoolAnn?.status ?? 'F2F',
      schoolTitle:  schoolAnn?.title  ?? null,
      govAdvisories: govAnns.map(a => ({
        source:   a.source,
        title:    a.title,
        severity: a.severity,
      })),
      evaluatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[GoNoGo] Evaluate error:', err);
    const weatherDown = /weather provider|Open-Meteo|MET Norway|timeout|ECONN|ENOTFOUND/i.test((err as Error)?.message ?? '');
    res.status(weatherDown ? 503 : 500).json({
      error: weatherDown
        ? 'Weather data is temporarily unavailable. Please try again.'
        : 'Evaluation failed. Please try again.',
    });
  }
});

export default router;
