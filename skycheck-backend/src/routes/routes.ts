import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth';
import { calculateRoute } from '../services/routeCalcService';
import { fetchWeatherData } from '../services/weatherService';
import { evaluateCombinedRisk, evaluateRouteCombinedRisk } from '../services/combinedRiskService';
import { fetchRouteTrafficLevel } from '../services/trafficService';
import { evaluateRouteFloodRisk } from '../services/floodService';
import { estimateFareOptions, estimateMaximFare } from '../utils/fareEstimates';
import { RISK } from '../constants/risk';

const router = Router();
const prisma = new PrismaClient();

// ─────────────────────────────────────────────────────────────────
// Helper: fetch weather at both route endpoints in parallel,
// then evaluate combined risk across the full route.
// ─────────────────────────────────────────────────────────────────
async function evalRouteRisk(
  startLat: number, startLon: number,
  destLat:  number, destLon:  number,
) {
  const [startResult, destResult] = await Promise.allSettled([
    fetchWeatherData(startLat, startLon),
    fetchWeatherData(destLat,  destLon),
  ]);

  // If both fail, fall back gracefully
  if (startResult.status === 'rejected' && destResult.status === 'rejected') {
    const [trafficResult, floodResult] = await Promise.allSettled([
      fetchRouteTrafficLevel(startLat, startLon, destLat, destLon),
      evaluateRouteFloodRisk(startLat, startLon, destLat, destLon, 0, 0),
    ]);

    const weather = 'UNKNOWN' as const;
    const traffic = trafficResult.status === 'fulfilled' ? trafficResult.value.riskLevel : 'UNKNOWN';
    const flood = floodResult.status === 'fulfilled' ? floodResult.value.riskLevel : 'UNKNOWN';
    const overall = [traffic, flood].includes('HIGH')
      ? 'HIGH'
      : [traffic, flood].includes('MEDIUM')
        ? 'MEDIUM'
        : traffic === 'LOW' || flood === 'LOW'
          ? 'LOW'
          : 'UNKNOWN';

    return {
      weather,
      traffic,
      flood,
      overall,
      basis: traffic !== 'UNKNOWN' || flood !== 'UNKNOWN'
        ? 'Weather unavailable; showing available traffic and flood checks'
        : 'Weather data unavailable',
    };
  }

  // If one fails, use the other for both endpoints
  const startWeather = startResult.status === 'fulfilled'
    ? startResult.value.current
    : (destResult as PromiseFulfilledResult<Awaited<ReturnType<typeof fetchWeatherData>>>).value.current;

  const destWeather = destResult.status === 'fulfilled'
    ? destResult.value.current
    : startWeather;

  const risk = await evaluateRouteCombinedRisk(
    startLat, startLon,
    destLat,  destLon,
    startWeather,
    destWeather,
  );

  return risk;
}

function mapRiskToRouteUpdate(risk: {
  weather: string;
  traffic: string;
  flood: string;
  overall: string;
  basis: string;
}) {
  return {
    lastWeatherRisk: risk.weather,
    lastTrafficRisk: risk.traffic,
    lastFloodRisk:   risk.flood,
    lastOverallRisk: risk.overall,
    lastRiskBasis:   risk.basis,
    lastRiskAt:      new Date(),
  };
}

function routeHasUnknownRisk(route: {
  lastWeatherRisk: string;
  lastTrafficRisk: string;
  lastFloodRisk: string;
  lastOverallRisk: string;
}): boolean {
  return [
    route.lastWeatherRisk,
    route.lastTrafficRisk,
    route.lastFloodRisk,
    route.lastOverallRisk,
  ].some(value => value === 'UNKNOWN');
}

// ── Serialize route for API response ─────────────────────────────
function serializeRoute(route: {
  id: string; label: string | null;
  startAddress: string; startLat: number; startLon: number;
  destAddress: string;  destLat: number;  destLon: number;
  departTime: string; distanceKm: number; durationMin: number;
  lastWeatherRisk: string; lastTrafficRisk: string;
  lastFloodRisk: string; lastOverallRisk: string; lastRiskBasis: string;
  createdAt: Date;
}) {
  return {
    id:           route.id,
    label:        route.label,
    startAddress: route.startAddress,
    startLat:     route.startLat,
    startLon:     route.startLon,
    destAddress:  route.destAddress,
    destLat:      route.destLat,
    destLon:      route.destLon,
    departTime:   route.departTime,
    distanceKm:   route.distanceKm,
    durationMin:  route.durationMin,
    risk: {
      overall: route.lastOverallRisk,
      weather: route.lastWeatherRisk,
      traffic: route.lastTrafficRisk,
      flood:   route.lastFloodRisk,
      basis:   route.lastRiskBasis,
    },
    maximFare: estimateMaximFare(route.distanceKm),
    fareEstimates: estimateFareOptions(route.distanceKm, route.durationMin),
    createdAt: route.createdAt.toISOString(),
  };
}

