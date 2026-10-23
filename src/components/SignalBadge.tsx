import type { SignalDirection } from '@/types';
import { cn } from '@/lib/utils';
import { marketSignalLabel } from '@/lib/signals';

const styles: Record<SignalDirection, string> = {
  'COMPRA FUERTE': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
  'COMPRA': 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25',
  'NEUTRAL': 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
  'VENTA': 'bg-red-500/10 text-red-300 border-red-500/25',
  'VENTA FUERTE': 'bg-red-500/20 text-red-400 border-red-500/40',
};

export function SignalBadge({ signal, className }: { signal: SignalDirection; className?: string }) {
  return (
    <span className={cn(
      'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide whitespace-nowrap',
      styles[signal], className,
    )}>
      {marketSignalLabel(signal)}
    </span>
  );
}

export function ScoreBar({ score }: { score: number }) {
  const pct = Math.abs(score);
  const positive = score >= 0;
  return (
    <div className="flex items-center gap-2 min-w-[140px]">
      <div className="relative h-2 flex-1 rounded-full bg-zinc-800 overflow-hidden">
        <div className="absolute inset-y-0 left-1/2 w-px bg-zinc-600" />
        <div
          className={cn('absolute inset-y-0 rounded-full', positive ? 'bg-emerald-500' : 'bg-red-500')}
          style={positive
            ? { left: '50%', width: `${pct / 2}%` }
            : { right: '50%', width: `${pct / 2}%` }}
        />
      </div>
      <span className={cn('text-xs font-mono w-10 text-right', positive ? 'text-emerald-400' : 'text-red-400')}>
        {score > 0 ? '+' : ''}{score.toFixed(0)}
      </span>
    </div>
  );
}
