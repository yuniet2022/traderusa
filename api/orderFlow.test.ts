import { describe, expect, it, vi } from 'vitest';
import { parseKrakenFlow } from './orderFlow';
import { createMarketService } from './marketData';

const now = Date.UTC(2026, 9, 23, 15);
const payload = (rows: unknown[][]) => ({ error: [], result: { XXBTZUSD: rows, last: 'cursor' } });
const trade = (price: string, quantity: string, age: number, side: string, id?: number) => [price, quantity, (now-age)/1000, side, 'm', '', id];

describe('observed Kraken taker flow', () => {
  it('weights executed notional, not number of trades or distinct people', () => {
    const flow = parseKrakenFlow(payload([trade('100', '10', 2000, 'b', 1), trade('100', '1', 1000, 's', 2), trade('100', '1', 500, 's', 3)]), 'BTC/USD', now);
    expect(flow).toMatchObject({ buyNotional: 1000, sellNotional: 200, trades: 3, firstTradeAt: now-2000, lastTradeAt: now-500 });
    expect(flow.buyShare).toBeCloseTo(5/6);
  });
  it('rejects unknown sides, malformed prices, out-of-window and future prints, and repeated trade IDs', () => {
    const rows = [trade('100', '2', 1000, 's', 1), trade('100', '2', 1000, 's', 1), trade('100', '2', 400000, 'b'), trade('NaN', '2', 1000, 'b'), trade('100', '2', -1000, 'b'), trade('100', '2', 1000, '?')];
    expect(parseKrakenFlow(payload(rows), 'BTC/USD', now)).toMatchObject({ trades: 1, buyNotional: 0, sellNotional: 200, buyShare: 0 });
    expect(() => parseKrakenFlow(payload([]), 'BTC/USD', now)).toThrow();
    expect(() => parseKrakenFlow({ error: ['Unknown pair'] }, 'BTC/USD', now)).toThrow();
  });
  it('never substitutes equity candle volume for unavailable executed trade flow', async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(createMarketService({ fetch: fetcher }).flow('stock', 'INDI')).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('retains actual observation and receipt times when serving a stale sample', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    let clock = now;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json(payload([trade('100', '2', 1000, 'b', 1)])));
    const service = createMarketService({ fetch: fetcher, now: () => clock, spacingMs: 0 });
    const first = await service.flow('crypto', 'BTC');
    expect(String(fetcher.mock.calls[0][0])).toContain('/Trades?pair=XBTUSD&count=1000');
    clock += 11000; fetcher.mockImplementation(async () => new Response('', { status: 503 }));
    expect(await service.flow('crypto', 'BTC')).toEqual({ ...first, cached: true, stale: true });
    clock += 20000;
    await expect(service.flow('crypto', 'BTC')).rejects.toThrow();
    vi.restoreAllMocks();
  });
});
