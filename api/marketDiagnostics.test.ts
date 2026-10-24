import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMarketDiagnostics } from './marketDiagnostics';
import { networkErrorCode } from './networkError';
import { createMarketService } from './marketData';

afterEach(() => vi.restoreAllMocks());
describe('safe production network diagnostics', () => {
  it('unwraps nested aggregate errors without leaking arbitrary messages or codes', () => {
    const nested = new TypeError('private URL and credentials', { cause: new AggregateError([Object.assign(new Error('private hostname'), { code: 'ENETUNREACH' })]) });
    expect(networkErrorCode(nested)).toBe('ENETUNREACH');
    expect(networkErrorCode(new DOMException('sensitive detail', 'TimeoutError'))).toBe('REQUEST_TIMEOUT');
    expect(networkErrorCode(Object.assign(new Error('private'), { code: 'private-secret' }))).toBe('NETWORK_ERROR_UNCLASSIFIED');
  });
  it('probes only fixed provider URLs, reports HTTP restrictions, and shares/cache checks for a minute', async () => {
    let clock = 1000000;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async input => {
      const host = new URL(String(input)).hostname;
      if (host === 'api.binance.com') return new Response('private response body', { status: 451 });
      if (host === 'api.kraken.com') throw new TypeError('private', { cause: { code: 'ENOTFOUND' } });
      return Response.json({ ok: true });
    });
    const check = createMarketDiagnostics({ fetch: fetcher, now: () => clock });
    const [first, second] = await Promise.all([check(), check()]);
    expect(first).toEqual(second); expect(fetcher).toHaveBeenCalledTimes(6);
    expect(new Set(fetcher.mock.calls.map(c => new URL(String(c[0])).hostname))).toEqual(new Set(['query1.finance.yahoo.com','query2.finance.yahoo.com','api.kraken.com','api.exchange.coinbase.com','stooq.com','api.binance.com']));
    expect(first.results.find(r => r.source === 'api.binance.com')?.code).toBe('HTTP_451');
    expect(first.results.find(r => r.source === 'api.kraken.com')?.code).toBe('ENOTFOUND');
    expect(JSON.stringify(first)).not.toContain('private');
    clock += 59000; expect((await check()).checkedAt).toBe(first.checkedAt); expect(fetcher).toHaveBeenCalledTimes(6);
    clock += 2000; expect((await check()).checkedAt).toBe(clock); expect(fetcher).toHaveBeenCalledTimes(12);
  });
  it('does not put a working provider into cooldown after an application request budget expires', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const controllers: AbortController[] = [];
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => { const controller = new AbortController(); controllers.push(controller); return controller.signal; });
    const fetcher = vi.fn<typeof fetch>()
      .mockImplementationOnce(async (_, init) => new Promise((_, reject) => init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), { once: true })))
      .mockImplementation(async () => Response.json({ result: { ETHUSD: { c: ['100'] } } }));
    const service = createMarketService({ fetch: fetcher, spacingMs: 0 });
    const first = service.quotes('crypto', ['BTC']);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    controllers[0].abort(new DOMException('Internal budget expired', 'TimeoutError'));
    expect(await first).toEqual({});
    expect((await service.quotes('crypto', ['ETH'])).ETH?.source).toBe('Kraken');
    expect(console.warn).toHaveBeenCalledWith('[MARKET_SOURCE_ERROR]', expect.stringContaining('REQUEST_BUDGET_EXPIRED'));
  });
});
