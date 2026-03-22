import { useEffect, useState } from 'react';
import { useGoalsStore } from '../stores/goals-store';
import { GoalTree } from '../components/goals/GoalTree';
import { Card } from '../components/common/Card';
import { LoadingSpinner } from '../components/common/LoadingSpinner';

const TIMEFRAME_FILTERS = ['All', 'Yearly', 'Quarterly', 'Monthly', 'Weekly'] as const;
type TimeframeFilter = (typeof TIMEFRAME_FILTERS)[number];

export function GoalsPage() {
  const [activeFilter, setActiveFilter] = useState<TimeframeFilter>('All');
  const goals = useGoalsStore((s) => s.goals);
  const isLoading = useGoalsStore((s) => s.isLoading);
  const error = useGoalsStore((s) => s.error);
  const fetchGoals = useGoalsStore((s) => s.fetchGoals);

  useEffect(() => {
    const timeframe = activeFilter === 'All' ? undefined : activeFilter.toUpperCase();
    fetchGoals(timeframe);
  }, [activeFilter, fetchGoals]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-text-primary mb-6">Goals</h1>

      {/* Timeframe filter pills */}
      <div className="flex gap-2 mb-4">
        {TIMEFRAME_FILTERS.map((filter) => (
          <button
            key={filter}
            onClick={() => setActiveFilter(filter)}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              activeFilter === filter
                ? 'bg-brand text-surface-base'
                : 'bg-surface-2 text-text-secondary hover:text-text-primary'
            }`}
          >
            {filter}
          </button>
        ))}
      </div>

      <Card>
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <LoadingSpinner />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <p className="text-red-400 text-sm">{error}</p>
            <button
              onClick={() => {
                const timeframe = activeFilter === 'All' ? undefined : activeFilter.toUpperCase();
                fetchGoals(timeframe);
              }}
              className="px-4 py-1.5 bg-brand text-surface-base rounded text-sm font-medium hover:bg-brand/90 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : (
          <GoalTree goals={goals} />
        )}
      </Card>
    </div>
  );
}
