import type { Candle } from '@/types';
import { atr, ema, macd, rsi } from './indicators';
import { nyMinutesSinceOpen } from './dayType';

export type EvidencePhase = 'early' | 'continuation' | 'exhaustion' | 'weakness' | 'mixed';
export interface ModelEvidence { name: string; direction: 'up' | 'down' | 'mixed'; detail: string }
type Features = {
  price: number; atr: number; support: number; resistance: number; ema20: number;
  rsi: number; rvol: number | null; pressure: number | null;
  trend: number; momentum: number; candle: number; participation: number;
  phase: EvidencePhase; vector: number[];
};
export interface MarketEvidence {
  lastClosedAt: number;
  omittedOpenBars: number;
  closedBars: number;
  phase: EvidencePhase;
  current: Features;
  models: ModelEvidence[];
  analogs: { count: number; up: number; down: number; flat: number; medianReturn: number | null; lowerReturn: number | null; upperReturn: number | null; horizonBars: number };
}

/** Uses closed bars only. Model thresholds are explicit heuristics, not fitted probabilities. */
export function candleClosedAt(candle: Candle, intervalSeconds: number, assetClass: 'stock' | 'crypto'): number {
  if (intervalSeconds === 86400 && assetClass === 'stock') {
    // Stooq dates are UTC midnight; Yahoo bars start at the exchange opening time.
    const base = candle.time + (candle.time % 86400 === 0 ? 12 * 3600 : 0);
    return base * 1000 + (390 - nyMinutesSinceOpen(base)) * 60_000;
  }
  return (candle.time + intervalSeconds) * 1000;
}

