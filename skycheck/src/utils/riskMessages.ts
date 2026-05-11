import type { CombinedRisk, RiskLevel } from '../types';

type RiskKey = 'weather' | 'traffic' | 'flood';

const LABELS: Record<RiskKey, string> = {
  weather: 'weather/heat',
  traffic: 'traffic',
  flood: 'flood',
};

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function factorsAt(risk: CombinedRisk, level: RiskLevel): RiskKey[] {
  return (['weather', 'traffic', 'flood'] as RiskKey[]).filter((key) => risk[key] === level);
}

function highAction(high: RiskKey[]): string {
  if (high.includes('flood')) return 'avoid low-lying routes and consider delaying travel';
  if (high.includes('weather') && high.includes('traffic')) return 'consider delaying travel or leave much earlier';
  if (high.includes('weather')) return 'consider delaying travel and prepare for harsh conditions';
  if (high.includes('traffic')) return 'expect major delays and leave earlier';
  return 'proceed only with extra caution';
}

function mediumAction(medium: RiskKey[]): string {
  if (medium.includes('flood')) return 'monitor flood-prone roads before leaving';
  if (medium.includes('weather') && medium.includes('traffic')) return 'bring protection and allow extra travel time';
  if (medium.includes('weather')) return 'bring protection and monitor the forecast';
  if (medium.includes('traffic')) return 'allow extra travel time';
  return 'stay alert before commuting';
}

export function commuteRiskHeadline(risk: CombinedRisk): string {
  const high = factorsAt(risk, 'HIGH');
  const medium = factorsAt(risk, 'MEDIUM');
  const unknown = factorsAt(risk, 'UNKNOWN');

  if (high.length > 0) {
    const main = joinList(high.map((key) => LABELS[key]));
    const secondary = medium.length > 0
      ? ` with moderate ${joinList(medium.map((key) => LABELS[key]))}`
      : '';
    return `High ${main} risk${secondary} - ${highAction(high)}`;
  }

  if (medium.length > 0) {
    const main = joinList(medium.map((key) => LABELS[key]));
    const secondary = unknown.length > 0
      ? `; ${joinList(unknown.map((key) => LABELS[key]))} data is unavailable`
      : '';
    return `Moderate ${main} risk${secondary} - ${mediumAction(medium)}`;
  }

  if (risk.overall === 'UNKNOWN' || unknown.length > 0) {
    return `${joinList(unknown.map((key) => LABELS[key])) || 'Some'} data is unavailable - use caution`;
  }

  return 'Great day to commute - weather, traffic, and flood risk look clear';
}
