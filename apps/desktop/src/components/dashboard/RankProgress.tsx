import { Card } from '../common/Card';

interface RankProgressProps {
  rank: string;
  rankColor: number;
  totalXp: number;
  nextRank: string | null;
}

export function RankProgress({ rank, rankColor, totalXp, nextRank }: RankProgressProps) {
  const colorHex = `#${rankColor.toString(16).padStart(6, '0')}`;
  const formattedXp = totalXp.toLocaleString();

  return (
    <Card title="Rank">
      <p className="text-2xl font-bold" style={{ color: colorHex }}>
        {rank}
      </p>
      <p className="text-text-secondary text-sm mt-1">{formattedXp} XP</p>

      {nextRank && nextRank !== 'Max rank reached' ? (
        <p className="text-text-secondary text-xs mt-3">{nextRank}</p>
      ) : (
        <p className="text-brand text-sm mt-3 font-medium">Max rank achieved</p>
      )}
    </Card>
  );
}