// ── GET /routes ───────────────────────────────────────────────────
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const routes = await prisma.route.findMany({
      where:   { userId: req.userId },
      orderBy: { createdAt: 'asc' },
    });
    const now = Date.now();
    const REFRESH_MS = 10 * 60 * 1000;

    const hydrated = await Promise.all(routes.map(async (route) => {
      let currentRoute = route;
      const hasInvalidMetrics = currentRoute.distanceKm <= 0 || currentRoute.durationMin <= 0;

      // Auto-heal route metrics for old/broken records.
      if (hasInvalidMetrics) {
        try {
          const calc = await calculateRoute(
            currentRoute.startLat,
            currentRoute.startLon,
            currentRoute.destLat,
            currentRoute.destLon,
          );
          currentRoute = await prisma.route.update({
            where: { id: currentRoute.id },
            data: {
              distanceKm: calc.distanceKm,
              durationMin: calc.durationMin,
            },
          });
        } catch {
          // Keep existing values if recalculation fails.
        }
      }

      const ageMs = currentRoute.lastRiskAt ? now - currentRoute.lastRiskAt.getTime() : Number.POSITIVE_INFINITY;
      if (ageMs < REFRESH_MS && !routeHasUnknownRisk(currentRoute)) return currentRoute;

      try {
        const latestRisk = await evalRouteRisk(
          currentRoute.startLat,
          currentRoute.startLon,
          currentRoute.destLat,
          currentRoute.destLon,
        );
        return await prisma.route.update({
          where: { id: currentRoute.id },
          data: mapRiskToRouteUpdate(latestRisk),
        });
      } catch {
        return currentRoute;
      }
    }));

    res.json(hydrated.map(serializeRoute));
  } catch {
    res.status(500).json({ error: 'Failed to fetch routes.' });
  }
});

// ── POST /routes/preview ──────────────────────────────────────────
// Returns distance, duration, fare estimate and waypoints for the
// map preview — does NOT save anything.
router.post('/preview', requireAuth, async (req: Request, res: Response) => {
  try {
    const { startLat, startLon, destLat, destLon } = req.body;

    if (!startLat || !startLon || !destLat || !destLon) {
      res.status(400).json({ error: 'Start and destination coordinates are required.' });
      return;
    }

    const calc = await calculateRoute(startLat, startLon, destLat, destLon);

    res.json({
      distanceKm:  calc.distanceKm,
      durationMin: calc.durationMin,
      maximFare:   estimateMaximFare(calc.distanceKm),
      fareEstimates: estimateFareOptions(calc.distanceKm, calc.durationMin),
      waypoints:   calc.waypoints,
    });
  } catch (err) {
    console.error('[Routes] Preview error:', err);
    res.status(503).json({ error: 'Route calculation temporarily unavailable.' });
  }
});

// ── GET /routes/:id/risk ──────────────────────────────────────────
// Force-refresh full route risk so route cards can show live TomTom
// traffic without waiting for cached rows or the 15-minute cron.
router.get('/:id/risk', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const route = await prisma.route.findUnique({ where: { id } });
    if (!route) { res.status(404).json({ error: 'Route not found.' }); return; }
    if (route.userId !== req.userId) { res.status(403).json({ error: 'Forbidden.' }); return; }

    const risk = await evalRouteRisk(route.startLat, route.startLon, route.destLat, route.destLon);
    await prisma.route.update({
      where: { id },
      data: mapRiskToRouteUpdate(risk),
    });

    res.json(risk);
  } catch (err) {
    console.error('[Routes] Live risk error:', err);
    res.status(503).json({ error: 'Route risk temporarily unavailable.' });
  }
});

