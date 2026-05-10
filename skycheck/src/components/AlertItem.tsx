import type { Alert, AlertType } from '../types';
import RiskBadge from './RiskBadge';
import { formatTime, formatShortDate } from '../utils';
import { Trash2 } from 'lucide-react';

const ALERT_ICONS: Record<AlertType, string> = {
  WEATHER: '🌧',
  TRAFFIC: '🚗',
  FLOOD:   '🌊',
};

interface AlertItemProps {
  alert: Alert;
  onClick?: (alert: Alert) => void;
  onDelete?: (id: string) => void;
}

export default function AlertItem({ alert, onClick, onDelete }: AlertItemProps) {
  return (
    <div
      role="presentation"
      className={`relative flex gap-2 items-start pl-4 pr-1 py-3.5 border-b border-gray-100 last:border-b-0 ${
        alert.isRead ? 'bg-white' : 'bg-blue-50/40'
      }`}
    >
      <button
        type="button"
        className="flex gap-3 items-start flex-1 min-w-0 text-left transition-colors hover:bg-gray-50 -my-3.5 py-3.5 -ml-4 pl-4 pr-2 rounded-none"
        onClick={() => onClick?.(alert)}
      >
      {/* Unread dot */}
      <div className="pt-1.5 shrink-0">
        <div className={`w-2 h-2 rounded-full shrink-0 ${alert.isRead ? 'bg-transparent' : 'bg-blue-500'}`} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1.5">
        {/* Title row */}
        <div className="flex items-center gap-2 flex-wrap">
          <RiskBadge level={alert.riskLevel} size="sm" />
          <span className="text-lg">{ALERT_ICONS[alert.type]}</span>
        </div>

        <p className="text-sm font-semibold text-gray-900 leading-snug">{alert.title}</p>
        <p className="text-xs text-gray-600 leading-relaxed">{alert.body}</p>

        {/* Footer */}
        <div className="flex items-center gap-2 flex-wrap">
          {alert.routeLabel && (
            <span className="bg-gray-100 text-gray-700 text-xs px-2 py-0.5 rounded-full font-medium">
              {alert.routeLabel}
            </span>
          )}
          <span className="text-xs text-gray-400">
            {formatShortDate(alert.createdAt)} at {formatTime(alert.createdAt)}
          </span>
        </div>
      </div>
      </button>
      <button
        type="button"
        aria-label="Delete alert"
        className="shrink-0 p-2 rounded-lg mt-1 text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
        onClick={e => {
          e.stopPropagation();
          onDelete?.(alert.id);
        }}
      >
        <Trash2 size={18} strokeWidth={2} />
      </button>
    </div>
  );
}
