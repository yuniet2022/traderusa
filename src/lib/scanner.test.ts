import { describe, expect, it } from 'vitest';
import { portfolioAnalyses, selectScannerAssets } from './scanner';

const analyses = [
  { asset: { id: 'ABC', symbol: 'ABC', name: 'Alpha company', assetClass: 'stock' as const }, composite: 30, price: 100, change24h: null },
  { asset: { id: 'BTC', symbol: 'BTC', name: 'Bitcoin', assetClass: 'crypto' as const }, composite: 80, price: 50000, change24h: 5 },
  { asset: { id: 'ABC', symbol: 'ABC', name: 'ABC coin', assetClass: 'crypto' as const }, composite: -40, price: 1, change24h: -2 },
  { asset: { id: 'MSFT', symbol: 'MSFT', name: 'Microsoft', assetClass: 'stock' as const }, composite: 0, price: 300, change24h: 0 },
];
const defaults = { assetClass: 'all' as const, signal: 'all' as const, query: '', sort: 'score' as const };

describe('market scanner', () => {
  it('ranks opportunities by score without mutating the market data', () => {
    const order = analyses.map(a => a.composite);
    expect(selectScannerAssets(analyses, defaults).map(a => a.composite)).toEqual([80, 30, 0, -40]);
    expect(analyses.map(a => a.composite)).toEqual(order);
  });

  it('combines asset class, signal and case-insensitive name filters', () => {
    const filtered = selectScannerAssets(analyses, { ...defaults, assetClass: 'stock', signal: 'buy', query: ' ALPHA ' });
    expect(filtered).toEqual([analyses[0]]);
  });

  it('puts missing changes last rather than treating them as zero', () => {
    expect(selectScannerAssets(analyses, { ...defaults, sort: 'change' }).map(a => a.change24h)).toEqual([5, 0, -2, null]);
  });

  it('includes only neutral assets in the neutral filter', () => {
    expect(selectScannerAssets(analyses, { ...defaults, signal: 'neutral' })).toEqual([analyses[3]]);
  });

  it('matches portfolio holdings by both symbol and asset class', () => {
    expect(portfolioAnalyses(analyses, [{ assetId: 'ABC', assetClass: 'stock' }])).toEqual([analyses[0]]);
  });

  it('returns no matches for an unknown symbol', () => {
    expect(selectScannerAssets(analyses, { ...defaults, query: 'unknown' })).toEqual([]);
  });
});
