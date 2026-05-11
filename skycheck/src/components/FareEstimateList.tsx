import type { FareEstimate } from '../types';
import { fareStatusClass, fareStatusLabel, formatFare } from '../utils';

interface FareEstimateListProps {
  fares?: FareEstimate[];
  compact?: boolean;
}

export default function FareEstimateList({ fares = [], compact = false }: FareEstimateListProps) {
  if (fares.length === 0) return null;

  return (
    <div className={compact ? 'grid grid-cols-2 gap-2' : 'space-y-2'}>
      {fares.map((fare) => (
        <div
          key={fare.mode}
          className={`rounded-xl border border-gray-100 bg-white ${compact ? 'p-2' : 'p-3'}`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex items-center gap-1.5">
              <span className="text-base">{fare.icon}</span>
              <span className="truncate text-xs font-bold text-gray-800">{fare.label}</span>
            </div>
            <span className="shrink-0 text-xs font-bold text-primary-600">
              {formatFare(fare)}
            </span>
          </div>
          <div className="mt-1.5 flex items-start justify-between gap-2">
            <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${fareStatusClass(fare.status)}`}>
              {fareStatusLabel(fare.status)}
            </span>
            {!compact && (
              <p className="text-right text-[10px] leading-snug text-gray-500">{fare.note}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
