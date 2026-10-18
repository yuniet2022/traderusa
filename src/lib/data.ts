import type { Asset, Candle, Quote, CandleHistory } from '@/types';
import { MarketRequestError, marketJSON } from './marketClient';
import { fetchLiveCrypto, fetchLiveStocks } from './live';
export { WATCHLIST } from '@contracts/watchlist';

const CACHE_TTL = 5 * 60 * 1000;
const MAX_STALE = 24 * 60 * 60 * 1000;
function cacheGet(key: string, maxAge = CACHE_TTL): CandleHistory | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { t, v } = JSON.parse(raw);
    const age = Date.now() - Math.min(t, v?.fetchedAt ?? t);
    if (!Number.isFinite(age) || age < 0 || age >= maxAge || !Array.isArray(v?.candles) || v.candles.length < 60 || typeof v.source !== 'string') return null;
    if (v.candles.some((c: Candle) => ![c.time, c.open, c.high, c.low, c.close, c.volume].every(Number.isFinite)
      || c.time <= 0 || Math.min(c.open, c.high, c.low, c.close) <= 0 || c.volume < 0
      || c.high < Math.max(c.open, c.close, c.low) || c.low > Math.min(c.open, c.close, c.high))) return null;
    return { ...v, cached: true, ...(v.stale || age >= CACHE_TTL ? { stale: true } : {}) };
  } catch { return null; }
}

export function loadCachedCandles(asset: Asset): CandleHistory | null {
  return cacheGet(`history:v3:${asset.assetClass}:${asset.id}`, MAX_STALE);
}
function cacheSet(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), v: value })); } catch { /* Storage may be unavailable. */ }
}

export async function loadCandles(asset: Asset, signal?: AbortSignal): Promise<CandleHistory> {
  signal?.throwIfAborted();
  const key = `history:v3:${asset.assetClass}:${asset.id}`;
  const cached = cacheGet(key);
  if (cached && !cached.stale) return { ...cached, cached: true };
  try {
    const history = await marketJSON<CandleHistory>('history', { assetClass: asset.assetClass, id: asset.id, timeframe: 'scan' }, signal);
    if (!Array.isArray(history.candles) || history.candles.length < 60) throw new Error(`Datos insuficientes para ${asset.symbol}`);
    cacheSet(key, history);
    return history;
  } catch (error) {
    if (signal?.aborted || (error instanceof MarketRequestError && error.status >= 400 && error.status < 500 && error.status !== 429)) throw error;
    const previous = loadCachedCandles(asset);
    if (previous) return { ...previous, cached: true, stale: true };
    throw error;
  }
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
export async function loadTimeframeHistory(asset: Asset, timeframe: Timeframe, signal?: AbortSignal): Promise<CandleHistory> {
  return marketJSON<CandleHistory>('history', { assetClass: asset.assetClass, id: asset.id, timeframe }, signal);
}
export async function loadTimeframeCandles(asset: Asset, timeframe: Timeframe, signal?: AbortSignal): Promise<Candle[]> {
  return (await loadTimeframeHistory(asset, timeframe, signal)).candles;
}
