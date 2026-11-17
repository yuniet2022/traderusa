/** Offline validation only. No network, broker, account writes or fitting of parameters. */
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import type { Asset, Candle, CandleHistory } from "../src/types";
import {
  checkEntryPlan,
  detectEntrySetups,
  validCandles,
} from "../src/lib/entrySetups";
import { marketDayKey, marketSession } from "../src/lib/marketSession";
import { calculatePositionSize } from "../src/lib/risk";
import { settleLong } from "../contracts/trading";

export function protectiveFill(
  bar: Candle,
  stop: number,
  target: number
): { price: number; reason: string } | null {
  if (bar.open <= stop) return { price: bar.open, reason: "gap_stop" };
  // Unknown ordering inside OHLC: conservatively count the stop when both were touched.
  if (bar.low <= stop) return { price: stop, reason: "stop" };
  if (bar.high >= target) return { price: target, reason: "target" };
  return null;
}

export function replaySetups(
  rows: Candle[],
  asset: Asset,
  feePercent = 0.05,
  slippagePercent = 0.05,
  fixedFee = 0.5
) {
  const step = 300,
    initialCapital = 10000;
  if (
    ![feePercent, slippagePercent, fixedFee].every(
      n => Number.isFinite(n) && n >= 0
    ) ||
    feePercent >= 100 ||
    slippagePercent >= 100
  )
    throw new Error("Invalid costs");
  const costs = { feePercent, slippagePercent, fixedFee };
  const groups = new Map<string, Candle[]>();
  for (const c of validCandles(rows)) {
    const key =
      asset.assetClass === "stock"
        ? marketDayKey(c.time * 1000)
        : new Date(c.time * 1000).toISOString().slice(0, 10);
    const group = groups.get(key) ?? [];
    group.push(c);
    groups.set(key, group);
  }
  let skippedSessions = 0;
  const complete: Candle[][] = [];
  for (const group of groups.values()) {
    const session = marketSession(
      asset.assetClass,
      group[Math.floor(group.length / 2)].time * 1000
    );
    const regular = group.filter(
      c => c.time * 1000 >= session.open && c.time * 1000 < session.close
    );
    const count = (session.close - session.open) / (step * 1000);
    if (
      !session.tradingDay ||
      regular.length !== count ||
      regular.some((c, i) => c.time * 1000 !== session.open + i * step * 1000)
    ) {
      skippedSessions++;
      continue;
    }
    complete.push(regular);
  }
  let cash = initialCapital,
    peak = cash,
    maxDrawdownPercent = 0;
  const prior: Candle[] = [],
    daily: Candle[] = [],
    used = new Set<string>();
  const trades: {
    day: string;
    pattern: string;
    entry: number;
    exit: number;
    quantity: number;
    net: number;
    reason: string;
  }[] = [];
  for (const day of complete) {
    const session = marketSession(asset.assetClass, day[0].time * 1000);
    let dailyRisk = initialCapital * 0.03,
      dailyTrades = 0;
    let position: {
      entry: number;
      fee: number;
      quantity: number;
      stop: number;
      target: number;
      pattern: string;
    } | null = null;
    for (const bar of day) {
      if (!position && dailyTrades < 3 && prior.length >= 20) {
        const now = bar.time * 1000;
        const history: CandleHistory = {
          candles: prior.slice(-420),
          source: "Offline OHLC replay",
          cached: false,
          fetchedAt: now,
          priceAsOf: now,
        };
        const reading = detectEntrySetups(asset, history, daily, now, step);
        const plan = reading.plan;
        if (
          plan &&
          reading.status === "ready" &&
          !used.has(plan.id) &&
          checkEntryPlan(plan, bar.open, now).status === "ready"
        ) {
          const sizing = calculatePositionSize({
            capital: cash,
            riskPercent: 1,
            entry: Math.max(plan.entry, bar.open),
            stop: plan.stop,
            target: plan.target1,
            direction: "long",
            fractional: asset.assetClass === "crypto",
            ...costs,
            cashReservePercent: 10,
            maxPositionPercent: 25,
            remainingRiskUsd: dailyRisk,
            minRewardRisk: 1.5,
          });
          if (sizing.passesLimits) {
            position = {
              entry: sizing.entryFill,
              fee:
                (sizing.entryFill * sizing.quantity * feePercent) / 100 +
                fixedFee,
              quantity: sizing.quantity,
              stop: plan.stop,
              target: plan.target1,
              pattern: plan.pattern,
            };
            cash -= sizing.capitalUsed;
            dailyRisk -= sizing.estimatedLoss;
            dailyTrades++;
            used.add(plan.id);
          }
        }
      }
      if (position) {
        const forced =
          bar.time * 1000 >= (session.flatBy ?? session.close - step * 1000);
        const fill = forced
          ? { price: bar.open, reason: "session_close" }
          : protectiveFill(bar, position.stop, position.target);
        if (fill) {
          const settled = settleLong(
            position.quantity,
            position.entry,
            position.fee,
            fill.price,
            costs
          );
          cash += settled.proceeds;
          trades.push({
            day: session.key,
            pattern: position.pattern,
            entry: position.entry,
            exit: settled.exitFill,
            quantity: position.quantity,
            net: settled.net,
            reason: fill.reason,
          });
          position = null;
        }
      }
      const mark = position
        ? cash +
          settleLong(
            position.quantity,
            position.entry,
            position.fee,
            bar.close,
            costs
          ).proceeds
        : cash;
      peak = Math.max(peak, mark);
      maxDrawdownPercent = Math.max(
        maxDrawdownPercent,
        ((peak - mark) / peak) * 100
      );
      prior.push(bar);
    }
    daily.push({
      time: day[0].time,
      open: day[0].open,
      high: Math.max(...day.map(c => c.high)),
      low: Math.min(...day.map(c => c.low)),
      close: day.at(-1)!.close,
      volume: day.reduce((s, c) => s + c.volume, 0),
    });
  }
  const gains = trades.reduce((s, t) => s + Math.max(0, t.net), 0),
    losses = trades.reduce((s, t) => s + Math.max(0, -t.net), 0);
  const dayKey = (time: number) =>
    asset.assetClass === "stock"
      ? marketDayKey(time * 1000)
      : new Date(time * 1000).toISOString().slice(0, 10);
  return {
    rule: "entry-setups-v1",
    symbol: asset.symbol,
    completedSessions: complete.length,
    skippedSessions,
    firstSession: complete.length ? dayKey(complete[0][0].time) : null,
    lastSession: complete.length ? dayKey(complete.at(-1)![0].time) : null,
    assumptions: {
      initialCapital,
      interval: "5m",
      costs,
      signal: "closed bars only",
      entry: "next open or worse signal price",
      target: "2R gross",
      minNetRewardRisk: 1.5,
      maxPositions: 1,
      maxEntriesPerSession: 3,
      maxRiskPerSession: 300,
    },
    tradeCount: trades.length,
    net: cash - initialCapital,
    returnPercent: (cash / initialCapital - 1) * 100,
    wins: trades.filter(t => t.net > 0).length,
    losses: trades.filter(t => t.net < 0).length,
    profitFactor: losses > 0 ? gains / losses : null,
    maxDrawdownAtClosesPercent: maxDrawdownPercent,
    trades,
  };
}

