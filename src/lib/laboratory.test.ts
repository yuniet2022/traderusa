import { describe, expect, it } from "vitest";
import {
  completedCandles,
  runBacktest,
  strategySeries,
  type BacktestOptions,
} from "./laboratory";
import { settleLong } from "@contracts/trading";
import type { Candle } from "@/types";

const options: BacktestOptions = {
  capital: 10000,
  riskPercent: 1,
  feePercent: 0.1,
  fixedFee: 1,
  slippagePercent: 0.1,
  horizon: "swing",
  assetClass: "stock",
};
function history(n = 180): Candle[] {
  return Array.from({ length: n }, (_, i) => {
    const close = 100 + i * 0.5;
    return {
      time: 1700000000 + i * 86400,
      open: close - 0.2,
      high: close + 0.1,
      low: close - 0.8,
      close,
      volume: 1000,
    };
  });
}

describe("long-only strategy laboratory", () => {
  it("enters at the next open, sizes with costs and reconciles the account", () => {
    const bars = history(),
      result = runBacktest(bars, options);
    expect(result.trades.length).toBeGreaterThan(5);
    const first = result.trades[0];
    expect(first.entryTime).toBe(bars[51].time);
    expect(first.entry).toBeCloseTo(bars[51].open * 1.001);
    expect(first.stop).toBeLessThan(first.entry);
    expect(first.net).toBeGreaterThan(0);
    expect(result.fees).toBeGreaterThan(0);
    expect(result.net).toBeCloseTo(
      result.trades.reduce((s, t) => s + t.net, 0),
      8
    );
    expect(result.equity.at(-1)!.value).toBeCloseTo(
      options.capital + result.net,
      8
    );
    expect(result.benchmark).toBeTypeOf("number");
  });

  it("never changes earlier signals or completed trades when future data is appended", () => {
    const original = history(140),
      future = history(200);
    future.splice(
      140,
      60,
      ...future
        .slice(140)
        .map(c => ({
          ...c,
          open: c.open * 3,
          close: c.close * 3,
          high: c.high * 3,
          low: c.low * 3,
        }))
    );
    expect(strategySeries(future).setups.slice(0, 140)).toEqual(
      strategySeries(original).setups
    );
    const prefix = runBacktest(original, options).trades.filter(
      t => t.reason !== "end"
    );
    expect(runBacktest(future, options).trades.slice(0, prefix.length)).toEqual(
      prefix
    );
  });

  it("counts a stop before a target when the same bar crosses both", () => {
    const bars = history(80),
      base = runBacktest(bars, options).trades[0];
    bars[51] = { ...bars[51], low: base.stop - 1, high: base.target + 1 };
    const first = runBacktest(bars, options).trades[0];
    expect(first.reason).toBe("stop");
    expect(first.ambiguous).toBe(true);
    expect(first.exit).toBeCloseTo(base.stop * 0.999);
    expect(first.net).toBeLessThan(0);
  });

  it("fills a gap through the stop at the worse open, beyond planned risk", () => {
    const bars = history(80),
      base = runBacktest(bars, options).trades[0];
    bars[52] = { ...bars[52], open: base.stop - 8, low: base.stop - 9 };
    const first = runBacktest(bars, options).trades[0];
    expect(first.reason).toBe("stop");
    expect(first.exit).toBeCloseTo((base.stop - 8) * 0.999);
    expect(first.r).toBeLessThan(-1);
    expect(runBacktest(bars, options).maxDrawdown).toBeGreaterThan(1);
  });

  it("uses only past warmup for a reserved range and a fresh starting balance", () => {
    const bars = history(180),
      split = 141;
    const reserved = runBacktest(bars, options, split);
    expect(reserved.trades.length).toBeGreaterThan(0);
    expect(reserved.trades.every(t => t.entryTime >= bars[split].time)).toBe(
      true
    );
    expect(reserved.net).toBeCloseTo(
      reserved.trades.reduce((s, t) => s + t.net, 0),
      8
    );
    expect(
      runBacktest(bars, { ...options, feePercent: 1, slippagePercent: 1 }).net
    ).toBeLessThan(
      runBacktest(bars, {
        ...options,
        feePercent: 0,
        fixedFee: 0,
        slippagePercent: 0,
      }).net
    );
  });

  it("waits with flat prices and reports absent statistics honestly", () => {
    const bars = history(110).map(c => ({
      ...c,
      open: 100,
      high: 100,
      low: 100,
      close: 100,
    }));
    const r = runBacktest(bars, options);
    expect(r.trades).toEqual([]);
    expect(r.winRate).toBeNull();
    expect(r.profitFactor).toBeNull();
    expect(r.expectancy).toBeNull();
    expect(r.net).toBe(0);
  });

  it.each(["crypto", "stock"] as const)(
    "removes unfinished %s daily and 5-minute bars",
    assetClass => {
      const bars = history(3).map((c, i) => ({
        ...c,
        time: Date.parse(`2026-10-${15 + i}T13:30:00Z`) / 1000,
      }));
      expect(
        completedCandles(
          bars,
          "swing",
          assetClass,
          Date.parse("2026-10-17T14:00:00Z")
        )
      ).toHaveLength(2);
      const minute = history(2).map((c, i) => ({
        ...c,
        time: Date.parse("2026-10-17T14:00:00Z") / 1000 + i * 300,
      }));
      expect(
        completedCandles(
          minute,
          "intraday",
          assetClass,
          Date.parse("2026-10-17T14:06:00Z")
        )
      ).toHaveLength(1);
    }
  );

  it("closes crypto at the final five-minute candle and flags missing session closes", () => {
    const start = Date.parse("2026-10-01T19:00:00Z") / 1000;
    const wide = history(110).map((c, i) => ({
      ...c,
      time: start + i * 300,
      open: 100 + i * 0.01,
      close: 100 + i * 0.01,
      high: 100 + i * 0.01 + 0.001,
      low: 100 + i * 0.01 - 0.1,
    }));
    const intraday: BacktestOptions = {
      ...options,
      feePercent: 0,
      fixedFee: 0,
      slippagePercent: 0,
      horizon: "intraday",
      assetClass: "crypto",
    };
    const r = runBacktest(wide, intraday);
    expect(r.trades.some(t => t.reason === "session")).toBe(true);
    const missing = wide.filter(
      c => new Date(c.time * 1000).toISOString().slice(11, 16) !== "23:55"
    );
    expect(runBacktest(missing, intraday).sessionGaps).toBeGreaterThan(0);
    const midnight = missing.find(c => new Date(c.time * 1000).toISOString().slice(11, 16) === '00:00')!;
    midnight.open = 99; midnight.low = 98;
    const gapStop = runBacktest(missing, intraday);
    expect(gapStop.trades[0].reason).toBe('stop');
    expect(gapStop.trades[0].sessionGap).toBe(true);
    expect(gapStop.sessionGaps).toBeGreaterThan(0);
  });

  it("deducts both fees and adverse exit slippage in journal settlement", () => {
    const r = settleLong(10, 100.1, 2.001, 110, options);
    expect(r.exitFill).toBeCloseTo(109.89);
    expect(r.exitFee).toBeCloseTo(2.0989);
    expect(r.net).toBeCloseTo(93.8001);
    expect(r.proceeds).toBeCloseTo(1096.8011);
  });

  it('does not confuse midnight-UTC stock labels with the previous trading date', () => {
    const bars = history(2).map((c, i) => ({ ...c, time: Date.parse(`2026-10-${15 + i}T00:00:00Z`) / 1000 }));
    expect(completedCandles(bars, 'swing', 'stock', Date.parse('2026-10-16T15:00:00Z'))).toHaveLength(1);
  });

  it.each(['2026-10-01T14:00:00Z', '2026-12-01T15:00:00Z'])('uses New York session hours including daylight-saving time: %s', startDate => {
    const start = Date.parse(startDate) / 1000;
    const bars = history(100).map((c, i) => ({ ...c, time: start + i * 300, open: 100 + i * 0.01, close: 100 + i * 0.01, high: 100 + i * 0.01 + 0.001, low: 100 + i * 0.01 - 0.1 }));
    const result = runBacktest(bars, { ...options, feePercent: 0, fixedFee: 0, slippagePercent: 0, horizon: 'intraday' });
    const session = result.trades.find(t => t.reason === 'session');
    expect(session).toBeDefined();
    const exit = new Date(session!.exitTime * 1000);
    expect(exit.getUTCHours()).toBe(startDate.includes('-10-') ? 19 : 20);
    expect(exit.getUTCMinutes()).toBe(55);
  });

  it('rejects invalid risk and costs even when there are no entry signals', () => {
    expect(() => runBacktest([], { ...options, riskPercent: NaN })).toThrow();
    expect(() => runBacktest([], { ...options, feePercent: -1 })).toThrow();
  });
});
