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
        <NavLink to="/settings" className={linkClass}>
          {/* Settings/Gear icon */}
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          </svg>
          Settings
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
