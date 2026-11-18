import { describe, expect, it, vi } from "vitest";
import {
  CATALOGS,
  createUniverseService,
  parseCatalog,
  UniverseChanged,
} from "./marketUniverse";

const nasdaq =
  "Symbol|Security Name|Market Category|Test Issue|Financial Status|Round Lot Size|ETF|NextShares\nAAPL|Apple|Q|N|N|100|N|N\nONLYQ|New listing|Q|N|N|100|N|N\nZVZZT|Test|Q|Y|N|100|N|N\nFile Creation Time: 20261118|||||||";
const other =
  "ACT Symbol|Security Name|Exchange|CQS Symbol|ETF|Round Lot Size|Test Issue|NASDAQ Symbol\nBRK.B|Berkshire|N|BRK/B|N|100|N|BRK.B\nAAPL|Apple|Q|AAPL|N|100|N|AAPL";
const fixtures = () => ({
  nasdaq,
  "us-listed": other,
  kraken: JSON.stringify({
    error: [],
    result: {
      BTC: { wsname: "XBT/USD", status: "online" },
      DOGE: { wsname: "XDG/USD", status: "online" },
      EUR: { wsname: "XBT/EUR", status: "online" },
      HALT: { wsname: "HALT/USD", status: "cancel_only" },
    },
  }),
  coinbase: JSON.stringify([
    { base_currency: "BTC", quote_currency: "USD", status: "online" },
    { base_currency: "SOL", quote_currency: "USD", status: "online" },
    {
      base_currency: "BAD",
      quote_currency: "USD",
      status: "online",
      trading_disabled: true,
    },
  ]),
  binance: JSON.stringify({
    symbols: [
      {
        baseAsset: "SOL",
        quoteAsset: "USDT",
        status: "TRADING",
        isSpotTradingAllowed: true,
      },
      { baseAsset: "NEWC", quoteAsset: "USDT", status: "TRADING" },
      {
        baseAsset: "NONS",
        quoteAsset: "USDT",
        status: "TRADING",
        isSpotTradingAllowed: false,
      },
    ],
  }),
  "yahoo-discovery": JSON.stringify({
    finance: {
      result: [
        {
          quotes: [
            { symbol: "MOVER", shortName: "Mover", quoteType: "EQUITY" },
            { symbol: "NEWX", quoteType: "ETF" },
            { symbol: "BTC", quoteType: "EQUITY" },
            { symbol: "FUT=F", quoteType: "FUTURE" },
          ],
        },
      ],
    },
  }),
});

