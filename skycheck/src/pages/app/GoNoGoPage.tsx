import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronLeft, RefreshCw, CheckCircle2, AlertTriangle,
  XCircle, Shield, Thermometer, Car, CloudRain,
  Waves, Building2, Landmark, Activity, Sun
} from 'lucide-react';
import { evaluateGoNoGo, getTodayHealthCheck } from '../../api';
import { useGeoStore } from '../../store/geoStore';
import type { GoNoGoVerdict, GoNoGoFactor } from '../../types';
import { healthCheckSignature } from '../../utils/healthSignature';
import { clsx } from '../../utils';

const VERDICT_CONFIG: Record<GoNoGoVerdict, {
  label: string; emoji: string; bg: string; text: string; border: string; icon: typeof CheckCircle2;
}> = {
  GO: {
    label: 'SAFE TO GO', emoji: '✅',
    bg: 'bg-green-500', text: 'text-green-700', border: 'border-green-200', icon: CheckCircle2,
  },
  OWN_RISK: {
    label: 'PROCEED AT YOUR OWN RISK', emoji: '⚠️',
    bg: 'bg-amber-500', text: 'text-amber-700', border: 'border-amber-200', icon: AlertTriangle,
  },
  DO_NOT_GO: {
    label: 'DO NOT GO', emoji: '🚫',
    bg: 'bg-red-500', text: 'text-red-700', border: 'border-red-200', icon: XCircle,
  },
};

const CATEGORY_ICONS: Record<GoNoGoFactor['category'], typeof Shield> = {
  HEALTH: Activity, WEATHER: CloudRain, FLOOD: Waves,
  TRAFFIC: Car, SCHOOL: Building2, GOVERNMENT: Landmark, HEAT: Sun,
};

const STATUS_COLORS: Record<GoNoGoFactor['status'], string> = {
  OK:      'bg-green-100 text-green-700',
  CAUTION: 'bg-amber-100 text-amber-700',
  DANGER:  'bg-red-100   text-red-700',
};

const STATUS_DOT: Record<GoNoGoFactor['status'], string> = {
  OK: 'bg-green-500', CAUTION: 'bg-amber-500', DANGER: 'bg-red-500',
};

