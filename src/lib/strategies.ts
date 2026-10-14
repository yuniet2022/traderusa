import type { Candle, IndicatorSnapshot, StrategyVote, SignalDirection } from '@/types';
import {
  sma, ema, rsi, macd, bollinger, atr, adxProxy, pctReturn, zscore, high52w, last,
} from './indicators';

export function buildSnapshot(candles: Candle[], periodsPerYear = 252): IndicatorSnapshot {
  const closes = candles.map(c => c.close);
  const m = macd(closes);
  const bb = bollinger(closes);
  const hi = high52w(closes, periodsPerYear);
  const price = closes[closes.length - 1];
  return {
    rsi14: last(rsi(closes)),
    macdLine: last(m.line),
    macdSignal: last(m.signal),
    macdHist: last(m.hist),
    sma20: last(sma(closes, 20)),
    sma50: last(sma(closes, 50)),
    sma200: last(sma(closes, 200)),
    ema12: last(ema(closes, 12)),
    ema26: last(ema(closes, 26)),
    bbUpper: last(bb.upper),
    bbMid: last(bb.mid),
    bbLower: last(bb.lower),
    pctB: (() => {
      const u = last(bb.upper), l = last(bb.lower);
      return u === l ? 0.5 : (price - l) / (u - l);
    })(),
    atr14: last(atr(candles)),
    zscore20: zscore(closes),
    ret1m: pctReturn(closes, Math.round(periodsPerYear / 12)),
    ret3m: pctReturn(closes, Math.round(periodsPerYear / 4)),
    ret6m: pctReturn(closes, Math.round(periodsPerYear / 2)),
    ret12m: pctReturn(closes, periodsPerYear),
    distHigh52w: (price / hi - 1) * 100,
    adxProxy: adxProxy(candles),
    lastPrice: price,
  };
}

export function signalFromScore(score: number): SignalDirection {
  if (score >= 50) return 'COMPRA FUERTE';
  if (score >= 20) return 'COMPRA';
  if (score <= -50) return 'VENTA FUERTE';
  if (score <= -20) return 'VENTA';
  return 'NEUTRAL';
}

const clamp = (v: number, min = -100, max = 100) => Math.max(min, Math.min(max, v));