// ── POST /routes ──────────────────────────────────────────────────
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const count = await prisma.route.count({ where: { userId: req.userId } });
    if (count >= RISK.ROUTE.MAX_PER_USER) {
      res.status(400).json({ error: `Route limit reached (${RISK.ROUTE.MAX_PER_USER} max).` });
      return;
    }

    const { label, startAddress, startLat, startLon, destAddress, destLat, destLon, departTime } = req.body;

    if (!startAddress || !startLat || !startLon || !destAddress || !destLat || !destLon || !departTime) {
      res.status(400).json({ error: 'All location fields and departure time are required.' });
      return;
    }

    // Calculate route geometry
    let distanceKm = 0, durationMin = 0;
    try {
      const calc = await calculateRoute(startLat, startLon, destLat, destLon);
      distanceKm  = calc.distanceKm;
      durationMin = calc.durationMin;
    } catch (err) {
      console.warn('[Routes] ORS calc failed on save:', err);
    }

    // Evaluate risk at BOTH endpoints
    let risk = {
      weather: 'UNKNOWN' as string,
      traffic: 'UNKNOWN' as string,
      flood:   'UNKNOWN' as string,
      overall: 'UNKNOWN' as string,
      basis:   '' as string,
    };
    try {
      const r = await evalRouteRisk(startLat, startLon, destLat, destLon);
      risk = { weather: r.weather, traffic: r.traffic, flood: r.flood, overall: r.overall, basis: r.basis };
    } catch (err) {
      console.warn('[Routes] Risk eval failed on save:', err);
    }

    const route = await prisma.route.create({
      data: {
        userId:          req.userId!,
        label:           label?.trim() || null,
        startAddress,    startLat,    startLon,
        destAddress,     destLat,     destLon,
        departTime,      distanceKm,  durationMin,
        lastWeatherRisk: risk.weather,
        lastTrafficRisk: risk.traffic,
        lastFloodRisk:   risk.flood,
        lastOverallRisk: risk.overall,
        lastRiskBasis:   risk.basis,
        lastRiskAt:      new Date(),
      },
    });

    res.status(201).json(serializeRoute(route));
  } catch (err) {
    console.error('[Routes] Create error:', err);
    res.status(500).json({ error: 'Failed to create route.' });
  }
});

// ── PATCH /routes/:id ─────────────────────────────────────────────
router.patch('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    if (Array.isArray(id)) {
      res.status(400).json({ error: 'Invalid route id.' });
      return;
    }

    const existing = await prisma.route.findUnique({ where: { id } });
    if (!existing)                    { res.status(404).json({ error: 'Route not found.' }); return; }
    if (existing.userId !== req.userId) { res.status(403).json({ error: 'Forbidden.' });      return; }

    const { label, startAddress, startLat, startLon, destAddress, destLat, destLon, departTime } = req.body;

    const newStartLat = startLat ?? existing.startLat;
    const newStartLon = startLon ?? existing.startLon;
    const newDestLat  = destLat  ?? existing.destLat;
    const newDestLon  = destLon  ?? existing.destLon;

    // Re-calculate if coordinates changed
    let distanceKm  = existing.distanceKm;
    let durationMin = existing.durationMin;
    const coordsChanged =
      newStartLat !== existing.startLat ||
      newStartLon !== existing.startLon ||
      newDestLat  !== existing.destLat  ||
      newDestLon  !== existing.destLon;

    if (coordsChanged) {
      try {
        const calc = await calculateRoute(newStartLat, newStartLon, newDestLat, newDestLon);
        distanceKm  = calc.distanceKm;
        durationMin = calc.durationMin;
      } catch { /* keep existing */ }
    }

    // Re-evaluate risk if coordinates changed
    let riskUpdates = {};
    if (coordsChanged) {
      try {
        const r = await evalRouteRisk(newStartLat, newStartLon, newDestLat, newDestLon);
        riskUpdates = mapRiskToRouteUpdate(r);
      } catch { /* keep existing risk */ }
    }

    const updated = await prisma.route.update({
      where: { id },
      data: {
        ...(label        !== undefined && { label: label?.trim() || null }),
        ...(startAddress !== undefined && { startAddress }),
        ...(startLat     !== undefined && { startLat }),
        ...(startLon     !== undefined && { startLon }),
        ...(destAddress  !== undefined && { destAddress }),
        ...(destLat      !== undefined && { destLat }),
        ...(destLon      !== undefined && { destLon }),
        ...(departTime   !== undefined && { departTime }),
        distanceKm,
        durationMin,
        ...riskUpdates,
      },
    });

    res.json(serializeRoute(updated));
  } catch {
    res.status(500).json({ error: 'Failed to update route.' });
  }
});

// ── DELETE /routes/:id ────────────────────────────────────────────
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    if (Array.isArray(id)) {
      res.status(400).json({ error: 'Invalid route id.' });
      return;
    }

    const route = await prisma.route.findUnique({ where: { id } });
    if (!route)                    { res.status(404).json({ error: 'Route not found.' }); return; }
    if (route.userId !== req.userId) { res.status(403).json({ error: 'Forbidden.' });      return; }

    await prisma.route.delete({ where: { id } });
    res.json({ message: 'Route deleted.' });
  } catch {
    res.status(500).json({ error: 'Failed to delete route.' });
  }
});

export default router;
