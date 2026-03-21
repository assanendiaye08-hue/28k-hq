interface ProgressBarProps {
  value: number;
  color?: string;
  size?: 'sm' | 'md';
}

export function ProgressBar({ value, color, size = 'md' }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const height = size === 'sm' ? 'h-1.5' : 'h-2';

  return (
    <div className={`w-full bg-surface-2 rounded-full ${height}`}>
      <div
        className={`${height} rounded-full transition-all duration-300`}
        style={{
          width: `${clamped}%`,
          backgroundColor: color ?? 'var(--color-brand)',
        }}
      />
    </div>
  );
}
