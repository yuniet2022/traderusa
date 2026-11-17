import { describe, expect, it } from "vitest";
import { protectiveFill, replaySetups } from "../../scripts/replay-setups";
import type { Candle } from "@/types";

describe("conservative setup replay", () => {
  const bar: Candle = {
    time: 1,
    open: 100,
    high: 115,
    low: 90,
    close: 105,
    volume: 1,
  };
  it("counts the stop first when one OHLC bar touches both protective levels", () => {
    expect(protectiveFill(bar, 95, 110)).toEqual({ price: 95, reason: "stop" });
  });
  it("allows a gap to lose more than the planned stop instead of capping it at one R", () => {
    expect(protectiveFill({ ...bar, open: 85, low: 80 }, 95, 110)).toEqual({
      price: 85,
      reason: "gap_stop",
    });
  });
  it("does not fabricate trades or profitability from an incomplete session", () => {
    const result = replaySetups(
      [{ ...bar, time: Date.UTC(2026, 10, 16, 14, 30) / 1000 }],
      { id: "TEST", symbol: "TEST", name: "Test", assetClass: "stock" }
    );
    expect(result.tradeCount).toBe(0);
    expect(result.completedSessions).toBe(0);
    expect(result.skippedSessions).toBe(1);
    expect(result.net).toBe(0);
    expect(result.profitFactor).toBeNull();
  });
});
