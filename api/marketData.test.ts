import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMarketService as createService } from './marketData';
const createMarketService = (options: Parameters<typeof createService>[0] = {}) => createService({ spacingMs: 0, ...options });

const now = Date.UTC(2026, 9, 16, 15);
const dates = Array.from({ length: 80 }, (_, i) => new Date(now - (80 - i) * 86_400_000));
const csv = 'Date,Open,High,Low,Close,Volume\n' + dates.map(d => `${d.toISOString().slice(0, 10)},100,105,95,102,2500`).join('\n');
const yahoo = () => ({ chart: { result: [{ timestamp: dates.map(d => d.getTime() / 1000), indicators: { quote: [{ open: Array(80).fill(100), high: Array(80).fill(105), low: Array(80).fill(95), close: Array(80).fill(102), volume: Array(80).fill(2500) }] } }] } });
afterEach(() => vi.restoreAllMocks());

describe('server market sources', () => {
  it('parses real CSV columns and shares one request across simultaneous clients', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response(csv));
    const service = createMarketService({ fetch: fetcher, now: () => now });
    const [first, second] = await Promise.all([service.history('stock', 'AAPL'), service.history('stock', 'AAPL')]);
    expect(first).toEqual(second);
    expect(first.source).toBe('Stooq');
    expect(first.candles).toHaveLength(80);
    expect(first.candles[0]).toMatchObject({ open: 100, high: 105, low: 95, close: 102, volume: 2500 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((await service.history('stock', 'AAPL')).cached).toBe(true);
    expect(new URL(String(fetcher.mock.calls[0][0])).hostname).toBe('stooq.com');
  });

  it('uses Yahoo directly after Stooq refuses access and skips missing OHLC rows', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const response = yahoo();
    response.chart.result[0].indicators.quote[0].open[0] = null as unknown as number;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async input => String(input).includes('stooq.com') ? new Response('', { status: 403 }) : Response.json(response));
    const result = await createMarketService({ fetch: fetcher }).history('stock', 'MSFT');
    expect(result.source).toBe('Yahoo Finance');
    expect(result.candles).toHaveLength(79);
    expect(fetcher.mock.calls.map(call => new URL(String(call[0])).hostname)).toEqual(['stooq.com', 'query1.finance.yahoo.com']);
  });

  it('reads Kraken OHLC and the volume field rather than VWAP', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: [], result: { XXBTZUSD: dates.map(d => [d.getTime() / 1000, '100', '105', '95', '102', '101.5', '2500', 50]), last: now / 1000 } }));
    const result = await createMarketService({ fetch: fetcher }).history('crypto', 'BTC');
    expect(result.source).toBe('Kraken');
    expect(result.candles[0].volume).toBe(2500);
    expect(String(fetcher.mock.calls[0][0])).toContain('pair=XBTUSD');
  });

  it('keeps unchanged stale history when sources fail and does not invent dates', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    let clock = now;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response(csv));
    const service = createMarketService({ fetch: fetcher, now: () => clock });
    const first = await service.history('stock', 'AAPL');
    clock += 301_000;
    fetcher.mockImplementation(async () => new Response('', { status: 429 }));
    const stale = await service.history('stock', 'AAPL');
    expect(stale).toEqual({ ...first, cached: true });
    expect(stale.candles.at(-1)?.time).toBe(Date.parse(`${dates.at(-1)!.toISOString().slice(0, 10)}T00:00:00Z`) / 1000);
  });

  it('backs off an unavailable provider across assets and after total failure', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    let clock = now;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response('', { status: 429 }));
    const service = createMarketService({ fetch: fetcher, now: () => clock });
    await expect(service.history('stock', 'AAPL')).rejects.toThrow('temporarily unavailable');
    expect(fetcher).toHaveBeenCalledTimes(2);
    await expect(service.history('stock', 'MSFT')).rejects.toThrow();
    await expect(service.history('stock', 'AAPL')).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(2);
    clock += 61_000;
    fetcher.mockImplementation(async () => new Response(csv));
    expect((await service.history('stock', 'MSFT')).source).toBe('Stooq');
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('limits all upstream requests to four at once', async () => {
    let active = 0; let maximum = 0;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => {
      active++; maximum = Math.max(maximum, active);
      await new Promise(resolve => setTimeout(resolve, 1));
      active--; return new Response(csv);
    });
    const service = createMarketService({ fetch: fetcher });
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => service.history('stock', `STOCK${i}`)));
    expect(maximum).toBe(4);
    expect(results).toHaveLength(12);
  });

  it('spaces requests to a shared provider instead of issuing a burst', async () => {
    const starts: number[] = [];
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => { starts.push(Date.now()); return new Response(csv); });
    const service = createMarketService({ fetch: fetcher, spacingMs: 10 });
    await Promise.all(['AAPL', 'MSFT', 'TSLA'].map(id => service.history('stock', id)));
    expect(starts).toHaveLength(3);
    expect(starts[2] - starts[0]).toBeGreaterThanOrEqual(15);
  });

  it('does not turn insufficient or invalid candles into a signal', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async input => String(input).includes('stooq.com') ? new Response('Date,Open,High,Low,Close,Volume\n2026-10-01,100,90,110,102,1') : Response.json({ chart: { result: [] } }));
    await expect(createMarketService({ fetch: fetcher }).history('stock', 'AAPL')).rejects.toThrow();
  });

  it('retains provider quote timestamps and marks a cached observation', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ chart: { result: [{ meta: { regularMarketPrice: 110, previousClose: 100, regularMarketTime: now / 1000 - 900 } }] } }));
    const service = createMarketService({ fetch: fetcher, now: () => now });
    const first = (await service.quotes('stock', ['AAPL'])).AAPL;
    expect(first).toMatchObject({ price: 110, source: 'Yahoo Finance', asOf: now - 900_000, receivedAt: now, cached: false });
    expect((await service.quotes('stock', ['AAPL'])).AAPL).toEqual({ ...first, cached: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('does not invent a quote time or 24h return for Kraken tickers', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: [], result: { XXBTZUSD: { c: ['110', '1'], o: '100' } } }));
    const quotes = await createMarketService({ fetch: fetcher, now: () => now }).quotes('crypto', ['BTC']);
    expect(quotes.BTC).toMatchObject({ price: 110, change24h: null, receivedAt: now, source: 'Kraken' });
    expect(quotes.BTC.asOf).toBeUndefined();
  });

  it('keeps valid quotes when another pair in the batch is unavailable', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async input => {
      const url = String(input);
      if (url.includes('pair=XBTUSD')) return Response.json({ error: [], result: { XXBTZUSD: { c: ['110', '1'] } } });
      if (url.includes('kraken.com')) return Response.json({ error: ['EQuery:Unknown asset pair'] });
      return new Response('', { status: 404 });
    });
    const quotes = await createMarketService({ fetch: fetcher }).quotes('crypto', ['BTC', 'BNB']);
    expect(quotes.BTC.price).toBe(110);
    expect(quotes.BNB).toBeUndefined();
  });

  it('filters unsupported search instruments and preserves a stock/crypto ticker collision', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ quotes: [
      { symbol: 'ABC', shortname: 'ABC stock', quoteType: 'EQUITY' },
      { symbol: 'ABC', shortname: 'ABC stock', quoteType: 'EQUITY' },
      { symbol: 'ABC-USD', shortname: 'ABC crypto', quoteType: 'CRYPTOCURRENCY' },
      { symbol: 'ABC_OPTION', quoteType: 'OPTION' },
      { quoteType: 'ETF' },
    ] }));
    const results = await createMarketService({ fetch: fetcher }).search('ABC');
    expect(results.map(asset => `${asset.assetClass}:${asset.id}`)).toEqual(['stock:ABC', 'crypto:ABC']);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('aggregates weekly OHLC with actual volumes and Monday UTC timestamps', async () => {
    const daily = Array.from({ length: 200 }, (_, i) => `${new Date(now - (200 - i) * 86_400_000).toISOString().slice(0, 10)},100,105,95,102,2500`);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('Date,Open,High,Low,Close,Volume\n' + daily.join('\n')));
    const result = await createMarketService({ fetch: fetcher }).history('stock', 'AAPL', '1wk');
    expect(result.candles.length).toBeGreaterThan(20);
    expect(result.candles.every(c => new Date(c.time * 1000).getUTCDay() === 1 && c.open === 100 && c.high === 105 && c.low === 95 && c.close === 102)).toBe(true);
    expect(result.candles.reduce((total, candle) => total + candle.volume, 0)).toBe(200 * 2500);
  });
});
