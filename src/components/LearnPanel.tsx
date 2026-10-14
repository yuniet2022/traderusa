import { useMemo } from 'react';
import type { AssetAnalysis, Candle, StrategyVote } from '@/types';
import { rsi, macd, bollinger } from '@/lib/indicators';
import { ScoreBar } from '@/components/SignalBadge';
import { TrendingUp, TrendingDown, Minus, GraduationCap } from 'lucide-react';
import { cn } from '@/lib/utils';

const NB = 120; // barras visibles en los mini-gráficos

/* ---------- Mini gráficos de indicadores ---------- */

function LinePanel({ values, height = 90, color = '#38bdf8', zones, ymin, ymax, fmtY }: {
  values: (number | null)[];
  height?: number;
  color?: string;
  zones?: { y: number; label: string; color: string }[];
  ymin?: number; ymax?: number;
  fmtY?: (v: number) => string;
}) {
  const W = 800, H = height, padR = 34, padT = 4, padB = 4;
  const valid = values.filter(v => v !== null) as number[];
  if (valid.length === 0) return null;
  const lo = ymin ?? Math.min(...valid);
  const hi = ymax ?? Math.max(...valid);
  const span = hi - lo || 1;
  const x = (i: number) => (i / (values.length - 1)) * (W - padR);
  const y = (v: number) => padT + (1 - (v - lo) / span) * (H - padT - padB);
  let d = '';
  values.forEach((v, i) => {
    if (v === null) return;
    d += (d === '' ? 'M' : 'L') + `${x(i).toFixed(1)},${y(v).toFixed(1)}`;
  });
  const lastV = valid[valid.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }}>
      {zones?.map(z => (
        <g key={z.label}>
          <line x1={0} x2={W - padR} y1={y(z.y)} y2={y(z.y)} stroke={z.color} strokeWidth="0.8" strokeDasharray="4 3" strokeOpacity="0.7" />
          <text x={W - padR + 4} y={y(z.y) + 3} fill={z.color} fontSize="9" fontFamily="monospace">{z.label}</text>
        </g>
      ))}
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" />
      <text x={W - padR + 4} y={padT + 10} fill={color} fontSize="10" fontWeight="bold" fontFamily="monospace">
        {fmtY ? fmtY(lastV) : lastV.toFixed(1)}
      </text>
    </svg>
  );
}

function MacdPanel({ candles }: { candles: Candle[] }) {
  const m = useMemo(() => {
    const r = macd(candles.map(c => c.close));
    return {
      line: r.line.slice(-NB), signal: r.signal.slice(-NB), hist: r.hist.slice(-NB),
    };
  }, [candles]);
  const W = 800, H = 100, padR = 40, padT = 6, padB = 6;
  const vals: number[] = [];
  m.line.forEach(v => v !== null && vals.push(v));
  m.signal.forEach(v => v !== null && vals.push(v));
  if (vals.length === 0) return null;
  const mx = Math.max(...vals.map(Math.abs), 1e-9);
  const n = m.hist.length;
  const step = (W - padR) / n;
  const y = (v: number) => padT + (1 - (v + mx) / (2 * mx)) * (H - padT - padB);
  const zero = y(0);
  const line = (arr: (number | null)[]) => {
    let d = '';
    arr.forEach((v, i) => {
      if (v === null) return;
      d += (d === '' ? 'M' : 'L') + `${(i * step + step / 2).toFixed(1)},${y(v).toFixed(1)}`;
    });
    return d;
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
      <line x1={0} x2={W - padR} y1={zero} y2={zero} stroke="#52525b" strokeWidth="0.8" />
      {m.hist.map((v, i) => {
        if (v === null) return null;
        const col = v >= 0 ? '#10b981' : '#ef4444';
        const yv = y(v);
        return <rect key={i} x={i * step} y={Math.min(yv, zero)} width={Math.max(1, step * 0.7)} height={Math.max(0.8, Math.abs(yv - zero))} fill={col} fillOpacity="0.55" />;
      })}
      <path d={line(m.line)} fill="none" stroke="#38bdf8" strokeWidth="1.4" />
      <path d={line(m.signal)} fill="none" stroke="#f59e0b" strokeWidth="1.2" />
      <text x={W - padR + 4} y={padT + 9} fill="#38bdf8" fontSize="9" fontFamily="monospace">MACD</text>
      <text x={W - padR + 4} y={padT + 20} fill="#f59e0b" fontSize="9" fontFamily="monospace">Señal</text>
    </svg>
  );
}

