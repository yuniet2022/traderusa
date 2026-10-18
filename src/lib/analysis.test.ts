import { describe, expect, it } from 'vitest';
import type { Asset, Candle, CandleHistory } from '@/types';
import { buildAssetAnalysis, repriceAnalysis } from './analysis';
import { buildSnapshot, runStrategies, compositeScore, detectRegime } from './strategies';

const asset: Asset = { id: 'TEST', symbol: 'TEST', name: 'Test asset', assetClass: 'stock' };
const start = Date.UTC(2025, 0, 1) / 1000;
const candles: Candle[] = Array.from({ length: 300 }, (_, i) => ({ time: start + i * 86400, open: 100, close: 100, high: 101, low: 99, volume: 1000 }));
const history: CandleHistory = { candles, source: 'Test history', cached: false };
const quoteTime = candles.at(-1)!.time * 1000 + 3600000;

describe('strategy correctness', () => {
  it.each([[0, 50], [-10, 25], [-20, 0], [-40, -50], [-80, -100]])('scores annual-high distance %s as %s', (distance, expected) => {
    const snapshot = { ...buildSnapshot(candles), distHigh52w: distance };
    expect(runStrategies(snapshot).find(v => v.strategyId === 'high52')?.score).toBe(expected);
  });

  it('keeps a flat trend neutral instead of interpreting equal averages as bearish crosses', () => {
    const snapshot = buildSnapshot(candles);
    const votes = runStrategies(snapshot);
    expect(votes.find(v => v.strategyId === 'trend')?.score).toBe(0);
    expect(buildAssetAnalysis(asset, history).signal).toBe('NEUTRAL');
    expect(Number.isFinite(compositeScore(votes, detectRegime(snapshot)))).toBe(true);
  });

  it('describes the 3/6-month rule as absolute, without claiming a peer ranking', () => {
    expect(runStrategies(buildSnapshot(candles)).find(v => v.strategyId === 'csmom')?.strategyName).toContain('absoluto');
  });
});

describe('quote-driven analysis', () => {
  it('recalculates the whole analysis, including the signal and levels, without mutating history', () => {
    const before = buildAssetAnalysis(asset, history, undefined, 1);
    const original = structuredClone(before);
    const after = repriceAnalysis(before, { price: 50, change24h: -50, source: 'Test quote', asOf: quoteTime, receivedAt: 2 }, 3);
    expect(before).toEqual(original);
    expect(history.candles).toEqual(candles);
    expect(after.price).toBe(50);
    expect(after.indicators.lastPrice).toBe(50);
    expect(after.candles.at(-1)?.close).toBe(50);
    expect(after.indicators.rsi14).toBe(0);
    expect(after.votes).not.toEqual(before.votes);
    expect(after.signal).not.toBe(before.signal);
    expect(after.levels.entry).toBe(50);
    expect(after.updatedAt).toBe(3);
    expect(after.priceAsOf).toBe(quoteTime);
    expect(after.priceSource).toBe('Test quote');
  });

  it('matches a fresh calculation for a quote on the same bar', () => {
    const quote = { price: 90, change24h: -10, asOf: quoteTime };
    expect(repriceAnalysis(buildAssetAnalysis(asset, history), quote, 20)).toEqual(buildAssetAnalysis(asset, history, quote, 20));
  });

  it('starts a provisional bar on a new quote day and preserves prior daily closes', () => {
    const before = buildAssetAnalysis(asset, history);
    const after = repriceAnalysis(before, { price: 105, change24h: 5, asOf: quoteTime + 86400000 });
    expect(after.candles).toHaveLength(before.candles.length + 1);
    expect(after.candles.at(-2)).toEqual(before.candles.at(-1));
    expect(after.candles.at(-1)?.open).toBe(105);
    expect(after.historyAsOf).toBe(before.historyAsOf);
  });

  it.each([0, -1, NaN, Infinity])('ignores an invalid quote price %s', price => {
    const before = buildAssetAnalysis(asset, history);
    expect(repriceAnalysis(before, { price, change24h: null })).toBe(before);
  });

  it('does not replace a newer quote with an older provider observation', () => {
    const before = buildAssetAnalysis(asset, history, { price: 105, change24h: 5, asOf: quoteTime });
    expect(repriceAnalysis(before, { price: 90, change24h: -10, asOf: quoteTime - 1 })).toBe(before);
  });

  it('identifies historical and cached data without calling either live', () => {
    expect(buildAssetAnalysis(asset, history).dataSource).toBe('historical');
    expect(buildAssetAnalysis(asset, { ...history, cached: true }).dataSource).toBe('cached');
    expect(buildAssetAnalysis(asset, history, { price: 100, change24h: 0, cached: true }).dataSource).toBe('cached');
    expect(buildAssetAnalysis(asset, history, { price: 100, change24h: 0 }).priceAsOf).toBeNull();
  });

  it('keeps the daily-bar start separate from the provider observation and receipt times', () => {
    const queryTime = quoteTime + 3600000;
    const analysis = buildAssetAnalysis(asset, { ...history, fetchedAt: queryTime, priceAsOf: quoteTime }, undefined, queryTime + 999);
    expect(analysis.priceKind).toBe('historical');
    expect(analysis.historyAsOf).toBe(candles.at(-1)!.time * 1000);
    expect(analysis.priceAsOf).toBe(quoteTime);
    expect(analysis.historyFetchedAt).toBe(queryTime);
    expect(analysis.quoteReceivedAt).toBeNull();
  });

  it('does not substitute calculation time or candle start for missing provider timestamps', () => {
    const historical = buildAssetAnalysis(asset, history, undefined, 999999);
    expect(historical.priceAsOf).toBeNull(); expect(historical.historyFetchedAt).toBeNull();
    const quote = buildAssetAnalysis(asset, history, { price: 101, change24h: 1 }, 999999);
    expect(quote.priceKind).toBe('quote');
    expect(quote.priceAsOf).toBeNull(); expect(quote.quoteReceivedAt).toBeNull();
  });

  it('preserves original history receipt time through later cached quotes', () => {
    const historical = buildAssetAnalysis(asset, { ...history, fetchedAt: quoteTime });
    const quote = { price: 101, change24h: 1, asOf: quoteTime + 60000, receivedAt: quoteTime + 120000, cached: true };
    const repriced = repriceAnalysis(historical, quote, quoteTime + 999999);
    expect(repriced.priceKind).toBe('quote');
    expect(repriced.historyFetchedAt).toBe(quoteTime);
    expect(repriced.quoteReceivedAt).toBe(quote.receivedAt);
    expect(repriced.priceAsOf).toBe(quote.asOf);
    expect(repriceAnalysis(repriced, quote, quoteTime + 1999999).quoteReceivedAt).toBe(quote.receivedAt);
  });

  it('rejects a quote older than the latest known historical market observation', () => {
    const historical = buildAssetAnalysis(asset, { ...history, priceAsOf: quoteTime });
    expect(repriceAnalysis(historical, { price: 90, change24h: -10, asOf: quoteTime - 1 })).toBe(historical);
    expect(repriceAnalysis(buildAssetAnalysis(asset, history), { price: 90, change24h: -10, asOf: candles.at(-1)!.time * 1000 - 1 }).price).toBe(100);
  });
});
