import type { Asset } from "@/types";
import type { EntryPlan, EntryReading } from "@/lib/entrySetups";
import type { Position } from "@/lib/portfolio";
import type { AlertRule } from "@/lib/alerts";
import { tradeDecision, type PlanRiskEvaluation } from "@/lib/tradeDecision";
import { useMarketClock } from "@/hooks/useMarketClock";
import { fmtPrice } from "@/lib/format";

interface Props {
  asset: Asset;
  reading: EntryReading | null;
  risk: PlanRiskEvaluation | null;
  position?: Position;
  alerts: AlertRule[];
  intervalSeconds: number;
  onPrepare: (plan: EntryPlan) => void;
  compact?: boolean;
}
export function TradeDecision(props: Props) {
  const now = useMarketClock();
  const decision = tradeDecision({ ...props, now });
  const plan = props.reading?.plan;
  const candidate = decision.state === "buy" || decision.state === "prepare";
  if (props.compact)
    return (
      <p
        aria-label="Indicación principal"
        role="status"
        className={`mt-2 text-sm font-bold ${decision.state === "buy" ? "text-emerald-300" : candidate || decision.state === "exit" ? "text-amber-300" : "text-zinc-200"}`}
      >
        {decision.title}
      </p>
    );
  return (
    <section
      aria-label="Decisión de compra o venta"
      className={`mt-3 min-w-0 rounded-xl border p-3 space-y-2 ${decision.state === "buy" ? "border-emerald-600 bg-emerald-950/30" : candidate || decision.state === "exit" ? "border-amber-700 bg-amber-950/20" : "border-zinc-700 bg-zinc-900/40"}`}
    >
      <p className="text-[11px] text-zinc-400">
        Cuándo comprar o revisar una venta · velas de{" "}
        {props.intervalSeconds / 60} min
      </p>
      <p
        role="status"
        className={`text-sm sm:text-base font-bold ${decision.state === "buy" ? "text-emerald-300" : candidate || decision.state === "exit" ? "text-amber-300" : "text-zinc-200"}`}
      >
        {decision.title}
      </p>
      <p className="text-xs text-zinc-300 leading-relaxed">{decision.reason}</p>
      {candidate && plan && (
        <>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {[
              ["Entrada de referencia", plan.entry],
              ["No comprar por encima de", plan.maxEntry],
              ["Stop del plan", plan.stop],
              ["Objetivo del plan", plan.target1],
            ].map(([name, value]) => (
              <div key={name} className="min-w-0">
                <dt className="text-[10px] text-zinc-400">{name}</dt>
                <dd className="font-mono break-words">
                  {fmtPrice(Number(value))}
                </dd>
              </div>
            ))}
          </dl>
          {decision.state === "prepare" && (
            <button
              onClick={() => props.onPrepare(plan)}
              className="min-h-10 text-xs text-indigo-200 underline"
            >
              Aplicar entrada, stop y objetivo a mi plan
            </button>
          )}
        </>
      )}
      {decision.state === "buy" && (
        <p className="text-[11px] text-zinc-400">
          Indicación condicionada a estos datos y límites; puede caducar o
          invalidarse. No se envía una orden al mercado.
        </p>
      )}
    </section>
  );
}
