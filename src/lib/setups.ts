import type { Candle } from '@/types';
import { nyDayKey, nyMinutesSinceOpen } from './dayType';

export type SetupId = 'pdh_pdl' | 'sweep' | 'vwap' | 'breakout_retest' | 'orb' | 'pullback';

export interface Setup {
  id: SetupId;
  name: string;
  /** 'long' | 'short' | null si el setup está activo y en qué dirección */
  direction: 'long' | 'short' | null;
  detail: string;
}

export interface ConfluencePlan {
  direction: 'LARGO' | 'CORTO' | 'ESPERAR';
  score: number;          // nº de setups alineados (0-6)
  maxScore: number;
  setups: Setup[];
  entry: number | null;
  stop: number | null;
  target1: number | null;
  target2: number | null;
  note: string;
  levels: { pdh: number; pdl: number; orHigh: number; orLow: number; vwap: number };
}

function vwapOf(candles: Candle[]): number {
  let pv = 0, vv = 0;
  for (const c of candles) {
    const tp = (c.high + c.low + c.close) / 3;
    pv += tp * c.volume; vv += c.volume;
  }
  return vv > 0 ? pv / vv : candles[candles.length - 1].close;
}

/**
 * Detector de confluencia intradía: combina PDH/PDL, Liquidity Sweep, VWAP,
 * Breakout/Retest, ORB y Trend/Pullback en una única lectura.
 * Solo propone entrada cuando 3+ setups apuntan en la misma dirección.
 */
