import { Card } from '../common/Card';
import { ProgressBar } from '../common/ProgressBar';

interface RankProgressProps {
  rank: string;
  rankColor: number;
  totalXp: number;
  nextRank: {
    name: string;
    xpRequired: number;
    xpRemaining: number;
  } | null;
}

export function RankProgress({ rank, rankColor, totalXp, nextRank }: RankProgressProps) {
  const colorHex = `#${rankColor.toString(16).padStart(6, '0')}`;
  const formattedXp = totalXp.toLocaleString();

  const progress = nextRank
    ? ((nextRank.xpRequired - nextRank.xpRemaining) / nextRank.xpRequired) * 100
    : 100;

  return (
    <Card title="Rank">
      <p className="text-2xl font-bold" style={{ color: colorHex }}>
        {rank}
      </p>
      <p className="text-text-secondary text-sm mt-1">{formattedXp} XP</p>

      {nextRank ? (
        <div className="mt-3">
          <ProgressBar value={progress} color={colorHex} size="sm" />
          <p className="text-text-secondary text-xs mt-1.5">
            {nextRank.xpRemaining.toLocaleString()} XP to {nextRank.name}
          </p>
        </div>
      ) : (
        <p className="text-brand text-sm mt-3 font-medium">Max rank achieved</p>
      )}
    </Card>
  );
}
