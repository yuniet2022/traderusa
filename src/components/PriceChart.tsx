import { useMemo } from 'react';
import type { Candle } from '@/types';
import { sma, bollinger } from '@/lib/indicators';
import { useChartWidth } from '@/hooks/useChartWidth';

interface Props {
  candles: Candle[];
  height?: number;
  adaptiveHeight?: boolean;
}

export function PriceChart({ candles, height = 260, adaptiveHeight = false }: Props) {
  const { containerRef, width } = useChartWidth();
  const W = width, H = adaptiveHeight ? Math.min(480, Math.max(280, width * 0.5)) : height;
  const padL = 8, padR = 76, padT = 10, padB = 22;

  const { paths, min, max, lastClose, up } = useMemo(() => {
    const data = candles.slice(-260);
    const closes = data.map(c => c.close);
    const all = closes.slice(-260);
    const fullCloses = candles.map(c => c.close);
    const s20full = sma(fullCloses, 20).slice(-260);
    const s50full = sma(fullCloses, 50).slice(-260);
    const s200full = sma(fullCloses, 200).slice(-260);
    const bbf = bollinger(fullCloses);
    const bbU = bbf.upper.slice(-260);
    const bbL = bbf.lower.slice(-260);

    const vals: number[] = [...all];
    bbU.forEach(v => v !== null && vals.push(v));
    bbL.forEach(v => v !== null && vals.push(v));
    s200full.forEach(v => v !== null && vals.push(v));
    const mn = Math.min(...vals), mx = Math.max(...vals);
    const span = mx - mn || 1;
    const lo = mn - span * 0.03, hi = mx + span * 0.03;

    const x = (i: number) => padL + (i / (all.length - 1)) * (W - padL - padR);
    const y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);

    const line = (arr: (number | null)[]) => {
      let d = '';
      arr.forEach((v, i) => {
        if (v === null) return;
        d += (d === '' ? 'M' : 'L') + `${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      });
      return d;
    };

    // Zona sombreada entre las bandas de Bollinger (rango "normal" del precio)
    let bandFill = '';
    const firstIdx = bbU.findIndex((v, i) => v !== null && bbL[i] !== null);
    if (firstIdx >= 0) {
      const fwd: string[] = [];
      const bwd: string[] = [];
      for (let i = firstIdx; i < bbU.length; i++) {
        const u = bbU[i], l = bbL[i];
        if (u === null || l === null) continue;
        fwd.push(`${fwd.length === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(u).toFixed(1)}`);
        bwd.unshift(`L${x(i).toFixed(1)},${y(l).toFixed(1)}`);
      }
      bandFill = fwd.join('') + bwd.join('') + 'Z';
    }

    const pricePath = all.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
    const areaPath = pricePath + `L${x(all.length - 1).toFixed(1)},${y(lo)}L${x(0).toFixed(1)},${y(lo)}Z`;

    return {
      paths: {
        price: pricePath, area: areaPath,
        s20: line(s20full), s50: line(s50full), s200: line(s200full),
        bbU: line(bbU), bbL: line(bbL), bandFill,
      },
      min: lo, max: hi,
      lastClose: all[all.length - 1],
      up: all[all.length - 1] >= all[0],
    };
  }, [candles, H, W]);

  const color = up ? '#10b981' : '#ef4444';
  const fmt = (v: number) => v >= 1000 ? v.toLocaleString('es', { maximumFractionDigits: 0 })
    : v >= 1 ? v.toFixed(2) : v.toPrecision(3);

  return (
    <div ref={containerRef} className="min-w-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 pb-1 text-[11px] text-zinc-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded" style={{ background: color }} /> Precio
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded" style={{ background: '#38bdf8' }} /> Media 20 días
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded" style={{ background: '#f59e0b' }} /> Media 50 días
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded" style={{ background: '#ec4899' }} /> Media 200 días
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded border-t border-dashed" style={{ borderColor: '#6366f1', background: 'rgba(99,102,241,0.15)' }} /> Bandas de Bollinger
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" style={{ height: H }} role="img" aria-label="Precio y medias móviles">
        <defs>
          <linearGradient id="pcg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map(f => {
          const yv = padT + f * (H - padT - padB);
          const val = max - f * (max - min);
          return (
            <g key={f}>
              <line x1={padL} x2={W - padR} y1={yv} y2={yv} stroke="#3f3f46" strokeWidth="0.5" strokeDasharray="3 4" />
              <text x={W - padR + 6} y={yv + 3} fill="#71717a" fontSize="10" fontFamily="monospace">{fmt(val)}</text>
            </g>
          );
        })}
        <path d={paths.area} fill="url(#pcg)" />
        {paths.bandFill && <path d={paths.bandFill} fill="#6366f1" fillOpacity="0.07" />}
        <path d={paths.bbU} fill="none" stroke="#6366f1" strokeWidth="1" strokeOpacity="0.6" strokeDasharray="4 3" />
        <path d={paths.bbL} fill="none" stroke="#6366f1" strokeWidth="1" strokeOpacity="0.6" strokeDasharray="4 3" />
        <path d={paths.s200} fill="none" stroke="#ec4899" strokeWidth="1.2" strokeOpacity="0.9" />
        <path d={paths.s50} fill="none" stroke="#f59e0b" strokeWidth="1.2" strokeOpacity="0.9" />
        <path d={paths.s20} fill="none" stroke="#38bdf8" strokeWidth="1.4" strokeOpacity="0.95" />
        <path d={paths.price} fill="none" stroke={color} strokeWidth="1.8" />
        <circle cx={W - padR} cy={padT + (1 - (lastClose - min) / (max - min)) * (H - padT - padB)} r="3" fill={color} />
        <text x={W - padR + 6} y={H - 6} fill={color} fontSize="11" fontWeight="bold" fontFamily="monospace">
          {fmt(lastClose)}
        </text>
      </svg>
      <p className="px-1 pt-1 text-[11px] leading-snug text-zinc-500">
        Cómo leerlo: mientras el precio se mueva dentro de la zona sombreada (bandas de Bollinger), está en su rango
        normal aunque visualmente parezca "arriba". Un pico real es cuando rompe la banda superior con fuerza — ahí
        el sistema veta la compra automáticamente. La línea azul (media de 20 días) es la referencia del veto.
      </p>
    </div>
  );
}
