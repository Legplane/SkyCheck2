// Compatibility shim — delegates to global geoStore.
// Any page that still imports this hook works correctly.
import { useGeoStore, selectIsLive } from '../store/geoStore';

export function useGeolocation() {
  const status   = useGeoStore((s) => s.status);
  const lat      = useGeoStore((s) => s.lat);
  const lon      = useGeoStore((s) => s.lon);
  const accuracy = useGeoStore((s) => s.accuracy);
  const reason   = useGeoStore((s) => s.reason);
  const isLive   = useGeoStore(selectIsLive);
  const startGPS = useGeoStore((s) => s.startGPS);
  const skipFn   = useGeoStore((s) => s.skipToFallback);

  return {
    geo: { status, lat, lon, accuracy, reason } as const,
    coords: { lat, lon },
    isUsingFallback: !isLive,
    isGpsLive: isLive,
    retry: startGPS,
    skip:  skipFn,
  };
}
