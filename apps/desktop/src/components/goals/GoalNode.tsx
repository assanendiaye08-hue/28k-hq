import { useGoalsStore, type Goal } from '../../stores/goals-store';
import { ProgressBar } from '../common/ProgressBar';

const TIMEFRAME_STYLES: Record<string, string> = {
  YEARLY: 'bg-purple-500/20 text-purple-400',
  QUARTERLY: 'bg-blue-500/20 text-blue-400',
  MONTHLY: 'bg-teal-500/20 text-teal-400',
  WEEKLY: 'bg-brand/20 text-brand',
};

const TIMEFRAME_LABELS: Record<string, string> = {
  YEARLY: 'Yearly',
  QUARTERLY: 'Quarterly',
  MONTHLY: 'Monthly',
  WEEKLY: 'Weekly',
};

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`w-4 h-4 text-text-secondary transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function StatusIndicator({ status }: { status: Goal['status'] }) {
  if (status === 'COMPLETED') {
    return (
      <svg className="w-4 h-4 text-green-400" viewBox="0 0 20 20" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
          clipRule="evenodd"
        />
      </svg>
    );
  }
  if (status === 'MISSED') {
    return (
      <svg className="w-4 h-4 text-red-400" viewBox="0 0 20 20" fill="currentColor">
        <path
          d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z"
        />
      </svg>
    );
  }
  if (status === 'EXTENDED') {
    return (
      <svg className="w-4 h-4 text-amber-400" viewBox="0 0 20 20" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z"
          clipRule="evenodd"
        />
      </svg>
    );
  }
  return null;
}

function FreetextIndicator({ status }: { status: Goal['status'] }) {
  if (status === 'COMPLETED') {
    return (
      <svg className="w-5 h-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
          clipRule="evenodd"
        />
      </svg>
    );
  }
  return (
    <div className="w-5 h-5 rounded-full border-2 border-text-tertiary" />
  );
}

interface GoalNodeProps {
  goal: Goal;
  depth: number;
}

export function GoalNode({ goal, depth }: GoalNodeProps) {
  const toggleExpanded = useGoalsStore((s) => s.toggleExpanded);
  const expandedIds = useGoalsStore((s) => s.expandedIds);
  const expanded = expandedIds.has(goal.id);
  const hasChildren = goal.children && goal.children.length > 0;

  const progress =
    goal.type === 'MEASURABLE' && goal.targetValue
      ? Math.round((goal.currentValue / goal.targetValue) * 100)
      : 0;

  return (
    <div>
      <div
        className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-surface-2 transition-colors cursor-default"
        style={{ marginLeft: `${depth * 20}px` }}
      >
        {/* Expand/collapse chevron */}
        {hasChildren ? (
          <button
            onClick={() => toggleExpanded(goal.id)}
            className="flex-shrink-0 p-0.5 rounded hover:bg-surface-2 transition-colors"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            <ChevronIcon expanded={expanded} />
          </button>
        ) : (
          <span className="w-5 flex-shrink-0" />
        )}

        {/* Timeframe badge */}
        {goal.timeframe && (
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${TIMEFRAME_STYLES[goal.timeframe] ?? ''}`}
          >
            {TIMEFRAME_LABELS[goal.timeframe] ?? goal.timeframe}
          </span>
        )}

        {/* Title */}
        <span className="text-text-primary text-sm truncate flex-1">{goal.title}</span>

        {/* Status indicator */}
        {goal.status !== 'ACTIVE' && (
          <StatusIndicator status={goal.status} />
        )}

        {/* Right side: progress or freetext indicator */}
        {goal.type === 'MEASURABLE' ? (
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-text-secondary whitespace-nowrap">
              {goal.currentValue}/{goal.targetValue} {goal.unit ?? ''}
            </span>
            <div className="w-[120px]">
              <ProgressBar value={progress} size="sm" />
            </div>
          </div>
        ) : (
          <div className="flex-shrink-0">
            <FreetextIndicator status={goal.status} />
          </div>
        )}
      </div>

      {/* Children */}
      {expanded && hasChildren && (
        <div>
          {goal.children.map((child) => (
            <GoalNode key={child.id} goal={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
