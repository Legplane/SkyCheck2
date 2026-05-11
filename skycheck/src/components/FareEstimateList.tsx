import type { FareEstimate } from '../types';
import { fareStatusClass, fareStatusLabel, formatFare } from '../utils';

interface FareEstimateListProps {
  fares?: FareEstimate[];
  compact?: boolean;
}

export default function FareEstimateList({ fares = [], compact = false }: FareEstimateListProps) {
  if (fares.length === 0) return null;

  return (
    <div className={compact ? 'grid grid-cols-1 min-[430px]:grid-cols-2 gap-2' : 'space-y-2'}>
      {fares.map((fare) => (
        <div
          key={fare.mode}
          className={`rounded-xl border border-gray-100 bg-white ${compact ? 'p-2' : 'p-3'}`}
        >
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <div className="min-w-0 flex items-center gap-1.5">
              <span className="shrink-0 text-base">{fare.icon}</span>
              <span className="whitespace-normal break-words text-xs font-bold text-gray-800">{fare.label}</span>
            </div>
            <span className="shrink-0 text-xs font-bold text-primary-600">
              {formatFare(fare)}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
            <span className="text-[10px] leading-tight text-gray-400">Student/PWD/Senior</span>
            <span className="shrink-0 text-[10px] font-bold text-gray-700">
              {formatFare({ min: fare.discountMin, max: fare.discountMax })}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-start justify-between gap-2">
            <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${fareStatusClass(fare.status)}`}>
              {fareStatusLabel(fare.status)}
            </span>
            {!compact && (
              <p className="text-right text-[10px] leading-snug text-gray-500">
                {fare.note} {fare.discountNote}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
