import type { Asset, Candle, Quote, CandleHistory } from '@/types';
import { fetchLiveStocks } from './live';

export const WATCHLIST: Asset[] = [
  // Acciones populares en Robinhood
  { id: 'NVDA', symbol: 'NVDA', name: 'NVIDIA', assetClass: 'stock' },
  { id: 'AAPL', symbol: 'AAPL', name: 'Apple', assetClass: 'stock' },
  { id: 'TSLA', symbol: 'TSLA', name: 'Tesla', assetClass: 'stock' },
  { id: 'MSFT', symbol: 'MSFT', name: 'Microsoft', assetClass: 'stock' },
  { id: 'AMZN', symbol: 'AMZN', name: 'Amazon', assetClass: 'stock' },
  { id: 'META', symbol: 'META', name: 'Meta Platforms', assetClass: 'stock' },
  { id: 'GOOGL', symbol: 'GOOGL', name: 'Alphabet', assetClass: 'stock' },
  { id: 'AMD', symbol: 'AMD', name: 'AMD', assetClass: 'stock' },
  { id: 'PLTR', symbol: 'PLTR', name: 'Palantir', assetClass: 'stock' },
  { id: 'COIN', symbol: 'COIN', name: 'Coinbase', assetClass: 'stock' },
  { id: 'SPY', symbol: 'SPY', name: 'S&P 500 ETF', assetClass: 'stock' },
  { id: 'QQQ', symbol: 'QQQ', name: 'Nasdaq 100 ETF', assetClass: 'stock' },
  // Cripto disponibles en Robinhood EE. UU. (65+ listadas; aquí las principales)
  { id: 'BTC', symbol: 'BTC', name: 'Bitcoin', assetClass: 'crypto' },
  { id: 'ETH', symbol: 'ETH', name: 'Ethereum', assetClass: 'crypto' },
  { id: 'SOL', symbol: 'SOL', name: 'Solana', assetClass: 'crypto' },
  { id: 'DOGE', symbol: 'DOGE', name: 'Dogecoin', assetClass: 'crypto' },
  { id: 'XRP', symbol: 'XRP', name: 'XRP', assetClass: 'crypto' },
  { id: 'ADA', symbol: 'ADA', name: 'Cardano', assetClass: 'crypto' },
  { id: 'AVAX', symbol: 'AVAX', name: 'Avalanche', assetClass: 'crypto' },
  { id: 'LINK', symbol: 'LINK', name: 'Chainlink', assetClass: 'crypto' },
  { id: 'LTC', symbol: 'LTC', name: 'Litecoin', assetClass: 'crypto' },
  { id: 'PEPE', symbol: 'PEPE', name: 'Pepe', assetClass: 'crypto' },
  { id: 'SHIB', symbol: 'SHIB', name: 'Shiba Inu', assetClass: 'crypto' },
  { id: 'BCH', symbol: 'BCH', name: 'Bitcoin Cash', assetClass: 'crypto' },
  { id: 'DOT', symbol: 'DOT', name: 'Polkadot', assetClass: 'crypto' },
  { id: 'UNI', symbol: 'UNI', name: 'Uniswap', assetClass: 'crypto' },
  { id: 'XLM', symbol: 'XLM', name: 'Stellar', assetClass: 'crypto' },
  { id: 'ETC', symbol: 'ETC', name: 'Ethereum Classic', assetClass: 'crypto' },
  { id: 'AAVE', symbol: 'AAVE', name: 'Aave', assetClass: 'crypto' },
  { id: 'NEAR', symbol: 'NEAR', name: 'Near Protocol', assetClass: 'crypto' },
  { id: 'ATOM', symbol: 'ATOM', name: 'Cosmos', assetClass: 'crypto' },
  { id: 'SUI', symbol: 'SUI', name: 'Sui', assetClass: 'crypto' },
  { id: 'HBAR', symbol: 'HBAR', name: 'Hedera', assetClass: 'crypto' },
  { id: 'ALGO', symbol: 'ALGO', name: 'Algorand', assetClass: 'crypto' },
  { id: 'XTZ', symbol: 'XTZ', name: 'Tezos', assetClass: 'crypto' },
  { id: 'COMP', symbol: 'COMP', name: 'Compound', assetClass: 'crypto' },
  { id: 'BNB', symbol: 'BNB', name: 'BNB', assetClass: 'crypto' },
];

