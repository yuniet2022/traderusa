import type { Asset, Candle } from "@/types";
import type { TradingCosts } from "@contracts/trading";
import { costsSchema, settleLong } from "@contracts/trading";
import { calculatePositionSize } from "./risk";
import { atr, ema } from "./indicators";

export type Horizon = "intraday" | "swing";
export type Setup = "pullback" | "continuation" | "wait";
export const RULE_VERSION = "long-ema20-50-atr14-v1";
export const RULES =
  "Compra: EMA20 > EMA50 y cierre sobre EMA20; recuperación de EMA20 tras retroceso, o ruptura del máximo de 10 velas. Entrada en la apertura siguiente. Stop a 2 ATR14 y objetivo a 2 veces el riesgo. Salida por stop, objetivo, cierre bajo EMA50 o plazo de 20 velas diarias / 24 velas de 5 min. Sin ventas en corto.";

const nyTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
function clock(time: number, assetClass: Asset["assetClass"]) {
  const d = new Date(time * 1000);
  if (assetClass === "crypto")
    return {
      day: d.toISOString().slice(0, 10),
      minute: d.getUTCHours() * 60 + d.getUTCMinutes(),
    };
  const p = Object.fromEntries(
    nyTime.formatToParts(d).map(p => [p.type, p.value])
  );
  return {
    day: `${p.year}-${p.month}-${p.day}`,
    minute: Number(p.hour) * 60 + Number(p.minute),
  };
}
function nearClose(c: Candle, assetClass: Asset["assetClass"]) {
  return (
    clock(c.time, assetClass).minute >=
    (assetClass === "stock" ? 15 * 60 + 55 : 23 * 60 + 55)
  );
}
export function completedCandles(
  candles: Candle[],
  horizon: Horizon,
  assetClass: Asset["assetClass"],
  now = Date.now()
): Candle[] {
  return candles.filter(c => {
    if (horizon === "intraday") return (c.time + 300) * 1000 <= now;
    if (assetClass === "crypto")
      return (Math.floor(c.time / 86400) * 86400 + 86400) * 1000 <= now;
    const bar = clock(c.time, assetClass),
      current = clock(now / 1000, assetClass);
    // Stooq labels daily bars at UTC midnight; Yahoo uses the session open.
    if (c.time % 86400 === 0) bar.day = new Date(c.time * 1000).toISOString().slice(0, 10);
    return (
      bar.day < current.day ||
      (bar.day === current.day && current.minute >= 16 * 60 + 15)
    );
  });
}
export function strategySeries(candles: Candle[]) {
  const closes = candles.map(c => c.close),
    fast = ema(closes, 20),
    slow = ema(closes, 50),
    volatility = atr(candles);
  const setups: Setup[] = candles.map((c, i) => {
    if (
      i < 50 ||
      fast[i] === null ||
      slow[i] === null ||
      !volatility[i] ||
      fast[i]! <= slow[i]! ||
      c.close <= fast[i]!
    )
      return "wait";
    if (candles[i - 1].close <= fast[i - 1]!) return "pullback";
    if (c.close > Math.max(...candles.slice(i - 10, i).map(c => c.high)))
      return "continuation";
    return "wait";
  });
  return { setups, slow, volatility };
}
export interface BacktestOptions extends TradingCosts {
  capital: number;
  riskPercent: number;
  horizon: Horizon;
  assetClass: Asset["assetClass"];
}
export interface TestTrade {
  entryTime: number;
  exitTime: number;
  entry: number;
  exit: number;
  quantity: number;
  stop: number;
  target: number;
  net: number;
  fees: number;
  r: number;
  reason:
    "stop" | "target" | "trend" | "time" | "session" | "gap-session" | "end";
  setup: Setup;
  ambiguous: boolean;
  sessionGap: boolean;
}
export function runBacktest(
  candles: Candle[],
  options: BacktestOptions,
  start = 50,
  end = candles.length
) {
  if (
    options.capital <= 0 ||
    !Number.isFinite(options.capital) ||
    !Number.isFinite(options.riskPercent) ||
    options.riskPercent <= 0 ||
    options.riskPercent > 5
  )
    throw new Error("Capital o riesgo inválido.");
  if (!costsSchema.safeParse(options).success) throw new Error('Costes inválidos.');
  const series = strategySeries(candles);
  let cash = options.capital,
    peak = cash,
    maxDrawdown = 0,
    position: {
      entryIndex: number;
      entryFill: number;
      entryFee: number;
      quantity: number;
      stop: number;
      target: number;
      risk: number;
      setup: Setup;
    } | null = null;
  const trades: TestTrade[] = [],
    equity: { time: number; value: number }[] = [];
  const last = Math.min(end, candles.length) - 1;
  for (let i = Math.max(50, start); i <= last; i++) {
    const c = candles[i],
      prev = candles[i - 1];
    if (!position && series.setups[i - 1] !== "wait" && cash > 0) {
      const distance = 2 * (series.volatility[i - 1] ?? 0);
      const allowed =
        options.horizon !== "intraday" ||
        (clock(c.time, options.assetClass).day ===
          clock(prev.time, options.assetClass).day &&
          !nearClose(c, options.assetClass) &&
          (options.assetClass !== "stock" ||
            clock(c.time, "stock").minute >= 570));
      if (allowed && distance > 0 && c.open > distance) {
        const size = calculatePositionSize({
          ...options,
          capital: cash,
          entry: c.open,
          stop: c.open - distance,
          target: c.open + 2 * distance,
          direction: "long",
          fractional: options.assetClass === "crypto",
        });
        if (size.quantity > 0 && size.estimatedGain > 0) {
          position = {
            entryIndex: i,
            entryFill: size.entryFill,
            entryFee: size.capitalUsed - size.positionValue,
            quantity: size.quantity,
            stop: c.open - distance,
            target: c.open + 2 * distance,
            risk: size.estimatedLoss,
            setup: series.setups[i - 1],
          };
          cash -= size.capitalUsed;
        }
      }
    }
    if (position) {
      let reason: TestTrade["reason"] | null = null,
        exit = c.close;
      const gapSession =
        options.horizon === "intraday" &&
        clock(c.time, options.assetClass).day !==
          clock(prev.time, options.assetClass).day;
      const ambiguous = c.low <= position.stop && c.high >= position.target;
      // Gap fills and signals known before this bar take precedence over its unknown path.
      if (c.open <= position.stop) {
        reason = "stop";
        exit = c.open;
      } else if (c.open >= position.target) {
        reason = "target";
        exit = position.target;
      } else if (gapSession) {
        reason = "gap-session";
        exit = c.open;
      } else if (
        i > position.entryIndex &&
        (prev.close < (series.slow[i - 1] ?? 0) ||
          i - position.entryIndex >= (options.horizon === "intraday" ? 24 : 20))
      ) {
        reason = prev.close < (series.slow[i - 1] ?? 0) ? "trend" : "time";
        exit = c.open;
      } else if (c.low <= position.stop) {
        reason = "stop";
        exit = position.stop;
      } else if (c.high >= position.target) {
        reason = "target";
        exit = position.target;
      } else if (
        options.horizon === "intraday" &&
        nearClose(c, options.assetClass)
      )
        reason = "session";
      else if (i === last) reason = "end";
      if (reason) {
        const result = settleLong(
          position.quantity,
          position.entryFill,
          position.entryFee,
          exit,
          options
        );
        cash += result.proceeds;
        trades.push({
          entryTime: candles[position.entryIndex].time,
          exitTime: c.time,
          entry: position.entryFill,
          exit: result.exitFill,
          quantity: position.quantity,
          stop: position.stop,
          target: position.target,
          net: result.net,
          fees: position.entryFee + result.exitFee,
          r: result.net / position.risk,
          setup: position.setup,
          reason,
          ambiguous: reason === "stop" && ambiguous && c.open > position.stop,
          sessionGap: gapSession,
        });
        position = null;
      }
    }
    const value =
      cash +
      (position
        ? settleLong(
            position.quantity,
            position.entryFill,
            position.entryFee,
            c.close,
            options
          ).proceeds
        : 0);
    peak = Math.max(peak, value);
    maxDrawdown = Math.max(maxDrawdown, ((peak - value) / peak) * 100);
    equity.push({ time: c.time, value });
  }
  const wins = trades.filter(t => t.net > 0),
    losses = trades.filter(t => t.net < 0);
  const gain = wins.reduce((s, t) => s + t.net, 0),
    loss = -losses.reduce((s, t) => s + t.net, 0);
  const first = candles[Math.max(50, start)],
    final = candles[last];
  let benchmark: number | null = null;
  if (first && final) {
    const fill = first.open * (1 + options.slippagePercent / 100);
    const precision = options.assetClass === "crypto" ? 1e8 : 1;
    const quantity = Math.max(
      0,
      Math.floor(
        ((options.capital - options.fixedFee) /
          (fill * (1 + options.feePercent / 100))) *
          precision
      ) / precision
    );
    if (quantity > 0)
      benchmark =
        (settleLong(
          quantity,
          fill,
          (quantity * fill * options.feePercent) / 100 + options.fixedFee,
          final.close,
          options
        ).net /
          options.capital) *
        100;
  }
  return {
    trades,
    equity,
    net: cash - options.capital,
    returnPercent: (cash / options.capital - 1) * 100,
    maxDrawdown,
    winRate: trades.length ? (wins.length / trades.length) * 100 : null,
    profitFactor: loss > 0 ? gain / loss : null,
    expectancy: trades.length ? (cash - options.capital) / trades.length : null,
    fees: trades.reduce((s, t) => s + t.fees, 0),
    benchmark,
    ambiguous: trades.filter(t => t.ambiguous).length,
    sessionGaps: trades.filter(t => t.sessionGap).length,
  };
}
