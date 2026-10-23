import { useState } from 'react';
import type { AssetAnalysis } from '@/types';
import type { AlertRule, AlertKind } from '@/lib/alerts';
import { alertLabel } from '@/lib/alerts';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Bell, BellRing, Trash2, Plus } from 'lucide-react';

interface Props {
  alerts: AlertRule[];
  analyses: AssetAnalysis[];
  onAdd: (a: { assetId: string; symbol: string; kind: AlertKind; price?: number }) => void;
  onRemove: (id: string) => void;
}

export function AlertsPanel({ alerts, analyses, onAdd, onRemove }: Props) {
  const [assetId, setAssetId] = useState('');
  const [kind, setKind] = useState<AlertKind>('signal_buy');
  const [price, setPrice] = useState('');
  const active = alerts.filter(a => !a.triggered);

  const submit = () => {
    const asset = analyses.find(a => a.asset.id === assetId);
    if (!asset) return;
    if ((kind === 'price_above' || kind === 'price_below')) {
      const p = parseFloat(price);
      if (isNaN(p) || p <= 0) return;
      onAdd({ assetId: asset.asset.id, symbol: asset.asset.symbol, kind, price: p });
    } else {
      onAdd({ assetId: asset.asset.id, symbol: asset.asset.symbol, kind });
    }
    setPrice('');
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button aria-label="Alertas" variant="outline" size="sm" className="h-10 sm:h-8 gap-1.5 border-zinc-700 bg-zinc-900 hover:bg-zinc-800 relative">
          {active.length > 0 ? <BellRing size={14} className="text-amber-400" /> : <Bell size={14} />}
          <span className="hidden sm:inline">Alertas</span>
          {active.length > 0 && (
            <span className="absolute -top-1.5 -right-1.5 rounded-full bg-amber-500 text-zinc-950 text-[10px] font-bold w-4 h-4 flex items-center justify-center">
              {active.length}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="bg-zinc-950 border-zinc-800 text-zinc-100 w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-zinc-100">Alertas de mercado y precio</SheetTitle>
        </SheetHeader>

        <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 space-y-2.5">
          <p className="text-xs text-zinc-400">Nueva alerta (te avisa con notificación del navegador):</p>
          <Select value={assetId} onValueChange={setAssetId}>
            <SelectTrigger className="bg-zinc-900 border-zinc-700 h-9 text-sm">
              <SelectValue placeholder="Elige un activo…" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-700 max-h-64">
              {analyses.map(a => (
                <SelectItem key={a.asset.id} value={a.asset.id} className="text-sm">
                  {a.asset.symbol} — {a.asset.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={kind} onValueChange={v => setKind(v as AlertKind)}>
            <SelectTrigger className="bg-zinc-900 border-zinc-700 h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-700">
              <SelectItem value="signal_buy">Cuando haya sesgo alcista</SelectItem>
              <SelectItem value="signal_sell">Cuando haya sesgo bajista</SelectItem>
              <SelectItem value="price_above">Cuando el precio suba a…</SelectItem>
              <SelectItem value="price_below">Cuando el precio baje a…</SelectItem>
            </SelectContent>
          </Select>
          {(kind === 'price_above' || kind === 'price_below') && (
            <Input
              type="number"
              min="0"
              step="any"
              value={price}
              onChange={e => setPrice(e.target.value)}
              placeholder="Precio objetivo en USD"
              className="bg-zinc-900 border-zinc-700 h-9 text-sm"
            />
          )}
          <Button onClick={submit} disabled={!assetId} size="sm" className="w-full gap-1.5 bg-emerald-600 hover:bg-emerald-500">
            <Plus size={14} /> Crear alerta
          </Button>
        </div>

        <div className="mt-4 space-y-2">
          {alerts.length === 0 && (
            <p className="text-xs text-zinc-500 text-center py-6">
              Sin alertas. Crea una para seguir un precio o un cambio de sesgo técnico.
            </p>
          )}
          {alerts.map(a => (
            <div key={a.id} className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2.5">
              {a.triggered
                ? <Badge className="bg-emerald-600/20 text-emerald-300 border-emerald-700 text-[10px]">disparada</Badge>
                : <Badge className="bg-amber-500/15 text-amber-300 border-amber-700 text-[10px]">activa</Badge>}
              <span className="text-xs flex-1">{alertLabel(a)}</span>
              <button onClick={() => onRemove(a.id)} className="text-zinc-500 hover:text-red-400 transition-colors">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

        <p className="mt-4 text-[11px] text-zinc-600 leading-relaxed">
          Se comprueban con los datos disponibles al actualizar el mercado y las cotizaciones; pueden tener retraso.
          Se sincronizan con tu cuenta. Mantén la app abierta para recibir notificaciones.
          Un cambio de sesgo no considera tu costo de compra y no ejecuta órdenes.
        </p>
      </SheetContent>
    </Sheet>
  );
}
