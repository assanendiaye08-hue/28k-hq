import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useAuthStore } from './stores/auth-store';
import { LoginPage } from './pages/LoginPage';
import { LoadingSpinner } from './components/common/LoadingSpinner';

function AuthenticatedPlaceholder() {
  const user = useAuthStore((s) => s.user);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <h1 className="text-3xl font-bold text-brand">28K HQ</h1>
      <p className="text-text-secondary">
        Welcome, {user?.displayName ?? 'Operator'}
      </p>
      <p className="text-text-tertiary">Dashboard coming soon</p>
    </div>
  );
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
              <AuthenticatedPlaceholder />
            </AuthGate>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
