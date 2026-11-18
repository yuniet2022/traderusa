import { createHash } from "node:crypto";
import type { Asset } from "../src/types";
import type {
  CatalogSource,
  UniverseAsset,
  UniversePage,
} from "../contracts/universe";
import { marketSymbol } from "../contracts/market";

const FRESH = 6 * 3600000,
  MAX_AGE = 24 * 3600000,
  RETRY = 60000;
export const CATALOGS = [
  {
    id: "nasdaq",
    name: "Nasdaq Trader · Nasdaq",
    url: "https://www.nasdaqtrader.com/dynamic/symdir/nasdaqlisted.txt",
  },
  {
    id: "us-listed",
    name: "Nasdaq Trader · otras bolsas de EE. UU.",
    url: "https://www.nasdaqtrader.com/dynamic/symdir/otherlisted.txt",
  },
  {
    id: "kraken",
    name: "Kraken · pares USD",
    url: "https://api.kraken.com/0/public/AssetPairs",
  },
  {
    id: "coinbase",
    name: "Coinbase Exchange · pares USD",
    url: "https://api.exchange.coinbase.com/products",
  },
  {
    id: "binance",
    name: "Binance · pares spot USDT",
    url: "https://api.binance.com/api/v3/exchangeInfo",
  },
  {
    id: "yahoo-discovery",
    name: "Yahoo Finance · actividad y movimientos (muestra)",
    url: "https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=most_actives,day_gainers,day_losers&count=250",
  },
] as const;
type CatalogId = (typeof CATALOGS)[number]["id"];
const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";
const cryptoId = (value: string) =>
  (({ XBT: "BTC", XDG: "DOGE" }) as Record<string, string>)[value] ?? value;
function asset(
  id: string,
  name: string,
  assetClass: Asset["assetClass"]
): Asset | null {
  const symbol = marketSymbol.safeParse(id);
  if (!symbol.success) return null;
  return {
    id: symbol.data,
    symbol: symbol.data,
    name:
      Array.from(name)
        .map(c => (c.charCodeAt(0) < 32 ? " " : c))
        .join("")
        .slice(0, 160) || symbol.data,
    assetClass,
  };
}

/** Source formats are explicit; a malformed catalog is not a successful empty market. */
export function parseCatalog(id: CatalogId, raw: string): Asset[] {
  if (id === "nasdaq" || id === "us-listed") {
    const lines = raw.trim().split(/\r?\n/),
      headers = lines.shift()!.split("|");
    const symbolColumn = id === "nasdaq" ? "Symbol" : "NASDAQ Symbol";
    if (
      !headers.includes(symbolColumn) ||
      !headers.includes("Security Name") ||
      !headers.includes("Test Issue")
    )
      throw Error("INVALID_CATALOG");
    return lines.flatMap(line => {
      const cols = line.split("|");
      if (cols.length !== headers.length) return [];
      const row = Object.fromEntries(headers.map((h, i) => [h, cols[i]]));
      if (row["Test Issue"] !== "N") return [];
      const result = asset(
        row[symbolColumn].replaceAll(".", "-"),
        row["Security Name"],
        "stock"
      );
      return result ? [result] : [];
    });
  }
  const doc: unknown = JSON.parse(raw),
    result: Asset[] = [];
  const push = (symbol: string) => {
    const item = asset(cryptoId(symbol), cryptoId(symbol), "crypto");
    if (item) result.push(item);
  };
  if (id === "coinbase") {
    if (!Array.isArray(doc)) throw Error("INVALID_CATALOG");
    for (const row of doc) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      if (
        r.quote_currency === "USD" &&
        r.status === "online" &&
        r.trading_disabled !== true
      )
        push(text(r.base_currency));
    }
  } else if (id === "kraken") {
    const r = doc as {
      error?: unknown;
      result?: Record<string, { wsname?: string; status?: string }>;
    };
    if (
      !r ||
      !Array.isArray(r.error) ||
      r.error.length ||
      !r.result ||
      typeof r.result !== "object"
    )
      throw Error("INVALID_CATALOG");
    for (const row of Object.values(r.result)) {
      if (!row || typeof row !== "object") continue;
      const [base, quote] = text(row.wsname).split("/");
      if (quote === "USD" && (!row.status || row.status === "online"))
        push(base);
    }
  } else if (id === "yahoo-discovery") {
    const r = doc as {
      finance?: {
        result?: {
          quotes?: {
            symbol?: string;
            shortName?: string;
            longName?: string;
            quoteType?: string;
          }[];
        }[];
      };
    };
    if (!Array.isArray(r?.finance?.result)) throw Error("INVALID_CATALOG");
    for (const group of r.finance.result)
      for (const q of group.quotes ?? []) {
        if (q.quoteType !== "EQUITY" && q.quoteType !== "ETF") continue;
        const a = asset(
          text(q.symbol),
          text(q.longName) || text(q.shortName),
          "stock"
        );
        if (a) result.push(a);
      }
  } else {
    const r = doc as { symbols?: unknown };
    if (!r || !Array.isArray(r.symbols)) throw Error("INVALID_CATALOG");
    for (const row of r.symbols) {
      if (!row || typeof row !== "object") continue;
      if (
        row.quoteAsset === "USDT" &&
        row.status === "TRADING" &&
        row.isSpotTradingAllowed !== false
      )
        push(text(row.baseAsset));
    }
  }
  return result;
}

