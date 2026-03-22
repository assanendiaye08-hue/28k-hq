import { useEffect, useRef, Component, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { useAuthStore } from './stores/auth-store';
import { useTimerStore } from './stores/timer-store';
import { tryRestoreSession } from './api/auth';
import { getAccessToken } from './api/client';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { GoalsPage } from './pages/GoalsPage';
import { TimerPage } from './pages/TimerPage';
import { AppShell } from './components/layout/AppShell';
import { LoadingSpinner } from './components/common/LoadingSpinner';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, color: '#f44', background: '#111', minHeight: '100vh' }}>
          <h1>App crashed</h1>
          <pre style={{ color: '#fff', whiteSpace: 'pre-wrap' }}>{this.state.error.message}</pre>
          <pre style={{ color: '#888', whiteSpace: 'pre-wrap', fontSize: 12 }}>{this.state.error.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

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

// Store navigate function globally so tray handler can use it
let globalNavigate: ReturnType<typeof useNavigate> | null = null;

function NavigateProvider() {
  const navigate = useNavigate();
  useEffect(() => {
    globalNavigate = navigate;
    return () => { globalNavigate = null; };
  }, [navigate]);
  return null;
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
          login(member, getAccessToken() ?? '');
        }
      } catch {
        // Session restore failed
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
      return await mainWindow.onCloseRequested(async (event) => {
        event.preventDefault();
        await mainWindow.hide();
      });
    };
    const unlistenPromise = setupCloseHandler();
    return () => { unlistenPromise.then((fn) => fn()); };
  }, []);

  // Tray icon left-click: toggle main window, navigate to timer if active
  useEffect(() => {
    const unlistenPromise = listen('tray-icon-clicked', async () => {
      const mainWindow = getCurrentWindow();
      const visible = await mainWindow.isVisible();

      if (visible) {
        await mainWindow.hide();
      } else {
        const phase = useTimerStore.getState().phase;
        if (phase && phase !== 'idle' && globalNavigate) {
          globalNavigate('/timer');
        }
        await mainWindow.show();
        await mainWindow.setFocus();
      }
    });
    return () => { unlistenPromise.then((fn) => fn()); };
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <ErrorBoundary>
    <BrowserRouter>
      <NavigateProvider />
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
    </ErrorBoundary>
  );
}
