import type { AssetAnalysis } from '@/types';
import type { Position } from './portfolio';

type ScannerAsset = Pick<AssetAnalysis, 'asset' | 'composite' | 'change24h' | 'price'>;
export type ScannerSignal = 'all' | 'buy' | 'sell' | 'neutral';
export type ScannerSort = 'score' | 'change' | 'symbol';

export function selectScannerAssets<T extends ScannerAsset>(analyses: T[], options: {
  assetClass: 'all' | 'stock' | 'crypto';
  signal: ScannerSignal;
  query: string;
  sort: ScannerSort;
}): T[] {
  const query = options.query.trim().toLocaleLowerCase('es');
  return analyses.filter(a => {
    if (options.assetClass !== 'all' && a.asset.assetClass !== options.assetClass) return false;
    if (options.signal === 'buy' && a.composite < 20) return false;
    if (options.signal === 'sell' && a.composite > -20) return false;
    if (options.signal === 'neutral' && (a.composite >= 20 || a.composite <= -20)) return false;
    return !query || `${a.asset.symbol} ${a.asset.name}`.toLocaleLowerCase('es').includes(query);
  }).sort((a, b) => {
    if (options.sort === 'symbol') return a.asset.symbol.localeCompare(b.asset.symbol);
    if (options.sort === 'change') {
      if (a.change24h === null) return b.change24h === null ? 0 : 1;
      if (b.change24h === null) return -1;
      return b.change24h - a.change24h;
    }
    return b.composite - a.composite;
  });
}

export function portfolioAnalyses<T extends Pick<AssetAnalysis, 'asset'>>(
  analyses: T[], positions: Pick<Position, 'assetId' | 'assetClass'>[],
): T[] {
  const keys = new Set(positions.map(p => `${p.assetClass}:${p.assetId}`));
  return analyses.filter(a => keys.has(`${a.asset.assetClass}:${a.asset.id}`));
}
