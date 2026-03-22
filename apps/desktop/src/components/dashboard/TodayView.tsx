import { useDashboardStore } from '../../stores/dashboard-store';
import { PriorityList } from './PriorityList';
import { StreakBadge } from './StreakBadge';
import { GrindingIndicator } from './GrindingIndicator';
import { TimerWidget } from './TimerWidget';
import { SessionHistory } from './SessionHistory';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function TodayView() {
  const data = useDashboardStore((s) => s.data);

  if (!data) return null;

  const { member, goals } = data;

  return (
    <div className="max-w-5xl">
      {/* Greeting */}
      <h1 className="text-2xl font-bold text-text-primary mb-4">
        {getGreeting()}, {member.displayName}
      </h1>

      {/* Timer widget -- always visible at top */}
      <div className="mb-4">
        <TimerWidget />
      </div>

      {/* Main grid: priorities + streak sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left column: today's priorities */}
        <div className="lg:col-span-2 space-y-4">
          <PriorityList goals={goals.today} />
          <SessionHistory />
        </div>

        {/* Right column: streak only */}
        <div className="space-y-4">
          <StreakBadge
            currentStreak={member.currentStreak}
            longestStreak={member.longestStreak}
          />
          <GrindingIndicator />
        </div>
      </div>
    </div>
  );
}
