import type { Asset } from '@/types';
import { WATCHLIST } from '@contracts/watchlist';
import { marketJSON } from './marketClient';

/** A user-entered stock symbol, not a verified listing or quote. */
export function stockSymbolCandidate(query: string): Asset | null {
  const symbol = query.trim().toUpperCase();
  return /^[A-Z]{1,5}(?:[.-][A-Z])?$/.test(symbol)
    ? { id: symbol, symbol, name: symbol, assetClass: 'stock' } : null;
}

export async function searchAssets(query: string, signal?: AbortSignal): Promise<Asset[]> {
  signal?.throwIfAborted();
  const q = query.trim();
  if (!q) return [];
  const local = WATCHLIST.filter(a => `${a.symbol} ${a.name}`.toUpperCase().includes(q.toUpperCase()));
  let remote: Asset[] = [];
  try { remote = await marketJSON<Asset[]>('search', { q }, signal); }
  catch (error) { signal?.throwIfAborted(); if (!local.length) throw error; }
  signal?.throwIfAborted();
  return [...new Map([...local, ...remote].map(a => [`${a.assetClass}:${a.id}`, a])).values()].slice(0, 8);
}
