import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMarketRoutes } from './marketRoutes';
import { createSessionToken, SESSION_COOKIE } from './sessionUtil';
import { UniverseChanged } from './marketUniverse';

const service = { history: vi.fn(), quotes: vi.fn(), search: vi.fn(), flow: vi.fn() };
const universe={page:vi.fn()},availability={check:vi.fn()};
const app = createMarketRoutes(service,universe,availability);
const headers = { Cookie: `${SESSION_COOKIE}=${createSessionToken(1, 'market-test')}` };
beforeEach(() => { vi.resetAllMocks(); });

describe('authenticated market API', () => {
  it('protects discovery and broker checks before calling providers and rejects oversized/unsafe queries',async()=>{
    expect((await app.request('/universe')).status).toBe(401);expect((await app.request('/availability?assetClass=stock&id=AAPL')).status).toBe(401);
    expect(universe.page).not.toHaveBeenCalled();expect(availability.check).not.toHaveBeenCalled();
    for(const path of ['/universe?limit=501','/universe?offset=-1','/universe?version=evil','/availability?assetClass=stock&id=https://internal'])expect((await app.request(path,{headers})).status).toBe(400);
  });
  it('returns private paginated catalogs, restarts changed versions, and normalizes broker symbols',async()=>{
    universe.page.mockResolvedValue({assets:[],total:0,nextOffset:null});
    const response=await app.request('/universe?offset=500&limit=500&version='+'a'.repeat(64),{headers});
    expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(universe.page).toHaveBeenCalledWith({offset:500,limit:500,version:'a'.repeat(64),refresh:false});
    universe.page.mockRejectedValue(new UniverseChanged());expect((await app.request('/universe',{headers})).status).toBe(409);
    availability.check.mockResolvedValue({available:true,checkedAt:1,source:'Robinhood'});
    expect((await app.request('/availability?assetClass=stock&id=aapl',{headers})).status).toBe(200);
    expect(availability.check).toHaveBeenCalledWith('stock','AAPL');
  });
  it('rejects anonymous access before contacting a provider', async () => {
    expect((await app.request('/history?assetClass=stock&id=AAPL')).status).toBe(401);
    expect(service.history).not.toHaveBeenCalled();
  });
  it.each(['/history?assetClass=stock&id=https%3A%2F%2Finternal', '/history?assetClass=stock&id=AAPL&timeframe=invalid', '/history?assetClass=other&id=AAPL', '/quotes?assetClass=crypto&symbols=' + Array(41).fill('BTC').join(',')])('rejects invalid market input: %s', async url => {
    expect((await app.request(url, { headers })).status).toBe(400);
    expect(service.history).not.toHaveBeenCalled();
    expect(service.quotes).not.toHaveBeenCalled();
  });
  it('normalizes ticker input and returns private responses', async () => {
    service.history.mockResolvedValue({ candles: [], source: 'Stooq', cached: false });
    const response = await app.request('/history?assetClass=stock&id=aapl', { headers });
    expect(response.status).toBe(200);
    expect(service.history).toHaveBeenCalledWith('stock', 'AAPL', 'scan');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
  it('returns a retryable error when no source can provide data', async () => {
    service.history.mockRejectedValue(new Error('upstream private implementation details'));
    const response = await app.request('/history?assetClass=stock&id=AAPL', { headers });
    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('30');
    expect(await response.text()).not.toContain('implementation details');
  });
  it('protects and validates the trade-flow endpoint', async () => {
    expect((await app.request('/flow?assetClass=crypto&id=BTC')).status).toBe(401);
    expect((await app.request('/flow?assetClass=crypto&id=https%3A%2F%2Finternal', { headers })).status).toBe(400);
    expect(service.flow).not.toHaveBeenCalled();
    service.flow.mockResolvedValue({ source: 'Kraken', trades: 20 });
    const response = await app.request('/flow?assetClass=crypto&id=btc', { headers });
    expect(response.status).toBe(200);
    expect(service.flow).toHaveBeenCalledWith('crypto', 'BTC');
  });
});
