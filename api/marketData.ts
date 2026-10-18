import type { Asset, AssetClass, Candle, CandleHistory, Quote } from '../src/types';
import type { MarketTimeframe } from '../contracts/market';
import { WATCHLIST } from '../contracts/watchlist';
import { setTimeout as delay } from 'node:timers/promises';

export class MarketUnavailable extends Error {}
type Entry = { value: unknown; at: number; ttl: number };
type Chart = { chart?: { result?: { timestamp?: number[]; meta?: { regularMarketPrice?: number; previousClose?: number; chartPreviousClose?: number; regularMarketTime?: number; instrumentType?: string; longName?: string; shortName?: string }; indicators?: { quote?: { open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[]; volume?: (number | null)[] }[] } }[] } };
const TF = {
  scan: { binance: '1d', kraken: 1440, range: '2y', yahoo: '1d' },
  '1m': { binance: '1m', kraken: 1, range: '1d', yahoo: '1m' },
  '5m': { binance: '5m', kraken: 5, range: '5d', yahoo: '5m' },
  '15m': { binance: '15m', kraken: 15, range: '1mo', yahoo: '15m' },
  '1h': { binance: '1h', kraken: 60, range: '3mo', yahoo: '60m' },
  '1d': { binance: '1d', kraken: 1440, range: '2y', yahoo: '1d' },
  '1wk': { binance: '1w', kraken: 10080, range: '5y', yahoo: '1wk' },
} as const;

function cleanCandles(rows: Candle[], minimum: number): Candle[] {
  const sorted = new Map<number, Candle>();
  for (const c of rows) {
    if (![c.time, c.open, c.high, c.low, c.close, c.volume].every(Number.isFinite)
      || c.time <= 0 || Math.min(c.open, c.high, c.low, c.close) <= 0 || c.volume < 0
      || c.high < Math.max(c.open, c.close, c.low) || c.low > Math.min(c.open, c.close, c.high)) continue;
    sorted.set(c.time, c);
  }
  const result = [...sorted.values()].sort((a, b) => a.time - b.time).slice(-420);
  if (result.length < minimum) throw new MarketUnavailable('Insufficient OHLC history');
  return result;
}

function yahooCandles(data: Chart): Candle[] {
  const r = data.chart?.result?.[0];
  const q = r?.indicators?.quote?.[0];
  if (!q) throw new MarketUnavailable('No OHLC history');
  return (r.timestamp ?? []).flatMap((time, i) => {
    const values = [q.open?.[i], q.high?.[i], q.low?.[i], q.close?.[i], q.volume?.[i]];
    if (values.some(v => v == null)) return [];
    return [{ time, open: values[0]!, high: values[1]!, low: values[2]!, close: values[3]!, volume: values[4]! }];
  });
}

function weekly(daily: Candle[]): Candle[] {
  const weeks = new Map<number, Candle>();
  for (const candle of daily) {
    const d = new Date(candle.time * 1000);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    d.setUTCHours(0, 0, 0, 0);
    const key = d.getTime() / 1000;
    const w = weeks.get(key);
    if (w) { w.high = Math.max(w.high, candle.high); w.low = Math.min(w.low, candle.low); w.close = candle.close; w.volume += candle.volume; }
    else weeks.set(key, { ...candle, time: key });
  }
  return [...weeks.values()];
}

