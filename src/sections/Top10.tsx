import type { AssetAnalysis } from '@/types';
import type { Position } from '@/lib/portfolio';
import { SignalBadge } from '@/components/SignalBadge';
import { TrendingUp, TrendingDown, Briefcase } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fmtPrice } from '@/lib/format';
import { portfolioAnalyses } from '@/lib/scanner';
import { positionMetrics } from '@/lib/positionContext';

interface Props {
  analyses: AssetAnalysis[];
  positions: Position[];
  onSelect: (a: AssetAnalysis) => void;
}

function Row({ a, rank, onSelect, position }: { a: AssetAnalysis; rank: number; onSelect: (a: AssetAnalysis) => void; position?: Position }) {
  const metrics = position ? positionMetrics(position, a.price) : null;
  return (
    <button onClick={() => onSelect(a)}
      className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-zinc-800/50 transition-colors text-left border-b border-zinc-800/40 last:border-0">
      <span className="shrink-0 text-[11px] text-zinc-400 w-4 font-mono">{rank}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-sm">{a.asset.symbol}</span>
          <span className="text-[10px] text-zinc-600 uppercase">{a.asset.assetClass === 'crypto' ? 'cripto' : 'acción'}</span>
        </div>
        <span className="text-xs text-zinc-400 truncate block">{a.asset.name}</span>
        {a.historyStale && <span className="block text-[11px] text-amber-300">Historial anterior</span>}
        {position && <span className={cn('mt-1 block text-[11px]', metrics?.pnl == null ? 'text-zinc-400' : metrics.pnl < 0 ? 'text-red-300' : 'text-emerald-300')}>
          {metrics?.pnl == null ? 'Costo sin registrar' : `Resultado latente: ${metrics.pnl.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}`}
        </span>}
      </div>
      <div className="shrink-0 text-right">
        <div className="font-mono text-sm">{fmtPrice(a.price)}</div>
        <div className={cn('font-mono text-[11px]', (a.change24h ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400')}>
          {a.change24h === null ? '—' : `${a.change24h >= 0 ? '+' : ''}${a.change24h.toFixed(2)}%`}
        </div>
      </div>
      <div className="w-10 shrink-0 text-right sm:w-16">
        <span className={cn('font-mono text-sm font-bold', a.composite >= 0 ? 'text-emerald-400' : 'text-red-400')}>
          {a.composite > 0 ? '+' : ''}{a.composite.toFixed(0)}
        </span>
      </div>
    </button>
  );
}

export function Top10({ analyses, positions, onSelect }: Props) {
  const buys = analyses.filter(a => a.composite >= 20).sort((a, b) => b.composite - a.composite).slice(0, 10);

  // Technical weakness in holdings is not a personal instruction to sell.
  const myPositions = portfolioAnalyses(analyses, positions);
  const sellsFromPortfolio = myPositions.filter(a => a.composite <= -20).sort((a, b) => a.composite - b.composite);
  const otherPositions = myPositions.filter(a => a.composite > -20);
  const pending = positions.length - myPositions.length;

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="rounded-lg border border-emerald-900/50 bg-emerald-950/10 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-emerald-900/40 bg-emerald-950/30">
          <TrendingUp size={15} className="text-emerald-400" />
          <h3 className="text-sm font-semibold text-emerald-300">Top {buys.length} lecturas alcistas</h3>
        </div>
        {buys.length === 0 ? (
          <p className="px-3 py-6 text-xs text-zinc-500 text-center">
            No hay lecturas alcistas con puntuación de 20 o más entre los activos analizados.
          </p>
        ) : buys.map((a, i) => <Row key={`${a.asset.assetClass}:${a.asset.id}`} a={a} rank={i + 1} onSelect={onSelect} />)}
      </div>

      <div className="rounded-lg border border-red-900/50 bg-red-950/10 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-red-900/40 bg-red-950/30">
          <TrendingDown size={15} className="text-red-400" />
          <h3 className="text-sm font-semibold text-red-300">Revisar riesgo en tu portafolio</h3>
        </div>
        {positions.length === 0 ? (
          <div className="px-3 py-6 text-center space-y-2">
            <Briefcase size={20} className="text-zinc-600 mx-auto" />
            <p className="text-xs text-zinc-500">
              No has añadido tus posiciones de Robinhood. Añádelas en <strong className="text-zinc-300">Mi portafolio</strong> (arriba)
              y aquí verás cuáles tienen sesgo bajista, junto a su resultado.
            </p>
          </div>
        ) : sellsFromPortfolio.length === 0 ? (
          <div className="px-3 py-6 text-center">
            <p className="text-xs text-zinc-300 font-medium">No hay sesgos bajistas entre tus posiciones con análisis disponible.</p>
            <p className="text-[11px] text-zinc-500 mt-1">
              Tus {otherPositions.length} posición{otherPositions.length !== 1 ? 'es' : ''}:{' '}
              {otherPositions.map(a => a.asset.symbol).join(', ') || '—'}
            </p>
          </div>
        ) : (
          <>
            {sellsFromPortfolio.map((a, i) => <Row key={`${a.asset.assetClass}:${a.asset.id}`} a={a} rank={i + 1} onSelect={onSelect}
              position={positions.find(p => p.assetId === a.asset.id && p.assetClass === a.asset.assetClass)} />)}
            {otherPositions.length > 0 && (
              <p className="px-3 py-2 text-[10px] text-zinc-600 border-t border-zinc-800/40">
                Otros sesgos: {otherPositions.map(a => a.asset.symbol).join(', ')}
              </p>
            )}
          </>
        )}
        {pending > 0 && <p className="px-3 py-2 text-xs text-amber-300">{pending} posición{pending !== 1 ? 'es' : ''} pendiente{pending !== 1 ? 's' : ''} de análisis.</p>}
        <p className="border-t border-zinc-800 px-3 py-2 text-[11px] text-zinc-400">El sesgo describe el mercado. Tu resultado depende de tus compras; revisa tus umbrales de riesgo por separado.</p>
      </div>
    </div>
  );
}

export function SignalChip({ a, onSelect }: { a: AssetAnalysis; onSelect: (a: AssetAnalysis) => void }) {
  return (
    <button onClick={() => onSelect(a)}
      className="flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-1 hover:border-zinc-600 transition-colors">
      <span className="font-bold text-xs">{a.asset.symbol}</span>
      <span className="text-[11px] text-zinc-400">{fmtPrice(a.price)}</span>
      <SignalBadge signal={a.signal} />
    </button>
  );
}
