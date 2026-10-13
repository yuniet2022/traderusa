import type { Asset } from '@/types';

async function getJSON(url: string, timeoutMs = 10000): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(t); }
}

interface YahooSearchResult {
  quotes?: { symbol?: string; shortname?: string; longname?: string; quoteType?: string }[];
}

/** Busca cualquier acción/ETF/cripto. Acciones vía Yahoo, cripto vía Binance. */
export async function searchAssets(query: string): Promise<Asset[]> {
  const q = query.trim();
  if (q.length < 1) return [];
  const upper = q.toUpperCase();
  const results: Asset[] = [];
  const seen = new Set<string>();

  // 1) Cripto: ¿existe SYMBOLUSDT en Binance?
  if (/^[A-Z0-9]{2,10}$/.test(upper)) {
    try {
      await getJSON(`https://api.binance.com/api/v3/ticker/price?symbol=${upper}USDT`, 6000);
      results.push({ id: upper, symbol: upper, name: `${upper} / USDT`, assetClass: 'crypto' });
      seen.add(`crypto:${upper}`);
    } catch { /* no es un par de Binance */ }
  }

  // 2) Acciones/ETFs: búsqueda de Yahoo vía proxy CORS
  try {
    const target = encodeURIComponent(
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0&listsCount=0`
    );
    const data = await getJSON(`https://api.allorigins.win/raw?url=${target}`, 12000) as YahooSearchResult;
    for (const item of data.quotes ?? []) {
      if (!item.symbol) continue;
      if (item.quoteType !== 'EQUITY' && item.quoteType !== 'ETF') continue;
      const sym = item.symbol.toUpperCase();
      if (seen.has(`stock:${sym}`)) continue;
      seen.add(`stock:${sym}`);
      results.push({
        id: sym,
        symbol: sym,
        name: item.shortname || item.longname || sym,
        assetClass: 'stock',
      });
    }
  } catch { /* búsqueda de acciones no disponible */ }

  // 3) Si el query es un símbolo exacto y el buscador no lo devolvió (penny stocks, micro-caps),
  //    intentar fetch directo a Yahoo — así se encuentran YHC y similares.
  if (/^[A-Z]{1,5}$/.test(upper) && !results.some(r => r.symbol === upper)) {
    try {
      const target = encodeURIComponent(
        `https://query1.finance.yahoo.com/v8/finance/chart/${upper}?range=5d&interval=1d`
      );
      const data = await getJSON(`https://api.allorigins.win/raw?url=${target}`, 12000) as {
        chart?: { result?: { meta?: { longName?: string; shortName?: string; regularMarketPrice?: number; instrumentType?: string } }[] }
      };
      const meta = data.chart?.result?.[0]?.meta;
      if (meta?.regularMarketPrice && (meta.instrumentType === 'EQUITY' || meta.instrumentType === 'ETF')) {
        results.push({
          id: upper,
          symbol: upper,
          name: meta.longName || meta.shortName || upper,
          assetClass: 'stock',
        });
      }
    } catch { /* símbolo no existe */ }
  }

  return results.slice(0, 8);
}
