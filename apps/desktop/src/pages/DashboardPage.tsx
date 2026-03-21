import { useEffect } from 'react';
import { useDashboardStore } from '../stores/dashboard-store';
import { PriorityList } from '../components/dashboard/PriorityList';
import { WeeklyGoals } from '../components/dashboard/WeeklyGoals';
import { StreakBadge } from '../components/dashboard/StreakBadge';
import { RankProgress } from '../components/dashboard/RankProgress';
import { DailyQuote } from '../components/dashboard/DailyQuote';
import { LoadingSpinner } from '../components/common/LoadingSpinner';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

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
          className="px-4 py-2 bg-brand text-surface-base text-sm font-medium rounded-md hover:bg-brand-light transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const { member, goals, quote } = data;

  return (
    <div className="max-w-5xl">
      {/* Greeting */}
      <h1 className="text-2xl font-bold text-text-primary mb-6">
        {getGreeting()}, {member.displayName}
      </h1>

      {/* Dashboard grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left column: priorities + weekly goals */}
        <div className="lg:col-span-2 space-y-4">
          <PriorityList goals={goals.today} />
          <WeeklyGoals goals={goals.weekly} />
        </div>

        {/* Right column: streak, rank, quote */}
        <div className="space-y-4">
          <StreakBadge
            currentStreak={member.currentStreak}
            longestStreak={member.longestStreak}
          />
          <RankProgress
            rank={member.rank}
            rankColor={member.rankColor}
            totalXp={member.totalXp}
            nextRank={member.nextRank}
          />
          <DailyQuote quote={quote} />
        </div>
      </div>
    </div>
  );
}