export function createMarketService(options: { fetch?: typeof fetch; now?: () => number; timeoutMs?: number; spacingMs?: number } = {}) {
  const request = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const now = options.now ?? Date.now;
  const timeout = options.timeoutMs ?? 4500;
  const cache = new Map<string, Entry>();
  const pending = new Map<string, Promise<{ value: unknown; cached: boolean }>>();
  const failed = new Map<string, number>();
  const cooldown = new Map<string, number>();
  const nextRequest = new Map<string, number>();
  let active = 0;
  const waiting: { resume: () => void; signal: AbortSignal }[] = [];

  async function acquire(signal: AbortSignal) {
    signal.throwIfAborted();
    if (active < 4) { active++; return; }
    if (waiting.length >= 64) throw new MarketUnavailable('Market queue full');
    await new Promise<void>((resolve, reject) => {
      const entry = { signal, resume: () => { signal.removeEventListener('abort', abort); resolve(); } };
      const abort = () => { const index = waiting.indexOf(entry); if (index >= 0) waiting.splice(index, 1); reject(new MarketUnavailable('Market request expired')); };
      signal.addEventListener('abort', abort, { once: true });
      waiting.push(entry);
    });
  }
  function release() {
    const next = waiting.shift();
    if (next) next.resume();
    else active--;
  }

  async function upstream(url: string, signal: AbortSignal, text = false): Promise<unknown> {
    const host = new URL(url).hostname;
    if ((cooldown.get(host) ?? 0) > now()) throw new MarketUnavailable('Provider cooling down');
    await acquire(signal);
    try {
      signal.throwIfAborted();
      if ((cooldown.get(host) ?? 0) > now()) throw new MarketUnavailable('Provider cooling down');
      const spacing = options.spacingMs ?? ({ 'api.kraken.com': 1100, 'stooq.com': 200, 'query1.finance.yahoo.com': 250, 'api.binance.com': 100 } as Record<string, number>)[host] ?? 250;
      const start = Math.max(now(), nextRequest.get(host) ?? 0);
      nextRequest.set(host, start + spacing);
      if (start > now()) await delay(start - now(), undefined, { signal });
      signal.throwIfAborted();
      if ((cooldown.get(host) ?? 0) > now()) throw new MarketUnavailable('Provider cooling down');
      const res = await request(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(timeout)]), headers: { Accept: text ? 'text/csv' : 'application/json', 'User-Agent': 'TraderUSA/1.0' } });
      if (!res.ok) {
        if ([401, 403, 429, 451].includes(res.status)) {
          const retry = Number(res.headers.get('retry-after'));
          cooldown.set(host, now() + Math.min(600_000, Math.max(60_000, Number.isFinite(retry) ? retry * 1000 : 0)));
          console.warn('[MARKET_SOURCE_ERROR]', JSON.stringify({ source: host, code: `HTTP_${res.status}` }));
        }
        await res.body?.cancel();
        throw new MarketUnavailable(`Provider HTTP ${res.status}`);
      }
      // Bound the payload while streaming so a provider cannot exhaust the app heap.
      const reader = res.body?.getReader();
      if (!reader) throw new MarketUnavailable('Empty provider response');
      let size = 0; const chunks: Uint8Array[] = [];
      try {
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > 2_000_000) { await reader.cancel(); throw new MarketUnavailable('Provider response too large'); }
          chunks.push(part.value);
        }
      } finally { reader.releaseLock(); }
      const raw = Buffer.concat(chunks).toString('utf8');
      return text ? raw : JSON.parse(raw);
    } catch (error) {
      if (error instanceof Error && ['TimeoutError', 'AbortError', 'TypeError'].includes(error.name)) {
        cooldown.set(host, now() + 15_000);
        console.warn('[MARKET_SOURCE_ERROR]', JSON.stringify({ source: host, code: 'NETWORK_OR_TIMEOUT' }));
      }
      throw error;
    } finally { release(); }
  }

  async function remember<T>(key: string, ttl: number, maxStale: number, load: () => Promise<T>): Promise<{ value: T; cached: boolean }> {
    const old = cache.get(key);
    if (old && now() - old.at < old.ttl) return { value: old.value as T, cached: true };
    if ((failed.get(key) ?? 0) > now()) {
      if (old && now() - old.at < maxStale) return { value: old.value as T, cached: true };
      throw new MarketUnavailable('Market temporarily unavailable');
    }
    const inProgress = pending.get(key);
    if (inProgress) return inProgress as Promise<{ value: T; cached: boolean }>;
    const promise = (async () => {
      try {
        const value = await load();
        cache.delete(key); cache.set(key, { value, at: now(), ttl });
        if (cache.size > 160) cache.delete(cache.keys().next().value!);
        failed.delete(key);
        return { value, cached: false };
      } catch {
        failed.set(key, now() + 30_000);
        if (failed.size > 256) failed.delete(failed.keys().next().value!);
        if (old && now() - old.at < maxStale) return { value: old.value as T, cached: true };
        throw new MarketUnavailable('Market temporarily unavailable');
      } finally { pending.delete(key); }
    })();
    pending.set(key, promise);
    return promise;
  }

  const krakenPair = (id: string) => `${({ BTC: 'XBT', DOGE: 'XDG' } as Record<string, string>)[id] ?? id}USD`;
  async function yahoo(id: string, assetClass: AssetClass, range: string, interval: string, signal: AbortSignal) {
    const symbol = assetClass === 'crypto' ? `${id}-USD` : id;
    const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
    url.search = new URLSearchParams({ range, interval }).toString();
    return await upstream(url.toString(), signal) as Chart;
  }

  async function history(assetClass: AssetClass, id: string, tf: MarketTimeframe = 'scan'): Promise<CandleHistory> {
    const ttl = tf === 'scan' ? 300_000 : 5_000;
    const result = await remember(`h:${assetClass}:${id}:${tf}`, ttl, 86_400_000, async () => {
      const signal = AbortSignal.timeout(12_000);
      const cfg = TF[tf];
      const minimum = tf === 'scan' ? 60 : 20;
      const sources: { name: string; load: () => Promise<Candle[]> }[] = [];
      if (assetClass === 'stock' && ['scan', '1d', '1wk'].includes(tf)) sources.push({ name: 'Stooq', load: async () => {
        const start = new Date(now() - (tf === '1wk' ? 6 : 2) * 366 * 86_400_000).toISOString().slice(0, 10).replaceAll('-', '');
        const end = new Date(now()).toISOString().slice(0, 10).replaceAll('-', '');
        const raw = await upstream(`https://stooq.com/q/d/l/?s=${encodeURIComponent(id.toLowerCase())}.us&i=d&d1=${start}&d2=${end}`, signal, true) as string;
        if (!raw.trim().startsWith('Date,Open,High,Low,Close,Volume')) throw new MarketUnavailable('No CSV history');
        const rows = raw.trim().split(/\r?\n/).slice(1).map(line => {
          const [date, open, high, low, close, volume] = line.split(',');
          return { time: Date.parse(`${date}T00:00:00Z`) / 1000, open: Number(open), high: Number(high), low: Number(low), close: Number(close), volume: Number(volume) };
        });
        return tf === '1wk' ? weekly(rows) : rows;
      } });
      if (assetClass === 'crypto') {
        sources.push({ name: 'Kraken', load: async () => {
          const data = await upstream(`https://api.kraken.com/0/public/OHLC?pair=${krakenPair(id)}&interval=${cfg.kraken}&since=${Math.floor(now() / 1000 - cfg.kraken * 60 * 420)}`, signal) as { error?: string[]; result?: Record<string, unknown> };
          if (data.error?.length) throw new MarketUnavailable('Pair unavailable');
          const rows = Object.entries(data.result ?? {}).find(([key]) => key !== 'last')?.[1];
          if (!Array.isArray(rows)) throw new MarketUnavailable('No OHLC history');
          return rows.map(k => ({ time: Number(k[0]), open: Number(k[1]), high: Number(k[2]), low: Number(k[3]), close: Number(k[4]), volume: Number(k[6]) }));
        } });
        sources.push({ name: 'Binance', load: async () => {
          const rows = await upstream(`https://api.binance.com/api/v3/klines?symbol=${id}USDT&interval=${cfg.binance}&limit=420`, signal) as unknown[][];
          if (!Array.isArray(rows)) throw new MarketUnavailable('No OHLC history');
          return rows.map(k => ({ time: Number(k[0]) / 1000, open: Number(k[1]), high: Number(k[2]), low: Number(k[3]), close: Number(k[4]), volume: Number(k[5]) }));
        } });
      }
      let priceAsOf: number | undefined;
      sources.push({ name: 'Yahoo Finance', load: async () => {
        const data = await yahoo(id, assetClass, cfg.range, cfg.yahoo, signal);
        const timestamp = data.chart?.result?.[0]?.meta?.regularMarketTime;
        priceAsOf = timestamp && Number.isFinite(timestamp) ? timestamp * 1000 : undefined;
        return yahooCandles(data);
      } });
      // A daily chart needs today's partial candle when available. Stooq's
      // daily closes remain a fallback and the scanner's original first source.
      if (assetClass === 'stock' && tf !== 'scan') sources.reverse();
      for (const source of sources) {
        try { return {
          candles: cleanCandles(await source.load(), minimum), source: source.name,
          fetchedAt: now(), priceAsOf: source.name === 'Yahoo Finance' ? priceAsOf : undefined,
          dailyCloseOnly: source.name === 'Stooq',
        }; }
        catch { if (signal.aborted) break; }
      }
      throw new MarketUnavailable('No history providers available');
    });
    return { ...result.value, cached: result.cached, stale: now() - result.value.fetchedAt >= ttl };
  }

  async function quote(assetClass: AssetClass, id: string): Promise<Quote> {
    const result = await remember(`q:${assetClass}:${id}`, 30_000, 300_000, async () => {
      const signal = AbortSignal.timeout(10_000);
      if (assetClass === 'crypto') {
        try {
          const data = await upstream(`https://api.kraken.com/0/public/Ticker?pair=${krakenPair(id)}`, signal) as { error?: string[]; result?: Record<string, { c?: string[] }> };
          const price = Number(Object.values(data.result ?? {})[0]?.c?.[0]);
          if (data.error?.length || !Number.isFinite(price) || price <= 0) throw new MarketUnavailable('No quote');
          return { price, change24h: null, source: 'Kraken', receivedAt: now() };
        } catch { /* Try the next source within the same deadline. */ }
      }
      const data = await yahoo(id, assetClass, '1d', '5m', signal);
      const meta = data.chart?.result?.[0]?.meta;
      const price = meta?.regularMarketPrice;
      if (!price || !Number.isFinite(price) || price <= 0) throw new MarketUnavailable('No quote');
      const previous = meta?.previousClose ?? meta?.chartPreviousClose;
      return { price, change24h: previous && previous > 0 ? (price / previous - 1) * 100 : null, source: 'Yahoo Finance', asOf: meta?.regularMarketTime ? meta.regularMarketTime * 1000 : undefined, receivedAt: now() };
    });
    return { ...result.value, cached: result.cached };
  }

  async function quotes(assetClass: AssetClass, ids: string[]) {
    const entries = await Promise.allSettled([...new Set(ids)].map(async id => [id, await quote(assetClass, id)] as const));
    return Object.fromEntries(entries.flatMap(result => result.status === 'fulfilled' ? [result.value] : []));
  }

  async function search(query: string): Promise<Asset[]> {
    const result = await remember(`s:${query.toUpperCase()}`, 300_000, 3_600_000, async () => {
      const signal = AbortSignal.timeout(10_000);
      const local = WATCHLIST.filter(a => `${a.symbol} ${a.name}`.toUpperCase().includes(query.toUpperCase()));
      const remote: Asset[] = [];
      try {
        const data = await upstream(`https://query1.finance.yahoo.com/v1/finance/search?${new URLSearchParams({ q: query, quotesCount: '8', newsCount: '0', listsCount: '0' })}`, signal) as { quotes?: { symbol?: string; shortname?: string; longname?: string; quoteType?: string }[] };
        for (const item of data.quotes ?? []) {
          if (!item.symbol) continue;
          const assetClass = item.quoteType === 'CRYPTOCURRENCY' && item.symbol.endsWith('-USD') ? 'crypto' : ['EQUITY', 'ETF'].includes(item.quoteType ?? '') ? 'stock' : null;
          const id = assetClass === 'crypto' ? item.symbol.slice(0, -4).toUpperCase() : item.symbol.toUpperCase();
          if (assetClass && /^[A-Z0-9][A-Z0-9.^=-]{0,19}$/.test(id)) remote.push({ id, symbol: id, name: item.shortname || item.longname || id, assetClass });
        }
      } catch { /* Watchlist results remain usable while remote search is unavailable. */ }
      const exact = query.toUpperCase();
      if (/^[A-Z]{1,5}$/.test(exact) && ![...local, ...remote].some(a => a.assetClass === 'stock' && a.id === exact) && !signal.aborted) {
        try {
          const meta = (await yahoo(exact, 'stock', '5d', '1d', signal)).chart?.result?.[0]?.meta;
          if (meta?.regularMarketPrice && ['EQUITY', 'ETF'].includes(meta.instrumentType ?? '')) remote.push({ id: exact, symbol: exact, name: meta.longName || meta.shortName || exact, assetClass: 'stock' });
        } catch { /* No verified exact match. */ }
      }
      return [...new Map([...local, ...remote].map(a => [`${a.assetClass}:${a.id}`, a])).values()].slice(0, 8);
    });
    return result.value;
  }

  return { history, quotes, search };
}
