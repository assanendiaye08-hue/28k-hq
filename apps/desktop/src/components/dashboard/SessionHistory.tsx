import { useEffect } from 'react';
import { useHistoryStore } from '../../stores/history-store';
import { Card } from '../common/Card';
import { LoadingSpinner } from '../common/LoadingSpinner';

function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 60) return `${Math.max(1, diffMinutes)}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function SessionHistory() {
  const sessions = useHistoryStore((s) => s.sessions);
  const isLoading = useHistoryStore((s) => s.isLoading);
  const fetchHistory = useHistoryStore((s) => s.fetchHistory);

  useEffect(() => {
    fetchHistory(10);
  }, [fetchHistory]);

  return (
    <Card title="Recent Sessions">
      {isLoading ? (
        <div className="flex justify-center py-4">
          <LoadingSpinner size="sm" />
        </div>
      ) : sessions.length === 0 ? (
        <p className="text-text-tertiary text-sm">No sessions yet</p>
      ) : (
        <ul className="space-y-3">
          {sessions.map((session) => (
            <li key={session.id} className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <span className="text-text-primary text-sm">
                  {session.focus || 'Untitled'}
                </span>
                {session.goalTitle && (
                  <span className="block text-[10px] uppercase tracking-wider text-text-tertiary bg-surface-2 px-1.5 py-0.5 rounded w-fit mt-1">
                    {session.goalTitle}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="text-text-secondary text-sm font-medium tabular-nums">
                  {formatDuration(session.totalWorkedMs)}
                </span>
                <span className="text-text-tertiary text-xs">
                  {formatRelativeTime(session.endedAt)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
