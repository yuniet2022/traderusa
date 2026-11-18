import type { Asset, Candle, CandleHistory } from "@/types";
import { atr, ema, macd } from "./indicators";
import { candleClosedAt } from "./marketEvidence";
import { marketDayKey, marketSession } from "./marketSession";

export type EntryStatus =
  "ready" | "waiting" | "blocked" | "expired" | "invalidated";
export type EntryPattern =
  "orb" | "previous_high" | "retest" | "pullback" | "reclaim" | "rebound";
export const entryPatternNames: Record<EntryPattern, string> = {
  orb: "Ruptura del rango inicial",
  previous_high: "Ruptura del máximo anterior",
  retest: "Ruptura y retest",
  pullback: "Retroceso y reanudación",
  reclaim: "Barrida y recuperación de soporte",
  rebound: "Rebote confirmado tras caída",
};
export interface EntryPlan {
  asset: Asset;
  pattern: EntryPattern;
  id: string;
  triggerAt: number;
  expiresAt: number;
  intervalSeconds: number;
  entry: number;
  stop: number;
  target1: number;
  target2: number;
  maxEntry: number;
  invalidation: number;
  atr: number;
  volumeRatio: number;
  reference: number;
}
export interface EntryReading {
  asset: Asset;
  dataReady: boolean;
  entryAllowed: boolean;
  intervalSeconds: number;
  status: EntryStatus;
  reasons: string[];
  plan: EntryPlan | null;
  plans: { plan: EntryPlan; status: EntryStatus; reasons: string[] }[];
  lastClosedAt: number | null;
  observedPrice: number | null;
  observedAt: number | null;
  ignoredOpenBars: number;
  session: ReturnType<typeof marketSession>;
  closed: Candle[];
  source: string;
  fetchedAt: number | null;
  recentObservations: Candle[];
  range: { high: number; low: number; complete: boolean } | null;
  vwap: number | null;
}
export function validCandles(input: Candle[]): Candle[] {
  return [
    ...new Map(
      input
        .filter(
          c =>
            [c.time, c.open, c.high, c.low, c.close, c.volume].every(
              Number.isFinite
            ) &&
            c.time > 0 &&
            Math.min(c.open, c.high, c.low, c.close) > 0 &&
            c.volume >= 0 &&
            c.high >= Math.max(c.open, c.close, c.low) &&
            c.low <= Math.min(c.open, c.close, c.high)
        )
        .map(c => [c.time, c])
    ).values(),
  ].sort((a, b) => a.time - b.time);
}

/** Causal local reversal: no future pivot, no requirement for lagging bullish averages. */
function reboundStructure(
  rows: Candle[],
  index: number,
  volatility: number,
  sessionOpen: number,
  step: number
) {
  const window = rows
    .slice(Math.max(0, index - 13), index + 1)
    .filter(c => c.time * 1000 >= sessionOpen);
  if (
    window.length < 6 ||
    window.some((c, i) => i > 0 && c.time - window[i - 1].time !== step)
  )
    return null;
  const candidates = window.slice(Math.max(3, window.length - 7), -2);
  if (!candidates.length) return null;
  const low = Math.min(...candidates.map(c => c.low));
  const pivot = window.findIndex(c => c.low === low);
  if (pivot < 3 || pivot > window.length - 3) return null;
  const before = window.slice(0, pivot + 1),
    recovery = window.slice(pivot + 1);
  const declining = before
    .slice(1)
    .filter((c, i) => c.close < before[i].close).length;
  const ceiling = Math.max(...before.map(c => c.high));
  const last = window.at(-1)!,
    previous = window.at(-2)!,
    level = recovery[0].high;
  if (
    declining < 3 ||
    ceiling - low < volatility * 1.5 ||
    last.close - low > volatility * 2
  )
    return null;
  if (recovery.some((c, i) => c.low <= window[pivot + i].low)) return null;
  if (
    previous.close > level ||
    last.close <= level ||
    last.close <= previous.close
  )
    return null;
  return { level, low, ceiling };
}
export function checkEntryPlan(
  plan: EntryPlan,
  price: number,
  now: number
): { status: EntryStatus; reasons: string[] } {
  if (now >= plan.expiresAt)
    return {
      status: "expired",
      reasons: ["La confirmación caducó; requiere un setup nuevo."],
    };
  if (!Number.isFinite(price) || price <= 0)
    return { status: "blocked", reasons: ["Falta un precio válido."] };
  if (price <= plan.invalidation || price <= plan.stop)
    return {
      status: "invalidated",
      reasons: ["El precio perdió el nivel que justificaba la entrada."],
    };
  if (price > plan.maxEntry || price >= plan.target1)
    return {
      status: "blocked",
      reasons: ["Precio fuera de la zona de entrada: no perseguir la ruptura."],
    };
  return {
    status: "ready",
    reasons: [
      "Setup confirmado con cierre, volumen y precio dentro de la zona.",
    ],
  };
}
export function assessEntryPlan(
  plan: EntryPlan,
  reading: EntryReading | null,
  now: number
): { status: EntryStatus; reasons: string[] } {
  // Expiry depends on the frozen plan's clock, even if its feed subsequently fails.
  if (now >= plan.expiresAt) return checkEntryPlan(plan, NaN, now);
  if (
    !reading?.dataReady ||
    reading.asset.id !== plan.asset.id ||
    reading.asset.assetClass !== plan.asset.assetClass ||
    reading.intervalSeconds !== plan.intervalSeconds
  )
    return {
      status: "blocked",
      reasons: ["Faltan datos actuales del mismo activo e intervalo."],
    };
  if (!reading.entryAllowed)
    return { status: "blocked", reasons: reading.reasons };
  if (
    reading.recentObservations.some(
      c => c.time * 1000 >= plan.triggerAt && c.low <= plan.invalidation
    )
  )
    return {
      status: "invalidated",
      reasons: [
        "Después de confirmar, el precio perdió el nivel de invalidez; requiere un setup nuevo.",
      ],
    };
  return checkEntryPlan(plan, reading.observedPrice ?? NaN, now);
}