/** Each strategy returns a vote -100..+100 with explanation */
export function runStrategies(s: IndicatorSnapshot): StrategyVote[] {
  const votes: StrategyVote[] = [];

  // 1) Trend following: SMA 50/200 + price vs SMA200 + SMA20>50 (AQR time-series momentum family)
  {
    let score = 0;
    const reasons: string[] = [];
    if (s.sma200 > 0) {
      if (s.lastPrice > s.sma200) { score += 35; reasons.push('precio sobre SMA200'); }
      else if (s.lastPrice < s.sma200) { score -= 35; reasons.push('precio bajo SMA200'); }
      if (s.sma50 > s.sma200) { score += 35; reasons.push('cruce dorado (SMA50>SMA200)'); }
      else if (s.sma50 < s.sma200) { score -= 35; reasons.push('cruce de la muerte (SMA50<SMA200)'); }
      if (s.sma20 > s.sma50) { score += 30; reasons.push('SMA20>SMA50'); }
      else if (s.sma20 < s.sma50) { score -= 30; reasons.push('SMA20<SMA50'); }
    } else if (s.sma50 > 0) {
      score = s.lastPrice > s.sma50 ? 40 : s.lastPrice < s.sma50 ? -40 : 0;
      reasons.push(s.lastPrice > s.sma50 ? 'precio sobre SMA50' : s.lastPrice < s.sma50 ? 'precio bajo SMA50' : 'precio en SMA50');
    }
    votes.push({
      strategyId: 'trend', strategyName: 'Trend Following (SMA 20/50/200)', family: 'Tendencia',
      score: clamp(score), signal: signalFromScore(score),
      reason: reasons.join(' · ') || (s.sma50 > 0 ? 'medias y precio sin dirección' : 'datos insuficientes'),
    });
  }

  // 2) Time-series momentum 12m (Moskowitz/Ooi/Pedersen; AQR century of evidence)
  {
    const score = clamp(s.ret12m * 2.2);
    votes.push({
      strategyId: 'tsmom', strategyName: 'Momentum temporal 12 meses', family: 'Momentum',
      score, signal: signalFromScore(score),
      reason: `rendimiento 12m: ${s.ret12m.toFixed(1)}%`,
    });
  }

  // 3) Absolute 3/6-month returns. This does not rank peers or skip the latest month.
  {
    const blended = 0.5 * s.ret3m + 0.5 * s.ret6m;
    const score = clamp(blended * 2.0);
    votes.push({
      strategyId: 'csmom', strategyName: 'Momentum absoluto 3-6 meses', family: 'Momentum',
      score, signal: signalFromScore(score),
      reason: `3m: ${s.ret3m.toFixed(1)}% · 6m: ${s.ret6m.toFixed(1)}%`,
    });
  }

  // 4) 52-week high proximity (George & Hwang)
  {
    // Heuristic: +50 at the high, 0 at 20% below it. Not a calibrated return forecast.
    const score = clamp(50 + s.distHigh52w * 2.5);
    votes.push({
      strategyId: 'high52', strategyName: 'Proximidad a máximo 52 semanas', family: 'Momentum',
      score, signal: signalFromScore(score),
      reason: `${Math.abs(s.distHigh52w).toFixed(1)}% ${s.distHigh52w >= -0.5 ? 'en máximos de 52 semanas' : 'por debajo del máximo de 52 semanas'}`,
    });
  }

  // 5) MACD
  {
    let score = 0;
    const reasons: string[] = [];
    const norm = s.atr14 > 0 ? s.atr14 : Math.abs(s.lastPrice) * 0.02;
    const h = s.macdHist / norm;
    score = clamp(h * 60);
    if (s.macdLine > s.macdSignal) reasons.push('MACD sobre señal'); else reasons.push('MACD bajo señal');
    if (s.macdLine > 0) reasons.push('MACD positivo'); else reasons.push('MACD negativo');
    votes.push({
      strategyId: 'macd', strategyName: 'MACD (12, 26, 9)', family: 'Tendencia',
      score, signal: signalFromScore(score), reason: reasons.join(' · '),
    });
  }

  // 6) Mean reversion: RSI(14) — buy oversold in ranges
  {
    let score = 0;
    let reason = '';
    if (s.rsi14 <= 15) { score = 90; reason = `RSI ${s.rsi14.toFixed(0)}: pánico / sobreventa capitular`; }
    else if (s.rsi14 <= 25) { score = 70; reason = `RSI ${s.rsi14.toFixed(0)}: sobreventa extrema`; }
    else if (s.rsi14 <= 35) { score = 40; reason = `RSI ${s.rsi14.toFixed(0)}: sobreventa`; }
    else if (s.rsi14 >= 85) { score = -90; reason = `RSI ${s.rsi14.toFixed(0)}: pico vertical, riesgo de caída inmediata`; }
    else if (s.rsi14 >= 75) { score = -70; reason = `RSI ${s.rsi14.toFixed(0)}: sobrecompra extrema`; }
    else if (s.rsi14 >= 65) { score = -40; reason = `RSI ${s.rsi14.toFixed(0)}: sobrecompra`; }
    else { score = (50 - s.rsi14) * 0.6; reason = `RSI ${s.rsi14.toFixed(0)}: zona neutra`; }
    votes.push({
      strategyId: 'rsi', strategyName: 'Reversión a la media (RSI 14)', family: 'Reversión a la media',
      score: clamp(score), signal: signalFromScore(score), reason,
    });
  }

  // 7) Bollinger %B + z-score
  {
    let score = 0;
    const reasons: string[] = [];
    if (s.pctB <= 0) { score = 60; reasons.push('precio bajo banda inferior'); }
    else if (s.pctB < 0.2) { score = 30; reasons.push('cerca de banda inferior'); }
    else if (s.pctB >= 1) { score = -60; reasons.push('precio sobre banda superior'); }
    else if (s.pctB > 0.8) { score = -30; reasons.push('cerca de banda superior'); }
    else reasons.push('dentro de las bandas');
    score = clamp(score - s.zscore20 * 15);
    reasons.push(`z-score ${s.zscore20.toFixed(2)}`);
    votes.push({
      strategyId: 'bollinger', strategyName: 'Bollinger + Z-score (20, 2σ)', family: 'Volatilidad',
      score, signal: signalFromScore(score), reason: reasons.join(' · '),
    });
  }

  // 8) Short-term reversal (1m contrarian, Jegadeesh 1990 / Lehmann 1990)
  {
    const score = clamp(-s.ret1m * 2.5);
    votes.push({
      strategyId: 'reversal', strategyName: 'Reversión de corto plazo (1 mes)', family: 'Reversión a la media',
      score, signal: signalFromScore(score),
      reason: `rendimiento 1m: ${s.ret1m.toFixed(1)}% (señal contraria)`,
    });
  }

  return votes;
}

