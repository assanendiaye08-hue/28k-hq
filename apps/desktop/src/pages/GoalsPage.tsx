import { useEffect, useState } from 'react';
import { useGoalsStore, type Goal } from '../stores/goals-store';
import { GoalTree } from '../components/goals/GoalTree';
import { CreateGoalForm } from '../components/goals/CreateGoalForm';
import { Card } from '../components/common/Card';
import { LoadingSpinner } from '../components/common/LoadingSpinner';

const TIMEFRAME_FILTERS = ['All', 'Yearly', 'Quarterly', 'Monthly', 'Weekly'] as const;
type TimeframeFilter = (typeof TIMEFRAME_FILTERS)[number];

/** Recursively flatten goal tree, collecting active goals at depth < 3 */
function flattenActiveGoals(goals: Goal[], result: Goal[] = []): Goal[] {
  for (const goal of goals) {
    if (goal.status === 'ACTIVE' && goal.depth < 3) {
      result.push(goal);
    }
    if (goal.children) {
      flattenActiveGoals(goal.children, result);
    }
  }
  return result;
}

export function GoalsPage() {
  const [activeFilter, setActiveFilter] = useState<TimeframeFilter>('All');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const goals = useGoalsStore((s) => s.goals);
  const isLoading = useGoalsStore((s) => s.isLoading);
  const error = useGoalsStore((s) => s.error);
  const fetchGoals = useGoalsStore((s) => s.fetchGoals);

  useEffect(() => {
    const timeframe = activeFilter === 'All' ? undefined : activeFilter.toUpperCase();
    fetchGoals(timeframe);
  }, [activeFilter, fetchGoals]);

  const parentGoals = flattenActiveGoals(goals);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Goals</h1>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="flex items-center gap-1.5 bg-brand text-surface-base rounded-lg px-4 py-1.5 text-sm font-medium hover:bg-brand/90 transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
          </svg>
          Add Goal
        </button>
      </div>

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

      {/* Create goal form (slide-down) */}
      {showCreateForm && (
        <CreateGoalForm
          onClose={() => setShowCreateForm(false)}
          parentGoals={parentGoals}
        />
      )}

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
