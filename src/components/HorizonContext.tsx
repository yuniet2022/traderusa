import { useMemo } from 'react';
import type { AssetAnalysis } from '@/types';
import { horizonContext } from '@/lib/horizonContext';
import { analyzeMarketEvidence } from '@/lib/marketEvidence';

export function HorizonContext({ analysis: a, clock }: { analysis: AssetAnalysis; clock: number }) {
  const context = useMemo(() => horizonContext(a.candles, a.asset.assetClass, a.price, a.change24h, clock), [a.candles, a.asset.assetClass, a.price, a.change24h, clock]);
  const periods = useMemo(() => [1, a.asset.assetClass === 'crypto' ? 30 : 21, a.asset.assetClass === 'crypto' ? 90 : 63].map(bars => ({
    bars, evidence: analyzeMarketEvidence(a.candles, 86400, clock, a.asset.assetClass, bars),
  })), [a.candles, a.asset.assetClass, clock]);
  const percent = (value: number | null) => value === null ? 'Sin historial suficiente' : `${value >= 0 ? '+' : ''}${value.toFixed(2)} %`;
  return <div aria-label="Contexto diario, mensual y trimestral" className="rounded-lg border border-zinc-700 p-3 space-y-3">
    <h4 className="text-sm font-semibold">Posibles compras: precio frente a su historial</h4>
    <p className="text-xs text-zinc-400">Estos cambios describen el precio del activo, no una ganancia o pérdida tuya.</p>
    <p className="text-xs text-zinc-200">{context.context}</p>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
      {[{ title: 'Cambio diario visible', value: context.dailyChange }, { title: `Mes (${context.monthBars} velas diarias)`, value: context.month }, { title: `Trimestre (${context.quarterBars} velas diarias)`, value: context.quarter }].map(item => <div key={item.title} className="rounded-md bg-zinc-950/50 p-2">
        <p className="text-zinc-400">{item.title}</p><p className={item.value === null ? 'text-zinc-400' : item.value >= 0 ? 'text-emerald-300' : 'text-red-300'}>{percent(item.value)}</p>
      </div>)}
    </div>
    <p className="text-[11px] leading-relaxed text-zinc-400">Son cambios observados, no pronósticos. Mes y trimestre usan velas diarias cerradas, hasta {context.lastDailyCloseAt ? new Date(context.lastDailyCloseAt).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' }) : 'una fecha no disponible'}. El cambio diario puede incluir una sesión en curso. Una caída diaria no demuestra por sí sola una tendencia bajista ni una normalización.</p>
    {a.historyStale && <p className="text-xs text-amber-300">El historial diario está pendiente de actualizar.</p>}
    <details>
      <summary className="min-h-8 cursor-pointer text-xs text-indigo-300">Escenarios históricos a un día, un mes y un trimestre</summary>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {periods.map(({bars,evidence},i) => <div key={bars} className="rounded-md border border-zinc-800 p-2 text-xs space-y-1">
          <h5 className="font-semibold">{['Un día','Un mes','Un trimestre'][i]}</h5>
          <p className="text-zinc-400">Horizonte: {bars} vela(s) diaria(s) posterior(es) a casos parecidos.</p>
          {!evidence || evidence.analogs.count < 8 ? <p className="text-amber-300">{evidence?.analogs.count ?? 0} casos: muestra insuficiente para una estimación.</p> : <>
            <p>{evidence.analogs.count} casos · mediana observada {percent(evidence.analogs.medianReturn)}</p>
            <p className="text-zinc-400">Mitad central: {percent(evidence.analogs.lowerReturn)} a {percent(evidence.analogs.upperReturn)}.</p>
          </>}
        </div>)}
      </div>
      <p className="mt-2 text-[11px] text-zinc-400">Comparación exploratoria del mismo activo, sin costos ni probabilidades calibradas. No es una promesa de rendimiento. Los horizontes largos requieren mucho más historial para reunir casos comparables con resultados separados.</p>
    </details>
  </div>;
}
