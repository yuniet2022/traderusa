import { useCallback, useRef, useState } from "react";
import type { Asset, Candle } from "@/types";
import type { Position } from "@/lib/portfolio";
import type { AlertRule } from "@/lib/alerts";
import type { EntryReading, EntryPlan } from "@/lib/entrySetups";
import type { IntradayInterval } from "@/lib/intraday";
import type { Timeframe } from "@/lib/data";
import type { PlanRiskEvaluation } from "@/lib/tradeDecision";
import { atr } from "@/lib/indicators";
import { fmtPrice } from "@/lib/format";
import { positionMetrics } from "@/lib/positionContext";
import { useCandleHistory } from "@/hooks/useCandleHistory";
import { CandleChart } from "@/components/CandleChart";
import { SetupPanel } from "@/components/SetupPanel";
import { TradeDecision } from "@/components/TradeDecision";
import {
  RiskCalculator,
  type RiskCalculatorHandle,
} from "@/components/RiskCalculator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { RobinhoodBadge } from "@/components/RobinhoodBadge";

interface Props {
  asset: Asset;
  daily: Candle[];
  initialInterval: IntradayInterval;
  position?: Position;
  alerts: AlertRule[];
  onClose: () => void;
  onRegister: (asset: Asset) => void;
  onObserveReading?: (reading: EntryReading) => void;
  onWatch?: (interval: IntradayInterval) => void;
  watchActive?: boolean;
}
/** Discovered assets do not need a fictitious 60-day scanner analysis to open a real intraday plan. */
export function OpportunityDetail({
  asset,
  daily,
  initialInterval,
  position,
  alerts,
  onClose,
  onRegister,
  onObserveReading,
  onWatch,
  watchActive,
}: Props) {
  const [interval, setInterval] = useState(initialInterval),
    [chart, setChart] = useState<Timeframe>(initialInterval);
  const [reading, setReading] = useState<EntryReading | null>(null),
    [risk, setRisk] = useState<PlanRiskEvaluation | null>(null);
  const { history: dailyHistory } = useCandleHistory(asset, "1d", false);
  const dailyContext =
    dailyHistory && !dailyHistory.stale ? dailyHistory.candles : daily;
  const ref = useRef<RiskCalculatorHandle>(null);
  const handleReading = useCallback(
    (value: EntryReading) => {
      setReading(value);
      onObserveReading?.(value);
    },
    [onObserveReading]
  );
  const price = reading?.observedPrice ?? null;
  const metrics = position ? positionMetrics(position, price) : null;
  const prepare = (plan: EntryPlan) => {
    ref.current?.applyPlan(plan);
    document
      .querySelector('[data-testid="risk-calculator"]')
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-[1440px] flex-col gap-0 overflow-hidden border-zinc-800 bg-zinc-950 p-0 sm:h-[94dvh] sm:w-[calc(100%-3rem)] sm:max-w-[1440px]">
        <div className="shrink-0 border-b border-zinc-800 px-4 py-4 pr-10">
          <DialogHeader className="text-left">
            <DialogTitle className="flex flex-wrap items-center gap-2">
              {asset.symbol}{" "}
              <RobinhoodBadge
                key={`${asset.assetClass}:${asset.id}`}
                asset={asset}
              />
              <span className="text-sm font-normal text-zinc-400">
                {asset.name}
              </span>
            </DialogTitle>
            <DialogDescription>
              Activo descubierto en el catálogo de mercado. Confirma los datos y
              el riesgo antes de una compra.
            </DialogDescription>
          </DialogHeader>
          {price !== null && (
            <p className="mt-2 font-mono text-xl font-semibold">
              {fmtPrice(price)}{" "}
              <span className="text-[10px] text-zinc-400">
                último precio intradía disponible
              </span>
            </p>
          )}
          <TradeDecision
            compact
            asset={asset}
            reading={reading}
            risk={risk}
            position={position}
            alerts={alerts}
            intervalSeconds={
              interval === "1m" ? 60 : interval === "5m" ? 300 : 900
            }
            onPrepare={prepare}
          />
        </div>
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-5 space-y-4"
          data-testid="opportunity-scroll"
        >
          <TradeDecision
            asset={asset}
            reading={reading}
            risk={risk}
            position={position}
            alerts={alerts}
            intervalSeconds={
              interval === "1m" ? 60 : interval === "5m" ? 300 : 900
            }
            onPrepare={prepare}
          />
          {!dailyContext.length && (
            <p className="text-xs text-amber-300">
              Contexto diario no disponible. No se confirman patrones que
              necesiten el máximo o mínimo diario anterior; se evalúan los que
              tengan estructura intradía suficiente.
            </p>
          )}
          {position ? (
            <p className="text-xs text-zinc-300">
              Tu posición:{" "}
              {metrics?.pnl == null
                ? "Registra cantidades y precios de compra para evaluar su resultado."
                : `${metrics.quantity} unidades · resultado latente bruto ${metrics.pnl.toLocaleString("en-US", { style: "currency", currency: "USD" })}.`}
            </p>
          ) : (
            <button
              className="min-h-10 text-xs text-indigo-300 underline"
              onClick={() => onRegister(asset)}
            >
              Registrar que tengo este activo en mi portafolio
            </button>
          )}
          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
            <div className="min-w-0 rounded-xl border border-zinc-800 p-2">
              <CandleChart
                asset={asset}
                adaptiveHeight
                timeframe={chart}
                onShowIntraday={() => setChart(interval)}
                onTimeframeChange={value => {
                  setChart(value);
                  if (value === "1m" || value === "5m" || value === "15m")
                    setInterval(value);
                }}
              />
            </div>
            <SetupPanel
              analysis={{ asset, candles: dailyContext }}
              position={position}
              alerts={alerts}
              onReading={handleReading}
              onWatch={onWatch ? () => onWatch(interval) : undefined}
              watchActive={watchActive}
              timeframe={interval}
              onTimeframeChange={value => {
                setInterval(value);
                setChart(value);
              }}
              onUsePlan={prepare}
            />
          </div>
          {price !== null && price > 0 && (
            <RiskCalculator
              analysis={{
                asset,
                price,
                levels: { entry: price },
                indicators: {
                  atr14: reading ? (atr(reading.closed).at(-1) ?? 0) : 0,
                },
              }}
              reading={reading}
              controllerRef={ref}
              position={position}
              onValidation={setRisk}
            />
          )}
          <p className="text-[11px] text-zinc-400">
            La presencia en un catálogo no garantiza disponibilidad en
            Robinhood, liquidez ni cotizaciones actuales. No se importan
            posiciones ni se envían órdenes.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
