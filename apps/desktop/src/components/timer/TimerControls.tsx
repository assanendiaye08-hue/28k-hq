/**
 * TimerControls
 *
 * Pause/Resume and Stop control buttons for the active timer.
 */

interface TimerControlsProps {
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  isPaused: boolean;
}

export function TimerControls({ onPause, onResume, onStop, isPaused }: TimerControlsProps) {
  return (
    <div className="flex items-center gap-4">
      {/* Pause / Resume */}
      <button
        onClick={isPaused ? onResume : onPause}
        className="w-12 h-12 flex items-center justify-center rounded-full bg-surface-2 hover:bg-surface-3 text-text-primary transition-colors"
        title={isPaused ? 'Resume' : 'Pause'}
      >
        {isPaused ? (
          // Play icon
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        ) : (
          // Pause icon
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
          </svg>
        )}
      </button>

      {/* Stop */}
      <button
        onClick={onStop}
        className="w-12 h-12 flex items-center justify-center rounded-full bg-error/20 hover:bg-error/30 text-error transition-colors"
        title="Stop"
      >
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <rect x="6" y="6" width="12" height="12" rx="1" />
        </svg>
      </button>
    </div>
  );
}
