import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { searchAssets } from './search';

const fetchMock = vi.fn<typeof fetch>();
const stocks = (symbol: string) => Response.json({
  quotes: [{ symbol, shortname: 'Test company', quoteType: 'EQUITY' }],
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe('asset search', () => {
  it('does not contact providers for a blank query', async () => {
    expect(await searchAssets('  ')).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('starts stock search while the crypto provider is still pending', async () => {
    let resolveCrypto!: (response: Response) => void;
    fetchMock.mockImplementation(input => {
      if (String(input).includes('binance.com')) {
        return new Promise(resolve => { resolveCrypto = resolve; });
      }
      return Promise.resolve(stocks('BTC'));
    });
    const pending = searchAssets(' btc ');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    resolveCrypto(Response.json({ price: '100' }));
    expect((await pending).map(asset => asset.assetClass)).toEqual(['crypto', 'stock']);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps stock results when the crypto request times out', async () => {
    fetchMock.mockImplementation((input, init) => {
      if (!String(input).includes('binance.com')) return Promise.resolve(stocks('AAPL'));
      return new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      });
    });
    const pending = searchAssets('AAPL');
    await vi.advanceTimersByTimeAsync(6000);
    expect(await pending).toEqual([
      { id: 'AAPL', symbol: 'AAPL', name: 'Test company', assetClass: 'stock' },
    ]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels both in-flight requests and does not start the fallback', async () => {
    const controller = new AbortController();
    const signals: AbortSignal[] = [];
    fetchMock.mockImplementation((_, init) => new Promise((_, reject) => {
      const signal = init?.signal;
      if (!signal) throw new Error('Expected a cancellation signal');
      signals.push(signal);
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }));
    const pending = searchAssets('AAPL', controller.signal);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await rejected;
    expect(signals).toHaveLength(2);
    expect(signals.every(signal => signal.aborted)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('makes no requests when the search was already cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(searchAssets('AAPL', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('finds an exact stock symbol even when a crypto has the same symbol', async () => {
    fetchMock.mockImplementation(input => {
      const url = String(input);
      if (url.includes('binance.com')) return Promise.resolve(Response.json({ price: '1' }));
      if (decodeURIComponent(url).includes('/finance/search')) {
        return Promise.resolve(Response.json({ quotes: [] }));
      }
      return Promise.resolve(Response.json({ chart: { result: [{ meta: {
        shortName: 'Exact match', regularMarketPrice: 5, instrumentType: 'EQUITY',
      } }] } }));
    });
    expect((await searchAssets('ABC')).map(asset => asset.assetClass)).toEqual(['crypto', 'stock']);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('filters unsupported instruments, removes duplicates and limits results to eight', async () => {
    fetchMock.mockResolvedValue(Response.json({ quotes: [
      { symbol: 'TEST', quoteType: 'EQUITY' },
      { symbol: 'test', quoteType: 'ETF' },
      { symbol: 'UNSUPPORTED', quoteType: 'OPTION' },
      { quoteType: 'EQUITY' },
      ...Array.from({ length: 10 }, (_, i) => ({ symbol: `STOCK${i}`, quoteType: 'ETF' })),
    ] }));
    const results = await searchAssets('test company');
    expect(results).toHaveLength(8);
    expect(results.filter(asset => asset.id === 'TEST')).toHaveLength(1);
    expect(results.every(asset => asset.assetClass === 'stock')).toBe(true);
    expect(results.some(asset => asset.id === 'UNSUPPORTED')).toBe(false);
  });
});
