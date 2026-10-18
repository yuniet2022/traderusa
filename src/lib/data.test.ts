import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadCandles, loadQuotes, loadTimeframeCandles, loadTimeframeHistory } from './data';
import { fetchLiveStock } from './live';

const fetchMock = vi.fn<typeof fetch>();
const now = Date.UTC(2026, 9, 16, 15);
const candles = Array.from({ length: 80 }, (_, i) => ({ time: now / 1000 - (80 - i) * 86400, open: 100, high: 101, low: 99, close: 100, volume: 1000 }));
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now);
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); fetchMock.mockReset(); });

describe('same-origin market client', () => {
  it('keeps stock and crypto quotes separate when their ticker matches', async () => {
    fetchMock.mockImplementation(async input => Response.json({ ABC: { price: String(input).includes('assetClass=crypto') ? 10 : 100, change24h: 2 } }));
    const quotes = await loadQuotes([
      { id: 'ABC', symbol: 'ABC', name: 'Stock', assetClass: 'stock' },
      { id: 'ABC', symbol: 'ABC', name: 'Crypto', assetClass: 'crypto' },
    ]);
    expect(quotes['crypto:ABC'].price).toBe(10);
    expect(quotes['stock:ABC'].price).toBe(100);
    expect(fetchMock.mock.calls.every(([url, init]) => String(url).startsWith('/api/market/') && init?.credentials === 'same-origin')).toBe(true);
  });
  it('preserves history provenance and marks browser cache as cached', async () => {
    fetchMock.mockResolvedValue(Response.json({ candles, source: 'Kraken', cached: false }));
    const asset = { id: 'BTC', symbol: 'BTC', name: 'Bitcoin', assetClass: 'crypto' as const };
    const first = await loadCandles(asset);
    expect(first.source).toBe('Kraken');
    expect((await loadCandles(asset))).toEqual({ ...first, cached: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('preserves a cached server quote timestamp instead of inventing a new observation', async () => {
    fetchMock.mockResolvedValue(Response.json({ AAPL: { price: 100, change24h: 2, source: 'Yahoo Finance', asOf: now - 900_000, receivedAt: now - 60_000, cached: true } }));
    expect(await fetchLiveStock('AAPL')).toMatchObject({ asOf: now - 900_000, receivedAt: now - 60_000, cached: true });
  });
  it('does not wait forever when an authenticated API request hangs', async () => {
    fetchMock.mockImplementation((_, init) => new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })));
    const controller = new AbortController();
    const pending = loadCandles({ id: 'BTC', symbol: 'BTC', name: 'Bitcoin', assetClass: 'crypto' }, controller.signal);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort(); await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });
  it('fails rather than creating candles when no history is available', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 503 }));
    await expect(loadCandles({ id: 'AAPL', symbol: 'AAPL', name: 'Apple', assetClass: 'stock' })).rejects.toThrow('no disponibles');
  });
  it('retrieves timeframe charts through the same API', async () => {
    fetchMock.mockResolvedValue(Response.json({ candles, source: 'Kraken', cached: false }));
    expect(await loadTimeframeCandles({ id: 'BTC', symbol: 'BTC', name: 'Bitcoin', assetClass: 'crypto' }, '5m')).toEqual(candles);
    expect(String(fetchMock.mock.calls[0][0])).toContain('timeframe=5m');
  });
  it('preserves chart metadata and allows cancellation when the chart changes', async () => {
    const history = { candles, source: 'Yahoo Finance', cached: true, fetchedAt: now - 120_000, priceAsOf: now - 900_000, stale: true };
    fetchMock.mockResolvedValueOnce(Response.json(history));
    expect(await loadTimeframeHistory({ id: 'AAPL', symbol: 'AAPL', name: 'Apple', assetClass: 'stock' }, '1d')).toEqual(history);
    fetchMock.mockImplementation((_, init) => new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })));
    const controller = new AbortController();
    const pending = loadTimeframeHistory({ id: 'AAPL', symbol: 'AAPL', name: 'Apple', assetClass: 'stock' }, '1m', controller.signal);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort(); await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });
});
