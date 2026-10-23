import type { Position } from './portfolio';

/** Gross, unrealized result from the user's actual lots; never from technical targets. */
export function positionMetrics(position: Pick<Position, 'lots'>, price?: number | null) {
  if (!position.lots.length || position.lots.some(l => !Number.isFinite(l.quantity) || l.quantity <= 0 || !Number.isFinite(l.price) || l.price <= 0)) return null;
  const quantity = position.lots.reduce((sum, l) => sum + l.quantity, 0);
  const invested = position.lots.reduce((sum, l) => sum + l.quantity * l.price, 0);
  if (!Number.isFinite(quantity) || !Number.isFinite(invested) || invested <= 0) return null;
  const average = invested / quantity;
  const hasPrice = price != null && Number.isFinite(price) && price > 0;
  const rawValue = hasPrice ? quantity * price : null;
  const value = rawValue !== null && Number.isFinite(rawValue) ? rawValue : null;
  const pnl = value === null ? null : value - invested;
  return {
    quantity, invested, average, value, pnl,
    pnlPercent: pnl === null ? null : pnl / invested * 100,
    recoveryPercent: hasPrice && price < average ? (average / price - 1) * 100 : null,
  };
}