describe("market-wide catalog discovery", () => {
  it("excludes test listings, normalizes class symbols and rejects malformed files", () => {
    expect(parseCatalog("nasdaq", nasdaq).map(a => a.id)).toEqual([
      "AAPL",
      "ONLYQ",
    ]);
    expect(parseCatalog("us-listed", other).map(a => a.id)).toContain("BRK-B");
    expect(() =>
      parseCatalog("nasdaq", "<html>Access denied</html>")
    ).toThrow();
    expect(() =>
      parseCatalog("kraken", JSON.stringify({ error: ["Denied"] }))
    ).toThrow();
  });
  it("includes active supported crypto quotes without inventing unsupported markets", () => {
    const f = fixtures();
    expect(parseCatalog("kraken", f.kraken).map(a => a.id)).toEqual([
      "BTC",
      "DOGE",
    ]);
    expect(parseCatalog("coinbase", f.coinbase).map(a => a.id)).toEqual([
      "BTC",
      "SOL",
    ]);
    expect(parseCatalog("binance", f.binance).map(a => a.id)).toEqual([
      "SOL",
      "NEWC",
    ]);
    expect(
      parseCatalog("yahoo-discovery", f["yahoo-discovery"]).map(a => a.id)
    ).toEqual(["MOVER", "NEWX", "BTC"]);
  });
  it("merges sources, preserves stock/crypto identities and shares requests across paginated clients", async () => {
    const f = fixtures();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(
        async input =>
          new Response(f[CATALOGS.find(c => c.url === String(input))!.id])
      );
    const service = createUniverseService({
      fetch: fetcher,
      now: () => 1000000,
    });
    const [first, shared] = await Promise.all([
      service.page({ offset: 0, limit: 2 }),
      service.page({ offset: 0, limit: 2 }),
    ]);
    expect(shared).toEqual(first);
    expect(fetcher).toHaveBeenCalledTimes(CATALOGS.length);
    const all = [...first.assets];
    let offset = first.nextOffset;
    while (offset !== null) {
      const p = await service.page({
        offset,
        limit: 2,
        version: first.version,
      });
      all.push(...p.assets);
      offset = p.nextOffset;
    }
    expect(new Set(all.map(a => `${a.assetClass}:${a.id}`)).size).toBe(
      first.total
    );
    expect(all.filter(a => a.id === "BTC")).toHaveLength(2);
    expect(
      all.find(a => a.assetClass === "crypto" && a.id === "BTC")?.catalogSources
    ).toHaveLength(2);
    expect(all.some(a => a.id === "ONLYQ")).toBe(true);
    expect(first.partial).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(CATALOGS.length);
  });
  it("paginates beyond a 500-asset page without truncating the discovered universe", async () => {
    const f = fixtures();
    f.nasdaq =
      "Symbol|Security Name|Test Issue\n" +
      Array.from({ length: 730 }, (_, i) => `S${i}|Company ${i}|N`).join("\n");
    const service = createUniverseService({
      fetch: async input =>
        new Response(f[CATALOGS.find(c => c.url === String(input))!.id]),
      now: () => 1000000,
    });
    const first = await service.page({ offset: 0, limit: 500 });
    expect(first.total).toBeGreaterThan(730);
    expect(first.nextOffset).toBe(500);
    const last = await service.page({
      offset: 500,
      limit: 500,
      version: first.version,
    });
    expect(last.assets.some(a => a.id === "S729")).toBe(true);
    expect(last.nextOffset).toBeNull();
    expect(first.assets.length + last.assets.length).toBe(first.total);
  });
  it("marks failed sources partial and preserves original catalog dates only within the stale window", async () => {
    let clock = 1000000,
      fail = false;
    const f = fixtures();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async input => {
      const source = CATALOGS.find(c => c.url === String(input))!;
      return fail && source.id === "nasdaq"
        ? new Response("", { status: 503 })
        : new Response(f[source.id]);
    });
    const service = createUniverseService({ fetch: fetcher, now: () => clock });
    const first = await service.page({ offset: 0, limit: 500 });
    clock += 6 * 3600000 + 1;
    fail = true;
    const old = await service.page({ offset: 0, limit: 500 });
    expect(old.partial).toBe(true);
    expect(old.sources.find(s => s.id === "nasdaq")).toMatchObject({
      status: "stale",
      fetchedAt: first.sources[0].fetchedAt,
      error: "HTTP_503",
    });
    expect(old.assets.some(a => a.id === "ONLYQ")).toBe(true);
    clock = 1000000 + 24 * 3600000 + 1;
    const expired = await service.page({ offset: 0, limit: 500 });
    expect(expired.assets.some(a => a.id === "ONLYQ")).toBe(false);
    expect(expired.sources.find(s => s.id === "nasdaq")?.status).toBe(
      "unavailable"
    );
  });
  it("rejects a changed version instead of silently skipping/repeating symbols mid-pagination", async () => {
    let clock = 1000000;
    const f = fixtures();
    const service = createUniverseService({
      fetch: async input =>
        new Response(f[CATALOGS.find(c => c.url === String(input))!.id]),
      now: () => clock,
    });
    const first = await service.page({ offset: 0, limit: 2 });
    clock += 60001;
    f.nasdaq += "\nADDED|Added listing|Q|N|N|100|N|N";
    const changed = await service.page({ offset: 0, limit: 2, refresh: true });
    expect(changed.version).not.toBe(first.version);
    await expect(
      service.page({ offset: 2, limit: 2, version: first.version })
    ).rejects.toBeInstanceOf(UniverseChanged);
  });
  it("reports unknown coverage rather than replacing all failed catalogs with a pretend complete watchlist", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(Error("private credential and URL"));
    const result = await createUniverseService({
      fetch: fetcher,
      now: () => 1000000,
    }).page({ offset: 0, limit: 500 });
    expect(result.total).toBe(0);
    expect(result.partial).toBe(true);
    expect(result.sources.every(s => s.status === "unavailable")).toBe(true);
    expect(JSON.stringify(result)).not.toContain("private");
  });
});
