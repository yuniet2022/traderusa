import type { Quote } from '@/types';

async function getJSON(url: string, timeoutMs = 10000): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(t); }
}

/** Cripto en vivo: una sola llamada batched a Binance (sin key, CORS abierto) */
export async function fetchLiveCrypto(symbols: string[]): Promise<Record<string, Quote>> {
  if (symbols.length === 0) return {};
  const list = symbols.map(s => `"${s}USDT"`).join(',');
  const data = await getJSON(`https://api.binance.com/api/v3/ticker/24hr?symbols=[${list}]`) as { symbol: string; lastPrice: string; priceChangePercent: string }[];
  const out: Record<string, Quote> = {};
  for (const t of data) {
    out[t.symbol.replace('USDT', '')] = {
      price: parseFloat(t.lastPrice),
      change24h: parseFloat(t.priceChangePercent),
    };
  }
  return out;
}

/** Acciones casi en vivo: Yahoo chart intradía vía proxy CORS (retraso típico ~15 min en plan gratuito) */
export async function fetchLiveStock(symbol: string): Promise<Quote | null> {
  try {
    const target = encodeURIComponent(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1d&interval=5m`);
    const data = await getJSON(`https://api.allorigins.win/raw?url=${target}`, 12000) as {
      chart?: { result?: { meta?: { regularMarketPrice?: number; previousClose?: number; chartPreviousClose?: number } }[] }
    };
    const meta = data.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) return null;
    const prev = meta.previousClose ?? meta.chartPreviousClose;
    return {
      price: meta.regularMarketPrice,
      change24h: prev ? (meta.regularMarketPrice / prev - 1) * 100 : null,
    };
  } catch { return null; }
}

export async function fetchLiveStocks(symbols: string[]): Promise<Record<string, Quote>> {
  const out: Record<string, Quote> = {};
  const results = await Promise.allSettled(symbols.map(s => fetchLiveStock(s)));
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value) out[symbols[i]] = r.value;
  });
  return out;
}