async function main() {
  const file = process.argv[2];
  if (!file)
    throw new Error(
      "Provide a Yahoo chart JSON or JSON.gz file; no network requests are made."
    );
  const raw = await readFile(file),
    text = file.endsWith(".gz")
      ? gunzipSync(raw).toString("utf8")
      : raw.toString("utf8");
  const doc = JSON.parse(text),
    r = doc.chart?.result?.[0],
    q = r?.indicators?.quote?.[0];
  if (!r?.timestamp || !q) throw new Error("Expected Yahoo OHLC chart data");
  const rows: Candle[] = r.timestamp.flatMap((time: number, i: number) =>
    [q.open[i], q.high[i], q.low[i], q.close[i], q.volume[i]].every(
      (v: unknown) => typeof v === "number" && Number.isFinite(v)
    )
      ? [
          {
            time,
            open: q.open[i],
            high: q.high[i],
            low: q.low[i],
            close: q.close[i],
            volume: q.volume[i],
          },
        ]
      : []
  );
  const asset: Asset = {
    id: r.meta?.symbol ?? "TEST",
    symbol: r.meta?.symbol ?? "TEST",
    name: r.meta?.symbol ?? "TEST",
    assetClass: "stock",
  };
  const result = replaySetups(rows, asset);
  console.log(
    JSON.stringify(
      {
        inputSha256: createHash("sha256").update(raw).digest("hex"),
        ...result,
      },
      null,
      2
    )
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch(e => {
    console.error(e instanceof Error ? e.message : "Replay failed");
    process.exitCode = 1;
  });
