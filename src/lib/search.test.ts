import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { searchAssets } from './search';

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); fetchMock.mockReset(); });

describe('asset search through the app API', () => {
  it('makes no request for a blank query', async () => {
    expect(await searchAssets('  ')).toEqual([]); expect(fetchMock).not.toHaveBeenCalled();
  });
  it('returns known symbols when remote search is unavailable', async () => {
    fetchMock.mockRejectedValue(new Error('unavailable'));
    expect((await searchAssets('Bitcoin')).map(a => a.id)).toContain('BTC');
  });
  it('cancels the request and does not return stale local matches', async () => {
    fetchMock.mockImplementation((_, init) => new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })));
    const controller = new AbortController();
    const pending = searchAssets('AAPL', controller.signal);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort(); await rejected;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('makes no request if already cancelled', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(searchAssets('AAPL', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('keeps a stock and crypto with the same ticker and removes repeated matches', async () => {
    const stock = { id: 'ABC', symbol: 'ABC', name: 'ABC stock', assetClass: 'stock' };
    const crypto = { ...stock, name: 'ABC crypto', assetClass: 'crypto' };
    fetchMock.mockResolvedValue(Response.json([stock, crypto, stock]));
    expect((await searchAssets('ABC')).map(a => a.assetClass)).toEqual(['stock', 'crypto']);
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/market/search?q=ABC');
  });
  it('limits merged local and remote search results to eight', async () => {
    fetchMock.mockResolvedValue(Response.json(Array.from({ length: 12 }, (_, i) => ({ id: `TEST${i}`, symbol: `TEST${i}`, name: 'Test', assetClass: 'stock' }))));
    expect(await searchAssets('test')).toHaveLength(8);
  });
});
