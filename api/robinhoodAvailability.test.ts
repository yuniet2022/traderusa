import { describe, expect, it, vi } from "vitest";
import {
  createRobinhoodAvailability,
  robinhoodCryptoAvailable,
  robinhoodStockAvailable,
} from "./robinhoodAvailability";

describe("verified Robinhood listings", () => {
  it("requires an exact, active, tradable stock rather than any matching-looking listing", () => {
    const doc = {
      results: [
        { symbol: "BRK.B", tradeable: true, state: "active" },
        { symbol: "AAPLX", tradeable: true, state: "active" },
      ],
    };
    expect(robinhoodStockAvailable(doc, "BRK-B")).toBe(true);
    expect(robinhoodStockAvailable(doc, "AAPL")).toBe(false);
    expect(
      robinhoodStockAvailable(
        { results: [{ symbol: "AAPL", tradeable: true, state: "inactive" }] },
        "AAPL"
      )
    ).toBe(false);
    expect(
      robinhoodStockAvailable(
        {
          results: [
            { symbol: "AAPL", tradeable: false, tradability: "tradable" },
          ],
        },
        "AAPL"
      )
    ).toBe(false);
    expect(
      robinhoodStockAvailable({ detail: "authentication required" }, "AAPL")
    ).toBeNull();
    expect(
      robinhoodStockAvailable({ results: [], next: "more results" }, "AAPL")
    ).toBeNull();
  });
  it("requires a tradable USD crypto pair and keeps incomplete/unknown catalogs unknown", () => {
    const doc = {
      results: [
        {
          asset_currency: { code: "BTC", state: "active" },
          quote_currency: { code: "USD" },
          tradability: "tradable",
        },
        {
          asset_currency: { code: "ETH" },
          quote_currency: { code: "USD" },
          tradability: "untradable",
        },
      ],
    };
    expect(robinhoodCryptoAvailable(doc, "BTC")).toBe(true);
    expect(robinhoodCryptoAvailable(doc, "ETH")).toBe(false);
    expect(
      robinhoodCryptoAvailable({ results: [], next: "more" }, "NEW")
    ).toBeNull();
    expect(robinhoodCryptoAvailable({ error: "denied" }, "BTC")).toBeNull();
  });
  it("shares and caches exact stock checks, then removes confirmation when a fresh check fails", async () => {
    let clock = 1000000;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        Response.json({
          results: [{ symbol: "AAPL", tradeable: true, state: "active" }],
        })
      );
    const service = createRobinhoodAvailability({
      fetch: fetcher,
      now: () => clock,
    });
    const [first, shared] = await Promise.all([
      service.check("stock", "AAPL"),
      service.check("stock", "AAPL"),
    ]);
    expect(first.available).toBe(true);
    expect(shared).toEqual(first);
    expect(fetcher).toHaveBeenCalledTimes(1);
    clock += 1000;
    expect(await service.check("stock", "AAPL")).toEqual(first);
    expect(new URL(String(fetcher.mock.calls[0][0])).hostname).toBe(
      "api.robinhood.com"
    );
    expect(fetcher.mock.calls[0][1]?.method).toBeUndefined();
    expect(fetcher.mock.calls[0][1]?.headers).not.toHaveProperty(
      "Authorization"
    );
    clock += 3600000;
    fetcher.mockImplementation(async () => new Response("", { status: 403 }));
    expect((await service.check("stock", "AAPL")).available).toBeNull();
    expect((await service.check("stock", "MSFT")).available).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("shares one crypto catalog for multiple assets without connecting an account", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () =>
      Response.json({
        results: [
          {
            asset_currency: { code: "BTC" },
            quote_currency: { code: "USD" },
            tradability: "tradable",
          },
          {
            asset_currency: { code: "ETH" },
            quote_currency: { code: "USD" },
            tradability: "tradable",
          },
        ],
      })
    );
    const service = createRobinhoodAvailability({
      fetch: fetcher,
      now: () => 1000000,
    });
    const values = await Promise.all(
      ["BTC", "ETH", "NEW"].map(id => service.check("crypto", id))
    );
    expect(values.map(v => v.available)).toEqual([true, true, false]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0][0])).toBe(
      "https://nummus.robinhood.com/currency_pairs/"
    );
  });
});
