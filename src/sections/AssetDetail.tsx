import { useState } from 'react';
import type { AssetAnalysis } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SignalBadge, ScoreBar } from '@/components/SignalBadge';
import { PriceChart } from '@/components/PriceChart';
import { CandleChart } from '@/components/CandleChart';
import { LearnPanel } from '@/components/LearnPanel';
import { DayTypePanel } from '@/components/DayTypePanel';
import { SetupPanel } from '@/components/SetupPanel';
import { RiskCalculator } from '@/components/RiskCalculator';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Briefcase, GraduationCap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  analysis: AssetAnalysis | null;
  onClose: () => void;
  inPortfolio: boolean;
  onTogglePortfolio: (a: AssetAnalysis) => void;
}

const fmt = (v: number) => v >= 1000 ? v.toLocaleString('es', { maximumFractionDigits: 0 })
  : v >= 1 ? v.toFixed(2) : v.toPrecision(4);

function IndicatorRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-zinc-800/50 last:border-0">
      <span className="text-xs text-zinc-400">{label}</span>
      <div className="text-right">
        <span className="text-xs font-mono font-medium">{value}</span>
        {hint && <span className="text-[10px] text-zinc-500 ml-1.5">{hint}</span>}
      </div>
    </div>
  );
}

export function AssetDetail({ analysis: a, onClose, inPortfolio, onTogglePortfolio }: Props) {
  const [chartMode, setChartMode] = useState<'line' | 'candles'>('candles');
  const [learnMode, setLearnMode] = useState(false);
  return (
    <Dialog open={!!a} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-zinc-950 border-zinc-800">
        {a && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3 flex-wrap">
                <span className="text-xl">{a.asset.symbol}</span>
                <span className="text-sm text-zinc-400 font-normal">{a.asset.name}</span>
                <SignalBadge signal={a.signal} />
                <span className="text-xs text-zinc-500 font-normal">
                  Régimen: {a.regime} · datos reales
                </span>
              </DialogTitle>
            </DialogHeader>

            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-bold font-mono">${fmt(a.price)}</span>
              {a.change24h !== null && (
                <span className={cn('font-mono', a.change24h >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                  {a.change24h >= 0 ? '+' : ''}{a.change24h.toFixed(2)}% (24h)
                </span>
              )}
              <span className="ml-auto"><ScoreBar score={a.composite} /></span>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => onTogglePortfolio(a)}
              className={cn(
                'gap-1.5 w-fit',
                inPortfolio
                  ? 'border-emerald-700 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-950/60'
                  : 'border-zinc-700 bg-zinc-900 hover:bg-zinc-800',
              )}>
              <Briefcase size={14} />
              {inPortfolio ? 'En mi portafolio ✓ (clic para quitar)' : 'Tengo esto en Robinhood'}
            </Button>

            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-2">
              <div className="flex items-center gap-1 px-1 pb-2">
                <button onClick={() => setChartMode('candles')}
                  className={cn('px-2.5 py-0.5 rounded text-[11px] font-medium border transition-colors',
                    chartMode === 'candles'
                      ? 'bg-emerald-600 border-emerald-500 text-white'
                      : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-zinc-200')}>
                  Velas
                </button>
                <button onClick={() => setChartMode('line')}
                  className={cn('px-2.5 py-0.5 rounded text-[11px] font-medium border transition-colors',
                    chartMode === 'line'
                      ? 'bg-emerald-600 border-emerald-500 text-white'
                      : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-zinc-200')}>
                  Línea
                </button>
              </div>
              {chartMode === 'candles'
                ? <CandleChart asset={a.asset} />
                : <PriceChart candles={a.candles} />}
            </div>

            <DayTypePanel asset={a.asset} />
            <SetupPanel asset={a.asset} />

            <Button
              variant="outline"
              size="sm"
              onClick={() => setLearnMode(!learnMode)}
              className={cn(
                'gap-1.5 w-fit',
                learnMode
                  ? 'border-indigo-600 bg-indigo-950/50 text-indigo-300 hover:bg-indigo-950/70'
                  : 'border-zinc-700 bg-zinc-900 hover:bg-zinc-800',
              )}>
              <GraduationCap size={14} />
              {learnMode ? 'Ocultar modo aprendizaje' : 'Modo aprendizaje — entiende cada modelo'}
            </Button>

            {learnMode && <LearnPanel analysis={a} />}

            {a.timing.block && (
              <div className="rounded-lg border border-amber-800/60 bg-amber-950/30 p-3 flex gap-2.5">
                <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-200/90 leading-relaxed">
                  <strong className="text-amber-300">COMPRA VETADA — precio extendido.</strong>{' '}
                  {a.timing.note}.
                  {' '}La tendencia es alcista pero entrar aquí es comprar caro.
                  Espera un pullback hacia la SMA20
                  {a.indicators.sma20 > 0 && ` (~$${fmt(a.indicators.sma20)})`} o una consolidación de varios días.
                </div>
              </div>
            )}

            {!a.timing.block && a.composite > 0 && a.timing.factor < 0.8 && (
              <div className="rounded-lg border border-amber-800/60 bg-amber-950/30 p-3 flex gap-2.5">
                <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-200/90 leading-relaxed">
                  <strong className="text-amber-300">La tendencia es buena pero el timing no.</strong>{' '}
                  {a.timing.note}.
                  {' '}Mejor esperar un pullback hacia la SMA20
                  {a.indicators.sma20 > 0 && ` (~$${fmt(a.indicators.sma20)})`} que comprar en la zona alta.
                </div>
              </div>
            )}

            {a.extension > 0 && (
              <div className="rounded-lg border border-amber-800/60 bg-amber-950/30 p-3 flex gap-2.5">
                <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-200/90 leading-relaxed">
                  <strong className="text-amber-300">Precio extendido — compra vetada.</strong>{' '}
                  RSI {a.indicators.rsi14.toFixed(0)} con el precio fuera de las bandas de Bollinger
                  {a.indicators.sma20 > 0 && a.indicators.atr14 > 0 &&
                    `, a ${((a.price - a.indicators.sma20) / a.indicators.atr14).toFixed(1)}×ATR de su SMA20`}.
                  {' '}Entrar en un pico vertical es estadísticamente el peor momento: el sistema bloquea
                  la señal de compra. La jugada correcta es esperar un pullback hacia la SMA20
                  {a.indicators.sma20 > 0 && ` (~$${fmt(a.indicators.sma20)})`} o una consolidación de varios días.
                </div>
              </div>
            )}

            {/* Plan de trading: entrada / salida */}
            <div className={cn(
              'rounded-lg border p-3',
              a.levels.bias === 'LARGO' ? 'border-emerald-900/60 bg-emerald-950/20'
              : a.levels.bias === 'CORTO' ? 'border-red-900/60 bg-red-950/20'
              : 'border-zinc-800 bg-zinc-900/50',
            )}>
              <h4 className="text-sm font-semibold mb-2">
                Plan de trading — {a.levels.bias === 'LARGO' ? 'Sesgo de compra' : a.levels.bias === 'CORTO' ? 'Sesgo de venta / salida' : 'Esperar'}
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                {[
                  { label: 'Entrada', value: a.levels.entry, cls: 'text-zinc-100' },
                  { label: 'Stop-loss', value: a.levels.stop, cls: 'text-red-400' },
                  { label: 'Objetivo 1', value: a.levels.target1, cls: 'text-emerald-400' },
                  { label: 'Objetivo 2', value: a.levels.target2, cls: 'text-emerald-300' },
                ].map(x => (
                  <div key={x.label} className="rounded-md bg-zinc-950/60 border border-zinc-800 px-2.5 py-2">
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wide">{x.label}</p>
                    <p className={cn('font-mono font-bold text-sm', x.cls)}>${fmt(x.value)}</p>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">{a.levels.note}</p>
            </div>

            <RiskCalculator key={`${a.asset.assetClass}:${a.asset.id}`} analysis={a} />

            <div className="grid md:grid-cols-2 gap-4">
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                <h4 className="text-sm font-semibold mb-2">Votos de las 8 estrategias</h4>
                <div className="space-y-2.5">
                  {a.votes.map(v => (
                    <div key={v.strategyId}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium">{v.strategyName}</span>
                        <ScoreBar score={v.score} />
                      </div>
                      <p className="text-[11px] text-zinc-500 mt-0.5">{v.reason}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                <h4 className="text-sm font-semibold mb-2">Indicadores</h4>
                <IndicatorRow label="RSI (14)" value={a.indicators.rsi14.toFixed(1)}
                  hint={a.indicators.rsi14 > 70 ? 'sobrecompra' : a.indicators.rsi14 < 30 ? 'sobreventa' : 'neutro'} />
                <IndicatorRow label="MACD histograma" value={a.indicators.macdHist.toFixed(4)} />
                <IndicatorRow label="SMA 20 / 50 / 200"
                  value={`${fmt(a.indicators.sma20)} / ${fmt(a.indicators.sma50)} / ${fmt(a.indicators.sma200)}`} />
                <IndicatorRow label="Bollinger %B" value={(a.indicators.pctB * 100).toFixed(0) + '%'} />
                <IndicatorRow label="Z-score (20)" value={a.indicators.zscore20.toFixed(2)} />
                <IndicatorRow label="ATR (14)" value={fmt(a.indicators.atr14)} />
                <IndicatorRow label="Fuerza de tendencia (ADX proxy)" value={a.indicators.adxProxy.toFixed(0)} />
                <IndicatorRow label="Timing de entrada"
                  value={a.timing.block ? 'BLOQUEADO' : `${(a.timing.factor * 100).toFixed(0)}%`}
                  hint={a.timing.block ? 'precio extendido' : a.timing.factor >= 0.8 ? 'bueno' : a.timing.factor >= 0.5 ? 'regular' : 'malo'} />
                <IndicatorRow label="Rendimiento 1m / 3m" value={`${a.indicators.ret1m.toFixed(1)}% / ${a.indicators.ret3m.toFixed(1)}%`} />
                <IndicatorRow label="Rendimiento 6m / 12m" value={`${a.indicators.ret6m.toFixed(1)}% / ${a.indicators.ret12m.toFixed(1)}%`} />
                <IndicatorRow label="Distancia a máximo 52 sem." value={a.indicators.distHigh52w.toFixed(1) + '%'} />
                <div className="mt-3 rounded bg-zinc-800/60 p-2.5 text-[11px] text-zinc-400 leading-relaxed">
                  <strong className="text-zinc-200">Cómo se calcula la señal:</strong> cada estrategia vota de -100 a +100.
                  En régimen de tendencia pesan más trend following y momentum (evidencia AQR/Jegadeesh-Titman);
                  en rango pesan más RSI, Bollinger y reversión de corto plazo. La puntuación compuesta se traduce
                  en la señal final. Esto no es asesoría financiera.
                </div>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