const CG_IDS: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', DOGE: 'dogecoin', XRP: 'ripple',
  ADA: 'cardano', AVAX: 'avalanche-2', LINK: 'chainlink', LTC: 'litecoin', PEPE: 'pepe',
  SHIB: 'shiba-inu', BCH: 'bitcoin-cash', DOT: 'polkadot', UNI: 'uniswap', XLM: 'stellar',
  ETC: 'ethereum-classic', AAVE: 'aave', NEAR: 'near', ATOM: 'cosmos', SUI: 'sui',
  HBAR: 'hedera-hashgraph', ALGO: 'algorand', XTZ: 'tezos', COMP: 'compound-coin', BNB: 'binancecoin',
};

const CACHE_TTL = 5 * 60 * 1000;

function cacheGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { t, v } = JSON.parse(raw);
    if (Date.now() - t > CACHE_TTL) return null;
    return v as T;
  } catch { return null; }
}
function cacheSet(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), v })); } catch { /* ignore */ }
}

async function getJSON(url: string, timeoutMs = 12000): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(t); }
}
async function getText(url: string, timeoutMs = 12000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally { clearTimeout(t); }
}

/* ================= CRIPTO ================= */

/** 1) Binance klines (tiempo real, sin key, CORS abierto) */
async function cryptoCandlesBinance(symbol: string): Promise<Candle[]> {
  const data = await getJSON(`https://api.binance.com/api/v3/klines?symbol=${symbol}USDT&interval=1d&limit=400`) as unknown[][];
  return data.map(k => ({
    time: Math.floor((k[0] as number) / 1000),
    open: parseFloat(k[1] as string), high: parseFloat(k[2] as string),
    low: parseFloat(k[3] as string), close: parseFloat(k[4] as string),
    volume: parseFloat(k[5] as string),
  }));
}

/** 2) CoinGecko market_chart */
async function cryptoCandlesCoinGecko(symbol: string): Promise<Candle[]> {
  const id = CG_IDS[symbol];
  if (!id) throw new Error('sin id CoinGecko');
  const data = await getJSON(`https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=365&interval=daily`) as { prices?: [number, number][]; total_volumes?: [number, number][] };
  const prices = data.prices ?? [];
  const vols = data.total_volumes ?? [];
  if (prices.length < 60) throw new Error('datos insuficientes');
  return prices.map(([t, p], i) => ({
    time: Math.floor(t / 1000),
    open: i > 0 ? prices[i - 1][1] : p,
    high: Math.max(p, i > 0 ? prices[i - 1][1] : p),
    low: Math.min(p, i > 0 ? prices[i - 1][1] : p),
    close: p,
    volume: vols[i]?.[1] ?? 0,
  }));
}

/** 3) CoinPaprika historical */
const PAPRIKA_IDS: Record<string, string> = {
  BTC: 'btc-bitcoin', ETH: 'eth-ethereum', SOL: 'sol-solana', DOGE: 'doge-dogecoin',
  XRP: 'xrp-xrp', ADA: 'ada-cardano', AVAX: 'avax-avalanche', LINK: 'link-chainlink',
  LTC: 'ltc-litecoin', PEPE: 'pepe-pepe', SHIB: 'shib-shiba-inu', BCH: 'bch-bitcoin-cash',
  DOT: 'dot-polkadot', UNI: 'uni-uniswap', XLM: 'xlm-stellar', ETC: 'etc-ethereum-classic',
  AAVE: 'aave-aave', NEAR: 'near-near-protocol', ATOM: 'atom-cosmos', SUI: 'sui-sui',
  HBAR: 'hbar-hedera-hashgraph', ALGO: 'algo-algorand', XTZ: 'xtz-tezos',
  COMP: 'comp-compound', BNB: 'bnb-binance-coin',
};

async function cryptoCandlesPaprika(symbol: string): Promise<Candle[]> {
  const id = PAPRIKA_IDS[symbol];
  if (!id) throw new Error('sin id CoinPaprika');
  const start = new Date(Date.now() - 400 * 86400000).toISOString().slice(0, 10);
  const data = await getJSON(`https://api.coinpaprika.com/v1/tickers/${id}/historical?start=${start}&interval=24h`) as { timestamp: string; open: number; high: number; low: number; close: number; volume: number }[];
  if (!Array.isArray(data) || data.length < 60) throw new Error('datos insuficientes');
  return data.map(d => ({
    time: Math.floor(new Date(d.timestamp).getTime() / 1000),
    open: d.open, high: d.high, low: d.low, close: d.close, volume: d.volume,
  }));
}

