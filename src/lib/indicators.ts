import type { Candle } from '@/types';

export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  const k = 2 / (period + 1);
  let prev: number | null = null;
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) continue;
    if (prev === null) {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += values[j];
      prev = sum / period;
    } else {
      prev = values[i] * k + prev * (1 - k);
    }
    out[i] = prev;
  }
  return out;
}

export function rsi(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gain += d; else loss -= d;
  }
  let avgGain = gain / period, avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export function macd(closes: number[], fast = 12, slow = 26, signalP = 9) {
  const ef = ema(closes, fast);
  const es = ema(closes, slow);
  const line: (number | null)[] = closes.map((_, i) =>
    ef[i] !== null && es[i] !== null ? (ef[i] as number) - (es[i] as number) : null
  );
  const lineVals = line.map(v => (v === null ? 0 : v));
  const sigRaw = ema(lineVals, signalP);
  const signal: (number | null)[] = sigRaw.map((v, i) => (line[i] === null || i < slow + signalP - 2 ? null : v));
  const hist: (number | null)[] = line.map((v, i) =>
    v !== null && signal[i] !== null ? v - (signal[i] as number) : null
  );
  return { line, signal, hist };
}

export function bollinger(closes: number[], period = 20, mult = 2) {
  const mid = sma(closes, period);
  const upper: (number | null)[] = new Array(closes.length).fill(null);
  const lower: (number | null)[] = new Array(closes.length).fill(null);
  for (let i = period - 1; i < closes.length; i++) {
    let sum = 0;
    const m = mid[i] as number;
    for (let j = i - period + 1; j <= i; j++) sum += (closes[j] - m) ** 2;
    const sd = Math.sqrt(sum / period);
    upper[i] = m + mult * sd;
    lower[i] = m - mult * sd;
  }
  return { mid, upper, lower };
}

export function atr(candles: Candle[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(candles.length).fill(null);
  if (candles.length <= period) return out;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i], p = candles[i - 1];
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
  }
  let sum = 0;
  for (let i = 0; i < period; i++) sum += trs[i];
  out[period] = sum / period;
  for (let i = period + 1; i < candles.length; i++) {
    out[i] = ((out[i - 1] as number) * (period - 1) + trs[i - 1]) / period;
  }
  return out;
}

/** ADX-like trend strength proxy from directional movement, 0-100 */
export function adxProxy(candles: Candle[], period = 14): number {
  const n = candles.length;
  if (n <= period * 2) return 25;
  let pdm = 0, ndm = 0, trSum = 0;
  const start = n - period;
  for (let i = start; i < n; i++) {
    const c = candles[i], p = candles[i - 1];
    const up = c.high - p.high;
    const down = p.low - c.low;
    pdm += up > down && up > 0 ? up : 0;
    ndm += down > up && down > 0 ? down : 0;
    trSum += Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
  }
  if (trSum === 0) return 0;
  const pdi = (pdm / trSum) * 100;
  const ndi = (ndm / trSum) * 100;
  if (pdi + ndi === 0) return 0;
  return (Math.abs(pdi - ndi) / (pdi + ndi)) * 100;
}

export function pctReturn(closes: number[], lookback: number): number {
  const n = closes.length;
  if (n <= lookback) return 0;
  return (closes[n - 1] / closes[n - 1 - lookback] - 1) * 100;
}

export function zscore(closes: number[], period = 20): number {
  const n = closes.length;
  if (n < period) return 0;
  const slice = closes.slice(n - period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const sd = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period);
  return sd === 0 ? 0 : (closes[n - 1] - mean) / sd;
}

export function high52w(closes: number[]): number {
  const n = closes.length;
  const slice = closes.slice(Math.max(0, n - 252));
  return Math.max(...slice);
}

export const last = (arr: (number | null)[]): number => {
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i] !== null) return arr[i] as number;
  return 0;
};
