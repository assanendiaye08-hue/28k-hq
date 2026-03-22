import { useState } from 'react';
import { useNavigate } from 'react-router';
import { loginWithDiscord } from '../api/auth';
import { useAuthStore } from '../stores/auth-store';
import { LoadingSpinner } from '../components/common/LoadingSpinner';

export function LoginPage() {
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setError(null);

    try {
      const result = await loginWithDiscord();
      login(result.member, result.accessToken);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-8 px-6 bg-[radial-gradient(ellipse_at_center,_var(--color-surface-1)_0%,_var(--color-surface-base)_70%)]">
      {/* Gold ouroboros placeholder */}
      <div className="w-24 h-24 rounded-full bg-brand/20 border-2 border-brand flex items-center justify-center">
        <div className="w-16 h-16 rounded-full border-4 border-brand bg-transparent" />
      </div>

      <div className="text-center">
        <h1 className="text-4xl font-bold text-brand mb-2">28K HQ</h1>
        <p className="text-text-secondary text-sm">Command Center</p>
      </div>

      <button
        onClick={handleLogin}
        disabled={isLoggingIn}
        className="flex items-center gap-3 px-8 py-3 bg-brand text-surface-base font-semibold rounded-xl
                   shadow-lg shadow-brand/20 hover:bg-brand-light active:scale-[0.98] transition-all
                   disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoggingIn ? (
          <>
            <LoadingSpinner size="sm" />
            <span>Connecting...</span>
          </>
        ) : (
          <span>Login with Discord</span>
        )}
      </button>

      {error && (
        <p className="text-error text-sm max-w-xs text-center">{error}</p>
      )}

      <p className="text-text-tertiary text-xs mt-4">
        Members only. Log in with the Discord account linked to 28K HQ.
      </p>
    </div>
  );
}