function ReturnsBars({ rets }: { rets: { label: string; v: number }[] }) {
  return (
    <div className="space-y-1.5 py-1">
      {rets.map(r => {
        const w = Math.min(100, Math.abs(r.v));
        return (
          <div key={r.label} className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-500 w-10 shrink-0">{r.label}</span>
            <div className="flex-1 h-3.5 rounded bg-zinc-800/70 overflow-hidden relative">
              <div className={cn('h-full rounded', r.v >= 0 ? 'bg-emerald-500/70' : 'bg-red-500/70')}
                style={{ width: `${Math.max(2, w)}%` }} />
            </div>
            <span className={cn('text-[10px] font-mono w-14 text-right shrink-0', r.v >= 0 ? 'text-emerald-400' : 'text-red-400')}>
              {r.v >= 0 ? '+' : ''}{r.v.toFixed(1)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Contenido educativo por modelo ---------- */

interface Edu {
  queMide: string;
  comoSeLee: string;
  prediccion: (v: StrategyVote) => string;
  chart: 'rsi' | 'macd' | 'bollinger' | 'momentum' | 'sma' | 'high52' | 'reversal';
}

const EDU: Record<string, Edu> = {
  trend: {
    queMide: 'La dirección principal del mercado usando medias móviles de 20, 50 y 200 días. Es el modelo con más evidencia histórica (familia AQR).',
    comoSeLee: 'Precio sobre la media de 200 días = mercado alcista. Media de 50 sobre la de 200 = "cruce dorado" (muy alcista). Debajo de todo = bajista.',
    prediccion: v => v.score > 0
      ? 'Predice que la tendencia seguirá SUBIENDO. Las tendencias fuertes tienden a continuar.'
      : 'Predice que la tendencia principal es BAJISTA. Comprar contra la tendencia principal es estadísticamente mala idea.',
    chart: 'sma',
  },
  tsmom: {
    queMide: 'El rendimiento de los últimos 12 meses. Ganadores recientes tienden a seguir ganando (Moskowitz/Ooi/Pedersen).',
    comoSeLee: 'Rendimiento positivo a 12 meses = voto de compra; negativo = venta. Cuanto más fuerte el año, más fuerte el voto.',
    prediccion: v => v.score > 0
      ? 'Predice continuación alcista a meses: lo que subió durante un año suele seguir subiendo.'
      : 'Predice continuación bajista a meses: lo que lleva un año cayendo suele seguir cayendo.',
    chart: 'momentum',
  },
  csmom: {
    queMide: 'El rendimiento absoluto del propio activo a 3 y 6 meses. No compara ganadores y perdedores de un universo de activos.',
    comoSeLee: 'Promedia ambos rendimientos. Es una regla heurística; no aplica el ranking transversal de Jegadeesh-Titman ni excluye el último mes.',
    prediccion: v => v.score > 0
      ? 'Predice que el impulso de medio plazo favorece SUBIDAS en las próximas semanas.'
      : 'Predice que el impulso de medio plazo favorece BAJADAS en las próximas semanas.',
    chart: 'momentum',
  },
  high52: {
    queMide: 'La proximidad al mayor cierre del historial disponible, hasta 52 semanas. La regla está inspirada en ese concepto y no replica un estudio.',
    comoSeLee: 'La escala heurística asigna +50 en el máximo, 0 a un 20% por debajo y valores negativos a mayor distancia. No es una probabilidad.',
    prediccion: v => v.score > 0
      ? 'Predice fortaleza: estar cerca de máximos anuales anticipa más subidas.'
      : 'Predice debilidad: estar lejos de máximos anuales anticipa estancamiento o caídas.',
    chart: 'high52',
  },
  macd: {
    queMide: 'El cruce de medias exponenciales (12 y 26) suavizado con una señal de 9. Mide cambios de momentum antes que las medias simples.',
    comoSeLee: 'Línea azul sobre la naranja = momentum alcista. Las barras (histograma) muestran la fuerza: verdes crecientes = aceleración alcista.',
    prediccion: v => v.score > 0
      ? 'Predice SUBIDA de corto plazo: el momentum está acelerando al alza.'
      : 'Predice BAJADA de corto plazo: el momentum está acelerando a la baja.',
    chart: 'macd',
  },
  rsi: {
    queMide: 'El RSI (0-100): cuánto ha subido vs. caído el precio en 14 días. Detecta excesos de euforia o pánico.',
    comoSeLee: 'RSI > 70 = sobrecompra (cuidado, puede corregir). RSI < 30 = sobreventa (posible rebote). Entre 40-60 = neutral. En el gráfico, las líneas punteadas marcan esas zonas.',
    prediccion: v => v.score > 0
      ? 'Predice REBOTE: el precio cayó demasiado rápido y tiende a recuperarse.'
      : v.score < 0
        ? 'Predice CORRECCIÓN: el precio subió demasiado rápido y tiende a enfriarse.'
        : 'Sin exceso: el RSI está en zona neutral, no hay ventaja estadística.',
    chart: 'rsi',
  },
  bollinger: {
    queMide: 'Dónde está el precio dentro de sus bandas de volatilidad (20 días, 2 desviaciones). El 95% del tiempo el precio está dentro.',
    comoSeLee: 'Tocar la banda inferior = barato en el rango (posible compra). Tocar la superior = caro (posible venta). En el gráfico, %B=0 es la banda inferior y %B=1 la superior.',
    prediccion: v => v.score > 0
      ? 'Predice REBOTE hacia el centro de las bandas: el precio está anormalmente barato.'
      : v.score < 0
        ? 'Predice RETROCESO hacia el centro de las bandas: el precio está anormalmente caro.'
        : 'Precio en zona normal dentro de las bandas: sin ventaja estadística.',
    chart: 'bollinger',
  },
  reversal: {
    queMide: 'La reversión de corto plazo (1 mes): lo que más subió en el último mes tiende a corregir, y viceversa.',
    comoSeLee: 'Es un voto CONTRARIAN: si el mes fue muy verde, vota venta; si fue muy rojo, vota compra. Corrige los excesos de los modelos de momentum.',
    prediccion: v => v.score > 0
      ? 'Predice REBOTE contrarian: la caída del último mes fue exagerada.'
      : v.score < 0
        ? 'Predice CORRECCIÓN contrarian: la subida del último mes fue exagerada.'
        : 'El movimiento del último mes es normal: sin ventaja contrarian.',
    chart: 'reversal',
  },
};

/* ---------- Tarjeta por modelo ---------- */

function ModelCard({ vote, candles, analysis }: { vote: StrategyVote; candles: Candle[]; analysis: AssetAnalysis }) {
  const edu = EDU[vote.strategyId];
  const chartData = useMemo(() => {
    const closes = candles.map(c => c.close);
    switch (edu.chart) {
      case 'rsi': {
        const r = rsi(closes).slice(-NB);
        return <LinePanel values={r} color="#c084fc" ymin={0} ymax={100}
          zones={[
            { y: 70, label: 'sobrecompra 70', color: '#ef4444' },
            { y: 30, label: 'sobreventa 30', color: '#10b981' },
          ]} />;
      }
      case 'macd':
        return <MacdPanel candles={candles} />;
      case 'bollinger': {
        const bb = bollinger(closes);
        const u = bb.upper.slice(-NB), l = bb.lower.slice(-NB);
        const cl = closes.slice(-NB);
        const pctB = cl.map((c, i) =>
          u[i] !== null && l[i] !== null && (u[i] as number) !== (l[i] as number)
            ? (c - (l[i] as number)) / ((u[i] as number) - (l[i] as number)) : null);
        return <LinePanel values={pctB} color="#818cf8" ymin={-0.2} ymax={1.2}
          fmtY={v => v.toFixed(2)}
          zones={[
            { y: 1, label: 'banda sup. 1.0', color: '#ef4444' },
            { y: 0.5, label: 'media 0.5', color: '#71717a' },
            { y: 0, label: 'banda inf. 0.0', color: '#10b981' },
          ]} />;
      }
      case 'momentum':
        return <ReturnsBars rets={[
          { label: '1 mes', v: analysis.indicators.ret1m },
          { label: '3 mes', v: analysis.indicators.ret3m },
          { label: '6 mes', v: analysis.indicators.ret6m },
          { label: '12 mes', v: analysis.indicators.ret12m },
        ]} />;
      case 'high52':
        return <ReturnsBars rets={[
          { label: 'vs máx', v: analysis.indicators.distHigh52w },
          { label: '12 mes', v: analysis.indicators.ret12m },
        ]} />;
      case 'reversal':
        return <ReturnsBars rets={[{ label: '1 mes', v: analysis.indicators.ret1m }]} />;
      case 'sma':
        return (
          <p className="text-[11px] text-zinc-500 py-1.5">
            Míralo en el gráfico principal: precio vs. medias de 20 (azul), 50 (naranja) y 200 (rosa) días.
            Ahora: precio ${analysis.indicators.lastPrice.toFixed(2)} · SMA200 ${analysis.indicators.sma200 > 0 ? analysis.indicators.sma200.toFixed(2) : '—'}.
          </p>
        );
      default:
        return null;
    }
  }, [edu, candles, analysis]);

  const dir = vote.score > 10 ? 'up' : vote.score < -10 ? 'down' : 'flat';

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <p className="text-sm font-semibold">{vote.strategyName}</p>
          <p className="text-[10px] text-zinc-500 uppercase tracking-wide">{vote.family}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn('flex items-center gap-1 text-[11px] font-semibold',
            dir === 'up' ? 'text-emerald-400' : dir === 'down' ? 'text-red-400' : 'text-zinc-400')}>
            {dir === 'up' ? <TrendingUp size={13} /> : dir === 'down' ? <TrendingDown size={13} /> : <Minus size={13} />}
            {vote.signal}
          </span>
          <ScoreBar score={vote.score} />
        </div>
      </div>

      <div className="rounded bg-zinc-950/60 border border-zinc-800/70 p-2">{chartData}</div>

      <div className="space-y-1.5 text-[11px] leading-relaxed">
        <p><span className="text-indigo-400 font-semibold">¿Qué mide? </span><span className="text-zinc-400">{edu.queMide}</span></p>
        <p><span className="text-indigo-400 font-semibold">¿Cómo se lee? </span><span className="text-zinc-400">{edu.comoSeLee}</span></p>
        <p><span className="text-indigo-400 font-semibold">Qué dice ahora: </span><span className="text-zinc-300">{vote.reason}.</span></p>
        <p><span className="text-amber-400 font-semibold">Predicción del modelo: </span><span className="text-zinc-300">{edu.prediccion(vote)}</span></p>
      </div>
    </div>
  );
}

/* ---------- Panel completo ---------- */

export function LearnPanel({ analysis: a }: { analysis: AssetAnalysis }) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-indigo-900/60 bg-indigo-950/20 p-3 flex gap-2.5">
        <GraduationCap size={16} className="text-indigo-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-indigo-200/90 leading-relaxed">
          <strong>Modo aprendizaje.</strong> Cada tarjeta es un modelo real con evidencia académica.
          Te muestra qué mide, cómo leer su gráfico, qué dice ahora mismo y qué predice.
          La señal final de la app combina los 8 modelos según el régimen del mercado ({a.regime}).
          Ningún modelo acierta siempre — úsalos como votos, no como órdenes.
        </p>
      </div>
      {a.votes.map(v => (
        <ModelCard key={v.strategyId} vote={v} candles={a.candles} analysis={a} />
      ))}
    </div>
  );
}
