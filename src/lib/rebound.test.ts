import { describe, expect, it } from "vitest";
import type { Asset, Candle, CandleHistory } from "@/types";
import {
  detectEntrySetups,
  assessEntryPlan,
  validCandles,
} from "./entrySetups";
import { calculatePositionSize } from "./risk";
import { ema } from "./indicators";

const asset: Asset = {
  id: "REBOUND",
  symbol: "REBOUND",
  name: "Controlled reversal",
  assetClass: "stock",
};
function fixture(step = 300) {
  const open = Date.UTC(2026, 10, 18, 14, 30) / 1000;
  const flat = (time: number, close = 3.2): Candle => ({
    time,
    open: close,
    high: close + 0.012,
    low: close - 0.012,
    close,
    volume: 1000,
  });
  const prior = Array.from({ length: 60 }, (_, i) =>
    flat(Date.UTC(2026, 10, 17, 14, 30) / 1000 + i * step)
  );
  const today = Array.from({ length: 12 }, (_, i) => flat(open + i * step));
  for (const close of [3.16, 3.12, 3.08, 3.04, 3, 2.99]) {
    const previous = today.at(-1)!.close;
    today.push({
      time: open + today.length * step,
      open: previous,
      high: previous + 0.005,
      low: close === 2.99 ? 2.97 : close - 0.01,
      close,
      volume: 1000,
    });
  }
  today.push({
    time: open + today.length * step,
    open: 2.99,
    high: 3.015,
    low: 2.98,
    close: 3.005,
    volume: 1000,
  });
  today.push({
    time: open + today.length * step,
    open: 3.005,
    high: 3.035,
    low: 2.99,
    close: 3.03,
    volume: 2200,
  });
  const now = (today.at(-1)!.time + step) * 1000 + 1000;
  const history: CandleHistory = {
    candles: [...prior, ...today],
    source: "Controlled OHLC, not LCID market data",
    cached: false,
    fetchedAt: now,
    priceAsOf: now,
  };
  const daily = [flat(Date.UTC(2026, 10, 17) / 1000, 3.4)];
  const scan = (h = history, at = now) =>
    detectEntrySetups(asset, h, daily, at, step);
  return { history, now, scan, step };
}

