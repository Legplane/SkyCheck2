import type { CreateRoutePayload, Route, RoutePreview } from '../types';

const OFFLINE_ROUTES_KEY = 'skycheck-offline-routes';

export interface OfflineRouteEntry {
  id: string;
  payload: CreateRoutePayload;
  preview?: RoutePreview;
  createdAt: string;
}

function readEntries(): OfflineRouteEntry[] {
  try {
    const raw = localStorage.getItem(OFFLINE_ROUTES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    localStorage.removeItem(OFFLINE_ROUTES_KEY);
    return [];
  }
}

function writeEntries(entries: OfflineRouteEntry[]): void {
  localStorage.setItem(OFFLINE_ROUTES_KEY, JSON.stringify(entries));
}

export function getOfflineRouteEntries(): OfflineRouteEntry[] {
  return readEntries();
}

export function addOfflineRoute(payload: CreateRoutePayload, preview?: RoutePreview): OfflineRouteEntry {
  const entry: OfflineRouteEntry = {
    id: `offline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    payload,
    preview,
    createdAt: new Date().toISOString(),
  };
  writeEntries([...readEntries(), entry]);
  return entry;
}

export function removeOfflineRoute(id: string): void {
  writeEntries(readEntries().filter(entry => entry.id !== id));
}

export function offlineEntryToRoute(entry: OfflineRouteEntry): Route {
  return {
    id: entry.id,
    label: entry.payload.label ?? null,
    startAddress: entry.payload.startAddress,
    startLat: entry.payload.startLat,
    startLon: entry.payload.startLon,
    destAddress: entry.payload.destAddress,
    destLat: entry.payload.destLat,
    destLon: entry.payload.destLon,
    departTime: entry.payload.departTime,
    distanceKm: entry.preview?.distanceKm ?? 0,
    durationMin: entry.preview?.durationMin ?? 0,
    risk: {
      overall: 'UNKNOWN',
      weather: 'UNKNOWN',
      traffic: 'UNKNOWN',
      flood: 'UNKNOWN',
      basis: 'Pending sync - route will be checked when internet returns',
    },
    maximFare: entry.preview?.maximFare ?? { min: 0, max: 0 },
    createdAt: entry.createdAt,
    isPendingSync: true,
  };
}
