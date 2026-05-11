import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth';
import { evaluateGoNoGo } from '../services/goNoGoEngine';
import { fetchWeatherData, effectiveWindKmH } from '../services/weatherService';
import { evaluateCombinedRisk, evaluateRouteCombinedRisk } from '../services/combinedRiskService';
import { manilaCheckDate } from '../utils/manilaDate';

const router = Router();
const prisma  = new PrismaClient();

// ── POST /health/check — submit today's health assessment ─────────
router.post('/check', requireAuth, async (req: Request, res: Response) => {
  try {
    const {
      hasFever, feverTemp, hasCough, hasSoreThroat, hasFatigue,
      hasDifficulty, hasHeadache, hasBodyPain, hasVomiting,
      hasChronicCondition, chronicDetail, overallFeeling, additionalNotes,
    } = req.body;

    const checkDate = manilaCheckDate();

    // Upsert — one check per calendar day per user (Asia/Manila)
    const check = await prisma.healthCheck.upsert({
      where:  { userId_checkDate: { userId: req.userId!, checkDate } },
      create: {
        userId: req.userId!,
        checkDate,
        hasFever:           !!hasFever,
        feverTemp:          feverTemp ?? null,
        hasCough:           !!hasCough,
        hasSoreThroat:      !!hasSoreThroat,
        hasFatigue:         !!hasFatigue,
        hasDifficulty:      !!hasDifficulty,
        hasHeadache:        !!hasHeadache,
        hasBodyPain:        !!hasBodyPain,
        hasVomiting:        !!hasVomiting,
        hasChronicCondition:!!hasChronicCondition,
        chronicDetail:      chronicDetail ?? null,
        overallFeeling:     overallFeeling ?? 'well',
        additionalNotes:    additionalNotes ?? null,
      },
      update: {
        hasFever:           !!hasFever,
        feverTemp:          feverTemp ?? null,
        hasCough:           !!hasCough,
        hasSoreThroat:      !!hasSoreThroat,
        hasFatigue:         !!hasFatigue,
        hasDifficulty:      !!hasDifficulty,
        hasHeadache:        !!hasHeadache,
        hasBodyPain:        !!hasBodyPain,
        hasVomiting:        !!hasVomiting,
        hasChronicCondition:!!hasChronicCondition,
        chronicDetail:      chronicDetail ?? null,
        overallFeeling:     overallFeeling ?? 'well',
        additionalNotes:    additionalNotes ?? null,
      },
    });

    res.json({ message: 'Health check saved.', id: check.id });
  } catch (err) {
    console.error('[Health] Check error:', err);
    res.status(500).json({ error: 'Failed to save health check.' });
  }
});

// ── GET /health/today — get today's health check ──────────────────
router.get('/today', requireAuth, async (req: Request, res: Response) => {
  try {
    const checkDate = manilaCheckDate();
    const check = await prisma.healthCheck.findUnique({
      where: { userId_checkDate: { userId: req.userId!, checkDate } },
    });
    res.json(check ?? null);
  } catch {
    res.status(500).json({ error: 'Failed to fetch health check.' });
  }
});

// ── POST /health/evaluate — full Go/No-Go evaluation ─────────────
router.post('/evaluate', requireAuth, async (req: Request, res: Response) => {
  try {
    const { lat, lon, routeId } = req.body;

    if (!lat || !lon) {
      res.status(400).json({ error: 'lat and lon are required.' });
      return;
    }

    // 1. Today's health check (calendar day in Asia/Manila)
    const checkDate = manilaCheckDate();
    const health = await prisma.healthCheck.findUnique({
      where: { userId_checkDate: { userId: req.userId!, checkDate } },
    });

    if (!health) {
      res.status(400).json({ error: 'Please complete today\'s health check first.', code: 'NO_HEALTH_CHECK' });
      return;
    }

    // 2. Weather + risk at user location
    const { current } = await fetchWeatherData(lat, lon);
    const risk = await evaluateCombinedRisk(lat, lon, current);

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
    const schoolAnn = await prisma.schoolAnnouncement.findFirst({
      where: {
        effectiveAt: { lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
      },
      orderBy: { effectiveAt: 'desc' },
    });

    // 5. Active gov advisories
    const govAnns = await prisma.govAnnouncement.findMany({
      where: {
        isActive:    true,
        effectiveAt: { lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
      },
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

      hasFever:            health.hasFever,
      feverTemp:           health.feverTemp,
      hasCough:            health.hasCough,
      hasSoreThroat:       health.hasSoreThroat,
      hasFatigue:          health.hasFatigue,
      hasDifficultyBreath: health.hasDifficulty,
      hasHeadache:         health.hasHeadache,
      hasBodyPain:         health.hasBodyPain,
      hasVomiting:         health.hasVomiting,
      hasChronicCondition: health.hasChronicCondition,
      overallFeeling:      health.overallFeeling,

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
      healthSummary: {
        overallFeeling:      health.overallFeeling,
        hasFever:            health.hasFever,
        hasChronicCondition: health.hasChronicCondition,
      },
      evaluatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Health] Evaluate error:', err);
    res.status(500).json({ error: 'Evaluation failed. Please try again.' });
  }
});

export default router;