async function fetchCryptoHistory(symbol: string): Promise<CandleHistory> {
  const key = `crc:v2:${symbol}`;
  const cached = cacheGet<CandleHistory>(key);
  if (cached) return { ...cached, cached: true };
  const providers = [
    { name: 'Binance', fetch: cryptoCandlesBinance },
    { name: 'CoinGecko', fetch: cryptoCandlesCoinGecko },
    { name: 'CoinPaprika', fetch: cryptoCandlesPaprika },
  ];
  let lastErr: unknown = null;
  for (const p of providers) {
    try {
      const candles = await p.fetch(symbol);
      if (candles.length >= 60) {
        const history = { candles, source: p.name, cached: false };
        cacheSet(key, history); return history;
      }
    } catch (e) { lastErr = e; }
  }
  throw lastErr ?? new Error('sin proveedores de cripto');
}

export async function fetchCryptoCandles(symbol: string): Promise<Candle[]> {
  return (await fetchCryptoHistory(symbol)).candles;
}

export async function fetchCryptoQuotes(symbols: string[]): Promise<Record<string, Quote>> {
  const key = `crq:v2:${symbols.join(',')}`;
  const cached = cacheGet<Record<string, Quote>>(key);
  if (cached) return Object.fromEntries(Object.entries(cached).map(([id, quote]) => [id, { ...quote, cached: true }]));
  // Binance: una sola llamada para todos
  try {
    const list = symbols.map(s => `"${s}USDT"`).join(',');
    const data = await getJSON(`https://api.binance.com/api/v3/ticker/24hr?symbols=[${list}]`) as { symbol: string; lastPrice: string; priceChangePercent: string; closeTime?: number }[];
    const out: Record<string, Quote> = {};
    for (const t of data) {
      out[t.symbol.replace('USDT', '')] = {
        price: parseFloat(t.lastPrice),
        change24h: parseFloat(t.priceChangePercent),
        source: 'Binance', asOf: t.closeTime, receivedAt: Date.now(),
      };
    }
    if (Object.keys(out).length > 0) { cacheSet(key, out); return out; }
  } catch { /* siguiente proveedor */ }
  // CoinGecko fallback
  const ids = symbols.map(s => CG_IDS[s]).filter(Boolean);
  const data = await getJSON(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids.join(',')}&price_change_percentage=24h`) as { id: string; current_price: number; price_change_percentage_24h: number | null; last_updated?: string }[];
  const out: Record<string, Quote> = {};
  for (const c of data) {
    const sym = Object.keys(CG_IDS).find(k => CG_IDS[k] === c.id);
    if (sym) out[sym] = {
      price: c.current_price, change24h: c.price_change_percentage_24h ?? null,
      source: 'CoinGecko', asOf: c.last_updated ? Date.parse(c.last_updated) : undefined, receivedAt: Date.now(),
    };
  }
  cacheSet(key, out);
  return out;
}

/* ================= ACCIONES ================= */

/** 1) Stooq CSV diario */
async function stockCandlesStooq(symbol: string): Promise<Candle[]> {
  const text = await getText(`https://stooq.com/q/d/l/?s=${symbol.toLowerCase()}.us&i=d`);
  if (text.includes('<html') || text.includes('<!DOCTYPE')) throw new Error('stooq bloqueado');
  const lines = text.trim().split('\n').slice(1);
  const candles: Candle[] = [];
  for (const line of lines) {
    const [d, o, h, l, c, v] = line.split(',');
    if (!d || !c || c === 'null') continue;
    candles.push({
      time: Math.floor(new Date(d + 'T00:00:00Z').getTime() / 1000),
      open: parseFloat(o), high: parseFloat(h), low: parseFloat(l),
      close: parseFloat(c), volume: parseFloat(v || '0'),
    });
  }
  if (candles.length < 60) throw new Error('datos insuficientes');
  return candles.slice(-420);
}

/** 2) Yahoo Finance chart vía proxy CORS (allorigins) */
function yahooChartParse(data: unknown): Candle[] {
  const d = data as {
    chart?: { result?: { timestamp?: number[]; indicators?: { quote?: { open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[]; volume?: (number | null)[] }[] } }[] }
  };
  const r = d.chart?.result?.[0];
  const ts = r?.timestamp ?? [];
  const q = r?.indicators?.quote?.[0];
  if (!q || ts.length < 2) throw new Error('yahoo sin datos');
  const candles: Candle[] = [];
  for (let i = 0; i < ts.length; i++) {
    const c = q.close?.[i];
    if (c == null) continue;
    candles.push({
      time: ts[i],
      open: q.open?.[i] ?? c, high: q.high?.[i] ?? c,
      low: q.low?.[i] ?? c, close: c, volume: q.volume?.[i] ?? 0,
    });
  }
  return candles;
}

