import { NavLink, useNavigate } from 'react-router';
import { useAuthStore } from '../../stores/auth-store';
import { logoutSession } from '../../api/auth';

export function Sidebar() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logoutSession();
    logout();
    navigate('/login');
  };

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
      isActive
        ? 'bg-brand/15 text-brand shadow-[inset_3px_0_0_var(--color-brand)]'
        : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
    }`;

  return (
    <aside className="w-[220px] flex-shrink-0 bg-surface-1/80 backdrop-blur-xl border-r border-white/5 flex flex-col h-screen">
      {/* Logo */}
      <div className="px-4 py-5">
        <span className="text-brand font-bold text-lg tracking-tight">28K HQ</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-1.5">
        <NavLink to="/" end className={linkClass}>
          {/* Home/Dashboard icon */}
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z" />
          </svg>
          Dashboard
        </NavLink>
        <NavLink to="/timer" className={linkClass}>
          {/* Timer/Clock icon */}
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="10" strokeLinecap="round" strokeLinejoin="round" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" />
          </svg>
          Timer
        </NavLink>
        <NavLink to="/goals" className={linkClass}>
          {/* Target/Goals icon */}
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="10" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="12" cy="12" r="6" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="12" cy="12" r="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Goals
        </NavLink>
      </nav>

      {/* User info + Logout */}
      <div className="px-4 py-4 border-t border-white/5">
        <p className="text-text-secondary text-xs truncate mb-2">
          {user?.displayName ?? 'Operator'}
        </p>
        <button
          onClick={handleLogout}
          className="text-text-tertiary hover:text-error text-xs transition-colors"
        >
          Log out
        </button>
      </div>
    </aside>
  );
}
