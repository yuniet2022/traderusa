import { useEffect, useMemo, useState } from "react";
import type { AssetAnalysis } from "@/types";
import type { Position } from "@/lib/portfolio";
import type { AlertRule } from "@/lib/alerts";
import {
  detectEntrySetups,
  entryPatternNames,
  type EntryPlan,
  type EntryReading,
  type EntryStatus,
} from "@/lib/entrySetups";
import { useCandleHistory } from "@/hooks/useCandleHistory";
import { useMarketClock } from "@/hooks/useMarketClock";
import { reviewPositionExit } from "@/lib/exitReview";
import { fmtPrice } from "@/lib/format";
import { Button } from "./ui/button";

const labels: Record<EntryStatus, string> = {
  ready: "Confirmado para evaluar",
  waiting: "Esperando confirmación",
  blocked: "Entrada bloqueada",
  expired: "Confirmación caducada",
  invalidated: "Setup invalidado",
};
interface Props {
  analysis: AssetAnalysis;
  position?: Position;
  alerts: AlertRule[];
  onUsePlan: (plan: EntryPlan) => void;
  onReading: (reading: EntryReading) => void;
}
export function SetupPanel({
  analysis: a,
  position,
  alerts,
  onUsePlan,
  onReading,
}: Props) {
  const [timeframe, setTimeframe] = useState<"1m" | "5m" | "15m">("5m");
  const now = useMarketClock();
  const { history, error, loading, refresh } = useCandleHistory(
    a.asset,
    timeframe
  );
  const seconds = timeframe === "1m" ? 60 : timeframe === "5m" ? 300 : 900;
  const reading = useMemo(
    () => detectEntrySetups(a.asset, history, a.candles, now, seconds, !!error),
    [a.asset, a.candles, history, now, seconds, error]
  );
  useEffect(() => {
    onReading(reading);
  }, [onReading, reading]);
  const exit = position ? reviewPositionExit(position, reading, alerts) : null;
  const when = (value: number) =>
    new Date(value).toLocaleTimeString("es", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  const plan = reading.plan;
  return (
    <section
      aria-label="Entradas y salidas por setups"
      className="min-w-0 rounded-xl border border-indigo-800/60 bg-indigo-950/15 p-3 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Entradas y salidas por setups</h3>
        <label className="text-xs text-zinc-300">
          Velas{" "}
          <select
            aria-label="Intervalo del detector de entradas"
            className="h-10 rounded border border-zinc-700 bg-zinc-950 px-2"
            value={timeframe}
            onChange={e => setTimeframe(e.target.value as typeof timeframe)}
          >
            <option value="1m">1 min</option>
            <option value="5m">5 min</option>
            <option value="15m">15 min</option>
          </select>
        </label>
      </div>
      <p
        role="status"
        className={`text-sm font-semibold ${reading.status === "ready" ? "text-emerald-300" : "text-amber-300"}`}
      >
        {loading && !history ? "Cargando velas…" : labels[reading.status]}
      </p>
      <p className="text-[11px] text-zinc-400">
        {reading.session.label}. La referencia inicial exige los 30 minutos
        completos; no se inventa un rango si faltan velas.
      </p>
      <ul className="space-y-1 text-xs text-zinc-300">
        {reading.reasons.slice(0, 3).map(reason => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
      <p className="text-[11px] text-zinc-400">
        {reading.lastClosedAt
          ? `Último cierre: ${when(reading.lastClosedAt)}`
          : "Sin cierre reciente"}{" "}
        · {reading.ignoredOpenBars} vela(s) abierta(s) excluida(s) ·{" "}
        {reading.source}.
      </p>
      <p className="text-[11px] text-zinc-400">
        Consulta: {reading.fetchedAt ? when(reading.fetchedAt) : "sin fecha"} ·
        Hora del precio:{" "}
        {reading.observedAt
          ? when(reading.observedAt)
          : "el proveedor no la informa"}
        .
      </p>
      <div className="grid grid-cols-3 gap-2 text-[11px]">
        {[
          [
            "Rango inicial máx.",
            reading.range?.complete ? reading.range.high : null,
          ],
          [
            "Rango inicial mín.",
            reading.range?.complete ? reading.range.low : null,
          ],
          ["VWAP de sesión", reading.vwap],
        ].map(([label, value]) => (
          <div key={label} className="min-w-0 rounded bg-zinc-950/50 p-2">
            <p className="text-zinc-400">{label}</p>
            <p className="break-words font-mono">
              {typeof value === "number" ? fmtPrice(value) : "Sin confirmar"}
            </p>
          </div>
        ))}
      </div>
      {plan && (
        <div className="rounded-lg border border-zinc-700 p-2.5 space-y-2">
          <h4 className="text-xs font-semibold">
            {entryPatternNames[plan.pattern]}
          </h4>
          <p className="text-[11px] text-zinc-400">
            Confirmación: {when(plan.triggerAt)} · caduca {when(plan.expiresAt)}{" "}
            · volumen {plan.volumeRatio.toFixed(2)}× las 20 velas anteriores.
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              ["Entrada de referencia", plan.entry],
              ["Máximo para no perseguir", plan.maxEntry],
              ["Stop estructural", plan.stop],
              ["Objetivo 1 · 2R bruto", plan.target1],
              ["Objetivo 2 · 3R bruto", plan.target2],
              ["Invalida al perder", plan.invalidation],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0 rounded bg-zinc-950/50 p-2">
                <p className="text-[11px] text-zinc-400">{label}</p>
                <p className="break-words font-mono">
                  {fmtPrice(Number(value))}
                </p>
              </div>
            ))}
          </div>
          <Button
            size="sm"
            className="min-h-10 h-auto w-full whitespace-normal"
            disabled={reading.status !== "ready"}
            onClick={() => onUsePlan(plan)}
          >
            Usar setup en calculadora de riesgo
          </Button>
          <p className="text-[11px] text-zinc-400">
            R = distancia entre entrada y stop antes de costos. Se bloquea la
            entrada si caduca, pierde su nivel o el precio se aleja demasiado.
            Ningún botón coloca una orden.
          </p>
        </div>
      )}
      <details className="text-xs">
        <summary className="min-h-9 cursor-pointer text-indigo-300">
          Ver los cinco patrones y sus estados
        </summary>
        <div className="space-y-2">
          {Object.entries(entryPatternNames).map(([id, name]) => {
            const item = reading.plans.find(row => row.plan.pattern === id);
            return (
              <p key={id} className="rounded border border-zinc-800 p-2">
                <strong>{name}</strong>
                <br />
                <span className="text-zinc-400">
                  {item
                    ? `${labels[item.status]} · ${item.reasons[0]}`
                    : "Sin confirmación reciente que cumpla cierre, estructura y volumen."}
                </span>
              </p>
            );
          })}
        </div>
      </details>
      {position && (
        <div
          aria-label="Revisión de salida de tu posición"
          className="border-t border-zinc-700 pt-3 space-y-2"
        >
          <h4 className="text-sm font-semibold">
            {exit?.title ?? "Registra tus compras para evaluar la salida"}
          </h4>
          {exit && (
            <>
              <p
                className={
                  exit.metrics.pnl! < 0
                    ? "text-xs text-red-300"
                    : "text-xs text-emerald-300"
                }
              >
                Resultado latente al precio intradía
                {exit.current ? "" : " anterior"}:{" "}
                {exit.metrics.pnl!.toLocaleString("en-US", {
                  style: "currency",
                  currency: "USD",
                })}{" "}
                · costo promedio {fmtPrice(exit.metrics.average)}.
              </p>
              {exit.breached.map(rule => (
                <p key={rule.id} className="text-xs text-amber-300">
                  Tu{" "}
                  {rule.kind === "price_below"
                    ? "umbral inferior"
                    : "umbral superior"}{" "}
                  de {fmtPrice(rule.price!)} fue alcanzado al precio disponible.
                </p>
              ))}
              {exit.current && exit.deterioration && (
                <p className="text-xs text-zinc-300">
                  Subida previa con deterioro de MACD, rechazo o pérdida de
                  estructura y volumen vendedor estimado. Revisa tu plan; no se
                  presume una ganancia por estar en una subida.
                </p>
              )}
              {exit.current && exit.referenceStop && (
                <p className="text-[11px] text-zinc-400">
                  Mínimo de las tres velas previas (referencia de estructura):{" "}
                  {fmtPrice(exit.referenceStop)}. No modifica tus alertas ni
                  baja un stop guardado.
                </p>
              )}
              <p className="text-[11px] text-zinc-400">
                Resultado bruto según tus lotes. Un límite para nuevas entradas
                no bloquea la revisión de una salida; el precio real de
                ejecución y los costos pueden cambiar el resultado.
              </p>
            </>
          )}
        </div>
      )}
      <button
        onClick={refresh}
        className="min-h-9 text-xs text-indigo-300 underline"
      >
        Actualizar detector
      </button>
      <p className="text-[11px] text-zinc-400">
        Consulta cada 10 segundos con la pestaña visible. Reglas heurísticas:
        describen condiciones observadas, no una probabilidad de ganancias ni el
        máximo futuro.
      </p>
    </section>
  );
}