export class UniverseChanged extends Error {}
export function createUniverseService(
  options: { fetch?: typeof fetch; now?: () => number } = {}
) {
  const request = options.fetch ?? fetch,
    now = options.now ?? Date.now;
  const saved = new Map<string, { assets: Asset[]; fetchedAt: number }>(),
    attempts = new Map<string, { at: number; error: string | null }>();
  let pending: Promise<{
    assets: UniverseAsset[];
    sources: CatalogSource[];
    version: string;
  }> | null = null;
  async function read(url: string) {
    const response = await request(url, {
      signal: AbortSignal.timeout(8000),
      headers: {
        "User-Agent": "TraderUSA/1.0",
        Accept: "application/json,text/plain",
      },
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw Error(`HTTP_${response.status}`);
    }
    const reader = response.body?.getReader();
    if (!reader) throw Error("EMPTY_CATALOG");
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > 8000000) {
          await reader.cancel();
          throw Error("CATALOG_TOO_LARGE");
        }
        chunks.push(part.value);
      }
    } finally {
      reader.releaseLock();
    }
    return Buffer.concat(chunks).toString("utf8");
  }
  async function snapshot(force: boolean) {
    if (pending) return pending;
    pending = (async () => {
      await Promise.all(
        CATALOGS.map(async source => {
          const old = saved.get(source.id),
            attempt = attempts.get(source.id);
          if (attempt && now() - attempt.at < RETRY) return;
          if (!force && old && now() - old.fetchedAt < FRESH && !attempt?.error)
            return;
          try {
            const assets = parseCatalog(source.id, await read(source.url));
            if (!assets.length) throw Error("EMPTY_CATALOG");
            saved.set(source.id, { assets, fetchedAt: now() });
            attempts.set(source.id, { at: now(), error: null });
          } catch (error) {
            const code =
              error instanceof Error &&
              /^(HTTP_\d{3}|EMPTY_CATALOG|CATALOG_TOO_LARGE)$/.test(
                error.message
              )
                ? error.message
                : "CATALOG_UNAVAILABLE";
            attempts.set(source.id, { at: now(), error: code });
          }
        })
      );
      const combined = new Map<string, UniverseAsset>();
      const sources: CatalogSource[] = CATALOGS.map(source => {
        const old = saved.get(source.id),
          attempt = attempts.get(source.id),
          usable = old && now() - old.fetchedAt < MAX_AGE;
        if (usable)
          for (const a of old.assets) {
            const key = `${a.assetClass}:${a.id}`,
              existing = combined.get(key);
            if (existing) {
              if (!existing.catalogSources.includes(source.name))
                existing.catalogSources.push(source.name);
            } else combined.set(key, { ...a, catalogSources: [source.name] });
          }
        return {
          id: source.id,
          name: source.name,
          status: !usable
            ? "unavailable"
            : attempt?.error || now() - old.fetchedAt >= FRESH
              ? "stale"
              : "ok",
          count: usable ? old.assets.length : 0,
          fetchedAt: old?.fetchedAt ?? null,
          error: attempt?.error ?? null,
        };
      });
      const assets = [...combined.values()].sort((a, b) =>
        `${a.assetClass}:${a.id}`.localeCompare(`${b.assetClass}:${b.id}`)
      );
      const version = createHash("sha256")
        .update(JSON.stringify(assets))
        .digest("hex");
      return { assets, sources, version };
    })();
    try {
      return await pending;
    } finally {
      pending = null;
    }
  }
  async function page(input: {
    offset: number;
    limit: number;
    version?: string;
    refresh?: boolean;
  }): Promise<UniversePage> {
    const data = await snapshot(!!input.refresh);
    if (input.version && input.version !== data.version)
      throw new UniverseChanged();
    const next = input.offset + input.limit;
    return {
      ...data,
      assets: data.assets.slice(input.offset, next),
      total: data.assets.length,
      stocks: data.assets.filter(a => a.assetClass === "stock").length,
      crypto: data.assets.filter(a => a.assetClass === "crypto").length,
      nextOffset: next < data.assets.length ? next : null,
      partial: data.sources.some(s => s.status !== "ok"),
    };
  }
  return { page };
}
