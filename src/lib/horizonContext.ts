import type { AssetClass, Candle } from '@/types';
import { candleClosedAt } from './marketEvidence';
import { ema } from './indicators';

export function horizonContext(candles: Candle[], assetClass: AssetClass, price: number, dailyChange: number | null, now: number) {
  const closed = [...new Map(candles.filter(c => Number.isFinite(c.time) && Number.isFinite(c.close) && c.close > 0 && candleClosedAt(c, 86400, assetClass) <= now).map(c => [c.time, c])).values()].sort((a,b) => a.time-b.time);
  const closes = closed.map(c => c.close);
  const monthBars = assetClass === 'crypto' ? 30 : 21, quarterBars = monthBars*3;
  const change = (bars: number) => closes.length > bars ? (closes.at(-1)! / closes[closes.length-1-bars]-1)*100 : null;
  const month = change(monthBars), quarter = change(quarterBars);
  const fast = ema(closes, 20).at(-1), slow = ema(closes, 50).at(-1);
  const structureHeld = fast != null && slow != null && price >= fast && fast >= slow;
  const structureLost = slow != null && price < slow;
  let context = 'Horizontes en desacuerdo o sin dirección suficiente';
  if (month === null || quarter === null) context = 'Historial insuficiente para comparar mes y trimestre';
  else if (month > 0 && quarter > 0) {
    context = dailyChange !== null && dailyChange < 0
      ? structureHeld ? 'Posible pausa dentro de una estructura alcista' : structureLost ? 'Retroceso con deterioro de la estructura' : 'Retroceso dentro de una subida: estructura por confirmar'
      : structureHeld ? 'Subida alineada entre horizontes' : 'Historial positivo; estructura actual por confirmar';
  } else if (month < 0 && quarter < 0) context = dailyChange !== null && dailyChange > 0 ? 'Posible rebote dentro de un historial bajista' : 'Debilidad en mes y trimestre';
  return { dailyChange: Number.isFinite(dailyChange) ? dailyChange : null, month, quarter, monthBars, quarterBars,
    lastDailyCloseAt: closed.length ? candleClosedAt(closed.at(-1)!, 86400, assetClass) : null, context, structureHeld };
}
