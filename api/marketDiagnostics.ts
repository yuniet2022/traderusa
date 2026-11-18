import { networkErrorCode } from './networkError';
import { CATALOGS } from './marketUniverse';

const destinations = [
  ['query1.finance.yahoo.com', 'https://query1.finance.yahoo.com/v8/finance/chart/AAPL?range=1d&interval=5m'],
  ['query2.finance.yahoo.com', 'https://query2.finance.yahoo.com/v8/finance/chart/AAPL?range=1d&interval=5m'],
  ['api.kraken.com', 'https://api.kraken.com/0/public/Time'],
  ['api.exchange.coinbase.com', 'https://api.exchange.coinbase.com/time'],
  ['stooq.com', 'https://stooq.com/q/l/?s=aapl.us&i=d'],
  ['api.binance.com', 'https://api.binance.com/api/v3/time'],
  ...CATALOGS.map(c=>[c.name,c.url] as const),
  ['Robinhood · acciones', 'https://api.robinhood.com/instruments/?symbol=AAPL'],
  ['Robinhood · cripto', 'https://nummus.robinhood.com/currency_pairs/'],
] as const;

export function createMarketDiagnostics(options: { fetch?: typeof fetch; now?: () => number } = {}) {
  const request = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const now = options.now ?? Date.now;
  type Report = { checkedAt: number; commit: string | null; results: { source: string; code: string; elapsedMs: number; ok: boolean }[] };
  let last: Report | null = null;
  let pending: Promise<Report> | null = null;
  return async function diagnose(): Promise<Report> {
    if (last && now() - last.checkedAt < 60_000) return last;
    if (pending) return pending;
    pending = (async () => {
      const results = await Promise.all(destinations.map(async ([source, url]) => {
        const start = now();
        try {
          const response = await request(url, { signal: AbortSignal.timeout(6000), headers: { 'User-Agent': 'TraderUSA/1.0', Accept: 'application/json,text/csv' }, redirect: 'error' });
          try { await response.body?.cancel(); } catch { /* HTTP headers were already received. */ }
          return { source, code: `HTTP_${response.status}`, elapsedMs: Math.max(0, now()-start), ok: response.ok };
        } catch (error) {
          return { source, code: networkErrorCode(error), elapsedMs: Math.max(0, now()-start), ok: false };
        }
      }));
      const sha = process.env.RAILWAY_GIT_COMMIT_SHA;
      last = { checkedAt: now(), commit: sha && /^[a-f0-9]{7,40}$/i.test(sha) ? sha.slice(0,12) : null, results };
      return last;
    })();
    try { return await pending; } finally { pending = null; }
  };
}