export function detectSetups(intraday: Candle[], daily: Candle[]): ConfluencePlan | null {
  if (intraday.length < 5 || daily.length < 3) return null;

  const todayKey = nyDayKey(intraday[intraday.length - 1].time);
  const today = intraday.filter(c => nyDayKey(c.time) === todayKey);
  if (today.length < 4) return null;

  const price = today[today.length - 1].close;

  // Niveles: día previo y opening range (30 min)
  const prevDay = daily[daily.length - 2] ?? daily[daily.length - 1];
  const pdh = prevDay.high, pdl = prevDay.low;
  const opening = today.filter(c => {
    const m = nyMinutesSinceOpen(c.time);
    return m >= 0 && m < 30;
  });
  const or = opening.length >= 2 ? opening : today.slice(0, Math.min(6, today.length));
  const orHigh = Math.max(...or.map(c => c.high));
  const orLow = Math.min(...or.map(c => c.low));
  const orSize = orHigh - orLow || price * 0.005;
  const vwap = vwapOf(today);
  const after = today.slice(or.length);
  const minutes = Math.max(0, nyMinutesSinceOpen(today[today.length - 1].time));

  const setups: Setup[] = [];

  // 1) PDH/PDL — posición del precio vs niveles del día anterior
  {
    let direction: 'long' | 'short' | null = null;
    let detail = `precio entre PDL ($${pdl.toFixed(2)}) y PDH ($${pdh.toFixed(2)}) — dentro del rango de ayer`;
    if (price > pdh) { direction = 'long'; detail = `precio sobre el máximo de ayer ($${pdh.toFixed(2)}) — fortaleza, los compradores controlan`; }
    else if (price < pdl) { direction = 'short'; detail = `precio bajo el mínimo de ayer ($${pdl.toFixed(2)}) — debilidad, los vendedores controlan`; }
    setups.push({ id: 'pdh_pdl', name: 'PDH / PDL (máx-mín ayer)', direction, detail });
  }

  // 2) Liquidity Sweep — barrida de un nivel (PDH/PDL u OR) que falla y cierra de vuelta
  {
    let direction: 'long' | 'short' | null = null;
    let detail = 'sin barridas de liquidez recientes';
    const levels: { name: string; hi?: number; lo?: number }[] = [
      { name: 'máximo de ayer', hi: pdh }, { name: 'mínimo de ayer', lo: pdl },
      { name: 'máximo del OR', hi: orHigh }, { name: 'mínimo del OR', lo: orLow },
    ];
    for (let i = Math.max(1, today.length - 12); i < today.length; i++) {
      const c = today[i];
      for (const lv of levels) {
        // sweep alcista de stops bajistas: mecha sobre el nivel pero cierre debajo → señal SHORT
        if (lv.hi !== undefined && c.high > lv.hi && c.close < lv.hi && i >= today.length - 3) {
          direction = 'short';
          detail = `barrida del ${lv.name} ($${lv.hi.toFixed(2)}): rompió con mecha y cerró debajo — stops cazados, posible giro a la baja`;
        }
        // sweep bajista de stops alcistas: mecha bajo el nivel pero cierre encima → señal LONG
        if (lv.lo !== undefined && c.low < lv.lo && c.close > lv.lo && i >= today.length - 3) {
          direction = 'long';
          detail = `barrida del ${lv.lo !== undefined ? 'mínimo' : ''} (${lv.lo.toFixed(2)}): rompió con mecha y cerró encima — stops cazados, posible giro al alza`;
        }
      }
    }
    setups.push({ id: 'sweep', name: 'Liquidity Sweep (caza de stops)', direction, detail });
  }

  // 3) VWAP — filtro de dirección + comportamiento
  {
    const above = price > vwap;
    let crosses = 0;
    for (let i = 1; i < today.length; i++) {
      const a = today[i - 1].close - vwap, b = today[i].close - vwap;
      if ((a > 0 && b < 0) || (a < 0 && b > 0)) crosses++;
    }
    const direction = crosses >= 6 ? null : above ? 'long' : 'short';
    const detail = crosses >= 6
      ? `precio cruzando el VWAP en zigzag (${crosses}×) — sin filtro válido, día picador`
      : above
        ? `precio sostenido sobre el VWAP ($${vwap.toFixed(2)}) — solo largos`
        : `precio sostenido bajo el VWAP ($${vwap.toFixed(2)}) — solo cortos`;
    setups.push({ id: 'vwap', name: 'VWAP (filtro de dirección)', direction, detail });
  }

  // 4) ORB — ruptura del Opening Range
  let orbDir: 'long' | 'short' | null = null;
  let brokeAt = -1;
  {
    for (let i = 0; i < after.length; i++) {
      const c = after[i];
      if (c.close > orHigh && orbDir !== 'long') { orbDir = 'long'; brokeAt = i; }
      if (c.close < orLow && orbDir !== 'short') { orbDir = 'short'; brokeAt = i; }
    }
    const detail = orbDir === 'long'
      ? `ruptura del Opening Range al alza (máx $${orHigh.toFixed(2)})`
      : orbDir === 'short'
        ? `ruptura del Opening Range a la baja (mín $${orLow.toFixed(2)})`
        : minutes < 30
          ? 'el Opening Range aún no está completo (30 min)'
          : 'sin ruptura del Opening Range — el precio sigue dentro';
    setups.push({ id: 'orb', name: 'ORB (ruptura rango apertura)', direction: orbDir, detail });
  }

  // 5) Breakout/Retest — tras romper, volvió al nivel y aguantó
  {
    let direction: 'long' | 'short' | null = null;
    let detail = 'sin retest confirmado todavía';
    if (orbDir && brokeAt >= 0 && after.length - 1 > brokeAt) {
      const post = after.slice(brokeAt + 1);
      if (orbDir === 'long') {
        const retested = post.some(c => c.low <= orHigh + orSize * 0.15);
        const held = price > orHigh;
        if (retested && held) {
          direction = 'long';
          detail = `rompió $${orHigh.toFixed(2)}, volvió a probarlo y aguantó — entrada de alta probabilidad`;
        } else if (!retested) detail = 'rompió pero aún no ha hecho retest — esperar el retest, no perseguir';
      } else {
        const retested = post.some(c => c.high >= orLow - orSize * 0.15);
        const held = price < orLow;
        if (retested && held) {
          direction = 'short';
          detail = `rompió $${orLow.toFixed(2)} a la baja, volvió a probarlo y aguantó — entrada de alta probabilidad`;
        } else if (!retested) detail = 'rompió pero aún no ha hecho retest — esperar el retest, no perseguir';
      }
    }
    setups.push({ id: 'breakout_retest', name: 'Breakout / Retest', direction, detail });
  }

  // 6) Trend/Pullback — en día de tendencia, pullback al VWAP/EMA que reanuda
  {
    let direction: 'long' | 'short' | null = null;
    let detail = 'sin pullback operable';
    const sessionMove = today.length > 1 ? (price / today[0].open - 1) * 100 : 0;
    const nearVwap = Math.abs(price - vwap) / orSize < 0.8;
    if (orbDir === 'long' && sessionMove > 0 && nearVwap && price > vwap) {
      direction = 'long';
      detail = 'día alcista con pullback hacia el VWAP que mantiene la estructura — entrada de continuación';
    } else if (orbDir === 'short' && sessionMove < 0 && nearVwap && price < vwap) {
      direction = 'short';
      detail = 'día bajista con pullback hacia el VWAP que mantiene la estructura — entrada de continuación';
    } else if (orbDir) {
      detail = 'día con dirección pero el precio no está en zona de pullback (no perseguir)';
    }
    setups.push({ id: 'pullback', name: 'Trend / Pullback', direction, detail });
  }

  // Confluencia
  const longs = setups.filter(s => s.direction === 'long').length;
  const shorts = setups.filter(s => s.direction === 'short').length;
  const maxScore = setups.length;

  let direction: 'LARGO' | 'CORTO' | 'ESPERAR' = 'ESPERAR';
  let score = 0;
  if (longs >= 3 && longs > shorts) { direction = 'LARGO'; score = longs; }
  else if (shorts >= 3 && shorts > longs) { direction = 'CORTO'; score = shorts; }
  else score = Math.max(longs, shorts);

  // Plan: entrada/stop/objetivos según la estructura
  let entry: number | null = null, stop: number | null = null;
  let target1: number | null = null, target2: number | null = null;
  let note = '';
  if (direction !== 'ESPERAR') {
    entry = price;
    if (direction === 'LARGO') {
      stop = Math.min(orLow, vwap) - orSize * 0.1;
      target1 = price + orSize;
      target2 = price + orSize * 2;
      note = `${score}/${maxScore} setups alineados en largo. Entrada al precio actual o en pullback al VWAP ($${vwap.toFixed(2)}). Stop bajo el mínimo del OR/VWAP. Objetivos: 1× y 2× el tamaño del Opening Range.`;
    } else {
      stop = Math.max(orHigh, vwap) + orSize * 0.1;
      target1 = price - orSize;
      target2 = price - orSize * 2;
      note = `${score}/${maxScore} setups alineados en corto. Entrada al precio actual o en pullback al VWAP ($${vwap.toFixed(2)}). Stop sobre el máximo del OR/VWAP. Objetivos: 1× y 2× el tamaño del Opening Range.`;
    }
  } else {
    note = longs === 0 && shorts === 0
      ? 'Ningún setup activo todavía. Espera la ruptura del Opening Range o una barrida de liquidez en los niveles.'
      : `Señales divididas (${longs} largo / ${shorts} corto) — sin confluencia. Cuando los setups no coinciden, no hay ventaja: esperar ES la posición correcta.`;
  }

  return {
    direction, score, maxScore, setups, entry, stop, target1, target2, note,
    levels: { pdh, pdl, orHigh, orLow, vwap },
  };
}
