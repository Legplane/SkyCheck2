import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { QueryClient, useQuery } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { useAuthStore } from './store/authStore';
import { useGeoStore } from './store/geoStore';
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

function AppShell() {
  const startGPS = useGeoStore((s) => s.startGPS);

  // Start GPS once when the authenticated shell mounts
  useEffect(() => {
    startGPS();
  }, [startGPS]);

  const { data: alertGroupsRaw } = useQuery({
    queryKey: ['alerts'],
    queryFn:  getAlerts,
    staleTime: 2 * 60 * 1000,
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
        maxAge: 30 * 60 * 1000,
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => {
            const key = Array.isArray(query.queryKey) ? String(query.queryKey[0]) : '';
            return !['weather', 'go-no-go'].includes(key);
          },
        },
      }}
    >
      <BrowserRouter>
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
