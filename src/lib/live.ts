import type { AssetClass, Quote } from '@/types';
import { marketJSON } from './marketClient';

async function quotes(assetClass: AssetClass, symbols: string[]): Promise<Record<string, Quote>> {
  const unique = [...new Set(symbols)];
  if (!unique.length) return {};
  const chunks = Array.from({ length: Math.ceil(unique.length / 40) }, (_, i) => unique.slice(i * 40, (i + 1) * 40));
  const results = await Promise.allSettled(chunks.map(chunk => marketJSON<Record<string, Quote>>('quotes', { assetClass, symbols: chunk.join(',') })));
  return Object.assign({}, ...results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []));
}
export function fetchLiveCrypto(symbols: string[]) { return quotes('crypto', symbols); }
export function fetchLiveStocks(symbols: string[]) { return quotes('stock', symbols); }
export async function fetchLiveStock(symbol: string): Promise<Quote | null> {
  return (await fetchLiveStocks([symbol]))[symbol] ?? null;
}
