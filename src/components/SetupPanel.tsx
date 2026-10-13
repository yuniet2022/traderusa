import { useEffect, useState } from 'react';
import type { Asset } from '@/types';
import { detectSetups, type ConfluencePlan } from '@/lib/setups';
import { loadTimeframeCandles, loadCandles } from '@/lib/data';
import { Loader2, CheckCircle2, Circle, Target } from 'lucide-react';
import { cn } from '@/lib/utils';

const fmt = (v: number) => v >= 1000 ? v.toLocaleString('es', { maximumFractionDigits: 0 })
  : v >= 1 ? v.toFixed(2) : v.toPrecision(3);

export function SetupPanel({ asset }: { asset: Asset }) {
  const [plan, setPlan] = useState<ConfluencePlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setError(null);
      try {
        const tf = asset.assetClass === 'crypto' ? '15m' : '5m';
        const [intraday, daily] = await Promise.all([
          loadTimeframeCandles(asset, tf),
          loadCandles(asset).then(r => r.candles),
        ]);
        if (!alive) return;
        const p = detectSetups(intraday, daily);
        setPlan(p);
        if (!p) setError('No hay suficientes velas de hoy todavía.');
      } catch {
        if (alive) setError('Sin datos intradía en este momento.');
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [asset.id, asset.assetClass]);

  if (loading) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 flex items-center gap-2 text-xs text-zinc-500">
        <Loader2 size={13} className="animate-spin" /> Analizando los 6 setups del día…
      </div>
    );
  }
  if (error || !plan) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-xs text-zinc-500">
        {error ?? 'Sin lectura de setups.'} {asset.assetClass === 'stock' && 'Las acciones solo tienen setups en horario de mercado (9:30–16:00 ET).'}
      </div>
    );
  }

  const dirColor = plan.direction === 'LARGO' ? 'text-emerald-300' : plan.direction === 'CORTO' ? 'text-red-300' : 'text-zinc-300';
  const dirBg = plan.direction === 'LARGO' ? 'border-emerald-800/60 bg-emerald-950/20'
    : plan.direction === 'CORTO' ? 'border-red-800/60 bg-red-950/20'
    : 'border-zinc-800 bg-zinc-900/50';

  return (
    <div className={cn('rounded-lg border p-3 space-y-3', dirBg)}>
      <div className="flex items-center gap-2 flex-wrap">
        <Target size={16} className={dirColor} />
        <span className="text-sm font-bold">Detector de confluencia — 6 setups</span>
        <span className={cn('ml-auto text-xs font-bold px-2 py-0.5 rounded',
          plan.direction === 'LARGO' ? 'bg-emerald-600 text-white'
          : plan.direction === 'CORTO' ? 'bg-red-600 text-white'
          : 'bg-zinc-700 text-zinc-200')}>
          {plan.direction} · {plan.score}/{plan.maxScore}
        </span>
      </div>

      {/* Lista de setups */}
      <div className="space-y-2">
        {plan.setups.map(s => (
          <div key={s.id} className="flex gap-2.5 items-start">
            {s.direction
              ? <CheckCircle2 size={14} className={cn('shrink-0 mt-0.5', s.direction === 'long' ? 'text-emerald-400' : 'text-red-400')} />
              : <Circle size={14} className="text-zinc-600 shrink-0 mt-0.5" />}
            <div className="min-w-0">
              <p className="text-xs font-medium">
                {s.name}
                {s.direction && (
                  <span className={cn('ml-1.5 text-[10px] font-bold uppercase',
                    s.direction === 'long' ? 'text-emerald-400' : 'text-red-400')}>
                    {s.direction === 'long' ? '→ largo' : '→ corto'}
                  </span>
                )}
              </p>
              <p className="text-[11px] text-zinc-500 leading-snug">{s.detail}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Niveles */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 text-center">
        {[
          { label: 'PDH', v: plan.levels.pdh, cls: 'text-emerald-400' },
          { label: 'PDL', v: plan.levels.pdl, cls: 'text-red-400' },
          { label: 'OR máx', v: plan.levels.orHigh, cls: 'text-emerald-300' },
          { label: 'OR mín', v: plan.levels.orLow, cls: 'text-red-300' },
          { label: 'VWAP', v: plan.levels.vwap, cls: 'text-amber-400' },
        ].map(x => (
          <div key={x.label} className="rounded bg-zinc-950/60 border border-zinc-800 px-1.5 py-1.5">
            <p className="text-[9px] text-zinc-500 uppercase">{x.label}</p>
            <p className={cn('font-mono font-bold text-[11px]', x.cls)}>${fmt(x.v)}</p>
          </div>
        ))}
      </div>

      {/* Plan si hay confluencia */}
      {plan.direction !== 'ESPERAR' && plan.entry !== null && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          {[
            { label: 'Entrada', v: plan.entry, cls: 'text-zinc-100' },
            { label: 'Stop', v: plan.stop!, cls: 'text-red-400' },
            { label: 'Objetivo 1', v: plan.target1!, cls: 'text-emerald-400' },
            { label: 'Objetivo 2', v: plan.target2!, cls: 'text-emerald-300' },
          ].map(x => (
            <div key={x.label} className="rounded bg-zinc-950/60 border border-zinc-800 px-2 py-1.5">
              <p className="text-[9px] text-zinc-500 uppercase">{x.label}</p>
              <p className={cn('font-mono font-bold text-xs', x.cls)}>${fmt(x.v)}</p>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-zinc-400 leading-relaxed">{plan.note}</p>
      <p className="text-[10px] text-zinc-600 leading-snug">
        La confluencia exige 3+ setups en la misma dirección para proponer entrada.
        Niveles: PDH/PDL = máx/mín de ayer · OR = rango de los primeros 30 min. No es asesoría financiera.
      </p>
    </div>
  );
}
