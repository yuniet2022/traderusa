import type { Position } from '@/lib/portfolio';
import { positionMetrics } from '@/lib/positionContext';
import { fmtPrice } from '@/lib/format';
import { cn } from '@/lib/utils';

export function PositionSummary({ position, price, compact = false }: { position: Position; price?: number; compact?: boolean }) {
  const metrics = positionMetrics(position, price);
  if (!metrics) return <p className="text-xs text-amber-300">Costo sin registrar. Añade cantidad y precio de compra en Mi portafolio para calcular tu resultado.</p>;
  const { quantity, average, invested, value, pnl, pnlPercent, recoveryPercent } = metrics;
  const money = (v: number) => v.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  return <div className="min-w-0 space-y-2" data-testid="position-summary">
    <div className={cn('grid gap-2 text-xs', compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4')}>
      {[
        { label: 'Cantidad', value: quantity.toLocaleString('es', { maximumFractionDigits: 8 }) },
        { label: 'Costo promedio', value: fmtPrice(average) },
        { label: 'Invertido', value: money(invested) },
        { label: 'Valor al último precio', value: value === null ? 'Sin cotización' : money(value) },
      ].map(item => <div key={item.label} className="min-w-0 rounded-md bg-zinc-950/50 p-2">
        <p className="text-[11px] text-zinc-400">{item.label}</p><p className="mt-1 break-words font-mono text-zinc-100">{item.value}</p>
      </div>)}
    </div>
    <p className={cn('text-sm font-medium', pnl === null ? 'text-zinc-400' : pnl < 0 ? 'text-red-300' : pnl > 0 ? 'text-emerald-300' : 'text-zinc-200')}>
      {pnl === null ? 'Resultado pendiente de cotización' : `${pnl < 0 ? 'Pérdida' : pnl > 0 ? 'Ganancia' : 'Resultado'} latente: ${money(pnl)} (${pnlPercent!.toFixed(2)} %)`}
    </p>
    {!compact && <>
      <p className="text-[11px] text-zinc-400">Según tus compras registradas, sin comisiones, impuestos ni deslizamiento.</p>
      <details className="text-xs text-zinc-400">
      <summary className="min-h-8 cursor-pointer text-indigo-300">Qué significa este resultado</summary>
      <div className="space-y-2">
      {pnl !== null && <p className="text-xs text-zinc-300">Vender al último precio disponible realizaría este resultado antes de costos; el precio de ejecución puede variar.</p>}
      {recoveryPercent !== null && <p className="text-xs text-zinc-400">Para volver al costo promedio, el precio tendría que subir {recoveryPercent.toFixed(1)} %. No hay garantía de recuperación.</p>}
      </div>
      </details>
    </>}
  </div>;
}
