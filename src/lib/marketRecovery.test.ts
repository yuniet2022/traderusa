import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadCachedCandles, loadCandles } from './data';
import { buildAssetAnalysis, repriceAnalysis } from './analysis';
const now = Date.UTC(2026, 9, 18, 15);
const asset = { id: 'AAPL', symbol: 'AAPL', name: 'Apple', assetClass: 'stock' as const };
const candles = Array.from({ length: 80 }, (_, i) => ({ time: now / 1000 - (80 - i) * 86400, open: 100, high: 101, low: 99, close: 100, volume: 1000 }));
const history = { candles, source: 'Stooq', cached: false, fetchedAt: now };
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now);
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); fetchMock.mockReset(); });
describe('saved market observations', () => {
  it('restores real saved history during failure without moving its original dates', async () => {
    fetchMock.mockResolvedValueOnce(Response.json(history)); await loadCandles(asset);
    vi.setSystemTime(now + 6 * 60000);
    expect(loadCachedCandles(asset)).toEqual({ ...history, cached: true, stale: true });
    fetchMock.mockResolvedValue(new Response('', { status: 503 }));
    expect(await loadCandles(asset)).toEqual({ ...history, cached: true, stale: true });
    expect(JSON.parse(localStorage.getItem('history:v3:stock:AAPL')!).t).toBe(now);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.setSystemTime(now + 24 * 3600000); await expect(loadCandles(asset)).rejects.toThrow();
  });
  it('does not extend the retention period when the server returns old cached observations', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ ...history, cached: true, stale: true, fetchedAt: now - 23 * 3600000 }));
    await loadCandles(asset); fetchMock.mockResolvedValue(new Response('', { status: 503 }));
    expect((await loadCandles(asset)).stale).toBe(true); expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.setSystemTime(now + 2 * 3600000); expect(loadCachedCandles(asset)).toBeNull();
    await expect(loadCandles(asset)).rejects.toThrow();
  });
  it('does not substitute stale data for an invalid session or a cancelled request', async () => {
    localStorage.setItem('history:v3:stock:AAPL', JSON.stringify({ t: now - 3600000, v: history }));
    fetchMock.mockResolvedValue(new Response('', { status: 401 }));
    await expect(loadCandles(asset)).rejects.toMatchObject({ status: 401 });
    const controller = new AbortController(); controller.abort();
    await expect(loadCandles(asset, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('ignores corrupted saved OHLC rather than calculating a signal', () => {
    localStorage.setItem('history:v3:stock:AAPL', JSON.stringify({ t: now - 3600000, v: { ...history, candles: candles.map(c => ({ ...c, high: 1 })) } }));
    expect(loadCachedCandles(asset)).toBeNull();
  });
  it('retains the warning about old history even when a new quote arrives', () => {
    const old = buildAssetAnalysis(asset, { ...history, stale: true }, undefined, now);
    expect(old.historyStale).toBe(true);
    const next = repriceAnalysis(old, { price: 101, change24h: 1, asOf: now, receivedAt: now }, now);
    expect(next.price).toBe(101); expect(next.historyStale).toBe(true);
  });
});
