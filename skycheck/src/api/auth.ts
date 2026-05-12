import axios from 'axios';
import { API_BASE_URL, apiClient } from './client';
import type { AuthResponse, User } from '../types';

const AUTH_TIMEOUT_MS = 60_000;
const AUTH_RETRY_DELAYS_MS = [900, 2_000, 4_000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isRetryableAuthError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const status = error.response?.status;
  return !status || status === 408 || status === 429 || status >= 500;
}

async function wakeBackend(): Promise<void> {
  try {
    await fetch(`${API_BASE_URL.replace(/\/$/, '')}/health-check-server`, {
      method: 'GET',
      cache: 'no-store',
    });
  } catch {
    // Best effort only. The real auth request below still reports the final error.
  }
}

async function withAuthRetry<T>(action: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  await wakeBackend();

  for (let attempt = 0; attempt <= AUTH_RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await action();
    } catch (err) {
      lastError = err;
      if (!isRetryableAuthError(err) || attempt === AUTH_RETRY_DELAYS_MS.length) break;
      await sleep(AUTH_RETRY_DELAYS_MS[attempt]);
    }
  }

  throw lastError;
}

// ── Register ──────────────────────────────────────────────────────
export async function register(payload: {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}): Promise<{ message: string }> {
  const { data } = await apiClient.post('/auth/register', payload);
  return data;
}

// ── Login ─────────────────────────────────────────────────────────
export async function login(payload: {
  email: string;
  password: string;
}): Promise<AuthResponse> {
  return withAuthRetry(async () => {
    const { data } = await apiClient.post<AuthResponse>('/auth/login', payload, { timeout: AUTH_TIMEOUT_MS });
    return data;
  });
}

/** Google GIS credential JWT from `GoogleLogin` `onSuccess` */
export async function loginWithGoogle(idToken: string): Promise<AuthResponse> {
  return withAuthRetry(async () => {
    const { data } = await apiClient.post<AuthResponse>('/auth/google', { idToken }, { timeout: AUTH_TIMEOUT_MS });
    return data;
  });
}

export async function loginWithFirebase(idToken: string): Promise<AuthResponse> {
  return withAuthRetry(async () => {
    const { data } = await apiClient.post<AuthResponse>('/auth/firebase', { idToken }, { timeout: AUTH_TIMEOUT_MS });
    return data;
  });
}

// ── Verify Email ──────────────────────────────────────────────────
export async function verifyEmail(token: string): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>('/auth/verify-email', { token });
  return data;
}

// ── Resend Verification ───────────────────────────────────────────
export async function resendVerification(email: string): Promise<{ message: string }> {
  const { data } = await apiClient.post('/auth/resend-verification', { email });
  return data;
}

// ── Forgot Password ───────────────────────────────────────────────
export async function forgotPassword(email: string): Promise<{ message: string }> {
  const { data } = await apiClient.post('/auth/forgot-password', { email });
  return data;
}

// ── Reset Password ────────────────────────────────────────────────
export async function resetPassword(payload: {
  token: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<{ message: string }> {
  const { data } = await apiClient.post('/auth/reset-password', payload);
  return data;
}

// ── Logout ────────────────────────────────────────────────────────
export async function logout(): Promise<void> {
  await apiClient.post('/auth/logout').catch(() => {}); // best-effort
}

// ── Get Me ────────────────────────────────────────────────────────
export async function getMe(): Promise<User> {
  const { data } = await apiClient.get<User>('/auth/me');
  return data;
}

// ── Change Password ───────────────────────────────────────────────
export async function changePassword(payload: {
  currentPassword: string;
  newPassword: string;
}): Promise<{ message: string }> {
  const { data } = await apiClient.post('/auth/change-password', payload);
  return data;
}

// ── Update Preferences ────────────────────────────────────────────
export async function updatePreferences(prefs: {
  morningAlerts?: boolean;
  alertSound?: boolean;
  vibration?: boolean;
}): Promise<User> {
  const { data } = await apiClient.patch<User>('/auth/preferences', prefs);
  return data;
}
