import { useMemo, useState } from 'react';
import type { AssetAnalysis } from '@/types';
import type { Position } from '@/lib/portfolio';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { SignalBadge, ScoreBar } from '@/components/SignalBadge';
import { RefreshCw, BellPlus, AlertTriangle, Briefcase, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Top10 } from '@/sections/Top10';
import { cn } from '@/lib/utils';
import { fmtPrice } from '@/lib/format';
import { PriceDataStatus } from '@/components/PriceDataStatus';
import { portfolioAnalyses, selectScannerAssets, type ScannerSignal, type ScannerSort } from '@/lib/scanner';

interface Props {
  analyses: AssetAnalysis[];
  positions: Position[];
  loading: boolean;
  quoteCount: number;
  updatedAt: number | null;
  marketNotice?: string | null;
  progress?: { completed: number; total: number };
  onSelect: (a: AssetAnalysis) => void;
  onRefresh: () => void;
  onQuickAlert: (a: AssetAnalysis) => void;
}

export function Dashboard({ analyses, positions, loading, quoteCount, updatedAt, marketNotice, progress, onSelect, onRefresh, onQuickAlert }: Props) {
  const [filter, setFilter] = useState<'all' | 'stock' | 'crypto'>('all');
  const [query, setQuery] = useState('');
  const [signal, setSignal] = useState<ScannerSignal>('all');
  const [sort, setSort] = useState<ScannerSort>('score');

  const filtered = useMemo(
    () => selectScannerAssets(analyses, { assetClass: filter, signal, query, sort }),
    [analyses, filter, signal, query, sort],
  );
  const buys = analyses.filter(a => a.composite >= 20);
  const myPositions = portfolioAnalyses(analyses, positions);
  const bearishPositions = myPositions.filter(a => a.composite <= -20);

  return (
    <div className="min-w-0 space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Activos analizados', value: analyses.length, detail: `${quoteCount} con cotización consultada`, color: 'text-zinc-100' },
          { label: 'Sesgos alcistas', value: buys.length, detail: 'Lectura técnica de 20 o más', color: 'text-emerald-400' },
          { label: 'Posiciones con sesgo bajista', value: bearishPositions.length, detail: 'Revisar junto a tu costo y riesgo', color: 'text-red-400' },
          { label: 'Mi portafolio', value: positions.length, detail: 'Posiciones registradas', color: 'text-indigo-300' },
        ].map(item => (
          <div key={item.label} className="min-w-0 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 sm:p-4">
            <p className="text-xs text-zinc-400">{item.label}</p>
            <p className={cn('mt-1 text-2xl font-semibold tabular-nums', item.color)}>{item.value}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">{item.detail}</p>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 text-xs text-zinc-400" role="status">
        <span className={cn('h-2 w-2 rounded-full', loading ? 'bg-amber-400 animate-pulse' : analyses.length ? 'bg-emerald-400' : 'bg-zinc-500')} />
        {loading ? `Actualizando el mercado…${progress?.total ? ` ${progress.completed}/${progress.total}` : ''}` : updatedAt ? `Señales calculadas a las ${new Date(updatedAt).toLocaleTimeString('es')}` : 'Esperando datos del mercado'}
      </div>
      {marketNotice && <p role="status" className="text-xs text-amber-300 rounded-md border border-amber-900/60 bg-amber-950/20 px-3 py-2">{marketNotice}</p>}

      {/* TOP 10 compras y ventas */}
      {analyses.length > 0 ? <Top10 analyses={analyses} positions={positions} onSelect={onSelect} /> : null}

      {/* Tabla principal (estilo Yahoo most-active) */}
      <div className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-900/50 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-zinc-800">
          <h2 className="text-sm font-semibold">Escáner del mercado</h2>
          <div className="flex items-center gap-2">
            <Tabs value={filter} onValueChange={v => setFilter(v as typeof filter)}>
              <TabsList className="h-7">
                <TabsTrigger value="all" className="text-xs px-2.5 h-6">Todos</TabsTrigger>
                <TabsTrigger value="stock" className="text-xs px-2.5 h-6">Acciones</TabsTrigger>
                <TabsTrigger value="crypto" className="text-xs px-2.5 h-6">Cripto</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={onRefresh} disabled={loading} aria-label="Actualizar mercado">
              <RefreshCw size={13} className={cn(loading && 'animate-spin')} />
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 items-end gap-3 px-3 py-3 sm:px-4 sm:flex sm:flex-wrap border-b border-zinc-800 bg-zinc-950/30">
          <label className="col-span-2 min-w-0 sm:min-w-[180px] sm:flex-1 space-y-1 text-xs text-zinc-400">
            <span>Filtrar activos</span>
            <span className="flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-950 px-3">
              <Search size={14} aria-hidden="true" />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Símbolo o nombre"
                className="h-9 min-w-0 w-full bg-transparent text-zinc-100 outline-none focus-visible:ring-2 focus-visible:ring-emerald-500" />
            </span>
          </label>
          <label className="min-w-0 space-y-1 text-xs text-zinc-400">
            <span className="block">Sesgo técnico</span>
            <select aria-label="Sesgo técnico" value={signal} onChange={e => setSignal(e.target.value as ScannerSignal)} className="h-11 w-full sm:h-9 sm:w-auto rounded-md border border-zinc-700 bg-zinc-950 px-2 text-zinc-100">
              <option value="all">Todos</option><option value="buy">Alcista</option><option value="sell">Bajista</option><option value="neutral">Neutral</option>
            </select>
          </label>
          <label className="min-w-0 space-y-1 text-xs text-zinc-400">
            <span className="block">Ordenar por</span>
            <select aria-label="Ordenar por" value={sort} onChange={e => setSort(e.target.value as ScannerSort)} className="h-11 w-full sm:h-9 sm:w-auto rounded-md border border-zinc-700 bg-zinc-950 px-2 text-zinc-100">
              <option value="score">Puntuación</option><option value="change">Cambio diario</option><option value="symbol">Símbolo</option>
            </select>
          </label>
          <span className="col-span-2 sm:pb-2 text-xs text-zinc-400" role="status">{filtered.length} de {analyses.length} activos</span>
        </div>

        {loading && analyses.length === 0 ? (
          <div className="p-4 space-y-2">{[...Array(10)].map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-10 text-center space-y-2">
            <Briefcase size={24} className="mx-auto text-zinc-500" aria-hidden="true" />
            <p className="text-sm text-zinc-300">{analyses.length === 0 ? 'Todavía no hay datos disponibles' : 'No hay activos con estos filtros'}</p>
            <p className="text-xs text-zinc-500">{analyses.length === 0 ? 'Intenta actualizar el mercado para volver a cargar las cotizaciones.' : 'Prueba otro símbolo o restablece los filtros.'}</p>
            <Button variant="outline" size="sm" disabled={loading} onClick={() => {
              if (!analyses.length) onRefresh();
              else { setQuery(''); setSignal('all'); setFilter('all'); }
            }}>{analyses.length === 0 ? 'Reintentar carga' : 'Restablecer filtros'}</Button>
          </div>
        ) : (
          <>
          <div className="divide-y divide-zinc-800 md:hidden" aria-label="Activos del mercado">
            {filtered.map(a => <MobileAssetRow key={`${a.asset.assetClass}:${a.asset.id}`} analysis={a} onSelect={onSelect} onQuickAlert={onQuickAlert} />)}
          </div>
          <div className="relative hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-zinc-500 border-b border-zinc-800">
                  <th className="py-2 pl-4 pr-2 font-medium">Símbolo</th>
                  <th className="py-2 pr-2 font-medium text-right">Precio</th>
                  <th className="py-2 pr-2 font-medium text-right">Cambio</th>
                  <th className="py-2 pr-2 font-medium">Puntuación</th>
                  <th className="py-2 pr-2 font-medium">Sesgo técnico</th>
                  <th className="py-2 pr-2 font-medium text-right hidden md:table-cell">Referencia</th>
                  <th className="py-2 pr-2 font-medium text-right hidden md:table-cell">Objetivo técnico</th>
                  <th className="py-2 pr-2 font-medium text-right hidden md:table-cell">Stop técnico</th>
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
                        <button onClick={e => { e.stopPropagation(); onSelect(a); }} aria-label={`Ver análisis de ${a.asset.symbol}`}
                          className="font-semibold rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">{a.asset.symbol}</button>
                        {a.extension === 2 && (
                          <span title="Pico vertical: compra vetada, esperar pullback">
                            <AlertTriangle size={13} className="text-amber-400" />
                          </span>
                        )}
                        <span className="text-[11px] text-zinc-500 hidden sm:inline max-w-[140px] truncate">{a.asset.name}</span>
                      </div>
                    </td>
                    <td className="py-2 pr-2 text-right font-mono whitespace-nowrap">{fmtPrice(a.price)}<PriceDataStatus analysis={a} /></td>
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
                        aria-label={`Crear alerta para ${a.asset.symbol}`}
                        title={a.composite >= 20 ? 'Avisar si aparece sesgo bajista' : 'Avisar si aparece sesgo alcista'}
                        className="text-zinc-500 hover:text-amber-400 transition-colors">
                        <BellPlus size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
        <p className="text-[11px] leading-relaxed text-zinc-400 px-3 sm:px-4 py-3 border-t border-zinc-800">
          Fuentes gratuitas con posible retraso; cada precio indica origen y hora ·
          Niveles técnicos hipotéticos calculados con ATR; no usan tu costo de compra · Consulta tu resultado y tus umbrales en el detalle · Las alertas avisan de cambios técnicos, no ejecutan órdenes.
        </p>
      </div>
    </div>
  );
}

function MobileAssetRow({ analysis: a, onSelect, onQuickAlert }: {
  analysis: AssetAnalysis;
  onSelect: Props['onSelect'];
  onQuickAlert: Props['onQuickAlert'];
}) {
  return <article className="min-w-0 px-3 py-3" data-slot="mobile-asset">
    <div className="flex items-start gap-2">
      <button onClick={() => onSelect(a)} aria-label={`Ver análisis de ${a.asset.symbol}`}
        className="flex min-h-11 min-w-0 flex-1 items-start justify-between gap-3 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 font-semibold text-sm">
            <span className="truncate">{a.asset.symbol}</span>
            {a.extension === 2 && <AlertTriangle size={13} className="shrink-0 text-amber-400" aria-label="Precio extendido" />}
          </span>
          <span className="mt-0.5 block truncate text-xs text-zinc-400">{a.asset.name}</span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block font-mono text-sm font-medium tabular-nums">{fmtPrice(a.price)}</span>
          <span className={cn('mt-0.5 block font-mono text-xs', (a.change24h ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400')}>
            {a.change24h === null ? '—' : `${a.change24h >= 0 ? '+' : ''}${a.change24h.toFixed(2)}%`}
          </span>
        </span>
      </button>
      <button onClick={() => onQuickAlert(a)} aria-label={`Crear alerta para ${a.asset.symbol}`}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-zinc-800 text-zinc-400 hover:text-amber-400">
        <BellPlus size={16} />
      </button>
    </div>
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
      <SignalBadge signal={a.signal} />
      <span className="text-xs text-zinc-400">Puntuación <span className={cn('font-mono font-medium', a.composite >= 0 ? 'text-emerald-400' : 'text-red-400')}>{a.composite > 0 ? '+' : ''}{a.composite.toFixed(0)}</span></span>
    </div>
    <div className="mt-1.5"><PriceDataStatus analysis={a} /></div>
  </article>;
}