export default function GoNoGoPage() {
  const navigate = useNavigate();
  // Use global GPS store — no per-page GPS restart
  const lat      = useGeoStore((s) => s.lat);
  const lon      = useGeoStore((s) => s.lon);

  const { data: todayHealth, isLoading: healthLoading } = useQuery({
    queryKey: ['health-today'],
    queryFn:  getTodayHealthCheck,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const healthKey = todayHealth ? healthCheckSignature(todayHealth) : 'none';

  const { data: result, isLoading, isFetching, refetch, error } = useQuery({
    // Include health answers so updating the check invalidates cache and refetches evaluation.
    queryKey: ['go-no-go', lat, lon, healthKey],
    queryFn:  () => evaluateGoNoGo({ lat, lon }),
    staleTime: 5 * 60 * 1000,
    gcTime:    0,
    retry: 1,
    enabled: !!todayHealth,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    refetchInterval: 5 * 60 * 1000,
  });

  // ── No health check yet ───────────────────────────────────────
  if (!healthLoading && !todayHealth) {
    return (
      <div className="flex flex-col min-h-screen w-full max-w-6xl mx-auto bg-gray-50">
        <PageHeader onBack={() => navigate(-1)} onRefresh={refetch} isFetching={false} />
        <div className="flex flex-col items-center justify-center flex-1 gap-5 px-8 text-center">
          <div className="bg-blue-100 p-6 rounded-full">
            <Activity size={48} className="text-primary-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Health Check Required</h2>
            <p className="text-gray-500 text-sm mt-2 leading-relaxed">
              Complete your daily health check first so SkyCheck can give you an accurate Go/No-Go decision.
            </p>
          </div>
          <button
            onClick={() => navigate('/app/health-check')}
            className="w-full py-4 bg-primary-600 text-white font-bold rounded-2xl hover:bg-primary-700 transition-colors"
          >
            Start Health Check →
          </button>
        </div>
      </div>
    );
  }

  // ── Loading ───────────────────────────────────────────────────
  if (isLoading || healthLoading) {
    return (
      <div className="flex flex-col min-h-screen w-full max-w-6xl mx-auto bg-gray-50">
        <PageHeader onBack={() => navigate(-1)} onRefresh={refetch} isFetching={true} />
        <div className="flex flex-col items-center justify-center flex-1 gap-4 px-8 text-center">
          <div className="w-16 h-16 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
          <p className="font-semibold text-gray-700">Evaluating all conditions…</p>
          <p className="text-sm text-gray-500">Checking health · weather · flood · traffic · announcements</p>
        </div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────
  if (error || !result) {
    return (
      <div className="flex flex-col min-h-screen w-full max-w-6xl mx-auto bg-gray-50">
        <PageHeader onBack={() => navigate(-1)} onRefresh={refetch} isFetching={false} />
        <div className="flex flex-col items-center justify-center flex-1 gap-4 px-8 text-center">
          <span className="text-5xl">⚠️</span>
          <p className="text-gray-600 text-sm">Could not complete evaluation. Check your connection.</p>
          <button onClick={() => refetch()}
            className="px-5 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-semibold">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const vc = VERDICT_CONFIG[result.verdict];
  const VerdictIcon = vc.icon;

  return (
    <div className="flex flex-col min-h-screen w-full max-w-6xl mx-auto bg-gray-50 pb-24">
      <PageHeader onBack={() => navigate(-1)} onRefresh={refetch} isFetching={isFetching} />

      <div className="flex-1 overflow-y-auto">
        {/* Main Verdict Card */}
        <div className={`mx-4 mt-4 rounded-3xl p-6 border-2 ${vc.border} bg-white shadow-card-lg`}>
          {result.schoolTitle && (
            <div className="flex items-center gap-2 mb-4 p-2.5 bg-blue-50 border border-blue-100 rounded-xl">
              <Building2 size={14} className="text-blue-600 shrink-0" />
              <span className="text-xs text-blue-700 font-medium">{result.schoolTitle}</span>
            </div>
          )}
          <div className="flex flex-col items-center text-center gap-3">
            <div className={`${vc.bg} p-5 rounded-full`}>
              <VerdictIcon size={36} className="text-white" />
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Today's Decision</p>
              <h2 className={`text-2xl font-black ${vc.text}`}>{vc.label}</h2>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed max-w-xs">{result.primaryReason}</p>
          </div>

          {/* Safety score bar */}
          <div className="mt-5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-gray-500 font-medium">Safety Score</span>
              <span className={`text-sm font-bold ${vc.text}`}>{result.safetyScore}/100</span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  result.safetyScore >= 70 ? 'bg-green-500'
                  : result.safetyScore >= 40 ? 'bg-amber-500'
                  : 'bg-red-500'
                }`}
                style={{ width: `${result.safetyScore}%` }}
              />
            </div>
          </div>

          {/* Recommendation */}
          <div className="mt-4 p-3.5 bg-gray-50 rounded-2xl border border-gray-100">
            <p className="text-sm text-gray-700 leading-relaxed font-medium">
              💡 {result.recommendation}
            </p>
          </div>
        </div>

        {/* Weather Snapshot */}
        <div className="mx-4 mt-3 bg-white rounded-2xl shadow-card p-4">
          <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
            <CloudRain size={15} className="text-primary-600" /> Current Conditions
          </h3>
          <div className="flex items-center gap-3">
            <span className="text-4xl">{result.weather.weatherIcon}</span>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {result.weather.temperature}°C
                <span className="text-base font-normal text-gray-500 ml-1">
                  / Feels {result.weather.feelsLike}°C
                </span>
              </p>
              <p className="text-sm text-gray-600">{result.weather.weatherLabel}</p>
              <p className="text-xs text-gray-400">
                Rain {result.weather.rainProb}% · Overall: {result.risk.overall}
              </p>
            </div>
          </div>
        </div>

        {/* Active Government Advisories */}
        {result.govAdvisories.length > 0 && (
          <div className="mx-4 mt-3 bg-red-50 border border-red-200 rounded-2xl p-4">
            <h3 className="text-sm font-bold text-red-700 mb-2 flex items-center gap-2">
              <Landmark size={14} /> Active Government Advisories
            </h3>
            {result.govAdvisories.map((a, i) => (
              <div key={i} className="flex items-start gap-2 mt-2">
                <span className={clsx(
                  'text-xs font-bold px-2 py-0.5 rounded-full shrink-0',
                  a.severity === 'CRITICAL' ? 'bg-red-600 text-white'
                  : a.severity === 'WARNING'  ? 'bg-red-500 text-white'
                  : 'bg-amber-500 text-white'
                )}>
                  {a.severity}
                </span>
                <p className="text-xs text-red-800">{a.source}: {a.title}</p>
              </div>
            ))}
          </div>
        )}

        {/* Full Factor Breakdown */}
        <div className="mx-4 mt-3 bg-white rounded-2xl shadow-card overflow-hidden">
          <div className="px-4 pt-4 pb-2">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <Shield size={15} className="text-primary-600" /> Full Assessment
            </h3>
          </div>
          <div className="divide-y divide-gray-50">
            {result.factors.map((factor, i) => {
              const Icon = CATEGORY_ICONS[factor.category] ?? Shield;
              return (
                <div key={i} className="flex items-start gap-3 px-4 py-3">
                  <div className="shrink-0 mt-0.5">
                    <Icon size={16} className="text-gray-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-800">{factor.label}</span>
                      <span className={clsx('text-xs px-2 py-0.5 rounded-full font-semibold', STATUS_COLORS[factor.status])}>
                        {factor.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{factor.detail}</p>
                  </div>
                  <div className={clsx('w-2.5 h-2.5 rounded-full shrink-0 mt-1.5', STATUS_DOT[factor.status])} />
                </div>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="mx-4 mt-4 space-y-3">
          <button
            type="button"
            onClick={() => navigate('/app/health-check', { state: { editHealth: true } })}
            className="w-full py-3.5 border-2 border-primary-600 text-primary-600 font-semibold rounded-2xl hover:bg-blue-50 transition-colors text-sm"
          >
            Update Health Check
          </button>
          <button
            onClick={() => navigate('/app/announcements')}
            className="w-full py-3.5 border-2 border-gray-200 text-gray-700 font-semibold rounded-2xl hover:bg-gray-50 transition-colors text-sm"
          >
            View Announcements
          </button>
        </div>

        <p className="text-center text-xs text-gray-400 mt-4 pb-4">
          Evaluated at {new Date(result.evaluatedAt).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true })}
        </p>
      </div>
    </div>
  );
}

function PageHeader({ onBack, onRefresh, isFetching }: {
  onBack: () => void; onRefresh: () => void; isFetching: boolean;
}) {
  return (
    <header className="flex items-center justify-between px-4 pt-12 pb-3 bg-white border-b border-gray-100">
      <button onClick={onBack} className="p-2 -ml-2 text-gray-600 hover:bg-gray-100 rounded-xl">
        <ChevronLeft size={22} />
      </button>
      <h1 className="text-base font-bold text-gray-900">Go / No-Go Today</h1>
      <button onClick={onRefresh} disabled={isFetching}
        className="p-2 text-gray-400 hover:text-primary-600 rounded-xl disabled:opacity-40">
        <RefreshCw size={18} className={isFetching ? 'animate-spin' : ''} />
      </button>
    </header>
  );
}
