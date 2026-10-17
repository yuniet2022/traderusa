import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMarketRoutes } from './marketRoutes';
import { createSessionToken, SESSION_COOKIE } from './sessionUtil';

const service = { history: vi.fn(), quotes: vi.fn(), search: vi.fn() };
const app = createMarketRoutes(service);
const headers = { Cookie: `${SESSION_COOKIE}=${createSessionToken(1, 'market-test')}` };
beforeEach(() => { vi.resetAllMocks(); });

describe('authenticated market API', () => {
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
});
