import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getAlerts,
  markAlertRead,
  markAllAlertsRead,
  markAllAlertsUnread,
  deleteAlert,
  deleteAllAlerts,
} from '../../api';
import type { Alert } from '../../types';
import AlertItem from '../../components/AlertItem';
import { AlertItemSkeleton } from '../../components/SkeletonLoader';

export default function AlertsPage() {
  const qc = useQueryClient();

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ['alerts'],
    queryFn: getAlerts,
    staleTime: 2 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const { mutate: readOne } = useMutation({
    mutationFn: (id: string) => markAlertRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  });

  const { mutate: readAll, isPending: isMarkingAll } = useMutation({
    mutationFn: markAllAlertsRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  });

  const { mutate: unreadAll, isPending: isMarkingAllUnread } = useMutation({
    mutationFn: markAllAlertsUnread,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  });

  const { mutate: removeAlert, isPending: isDeletingOne } = useMutation({
    mutationFn: deleteAlert,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  });

  const { mutate: removeAllAlerts, isPending: isDeletingAll } = useMutation({
    mutationFn: deleteAllAlerts,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  });

  const totalUnread = groups.flatMap(g => g.alerts).filter(a => !a.isRead).length;
  const totalCount = groups.reduce((n, g) => n + g.alerts.length, 0);
  const hasReadAlerts = totalCount > 0 && totalUnread < totalCount;
  const isEmpty = !isLoading && totalCount === 0;

  function handleAlertClick(alert: Alert) {
    if (!alert.isRead) readOne(alert.id);
  }

  return (
    <div className="flex flex-col min-h-screen w-full max-w-6xl mx-auto bg-gray-50 pb-20">
      {/* Header */}
      <header className="flex items-center justify-between gap-3 px-4 pt-12 pb-3 bg-white border-b border-gray-100">
        <h1 className="text-lg font-bold text-gray-900 shrink-0">Weather Alerts</h1>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {!isEmpty && !isLoading && totalCount > 0 && (
            <button
              type="button"
              onClick={() => {
                if (!confirm('Delete all alerts permanently?')) return;
                removeAllAlerts();
              }}
              disabled={isDeletingAll || isDeletingOne}
              className="text-xs text-red-600 font-semibold disabled:opacity-50"
            >
              {isDeletingAll ? 'Clearing…' : 'Clear all'}
            </button>
          )}
          {totalUnread > 0 && (
            <button
              type="button"
              onClick={() => readAll()}
              disabled={isMarkingAll || isMarkingAllUnread || isDeletingAll}
              className="text-xs text-primary-600 font-semibold disabled:opacity-50"
            >
              {isMarkingAll ? 'Marking…' : 'Mark all as read'}
            </button>
          )}
          {hasReadAlerts && (
            <button
              type="button"
              onClick={() => unreadAll()}
              disabled={isMarkingAllUnread || isMarkingAll || isDeletingAll}
              className="text-xs text-gray-600 font-semibold disabled:opacity-50"
            >
              {isMarkingAllUnread ? 'Updating…' : 'Mark all unread'}
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        {/* Loading skeletons */}
        {isLoading && (
          <div className="divide-y divide-gray-100">
            {[1, 2, 3].map(i => <AlertItemSkeleton key={i} />)}
          </div>
        )}

        {/* Alert groups */}
        {!isLoading && groups.map(group => (
          group.alerts.length > 0 && (
            <div key={group.label}>
              {/* Sticky date header */}
              <div className="sticky top-0 z-10 px-4 py-2 bg-gray-100/90 backdrop-blur-sm border-y border-gray-200">
                <span className="text-xs font-bold text-gray-500 tracking-wide uppercase">
                  {group.label}
                </span>
              </div>
              <div className="bg-white">
                {group.alerts.map(alert => (
                  <AlertItem
                    key={alert.id}
                    alert={alert}
                    onClick={handleAlertClick}
                    onDelete={id => removeAlert(id)}
                  />
                ))}
              </div>
            </div>
          )
        ))}

        {/* Empty state */}
        {isEmpty && (
          <div className="flex flex-col items-center text-center gap-4 py-20 px-8">
            <span className="text-6xl">🔔</span>
            <div>
              <p className="font-semibold text-gray-700">No alerts yet</p>
              <p className="text-sm text-gray-500 mt-1 leading-relaxed">
                We'll notify you when your commute risk changes.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
