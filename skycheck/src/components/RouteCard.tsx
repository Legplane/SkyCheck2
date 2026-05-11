import { useQuery } from '@tanstack/react-query';
import { Pencil, Trash2, MapPin, Clock, Navigation } from 'lucide-react';
import type { Route } from '../types';
import { fetchWeather } from '../api';
import RiskBadge from './RiskBadge';
import SubRiskRow from './SubRiskRow';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { formatDistance, formatDuration } from '../utils';
import FareEstimateList from './FareEstimateList';

interface RouteCardProps {
  route: Route;
  onEdit?: (route: Route) => void;
  onDelete?: (route: Route) => void;
}

export default function RouteCard({ route, onEdit, onDelete }: RouteCardProps) {
  const isOnline = useOnlineStatus();
  const hasUnknownRisk = [
    route.risk.overall,
    route.risk.weather,
    route.risk.traffic,
    route.risk.flood,
  ].includes('UNKNOWN');

  const { data: liveWeather, isFetching: isRefreshingRisk } = useQuery({
    queryKey: ['route-card-live-risk', route.id, route.startLat, route.startLon],
    queryFn: () => fetchWeather(route.startLat, route.startLon),
    enabled: isOnline && hasUnknownRisk,
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });

  const displayRisk = liveWeather?.risk ?? route.risk;

  return (
    <div className="bg-white rounded-2xl p-4 shadow-card space-y-3 animate-fadeIn">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-gray-900 text-sm truncate">
            {route.label ?? `${route.startAddress.split(',')[0]} → ${route.destAddress.split(',')[0]}`}
          </h3>
          <div className="flex items-center gap-1 mt-0.5">
            <Clock size={11} className="text-gray-400" />
            <span className="text-xs text-gray-500">Depart {route.departTime}</span>
          </div>
        </div>
        <div className="flex gap-1">
          {onEdit && (
            <button
              onClick={() => onEdit(route)}
              className="p-1.5 text-gray-400 hover:text-primary-600 hover:bg-blue-50 rounded-lg transition-colors"
              aria-label="Edit route"
            >
              <Pencil size={15} />
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => onDelete(route)}
              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              aria-label="Delete route"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Route info */}
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <MapPin size={11} />
        <span className="truncate">{route.startAddress.split(',').slice(0,2).join(',')}</span>
        <Navigation size={10} className="shrink-0" />
        <span className="truncate">{route.destAddress.split(',').slice(0,2).join(',')}</span>
      </div>

      {/* Risk badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <RiskBadge level={displayRisk.overall} size="sm" />
        <SubRiskRow risks={{ weather: displayRisk.weather, traffic: displayRisk.traffic, flood: displayRisk.flood }} />
        {isRefreshingRisk && (
          <span className="text-[10px] font-semibold text-gray-400">Refreshing...</span>
        )}
      </div>

      {displayRisk.basis && (
        <p className="text-[10px] text-gray-500 leading-relaxed">{displayRisk.basis}</p>
      )}

      {/* Route stats */}
      <div className="flex items-center gap-3 pt-1 border-t border-gray-50">
        <span className="text-xs text-gray-500">{formatDistance(route.distanceKm)}</span>
        <span className="text-gray-200">·</span>
        <span className="text-xs text-gray-500">{formatDuration(route.durationMin)}</span>
      </div>
      {route.fareEstimates && route.fareEstimates.length > 0 && (
        <FareEstimateList fares={route.fareEstimates} compact />
      )}
    </div>
  );
}
