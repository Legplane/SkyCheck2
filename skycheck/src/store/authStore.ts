import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { User } from '../types';

// ─────────────────────────────────────────────────────────────────
// Auth Store (Zustand + localStorage persistence)
// NOTE: For production hardening, move token to httpOnly cookie.
// For this student project, localStorage is acceptable.
// ─────────────────────────────────────────────────────────────────

interface AuthState {
  token: string | null;
  user: User | null;
  pendingVerifyEmail: string | null;  // email waiting for verification
  isAuthenticated: boolean;
}

interface AuthActions {
  setAuth: (token: string, user: User) => void;
  setUser: (user: User) => void;
  setPendingVerifyEmail: (email: string) => void;
  clearAuth: () => void;
  updatePreferences: (prefs: Partial<User['preferences']>) => void;
}

export const useAuthStore = create<AuthState & AuthActions>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      pendingVerifyEmail: null,
      isAuthenticated: false,

      setAuth: (token, user) =>
        set({ token, user, isAuthenticated: true }),

      setUser: (user) =>
        set({ user }),

      setPendingVerifyEmail: (email) =>
        set({ pendingVerifyEmail: email }),

      clearAuth: () =>
        set({ token: null, user: null, isAuthenticated: false }),

      updatePreferences: (prefs) => {
        const user = get().user;
        if (!user) return;
        set({
          user: {
            ...user,
            preferences: { ...user.preferences, ...prefs },
          },
        });
      },
    }),
    {
      name: 'skycheck-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        pendingVerifyEmail: state.pendingVerifyEmail,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
