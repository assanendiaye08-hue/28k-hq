import type { Goal } from '../../stores/dashboard-store';
import { Card } from '../common/Card';
import { ProgressBar } from '../common/ProgressBar';

interface WeeklyGoalsProps {
  goals: Goal[];
  className?: string;
}

export function WeeklyGoals({ goals, className }: WeeklyGoalsProps) {
  const completed = goals.filter((g) => g.status === 'COMPLETED').length;
  const total = goals.length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <Card title="This Week" className={className}>
      {goals.length === 0 ? (
        <p className="text-text-tertiary text-sm">No weekly goals set</p>
      ) : (
        <>
          <div className="flex items-center justify-between mb-3">
            <span className="text-text-secondary text-sm">
              {completed}/{total} goals complete
            </span>
            <span className="text-text-tertiary text-xs">{percentage}%</span>
          </div>
          <ProgressBar value={percentage} size="sm" />

          <ul className="mt-4 space-y-2">
            {goals.map((goal) => (
              <li key={goal.id} className="flex items-center gap-2">
                {goal.status === 'COMPLETED' ? (
                  <svg className="w-3.5 h-3.5 text-success flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-surface-3 flex-shrink-0" />
                )}
                <span className={`text-sm truncate ${goal.status === 'COMPLETED' ? 'text-text-tertiary line-through' : 'text-text-primary'}`}>
                  {goal.title}
                </span>
                {goal.type === 'MEASURABLE' && goal.targetValue != null && (
                  <span className="text-xs text-text-tertiary ml-auto whitespace-nowrap">
                    {goal.currentValue}/{goal.targetValue}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
