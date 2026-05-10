import { clsx } from '../utils';

function Shimmer({ className }: { className?: string }) {
  return (
    <div
      className={clsx(
        'rounded-lg bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 bg-[length:200%_100%] animate-shimmer',
        className
      )}
    />
  );
}

export function DashboardSkeleton() {
  return (
    <div className="p-4 space-y-4 animate-fadeIn">
      {/* Location */}
      <Shimmer className="h-5 w-40" />
      {/* Temperature */}
      <Shimmer className="h-16 w-28" />
      {/* Stats row */}
      <div className="flex gap-3">
        {[1,2,3,4].map(i => <Shimmer key={i} className="h-14 flex-1" />)}
      </div>
      {/* Risk badge */}
      <Shimmer className="h-20 w-full" />
      {/* Sub-risk row */}
      <div className="flex gap-2">
        {[1,2,3].map(i => <Shimmer key={i} className="h-8 flex-1 rounded-full" />)}
      </div>
      {/* Tips */}
      <Shimmer className="h-6 w-48" />
      <Shimmer className="h-4 w-full" />
      <Shimmer className="h-4 w-5/6" />
      <Shimmer className="h-4 w-4/6" />
      {/* Forecast strip */}
      <div className="flex gap-3 overflow-hidden">
        {[1,2,3,4,5,6].map(i => <Shimmer key={i} className="h-24 w-14 shrink-0" />)}
      </div>
      {/* Caption */}
      <div className="flex justify-center">
        <Shimmer className="h-4 w-36" />
      </div>
    </div>
  );
}

export function RouteCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-card space-y-2">
      <Shimmer className="h-5 w-40" />
      <Shimmer className="h-4 w-28" />
      <div className="flex gap-2">
        {[1,2,3].map(i => <Shimmer key={i} className="h-6 w-20 rounded-full" />)}
      </div>
    </div>
  );
}

export function AlertItemSkeleton() {
  return (
    <div className="bg-white p-4 space-y-2">
      <div className="flex gap-3">
        <Shimmer className="h-8 w-20 rounded-full" />
        <div className="flex-1 space-y-2">
          <Shimmer className="h-4 w-3/4" />
          <Shimmer className="h-3 w-full" />
          <Shimmer className="h-3 w-5/6" />
        </div>
      </div>
    </div>
  );
}
