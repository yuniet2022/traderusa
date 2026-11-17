import type { EntryReading } from "./entrySetups";
import { entryPatternNames } from "./entrySetups";
import { reviewPositionExit } from "./exitReview";
import type { Position } from "./portfolio";
import type { AlertRule } from "./alerts";
import { fmtPrice } from "./format";

export type IntradayInterval = "1m" | "5m" | "15m";
export const intradaySeconds = (interval: IntradayInterval) =>
  interval === "1m" ? 60 : interval === "5m" ? 300 : 900;
export const assetKey = (asset: { id: string; assetClass: string }) =>
  `${asset.assetClass}:${asset.id}`;

export interface IntradayAction {
  key: string;
  kind: "buy" | "sell" | "wait" | "blocked";
  title: string;
  detail: string;
  /** Stable for one closed trigger, or one continuous exit episode. */
  notificationKey: string | null;
  reading: EntryReading;
  pnl: number | null;
}

/** A market bias alone never produces an execution alert. Sales require valid held lots. */
export function intradayAction(
  reading: EntryReading,
  position?: Position,
  alerts: AlertRule[] = []
): IntradayAction {
  const key = assetKey(reading.asset);
  const exit = position ? reviewPositionExit(position, reading, alerts) : null;
  const base = { key, reading, pnl: exit?.metrics.pnl ?? null };
  if (exit?.current && (exit.deterioration || exit.breached.length)) {
    const cause = exit.breached.length
      ? `Umbral personal alcanzado: ${exit.breached.map(a => fmtPrice(a.price!)).join(", ")}.`
      : `${exit.title}: giro cerrado con pérdida de impulso y volumen.`;
    const lots = JSON.stringify(position!.lots);
    const trigger = exit.breached.length
      ? exit.breached
          .map(a => a.id)
          .sort()
          .join(",")
      : "reversal";
    return {
      ...base,
      kind: "sell",
      title: "Revisar venta de tu posición",
      detail: `${cause} Resultado latente bruto: ${exit.metrics.pnl!.toLocaleString("en-US", { style: "currency", currency: "USD" })}.`,
      notificationKey: `${key}:${reading.intervalSeconds}:sell:${trigger}:${lots}`,
    };
  }
  if (
    reading.status === "ready" &&
    reading.plan &&
    reading.entryAllowed &&
    reading.dataReady
  ) {
    const p = reading.plan;
    return {
      ...base,
      kind: "buy",
      title: "Posible compra intradía",
      detail: `${entryPatternNames[p.pattern]}. Entrada ${fmtPrice(p.entry)}, máximo ${fmtPrice(p.maxEntry)}, stop ${fmtPrice(p.stop)}, objetivo ${fmtPrice(p.target1)}. Revisa tamaño y costos.`,
      notificationKey: `${key}:${reading.intervalSeconds}:buy:${p.triggerAt}`,
    };
  }
  return {
    ...base,
    kind: reading.status === "blocked" ? "blocked" : "wait",
    title: !reading.session.openNow
      ? "Mercado de acciones cerrado"
      : reading.status === "blocked"
        ? "Sin entrada confirmada"
        : "Esperar un setup nuevo",
    detail: reading.reasons[0] ?? "Aún no hay confirmación.",
    notificationKey: null,
  };
}

/** One buy notice per closed trigger; one sale notice per continuous exit condition. */
export class IntradayNoticeLedger {
  private buys = new Set<string>();
  private exits = new Map<string, string>();
  collect(actions: IntradayAction[]): IntradayAction[] {
    const next: IntradayAction[] = [];
    for (const a of actions) {
      if (!a.reading.dataReady) continue; // a source failure does not rearm a continuing exit
      if (a.kind !== "sell") this.exits.delete(a.key);
      if (!a.notificationKey) continue;
      if (a.kind === "buy" && !this.buys.has(a.notificationKey)) {
        next.push(a);
        this.buys.add(a.notificationKey);
        if (this.buys.size > 500)
          this.buys.delete(this.buys.values().next().value!);
      }
      if (a.kind === "sell" && this.exits.get(a.key) !== a.notificationKey) {
        next.push(a);
        this.exits.set(a.key, a.notificationKey);
      }
    }
    return next;
  }
}
