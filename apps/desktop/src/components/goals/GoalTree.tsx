import { GoalNode } from './GoalNode';
import type { Goal } from '../../stores/goals-store';

const TIMEFRAME_ORDER: Record<string, number> = {
  YEARLY: 0,
  QUARTERLY: 1,
  MONTHLY: 2,
  WEEKLY: 3,
};

const TIMEFRAME_SECTION_LABELS: Record<string, string> = {
  YEARLY: 'Yearly Goals',
  QUARTERLY: 'Quarterly Goals',
  MONTHLY: 'Monthly Goals',
  WEEKLY: 'Weekly Goals',
};

interface GoalTreeProps {
  goals: Goal[];
}

export function GoalTree({ goals }: GoalTreeProps) {
  if (!goals.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-2">
        <p className="text-text-secondary text-lg">No goals yet</p>
        <p className="text-text-tertiary text-sm">
          Click 'Add Goal' above to create your first goal
        </p>
      </div>
    );
  }

  // Group by timeframe
  const groups = new Map<string, Goal[]>();
  const ungrouped: Goal[] = [];

  for (const goal of goals) {
    if (goal.timeframe) {
      const existing = groups.get(goal.timeframe) ?? [];
      existing.push(goal);
      groups.set(goal.timeframe, existing);
    } else {
      ungrouped.push(goal);
    }
  }

  // Sort groups by timeframe order
  const sortedKeys = [...groups.keys()].sort(
    (a, b) => (TIMEFRAME_ORDER[a] ?? 99) - (TIMEFRAME_ORDER[b] ?? 99),
  );

  const hasMultipleGroups = sortedKeys.length + (ungrouped.length > 0 ? 1 : 0) > 1;

  return (
    <div>
      {sortedKeys.map((timeframe) => (
        <div key={timeframe}>
          {hasMultipleGroups && (
            <h4 className="text-text-secondary uppercase text-xs tracking-wide mb-2 mt-4 first:mt-0">
              {TIMEFRAME_SECTION_LABELS[timeframe] ?? timeframe}
            </h4>
          )}
          {groups.get(timeframe)!.map((goal) => (
            <GoalNode key={goal.id} goal={goal} depth={0} />
          ))}
        </div>
      ))}

      {ungrouped.length > 0 && (
        <div>
          {hasMultipleGroups && (
            <h4 className="text-text-secondary uppercase text-xs tracking-wide mb-2 mt-4">
              Other Goals
            </h4>
          )}
          {ungrouped.map((goal) => (
            <GoalNode key={goal.id} goal={goal} depth={0} />
          ))}
        </div>
      )}
    </div>
  );
}
