import { useEffect, useState } from 'react';
import type { Asset, Candle } from '@/types';
import { classifyDay, type DayTypeReading } from '@/lib/dayType';
import { loadTimeframeCandles, loadCandles } from '@/lib/data';
import { Loader2, Zap, Waves, AlertOctagon, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

const fmt = (v: number) => v >= 1000 ? v.toLocaleString('es', { maximumFractionDigits: 0 })
  : v >= 1 ? v.toFixed(2) : v.toPrecision(3);

const STYLE: Record<string, { color: string; bg: string; border: string; icon: typeof Zap; label: string }> = {
  TENDENCIA: { color: 'text-emerald-300', bg: 'bg-emerald-950/40', border: 'border-emerald-800/60', icon: Zap, label: 'DÍA DE TENDENCIA' },
  RANGO: { color: 'text-sky-300', bg: 'bg-sky-950/40', border: 'border-sky-800/60', icon: Waves, label: 'DÍA DE RANGO' },
  CHOPPY: { color: 'text-red-300', bg: 'bg-red-950/40', border: 'border-red-800/60', icon: AlertOctagon, label: 'DÍA CHOPPY (PICADOR)' },
  INDEFINIDO: { color: 'text-zinc-300', bg: 'bg-zinc-900/60', border: 'border-zinc-700', icon: Clock, label: 'AÚN POR DEFINIR' },
};

function Gauge({ reading }: { reading: DayTypeReading }) {
  // gauge de 3 zonas: choppy | rango | tendencia
  const pos = reading.type === 'CHOPPY' ? 15 : reading.type === 'RANGO' ? 50 : reading.type === 'TENDENCIA' ? 85 : 50;
  return (
    <div>
      <div className="relative h-2.5 rounded-full overflow-hidden flex">
        <div className="h-full bg-red-500/50" style={{ width: '33.3%' }} />
        <div className="h-full bg-sky-500/50" style={{ width: '33.4%' }} />
        <div className="h-full bg-emerald-500/50" style={{ width: '33.3%' }} />
        <div className="absolute top-0 h-full w-1 bg-white rounded shadow"
          style={{ left: `calc(${pos}% - 2px)`, transition: 'left 0.5s' }} />
      </div>
      <div className="flex justify-between text-[9px] text-zinc-500 mt-1 uppercase tracking-wide">
        <span className="text-red-400/80">Choppy</span>
        <span className="text-sky-400/80">Rango</span>
        <span className="text-emerald-400/80">Tendencia</span>
      </div>
    </div>
  );
}

export function DayTypePanel({ asset }: { asset: Asset }) {
  const [reading, setReading] = useState<DayTypeReading | null>(null);
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
          loadCandles(asset).then(r => r.candles as Candle[]),
        ]);
        if (!alive) return;
        const r = classifyDay(intraday, daily);
        setReading(r);
        if (!r) setError('No hay suficientes velas de hoy todavía.');
      } catch {
        if (alive) setError('Sin datos intradía en este momento.');
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [asset.id, asset.assetClass]);

  if (loading) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 flex items-center gap-2 text-xs text-zinc-500">
        <Loader2 size={13} className="animate-spin" /> Leyendo la apertura del día…
      </div>
    );
  }
  if (error || !reading) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-xs text-zinc-500">
        {error ?? 'Sin lectura del día.'} {asset.assetClass === 'stock' && 'Las acciones solo tienen lectura en horario de mercado de EE. UU. (9:30–16:00 ET).'}
      </div>
    );
  }

  const s = STYLE[reading.type];
  const Icon = s.icon;

  return (
    <div className={cn('rounded-lg border p-3 space-y-2.5', s.bg, s.border)}>
      <div className="flex items-center gap-2 flex-wrap">
        <Icon size={16} className={s.color} />
        <span className={cn('text-sm font-bold tracking-wide', s.color)}>
          {s.label}
          {reading.direction && ` ${reading.direction}`}
        </span>
        <span className="text-[10px] text-zinc-400 ml-auto font-mono">
          confianza {reading.confidence}% · {reading.minutesElapsed} min de sesión
        </span>
      </div>

      <Gauge reading={reading} />

      {/* Niveles del Opening Range */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-md bg-zinc-950/60 border border-zinc-800 px-2.5 py-1.5">
          <p className="text-[9px] text-zinc-500 uppercase tracking-wide">Máx. apertura (30m)</p>
          <p className="font-mono font-bold text-xs text-emerald-400">${fmt(reading.orHigh)}</p>
        </div>
        <div className="rounded-md bg-zinc-950/60 border border-zinc-800 px-2.5 py-1.5">
          <p className="text-[9px] text-zinc-500 uppercase tracking-wide">Mín. apertura (30m)</p>
          <p className="font-mono font-bold text-xs text-red-400">${fmt(reading.orLow)}</p>
        </div>
        <div className="rounded-md bg-zinc-950/60 border border-zinc-800 px-2.5 py-1.5">
          <p className="text-[9px] text-zinc-500 uppercase tracking-wide">VWAP del día</p>
          <p className="font-mono font-bold text-xs text-amber-400">${fmt(reading.vwap)}</p>
        </div>
      </div>

      <ul className="space-y-1">
        {reading.reasons.map((r, i) => (
          <li key={i} className="text-[11px] text-zinc-300 leading-snug flex gap-1.5">
            <span className="text-zinc-600 shrink-0">•</span>{r}
          </li>
        ))}
      </ul>

      <div className="rounded bg-zinc-950/60 border border-zinc-800/70 p-2.5 text-[11px] text-zinc-300 leading-relaxed">
        <strong className={s.color}>Cómo se opera este día: </strong>{reading.playbook}
      </div>

      <p className="text-[10px] text-zinc-600 leading-snug">
        Método Opening Range / Initial Balance: los primeros 30 minutos marcan el carácter del día.
        Una apertura estrecha seguida de ruptura con cuerpo anticipa tendencia; una apertura ancha anticipa rango;
        rupturas en ambas direcciones = día picador. Recalcula al abrir el panel — no es asesoría financiera.
      </p>
    </div>
  );
}
