import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { QueryClient, useQuery } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { getRedirectResult } from 'firebase/auth';
import { useAuthStore } from './store/authStore';
import { useGeoStore } from './store/geoStore';
import { loginWithFirebase } from './api/auth';
import { firebaseAuth } from './lib/firebase';
import BottomNav from './components/BottomNav';
import { getAlerts } from './api';
import type { AlertGroup } from './types';
import SplashPage         from './pages/SplashPage';
import LoginPage          from './pages/auth/LoginPage';
import SignUpPage         from './pages/auth/SignUpPage';
import VerifyEmailPage    from './pages/auth/VerifyEmailPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ResetPasswordPage  from './pages/auth/ResetPasswordPage';
import DashboardPage      from './pages/app/DashboardPage';
import RoutesPage         from './pages/app/RoutesPage';
import AlertsPage         from './pages/app/AlertsPage';
import ProfilePage        from './pages/app/ProfilePage';
import HealthCheckPage    from './pages/app/HealthCheckPage';
import GoNoGoPage         from './pages/app/GoNoGoPage';
import AnnouncementsPage  from './pages/app/AnnouncementsPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime:    30 * 60 * 1000,
      retry: (failureCount) => (!navigator.onLine ? false : failureCount < 2),
    },
  },
});

const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'skycheck-query-cache',
});

function RequireAuth() {
  const { isAuthenticated } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/auth/login" replace />;
  return <Outlet />;
}

function AuthRedirectHandler() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  useEffect(() => {
    let cancelled = false;

    async function finishRedirectLogin() {
      try {
        const credential = await getRedirectResult(firebaseAuth);
        if (!credential || cancelled) return;
        const firebaseToken = await credential.user.getIdToken();
        const { accessToken, user } = await loginWithFirebase(firebaseToken);
        if (cancelled) return;
        setAuth(accessToken, user);
        navigate('/app/dashboard', { replace: true });
      } catch (err) {
        console.error('[Auth] Google redirect sign-in failed:', err);
      }
    }

    finishRedirectLogin();
    return () => {
      cancelled = true;
    };
  }, [navigate, setAuth]);

  return null;
}

function AppShell() {
  const startGPS = useGeoStore((s) => s.startGPS);

  // Only auto-start when the browser already has permission. If permission is
  // still in "prompt" state, the dashboard button becomes the user-triggered
  // permission request, which is more reliable on desktop browsers.
  useEffect(() => {
    let cancelled = false;

    async function startIfAlreadyAllowed() {
      if (!('permissions' in navigator)) return;
      try {
        const permission = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
        if (!cancelled && permission.state === 'granted') startGPS();
      } catch {
        // Some browsers do not expose geolocation permission status.
      }
    }

    startIfAlreadyAllowed();
    return () => {
      cancelled = true;
    };
  }, [startGPS]);

  const { data: alertGroupsRaw } = useQuery({
    queryKey: ['alerts'],
    queryFn:  getAlerts,
    staleTime: 2 * 60 * 1000,
    refetchOnMount: 'always',
  });

  const alertGroups: AlertGroup[] = Array.isArray(alertGroupsRaw) ? alertGroupsRaw : [];

  const unreadCount = alertGroups
    .flatMap((g) => g.alerts)
    .filter((a) => !a.isRead).length;

  return (
    <div className="relative min-h-screen w-full max-w-6xl mx-auto bg-gray-50">
      <Outlet />
      <BottomNav unreadAlerts={unreadCount} />
    </div>
  );
}

export default function App() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 24 * 60 * 60 * 1000,
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => {
            const key = Array.isArray(query.queryKey) ? String(query.queryKey[0]) : '';
            return !['go-no-go'].includes(key);
          },
        },
      }}
    >
      <BrowserRouter>
        <AuthRedirectHandler />
        <Routes>
          <Route path="/"       element={<SplashPage />} />
          <Route path="/auth">
            <Route path="login"  element={<LoginPage />} />
            <Route path="signup" element={<SignUpPage />} />
            <Route path="verify" element={<VerifyEmailPage />} />
            <Route path="forgot" element={<ForgotPasswordPage />} />
            <Route path="reset-password" element={<ResetPasswordPage />} />
          </Route>
          <Route element={<RequireAuth />}>
            <Route path="/app" element={<AppShell />}>
              <Route index                element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard"     element={<DashboardPage />} />
              <Route path="routes"        element={<RoutesPage />} />
              <Route path="alerts"        element={<AlertsPage />} />
              <Route path="profile"       element={<ProfilePage />} />
              <Route path="health-check"  element={<HealthCheckPage />} />
              <Route path="go-no-go"      element={<GoNoGoPage />} />
              <Route path="announcements" element={<AnnouncementsPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </PersistQueryClientProvider>
  );
}
