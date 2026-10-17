import type { Asset } from '@/types';
import { WATCHLIST } from '@contracts/watchlist';
import { marketJSON } from './marketClient';

export async function searchAssets(query: string, signal?: AbortSignal): Promise<Asset[]> {
  signal?.throwIfAborted();
  const q = query.trim();
  if (!q) return [];
  const local = WATCHLIST.filter(a => `${a.symbol} ${a.name}`.toUpperCase().includes(q.toUpperCase()));
  let remote: Asset[] = [];
  try { remote = await marketJSON<Asset[]>('search', { q }, signal); }
  catch { signal?.throwIfAborted(); }
  signal?.throwIfAborted();
  return [...new Map([...local, ...remote].map(a => [`${a.assetClass}:${a.id}`, a])).values()].slice(0, 8);
}
