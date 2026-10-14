import { useId, useState } from 'react';
import type { AssetAnalysis } from '@/types';
import { calculatePositionSize } from '@/lib/risk';
import { Calculator } from 'lucide-react';

const dollars = (value: number) => value.toLocaleString('es', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

export function RiskCalculator({ analysis }: { analysis: AssetAnalysis }) {
  const id = useId();
  const [capital, setCapital] = useState('');
  const [risk, setRisk] = useState('1');
  const [entry, setEntry] = useState(String(analysis.levels.entry));
  const [stop, setStop] = useState(String(analysis.levels.stop));
  const [target, setTarget] = useState(String(analysis.levels.target1));
  const [direction, setDirection] = useState<'long' | 'short'>(analysis.levels.bias === 'CORTO' ? 'short' : 'long');
  const [fractional, setFractional] = useState(analysis.asset.assetClass === 'crypto');
  let result: ReturnType<typeof calculatePositionSize> | null = null;
  let error = '';
  if (capital !== '') {
    try {
      result = calculatePositionSize({ capital: Number(capital), riskPercent: Number(risk), entry: Number(entry), stop: Number(stop), target: Number(target), direction, fractional });
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'No se pudo calcular la posición.';
    }
  }

  return (
    <section className="rounded-xl border border-indigo-900/60 bg-indigo-950/15 p-4 space-y-4" aria-labelledby={`${id}-title`}>
      <div className="flex items-center gap-2">
        <Calculator size={17} className="text-indigo-300" aria-hidden="true" />
        <h4 id={`${id}-title`} className="text-sm font-semibold">Calculadora de riesgo</h4>
      </div>
      <p className="text-xs text-zinc-400">Calcula cuántas unidades de {analysis.asset.symbol} caben en tu presupuesto de riesgo y capital.</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { name: 'capital', label: 'Capital disponible (USD)', value: capital, set: setCapital, placeholder: 'Ej. 10000' },
          { name: 'risk', label: 'Riesgo por operación (%)', value: risk, set: setRisk, placeholder: 'Ej. 1' },
          { name: 'entry', label: 'Precio de entrada (USD)', value: entry, set: setEntry },
          { name: 'stop', label: 'Stop-loss (USD)', value: stop, set: setStop },
          { name: 'target', label: 'Objetivo (USD)', value: target, set: setTarget },
        ].map(field => (
          <label key={field.name} className="space-y-1 text-xs text-zinc-400">
            <span className="block">{field.label}</span>
            <input type="number" inputMode="decimal" min="0" max={field.name === 'risk' ? 100 : undefined} step="any" value={field.value}
              onChange={event => field.set(event.target.value)} placeholder={field.placeholder}
              className="h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500" />
          </label>
        ))}
        <label className="space-y-1 text-xs text-zinc-400">
          <span className="block">Dirección</span>
          <select aria-label="Dirección" value={direction} onChange={event => setDirection(event.target.value as 'long' | 'short')}
            className="h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100">
            <option value="long">Compra / largo</option><option value="short">Corto</option>
          </select>
        </label>
      </div>
      <label className="flex items-center gap-2 text-xs text-zinc-300">
        <input type="checkbox" checked={fractional} onChange={event => setFractional(event.target.checked)} className="accent-indigo-500" />
        Permitir unidades fraccionadas
      </label>
      {error && <p role="alert" className="text-xs text-amber-300">{error}</p>}
      {!capital && <p className="text-xs text-zinc-500">Introduce tu capital para ver el tamaño de posición.</p>}
      {result && (
        <div aria-live="polite" className="space-y-2">
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[
              { label: 'Unidades', value: result.quantity.toLocaleString('es', { maximumFractionDigits: 8 }) },
              { label: 'Capital utilizado', value: dollars(result.positionValue) },
              { label: 'Riesgo al stop', value: dollars(result.estimatedLoss) },
              { label: 'Presupuesto de riesgo', value: dollars(result.riskBudget) },
              { label: 'Ganancia al objetivo', value: dollars(result.estimatedGain) },
              { label: 'Beneficio / riesgo', value: `${result.rewardRisk.toFixed(2)} : 1` },
            ].map(item => (
              <div key={item.label} className="rounded-md border border-zinc-800 bg-zinc-950/60 p-3">
                <dt className="text-[11px] text-zinc-400">{item.label}</dt>
                <dd className="mt-1 font-mono text-sm text-zinc-100">{item.value}</dd>
              </div>
            ))}
          </dl>
          {result.quantity === 0 && <p className="text-xs text-amber-300">El presupuesto no alcanza para una unidad. Ajusta los datos o permite fracciones.</p>}
        </div>
      )}
      <p className="text-[11px] text-zinc-500">Sin apalancamiento. Estimación sin comisiones ni deslizamiento; la pérdida real puede superar el cálculo si el precio salta el stop.</p>
    </section>
  );
}
