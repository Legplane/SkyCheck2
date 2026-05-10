import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Wipe any route risk data computed with the old buggy basis builder.
// Patterns that should NEVER appear in a correctly-built basis:
const BAD_SUBSTRINGS = [
  'Traffic slowed by rain',     // hardcoded string from old code
  'Rain prob 0%', 'Rain prob 1%', 'Rain prob 2%', 'Rain prob 3%',
  'Rain prob 4%', 'Rain prob 5%', 'Rain prob 6%', 'Rain prob 7%',
  'Rain prob 8%', 'Rain prob 9%', 'Rain prob 10%', 'Rain prob 11%',
  'Rain prob 12%', 'Rain prob 13%', 'Rain prob 14%', 'Rain prob 15%',
  'Rain prob 16%', 'Rain prob 17%', 'Rain prob 18%', 'Rain prob 19%',
  'Rain prob 20%', 'Rain prob 21%', 'Rain prob 22%', 'Rain prob 23%',
  'Rain prob 24%', 'Rain prob 25%', 'Rain prob 26%', 'Rain prob 27%',
  'Rain prob 28%', 'Rain prob 29%', 'Rain prob 30%', 'Rain prob 31%',
  'Rain prob 32%', 'Rain prob 33%', 'Rain prob 34%', 'Rain prob 35%',
  'Rain prob 36%', 'Rain prob 37%', 'Rain prob 38%', 'Rain prob 39%',
  'Wind 1 km/h',  'Wind 2 km/h',  'Wind 3 km/h',  'Wind 4 km/h',
  'Wind 5 km/h',  'Wind 6 km/h',  'Wind 7 km/h',  'Wind 8 km/h',
  'Wind 9 km/h',  'Wind 10 km/h', 'Wind 11 km/h', 'Wind 12 km/h',
  'Wind 13 km/h', 'Wind 14 km/h', 'Wind 15 km/h', 'Wind 16 km/h',
  'Wind 17 km/h', 'Wind 18 km/h', 'Wind 19 km/h', 'Wind 20 km/h',
  'Wind 21 km/h', 'Wind 22 km/h', 'Wind 23 km/h', 'Wind 24 km/h',
  'Wind 25 km/h', 'Wind 26 km/h', 'Wind 27 km/h', 'Wind 28 km/h',
  'Wind 29 km/h',
];

export async function clearStaleBasis(): Promise<void> {
  try {
    const result = await prisma.route.updateMany({
      where: {
        OR: BAD_SUBSTRINGS.map(s => ({ lastRiskBasis: { contains: s } })),
      },
      data: {
        lastRiskBasis:   '',
        lastOverallRisk: 'UNKNOWN',
        lastWeatherRisk: 'UNKNOWN',
        lastTrafficRisk: 'UNKNOWN',
        lastFloodRisk:   'UNKNOWN',
        lastRiskAt:      null,
      },
    });
    if (result.count > 0) {
      console.info(`[Startup] Cleared bad risk basis on ${result.count} routes — cron will refresh soon`);
    }
  } catch (err) {
    console.warn('[Startup] clearStaleBasis skipped:', (err as Error).message);
  }
}
