import type { Position } from "./portfolio";
import type { AlertRule } from "./alerts";
import { positionMetrics } from "./positionContext";
import type { EntryReading } from "./entrySetups";
import { atr, macd } from "./indicators";

/** Evaluates a held long position; never turns a hypothetical short target into an exit. */
export function reviewPositionExit(
  position: Position,
  reading: EntryReading,
  alerts: AlertRule[]
) {
  const metrics = positionMetrics(position, reading.observedPrice);
  if (
    position.assetId !== reading.asset.id ||
    position.assetClass !== reading.asset.assetClass ||
    !metrics ||
    metrics.pnl === null
  )
    return null;
  const rows = reading.closed.filter(
    c => c.time * 1000 >= reading.session.open
  );
  const last = rows.at(-1),
    previous = rows.at(-2);
  const closes = reading.closed.map(c => c.close),
    hist = macd(closes).hist;
  const momentumFades =
    hist.at(-1) != null && hist.at(-3) != null && hist.at(-1)! < hist.at(-3)!;
  const earlier = rows.slice(-21, -1);
  const recentPeak = earlier.length
    ? Math.max(...earlier.map(c => c.high))
    : null;
  const volatility = atr(reading.closed).at(-1);
  const recentRise =
    last &&
    earlier.length >= 5 &&
    volatility != null &&
    recentPeak! - earlier[0].close >= volatility;
  const baseline = earlier.length
    ? earlier.reduce((s, c) => s + c.volume, 0) / earlier.length
    : 0;
  const rejection =
    !!last &&
    last.high > last.low &&
    (last.high - Math.max(last.open, last.close)) / (last.high - last.low) >=
      0.45 &&
    last.close < last.open;
  const breakdown = !!last && !!previous && last.close < previous.low;
  const sellingVolume =
    !!last &&
    baseline > 0 &&
    last.volume / baseline >= 1.2 &&
    last.close < last.open;
  const deterioration =
    !!recentRise && momentumFades && (rejection || breakdown) && sellingVolume;
  const breached = alerts.filter(
    a =>
      a.assetId === position.assetId &&
      a.price != null &&
      (a.kind === "price_below"
        ? reading.observedPrice! <= a.price
        : a.kind === "price_above" && reading.observedPrice! >= a.price)
  );
  return {
    metrics,
    deterioration,
    breached: reading.dataReady ? breached : [],
    recentPeak,
    referenceStop:
      earlier.length >= 3
        ? Math.min(...earlier.slice(-3).map(c => c.low))
        : null,
    title: !reading.dataReady
      ? "Salida pendiente de datos actuales"
      : breached.length
        ? "Tu umbral de precio se alcanzó"
        : deterioration
          ? metrics.pnl > 0
            ? "Revisar protección de ganancias"
            : "Revisar riesgo de tu posición"
          : "Sin giro de salida confirmado por estas reglas",
    evidence: { momentumFades, rejection, breakdown, sellingVolume },
    current: reading.dataReady,
  };
}
