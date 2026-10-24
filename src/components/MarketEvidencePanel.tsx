import { useEffect, useMemo, useState } from 'react';
import type { AssetAnalysis } from '@/types';
import { useCandleHistory } from '@/hooks/useCandleHistory';
import { useTradeFlow } from '@/hooks/useTradeFlow';
import { analyzeMarketEvidence, type EvidencePhase } from '@/lib/marketEvidence';
import { marketSignalLabel } from '@/lib/signals';
import { fmtPrice } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Position } from '@/lib/portfolio';
import { positionMetrics } from '@/lib/positionContext';
import { HorizonContext } from './HorizonContext';

const phases: Record<EvidencePhase, string> = {
  early: 'Impulso incipiente por confirmar', continuation: 'Continuación alcista a vigilar',
  exhaustion: 'Agotamiento después de una subida', weakness: 'Debilidad con varias señales alineadas', mixed: 'Evidencia dividida',
};

export function MarketEvidencePanel({ analysis, position }: { analysis: AssetAnalysis; position?: Position }) {
  const [timeframe, setTimeframe] = useState<'1m' | '5m' | '1d'>('5m');
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => { if (document.visibilityState !== 'hidden') setClock(Date.now()); };
    const timer = window.setInterval(tick, 10_000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, []);
  const interval = timeframe === '1m' ? 60 : timeframe === '5m' ? 300 : 86400;
  const { history, error, loading } = useCandleHistory(analysis.asset, timeframe);
  const { flow, error: flowError } = useTradeFlow(analysis.asset);
  const evidence = useMemo(() => history ? analyzeMarketEvidence(history.candles, interval, clock, analysis.asset.assetClass) : null, [history, interval, clock, analysis.asset.assetClass]);
  const historical = !!history?.stale || !!error || (!!evidence && clock - evidence.lastClosedAt > interval * 3000);
  const flowOld = flow && (flow.stale || flowError || clock - flow.fetchedAt > 30_000 || clock - flow.lastTradeAt > 30_000);
  const time = (timestamp: number) => new Date(timestamp).toLocaleString('es', { dateStyle: 'short', timeStyle: 'medium' });
  const dollars = (value: number) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const personal = position ? positionMetrics(position, analysis.price) : null;
  return <section aria-label="Impulso, presión y escenarios" className="min-w-0 rounded-xl border border-indigo-900/60 bg-indigo-950/10 p-3 sm:p-4 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold">Impulso, presión y escenarios</h3>
      <label className="text-xs text-zinc-300">Velas del análisis{' '}
        <select aria-label="Velas del análisis de escenarios" value={timeframe} onChange={e => setTimeframe(e.target.value as typeof timeframe)} className="h-10 rounded border border-zinc-700 bg-zinc-950 px-2">
          <option value="1m">1 min</option><option value="5m">5 min</option><option value="1d">1 día</option>
        </select>
      </label>
    </div>
    <p className="text-xs text-zinc-400">Se analiza si la subida gana fuerza, continúa o se agota. Se usan velas cerradas; el volumen de una vela abierta aún está incompleto.</p>
    <HorizonContext analysis={analysis} clock={clock} />
    {position && <div className="rounded-lg border border-zinc-700 p-3 space-y-1" aria-label="Contexto de salida de tu posición">
      <h4 className="text-sm font-semibold">Salidas: comparar con tus compras</h4>
      {personal?.pnl == null ? <p className="text-xs text-amber-300">Registra cantidad y costo para evaluar tu resultado al salir.</p> : <>
        <p className="text-xs text-zinc-200">Al último precio disponible, tu posición tiene {personal.pnl < 0 ? 'pérdida' : personal.pnl > 0 ? 'ganancia' : 'resultado neutro'} latente: {personal.pnl.toLocaleString('en-US',{style:'currency',currency:'USD'})} antes de costos.</p>
        {evidence && !historical && ['exhaustion','weakness'].includes(evidence.phase) ? <p className="text-xs text-amber-300">{personal.pnl > 0 ? 'Hay deterioro técnico: caso para revisar la protección de ganancias con tus umbrales.' : 'Hay deterioro técnico: caso para revisar el riesgo y tus umbrales. Cerrar aquí realizaría una pérdida o resultado neutro.'}</p> : <p className="text-xs text-zinc-400">Esta lectura no confirma un giro de salida actual. Comprueba también tus umbrales personales y la vigencia de los datos.</p>}
      </>}
    </div>}
    <div className="rounded-lg border border-zinc-700 bg-zinc-950/40 p-3 space-y-2" aria-label="Flujo observado">
      <h4 className="text-xs font-semibold">Operaciones observadas · {analysis.asset.assetClass === 'crypto' ? 'Kraken' : 'Acciones'}</h4>
      {flow ? <>
        <p className={cn('text-xs', flowOld ? 'text-amber-300' : 'text-zinc-200')}>{flowOld ? 'Muestra anterior; no confirma presión actual.' : 'Muestra reciente de operaciones ejecutadas en Kraken.'}</p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <p className="text-emerald-300">Compras agresoras<br /><strong>{dollars(flow.buyNotional)}</strong></p>
          <p className="text-red-300">Ventas agresoras<br /><strong>{dollars(flow.sellNotional)}</strong></p>
        </div>
        <p className="text-xs text-zinc-300">{(flow.buyShare * 100).toFixed(1)} % del importe de la muestra ejecutado por compradores agresores · {flow.trades} operaciones · {flow.market}.</p>
        <p className="text-[11px] text-zinc-400">Operaciones: {time(flow.firstTradeAt)} a {time(flow.lastTradeAt)} · Consulta: {time(flow.fetchedAt)}. Muestra limitada a hasta 1.000 operaciones de los últimos 5 minutos; no cubre todo el mercado.</p>
        {flow.trades < 20 && <p className="text-xs text-amber-300">Muestra pequeña: no basta para confirmar predominio.</p>}
      </> : <p className="text-xs text-zinc-400">{analysis.asset.assetClass === 'stock' ? 'No hay una fuente de operaciones clasificadas por lado conectada para acciones. La presión de abajo es una estimación basada en velas y volumen.' : flowError ? 'Kraken no entregó operaciones recientes para este par. No se inventa un balance comprador/vendedor.' : 'Consultando operaciones recientes de este par…'}</p>}
      <p className="text-[11px] leading-relaxed text-zinc-400">Cada operación tiene comprador y vendedor. «Agresor» identifica el lado que ejecuta contra órdenes disponibles; no cuenta personas ni muestra órdenes futuras.</p>
    </div>
    {!evidence ? <p role="status" className="text-xs text-amber-300">{loading ? 'Analizando velas…' : 'Se necesitan al menos 60 velas cerradas válidas en este intervalo. No hay escenarios calculables todavía.'}</p> : <>
      <div className="space-y-1">
        <h4 className="text-sm font-semibold">{historical ? 'Lectura histórica: ' : ''}{phases[evidence.phase]}</h4>
        <p className="text-[11px] text-zinc-400">{evidence.closedBars} velas cerradas · Último cierre analizado: {time(evidence.lastClosedAt)} · {history?.source} · {evidence.omittedOpenBars} vela(s) abierta(s) excluida(s).</p>
        {historical && <p className="text-xs text-amber-300">Datos anteriores o actualización fallida. Esta lectura no confirma una oportunidad actual.</p>}
        <p className="text-xs text-zinc-400">Contexto del análisis diario: {marketSignalLabel(analysis.signal).toLocaleLowerCase('es')}{analysis.historyStale ? ' · historial pendiente de actualizar' : ''}. Puede discrepar del intervalo elegido.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {evidence.models.map(model => <div key={model.name} className="min-w-0 rounded-lg border border-zinc-800 p-2.5">
          <p className="text-xs font-semibold">{model.name} <span className={model.direction === 'up' ? 'text-emerald-300' : model.direction === 'down' ? 'text-red-300' : 'text-zinc-400'}>· {model.direction === 'up' ? 'A favor del alza' : model.direction === 'down' ? 'A favor de la baja' : 'Sin confirmar'}</span></p>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">{model.detail}</p>
        </div>)}
      </div>
      <div className="grid gap-2 lg:grid-cols-3" aria-label="Escenarios condicionados">
        {[
          { title: 'Caso alcista', text: `Vigilar cierres sobre ${fmtPrice(evidence.current.resistance)} con volumen relativo ≥1.2× y momentum mejorando. Perder EMA20 (${fmtPrice(evidence.current.ema20)}) debilita este caso.` },
          { title: 'Caso lateral', text: `Oscilación entre ${fmtPrice(evidence.current.support)} y ${fmtPrice(evidence.current.resistance)}, con momentum sin dirección. Una ruptura con cierre y volumen cambia el caso.` },
          { title: 'Caso bajista', text: `Vigilar cierres bajo ${fmtPrice(evidence.current.support)} con volumen relativo ≥1.2× y momentum deteriorándose. Recuperar EMA20 (${fmtPrice(evidence.current.ema20)}) debilita este caso.` },
        ].map(item => <div key={item.title} className="min-w-0 rounded-lg border border-zinc-800 p-3"><h5 className="text-xs font-semibold">{item.title}</h5><p className="mt-1 text-xs leading-relaxed text-zinc-400">{item.text}</p></div>)}
      </div>
      <details className="rounded-lg border border-zinc-700 p-3">
        <summary className="cursor-pointer text-xs text-indigo-300">Qué pasó en casos parecidos de este activo</summary>
        <div className="mt-2 space-y-2 text-xs text-zinc-400">
          <p>Se comparan la misma fase y seis variables normalizadas de precio, momentum y volumen. Máximo 20 casos, con ventanas de resultado separadas y anteriores a las 20 velas más recientes. Horizonte: {evidence.analogs.horizonBars} velas cerradas posteriores.</p>
          {evidence.analogs.count < 8 ? <p className="text-amber-300">Solo hay {evidence.analogs.count} caso(s) parecido(s). Muestra insuficiente: no se muestra una expectativa de rendimiento.</p> : <>
            <p>{evidence.analogs.count} casos: {evidence.analogs.up} subieron, {evidence.analogs.down} bajaron y {evidence.analogs.flat} quedaron dentro de ±0.25 ATR.</p>
            <p>Rendimiento mediano: {evidence.analogs.medianReturn!.toFixed(2)} % · Mitad central de resultados: {evidence.analogs.lowerReturn!.toFixed(2)} % a {evidence.analogs.upperReturn!.toFixed(2)} %.</p>
          </>}
          <p>Son observaciones del historial disponible, sin costos; no son probabilidades futuras ni un backtest validado. Los casos pueden estar correlacionados, la selección puede introducir sesgo y las condiciones cambian.</p>
        </div>
      </details>
    </>}
    <p className="text-[11px] leading-relaxed text-zinc-400">La presión por velas es un proxy, no volumen real de compras/ventas. Las reglas son heurísticas y comparten información; la confluencia no garantiza ganancias. Esta lectura no cambia automáticamente tus umbrales ni ejecuta órdenes.</p>
  </section>;
}
