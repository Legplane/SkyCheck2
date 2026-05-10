import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, useCallback } from 'react';
import { RefreshCw, MapPin, Bell, Menu, Navigation, AlertTriangle, ShieldCheck, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { fetchWeather } from '../../api';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { FALLBACK_LOCATION, useGeoStore, selectIsLive, selectIsReady } from '../../store/geoStore';
import OfflineBanner from '../../components/OfflineBanner';
import RiskBadge from '../../components/RiskBadge';
import SubRiskRow from '../../components/SubRiskRow';
import WeatherStat from '../../components/WeatherStat';
import HourlyForecastItem from '../../components/HourlyForecastItem';
import { DashboardSkeleton } from '../../components/SkeletonLoader';
import { RISK_BG_LIGHT, RISK_TEXT_COLORS } from '../../constants/risk';
import { formatUpdatedAt } from '../../utils';

const TRUSTED_GPS_ACCURACY_M = 500;

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function DashboardPage() {
  const isOnline  = useOnlineStatus();
  const qc        = useQueryClient();

  const status    = useGeoStore((s) => s.status);
  const lat       = useGeoStore((s) => s.lat);
  const lon       = useGeoStore((s) => s.lon);
  const accuracy  = useGeoStore((s) => s.accuracy);
  const isLive    = useGeoStore(selectIsLive);
  const isReady   = useGeoStore(selectIsReady);
  const reason    = useGeoStore((s) => s.reason);
  const startGPS         = useGeoStore((s) => s.startGPS);
  const refreshLocation  = useGeoStore((s) => s.refreshLocation);

  const [locRefreshing, setLocRefreshing] = useState(false);
  /** ISO — set when user taps refresh and weather loads successfully ("Updated …" reflects this tap). */
  const [lastManualRefreshAt, setLastManualRefreshAt] = useState<string | null>(null);
  const refreshInFlightRef = useRef(false);
  const gpsTapRef = useRef(0);
  const hasTrustedLiveLocation = isLive && accuracy > 0 && accuracy <= TRUSTED_GPS_ACCURACY_M;
  const canFetchWeather = isOnline && isReady && (status !== 'granted' || hasTrustedLiveLocation);

  const prevCoordsRef = useRef<{ lat: number; lon: number } | null>(null);

  // Remove stale weather cache if user moved significantly
  useEffect(() => {
    if (status !== 'granted') return;
    const prev = prevCoordsRef.current;
    if (prev && haversineM(prev.lat, prev.lon, lat, lon) > 500) {
      qc.removeQueries({ queryKey: ['weather'] });
    }
    prevCoordsRef.current = { lat, lon };
  }, [lat, lon, status, qc]);

  const cachedWeather = qc.getQueriesData<Awaited<ReturnType<typeof fetchWeather>>>({ queryKey: ['weather'] })
    .find(([, cached]) => Boolean(cached))?.[1];

  const { data: liveData, isLoading, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ['weather', lat, lon],
    queryFn:  () => fetchWeather(lat, lon),
    staleTime: 15 * 60 * 1000,
    gcTime:    60 * 60 * 1000,
    retry: isOnline ? 2 : 0,
    enabled: canFetchWeather,
    initialData: !isOnline ? cachedWeather : undefined,
    // Keep weather stable while navigating tabs; refresh on interval or manual tap.
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: canFetchWeather ? 15 * 60 * 1000 : false,
    refetchIntervalInBackground: false,
  });

  const data = liveData ?? (!isOnline ? cachedWeather : undefined);

  const handleStartGPS = useCallback(() => {
    const now = Date.now();
    if (now - gpsTapRef.current < 800) return;
    gpsTapRef.current = now;
    startGPS();
  }, [startGPS]);

  const refreshWeatherAndLocation = useCallback(async () => {
    if (!isOnline || !isReady || refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    setLocRefreshing(true);
    try {
      await refreshLocation();
      const { lat: la, lon: lo } = useGeoStore.getState();
      const { status: nextStatus, accuracy: nextAccuracy } = useGeoStore.getState();
      if (nextStatus === 'granted' && nextAccuracy > TRUSTED_GPS_ACCURACY_M) {
        return;
      }
      await qc.invalidateQueries({ queryKey: ['weather', la, lo], exact: true });
      await qc.fetchQuery({
        queryKey: ['weather', la, lo],
        queryFn:  () => fetchWeather(la, lo),
        staleTime: 0,
      });
      setLastManualRefreshAt(new Date().toISOString());
    } finally {
      refreshInFlightRef.current = false;
      setLocRefreshing(false);
    }
  }, [isOnline, isReady, refreshLocation, qc]);

  // ── Waiting for GPS ───────────────────────────────────────────
  if (!isReady && !data) {
    return (
      <div className="flex flex-col min-h-screen w-full max-w-6xl mx-auto bg-gray-50">
        <AppHeader />
        <div className="flex flex-col items-center justify-center flex-1 gap-5 px-8 text-center">
          <div className="bg-blue-100 p-6 rounded-full">
            <Navigation size={40} className="text-primary-600 animate-pulse" />
          </div>
          <p className="font-semibold text-gray-800 text-lg">Getting your location…</p>
          <p className="text-sm text-gray-500 leading-relaxed">
            Tap <strong>Allow</strong> when your browser asks for location access.
          </p>
          <button
            type="button"
            onClick={handleStartGPS}
            onMouseDown={handleStartGPS}
            onTouchStart={handleStartGPS}
            onPointerUp={handleStartGPS}
            className="relative z-20 min-h-12 min-w-44 px-6 py-3 bg-primary-600 text-white rounded-xl text-sm font-semibold shadow-card touch-manipulation hover:bg-primary-700 active:scale-[0.98] transition">
            {status === 'requesting' ? 'Checking GPS...' : 'Allow GPS Access'}
          </button>
        </div>
      </div>
    );
  }

  // ── Loading skeleton ──────────────────────────────────────────
  if (isLoading && !data) {
    return (
      <div className="flex flex-col min-h-screen w-full max-w-6xl mx-auto bg-gray-50">
        <AppHeader />
        {status === 'denied' && (
          <LocationBanner reason={reason} onRetry={handleStartGPS} />
        )}
        <DashboardSkeleton />
      </div>
    );
  }

  // ── No data ───────────────────────────────────────────────────
  if (!data) {
    return (
      <div className="flex flex-col min-h-screen w-full max-w-6xl mx-auto bg-gray-50">
        <AppHeader />
        <div className="flex flex-col items-center justify-center flex-1 gap-4 px-8 text-center">
          <span className="text-5xl">🌐</span>
          <p className="text-gray-600 text-sm max-w-xs leading-relaxed">
            {isLive && accuracy > TRUSTED_GPS_ACCURACY_M
              ? 'Your browser only gave a rough location. Try refresh again, move near a window, or use phone GPS.'
              : 'Unable to load weather. Check your connection.'}
          </p>
          <button onClick={() => refreshWeatherAndLocation()}
            className="px-5 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-semibold">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const { current, hourly, risk, commuteTips, location } = data;
  const displayLocation = status === 'denied' || status === 'unavailable'
    ? FALLBACK_LOCATION.displayName
    : location;

  const updatedLabel = formatUpdatedAt(
    lastManualRefreshAt
      ?? (dataUpdatedAt ? new Date(dataUpdatedAt).toISOString() : current.updatedAt),
  );

  return (
    <div className="flex flex-col min-h-screen w-full max-w-6xl mx-auto bg-gray-50 pb-20">
      {!isOnline && <OfflineBanner cachedAt={updatedLabel} />}
      {status === 'denied' && <LocationBanner reason={reason} onRetry={handleStartGPS} />}

      <AppHeader />

      <div className="flex-1 overflow-y-auto">
        {/* Location row */}
        <div className="px-4 pt-4 flex items-center justify-between">
          <div className="min-w-0 flex-1 mr-2">
            <div className="flex items-start gap-1.5 min-w-0">
              <MapPin size={13} className={`shrink-0 mt-0.5 ${!hasTrustedLiveLocation ? 'text-amber-500' : 'text-primary-600'}`} />
              <span className="text-sm font-medium text-gray-700 leading-snug break-words min-w-0">
                {displayLocation}, PH
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {hasTrustedLiveLocation ? (
                <span className="shrink-0 text-[11px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full font-medium inline-flex items-center gap-0.5">
                  <Navigation size={9} /> Live +/-{accuracy}m
                </span>
              ) : (
                <span className="shrink-0 text-[11px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full font-medium">
                  {isLive && accuracy ? `Imprecise +/-${accuracy}m` : 'Estimated'}
                </span>
              )}
              {isLive && accuracy > TRUSTED_GPS_ACCURACY_M && (
                <span className="text-[11px] text-gray-400">Use phone GPS or refresh outdoors</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-gray-400">{updatedLabel}</span>
            <button
              type="button"
              title="Refresh location & weather"
              onClick={() => refreshWeatherAndLocation()}
              disabled={!isOnline || locRefreshing || isFetching}
              className="p-1.5 text-gray-400 hover:text-primary-600 rounded-lg disabled:opacity-40">
              <RefreshCw size={14} className={(locRefreshing || isFetching) ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Temperature */}
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-end gap-3">
            <span className="text-7xl font-bold text-gray-900 leading-none">
              {Math.round(current.temperature)}°C
            </span>
            <span className="text-4xl mb-1">{current.weatherIcon}</span>
          </div>
          <p className="text-sm text-gray-500 mt-1">Feels like {Math.round(current.feelsLike)}°C</p>
          <p className="text-base font-semibold text-gray-700 mt-0.5">{current.weatherLabel}</p>
        </div>

        {/* Stats */}
        <div className="mx-4 mt-3 bg-white rounded-2xl shadow-card p-4">
          <div className="grid grid-cols-4 gap-2">
            <WeatherStat icon="💨" value={`${Math.round(current.windSpeed)}`} label="km/h" />
            <WeatherStat icon="🌡️" value={`${Math.round(current.feelsLike)}°`}     label="Heat Idx" />
            <WeatherStat icon="🌧️" value={`${current.precipitationProbability}%`}  label="Rain Prob"/>
            <WeatherStat icon="💧" value={`${current.humidity}%`}                   label="Humidity" />
          </div>
        </div>

        {/* Risk card */}
        <div className={`mx-4 mt-3 rounded-2xl p-4 ${RISK_BG_LIGHT[risk.overall]}`}>
          <RiskBadge level={risk.overall} size="lg" />
          <p className={`text-sm font-semibold mt-2 mb-1 ${
            risk.overall === 'HIGH'   ? 'text-red-700'
            : risk.overall === 'MEDIUM' ? 'text-amber-700'
            : 'text-green-700'
          }`}>
            {risk.overall === 'HIGH'   && 'Severe weather — consider delaying your commute'}
            {risk.overall === 'MEDIUM' && 'Use caution — conditions may affect your commute'}
            {risk.overall === 'LOW'    && 'Great day to commute! — weather is clear'}
          </p>
          <p className="text-xs text-gray-500">{risk.basis}</p>
          <div className="mt-3">
            <SubRiskRow risks={{ weather: risk.weather, traffic: risk.traffic, flood: risk.flood }} />
          </div>
        </div>

        {/* Commute Tips */}
        {commuteTips.length > 0 && (
          <div className="mx-4 mt-3 bg-white rounded-2xl shadow-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-900">Today's Commute Tips</h3>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${RISK_TEXT_COLORS[risk.overall]} bg-gray-100`}>
                {commuteTips.length} Tips
              </span>
            </div>
            <ul className="space-y-2">
              {commuteTips.map((tip, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="mt-0.5 text-primary-600 shrink-0">•</span>
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 6-Hour Forecast — 3×2 grid so tiles stay equal width & aligned */}
        <div className="mx-4 mt-3 bg-white rounded-2xl shadow-card p-4">
          <h3 className="text-sm font-bold text-gray-900 mb-3">⏱ 6-Hour Forecast</h3>
          <div className="grid grid-cols-3 gap-3">
            {hourly.slice(0, 6).map((h, i) => (
              <HourlyForecastItem
                key={`${h.time}-${i}`}
                time={h.time}
                temperature={h.temperature}
                weatherCode={h.weatherCode}
                precipitationProbability={h.precipitationProbability}
              />
            ))}
          </div>
        </div>

        {/* Go / No-Go entry card */}
        <div className="mx-4 mt-3">
          <Link to="/app/go-no-go"
            className="flex items-center gap-3 bg-primary-800 rounded-2xl p-4 shadow-card-lg hover:bg-primary-900 transition-colors">
            <div className="bg-white/20 p-2.5 rounded-xl shrink-0">
              <ShieldCheck size={22} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-sm">Should I go to school today?</p>
              <p className="text-blue-200 text-xs mt-0.5">Check your Go / No-Go decision →</p>
            </div>
            <ChevronRight size={18} className="text-white/60 shrink-0" />
          </Link>
        </div>

        <div className="h-4" />
      </div>
    </div>
  );
}

function LocationBanner({ reason, onRetry }: { reason: string; onRetry: () => void }) {
  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-start gap-2">
      <AlertTriangle size={14} className="text-amber-600 shrink-0" />
      <span className="text-xs text-amber-800 flex-1 min-w-0 leading-snug break-words">
        {reason || 'Precise location unavailable'} Showing {FALLBACK_LOCATION.displayName} weather instead. For accurate tracking, use the mobile version.
      </span>
      <button
        type="button"
        onClick={onRetry}
        onMouseDown={onRetry}
        onTouchStart={onRetry}
        onPointerUp={onRetry}
        className="relative z-20 min-h-10 px-2 text-xs font-semibold text-amber-700 underline shrink-0 touch-manipulation">
        Allow GPS
      </button>
    </div>
  );
}

function AppHeader() {
  return (
    <header className="flex items-center justify-between px-4 pt-12 pb-3 bg-white border-b border-gray-100">
      <button className="p-2 -ml-1 text-gray-600 hover:bg-gray-100 rounded-xl">
        <Menu size={22} />
      </button>
      <div className="flex items-center gap-2">
        <svg width="20" height="20" viewBox="0 0 90 90" fill="none">
          <path d="M72 54a18 18 0 0 0-13.5-17.4A24 24 0 0 0 18 45a18 18 0 0 0 0 36h54a18 18 0 0 0 0-36z"
            fill="#1A56C4" />
        </svg>
        <span className="text-base font-bold text-gray-900">SkyCheck</span>
      </div>
      <Link to="/app/alerts"
        className="relative p-2 -mr-1 text-gray-600 hover:bg-gray-100 rounded-xl">
        <Bell size={20} />
      </Link>
    </header>
  );
}
