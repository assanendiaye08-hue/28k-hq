import { useEffect } from 'react';
import { useActivityStore } from '../../stores/activity-store';

export function GrindingIndicator() {
  const grinders = useActivityStore((s) => s.grinders);
  const count = useActivityStore((s) => s.count);
  const isLoading = useActivityStore((s) => s.isLoading);
  const fetchGrinders = useActivityStore((s) => s.fetchGrinders);

  useEffect(() => {
    fetchGrinders();

    const interval = setInterval(fetchGrinders, 60_000);
    return () => clearInterval(interval);
  }, [fetchGrinders]);

  // Silent loading -- no spinner
  if (isLoading && count === 0) return null;

  return (
    <div className="border-t border-white/5 pt-3 mt-3">
      {count === 0 ? (
        <p className="text-text-tertiary text-xs">No one grinding right now</p>
      ) : (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
            <span className="text-text-secondary text-sm">
              {count} grinding right now
            </span>
          </div>
          <div className="space-y-1">
            {grinders.slice(0, 3).map((g) => (
              <p key={g.displayName} className="text-xs text-text-tertiary">
                {g.displayName}
                {g.focus ? ` \u2014 ${g.focus}` : ''}
              </p>
            ))}
            {count > 3 && (
              <p className="text-xs text-text-tertiary">+{count - 3} more</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
