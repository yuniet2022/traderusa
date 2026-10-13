import type { Candle } from '@/types';

export type DayType = 'TENDENCIA' | 'RANGO' | 'CHOPPY' | 'INDEFINIDO';

export interface DayTypeReading {
  type: DayType;
  /** 0-100 confianza de la clasificación */
  confidence: number;
  direction: 'ALCISTA' | 'BAJISTA' | null;
  /** Niveles del Opening Range (primeros 30 min) */
  orHigh: number;
  orLow: number;
  orPctAtr: number;        // tamaño del OR como % del ATR diario
  breaks: number;          // rupturas con cuerpo del OR
  reEntries: number;       // reingresos tras romper (señal choppy)
  vwapCrosses: number;     // cruces del VWAP (zigzag = choppy)
  vwap: number;
  minutesElapsed: number;  // minutos de mercado transcurridos
  reasons: string[];
  playbook: string;        // qué hacer según el tipo de día
}

/** Alinea una vela al día de mercado de Nueva York (clave YYYY-MM-DD en ET). */
export function nyDayKey(unixSec: number): string {
  const d = new Date(unixSec * 1000);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}
export function nyMinutesSinceOpen(unixSec: number): number {
  const d = new Date(unixSec * 1000);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', hour12: false,
  }).formatToParts(d);
  const h = Number(parts.find(p => p.type === 'hour')?.value ?? 0);
  const m = Number(parts.find(p => p.type === 'minute')?.value ?? 0);
  return (h - 9) * 60 + (m - 30); // 9:30 ET = 0
}

/** ATR diario simple desde velas diarias (últimos 14 días). */
function dailyAtr(daily: Candle[]): number {
  const n = daily.length;
  if (n < 2) return 0;
  const trs: number[] = [];
  for (let i = Math.max(1, n - 14); i < n; i++) {
    const c = daily[i], p = daily[i - 1];
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
  }
  return trs.reduce((a, b) => a + b, 0) / trs.length;
}

/**
 * Clasifica el tipo de día usando los primeros 30 minutos (Opening Range)
 * y lo que ha pasado desde entonces. Funciona con velas de 1m o 5m del día actual.
 *
 * Reglas (metodología Opening Range / Initial Balance):
 * - OR estrecho (<25% ATR) + ruptura con cuerpo que no reingresa = TENDENCIA
 * - OR ancho (>60% ATR) sin ruptura = RANGO (operar extremos)
 * - Rupturas en ambas direcciones o reingresos repetidos o VWAP en zigzag = CHOPPY (no operar)
 */