/** Regime: strong trend -> weight trend/momentum more; range -> weight mean reversion more */
export function detectRegime(s: IndicatorSnapshot): 'Tendencia' | 'Rango' | 'Mixto' {
  if (s.adxProxy >= 30) return 'Tendencia';
  if (s.adxProxy <= 18) return 'Rango';
  return 'Mixto';
}

/**
 * Regla de veto anti-pico: detecta movimientos verticales extendidos.
 * 0 = normal · 1 = extendido (nunca COMPRA FUERTE) · 2 = pico extremo (bloquea la compra por completo)
 * Un activo con RSI≥80, precio fuera de las bandas de Bollinger y a 3+ ATR de su SMA20
 * activa un filtro heurístico de extensión, aunque la tendencia sea alcista.
 */
export function detectExtension(s: IndicatorSnapshot): 0 | 1 | 2 {
  const norm = s.atr14 > 0 ? s.atr14 : Math.abs(s.lastPrice) * 0.02;
  const farFromMean = s.sma20 > 0 ? (s.lastPrice - s.sma20) / norm : 0;
  if (s.rsi14 >= 80 && s.pctB >= 1 && farFromMean >= 3) return 2;
  if (s.rsi14 >= 75 && s.pctB >= 0.95) return 1;
  return 0;
}

/**
 * Timing de entrada (0 a 1): penaliza comprar caro dentro del rango reciente.
 * Mide dónde está el precio en el rango de las últimas ~3 semanas (Bollinger %B + distancia a SMA20).
 * 1.0 = buen punto de entrada (cerca de soporte/SMA20) · 0.0 = persiguiendo el precio arriba
 */
export function entryTiming(s: IndicatorSnapshot): { factor: number; note: string; block: boolean } {
  const norm = s.atr14 > 0 ? s.atr14 : Math.abs(s.lastPrice) * 0.02;
  const distToSma20 = s.sma20 > 0 ? (s.lastPrice - s.sma20) / norm : 0;

  let factor = 1;
  const reasons: string[] = [];

  // REGLA DURA: si el precio está claramente extendido, NO es compra, es ESPERAR
  const extended =
    (s.pctB > 0.85) ||                          // en el techo de Bollinger
    (distToSma20 > 2.0) ||                      // más de 2 ATR sobre la SMA20
    (s.rsi14 > 68) ||                           // RSI en sobrecompra
    (s.pctB > 0.7 && distToSma20 > 1.2);        // combinación zona alta + alejado

  if (s.pctB > 0.9) { factor -= 0.5; reasons.push('precio en el techo de las bandas de Bollinger'); }
  else if (s.pctB > 0.75) { factor -= 0.3; reasons.push('precio en zona alta del rango reciente'); }
  else if (s.pctB > 0.6) { factor -= 0.15; reasons.push('precio por encima de la media'); }
  else if (s.pctB < 0.3) { reasons.push('precio cerca de soporte — buen timing'); }

  if (distToSma20 > 2.5) { factor -= 0.3; reasons.push(`a ${distToSma20.toFixed(1)}×ATR sobre la SMA20 (muy extendido)`); }
  else if (distToSma20 > 1.5) { factor -= 0.15; reasons.push(`a ${distToSma20.toFixed(1)}×ATR sobre la SMA20`); }
  else if (distToSma20 < -0.5) { reasons.push('bajo la SMA20 — posible pullback de entrada'); }

  if (s.rsi14 > 70) { factor -= 0.2; reasons.push(`RSI ${s.rsi14.toFixed(0)} en sobrecompra`); }

  factor = Math.max(0.2, Math.min(1, factor));
  const note = reasons.length > 0 ? reasons.join(' · ') : 'timing neutral';
  return { factor, note, block: extended };
}

export function compositeScore(votes: StrategyVote[], regime: 'Tendencia' | 'Rango' | 'Mixto'): number {
  const weights: Record<string, number> = {
    trend: 1.4, tsmom: 1.3, csmom: 1.2, high52: 0.9, macd: 1.1, rsi: 0.8, bollinger: 0.7, reversal: 0.5,
  };
  if (regime === 'Tendencia') {
    weights.rsi *= 0.5; weights.bollinger *= 0.5; weights.reversal *= 0.4;
    weights.trend *= 1.2; weights.tsmom *= 1.2;
  } else if (regime === 'Rango') {
    weights.rsi *= 1.6; weights.bollinger *= 1.5; weights.reversal *= 1.4;
    weights.trend *= 0.7; weights.tsmom *= 0.8;
  }
  let sum = 0, wsum = 0;
  for (const v of votes) {
    const w = weights[v.strategyId] ?? 1;
    sum += v.score * w;
    wsum += w;
  }
  return wsum === 0 ? 0 : clamp(sum / wsum);
}