/** Long entries only. Independent TS implementation informed by Day Trader Skill's closed-bar workflow. */
export function detectEntrySetups(
  asset: Asset,
  history: CandleHistory | null,
  daily: Candle[],
  now: number,
  intervalSeconds = 300,
  refreshFailed = false
): EntryReading {
  const session = marketSession(asset.assetClass, now);
  const all = validCandles(history?.candles ?? []).filter(
    c => c.time * 1000 <= now
  );
  const sessions = new Map<string, ReturnType<typeof marketSession>>();
  const regular = all.filter(c => {
    if (asset.assetClass === "crypto") return true;
    const time = c.time * 1000,
      key = marketDayKey(time);
    let day = sessions.get(key);
    if (!day) {
      day = marketSession("stock", time);
      sessions.set(key, day);
    }
    return day.known && day.tradingDay && time >= day.open && time < day.close;
  });
  const closed = regular.filter(c => (c.time + intervalSeconds) * 1000 <= now);
  const today = closed.filter(
    c => c.time * 1000 >= session.open && c.time * 1000 < session.close
  );
  const last = today.at(-1),
    observed = regular.at(-1);
  const lastClosedAt = last ? (last.time + intervalSeconds) * 1000 : null;
  const reasons: string[] = [];
  if (!session.known)
    reasons.push("Calendario no cubierto; no se confirma una entrada.");
  else if (!session.openNow)
    reasons.push("Fuera de la sesión regular de acciones.");
  if (
    !history?.fetchedAt ||
    history.fetchedAt > now + 5000 ||
    now - history.fetchedAt > 30000
  )
    reasons.push(
      "La consulta de la fuente no es reciente o no tiene fecha verificable."
    );
  if (history?.stale || refreshFailed)
    reasons.push(
      "Actualización fallida o historial anterior; no se confirma una entrada."
    );
  if (history?.dailyCloseOnly)
    reasons.push("La fuente solo entrega cierres diarios.");
  if (!lastClosedAt || now - lastClosedAt > intervalSeconds * 2000 + 30000)
    reasons.push("Faltan cierres recientes de esta sesión.");
  if (lastClosedAt && history?.fetchedAt && history.fetchedAt < lastClosedAt)
    reasons.push(
      "Esperar una consulta posterior al cierre de la última vela; una instantánea anterior no confirma su volumen final."
    );
  if (
    history?.priceAsOf &&
    lastClosedAt &&
    history.priceAsOf < lastClosedAt - 60000
  )
    reasons.push(
      "La hora del precio del proveedor está atrasada frente a la vela cerrada."
    );
  if (
    history?.priceAsOf &&
    lastClosedAt &&
    history.priceAsOf < lastClosedAt &&
    now - lastClosedAt < 60000 &&
    !regular.some(c => c.time * 1000 >= lastClosedAt)
  )
    reasons.push(
      "Esperar a que el proveedor confirme el cierre de la última vela."
    );
  if (history?.priceAsOf && history.priceAsOf > now + 5000)
    reasons.push("La fuente informa una hora de precio futura.");
  const local = today.slice(-4);
  if (
    local.some(
      (c, i) => i > 0 && c.time - local[i - 1].time !== intervalSeconds
    )
  )
    reasons.push("Hay huecos entre las últimas velas; falta continuidad.");
  if (
    local.some(
      c => (c.time * 1000 - session.open) % (intervalSeconds * 1000) !== 0
    )
  )
    reasons.push("Las velas no coinciden con el intervalo elegido.");
  const opening = today.filter(c => c.time * 1000 < session.open + 30 * 60000);
  const complete =
    opening.length === 1800 / intervalSeconds &&
    opening.every(
      (c, i) => c.time * 1000 === session.open + i * intervalSeconds * 1000
    );
  const range = opening.length
    ? {
        high: Math.max(...opening.map(c => c.high)),
        low: Math.min(...opening.map(c => c.low)),
        complete,
      }
    : null;
  const v = today.reduce((s, c) => s + c.volume, 0);
  const vwap =
    v > 0
      ? today.reduce(
          (s, c) => s + ((c.high + c.low + c.close) / 3) * c.volume,
          0
        ) / v
      : null;
  const result: EntryReading = {
    asset,
    intervalSeconds,
    dataReady: reasons.length === 0,
    entryAllowed: reasons.length === 0,
    status: "waiting",
    reasons,
    plan: null,
    plans: [],
    lastClosedAt,
    observedPrice: observed?.close ?? null,
    observedAt: history?.priceAsOf ?? null,
    ignoredOpenBars: regular.length - closed.length,
    session,
    closed,
    recentObservations: regular.slice(-20),
    source: history?.source ?? "Sin fuente",
    fetchedAt: history?.fetchedAt ?? null,
    range,
    vwap,
  };
  if (!history || closed.length < 20 || !last) {
    result.dataReady = false;
    result.entryAllowed = false;
    result.status = "blocked";
    result.reasons = [
      ...reasons,
      "Se necesitan al menos 20 velas cerradas y datos de la sesión actual.",
    ];
    return result;
  }
  if (session.openNow && now >= session.cutoff)
    reasons.push(
      "Terminó la ventana para nuevas entradas intradía; las salidas se siguen revisando."
    );
  const earliestEntry =
    asset.assetClass === "stock" ? session.open + 15 * 60000 : session.open;
  if (session.openNow && now < earliestEntry)
    reasons.push(
      "Esperar los primeros 15 minutos de la sesión de acciones antes de nuevas entradas."
    );
  if (range?.complete) {
    let outside = 0,
      reentries = 0,
      up = false,
      down = false;
    for (const c of today.filter(
      c =>
        c.time * 1000 >= session.open + 30 * 60000 &&
        (c.time + intervalSeconds) * 1000 > now - 60 * 60000
    )) {
      const side = c.close > range.high ? 1 : c.close < range.low ? -1 : 0;
      if (outside && !side) reentries++;
      up ||= side === 1;
      down ||= side === -1;
      outside = side;
    }
    if (reentries >= 2 || (up && down))
      reasons.push(
        "Rupturas fallidas o en ambas direcciones durante la última hora: esperar estructura más clara para una nueva entrada."
      );
  }
  result.entryAllowed = reasons.length === 0;
  const priorDay = validCandles(daily)
    .filter(c => candleClosedAt(c, 86400, asset.assetClass) <= session.open)
    .at(-1);
  const closes = closed.map(c => c.close),
    fast = ema(closes, 20),
    slow = ema(closes, 50),
    hist = macd(closes).hist,
    volatility = atr(closed);
  const latestByPattern = new Map<EntryPattern, EntryPlan>();
  const first = Math.max(20, closed.length - 6);
  for (let i = first; i < closed.length; i++) {
    const c = closed[i],
      p = closed[i - 1];
    if (
      c.time * 1000 < session.open ||
      (c.time + intervalSeconds) * 1000 < earliestEntry ||
      (c.time + intervalSeconds) * 1000 > session.cutoff ||
      c.time - p.time !== intervalSeconds ||
      c.close <= c.open
    )
      continue;
    const baseline =
      closed.slice(i - 20, i).reduce((s, b) => s + b.volume, 0) / 20;
    if (!(baseline > 0)) continue;
    const volumeRatio = c.volume / baseline;
    if (
      volumeRatio < 1.2 ||
      (c.high > c.low && (c.high - c.close) / (c.high - c.low) > 0.45)
    )
      continue;
    const atrValue = volatility[i];
    if (!atrValue || !(atrValue > 0) || !fast[i]) continue;
    const trend =
      c.close > fast[i]! && (slow[i] == null || fast[i]! > slow[i]!);
    const improving =
      hist[i] != null && hist[i - 1] != null
        ? hist[i]! > hist[i - 1]!
        : c.close > p.close;
    const matches: {
      pattern: EntryPattern;
      level: number;
      structure: number;
      ceiling?: number;
    }[] = [];
    if (
      range?.complete &&
      c.time * 1000 >= session.open + 30 * 60000 &&
      p.close <= range.high &&
      c.close > range.high &&
      trend &&
      improving
    )
      matches.push({
        pattern: "orb",
        level: range.high,
        structure: (range.high + range.low) / 2,
      });
    if (
      priorDay &&
      p.close <= priorDay.high &&
      c.close > priorDay.high &&
      trend &&
      improving
    )
      matches.push({
        pattern: "previous_high",
        level: priorDay.high,
        structure: Math.min(c.low, p.low),
      });
    if (
      range?.complete &&
      c.time * 1000 >= session.open + 30 * 60000 &&
      trend
    ) {
      // The break must precede the retest, and no intervening close may invalidate it.
      const breakIndex = closed.findIndex(
        (b, j) =>
          j > 0 &&
          j >= i - 6 &&
          j < i &&
          b.time * 1000 >= session.open + 30 * 60000 &&
          closed[j - 1].close <= range.high &&
          b.close > range.high
      );
      if (
        breakIndex >= 0 &&
        closed
          .slice(breakIndex, i)
          .every(b => b.close >= range.high - atrValue * 0.1) &&
        c.low >= range.high - atrValue * 0.2 &&
        c.low <= range.high + atrValue * 0.2 &&
        c.close > range.high &&
        c.close > p.close
      )
        matches.push({
          pattern: "retest",
          level: range.high,
          structure: Math.min(c.low, p.low, range.high),
        });
    }
    if (
      trend &&
      p.low <= fast[i - 1]! + atrValue * 0.15 &&
      p.close >= fast[i - 1]! - atrValue * 0.2 &&
      c.close > p.close &&
      c.close > fast[i]!
    )
      matches.push({
        pattern: "pullback",
        level: fast[i]!,
        structure: Math.min(c.low, p.low),
      });
    const support =
      priorDay?.low ??
      (range?.complete && c.time * 1000 >= session.open + 30 * 60000
        ? range.low
        : null);
    if (
      support != null &&
      c.low < support &&
      c.close > support &&
      c.close > p.close &&
      improving
    )
      matches.push({ pattern: "reclaim", level: support, structure: c.low });
    const rebound = reboundStructure(
      closed,
      i,
      atrValue,
      session.open,
      intervalSeconds
    );
    if (rebound)
      matches.push({
        pattern: "rebound",
        level: rebound.level,
        structure: rebound.low,
        ceiling: rebound.ceiling,
      });
    for (const match of matches) {
      const stop =
        Math.min(match.structure, c.close - atrValue * 0.5) - atrValue * 0.1;
      const risk = c.close - stop;
      if (!(stop > 0) || risk / c.close < 0.0005 || !Number.isFinite(risk))
        continue;
      if (match.ceiling !== undefined && c.close + 2 * risk > match.ceiling)
        continue;
      const triggerAt = (c.time + intervalSeconds) * 1000;
      const maxEntry = Math.min(
        c.close + atrValue * 0.5,
        c.close + risk * 0.25
      );
      latestByPattern.set(match.pattern, {
        asset,
        intervalSeconds,
        pattern: match.pattern,
        id: `${asset.assetClass}:${asset.id}:${intervalSeconds}:${match.pattern}:${c.time}`,
        triggerAt,
        expiresAt: Math.min(triggerAt + intervalSeconds * 2000, session.cutoff),
        entry: c.close,
        stop,
        target1: c.close + 2 * risk,
        target2: c.close + 3 * risk,
        maxEntry,
        invalidation: Math.max(stop, match.level - atrValue * 0.2),
        atr: atrValue,
        volumeRatio,
        reference: match.level,
      });
    }
  }
  result.plans = [...latestByPattern.values()]
    .map(plan => ({
      plan,
      ...(reasons.length
        ? { status: "blocked" as const, reasons }
        : assessEntryPlan(plan, result, now)),
    }))
    .sort(
      (a, b) =>
        Number(b.status === "ready") - Number(a.status === "ready") ||
        b.plan.triggerAt - a.plan.triggerAt
    );
  const best = result.plans[0];
  result.plan = best?.plan ?? null;
  result.status = reasons.length ? "blocked" : (best?.status ?? "waiting");
  result.reasons = reasons.length
    ? reasons
    : (best?.reasons ?? [
        "Esperar cierre de confirmación y volumen relativo ≥1.2×; aún no hay un setup válido.",
      ]);
  return result;
}
