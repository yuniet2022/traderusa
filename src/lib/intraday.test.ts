import { describe, expect, it } from "vitest";
import type { Asset, Candle, CandleHistory } from "@/types";
import { detectEntrySetups } from "./entrySetups";
import { intradayAction, IntradayNoticeLedger } from "./intraday";
import type { Position } from "./portfolio";
import { scanIntraday } from "./intradayScan";

const asset: Asset = {
  id: "TEST",
  symbol: "TEST",
  name: "Test",
  assetClass: "stock",
};
const open = Date.UTC(2026, 10, 16, 14, 30) / 1000,
  now = (open + 2100) * 1000 + 1000;
const bar = (time: number): Candle => ({
  time,
  open: 100,
  high: 100.5,
  low: 99.5,
  close: 100,
  volume: 1000,
});
const candles = [
  ...Array.from({ length: 60 }, (_, i) =>
    bar(Date.UTC(2026, 10, 13, 14, 30) / 1000 + i * 300)
  ),
  ...Array.from({ length: 6 }, (_, i) => bar(open + i * 300)),
  {
    time: open + 1800,
    open: 100,
    high: 102.1,
    low: 99.9,
    close: 102,
    volume: 2500,
  },
];
const history: CandleHistory = {
  candles,
  source: "Fixture",
  cached: false,
  fetchedAt: now,
  priceAsOf: now,
};
const scan = () => detectEntrySetups(asset, history, [], now);
const position: Position = {
  assetId: "TEST",
  symbol: "TEST",
  assetClass: "stock",
  lots: [{ quantity: 2, price: 120 }],
  addedAt: now,
};
const stop = {
  id: "stop",
  assetId: "TEST",
  symbol: "TEST",
  kind: "price_below" as const,
  price: 103,
  createdAt: now,
  triggered: false,
};

describe("actionable intraday notices", () => {
  it("announces a valid closed setup once, independently of a daily bullish ranking", () => {
    const action = intradayAction(scan());
    expect(action.kind).toBe("buy");
    expect(action.detail).toContain("stop");
    expect(action.detail).toContain("objetivo");
    const ledger = new IntradayNoticeLedger();
    expect(ledger.collect([action])).toHaveLength(1);
    expect(ledger.collect([action, action])).toHaveLength(0);
  });
  it("never announces a purchase from stale, blocked, expired or invalidated data", () => {
    const reading = scan();
    for (const status of ["blocked", "expired", "invalidated"] as const)
      expect(intradayAction({ ...reading, status }).kind).not.toBe("buy");
    expect(intradayAction({ ...reading, dataReady: false }).kind).not.toBe(
      "buy"
    );
    expect(intradayAction({ ...reading, entryAllowed: false }).kind).not.toBe(
      "buy"
    );
  });
  it("announces an owned threshold exit with actual loss even after an entry restriction", () => {
    const reading = {
      ...scan(),
      entryAllowed: false,
      status: "blocked" as const,
      reasons: ["Terminó la ventana de entradas"],
    };
    const action = intradayAction(reading, position, [stop]);
    expect(action.kind).toBe("sell");
    expect(action.pnl).toBe(-36);
    expect(action.detail).toContain("-$36.00");
  });
  it("does not call a sale without valid lots or for a different asset class", () => {
    expect(intradayAction(scan(), undefined, [stop]).kind).not.toBe("sell");
    expect(
      intradayAction(scan(), { ...position, lots: [] }, [stop]).kind
    ).not.toBe("sell");
    expect(
      intradayAction(scan(), { ...position, assetClass: "crypto" }, [stop]).kind
    ).not.toBe("sell");
    expect(
      intradayAction({ ...scan(), dataReady: false }, position, [stop]).kind
    ).not.toBe("sell");
  });
  it("does not repeatedly announce a continuing exit, including a temporary source outage", () => {
    const ledger = new IntradayNoticeLedger(),
      reading = scan(),
      sell = intradayAction(reading, position, [stop]);
    expect(ledger.collect([sell])).toHaveLength(1);
    expect(ledger.collect([sell])).toHaveLength(0);
    expect(
      ledger.collect([
        intradayAction({ ...reading, dataReady: false }, position, [stop]),
      ])
    ).toHaveLength(0);
    expect(ledger.collect([sell])).toHaveLength(0);
    ledger.collect([
      intradayAction(
        { ...reading, status: "waiting", plan: null, observedPrice: 104 },
        position,
        [stop]
      ),
    ]);
    expect(ledger.collect([sell])).toHaveLength(1);
  });
});

describe("bounded intraday scanner", () => {
  const assets = Array.from({ length: 12 }, (_, i) => ({
    ...asset,
    id: String(i),
  }));
  it("scans all loaded assets without a three or four candidate cap and with at most three active requests", async () => {
    let active = 0,
      peak = 0;
    const results: string[] = [];
    const count = await scanIntraday(
      assets,
      async () => {
        active++;
        peak = Math.max(peak, active);
        await Promise.resolve();
        active--;
        return history;
      },
      a => results.push(a.id),
      new AbortController().signal
    );
    expect(count).toBe(12);
    expect(results).toHaveLength(12);
    expect(peak).toBe(3);
  });
  it("stops starting requests and publishing results after cancellation", async () => {
    const controller = new AbortController();
    let publications = 0;
    const count = await scanIntraday(
      assets,
      async () => {
        controller.abort();
        return history;
      },
      () => publications++,
      controller.signal
    );
    expect(count).toBe(1);
    expect(publications).toBe(0);
  });
  it("reports source errors separately without preventing other assets from loading", async () => {
    const results: boolean[] = [];
    await scanIntraday(
      assets.slice(0, 2),
      async a => {
        if (a.id === "0") throw Error("source unavailable");
        return history;
      },
      (_a, _h, failed) => results.push(failed),
      new AbortController().signal
    );
    expect(results.sort()).toEqual([false, true]);
  });
});
