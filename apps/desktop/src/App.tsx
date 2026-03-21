import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useAuthStore } from './stores/auth-store';
import { tryRestoreSession } from './api/auth';
import { getAccessToken } from './api/client';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { GoalsPage } from './pages/GoalsPage';
import { TimerPage } from './pages/TimerPage';
import { AppShell } from './components/layout/AppShell';
import { LoadingSpinner } from './components/common/LoadingSpinner';

function AuthGate({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function LoginGate({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (isAuthenticated) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function App() {
  const isLoading = useAuthStore((s) => s.isLoading);
  const login = useAuthStore((s) => s.login);
  const setLoading = useAuthStore((s) => s.setLoading);

  // Restore session from stored refresh token on mount
  useEffect(() => {
    const restore = async () => {
      try {
        const member = await tryRestoreSession();
        if (member) {
          // accessToken was already set in memory by tryRestoreSession
          login(member, getAccessToken() ?? '');
        }
      } catch {
        // Session restore failed -- show login page
      } finally {
        setLoading(false);
      }
    };

    restore();
  }, [login, setLoading]);

  // Hide window instead of closing (tray app behavior)
  useEffect(() => {
    const setupCloseHandler = async () => {
      const mainWindow = getCurrentWindow();
      const unlisten = await mainWindow.onCloseRequested(async (event) => {
        event.preventDefault();
        await mainWindow.hide();
      });
      return unlisten;
    };

    const unlistenPromise = setupCloseHandler();
    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            <LoginGate>
              <LoginPage />
            </LoginGate>
          }
        />
        <Route
          path="/"
          element={
            <AuthGate>
              <AppShell>
                <DashboardPage />
              </AppShell>
            </AuthGate>
          }
        />
        <Route
          path="/timer"
          element={
            <AuthGate>
              <AppShell>
                <TimerPage />
              </AppShell>
            </AuthGate>
          }
        />
        <Route
          path="/goals"
          element={
            <AuthGate>
              <AppShell>
                <GoalsPage />
              </AppShell>
            </AuthGate>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
