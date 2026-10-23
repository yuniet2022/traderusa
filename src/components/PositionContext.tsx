import { useState } from 'react';
import type { AssetAnalysis } from '@/types';
import type { Position } from '@/lib/portfolio';
import type { AlertRule } from '@/lib/alerts';
import { positionMetrics } from '@/lib/positionContext';
import { PositionSummary } from './PositionSummary';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { fmtPrice } from '@/lib/format';

type PriceAlert = { assetId: string; symbol: string; kind: 'price_above' | 'price_below'; price: number };
interface Props {
  analysis: AssetAnalysis;
  position?: Position;
  alerts: AlertRule[];
  onAddAlert: (alert: PriceAlert) => void | Promise<void>;
  onRemoveAlert: (id: string) => void;
}

export function PositionContext({ analysis: a, position, alerts, onAddAlert, onRemoveAlert }: Props) {
  return <section aria-label="Tu posición y tus umbrales" className="rounded-xl border border-zinc-700 bg-zinc-900/60 p-3 sm:p-4 space-y-3">
    <h3 className="font-semibold text-sm">Tu posición en {a.asset.symbol}</h3>
    {position ? <PositionSummary position={position} price={a.price} /> : <p className="text-xs text-zinc-300">Sin posición registrada. Añade tus compras en Mi portafolio para ver costo promedio y ganancia o pérdida.</p>}
    <p className="text-xs leading-relaxed text-zinc-400">El sesgo técnico no usa tu costo de compra. Una lectura bajista no determina por sí sola cuándo cerrar tu posición.</p>
    {a.historyStale && <p className="text-xs text-amber-300">Historial pendiente de actualizar. El resultado usa el último precio disponible.</p>}
    {position && <Thresholds key={`${a.asset.assetClass}:${a.asset.id}`} analysis={a} position={position} alerts={alerts} onAddAlert={onAddAlert} onRemoveAlert={onRemoveAlert} />}
  </section>;
}

function Thresholds({ analysis: a, position, alerts, onAddAlert, onRemoveAlert }: Props & { position: Position }) {
  const [upper, setUpper] = useState('');
  const [lower, setLower] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const references = alerts.filter(rule => rule.assetId === a.asset.id && (rule.kind === 'price_above' || rule.kind === 'price_below'));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const high = upper.trim() ? Number(upper) : undefined;
    const low = lower.trim() ? Number(lower) : undefined;
    if ((high === undefined && low === undefined) || [high, low].some(v => v !== undefined && (!Number.isFinite(v) || v <= 0))) {
      setMessage('Introduce al menos un precio válido mayor que cero.'); return;
    }
    const effectiveHigh = high ?? references.find(rule => rule.kind === 'price_above')?.price;
    const effectiveLow = low ?? references.find(rule => rule.kind === 'price_below')?.price;
    if (effectiveHigh !== undefined && effectiveLow !== undefined && effectiveLow >= effectiveHigh) {
      setMessage('El umbral inferior debe quedar por debajo del superior.'); return;
    }
    setSaving(true); setMessage(null);
    try {
      if (high !== undefined) await onAddAlert({ assetId: a.asset.id, symbol: a.asset.symbol, kind: 'price_above', price: high });
      if (low !== undefined) await onAddAlert({ assetId: a.asset.id, symbol: a.asset.symbol, kind: 'price_below', price: low });
      setUpper(''); setLower(''); setMessage('Umbrales guardados como alertas de precio.');
    } catch { setMessage('No se pudieron guardar todos los umbrales. Revisa los guardados y reintenta.'); }
    finally { setSaving(false); }
  };
  return <div className="border-t border-zinc-700 pt-3 space-y-3">
    <h4 className="text-sm font-medium">Tus umbrales de precio</h4>
    {references.length === 0 && <p className="text-xs text-amber-300">Sin umbrales definidos. Puedes fijar una referencia superior y una inferior de riesgo.</p>}
    {references.map(rule => {
      const atThreshold = positionMetrics(position, rule.price);
      return <div key={rule.id} className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-zinc-800 p-2 text-xs">
        <div className="min-w-0 space-y-1">
          <p>{rule.kind === 'price_above' ? 'Umbral superior' : 'Umbral inferior'}: {rule.price ? fmtPrice(rule.price) : 'Sin precio'} · {rule.triggered ? 'Alerta disparada' : 'Alerta activa'}</p>
          {!rule.triggered && rule.price != null && (rule.kind === 'price_above' ? a.price >= rule.price : a.price <= rule.price) && <p className="text-amber-300">El último precio disponible ya cumple este umbral; la alerta se evaluará en la próxima actualización válida.</p>}
          {atThreshold?.pnl != null && <p className={atThreshold.pnl < 0 ? 'text-red-300' : 'text-emerald-300'}>Resultado a ese precio: {atThreshold.pnl.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} antes de costos.</p>}
        </div>
        <button onClick={() => onRemoveAlert(rule.id)} className="min-h-9 shrink-0 text-zinc-400 underline" aria-label={`Quitar ${rule.kind === 'price_above' ? 'umbral superior' : 'umbral inferior'} de ${a.asset.symbol}`}>Quitar</button>
      </div>;
    })}
    <details className="rounded-md border border-zinc-700 p-2">
    <summary className="min-h-8 cursor-pointer text-xs text-indigo-300">Definir o cambiar umbrales</summary>
    <form onSubmit={submit} className="mt-2 space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="min-w-0 space-y-1 text-xs text-zinc-300">Umbral superior (USD)
          <Input aria-label="Umbral superior en USD" type="number" inputMode="decimal" min="0" step="any" value={upper} onChange={e => setUpper(e.target.value)} placeholder="Precio elegido por ti" className="mt-1 min-w-0 border-zinc-700" />
        </label>
        <label className="min-w-0 space-y-1 text-xs text-zinc-300">Umbral inferior de riesgo (USD)
          <Input aria-label="Umbral inferior de riesgo en USD" type="number" inputMode="decimal" min="0" step="any" value={lower} onChange={e => setLower(e.target.value)} placeholder="Precio elegido por ti" className="mt-1 min-w-0 border-zinc-700" />
        </label>
      </div>
      <Button type="submit" size="sm" disabled={saving} className="h-auto min-h-10 max-w-full whitespace-normal">{saving ? 'Guardando…' : 'Guardar umbrales como alertas'}</Button>
      {message && <p role="status" className="text-xs text-zinc-300">{message}</p>}
    </form>
    </details>
    <p className="text-[11px] leading-relaxed text-zinc-400">Tus alertas no predicen máximos ni ejecutan órdenes. Se evalúan con los datos disponibles y la app abierta; una referencia superior puede representar una pérdida.</p>
  </div>;
}
