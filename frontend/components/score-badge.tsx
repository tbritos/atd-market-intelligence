import { cn } from '@/lib/utils';

interface ScoreBadgeProps {
  score: number | null;
  suffix?: string;
  size?: 'sm' | 'md';
  showBar?: boolean;
}

function getScoreColor(score: number) {
  if (score >= 90) return 'text-emerald-400 bg-emerald-400/10';
  if (score >= 70) return 'text-yellow-400 bg-yellow-400/10';
  return 'text-red-400 bg-red-400/10';
}

function getBarColor(score: number) {
  if (score >= 90) return 'bg-emerald-400';
  if (score >= 70) return 'bg-yellow-400';
  return 'bg-red-400';
}

export function ScoreBadge({ score, suffix = '', size = 'sm', showBar = false }: ScoreBadgeProps) {
  if (score === null || score === undefined) {
    return <span className="text-muted-foreground text-sm">—</span>;
  }
  return (
    <span
      className={cn(
        'inline-flex flex-col items-center px-2 py-0.5 rounded font-semibold',
        size === 'md' ? 'text-sm' : 'text-xs',
        getScoreColor(score)
      )}
    >
      <span>{score.toFixed(0)}{suffix}</span>
      {showBar && (
        <div className="w-full bg-black/20 rounded-full h-0.5 mt-0.5">
          <div
            className={cn('h-0.5 rounded-full', getBarColor(score))}
            style={{ width: `${Math.min(score, 100)}%` }}
          />
        </div>
      )}
    </span>
  );
}
