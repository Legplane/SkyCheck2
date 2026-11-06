import { WifiOff } from 'lucide-react';

interface OfflineBannerProps {
  cachedAt?: string;
  /** minutes since the cached data was fetched */
  ageMin?: number;
}

export default function OfflineBanner({ cachedAt, ageMin }: OfflineBannerProps) {
  const veryOld = typeof ageMin === 'number' && ageMin > 180;
  return (
    <div className={`${veryOld ? 'bg-red-600' : 'bg-orange-500'} text-white px-4 py-2.5 flex items-center gap-2 text-sm font-medium`}>
      <WifiOff size={16} className="shrink-0" />
      <span>
        Offline mode — Showing cached data
        {cachedAt ? ` from ${cachedAt}` : ''}
        {veryOld ? ' · may be outdated' : ''}
      </span>
    </div>
  );
}
