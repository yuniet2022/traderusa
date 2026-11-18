import { describe, expect, it } from "vitest";
import {
  globalScanOrder,
  advanceGlobalCursor,
  balancedUniverse,
} from "./globalScan";
import { assetKey } from "./intraday";
import type { Asset } from "@/types";
const assets: Asset[] = Array.from({ length: 530 }, (_, i) => ({
  id: `S${i}`,
  symbol: `S${i}`,
  name: `Stock ${i}`,
  assetClass: "stock",
}));

describe("fair whole-catalog scheduling", () => {
  it("visits an entire catalog larger than a batch while revisiting owned assets", () => {
    let start = 0;
    const visited = new Set<string>(),
      priority = assets.slice(0, 4);
    for (let round = 0; round < 6; round++) {
      const plan = globalScanOrder(assets, priority, start),
        completed = new Set(plan.ordered.map(assetKey));
      for (const key of completed) visited.add(key);
      expect(priority.every(a => completed.has(assetKey(a)))).toBe(true);
      start =
        (start +
          advanceGlobalCursor(plan.rotated, plan.priorityKeys, completed)) %
        assets.length;
    }
    expect(visited.size).toBe(530);
  });
  it("interleaves the market with priorities so a short round still performs both jobs", () => {
    const plan = globalScanOrder(assets, assets.slice(0, 100), 0);
    expect(plan.ordered.slice(0, 3).map(a => a.id)).toEqual([
      "S0",
      "S1",
      "S100",
    ]);
    const rotated = globalScanOrder(assets, assets.slice(0, 100), 0, 100, 4);
    expect(rotated.ordered.slice(0, 3).map(a => a.id)).toEqual([
      "S4",
      "S5",
      "S100",
    ]);
  });
  it("does not advance past an interrupted asset just because a later one finished first", () => {
    const plan = globalScanOrder(assets, [], 0);
    expect(
      advanceGlobalCursor(
        plan.rotated,
        plan.priorityKeys,
        new Set([assetKey(assets[1])])
      )
    ).toBe(0);
    expect(
      advanceGlobalCursor(
        plan.rotated,
        plan.priorityKeys,
        new Set([assetKey(assets[0]), assetKey(assets[1])])
      )
    ).toBe(2);
  });
  it("keeps identical stock and crypto symbols distinct and alternates their queues", () => {
    const sample = [
      { ...assets[0], id: "BTC" },
      { ...assets[0], id: "BTC", assetClass: "crypto" as const },
      { ...assets[1], id: "ETH", assetClass: "crypto" as const },
    ];
    const plan = globalScanOrder(sample, [sample[0]], 0);
    expect(new Set(plan.ordered.map(assetKey)).size).toBe(3);
    expect(balancedUniverse(sample).map(a => a.assetClass)).toEqual([
      "stock",
      "crypto",
      "crypto",
    ]);
  });
});