export function analyzeMarketEvidence(input: Candle[], intervalSeconds: number, now = Date.now(), assetClass: 'stock' | 'crypto' = 'crypto', horizonBars = 5): MarketEvidence | null {
  if (!(intervalSeconds > 0) || !Number.isInteger(horizonBars) || horizonBars < 1) return null;
  const closedAt = (candle: Candle) => candleClosedAt(candle, intervalSeconds, assetClass);
  const valid = [...new Map(input.filter(c => [c.time, c.open, c.high, c.low, c.close, c.volume].every(Number.isFinite)
    && c.time > 0 && Math.min(c.open, c.high, c.low, c.close) > 0 && c.volume >= 0
    && c.high >= Math.max(c.open, c.close, c.low) && c.low <= Math.min(c.open, c.close, c.high))
    .map(c => [c.time, c])).values()].sort((a, b) => a.time - b.time);
  const candles = valid.filter(c => closedAt(c) <= now);
  if (candles.length < 60) return null;
  const closes = candles.map(c => c.close);
  const e20 = ema(closes, 20), e50 = ema(closes, 50), rs = rsi(closes), hist = macd(closes).hist, volatility = atr(candles);
  function at(i: number): Features {
    const c = candles[i], p = candles[i - 1];
    const norm = volatility[i] && volatility[i]! > 0 ? volatility[i]! : c.close * 0.01;
    const prior = candles.slice(i - 20, i);
    const support = Math.min(...prior.map(b => b.low)), resistance = Math.max(...prior.map(b => b.high));
    const baseVolume = prior.reduce((s, b) => s + b.volume, 0) / prior.length;
    const rvol = baseVolume > 0 ? c.volume / baseVolume : null;
    const recent = candles.slice(i - 4, i + 1);
    const recentVolume = recent.reduce((s, b) => s + b.volume, 0);
    // Close-location value weighted by reported volume. It is NOT executed buy/sell volume.
    const pressure = recentVolume > 0 ? recent.reduce((s, b) => s + (b.high === b.low ? 0 : (2 * b.close - b.high - b.low) / (b.high - b.low)) * b.volume, 0) / recentVolume : null;
    const fast = e20[i]!, slow = e50[i]!;
    const trend = c.close > fast && fast > slow ? 1 : c.close < fast && fast < slow ? -1 : 0;
    const momentum = hist[i]! > hist[i - 2]! && rs[i]! > 50 ? 1 : hist[i]! < hist[i - 2]! && rs[i]! < 50 ? -1 : 0;
    const bullEngulf = c.close > c.open && p.close < p.open && c.close >= p.open && c.open <= p.close;
    const bearEngulf = c.close < c.open && p.close > p.open && c.close <= p.open && c.open >= p.close;
    const range = c.high - c.low;
    const upperWick = range > 0 ? (c.high - Math.max(c.open, c.close)) / range : 0;
    const lowerWick = range > 0 ? (Math.min(c.open, c.close) - c.low) / range : 0;
    const candle = c.close > resistance || bullEngulf || (lowerWick >= 0.5 && c.close > c.open) ? 1
      : c.close < support || bearEngulf || (upperWick >= 0.5 && c.close < c.open) ? -1 : 0;
    const participation = pressure !== null && rvol !== null && rvol >= 1.2 ? pressure >= 0.2 ? 1 : pressure <= -0.2 ? -1 : 0 : 0;
    const up = [trend, momentum, candle, participation].filter(v => v > 0).length;
    const down = [trend, momentum, candle, participation].filter(v => v < 0).length;
    const priorRise = (p.close - candles[i - 20].close) / norm;
    const tired = priorRise >= 1 && hist[i]! < hist[i - 2]! && (bearEngulf || upperWick >= 0.45 || c.close < fast);
    const emerging = (c.close > resistance || (p.close <= e20[i - 1]! && c.close > fast)) && momentum > 0 && (candle > 0 || participation > 0);
    const phase: EvidencePhase = tired ? 'exhaustion' : emerging ? 'early' : trend > 0 && up >= 3 ? 'continuation' : down >= 3 ? 'weakness' : 'mixed';
    return { price: c.close, atr: norm, support, resistance, ema20: fast, rsi: rs[i]!, rvol, pressure,
      trend, momentum, candle, participation, phase,
      vector: [(c.close - fast) / norm / 3, (fast - slow) / norm / 3, (rs[i]! - 50) / 50,
        hist[i]! / norm, Math.log1p(rvol ?? 0) / 2, pressure ?? 0] };
  }
  const currentIndex = candles.length - 1;
  const current = at(currentIndex);
  const candidates: { index: number; distance: number }[] = [];
  // A 20-bar embargo excludes recent outcomes; outcome windows do not overlap each other.
  for (let i = 59; i + horizonBars < currentIndex - 20; i += Math.max(5, horizonBars)) {
    const previous = at(i);
    if (previous.phase !== current.phase || (previous.rvol === null) !== (current.rvol === null)) continue;
    const distance = Math.sqrt(previous.vector.reduce((s, v, k) => s + (v - current.vector[k]) ** 2, 0) / current.vector.length);
    if (distance <= 0.5) candidates.push({ index: i, distance });
  }
  const samples = candidates.sort((a, b) => a.distance - b.distance).slice(0, 20).map(({ index }) => {
    const change = candles[index + horizonBars].close - candles[index].close;
    return { value: change / candles[index].close * 100, direction: change > volatility[index]! * 0.25 ? 'up' : change < -volatility[index]! * 0.25 ? 'down' : 'flat' };
  });
  const values = samples.map(s => s.value).sort((a, b) => a - b);
  const quantile = (q: number) => {
    if (values.length < 8) return null;
    const index = (values.length - 1) * q, lo = Math.floor(index), fraction = index - lo;
    return values[lo] + (values[Math.ceil(index)] - values[lo]) * fraction;
  };
  const direction = (value: number) => value > 0 ? 'up' as const : value < 0 ? 'down' as const : 'mixed' as const;
  return {
    lastClosedAt: closedAt(candles[currentIndex]),
    omittedOpenBars: valid.length - candles.length, closedBars: candles.length, phase: current.phase, current,
    models: [
      { name: 'Estructura y tendencia', direction: direction(current.trend), detail: `Precio ${current.price > current.ema20 ? 'sobre' : 'bajo'} EMA20; comparación de EMA20 y EMA50.` },
      { name: 'Momentum', direction: direction(current.momentum), detail: `RSI ${current.rsi.toFixed(1)}; evolución del histograma MACD durante dos velas.` },
      { name: 'Velas y rupturas', direction: direction(current.candle), detail: 'Cierre frente al rango previo de 20 velas, envolventes y mechas de rechazo.' },
      { name: 'Participación estimada', direction: direction(current.participation), detail: current.rvol === null || current.pressure === null ? 'Volumen insuficiente; no se confirma presión.' : `Volumen relativo ${current.rvol.toFixed(2)}×; proxy de cierre y volumen ${(current.pressure * 100).toFixed(0)} / 100.` },
    ],
    analogs: { count: samples.length, up: samples.filter(s => s.direction === 'up').length,
      down: samples.filter(s => s.direction === 'down').length, flat: samples.filter(s => s.direction === 'flat').length,
      medianReturn: quantile(0.5), lowerReturn: quantile(0.25), upperReturn: quantile(0.75), horizonBars },
  };
}
