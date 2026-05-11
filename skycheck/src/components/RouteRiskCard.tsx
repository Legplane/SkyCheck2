import { useQuery } from '@tanstack/react-query';
import { Clock, MapPin, RefreshCw } from 'lucide-react';
import { fetchWeather } from '../api';
import type { Route } from '../types';
import RiskBadge from './RiskBadge';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { RISK_BG_LIGHT } from '../constants/risk';
import FareEstimateList from './FareEstimateList';

// ─────────────────────────────────────────────────────────────────
// RouteRiskCard
// Shows on the Dashboard per saved route with its OWN weather
// fetched from the route's START coordinates — so a student going
// from Olongapo → Gordon College gets Olongapo weather risk,
// not the user's current GPS location risk.
// ─────────────────────────────────────────────────────────────────

interface RouteRiskCardProps {
  route: Route;
}

export default function RouteRiskCard({ route }: RouteRiskCardProps) {
  const isOnline = useOnlineStatus();

  // Fetch weather at the route's START location
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['route-weather', route.id, route.startLat, route.startLon],
    queryFn: () => fetchWeather(route.startLat, route.startLon),
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: isOnline ? 1 : 0,
    enabled: isOnline,
  });

  const routeName = route.label ??
    `${route.startAddress.split(',')[0].trim()} → ${route.destAddress.split(',')[0].trim()}`;

  // Use live-fetched risk if available, fall back to cached cron risk
  const risk = data?.risk ?? route.risk;
  const weatherIcon = data?.current.weatherIcon ?? '🌡️';
  const temperature = data?.current.temperature ?? null;

  return (
    <div className={`rounded-2xl p-3.5 ${RISK_BG_LIGHT[risk.overall]} transition-all`}>
      {/* Row 1: route name + risk badge */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-base">{weatherIcon}</span>
            <p className="text-sm font-bold text-gray-900 truncate">{routeName}</p>
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            <div className="flex items-center gap-1">
              <Clock size={10} className="text-gray-400" />
              <span className="text-xs text-gray-500">Depart {route.departTime}</span>
            </div>
            <div className="flex items-center gap-1">
              <MapPin size={10} className="text-gray-400" />
              <span className="text-xs text-gray-500">{route.startAddress.split(',')[0]}</span>
            </div>
            {temperature !== null && (
              <span className="text-xs font-semibold text-gray-700">{Math.round(temperature)}°C</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isLoading && (
            <div className="w-3 h-3 border border-gray-300 border-t-primary-600 rounded-full animate-spin" />
          )}
          {!isLoading && (
            <button
              onClick={() => refetch()}
              disabled={isFetching || !isOnline}
              className="p-1 text-gray-400 hover:text-primary-600 rounded-lg disabled:opacity-30"
              title="Refresh this route's weather"
            >
              <RefreshCw size={11} className={isFetching ? 'animate-spin' : ''} />
            </button>
          )}
          <RiskBadge level={risk.overall} size="sm" />
        </div>
      </div>

      {/* Row 2: sub-risks */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Weather sub-risk */}
        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
          risk.weather === 'HIGH'   ? 'bg-red-100 text-red-700' :
          risk.weather === 'MEDIUM' ? 'bg-amber-100 text-amber-700' :
          'bg-green-100 text-green-700'
        }`}>🌧 {risk.weather}</span>

        {/* Traffic sub-risk */}
        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
          risk.traffic === 'HIGH'    ? 'bg-red-100 text-red-700' :
          risk.traffic === 'MEDIUM'  ? 'bg-amber-100 text-amber-700' :
          risk.traffic === 'UNKNOWN' ? 'bg-gray-100 text-gray-500' :
          'bg-green-100 text-green-700'
        }`}>🚗 {risk.traffic}</span>

        {/* Flood sub-risk */}
        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
          risk.flood === 'HIGH'   ? 'bg-red-100 text-red-700' :
          risk.flood === 'MEDIUM' ? 'bg-amber-100 text-amber-700' :
          'bg-green-100 text-green-700'
        }`}>🌊 {risk.flood}</span>
      </div>

      {/* Risk basis */}
      {risk.basis && (
        <p className="text-[10px] text-gray-500 mt-1.5 leading-relaxed">{risk.basis}</p>
      )}

      {route.fareEstimates && route.fareEstimates.length > 0 && (
        <div className="mt-2">
          <FareEstimateList fares={route.fareEstimates} compact />
        </div>
      )}
    </div>
  );
}
