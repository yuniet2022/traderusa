import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scanMarket } from './marketRefresh';
import type { Asset } from '@/types';

const assets: Asset[] = Array.from({ length: 8 }, (_, i) => ({ id: `STOCK${i}`, symbol: `STOCK${i}`, name: 'Test', assetClass: 'stock' }));
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
describe('bounded progressive market scan', () => {
  it('shows fast results before a slow asset and limits analysis concurrency', async () => {
    let active = 0; let maximum = 0;
    const result = vi.fn(); const progress = vi.fn();
    const pending = scanMarket(assets, async asset => {
      active++; maximum = Math.max(maximum, active);
      await new Promise(resolve => setTimeout(resolve, asset.id === 'STOCK0' ? 1000 : 10));
      active--; return asset.id;
    }, { signal: new AbortController().signal, onResult: result, onProgress: progress });
    await vi.advanceTimersByTimeAsync(40);
    expect(result).toHaveBeenCalled();
    expect(result.mock.calls.flat()).not.toContain('STOCK0');
    expect(maximum).toBe(4);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await pending).toMatchObject({ succeeded: 8, failed: 0, timedOut: false });
    expect(progress).toHaveBeenLastCalledWith(8);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('ends the scan when a provider ignores cancellation and never settles', async () => {
    const pending = scanMarket(assets, () => new Promise(() => {}), { signal: new AbortController().signal, onResult: vi.fn(), onProgress: vi.fn(), timeoutMs: 50 });
    await vi.advanceTimersByTimeAsync(50);
    expect(await pending).toMatchObject({ failed: 8, timedOut: true });
  });
  it('continues after an individual provider fails', async () => {
    const result = vi.fn();
    const summary = await scanMarket(assets, async asset => { if (asset.id === 'STOCK0') throw new Error('rate limited'); return asset; }, { signal: new AbortController().signal, onResult: result, onProgress: vi.fn() });
    expect(summary).toMatchObject({ succeeded: 7, failed: 1 });
    expect(result).toHaveBeenCalledTimes(7);
  });
  it('does not publish late results after the view is closed', async () => {
    const controller = new AbortController(); const result = vi.fn();
    const pending = scanMarket(assets, async asset => { await new Promise(resolve => setTimeout(resolve, 100)); return asset; }, { signal: controller.signal, onResult: result, onProgress: vi.fn() });
    await vi.advanceTimersByTimeAsync(1); controller.abort();
    await pending;
    await vi.advanceTimersByTimeAsync(100);
    expect(result).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('loads crypto before all the stock workers become stuck', async () => {
    const coins: Asset[] = ['BTC', 'ETH'].map(id => ({ id, symbol: id, name: id, assetClass: 'crypto' }));
    const result = vi.fn();
    const pending = scanMarket([...assets, ...coins], asset => asset.assetClass === 'stock'
      ? new Promise(() => {}) : new Promise(resolve => setTimeout(() => resolve(asset.id), 10)), {
      signal: new AbortController().signal, onResult: result, onProgress: vi.fn(), timeoutMs: 100,
    });
    await vi.advanceTimersByTimeAsync(10);
    expect(result.mock.calls.flat()).toEqual(['BTC', 'ETH']);
    await vi.advanceTimersByTimeAsync(100);
    expect(await pending).toMatchObject({ succeeded: 2, failed: assets.length, timedOut: true });
  });
});