describe("closed first rebound, without hindsight", () => {
  it.each([60, 300])(
    "confirms two higher lows and the first recovery break on %i-second bars before bullish averages",
    step => {
      const { scan } = fixture(step),
        reading = scan();
      const candidate = reading.plans.find(p => p.plan.pattern === "rebound");
      expect(candidate?.status).toBe("ready");
      expect(candidate!.plan.entry).toBe(3.03);
      expect(candidate!.plan.reference).toBe(3.015);
      expect(candidate!.plan.stop).toBeLessThan(2.97);
      expect(candidate!.plan.target1).toBeLessThanOrEqual(3.212);
      expect(candidate!.plan.entry).toBeLessThan(
        ema(
          reading.closed.map(c => c.close),
          20
        ).at(-1)!
      );
      expect(
        reading.plans.find(p => p.plan.pattern === "pullback")
      ).toBeUndefined();
    }
  );
  it("does not buy the eventual minimum or a confirmation candle still forming", () => {
    const { history, now, scan, step } = fixture();
    const at = now - (step * 1000) / 2;
    const reading = scan({ ...history, fetchedAt: at, priceAsOf: at }, at);
    expect(reading.plans.some(p => p.plan.pattern === "rebound")).toBe(false);
    const lowOnly = { ...history, candles: history.candles.slice(0, -2) };
    expect(scan(lowOnly).plans.some(p => p.plan.pattern === "rebound")).toBe(
      false
    );
  });
  it("requires actual volume and a close above the first recovery high, rather than a wick", () => {
    const { history, scan } = fixture();
    const thin = {
      ...history,
      candles: history.candles.map((c, i) =>
        i === history.candles.length - 1 ? { ...c, volume: 900 } : c
      ),
    };
    expect(scan(thin).plans.some(p => p.plan.pattern === "rebound")).toBe(
      false
    );
    const wick = {
      ...history,
      candles: history.candles.map((c, i) =>
        i === history.candles.length - 1 ? { ...c, close: 3.01 } : c
      ),
    };
    expect(scan(wick).plans.some(p => p.plan.pattern === "rebound")).toBe(
      false
    );
  });
  it("rejects a fresh lower low and an entry already too far from the floor", () => {
    const { history, scan } = fixture();
    for (const change of [{ low: 2.96 }, { close: 3.18, high: 3.185 }]) {
      const h = {
        ...history,
        candles: history.candles.map((c, i) =>
          i === history.candles.length - 1 ? { ...c, ...change } : c
        ),
      };
      expect(scan(h).plans.some(p => p.plan.pattern === "rebound")).toBe(false);
    }
  });
  it("does not invent room for 2R when the known pre-drop ceiling is too close", () => {
    const { history, scan } = fixture();
    const close = history.candles.length;
    const modified = history.candles.map((c, i) =>
      i < close - 20
        ? c
        : i < close - 8
          ? { ...c, open: 3.06, close: 3.06, high: 3.085, low: 3.035 }
          : i < close - 2
            ? {
                ...c,
                open: Math.min(c.open, 3.06),
                high:
                  Math.max(Math.min(c.open, 3.06), Math.min(c.close, 3.06)) +
                  0.025,
                close: Math.min(c.close, 3.06),
                low: Math.min(
                  c.low,
                  Math.min(c.open, 3.06) - 0.025,
                  Math.min(c.close, 3.06) - 0.025
                ),
              }
            : c
    );
    expect(validCandles(modified)).toHaveLength(history.candles.length);
    expect(
      scan({ ...history, candles: modified }).plans.some(
        p => p.plan.pattern === "rebound"
      )
    ).toBe(false);
  });
  it("keeps the plan unchanged when future bars are appended after its decision time", () => {
    const { history, scan } = fixture(),
      first = scan().plans.find(p => p.plan.pattern === "rebound")!.plan;
    const future = {
      ...history.candles.at(-1)!,
      time: history.candles.at(-1)!.time + 900,
      high: 6,
      close: 5,
      low: 2,
    };
    expect(
      scan({ ...history, candles: [...history.candles, future] }).plans.find(
        p => p.plan.pattern === "rebound"
      )!.plan
    ).toEqual(first);
  });
  it("cannot revive an invalidated rebound or declare a pre-close snapshot final", () => {
    const { history, scan, now, step } = fixture(),
      reading = scan(),
      plan = reading.plans.find(p => p.plan.pattern === "rebound")!.plan;
    const next = {
      time: history.candles.at(-1)!.time + step,
      open: 3.03,
      high: 3.04,
      low: plan.invalidation - 0.001,
      close: 3.03,
      volume: 20,
    };
    expect(
      assessEntryPlan(
        plan,
        scan({ ...history, candles: [...history.candles, next] }),
        now
      ).status
    ).toBe("invalidated");
    const early = scan({
      ...history,
      priceAsOf: undefined,
      fetchedAt: now - 2000,
    });
    expect(early.status).toBe("blocked");
    expect(early.reasons.join(" ")).toContain("instantánea anterior");
  });
  it("still rejects a small gross gain when spread/slippage destroys the net reward/risk", () => {
    const plan = fixture()
      .scan()
      .plans.find(p => p.plan.pattern === "rebound")!.plan;
    const result = calculatePositionSize({
      capital: 1000,
      riskPercent: 1,
      entry: plan.entry,
      stop: plan.stop,
      target: plan.target1,
      direction: "long",
      fractional: false,
      slippagePercent: 1,
      minRewardRisk: 1.5,
    });
    expect(result.quantity).toBeGreaterThan(0);
    expect(result.passesLimits).toBe(false);
  });
});
