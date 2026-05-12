import axios, { AxiosError } from 'axios';
import { useAuthStore } from '../store/authStore';

// ─────────────────────────────────────────────────────────────────
// Axios Instance
// ─────────────────────────────────────────────────────────────────
const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

export const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT to every request
apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 — clear auth and redirect to login
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const requestUrl = error.config?.url ?? '';
    const isAuthRequest = requestUrl.startsWith('/auth/');
    if (error.response?.status === 401 && !isAuthRequest) {
      useAuthStore.getState().clearAuth();
      // Hard redirect to login
      window.location.href = '/auth/login';
    }
    return Promise.reject(error);
  }
);

// ─────────────────────────────────────────────────────────────────
// Helper to extract error message from any API error
// ─────────────────────────────────────────────────────────────────
export function getApiErrorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { error?: string; message?: string } | undefined;
    return data?.error ?? data?.message ?? error.message ?? fallback;
  }
  if (error instanceof Error) return error.message;
  return fallback;
}
