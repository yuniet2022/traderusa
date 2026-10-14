import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCryptoQuotes, loadCandles, loadQuotes } from './data';
import { fetchLiveCrypto, fetchLiveStock } from './live';

const fetchMock = vi.fn<typeof fetch>();
const now = Date.UTC(2026, 9, 14, 16);
const candles = Array.from({ length: 80 }, (_, i) => [(now - (80 - i) * 86400000), '100', '101', '99', '100', '1000']);
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); fetchMock.mockReset(); });

describe('market data provenance', () => {
  it('keeps stock and crypto quotes separate when they share a ticker', async () => {
    fetchMock.mockImplementation(input => String(input).includes('binance.com')
      ? Promise.resolve(Response.json([{ symbol: 'ABCUSDT', lastPrice: '10', priceChangePercent: '2' }]))
      : Promise.resolve(Response.json({ chart: { result: [{ meta: { regularMarketPrice: 100, previousClose: 90 } }] } })));
    const quotes = await loadQuotes([
      { id: 'ABC', symbol: 'ABC', name: 'ABC stock', assetClass: 'stock' },
      { id: 'ABC', symbol: 'ABC', name: 'ABC crypto', assetClass: 'crypto' },
    ]);
    expect(quotes['crypto:ABC'].price).toBe(10);
    expect(quotes['stock:ABC'].price).toBe(100);
  });

  it('marks daily histories retrieved from cache and preserves their provider', async () => {
    fetchMock.mockResolvedValue(Response.json(candles));
    const asset = { id: 'BTC', symbol: 'BTC', name: 'Bitcoin', assetClass: 'crypto' as const };
    const first = await loadCandles(asset);
    const cached = await loadCandles(asset);
    expect(first.source).toBe('Binance');
    expect(first.cached).toBe(false);
    expect(cached).toEqual({ ...first, cached: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps cached quotes distinct from a new provider observation', async () => {
    fetchMock.mockResolvedValue(Response.json([{ symbol: 'BTCUSDT', lastPrice: '100', priceChangePercent: '2', closeTime: now - 1000 }]));
    const first = await fetchCryptoQuotes(['BTC']);
    vi.setSystemTime(now + 60000);
    const cached = await fetchCryptoQuotes(['BTC']);
    expect(first.BTC).toMatchObject({ source: 'Binance', asOf: now - 1000, receivedAt: now });
    expect(cached.BTC).toEqual({ ...first.BTC, cached: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('identifies the fallback history provider after Stooq fails', async () => {
    fetchMock.mockImplementation(input => {
      if (String(input).includes('stooq.com')) return Promise.resolve(new Response('<html>unavailable</html>'));
      return Promise.resolve(Response.json({ chart: { result: [{ timestamp: candles.map(c => Number(c[0]) / 1000), indicators: { quote: [{
        open: Array(80).fill(100), high: Array(80).fill(101), low: Array(80).fill(99), close: Array(80).fill(100), volume: Array(80).fill(1000),
      }] } }] } }));
    });
    const result = await loadCandles({ id: 'AAPL', symbol: 'AAPL', name: 'Apple', assetClass: 'stock' });
    expect(result.source).toBe('Yahoo Finance');
    expect(result.cached).toBe(false);
    expect(result.candles).toHaveLength(80);
  });

  it('records the Binance observation time independently from receipt time', async () => {
    fetchMock.mockResolvedValue(Response.json([{ symbol: 'BTCUSDT', lastPrice: '100', priceChangePercent: '2', closeTime: now - 5000 }]));
    expect((await fetchLiveCrypto(['BTC'])).BTC).toMatchObject({ source: 'Binance', asOf: now - 5000, receivedAt: now });
  });

  it('converts the Yahoo timestamp from seconds without inventing one when missing', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ chart: { result: [{ meta: { regularMarketPrice: 100, previousClose: 90, regularMarketTime: now / 1000 - 900 } }] } }));
    expect(await fetchLiveStock('AAPL')).toMatchObject({ source: 'Yahoo Finance', asOf: now - 900000, receivedAt: now });
    fetchMock.mockResolvedValueOnce(Response.json({ chart: { result: [{ meta: { regularMarketPrice: 100 } }] } }));
    expect((await fetchLiveStock('AAPL'))?.asOf).toBeUndefined();
  });
});
