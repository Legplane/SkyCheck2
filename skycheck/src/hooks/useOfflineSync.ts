import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { submitHealthCheck } from '../api';
import { useOnlineStatus } from './useOnlineStatus';
import { readPendingHealth, clearPendingHealth } from '../utils/offline';

/**
 * When internet returns:
 *   1. upload a health check that was filled in offline (if it is still for today)
 *   2. refresh everything that was only served from cache while offline
 * Mounted once in AppShell.
 */
export function useOfflineSync() {
  const isOnline = useOnlineStatus();
  const qc = useQueryClient();

  useEffect(() => {
    if (!isOnline) return;
    let cancelled = false;

    async function sync() {
      const pending = readPendingHealth();
      if (pending) {
        try {
          await submitHealthCheck(pending.payload);
          clearPendingHealth();
        } catch {
          // keep it queued; we'll retry on the next reconnect / app open
        }
      }
      if (cancelled) return;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['health-today'] }),
        qc.invalidateQueries({ queryKey: ['go-no-go'] }),
        qc.invalidateQueries({ queryKey: ['weather'] }),
        qc.invalidateQueries({ queryKey: ['routes'] }),
        qc.invalidateQueries({ queryKey: ['announcements'] }),
        qc.invalidateQueries({ queryKey: ['alerts'] }),
      ]);
    }

    void sync();
    return () => { cancelled = true; };
  }, [isOnline, qc]);
}
