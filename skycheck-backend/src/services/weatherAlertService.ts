import { AlertType, PrismaClient } from '@prisma/client';
import { RISK } from '../constants/risk';
import { effectiveWindKmH } from './weatherService';
import type { CombinedRisk, CurrentWeather, RiskLevel } from '../types';

const prisma = new PrismaClient();

function score(level: RiskLevel): number {
  return { HIGH: 3, MEDIUM: 2, LOW: 1, UNKNOWN: 0 }[level] ?? 0;
}

function primaryAlertType(risk: CombinedRisk): AlertType {
  if (score(risk.flood) >= score(risk.weather) && score(risk.flood) >= score(risk.traffic) && risk.flood !== 'LOW') {
    return 'FLOOD';
  }
  if (score(risk.traffic) > score(risk.weather) && risk.traffic !== 'LOW') {
    return 'TRAFFIC';
  }
  return 'WEATHER';
}

function buildTitle(type: AlertType, level: RiskLevel, weather: CurrentWeather): string {
  const prefix = `${level} RISK`;
  if (type === 'FLOOD') return `${prefix} - Flood Watch`;
  if (type === 'TRAFFIC') return `${prefix} - Traffic Advisory`;
  if (weather.feelsLike >= RISK.WEATHER.HEAT_MED) return `${prefix} - Heat Advisory`;
  if (effectiveWindKmH(weather) >= RISK.WEATHER.WIND_MED) return `${prefix} - Wind Advisory`;
  if (weather.precipitationProbability >= RISK.WEATHER.RAIN_MED || weather.precipitation > 0) {
    return `${prefix} - Rain Advisory`;
  }
  return `${prefix} - Weather Advisory`;
}

function buildBody(type: AlertType, location: string, risk: CombinedRisk, weather: CurrentWeather): string {
  const facts = `Rain ${weather.precipitationProbability}%, heat index ${Math.round(weather.feelsLike)}°C. ${risk.basis}`;
  if (type === 'FLOOD') return `${location}: Possible flooding may affect low-lying areas. ${facts}`;
  if (type === 'TRAFFIC') return `${location}: Traffic may delay your commute. ${facts}`;
  return `${location}: Weather may affect your commute. ${facts}`;
}

export async function maybeCreateCurrentWeatherAlert(input: {
  userId: string;
  location: string;
  risk: CombinedRisk;
  weather: CurrentWeather;
}): Promise<void> {
  if (input.risk.overall !== 'HIGH' && input.risk.overall !== 'MEDIUM') return;

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { morningAlerts: true },
  });
  if (!user?.morningAlerts) return;

  const type = primaryAlertType(input.risk);
  const recent = await prisma.alert.findFirst({
    where: {
      userId: input.userId,
      routeId: null,
      type,
      riskLevel: input.risk.overall,
      createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) },
    },
  });
  if (recent) return;

  await prisma.alert.create({
    data: {
      userId: input.userId,
      routeId: null,
      type,
      riskLevel: input.risk.overall,
      title: buildTitle(type, input.risk.overall, input.weather),
      body: buildBody(type, input.location, input.risk, input.weather),
    },
  });
}
