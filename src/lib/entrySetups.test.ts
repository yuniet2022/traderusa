import { describe, expect, it } from "vitest";
import type { Asset, Candle, CandleHistory } from "@/types";
import {
  assessEntryPlan,
  checkEntryPlan,
  detectEntrySetups,
} from "./entrySetups";
import { marketSession, nyseHoliday } from "./marketSession";
import { reviewPositionExit } from "./exitReview";

const asset: Asset = {
  id: "TEST",
  symbol: "TEST",
  name: "Test",
  assetClass: "stock",
};
const open = Date.UTC(2026, 10, 16, 14, 30) / 1000;
const bar = (time: number, close = 100, volume = 1000): Candle => ({
  time,
  open: close,
  high: close + 0.5,
  low: close - 0.5,
  close,
  volume,
});
const previous = Array.from({ length: 60 }, (_, i) =>
  bar(Date.UTC(2026, 10, 13, 14, 30) / 1000 + i * 300)
);
const today = Array.from({ length: 7 }, (_, i) => bar(open + i * 300));
today[6] = {
  time: open + 1800,
  open: 100,
  high: 102.1,
  low: 99.9,
  close: 102,
  volume: 2500,
};
const now = (open + 2100) * 1000 + 1000;
const daily = [
  bar(Date.UTC(2026, 10, 12) / 1000, 110),
  bar(Date.UTC(2026, 10, 13) / 1000, 104),
];
const history = (candles = [...previous, ...today]): CandleHistory => ({
  candles,
  source: "Fixture",
  cached: false,
  fetchedAt: now,
  priceAsOf: now,
});
const scan = (h = history(), at = now) =>
  detectEntrySetups(asset, h, daily, at, 300);

