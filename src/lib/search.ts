import type { Asset } from '@/types';

async function getJSON(url: string, timeoutMs = 10000, signal?: AbortSignal): Promise<unknown> {
  signal?.throwIfAborted();
  const ctrl = new AbortController();
  const abort = () => ctrl.abort(signal?.reason);
  signal?.addEventListener('abort', abort, { once: true });
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
    signal?.removeEventListener('abort', abort);
  }
}

interface YahooSearchResult {
  quotes?: { symbol?: string; shortname?: string; longname?: string; quoteType?: string }[];
}

/** Busca cualquier acción/ETF/cripto. Acciones vía Yahoo, cripto vía Binance. */
export async function searchAssets(query: string, signal?: AbortSignal): Promise<Asset[]> {
  signal?.throwIfAborted();
  const q = query.trim();
  if (q.length < 1) return [];
  const upper = q.toUpperCase();
  const cryptoResults: Asset[] = [];
  const stockResults: Asset[] = [];
  const seenStocks = new Set<string>();

  const searchCrypto = async () => {
    // 1) Cripto: ¿existe SYMBOLUSDT en Binance?
    if (/^[A-Z0-9]{2,10}$/.test(upper)) {
      try {
        await getJSON(`https://api.binance.com/api/v3/ticker/price?symbol=${upper}USDT`, 6000, signal);
        cryptoResults.push({ id: upper, symbol: upper, name: `${upper} / USDT`, assetClass: 'crypto' });
      } catch { /* no es un par de Binance */ }
    }
  };

  const searchStocks = async () => {
    // 2) Acciones/ETFs: búsqueda de Yahoo vía proxy CORS
    try {
      const target = encodeURIComponent(
        `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0&listsCount=0`
      );
      const data = await getJSON(`https://api.allorigins.win/raw?url=${target}`, 12000, signal) as YahooSearchResult;
      for (const item of data.quotes ?? []) {
        if (!item.symbol) continue;
        if (item.quoteType !== 'EQUITY' && item.quoteType !== 'ETF') continue;
        const sym = item.symbol.toUpperCase();
        if (seenStocks.has(sym)) continue;
        seenStocks.add(sym);
        stockResults.push({
          id: sym,
          symbol: sym,
          name: item.shortname || item.longname || sym,
          assetClass: 'stock',
        });
      }
    } catch { /* búsqueda de acciones no disponible */ }
    signal?.throwIfAborted();

    // 3) Si el query es un símbolo exacto y el buscador no lo devolvió (penny stocks, micro-caps),
    //    intentar fetch directo a Yahoo — así se encuentran YHC y similares.
    if (/^[A-Z]{1,5}$/.test(upper) && !stockResults.some(r => r.symbol === upper)) {
      try {
        const target = encodeURIComponent(
          `https://query1.finance.yahoo.com/v8/finance/chart/${upper}?range=5d&interval=1d`
        );
        const data = await getJSON(`https://api.allorigins.win/raw?url=${target}`, 12000, signal) as {
          chart?: { result?: { meta?: { longName?: string; shortName?: string; regularMarketPrice?: number; instrumentType?: string } }[] }
        };
        const meta = data.chart?.result?.[0]?.meta;
        if (meta?.regularMarketPrice && (meta.instrumentType === 'EQUITY' || meta.instrumentType === 'ETF')) {
          stockResults.push({
            id: upper,
            symbol: upper,
            name: meta.longName || meta.shortName || upper,
            assetClass: 'stock',
          });
        }
      } catch { /* símbolo no existe */ }
    }
  };

  await Promise.all([searchCrypto(), searchStocks()]);
  signal?.throwIfAborted();
  return [...cryptoResults, ...stockResults].slice(0, 8);
}
