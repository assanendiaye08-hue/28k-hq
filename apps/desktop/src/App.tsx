import { useEffect, Component, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { listen } from '@tauri-apps/api/event';
import { moveWindow, Position } from '@tauri-apps/plugin-positioner';
import { useAuthStore } from './stores/auth-store';
import { useTimerStore } from './stores/timer-store';
import { tryRestoreSession } from './api/auth';
import { getAccessToken } from './api/client';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { GoalsPage } from './pages/GoalsPage';
import { TimerPage } from './pages/TimerPage';
import { TimerPopover } from './components/timer/TimerPopover';
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

  // Tray icon left-click handler: popover if timer active, toggle main window if idle
  useEffect(() => {
    const unlistenPromise = listen('tray-icon-clicked', async () => {
      const phase = useTimerStore.getState().phase;
      const mainWindow = getCurrentWindow();

      if (phase === 'idle' || phase === undefined) {
        // Toggle main window visibility
        const visible = await mainWindow.isVisible();
        if (visible) {
          await mainWindow.hide();
        } else {
          await mainWindow.show();
          await mainWindow.setFocus();
        }
        return;
      }

      // Timer is active -- show/create popover
      const existing = await WebviewWindow.getByLabel('timer-popover');
      if (existing) {
        const visible = await existing.isVisible();
        if (visible) {
          await existing.hide();
        } else {
          await existing.show();
          await existing.setFocus();
          await moveWindow(Position.TrayCenter).catch(() => {});
        }
        return;
      }

      // Create new popover window
      const popover = new WebviewWindow('timer-popover', {
        url: '/timer-popover',
        width: 320,
        height: 420,
        decorations: false,
        alwaysOnTop: true,
        resizable: false,
        skipTaskbar: true,
        focus: true,
      });

      popover.once('tauri://created', async () => {
        await moveWindow(Position.TrayCenter).catch(() => {});
      });
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  // Listen for timer state changes from popover (cross-window sync)
  useEffect(() => {
    const unlistenPromise = listen('timer-state-changed', () => {
      useTimerStore.getState().syncFromPersistence();
    });

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
    <ErrorBoundary>
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
        <Route path="/timer-popover" element={<TimerPopover />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
    </ErrorBoundary>
  );
}
