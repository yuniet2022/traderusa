import { describe, expect, it } from "vitest";
import type { Asset, Candle } from "@/types";
import { detectEntrySetups } from "./entrySetups";
import { tradeDecision } from "./tradeDecision";

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
const reading = detectEntrySetups(
  asset,
  { candles, source: "Fixture", cached: false, fetchedAt: now, priceAsOf: now },
  [],
  now
);
const base = {
  asset,
  reading,
  risk: null,
  alerts: [],
  now,
  intervalSeconds: 300,
};
const risk = {
  planId: reading.plan!.id,
  valid: true,
  quantity: 10,
  reason: "Límites comprobados",
};

describe("unified entry, exit and risk decision", () => {
  it("requires applying and validating the same plan before announcing buy now", () => {
    expect(tradeDecision(base).state).toBe("prepare");
    expect(
      tradeDecision({ ...base, risk: { ...risk, planId: "another plan" } })
        .state
    ).toBe("prepare");
    expect(tradeDecision({ ...base, risk }).state).toBe("buy");
    expect(tradeDecision({ ...base, risk }).title).toBe("POSIBLE COMPRA AHORA");
  });
  it("does not announce a buy with unmet costs/limits or zero/invalid sizing", () => {
    expect(
      tradeDecision({
        ...base,
        risk: { ...risk, valid: false, reason: "Completa los costos" },
      }).reason
    ).toBe("Completa los costos");
    expect(
      tradeDecision({ ...base, risk: { ...risk, quantity: 0 } }).state
    ).toBe("prepare");
    expect(
      tradeDecision({ ...base, risk: { ...risk, quantity: NaN } }).state
    ).toBe("prepare");
  });
  it("does not reuse a different asset, interval, stale quote or expired setup despite a previously valid risk calculation", () => {
    expect(
      tradeDecision({ ...base, risk, asset: { ...asset, id: "OTHER" } }).state
    ).toBe("loading");
    expect(tradeDecision({ ...base, risk, intervalSeconds: 60 }).state).toBe(
      "loading"
    );
    expect(tradeDecision({ ...base, risk, now: now + 31000 }).state).toBe(
      "wait"
    );
    expect(tradeDecision({ ...base, risk, now: now + 31000 }).reason).toContain(
      "no está vigente"
    );
    const expired = reading.plan!.expiresAt;
    expect(
      tradeDecision({
        ...base,
        risk,
        now: expired,
        reading: { ...reading, fetchedAt: expired },
      }).state
    ).toBe("wait");
  });
  it("returns wait when confirmation is absent, invalid or the price is no longer actionable", () => {
    for (const status of ["waiting", "invalidated", "blocked"] as const)
      expect(
        tradeDecision({ ...base, risk, reading: { ...reading, status } }).state
      ).toBe("wait");
    expect(
      tradeDecision({
        ...base,
        risk,
        reading: { ...reading, observedPrice: reading.plan!.maxEntry + 1 },
      }).state
    ).toBe("wait");
  });
  it("reviews a held exit independently of entry risk restrictions, including actual losses", () => {
    const position = {
      assetId: "TEST",
      symbol: "TEST",
      assetClass: "stock" as const,
      lots: [{ quantity: 2, price: 120 }],
      addedAt: now,
    };
    const alerts = [
      {
        id: "stop",
        assetId: "TEST",
        symbol: "TEST",
        kind: "price_below" as const,
        price: 103,
        createdAt: now,
        triggered: false,
      },
    ];
    const decision = tradeDecision({
      ...base,
      position,
      alerts,
      reading: { ...reading, entryAllowed: false, status: "blocked" },
    });
    expect(decision.state).toBe("exit");
    expect(decision.reason).toContain("-$36.00");
  });
  it("does not invent a purchase outside regular hours even with a previously valid plan", () => {
    expect(
      tradeDecision({ ...base, risk, now: Date.UTC(2026, 10, 17, 22, 31) })
        .title
    ).toBe("MERCADO CERRADO · ESPERAR");
  });
});
