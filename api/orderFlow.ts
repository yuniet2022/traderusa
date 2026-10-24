import type { TradeFlow } from '../contracts/orderFlow';

/** Kraken public Trades b/s denotes the taker side, not a count of distinct people. */
export function parseKrakenFlow(data: unknown, market: string, now: number): Omit<TradeFlow, 'cached' | 'stale'> {
  const payload = data as { error?: unknown[]; result?: Record<string, unknown> };
  if (payload?.error?.length || !payload?.result) throw new Error('No trade data');
  const rows = Object.entries(payload.result).find(([key]) => key !== 'last')?.[1];
  if (!Array.isArray(rows)) throw new Error('Invalid trade data');
  const valid = rows.flatMap(row => {
    if (!Array.isArray(row) || !['b', 's'].includes(row[3])) return [];
    const price = Number(row[0]), quantity = Number(row[1]), time = Number(row[2]) * 1000;
    if (![price, quantity, time, price * quantity].every(Number.isFinite) || price <= 0 || quantity <= 0 || time < now - 300_000 || time > now) return [];
    return [{ notional: price * quantity, time, buy: row[3] === 'b', id: row[6] }];
  });
  // Current Kraken responses include trade IDs. Deduplicate only when an ID is supplied.
  const seen = new Set<unknown>();
  const trades = valid.filter(t => {
    if (t.id == null) return true;
    if (seen.has(t.id)) return false;
    seen.add(t.id); return true;
  });
  if (!trades.length) throw new Error('No recent trades');
  const buyNotional = trades.reduce((s, t) => s + (t.buy ? t.notional : 0), 0);
  const sellNotional = trades.reduce((s, t) => s + (t.buy ? 0 : t.notional), 0);
  if (!Number.isFinite(buyNotional + sellNotional) || buyNotional + sellNotional <= 0) throw new Error('Invalid totals');
  return { source: 'Kraken', market, trades: trades.length, buyNotional, sellNotional,
    buyShare: buyNotional / (buyNotional + sellNotional),
    firstTradeAt: Math.min(...trades.map(t => t.time)), lastTradeAt: Math.max(...trades.map(t => t.time)), fetchedAt: now };
}
