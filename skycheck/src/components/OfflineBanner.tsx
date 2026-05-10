import { WifiOff } from 'lucide-react';

interface OfflineBannerProps {
  cachedAt?: string;
}

export default function OfflineBanner({ cachedAt }: OfflineBannerProps) {
  return (
    <div className="bg-orange-500 text-white px-4 py-2.5 flex items-center gap-2 text-sm font-medium">
      <WifiOff size={16} className="shrink-0" />
      <span>
        Offline mode — Showing cached data
        {cachedAt ? ` from ${cachedAt}` : ''}
      </span>
    </div>
  );
}
