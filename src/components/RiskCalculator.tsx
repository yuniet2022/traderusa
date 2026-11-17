import { useEffect, useId, useImperativeHandle, useState, type Ref } from 'react';
import type { AssetAnalysis } from '@/types';
import { calculatePositionSize } from '@/lib/risk';
import { Calculator } from 'lucide-react';
import { assessEntryPlan, type EntryPlan, type EntryReading } from '@/lib/entrySetups';
import { useMarketClock } from '@/hooks/useMarketClock';
import type { Position } from '@/lib/portfolio';
import { positionMetrics } from '@/lib/positionContext';
import type { PlanRiskEvaluation } from '@/lib/tradeDecision';

const dollars = (value: number) => value.toLocaleString('es', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

export interface RiskCalculatorHandle { applyPlan: (plan: EntryPlan) => void }
export function RiskCalculator({ analysis, reading, controllerRef, position, onValidation }: { analysis: AssetAnalysis; reading?: EntryReading | null; controllerRef?: Ref<RiskCalculatorHandle>; position?: Position; onValidation?: (evaluation: PlanRiskEvaluation) => void }) {
  const id = useId();
  const [capital, setCapital] = useState('');
  const [risk, setRisk] = useState('1');
  const [entry, setEntry] = useState(String(analysis.levels.entry));
  const distance = Math.min(analysis.indicators.atr14 > 0 ? analysis.indicators.atr14 * 2 : analysis.price * 0.04, analysis.price * 0.5);
  const [stop, setStop] = useState(String(analysis.price - distance));
  const [target, setTarget] = useState(String(analysis.price + 2 * distance));
  const [direction, setDirection] = useState<'long' | 'short'>('long');
  const [fractional, setFractional] = useState(analysis.asset.assetClass === 'crypto');
  const [fee, setFee] = useState('');
  const [fixedFee, setFixedFee] = useState('');
  const [slippage, setSlippage] = useState('');
  const [reserve, setReserve] = useState('10');
  const [exposure, setExposure] = useState('25');
  const [maxLoss, setMaxLoss] = useState('');
  const [remainingRisk, setRemainingRisk] = useState('');
  const [minimumRR, setMinimumRR] = useState('1.5');
  const [availableCash, setAvailableCash] = useState('');
  const [appliedPlan, setAppliedPlan] = useState<EntryPlan | null>(null);
  const now = useMarketClock();
  useImperativeHandle(controllerRef, () => ({ applyPlan: plan => {
    if (plan.asset.id !== analysis.asset.id || plan.asset.assetClass !== analysis.asset.assetClass) return;
    setEntry(String(Math.max(plan.entry, reading?.observedPrice ?? plan.entry)));
    setStop(String(plan.stop)); setTarget(String(plan.target1)); setDirection('long'); setAppliedPlan(plan);
  } }), [analysis.asset.id, analysis.asset.assetClass, reading]);
  const currentReading = reading?.asset.id === analysis.asset.id && reading.asset.assetClass === analysis.asset.assetClass ? reading : null;
  const setupCheck = appliedPlan ? assessEntryPlan(appliedPlan, currentReading, now) : null;
  const effectiveEntry = appliedPlan ? Math.max(Number(entry), currentReading?.observedPrice ?? Number(entry)) : Number(entry);
  const existing = position ? positionMetrics(position, currentReading?.observedPrice ?? analysis.price) : null;
  const positionUnknown = !!position && existing?.value == null;
  let result: ReturnType<typeof calculatePositionSize> | null = null;
  let error = '';
  if (capital !== '') {
    try {
      result = calculatePositionSize({ capital: Number(capital), riskPercent: Number(risk), entry: effectiveEntry, stop: Number(stop), target: Number(target), direction, fractional,
        feePercent: Number(fee), fixedFee: Number(fixedFee), slippagePercent: Number(slippage), cashReservePercent: Number(reserve), maxPositionPercent: Number(exposure),
        maxLossUsd: maxLoss === '' ? undefined : Number(maxLoss), remainingRiskUsd: remainingRisk === '' ? undefined : Number(remainingRisk), minRewardRisk: Number(minimumRR),
        existingPositionValue: existing?.value ?? 0, cashAvailableUsd: availableCash === '' ? undefined : Number(availableCash) });
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'No se pudo calcular la posición.';
    }
  }

  const costsComplete = fee !== '' && fixedFee !== '' && slippage !== '';
  const validated = !!appliedPlan && !!result?.passesLimits && !positionUnknown && setupCheck?.status === 'ready' && costsComplete;
  const validationReason = !appliedPlan ? 'Aplica el setup para comprobar el mismo plan.' : !capital ? 'Introduce tu capital y riesgo para calcular el tamaño.'
    : error || (setupCheck?.status !== 'ready' ? setupCheck?.reasons[0] : '')
      || (!costsComplete ? 'Completa los costos, incluido cero cuando corresponda.' : '')
      || (positionUnknown ? 'Completa tus compras actuales para comprobar la exposición.' : '')
      || result?.blockedReasons[0] || 'El cálculo cumple los límites indicados.';
  const planId = appliedPlan?.id ?? null, quantity = result?.quantity ?? 0;
  useEffect(() => {
    onValidation?.({planId, valid:validated, quantity, reason:validationReason});
  }, [onValidation, planId, validated, quantity, validationReason]);

  return (
    <section className="rounded-xl border border-indigo-900/60 bg-indigo-950/15 p-4 space-y-4" aria-labelledby={`${id}-title`} data-testid="risk-calculator">
      <div className="flex items-center gap-2">
        <Calculator size={17} className="text-indigo-300" aria-hidden="true" />
        <h4 id={`${id}-title`} className="text-sm font-semibold">Calculadora de riesgo</h4>
      </div>
      <p className="text-xs text-zinc-400">Calcula cuántas unidades de {analysis.asset.symbol} caben en tu presupuesto de riesgo y capital.</p>
      {appliedPlan ? <div className="rounded-lg border border-zinc-700 p-3 text-xs space-y-1" aria-label="Validación del setup aplicado">
        <p className="font-semibold">Plan aplicado: entrada, stop y objetivo del mismo setup.</p>
        <p className={setupCheck?.status === 'ready' ? 'text-emerald-300' : 'text-amber-300'}>{setupCheck?.reasons[0]}</p>
        <p className="text-zinc-400">Se usa la entrada más alta entre la referencia y el precio intradía disponible ({dollars(effectiveEntry)}), para no subestimar el riesgo si ya subió.</p>
      </div> : <p className="text-xs text-zinc-400">Cálculo manual. Puedes aplicar un setup confirmado desde el detector; los valores manuales no confirman una oportunidad.</p>}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { name: 'capital', label: 'Capital de referencia (USD)', value: capital, set: setCapital, placeholder: 'Ej. 10000' },
          { name: 'risk', label: 'Riesgo por operación (%)', value: risk, set: setRisk, placeholder: 'Ej. 1' },
          { name: 'entry', label: 'Precio de entrada (USD)', value: entry, set: setEntry },
          { name: 'stop', label: 'Stop-loss (USD)', value: stop, set: setStop },
          { name: 'target', label: 'Objetivo (USD)', value: target, set: setTarget },
        ].map(field => (
          <label key={field.name} className="space-y-1 text-xs text-zinc-400">
            <span className="block">{field.label}</span>
            <input type="number" inputMode="decimal" min="0" max={field.name === 'risk' ? 100 : undefined} step="any" value={field.value}
              onChange={event => { field.set(event.target.value); if (['entry','stop','target'].includes(field.name)) setAppliedPlan(null); }} placeholder={field.placeholder}
              className="h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500" />
          </label>
        ))}
        <label className="space-y-1 text-xs text-zinc-400">
          <span className="block">Dirección</span>
          <select aria-label="Dirección" value={direction} onChange={event => { setDirection(event.target.value as 'long' | 'short'); setAppliedPlan(null); }}
            className="h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100">
            <option value="long">Compra / largo</option><option value="short">Corto</option>
          </select>
        </label>
      </div>
      <label className="flex items-center gap-2 text-xs text-zinc-300">
        <input type="checkbox" checked={fractional} onChange={event => setFractional(event.target.checked)} className="accent-indigo-500" />
        Permitir unidades fraccionadas
      </label>
      <fieldset className="space-y-2">
        <legend className="text-xs font-medium text-zinc-300">Costes estimados de entrada y salida</legend>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: 'Comisión por lado (%)', value: fee, set: setFee },
            { label: 'Comisión fija por lado (USD)', value: fixedFee, set: setFixedFee },
            { label: 'Spread y deslizamiento por lado (%)', value: slippage, set: setSlippage },
          ].map(field => <label key={field.label} className="space-y-1 text-xs text-zinc-400">
            <span className="block">{field.label}</span>
            <input type="number" min="0" step="any" inputMode="decimal" value={field.value} onChange={event => field.set(event.target.value)} placeholder="0 si no aplica"
              className="h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500" />
          </label>)}
        </div>
        <p className="text-[11px] text-zinc-500">Usa las condiciones de tu intermediario. El spread y el deslizamiento se modelan como una ejecución peor que el precio previsto, en cada lado.</p>
        {(fee === '' || fixedFee === '' || slippage === '') && <p className="text-xs text-amber-300">Hay costes sin completar; los campos vacíos se calculan como cero.</p>}
      </fieldset>
      <details className="rounded-lg border border-zinc-700 p-3">
        <summary className="min-h-8 cursor-pointer text-xs text-indigo-300">Límites de capital y riesgo</summary>
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { label: 'Reserva de efectivo (%)', value: reserve, set: setReserve, placeholder: '10' },
            { label: 'Máximo del capital en esta posición (%)', value: exposure, set: setExposure, placeholder: '25' },
            { label: 'Efectivo disponible (USD)', value: availableCash, set: setAvailableCash, placeholder: 'Opcional; sin dato se supone el capital' },
            { label: 'Pérdida máxima por operación (USD)', value: maxLoss, set: setMaxLoss, placeholder: 'Opcional' },
            { label: 'Riesgo diario disponible (USD)', value: remainingRisk, set: setRemainingRisk, placeholder: 'Opcional; saldo restante' },
            { label: 'Beneficio / riesgo neto mínimo', value: minimumRR, set: setMinimumRR, placeholder: '1.5' },
          ].map(field => <label key={field.label} className="min-w-0 space-y-1 text-xs text-zinc-400"><span className="block">{field.label}</span>
            <input type="number" inputMode="decimal" min="0" step="any" value={field.value} onChange={e => field.set(e.target.value)} placeholder={field.placeholder}
              className="h-10 min-w-0 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm" />
          </label>)}
        </div>
        <p className="mt-2 text-[11px] text-zinc-400">Son límites que introduces tú. La app no lee el saldo ni las pérdidas diarias de Robinhood; un límite opcional vacío no se comprueba.</p>
        {existing?.value != null && <p className="mt-2 text-[11px] text-zinc-400">La exposición máxima incluye {dollars(existing.value)} de la posición registrada en este activo.</p>}
      </details>
      {error && <p role="alert" className="text-xs text-amber-300">{error}</p>}
      {!capital && <p className="text-xs text-zinc-500">Introduce tu capital para ver el tamaño de posición.</p>}
      {result && (
        <div aria-live="polite" className="space-y-2">
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[
              { label: 'Unidades', value: result.quantity.toLocaleString('es', { maximumFractionDigits: 8 }) },
              { label: 'Capital utilizado', value: dollars(result.capitalUsed) },
              { label: 'Capital máximo por límites', value: dollars(result.capitalLimit) },
              { label: 'Pérdida estimada al stop', value: dollars(result.estimatedLoss) },
              { label: 'Presupuesto de riesgo', value: dollars(result.riskBudget) },
              { label: 'Resultado al objetivo con costes', value: dollars(result.estimatedGain) },
              { label: 'Beneficio / riesgo con costes', value: `${result.rewardRisk.toFixed(2)} : 1` },
              { label: 'Costes totales al objetivo', value: dollars(result.totalTargetCosts) },
              { label: 'Acierto de equilibrio (modelo)', value: result.breakEvenWinRate === null ? 'No aplica' : `${result.breakEvenWinRate.toFixed(1)}%` },
            ].map(item => (
              <div key={item.label} className="rounded-md border border-zinc-800 bg-zinc-950/60 p-3">
                <dt className="text-[11px] text-zinc-400">{item.label}</dt>
                <dd className="mt-1 font-mono text-sm text-zinc-100">{item.value}</dd>
              </div>
            ))}
          </dl>
          {result.quantity === 0 && <p className="text-xs text-amber-300">El presupuesto no alcanza para una unidad. Ajusta los datos o permite fracciones.</p>}
          {result.quantity > 0 && result.estimatedGain <= 0 && <p role="alert" className="text-xs text-amber-300">El objetivo no cubre los costes estimados de la operación.</p>}
          <div role="status" className="rounded-md border border-zinc-700 p-3 text-xs space-y-1">
            <p className="font-semibold">{result.passesLimits && !positionUnknown && (!setupCheck || setupCheck.status === 'ready') && fee !== '' && fixedFee !== '' && slippage !== '' ? 'El cálculo cumple los límites indicados' : 'Faltan condiciones para validar este plan'}</p>
            {result.blockedReasons.map(reason => <p key={reason} className="text-amber-300">{reason}</p>)}
            {setupCheck && setupCheck.status !== 'ready' && <p className="text-amber-300">La confirmación de entrada ya no es válida; requiere un setup nuevo.</p>}
            {(fee === '' || fixedFee === '' || slippage === '') && <p className="text-amber-300">Completa los costos, incluso con cero si corresponde.</p>}
            {positionUnknown && <p className="text-amber-300">Completa las compras de tu posición actual para comprobar la exposición conjunta.</p>}
          </div>
          <p className="text-[11px] text-zinc-500">El acierto de equilibrio supone salidas al objetivo o al stop con estos costes. Es un umbral matemático; no mide la probabilidad real de acertar.</p>
        </div>
      )}
      <p className="text-[11px] text-zinc-500">Sin apalancamiento. Incluye solo los costes indicados, sin impuestos, financiación ni préstamo de activos. La pérdida real puede superar el cálculo si el precio salta el stop.</p>
    </section>
  );
}
