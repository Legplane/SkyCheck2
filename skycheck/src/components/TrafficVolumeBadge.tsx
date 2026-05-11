import type { CombinedRisk } from '../types';

interface TrafficVolumeBadgeProps {
  risk: CombinedRisk;
}

function volumeLabel(level: CombinedRisk['trafficVolumeLevel'] | CombinedRisk['traffic']): string {
  if (level === 'HIGH') return 'High volume';
  if (level === 'MEDIUM') return 'Moderate volume';
  if (level === 'LOW') return 'Low volume';
  return 'Volume unknown';
}

function volumeClass(level: CombinedRisk['trafficVolumeLevel'] | CombinedRisk['traffic']): string {
  if (level === 'HIGH') return 'bg-red-50 text-red-700';
  if (level === 'MEDIUM') return 'bg-amber-50 text-amber-700';
  if (level === 'LOW') return 'bg-green-50 text-green-700';
  return 'bg-gray-100 text-gray-500';
}

export default function TrafficVolumeBadge({ risk }: TrafficVolumeBadgeProps) {
  const level = risk.trafficVolumeLevel ?? risk.traffic;
  const source = risk.trafficSource === 'tomtom' ? 'TomTom' : risk.trafficSource === 'heuristic' ? 'time based' : 'cached';

  return (
    <span className={`inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-[10px] font-semibold leading-tight ${volumeClass(level)}`}>
      <span className="truncate">Traffic: {volumeLabel(level)} ({source})</span>
    </span>
  );
}
