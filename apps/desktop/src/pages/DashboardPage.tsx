import { useEffect } from 'react';
import { useDashboardStore } from '../stores/dashboard-store';
import { TodayView } from '../components/dashboard/TodayView';
import { LoadingSpinner } from '../components/common/LoadingSpinner';

export function DashboardPage() {
  const data = useDashboardStore((s) => s.data);
  const isLoading = useDashboardStore((s) => s.isLoading);
  const error = useDashboardStore((s) => s.error);
  const fetchDashboard = useDashboardStore((s) => s.fetchDashboard);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <p className="text-error text-sm">{error}</p>
        <button
          onClick={fetchDashboard}
          className="px-6 py-2.5 bg-brand text-surface-base text-sm font-semibold rounded-xl shadow-lg shadow-brand/20 hover:bg-brand-light active:scale-[0.98] transition-all"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  return <TodayView />;
}
