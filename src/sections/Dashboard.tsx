import { useMemo, useState } from 'react';
import type { AssetAnalysis } from '@/types';
import type { Position } from '@/lib/portfolio';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { SignalBadge, ScoreBar } from '@/components/SignalBadge';
import { RefreshCw, BellPlus, AlertTriangle, Briefcase } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Top10 } from '@/sections/Top10';
import { cn } from '@/lib/utils';

interface Props {
  analyses: AssetAnalysis[];
  positions: Position[];
  loading: boolean;
  liveCount: number;
  updatedAt: number | null;
  onSelect: (a: AssetAnalysis) => void;
  onRefresh: () => void;
  onQuickAlert: (a: AssetAnalysis) => void;
}

export const fmtPrice = (v: number) =>
  v >= 1000 ? '$' + v.toLocaleString('es', { maximumFractionDigits: 0 })
  : v >= 1 ? '$' + v.toFixed(2) : '$' + v.toPrecision(4);

export function Dashboard({ analyses, positions, loading, updatedAt, onSelect, onRefresh, onQuickAlert }: Props) {
  const [filter, setFilter] = useState<'all' | 'stock' | 'crypto'>('all');

  const filtered = useMemo(
    () => analyses.filter(a => filter === 'all' || a.asset.assetClass === filter),
    [analyses, filter],
  );
  const buys = analyses.filter(a => a.composite >= 20);
  const myPositions = positions.map(p => analyses.find(a => a.asset.id === p.assetId)).filter((a): a is AssetAnalysis => !!a);
  const sellsFromPortfolio = myPositions.filter(a => a.composite <= -20);

  return (
    <div className="space-y-4">
      {/* Franja de estado */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-zinc-400">
        <span><strong className="text-zinc-100">{analyses.length}</strong> activos de Robinhood</span>
        <span className="text-emerald-400"><strong>{buys.length}</strong> en compra</span>
        <span className="text-red-400"><strong>{sellsFromPortfolio.length}</strong> de tus posiciones en venta</span>
        {positions.length > 0 && (
          <span className="text-zinc-400 flex items-center gap-1">
            <Briefcase size={12} /> {positions.length} en tu portafolio
          </span>
        )}
        {updatedAt && <span className="ml-auto">Actualizado {new Date(updatedAt).toLocaleTimeString('es')}</span>}
      </div>

      {/* TOP 10 compras y ventas */}
      {!loading || analyses.length > 0 ? <Top10 analyses={analyses} positions={positions} onSelect={onSelect} /> : null}

      {/* Tabla principal (estilo Yahoo most-active) */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800">
          <h2 className="text-sm font-semibold">Escáner del mercado</h2>
          <div className="flex items-center gap-2">
            <Tabs value={filter} onValueChange={v => setFilter(v as typeof filter)}>
              <TabsList className="h-7">
                <TabsTrigger value="all" className="text-xs px-2.5 h-6">Todos</TabsTrigger>
                <TabsTrigger value="stock" className="text-xs px-2.5 h-6">Acciones</TabsTrigger>
                <TabsTrigger value="crypto" className="text-xs px-2.5 h-6">Cripto</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRefresh} disabled={loading}>
              <RefreshCw size={13} className={cn(loading && 'animate-spin')} />
            </Button>
          </div>
        </div>

        {loading && analyses.length === 0 ? (
          <div className="p-4 space-y-2">{[...Array(10)].map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-zinc-500 border-b border-zinc-800">
                  <th className="py-2 pl-4 pr-2 font-medium">Símbolo</th>
                  <th className="py-2 pr-2 font-medium text-right">Precio</th>
                  <th className="py-2 pr-2 font-medium text-right">Cambio</th>
                  <th className="py-2 pr-2 font-medium">Puntuación</th>
                  <th className="py-2 pr-2 font-medium">Señal</th>
                  <th className="py-2 pr-2 font-medium text-right hidden md:table-cell">Entrada</th>
                  <th className="py-2 pr-2 font-medium text-right hidden md:table-cell">Objetivo</th>
                  <th className="py-2 pr-2 font-medium text-right hidden md:table-cell">Stop</th>
                  <th className="py-2 pr-4 font-medium w-8"><span className="sr-only">Alerta</span></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(a => (
                  <tr key={`${a.asset.assetClass}:${a.asset.id}`}
                    onClick={() => onSelect(a)}
                    className="border-b border-zinc-800/50 hover:bg-zinc-800/40 cursor-pointer transition-colors">
                    <td className="py-2 pl-4 pr-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{a.asset.symbol}</span>
                        {a.extension === 2 && (
                          <span title="Pico vertical: compra vetada, esperar pullback">
                            <AlertTriangle size={13} className="text-amber-400" />
                          </span>
                        )}
                        <span className="text-[11px] text-zinc-500 hidden sm:inline max-w-[140px] truncate">{a.asset.name}</span>
                      </div>
                    </td>
                    <td className="py-2 pr-2 text-right font-mono">{fmtPrice(a.price)}</td>
                    <td className={cn('py-2 pr-2 text-right font-mono text-xs',
                      (a.change24h ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                      {a.change24h === null ? '—' : `${a.change24h >= 0 ? '+' : ''}${a.change24h.toFixed(2)}%`}
                    </td>
                    <td className="py-2 pr-2"><ScoreBar score={a.composite} /></td>
                    <td className="py-2 pr-2"><SignalBadge signal={a.signal} /></td>
                    <td className="py-2 pr-2 text-right font-mono text-xs hidden md:table-cell">{fmtPrice(a.levels.entry)}</td>
                    <td className="py-2 pr-2 text-right font-mono text-xs text-emerald-400 hidden md:table-cell">{fmtPrice(a.levels.target1)}</td>
                    <td className="py-2 pr-2 text-right font-mono text-xs text-red-400 hidden md:table-cell">{fmtPrice(a.levels.stop)}</td>
                    <td className="py-2 pr-4">
                      <button
                        onClick={e => { e.stopPropagation(); onQuickAlert(a); }}
                        title={a.composite >= 20 ? 'Crear alerta: avísame cuándo vender' : 'Crear alerta: avísame cuándo comprar'}
                        className="text-zinc-500 hover:text-amber-400 transition-colors">
                        <BellPlus size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[10px] text-zinc-600 px-4 py-2 border-t border-zinc-800">
          Solo activos operables en Robinhood · Cripto: Binance en vivo · Acciones: Yahoo Finance ·
          Entrada/Objetivo/Stop calculados con volatilidad (ATR) · Las alertas automáticas avisan cuando cambia una señal · No es asesoría financiera.
        </p>
      </div>
    </div>
  );
}
