import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Building2, Landmark, RefreshCw, Calendar } from 'lucide-react';
import { getAnnouncements } from '../../api';
import { formatDate, clsx } from '../../utils';
import type { SchoolAnnouncement, GovAnnouncement } from '../../types';

const SCHOOL_STATUS_CONFIG = {
  F2F:       { label: 'Face-to-Face',  color: 'bg-green-500',  text: 'text-green-700',  bg: 'bg-green-50  border-green-200', emoji: '🏫' },
  ONLINE:    { label: 'Online Classes',color: 'bg-blue-500',   text: 'text-blue-700',   bg: 'bg-blue-50   border-blue-200',  emoji: '💻' },
  SUSPENDED: { label: 'Suspended',     color: 'bg-red-500',    text: 'text-red-700',    bg: 'bg-red-50    border-red-200',   emoji: '🚫' },
  HYBRID:    { label: 'Hybrid',        color: 'bg-purple-500', text: 'text-purple-700', bg: 'bg-purple-50 border-purple-200',emoji: '🔀' },
};

const SEVERITY_CONFIG = {
  INFO:     { label: 'INFO',     color: 'bg-blue-100  text-blue-700' },
  ADVISORY: { label: 'ADVISORY',color: 'bg-amber-100 text-amber-700' },
  WARNING:  { label: 'WARNING',  color: 'bg-orange-100 text-orange-700' },
  CRITICAL: { label: 'CRITICAL',color: 'bg-red-500    text-white' },
};

const SOURCE_LABELS: Record<string, string> = {
  PAGASA:        '🌦 PAGASA',
  NDRRMC:        '🛡 NDRRMC',
  LGU_OLONGAPO:  '🏙 Olongapo City',
  LGU_SUBIC:     '🏙 Subic',
  CHED:          '🎓 CHED',
  DEPED:         '📚 DepEd',
};

export default function AnnouncementsPage() {
  const navigate = useNavigate();

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['announcements'],
    queryFn:  getAnnouncements,
    staleTime: 5 * 60 * 1000,
    gcTime:   30 * 60 * 1000,
  });

  const latestSchool = data?.school?.[0] ?? null;
  const schoolCfg    = SCHOOL_STATUS_CONFIG[latestSchool?.status ?? 'F2F'];

  return (
    <div className="flex flex-col min-h-screen w-full max-w-6xl mx-auto bg-gray-50 pb-24">
      {/* Header */}
      <header className="flex items-center justify-between px-4 pt-12 pb-3 bg-white border-b border-gray-100">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-gray-600 hover:bg-gray-100 rounded-xl">
          <ChevronLeft size={22} />
        </button>
        <h1 className="text-base font-bold text-gray-900">Announcements</h1>
        <button onClick={() => refetch()} disabled={isFetching}
          className="p-2 text-gray-400 hover:text-primary-600 rounded-xl disabled:opacity-40">
          <RefreshCw size={18} className={isFetching ? 'animate-spin' : ''} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pt-4 space-y-4">

        {/* ── Current School Status Banner ──────────────────────── */}
        <div className={clsx('border-2 rounded-2xl p-4', schoolCfg.bg)}>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl">{schoolCfg.emoji}</span>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Gordon College</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={clsx('text-lg font-black', schoolCfg.text)}>{schoolCfg.label}</span>
                <span className={clsx('text-xs font-bold text-white px-2 py-0.5 rounded-full', schoolCfg.color)}>
                  TODAY
                </span>
              </div>
            </div>
          </div>
          {latestSchool ? (
            <p className="text-sm text-gray-700 font-medium">{latestSchool.title}</p>
          ) : (
            <p className="text-sm text-gray-500">No announcement — assuming regular F2F schedule</p>
          )}
        </div>

        {/* ── School Announcements ──────────────────────────────── */}
        <div>
          <SectionHeader icon={<Building2 size={15} />} title="School Announcements" />
          {isLoading ? (
            <LoadingSkeleton />
          ) : data?.school?.length ? (
            <div className="space-y-2">
              {data.school.map(ann => <SchoolCard key={ann.id} ann={ann} />)}
            </div>
          ) : (
            <EmptyState message="No school announcements at this time." />
          )}
        </div>

        {/* ── Government Advisories ─────────────────────────────── */}
        <div>
          <SectionHeader icon={<Landmark size={15} />} title="Government Advisories" />
          {isLoading ? (
            <LoadingSkeleton />
          ) : data?.gov?.length ? (
            <div className="space-y-2">
              {data.gov.map(ann => <GovCard key={ann.id} ann={ann} />)}
            </div>
          ) : (
            <EmptyState message="No active government advisories." />
          )}
        </div>

      </div>
    </div>
  );
}

function SchoolCard({ ann }: { ann: SchoolAnnouncement }) {
  const cfg = SCHOOL_STATUS_CONFIG[ann.status] ?? SCHOOL_STATUS_CONFIG.F2F;
  return (
    <div className="bg-white rounded-2xl shadow-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className={clsx('text-xs font-bold text-white px-2.5 py-1 rounded-full', cfg.color)}>
          {cfg.label}
        </span>
      </div>
      <p className="text-sm font-semibold text-gray-900">{ann.title}</p>
      {ann.body && <p className="text-xs text-gray-600 mt-1 leading-relaxed">{ann.body}</p>}
      <div className="flex items-center gap-1 mt-2">
        <Calendar size={11} className="text-gray-400" />
        <span className="text-xs text-gray-400">{formatDate(ann.effectiveAt)}</span>
        {ann.postedBy && <span className="text-xs text-gray-400 ml-1">· by {ann.postedBy}</span>}
      </div>
    </div>
  );
}

function GovCard({ ann }: { ann: GovAnnouncement }) {
  const sev    = SEVERITY_CONFIG[ann.severity] ?? SEVERITY_CONFIG.INFO;
  const source = SOURCE_LABELS[ann.source] ?? ann.source;
  return (
    <div className={clsx(
      'bg-white rounded-2xl shadow-card p-4 border-l-4',
      ann.severity === 'CRITICAL' ? 'border-red-500'
      : ann.severity === 'WARNING'  ? 'border-orange-500'
      : ann.severity === 'ADVISORY' ? 'border-amber-500'
      : 'border-blue-400'
    )}>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className={clsx('text-xs font-bold px-2.5 py-1 rounded-full', sev.color)}>{sev.label}</span>
        <span className="text-xs text-gray-500 font-medium">{source}</span>
      </div>
      <p className="text-sm font-semibold text-gray-900">{ann.title}</p>
      <p className="text-xs text-gray-600 mt-1 leading-relaxed">{ann.body}</p>
      <div className="flex items-center gap-1 mt-2">
        <Calendar size={11} className="text-gray-400" />
        <span className="text-xs text-gray-400">{formatDate(ann.effectiveAt)}</span>
        {ann.expiresAt && (
          <span className="text-xs text-gray-400 ml-1">· expires {formatDate(ann.expiresAt)}</span>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-primary-600">{icon}</span>
      <h3 className="text-sm font-bold text-gray-900">{title}</h3>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-card p-6 text-center">
      <p className="text-sm text-gray-400">{message}</p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2].map(i => (
        <div key={i} className="bg-white rounded-2xl p-4 animate-pulse space-y-2">
          <div className="h-5 w-24 bg-gray-200 rounded-full" />
          <div className="h-4 w-3/4 bg-gray-100 rounded" />
          <div className="h-3 w-full bg-gray-100 rounded" />
        </div>
      ))}
    </div>
  );
}
