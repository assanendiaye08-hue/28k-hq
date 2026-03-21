/**
 * SessionDots
 *
 * Visual session counter showing completed/total pomodoro sessions.
 * Renders dots for small counts, text for large counts.
 */

interface SessionDotsProps {
  completed: number;
  total: number | null; // null = unlimited
}

export function SessionDots({ completed, total }: SessionDotsProps) {
  // For large totals, show as text
  if (total !== null && total > 8) {
    return (
      <span className="text-text-secondary text-sm font-mono">
        {completed}/{total}
      </span>
    );
  }

  const dots: React.ReactNode[] = [];

  // Completed dots
  for (let i = 0; i < completed; i++) {
    dots.push(
      <span
        key={`done-${i}`}
        className="w-2.5 h-2.5 rounded-full bg-brand"
      />
    );
  }

  // Remaining dots
  if (total !== null) {
    for (let i = completed; i < total; i++) {
      dots.push(
        <span
          key={`rem-${i}`}
          className="w-2.5 h-2.5 rounded-full border border-surface-3 bg-transparent"
        />
      );
    }
  } else {
    // Unlimited: show one outline dot as infinite indicator
    dots.push(
      <span
        key="inf"
        className="w-2.5 h-2.5 rounded-full border border-text-tertiary bg-transparent"
      />
    );
  }

  return (
    <div className="flex gap-1.5 items-center justify-center">
      {dots}
    </div>
  );
}
