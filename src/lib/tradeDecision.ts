import type { Asset } from "@/types";
import type { EntryReading } from "./entrySetups";
import { assessEntryPlan } from "./entrySetups";
import type { Position } from "./portfolio";
import type { AlertRule } from "./alerts";
import { intradayAction } from "./intraday";
import { sessionPresentation } from "./marketSession";

export interface PlanRiskEvaluation {
  planId: string | null;
  valid: boolean;
  quantity: number;
  reason: string;
}
interface Input {
  asset: Asset;
  reading: EntryReading | null;
  risk: PlanRiskEvaluation | null;
  position?: Position;
  alerts: AlertRule[];
  now: number;
  intervalSeconds: number;
}

/** Entry confirmation, immutable plan and the user's risk are separate required gates. */
export function tradeDecision({
  asset,
  reading,
  risk,
  position,
  alerts,
  now,
  intervalSeconds,
}: Input) {
  const session = sessionPresentation(asset.assetClass, now);
  const result = (
    state: "loading" | "closed" | "wait" | "prepare" | "buy" | "exit",
    title: string,
    reason: string
  ) => ({ state, title, reason });
  if (session.paused)
    return result(
      "closed",
      "MERCADO CERRADO · ESPERAR",
      `${session.title}. ${session.nextOpening ?? session.schedule}`
    );
  if (
    !reading ||
    reading.asset.id !== asset.id ||
    reading.asset.assetClass !== asset.assetClass ||
    reading.intervalSeconds !== intervalSeconds
  )
    return result(
      "loading",
      "COMPROBANDO CUÁNDO COMPRAR",
      "Consultando cierres, volumen, precio actual y condiciones de entrada."
    );
  if (
    !reading.fetchedAt ||
    now - reading.fetchedAt > 30000 ||
    now < reading.fetchedAt - 5000
  )
    return result(
      "wait",
      "ESPERAR · FALTAN DATOS ACTUALES",
      "La consulta de la fuente no está vigente. Espera una actualización con datos actuales."
    );
  if (!reading.dataReady)
    return result(
      "wait",
      "ESPERAR · FALTAN DATOS ACTUALES",
      reading.reasons[0] ?? "No hay datos actuales verificables."
    );
  const action = intradayAction(reading, position, alerts);
  if (action.kind === "sell")
    return result("exit", "REVISAR VENTA DE TU POSICIÓN", action.detail);
  const plan = reading.plan;
  if (action.kind !== "buy" || !plan)
    return result("wait", "ESPERAR PARA COMPRAR", action.detail);
  const check = assessEntryPlan(plan, reading, now);
  if (check.status !== "ready")
    return result("wait", "ESPERAR · ENTRADA NO VIGENTE", check.reasons[0]);
  if (risk?.planId !== plan.id)
    return result(
      "prepare",
      "POSIBLE COMPRA · PREPARAR TU PLAN",
      "El cierre, volumen y precio confirman el setup. Aplica su entrada, stop y objetivo para calcular tu tamaño y validar costos y límites."
    );
  if (!risk.valid || !Number.isFinite(risk.quantity) || risk.quantity <= 0)
    return result(
      "prepare",
      "COMPRA PENDIENTE DE VALIDAR TU RIESGO",
      risk.reason
    );
  return result(
    "buy",
    "POSIBLE COMPRA AHORA",
    `Setup vigente y cálculo de riesgo válido para ${risk.quantity.toLocaleString("es", { maximumFractionDigits: 8 })} unidades. ${action.detail}`
  );
}
