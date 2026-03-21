import type { Goal } from '../../stores/dashboard-store';
import { Card } from '../common/Card';
import { ProgressBar } from '../common/ProgressBar';

interface PriorityListProps {
  goals: Goal[];
}

export function PriorityList({ goals }: PriorityListProps) {
  return (
    <Card title="Today's Priorities">
      {goals.length === 0 ? (
        <p className="text-text-tertiary text-sm">No active priorities</p>
      ) : (
        <ul className="space-y-3">
          {goals.map((goal) => (
            <li key={goal.id} className="flex items-start gap-3">
              {/* Status indicator */}
              <span className="mt-0.5 flex-shrink-0">
                {goal.status === 'COMPLETED' ? (
                  <svg className="w-4 h-4 text-success" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <span className="inline-block w-4 h-4 rounded-full border-2 border-brand" />
                )}
              </span>

              {/* Goal content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-sm ${goal.status === 'COMPLETED' ? 'text-text-tertiary line-through' : 'text-text-primary'}`}>
                    {goal.title}
                  </span>
                  {goal.timeframe && (
                    <span className="text-[10px] uppercase tracking-wider text-text-tertiary bg-surface-2 px-1.5 py-0.5 rounded">
                      {goal.timeframe}
                    </span>
                  )}
                </div>
                {goal.type === 'MEASURABLE' && goal.targetValue != null && (
                  <div className="mt-1.5 flex items-center gap-2">
                    <ProgressBar
                      value={(goal.currentValue / goal.targetValue) * 100}
                      size="sm"
                    />
                    <span className="text-xs text-text-tertiary whitespace-nowrap">
                      {goal.currentValue}/{goal.targetValue}
                    </span>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
