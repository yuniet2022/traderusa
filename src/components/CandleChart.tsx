import { useMemo } from 'react';
import type { Asset, Candle } from '@/types';
import { sma, bollinger } from '@/lib/indicators';
import { loadTimeframeCandles, TIMEFRAMES, type Timeframe } from '@/lib/data';
import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  asset: Asset;
  height?: number;
}

const fmt = (v: number) => v >= 1000 ? v.toLocaleString('es', { maximumFractionDigits: 0 })
  : v >= 1 ? v.toFixed(2) : v.toPrecision(3);

const MAX_BARS = 140;

function fmtTime(t: number, tf: Timeframe): string {
  const d = new Date(t * 1000);
  if (tf === '1d' || tf === '1wk') return d.toLocaleDateString('es', { day: 'numeric', month: 'short' });
  return d.toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function CandleChart({ asset, height = 300 }: Props) {
  const [tf, setTf] = useState<Timeframe>('1d');
  const [candles, setCandles] = useState<Candle[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (t: Timeframe) => {
    setLoading(true); setError(null);
    try {
      const c = await loadTimeframeCandles(asset, t);
      setCandles(c);
    } catch {
      setCandles(null);
      setError('Sin datos reales en esta temporalidad para este activo.');
    } finally { setLoading(false); }
  }, [asset.id, asset.assetClass]);

  useEffect(() => { load(tf); }, [tf, load]);

  const W = 800, H = height, padL = 4, padR = 56, padT = 8;
  const volH = 34, padB = 18;
  const priceH = H - padT - padB - volH - 6;

  const view = useMemo(() => {
    if (!candles || candles.length === 0) return null;
    const data = candles.slice(-MAX_BARS);
    const s20 = sma(candles.map(c => c.close), 20).slice(-MAX_BARS);
    const s50 = sma(candles.map(c => c.close), 50).slice(-MAX_BARS);
    const bb = bollinger(candles.map(c => c.close));
    const bbU = bb.upper.slice(-MAX_BARS);
    const bbL = bb.lower.slice(-MAX_BARS);

    const vals: number[] = [];
    data.forEach(c => { vals.push(c.high, c.low); });
    bbU.forEach(v => v !== null && vals.push(v));
    bbL.forEach(v => v !== null && vals.push(v));
    const mn = Math.min(...vals), mx = Math.max(...vals);
    const span = mx - mn || Math.abs(mx) * 0.01 || 1;
    const lo = mn - span * 0.02, hi = mx + span * 0.02;
    const maxVol = Math.max(...data.map(c => c.volume), 1);

    const n = data.length;
    const step = (W - padL - padR) / n;
    const bodyW = Math.max(1, Math.min(9, step * 0.65));
    const x = (i: number) => padL + i * step + step / 2;
    const y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * priceH;

    const line = (arr: (number | null)[]) => {
      let d = '';
      arr.forEach((v, i) => {
        if (v === null) return;
        d += (d === '' ? 'M' : 'L') + `${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      });
      return d;
    };

    let bandFill = '';
    const firstIdx = bbU.findIndex((v, i) => v !== null && bbL[i] !== null);
    if (firstIdx >= 0) {
      const fwd: string[] = [], bwd: string[] = [];
      for (let i = firstIdx; i < n; i++) {
        const u = bbU[i], l = bbL[i];
        if (u === null || l === null) continue;
        fwd.push(`${fwd.length === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(u).toFixed(1)}`);
        bwd.unshift(`L${x(i).toFixed(1)},${y(l).toFixed(1)}`);
      }
      bandFill = fwd.join('') + bwd.join('') + 'Z';
    }

    const last = data[n - 1];
    return { data, x, y, lo, hi, step, bodyW, maxVol, s20: line(s20), s50: line(s50), bandFill, bbU: line(bbU), bbL: line(bbL), last };
  }, [candles, H]);

  return (
    <div>
      {/* Selector de temporalidad */}
      <div className="flex items-center gap-1 px-1 pb-2 flex-wrap">
        {TIMEFRAMES.map(t => (
          <button key={t.id} onClick={() => setTf(t.id)}
            className={cn(
              'px-2 py-0.5 rounded text-[11px] font-medium transition-colors border',
              tf === t.id
                ? 'bg-indigo-600 border-indigo-500 text-white'
                : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500',
            )}>
            {t.label}
          </button>
        ))}
        {loading && <Loader2 size={13} className="text-zinc-500 animate-spin ml-2" />}
        <span className="ml-auto text-[10px] text-zinc-600">
          {view ? `${fmtTime(view.data[0].time, tf)} → ${fmtTime(view.last.time, tf)}` : ''}
        </span>
      </div>

      {error && (
        <p className="text-xs text-red-400 px-1 py-6 text-center">{error}</p>
      )}

      {!error && !view && loading && (
        <div className="flex items-center justify-center text-zinc-600 text-xs" style={{ height }}>Cargando velas reales…</div>
      )}

      {view && (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }}>
          {/* rejilla horizontal */}
          {[0.25, 0.5, 0.75].map(f => {
            const yv = padT + f * priceH;
            const val = view.hi - f * (view.hi - view.lo);
            return (
              <g key={f}>
                <line x1={padL} x2={W - padR} y1={yv} y2={yv} stroke="#3f3f46" strokeWidth="0.5" strokeDasharray="3 4" />
                <text x={W - padR + 6} y={yv + 3} fill="#71717a" fontSize="10" fontFamily="monospace">{fmt(val)}</text>
              </g>
            );
          })}
          {/* zona Bollinger */}
          {view.bandFill && <path d={view.bandFill} fill="#6366f1" fillOpacity="0.07" />}
          <path d={view.bbU} fill="none" stroke="#6366f1" strokeWidth="0.8" strokeOpacity="0.5" strokeDasharray="4 3" />
          <path d={view.bbL} fill="none" stroke="#6366f1" strokeWidth="0.8" strokeOpacity="0.5" strokeDasharray="4 3" />
          {/* velas */}
          {view.data.map((c, i) => {
            const up = c.close >= c.open;
            const col = up ? '#10b981' : '#ef4444';
            const cx = view.x(i);
            const yO = view.y(c.open), yC = view.y(c.close);
            const top = Math.min(yO, yC);
            const bh = Math.max(1, Math.abs(yC - yO));
            const vy = padT + priceH + 6;
            const vh = (c.volume / view.maxVol) * volH;
            return (
              <g key={i}>
                <line x1={cx} x2={cx} y1={view.y(c.high)} y2={view.y(c.low)} stroke={col} strokeWidth="1" />
                <rect x={cx - view.bodyW / 2} y={top} width={view.bodyW} height={bh} fill={col} />
                <rect x={cx - view.bodyW / 2} y={vy + (volH - vh)} width={view.bodyW} height={vh}
                  fill={col} fillOpacity="0.35" />
              </g>
            );
          })}
          {/* medias */}
          <path d={view.s50} fill="none" stroke="#f59e0b" strokeWidth="1.1" strokeOpacity="0.9" />
          <path d={view.s20} fill="none" stroke="#38bdf8" strokeWidth="1.3" strokeOpacity="0.95" />
          {/* precio actual */}
          <text x={W - padR + 6} y={padT + 10} fill={view.last.close >= view.last.open ? '#10b981' : '#ef4444'}
            fontSize="11" fontWeight="bold" fontFamily="monospace">{fmt(view.last.close)}</text>
        </svg>
      )}

      {view && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 pt-1 text-[10px] text-zinc-500">
          <span><span className="inline-block w-2.5 h-2.5 rounded-sm align-middle mr-1" style={{ background: '#10b981' }} />Vela alcista</span>
          <span><span className="inline-block w-2.5 h-2.5 rounded-sm align-middle mr-1" style={{ background: '#ef4444' }} />Vela bajista</span>
          <span><span className="inline-block w-3 h-0.5 align-middle mr-1" style={{ background: '#38bdf8' }} />Media 20</span>
          <span><span className="inline-block w-3 h-0.5 align-middle mr-1" style={{ background: '#f59e0b' }} />Media 50</span>
          <span><span className="inline-block w-3 h-0.5 align-middle mr-1 border-t border-dashed" style={{ borderColor: '#6366f1' }} />Bollinger</span>
          <span className="text-zinc-600">· barras inferiores = volumen</span>
        </div>
      )}
    </div>
  );
}