describe("causal setup confirmation", () => {
  it("confirms an OR breakout only after a closed bar with volume and creates consistent 2R/3R levels", () => {
    const result = scan();
    expect(result.status).toBe("ready");
    expect(result.plan?.pattern).toBe("orb");
    const plan = result.plan!;
    const risk = plan.entry - plan.stop;
    expect(plan.target1 - plan.entry).toBeCloseTo(2 * risk);
    expect(plan.target2 - plan.entry).toBeCloseTo(3 * risk);
    expect(plan.volumeRatio).toBe(2.5);
    expect(plan.stop).toBeLessThan(plan.entry);
  });
  it("does not trigger on a forming breakout candle, a wick alone, or insufficient volume", () => {
    const forming = scan(history(), now - 120000);
    expect(forming.plans.find(p => p.plan.pattern === "orb")).toBeUndefined();
    const wick = history();
    wick.candles[wick.candles.length - 1] = {
      ...today[6],
      close: 100,
      high: 110,
    };
    expect(
      scan(wick).plans.find(p => p.plan.pattern === "orb")
    ).toBeUndefined();
    const thin = history();
    thin.candles[thin.candles.length - 1] = { ...today[6], volume: 100 };
    expect(scan(thin).plans).toHaveLength(0);
  });
  it("does not create an opening range from missing initial bars", () => {
    const missing = history([...previous, ...today.filter((_, i) => i !== 1)]);
    const result = scan(missing);
    expect(result.range?.complete).toBe(false);
    expect(result.plans.find(p => p.plan.pattern === "orb")).toBeUndefined();
  });
  it("blocks stale receipts, failed refreshes, stale market times and gaps in recent bars", () => {
    expect(scan({ ...history(), fetchedAt: now - 31000 }).status).toBe(
      "blocked"
    );
    expect(scan({ ...history(), stale: true }).status).toBe("blocked");
    expect(scan({ ...history(), priceAsOf: now - 120000 }).status).toBe(
      "blocked"
    );
    expect(
      detectEntrySetups(asset, history(), daily, now, 300, true).status
    ).toBe("blocked");
    expect(
      scan(history([...previous, ...today.filter((_, i) => i !== 5)])).status
    ).toBe("blocked");
  });
  it("invalidates a lost breakout, blocks chasing and expires the original confirmation", () => {
    const plan = scan().plan!;
    expect(checkEntryPlan(plan, plan.invalidation - 0.01, now).status).toBe(
      "invalidated"
    );
    expect(checkEntryPlan(plan, plan.maxEntry + 0.01, now).status).toBe(
      "blocked"
    );
    expect(checkEntryPlan(plan, plan.entry, plan.expiresAt).status).toBe(
      "expired"
    );
    expect(assessEntryPlan(plan, null, plan.expiresAt).status).toBe("expired");
  });
  it("retains the closed trigger prices even when an open bar moves wildly", () => {
    const base = scan().plan!;
    const result = scan(
      history([
        ...previous,
        ...today,
        { ...bar(open + 2100, 110, 1e9), open: 102, low: 101, high: 120 },
      ])
    );
    expect(result.ignoredOpenBars).toBe(1);
    expect(result.plan?.entry).toBe(base.entry);
    expect(result.status).toBe("blocked");
  });
  it("does not revive an invalidated entry simply because a forming price bounced back", () => {
    const plan = scan().plan!;
    const reading = scan(
      history([
        ...previous,
        ...today,
        {
          time: open + 2100,
          open: 102,
          high: 102.2,
          low: plan.invalidation - 0.1,
          close: 102,
          volume: 1000,
        },
      ])
    );
    expect(assessEntryPlan(plan, reading, now).status).toBe("invalidated");
    expect(
      assessEntryPlan(plan, { ...reading, intervalSeconds: 60 }, now).status
    ).toBe("blocked");
  });
  it("uses the actual previous closed daily session, not the penultimate daily row", () => {
    const d = [
      { ...daily[0], high: 120 },
      { ...bar(daily[1].time), high: 101 },
    ];
    const result = detectEntrySetups(asset, history(), d, now);
    expect(
      result.plans.find(p => p.plan.pattern === "previous_high")?.plan.reference
    ).toBe(101);
  });
  it("does not invent a retest on the same breakout candle", () => {
    expect(scan().plans.find(p => p.plan.pattern === "retest")).toBeUndefined();
  });
  it("confirms a retest only after a prior break and a later closed recovery", () => {
    const rows = [
      ...previous,
      ...today,
      {
        time: open + 2100,
        open: 102,
        high: 102.1,
        low: 100.7,
        close: 101.2,
        volume: 1000,
      },
      {
        time: open + 2400,
        open: 101.2,
        high: 102.1,
        low: 100.5,
        close: 102,
        volume: 2500,
      },
    ];
    const at = (open + 2700) * 1000 + 1000;
    const result = scan({ ...history(rows), fetchedAt: at, priceAsOf: at }, at);
    expect(result.plans.find(p => p.plan.pattern === "retest")?.status).toBe(
      "ready"
    );
  });
  it("detects a closed recovery after a pullback to EMA20", () => {
    const rows = [
      ...previous,
      ...today.slice(0, 6),
      {
        time: open + 1800,
        open: 101,
        high: 101.2,
        low: 99.95,
        close: 100.2,
        volume: 1000,
      },
      {
        time: open + 2100,
        open: 100.2,
        high: 101.1,
        low: 100.1,
        close: 101,
        volume: 2500,
      },
    ];
    const at = (open + 2400) * 1000 + 1000;
    expect(
      scan({ ...history(rows), fetchedAt: at, priceAsOf: at }, at).plans.find(
        p => p.plan.pattern === "pullback"
      )?.status
    ).toBe("ready");
  });
  it("detects a support sweep only after the candle recovers the actual prior low", () => {
    const rows = [
      ...previous,
      ...today.slice(0, 6),
      {
        time: open + 1800,
        open: 100,
        high: 101.1,
        low: 99.2,
        close: 101,
        volume: 2500,
      },
    ];
    const result = detectEntrySetups(
      asset,
      history(rows),
      [{ ...daily[1], low: 99.5 }],
      now
    );
    expect(result.plans.find(p => p.plan.pattern === "reclaim")?.status).toBe(
      "ready"
    );
  });
  it("does not treat a delayed provider print as an already settled bar", () => {
    expect(
      scan({ ...history(), priceAsOf: (open + 2100) * 1000 - 1000 }).status
    ).toBe("blocked");
  });
  it("blocks repeated failed range breaks without blocking the position-exit review", () => {
    const rows = [
      ...previous,
      ...today,
      bar(open + 2100, 100),
      bar(open + 2400, 99),
      { ...bar(open + 2700, 102, 2500), open: 99 },
    ];
    const at = (open + 3000) * 1000 + 1000;
    const result = scan({ ...history(rows), fetchedAt: at, priceAsOf: at }, at);
    expect(result.status).toBe("blocked");
    expect(result.dataReady).toBe(true);
    expect(result.reasons.join(" ")).toContain("ambas direcciones");
  });
  it("does not let failed opening breaks block an otherwise clean market for the entire day", () => {
    const rows = [
      ...previous,
      ...today,
      bar(open + 2100, 100),
      bar(open + 2400, 99),
      ...Array.from({ length: 21 }, (_, i) => bar(open + 2700 + i * 300, 102)),
    ];
    const at = (rows.at(-1)!.time + 300) * 1000 + 1000;
    const result = scan({ ...history(rows), fetchedAt: at, priceAsOf: at }, at);
    expect(result.dataReady).toBe(true);
    expect(result.entryAllowed).toBe(true);
    expect(result.reasons.join(" ")).not.toContain("ambas direcciones");
  });
  it("does not use a later opening-range low to generate an earlier support reclaim", () => {
    const result = detectEntrySetups(asset, history(), [], now);
    expect(
      result.plans
        .filter(p => p.plan.pattern === "reclaim")
        .every(p => p.plan.triggerAt >= (open + 1800) * 1000)
    ).toBe(true);
  });
  it("keeps exits evaluable after the new-entry cutoff and uses owned cost basis", () => {
    const late = Date.UTC(2026, 10, 16, 20, 40);
    const sessionBars = Array.from({ length: 74 }, (_, i) =>
      bar(open + i * 300)
    );
    const h = {
      ...history([...previous, ...sessionBars]),
      fetchedAt: late,
      priceAsOf: late,
    };
    const reading = detectEntrySetups(asset, h, daily, late);
    expect(reading.status).toBe("blocked");
    expect(reading.dataReady).toBe(true);
    const review = reviewPositionExit(
      {
        assetId: "TEST",
        symbol: "TEST",
        assetClass: "stock",
        lots: [{ quantity: 2, price: 120 }],
        addedAt: now,
      },
      reading,
      [
        {
          id: "stop",
          assetId: "TEST",
          symbol: "TEST",
          kind: "price_below",
          price: 101,
          createdAt: now,
          triggered: false,
        },
      ]
    )!;
    expect(review.current).toBe(true);
    expect(review.metrics.pnl).toBe(-40);
    expect(review.breached).toHaveLength(1);
    expect(
      reviewPositionExit(
        {
          assetId: "OTHER",
          symbol: "OTHER",
          assetClass: "stock",
          lots: [{ quantity: 2, price: 120 }],
          addedAt: now,
        },
        reading,
        []
      )
    ).toBeNull();
  });
  it("distinguishes profit protection from loss review on the same closed reversal evidence", () => {
    const sessionBars = Array.from({ length: 40 }, (_, i) =>
      bar(open + i * 300, 100 + Math.min(i, 30) * 0.6)
    );
    sessionBars[39] = {
      time: open + 39 * 300,
      open: 118,
      high: 120,
      low: 115,
      close: 115.5,
      volume: 2500,
    };
    const at = (open + 40 * 300) * 1000 + 1000;
    const reading = scan(
      {
        ...history([...previous, ...sessionBars]),
        fetchedAt: at,
        priceAsOf: at,
      },
      at
    );
    const position = {
      assetId: "TEST",
      symbol: "TEST",
      assetClass: "stock" as const,
      lots: [{ quantity: 2, price: 100 }],
      addedAt: now,
    };
    const profit = reviewPositionExit(position, reading, [])!;
    expect(profit.current).toBe(true);
    expect(profit.deterioration).toBe(true);
    expect(profit.metrics.pnl).toBe(31);
    expect(profit.title).toBe("Revisar protección de ganancias");
    const loss = reviewPositionExit(
      { ...position, lots: [{ quantity: 2, price: 120 }] },
      reading,
      []
    )!;
    expect(loss.metrics.pnl).toBe(-9);
    expect(loss.title).toBe("Revisar riesgo de tu posición");
    expect(
      reviewPositionExit(position, { ...reading, dataReady: false }, [])!.title
    ).toBe("Salida pendiente de datos actuales");
  });
});

