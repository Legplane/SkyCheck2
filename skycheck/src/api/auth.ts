import { apiClient } from './client';
import type { AuthResponse, User } from '../types';

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
  const { data } = await apiClient.post<AuthResponse>('/auth/login', payload);
  return data;
}

/** Google GIS credential JWT from `GoogleLogin` `onSuccess` */
export async function loginWithGoogle(idToken: string): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>('/auth/google', { idToken });
  return data;
}

export async function loginWithFirebase(idToken: string): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>('/auth/firebase', { idToken });
  return data;
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
