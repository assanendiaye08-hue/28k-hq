import { Card } from '../common/Card';

interface StreakBadgeProps {
  currentStreak: number;
  longestStreak: number;
}

export function StreakBadge({ currentStreak, longestStreak }: StreakBadgeProps) {
  return (
    <Card title="Streak">
      {currentStreak > 0 ? (
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-brand font-bold text-3xl">{currentStreak}</span>
            <span className="text-orange-500 text-2xl">&#128293;</span>
            <span className="text-text-secondary text-sm">days</span>
          </div>
        </div>
      ) : (
        <p className="text-text-tertiary text-sm">No active streak</p>
      )}
      <p className="text-text-secondary text-sm mt-2">
        Longest: {longestStreak} days
      </p>
    </Card>
  );
}
