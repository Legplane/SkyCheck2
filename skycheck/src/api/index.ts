import { apiClient } from './client';
import type {
  WeatherSnapshot, Route, CreateRoutePayload, RoutePreview,
  Alert, AlertGroup, HealthCheckPayload, HealthCheck,
  GoNoGoResult, AnnouncementsResponse, CombinedRisk,
} from '../types';

// ── Weather ───────────────────────────────────────────────────────
export async function fetchWeather(lat: number, lon: number): Promise<WeatherSnapshot> {
  const { data } = await apiClient.get<WeatherSnapshot>('/weather', { params: { lat, lon } });
  return data;
}

// ── Routes ────────────────────────────────────────────────────────
export async function getRoutes(): Promise<Route[]> {
  const { data } = await apiClient.get<Route[]>('/routes');
  return data;
}

export async function createRoute(payload: CreateRoutePayload): Promise<Route> {
  const { data } = await apiClient.post<Route>('/routes', payload);
  return data;
}

export async function updateRoute(id: string, payload: Partial<CreateRoutePayload>): Promise<Route> {
  const { data } = await apiClient.patch<Route>(`/routes/${id}`, payload);
  return data;
}

export async function deleteRoute(id: string): Promise<void> {
  await apiClient.delete(`/routes/${id}`);
}

export async function previewRoute(payload: {
  startLat: number; startLon: number; destLat: number; destLon: number;
}): Promise<RoutePreview> {
  const { data } = await apiClient.post<RoutePreview>('/routes/preview', payload);
  return data;
}

export async function getRouteRisk(id: string): Promise<CombinedRisk> {
  const { data } = await apiClient.get<CombinedRisk>(`/routes/${id}/risk`);
  return data;
}

// ── Alerts ────────────────────────────────────────────────────────
export async function getAlerts(): Promise<AlertGroup[]> {
  const { data } = await apiClient.get<AlertGroup[]>('/alerts');
  return data;
}

export async function markAlertRead(id: string): Promise<void> {
  await apiClient.patch(`/alerts/${id}/read`);
}

export async function markAllAlertsRead(): Promise<void> {
  await apiClient.patch('/alerts/read-all');
}

export async function markAllAlertsUnread(): Promise<void> {
  await apiClient.patch('/alerts/unread-all');
}

export async function deleteAlert(id: string): Promise<void> {
  await apiClient.delete(`/alerts/${id}`);
}

/** Deletes every alert for the signed-in user. */
export async function deleteAllAlerts(): Promise<{ deleted: number }> {
  const { data } = await apiClient.delete<{ message: string; deleted: number }>('/alerts');
  return { deleted: data.deleted ?? 0 };
}

// ── Health Check ──────────────────────────────────────────────────
export async function submitHealthCheck(
  payload: HealthCheckPayload,
): Promise<{ message: string; id: string }> {
  const { data } = await apiClient.post('/health/check', payload);
  return data;
}

export async function getTodayHealthCheck(): Promise<HealthCheck | null> {
  const { data } = await apiClient.get<HealthCheck | null>('/health/today');
  return data;
}

export async function evaluateGoNoGo(params: {
  lat: number; lon: number; routeId?: string;
}): Promise<GoNoGoResult> {
  const { data } = await apiClient.post<GoNoGoResult>('/health/evaluate', params);
  return data;
}

// ── Announcements ─────────────────────────────────────────────────
export async function getAnnouncements(): Promise<AnnouncementsResponse> {
  const { data } = await apiClient.get<AnnouncementsResponse>('/announcements');
  return data;
}