describe("session calendar separates equities and crypto", () => {
  it("honors daylight saving, holidays and early closes", () => {
    expect(marketSession("stock", Date.UTC(2026, 6, 6, 14)).open).toBe(
      Date.UTC(2026, 6, 6, 13, 30)
    );
    expect(marketSession("stock", Date.UTC(2026, 10, 16, 15)).open).toBe(
      Date.UTC(2026, 10, 16, 14, 30)
    );
    expect(nyseHoliday("2026-11-26")).toBe(true);
    expect(nyseHoliday("2026-04-03")).toBe(true);
    const early = marketSession("stock", Date.UTC(2026, 10, 27, 16));
    expect(early.early).toBe(true);
    expect(early.close).toBe(Date.UTC(2026, 10, 27, 18));
    expect(marketSession("stock", Date.UTC(2026, 10, 26, 16)).openNow).toBe(
      false
    );
  });
  it("keeps weekend crypto open with UTC boundaries and does not assume a NYSE schedule", () => {
    const crypto = marketSession("crypto", Date.UTC(2026, 10, 15, 23, 30));
    expect(crypto.openNow).toBe(true);
    expect(crypto.open).toBe(Date.UTC(2026, 10, 15));
    expect(crypto.flatBy).toBeNull();
  });
  it("does not silently trade outside supported equity calendar years", () => {
    expect(marketSession("stock", Date.UTC(2035, 0, 2, 15)).known).toBe(false);
  });
});