/** Reintenta un fetch JSON varias veces (los proxies públicos fallan de forma intermitente). */
async function getJSONRetry(url: string, tries = 3, timeoutMs = 20000): Promise<unknown> {
  let lastErr: unknown = null;
  for (let i = 0; i < tries; i++) {
    try { return await getJSON(url, timeoutMs); }
    catch (e) { lastErr = e; await new Promise(r => setTimeout(r, 600 * (i + 1))); }
  }
  throw lastErr ?? new Error('sin respuesta');
}

/** Yahoo chart probando varios proxies CORS en cadena. */
async function yahooViaProxies(symbol: string, range: string, interval: string): Promise<Candle[]> {
  const target = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${range}&interval=${interval}`;
  const urls = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`,
    `https://corsproxy.io/?url=${encodeURIComponent(target)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(target)}`,
  ];
  let lastErr: unknown = null;
  for (const u of urls) {
    try {
      const data = await getJSONRetry(u, 2, 18000);
      const candles = yahooChartParse(data);
      if (candles.length >= 10) return candles;
    } catch (e) { lastErr = e; }
  }
  throw lastErr ?? new Error('yahoo sin datos');
}

async function yahooChartCandles(symbol: string, range: string, interval: string): Promise<Candle[]> {
  return yahooViaProxies(symbol, range, interval);
}

/** Velas intradía de acciones desde Stooq CSV (5, 15, 30, 60 minutos). */
async function stooqIntradayCandles(symbol: string, interval: '5' | '15' | '30' | '60'): Promise<Candle[]> {
  const text = await getText(`https://stooq.com/q/d/l/?s=${symbol.toLowerCase()}.us&i=${interval}`, 15000);
  if (text.includes('<html') || text.includes('<!DOCTYPE') || text.includes('Exceeded')) throw new Error('stooq bloqueado');
  const lines = text.trim().split('\n').slice(1);
  const candles: Candle[] = [];
  for (const line of lines) {
    const [d, t, o, h, l, c, v] = line.split(',');
    if (!d || !t || !c || c === 'null') continue;
    candles.push({
      time: Math.floor(new Date(`${d}T${t}Z`).getTime() / 1000),
      open: parseFloat(o), high: parseFloat(h), low: parseFloat(l),
      close: parseFloat(c), volume: parseFloat(v || '0'),
    });
  }
  if (candles.length < 20) throw new Error('stooq intradía insuficiente');
  return candles;
}

/** Deriva velas semanales a partir de diarias (si no hay proveedor semanal directo). */
function toWeeklyCandles(daily: Candle[]): Candle[] {
  const weeks = new Map<string, Candle>();
  for (const c of daily) {
    const d = new Date(c.time * 1000);
    const day = d.getUTCDay();
    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() - ((day + 6) % 7));
    const key = monday.toISOString().slice(0, 10);
    const w = weeks.get(key);
    if (!w) weeks.set(key, { time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume });
    else { w.high = Math.max(w.high, c.high); w.low = Math.min(w.low, c.low); w.close = c.close; w.volume += c.volume; }
  }
  return [...weeks.values()].sort((a, b) => a.time - b.time);
}

async function stockCandlesYahoo(symbol: string): Promise<Candle[]> {
  const candles = await yahooChartCandles(symbol, '2y', '1d');
  if (candles.length < 60) throw new Error('yahoo insuficiente');
  return candles.slice(-420);
}

async function fetchStockHistory(symbol: string): Promise<CandleHistory> {
  const key = `stc:v2:${symbol}`;
  const cached = cacheGet<CandleHistory>(key);
  if (cached) return { ...cached, cached: true };
  const providers = [{ name: 'Stooq', fetch: stockCandlesStooq }, { name: 'Yahoo Finance', fetch: stockCandlesYahoo }];
  let lastErr: unknown = null;
  for (const p of providers) {
    try {
      const candles = await p.fetch(symbol);
      if (candles.length >= 60) {
        const history = { candles, source: p.name, cached: false };
        cacheSet(key, history); return history;
      }
    } catch (e) { lastErr = e; }
  }
  throw lastErr ?? new Error('sin proveedores de acciones');
}

export async function fetchStockCandles(symbol: string): Promise<Candle[]> {
  return (await fetchStockHistory(symbol)).candles;
}

/* ---------- Cargador unificado: SOLO datos reales. Si falla, error. ---------- */
export async function loadCandles(asset: Asset): Promise<CandleHistory> {
  const history = asset.assetClass === 'crypto'
    ? await fetchCryptoHistory(asset.id)
    : await fetchStockHistory(asset.id);
  if (history.candles.length < 60) throw new Error(`Datos insuficientes para ${asset.symbol}`);
  return history;
}

