import type { Asset, Candle, Quote, CandleHistory } from '@/types';
import { marketJSON } from './marketClient';
import { fetchLiveCrypto, fetchLiveStocks } from './live';
export { WATCHLIST } from '@contracts/watchlist';

const CACHE_TTL = 5 * 60 * 1000;
function cacheGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { t, v } = JSON.parse(raw);
    return Date.now() - t < CACHE_TTL ? v as T : null;
  } catch { return null; }
}
function cacheSet(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), v: value })); } catch { /* Storage may be unavailable. */ }
}

export async function loadCandles(asset: Asset, signal?: AbortSignal): Promise<CandleHistory> {
  signal?.throwIfAborted();
  const key = `history:v3:${asset.assetClass}:${asset.id}`;
  const cached = cacheGet<CandleHistory>(key);
  if (cached) return { ...cached, cached: true };
  const history = await marketJSON<CandleHistory>('history', { assetClass: asset.assetClass, id: asset.id, timeframe: 'scan' }, signal);
  if (!Array.isArray(history.candles) || history.candles.length < 60) throw new Error(`Datos insuficientes para ${asset.symbol}`);
  cacheSet(key, history);
  return history;
}

export async function fetchCryptoCandles(symbol: string): Promise<Candle[]> {
  return (await loadCandles({ id: symbol, symbol, name: symbol, assetClass: 'crypto' })).candles;
}
export async function fetchStockCandles(symbol: string): Promise<Candle[]> {
  return (await loadCandles({ id: symbol, symbol, name: symbol, assetClass: 'stock' })).candles;
}
export const fetchCryptoQuotes = fetchLiveCrypto;

export async function loadQuotes(assets: Asset[]): Promise<Record<string, Quote>> {
  const crypto = assets.filter(a => a.assetClass === 'crypto').map(a => a.id);
  const stocks = assets.filter(a => a.assetClass === 'stock').map(a => a.id);
  const results = await Promise.allSettled([fetchLiveCrypto(crypto), fetchLiveStocks(stocks)]);
  const out: Record<string, Quote> = {};
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') for (const [id, quote] of Object.entries(result.value)) out[`${i === 0 ? 'crypto' : 'stock'}:${id}`] = quote;
  });
  return out;
}

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '1d' | '1wk';
export const TIMEFRAMES: { id: Timeframe; label: string }[] = [
  { id: '1m', label: '1 min' }, { id: '5m', label: '5 min' }, { id: '15m', label: '15 min' },
  { id: '1h', label: '1 h' }, { id: '1d', label: '1 día' }, { id: '1wk', label: '1 sem' },
];
export async function loadTimeframeCandles(asset: Asset, timeframe: Timeframe): Promise<Candle[]> {
  const history = await marketJSON<CandleHistory>('history', { assetClass: asset.assetClass, id: asset.id, timeframe });
  return history.candles;
}