export function classifyDay(intraday: Candle[], daily: Candle[]): DayTypeReading | null {
  if (intraday.length < 3) return null;
  const todayKey = nyDayKey(intraday[intraday.length - 1].time);
  const today = intraday.filter(c => nyDayKey(c.time) === todayKey);
  if (today.length < 2) return null;

  const atr = dailyAtr(daily);
  const price = today[today.length - 1].close;

  // Opening Range = primeros 30 min de mercado
  const orCandles = today.filter(c => {
    const mins = nyMinutesSinceOpen(c.time);
    return mins >= 0 && mins < 30;
  });
  const opening = orCandles.length >= 2 ? orCandles : today.slice(0, Math.min(6, today.length));
  const orHigh = Math.max(...opening.map(c => c.high));
  const orLow = Math.min(...opening.map(c => c.low));
  const orSize = orHigh - orLow;
  const orPctAtr = atr > 0 ? (orSize / atr) * 100 : 0;

  // VWAP del día
  let pv = 0, vv = 0;
  for (const c of today) {
    const tp = (c.high + c.low + c.close) / 3;
    pv += tp * c.volume; vv += c.volume;
  }
  const vwap = vv > 0 ? pv / vv : price;

  // Lo ocurrido después del OR
  const after = today.slice(opening.length);
  let breaksUp = 0, breaksDown = 0, reEntries = 0;
  let outUp = false, outDown = false;
  for (const c of after) {
    const wasOut = outUp || outDown;
    const brokeUp = c.close > orHigh;
    const brokeDown = c.close < orLow;
    if (brokeUp && !outUp) breaksUp++;
    if (brokeDown && !outDown) breaksDown++;
    if (wasOut && c.close > orLow && c.close < orHigh) reEntries++;
    outUp = brokeUp; outDown = brokeDown;
  }
  const breaks = breaksUp + breaksDown;

  // Cruces del VWAP (zigzag)
  let vwapCrosses = 0;
  for (let i = 1; i < today.length; i++) {
    const a = today[i - 1].close - vwap, b = today[i].close - vwap;
    if ((a > 0 && b < 0) || (a < 0 && b > 0)) vwapCrosses++;
  }

  const minutesElapsed = Math.max(0, nyMinutesSinceOpen(today[today.length - 1].time));
  const reasons: string[] = [];
  let type: DayType = 'INDEFINIDO';
  let confidence = 50;
  let direction: 'ALCISTA' | 'BAJISTA' | null = null;

  const narrow = orPctAtr < 25;
  const wide = orPctAtr > 60;
  const choppyScore = reEntries + (breaksUp > 0 && breaksDown > 0 ? 2 : 0) + (vwapCrosses >= 6 ? 1 : 0);

  if (choppyScore >= 2) {
    type = 'CHOPPY';
    confidence = Math.min(85, 55 + choppyScore * 10);
    if (breaksUp > 0 && breaksDown > 0) reasons.push('rompió el rango de apertura por arriba Y por abajo — sin dirección');
    if (reEntries > 0) reasons.push(`${reEntries} ruptura(s) fallidas que volvieron al rango`);
    if (vwapCrosses >= 6) reasons.push(`precio cruzando el VWAP en zigzag (${vwapCrosses} veces)`);
  } else if ((outUp || outDown) && reEntries === 0) {
    type = 'TENDENCIA';
    direction = outUp ? 'ALCISTA' : 'BAJISTA';
    confidence = narrow ? 80 : 65;
    if (narrow) reasons.push(`apertura estrecha (${orPctAtr.toFixed(0)}% del ATR) — combustible para movimiento fuerte`);
    reasons.push(outUp ? 'ruptura del rango de apertura al ALZA con cuerpo, sin reingresar' : 'ruptura del rango de apertura a la BAJA con cuerpo, sin reingresar');
    if ((outUp && price > vwap) || (outDown && price < vwap)) {
      reasons.push('VWAP confirma la dirección');
      confidence += 10;
    }
    confidence = Math.min(90, confidence);
  } else if (wide) {
    type = 'RANGO';
    confidence = 70;
    reasons.push(`rango de apertura muy ancho (${orPctAtr.toFixed(0)}% del ATR) — el movimiento del día ya se hizo en la apertura`);
    reasons.push('el precio oscila dentro del rango sin romperlo');
  } else if (minutesElapsed < 30) {
    type = 'INDEFINIDO';
    confidence = 40;
    reasons.push('aún estamos dentro de los primeros 30 minutos — el Opening Range no está completo');
    if (narrow) reasons.push('de momento la apertura es estrecha: vigila la primera ruptura con cuerpo');
  } else {
    type = 'RANGO';
    confidence = 55;
    reasons.push('sin ruptura del Opening Range después de la apertura');
    if (narrow) reasons.push(`apertura estrecha (${orPctAtr.toFixed(0)}% del ATR) — cuidado, una ruptura tardía puede convertirlo en día de tendencia`);
  }

  const playbook =
    type === 'TENDENCIA'
      ? `Día de tendencia ${direction === 'ALCISTA' ? 'alcista' : 'bajista'}: los retrocesos hacia el VWAP o hacia el extremo roto del Opening Range suelen ser oportunidades en la dirección de la ruptura. No operes en contra. Stop lógico: el lado opuesto del Opening Range.`
      : type === 'RANGO'
        ? 'Día de rango: compra cerca del mínimo del Opening Range y vende cerca del máximo (mean reversion). No persigas rupturas — en días de rango la mayoría fallan.'
        : type === 'CHOPPY'
          ? 'Día picador (choppy): el peor escenario para operar. Rupturas falsas en ambas direcciones. Lo estadísticamente correcto es NO operar o reducir mucho el tamaño.'
          : 'Espera a que se complete el Opening Range (30 min) y observa la primera ruptura con cuerpo (cierre fuera, no solo mecha).';

  return {
    type, confidence, direction, orHigh, orLow, orPctAtr,
    breaks, reEntries, vwapCrosses, vwap, minutesElapsed, reasons, playbook,
  };
}
