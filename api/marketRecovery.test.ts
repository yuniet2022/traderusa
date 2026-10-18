import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMarketService } from './marketData';
const now = Date.UTC(2026, 9, 18, 15);
const times = Array.from({ length: 80 }, (_, i) => now / 1000 - (80 - i) * 86400);
const yahoo = { chart: { result: [{ timestamp: times, indicators: { quote: [{ open: times.map(() => 100), high: times.map(() => 105), low: times.map(() => 95), close: times.map(() => 102), volume: times.map(() => 2500) }] } }] } };
afterEach(() => vi.restoreAllMocks());
describe('provider recovery', () => {
  it('uses the second Yahoo chart host after the first fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async input => new URL(String(input)).hostname === 'query1.finance.yahoo.com'
      ? new Response('', { status: 503 }) : Response.json(yahoo));
    const result = await createMarketService({ fetch: fetcher, spacingMs: 0 }).history('stock', 'AAPL', '1d');
    expect(result.source).toBe('Yahoo Finance'); expect(result.candles).toHaveLength(80);
    expect(fetcher.mock.calls.map(c => new URL(String(c[0])).hostname)).toEqual(['query1.finance.yahoo.com', 'query2.finance.yahoo.com']);
  });
  it('reads Coinbase OHLC and paginates daily history in requests of at most 300 candles', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async input => {
      const u = new URL(String(input));
      if (u.hostname === 'api.kraken.com') return new Response('', { status: 403 });
      expect(u.hostname).toBe('api.exchange.coinbase.com');
      expect(u.pathname).toBe('/products/BTC-USD/candles');
      expect(u.searchParams.get('granularity')).toBe('86400');
      const start = Date.parse(u.searchParams.get('start')!) / 1000, end = Date.parse(u.searchParams.get('end')!) / 1000;
      const count = (end - start) / 86400 + 1; expect(count).toBeLessThanOrEqual(300);
      return Response.json(Array.from({ length: count }, (_, i) => [end - i * 86400, 95, 105, 100, 102, 2500]));
    });
    const result = await createMarketService({ fetch: fetcher, now: () => now, spacingMs: 0 }).history('crypto', 'BTC');
    expect(result.source).toBe('Coinbase Exchange'); expect(result.candles).toHaveLength(420);
    expect(result.candles[0]).toMatchObject({ open: 100, low: 95, high: 105, close: 102, volume: 2500 });
    expect(new Set(result.candles.map(c => c.time)).size).toBe(420);
    expect(result.candles[0].time).toBeLessThan(result.candles.at(-1)!.time); expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('preserves the actual trade timestamp in a Coinbase fallback quote', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async input => String(input).includes('kraken.com')
      ? new Response('', { status: 503 }) : Response.json({ price: '110', time: new Date(now - 20000).toISOString() }));
    const service = createMarketService({ fetch: fetcher, now: () => now, spacingMs: 0 });
    const first = (await service.quotes('crypto', ['BTC'])).BTC;
    expect(first).toMatchObject({ price: 110, asOf: now - 20000, receivedAt: now, change24h: null, source: 'Coinbase Exchange', cached: false });
    expect((await service.quotes('crypto', ['BTC'])).BTC).toEqual({ ...first, cached: true });
  });
  it('logs only safe network codes and throttles duplicate diagnostics', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('private request details', { cause: { code: 'ENOTFOUND', hostname: 'private details' } }));
    const service = createMarketService({ fetch: fetcher, spacingMs: 0 });
    await expect(service.history('stock', 'AAPL')).rejects.toThrow(); await expect(service.history('stock', 'MSFT')).rejects.toThrow();
    expect(warn.mock.calls.some(c => String(c[1]).includes('ENOTFOUND'))).toBe(true);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('private'); expect(warn.mock.calls).toHaveLength(3);
  });
});