export async function loadQuotes(assets: Asset[]): Promise<Record<string, Quote>> {
  const cryptoSyms = assets.filter(a => a.assetClass === 'crypto').map(a => a.id);
  const stockSyms = assets.filter(a => a.assetClass === 'stock').map(a => a.id);
  const out: Record<string, Quote> = {};
  const results = await Promise.allSettled([
    cryptoSyms.length ? fetchCryptoQuotes(cryptoSyms) : Promise.resolve({} as Record<string, Quote>),
    fetchLiveStocks(stockSyms),
  ]);
  results.forEach((result, i) => {
    if (result.status !== 'fulfilled') return;
    for (const [id, quote] of Object.entries(result.value)) out[`${i === 0 ? 'crypto' : 'stock'}:${id}`] = quote;
  });
  return out;
}

/* ================= TEMPORALIDADES (gráfico de velas) ================= */

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '1d' | '1wk';

export const TIMEFRAMES: { id: Timeframe; label: string }[] = [
  { id: '1m', label: '1 min' },
  { id: '5m', label: '5 min' },
  { id: '15m', label: '15 min' },
  { id: '1h', label: '1 h' },
  { id: '1d', label: '1 día' },
  { id: '1wk', label: '1 sem' },
];

const TF_CFG: Record<Timeframe, { binance: string; limit: number; yahooInterval: string; yahooRange: string }> = {
  '1m':  { binance: '1m',  limit: 300, yahooInterval: '1m',  yahooRange: '1d' },
  '5m':  { binance: '5m',  limit: 300, yahooInterval: '5m',  yahooRange: '5d' },
  '15m': { binance: '15m', limit: 300, yahooInterval: '15m', yahooRange: '1mo' },
  '1h':  { binance: '1h',  limit: 300, yahooInterval: '60m', yahooRange: '3mo' },
  '1d':  { binance: '1d',  limit: 300, yahooInterval: '1d',  yahooRange: '1y' },
  '1wk': { binance: '1w',  limit: 200, yahooInterval: '1wk', yahooRange: '5y' },
};

/** Velas en cualquier temporalidad — SOLO datos reales (Binance para cripto, Yahoo para acciones). */
export async function loadTimeframeCandles(asset: Asset, tf: Timeframe): Promise<Candle[]> {
  const key = `tf:v2:${asset.assetClass}:${asset.id}:${tf}`;
  const cached = cacheGet<Candle[]>(key);
  if (cached) return cached;
  const cfg = TF_CFG[tf];
  const providers: (() => Promise<Candle[]>)[] = [];
  if (asset.assetClass === 'crypto') {
    providers.push(async () => {
      const data = await getJSON(`https://api.binance.com/api/v3/klines?symbol=${asset.id}USDT&interval=${cfg.binance}&limit=${cfg.limit}`) as unknown[][];
      return data.map(k => ({
        time: Math.floor((k[0] as number) / 1000),
        open: parseFloat(k[1] as string), high: parseFloat(k[2] as string),
        low: parseFloat(k[3] as string), close: parseFloat(k[4] as string),
        volume: parseFloat(k[5] as string),
      }));
    });
    providers.push(() => yahooChartCandles(`${asset.id}-USD`, cfg.yahooRange, cfg.yahooInterval));
  } else {
    if (tf === '1m') {
      // Yahoo es la única fuente de 1 minuto para acciones
      providers.push(() => yahooChartCandles(asset.id, '1d', '1m'));
    } else if (tf === '5m') {
      providers.push(() => stooqIntradayCandles(asset.id, '5'));
      providers.push(() => yahooChartCandles(asset.id, cfg.yahooRange, cfg.yahooInterval));
    } else if (tf === '15m') {
      providers.push(() => stooqIntradayCandles(asset.id, '15'));
      providers.push(() => yahooChartCandles(asset.id, cfg.yahooRange, cfg.yahooInterval));
    } else if (tf === '1h') {
      providers.push(() => stooqIntradayCandles(asset.id, '60'));
      providers.push(() => yahooChartCandles(asset.id, cfg.yahooRange, cfg.yahooInterval));
    } else if (tf === '1wk') {
      providers.push(async () => toWeeklyCandles(await fetchStockCandles(asset.id)));
    } else {
      providers.push(() => fetchStockCandles(asset.id));
    }
  }
  let lastErr: unknown = null;
  for (const p of providers) {
    try {
      const candles = await p();
      if (candles.length >= 20) { cacheSet(key, candles); return candles; }
    } catch (e) { lastErr = e; }
  }
  throw lastErr ?? new Error(`Sin datos en temporalidad ${tf}`);
}
