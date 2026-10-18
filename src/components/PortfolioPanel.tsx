import { useEffect, useRef, useState } from 'react';
import type { AssetAnalysis, Asset } from '@/types';
import type { Position, BuyLot } from '@/lib/portfolio';
import { avgBuyPrice, totalQuantity } from '@/lib/portfolio';
import { searchAssets } from '@/lib/search';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SignalBadge } from '@/components/SignalBadge';
import { Briefcase, Trash2, Plus, Search, Loader2, X, Download, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fmtPrice } from '@/lib/format';

interface Props {
  positions: Position[];
  analyses: AssetAnalysis[];
  onAdd: (asset: Asset) => Promise<AssetAnalysis | null>; // añade activo a la lista si no existe
  onSave: (p: Omit<Position, 'addedAt'>) => void;
  onRemove: (assetId: string) => void;
  onSelect: (a: AssetAnalysis) => void;
}

export function PortfolioPanel({ positions, analyses, onAdd, onSave, onRemove, onSelect }: Props) {
  // buscador
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Asset[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<Asset | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  // compras (lots)
  const [lots, setLots] = useState<BuyLot[]>([{ quantity: 0, price: 0 }]);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const exportBackup = () => {
    const data = JSON.stringify({ app: 'traderadar', version: 1, exportedAt: new Date().toISOString(), positions }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'traderadar-portafolio.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  const importBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const list: Position[] = Array.isArray(parsed) ? parsed : parsed.positions;
        if (!Array.isArray(list)) throw new Error('formato');
        let count = 0;
        for (const p of list) {
          if (p.assetId && Array.isArray(p.lots)) {
            onSave({ assetId: p.assetId, symbol: p.symbol ?? p.assetId, assetClass: p.assetClass ?? 'stock', lots: p.lots });
            count++;
          }
        }
        setImportMsg(`Importadas ${count} posiciones del respaldo.`);
      } catch { setImportMsg('Archivo no válido. Usa el JSON exportado por TradeRadar.'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  useEffect(() => {
    if (query.trim().length === 0) { setResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      // primero sugerir de los ya cargados
      const local = analyses
        .filter(a => a.asset.symbol.toLowerCase().includes(query.toLowerCase()) || a.asset.name.toLowerCase().includes(query.toLowerCase()))
        .map(a => a.asset);
      const remote = await searchAssets(query);
      const merged = [...local];
      for (const r of remote) if (!merged.some(m => m.id === r.id)) merged.push(r);
      setResults(merged.slice(0, 8));
      setSearching(false);
    }, 400);
    return () => clearTimeout(t);
  }, [query, analyses]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setResults([]);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const submit = async () => {
    if (!picked) return;
    const cleanLots = lots.filter(l => l.quantity > 0 && l.price > 0);
    // asegurar que el activo existe en la lista de análisis
    if (!analyses.some(a => a.asset.id === picked.id)) {
      await onAdd(picked);
    }
    onSave({ assetId: picked.id, symbol: picked.symbol, assetClass: picked.assetClass, lots: cleanLots });
    setPicked(null); setQuery(''); setLots([{ quantity: 0, price: 0 }]);
  };

  const avg = avgBuyPrice(lots.filter(l => l.quantity > 0 && l.price > 0));
  const qty = totalQuantity(lots);

  const enriched = positions.map(p => {
    const a = analyses.find(x => x.asset.id === p.assetId);
    const pQty = totalQuantity(p.lots);
    const pAvg = avgBuyPrice(p.lots);
    const pnl = a && pAvg > 0 ? (a.price / pAvg - 1) * 100 : null;
    const value = a && pQty > 0 ? a.price * pQty : null;
    const invested = pQty > 0 && pAvg > 0 ? pQty * pAvg : null;
    const pnlUsd = value !== null && invested !== null ? value - invested : null;
    return { ...p, analysis: a, pnl, value, pnlUsd, qty: pQty, avg: pAvg };
  });

  const needsAttention = enriched.filter(e => e.analysis && e.analysis.composite <= -20);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button aria-label="Mi portafolio" variant="outline" size="sm" className="h-10 sm:h-8 gap-1.5 border-zinc-700 bg-zinc-900 hover:bg-zinc-800 relative">
          <Briefcase size={14} />
          <span className="hidden sm:inline">Mi portafolio</span>
          {positions.length > 0 && (
            <span className={cn(
              'absolute -top-1.5 -right-1.5 rounded-full text-zinc-950 text-[10px] font-bold w-4 h-4 flex items-center justify-center',
              needsAttention.length > 0 ? 'bg-red-500' : 'bg-zinc-500',
            )}>
              {positions.length}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="bg-zinc-950 border-zinc-800 text-zinc-100 w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-zinc-100">Mi portafolio de Robinhood</SheetTitle>
          <SheetDescription className="text-sm leading-relaxed text-zinc-400 mt-1">
            Busca un activo y registra tus compras para ver el precio promedio y sus señales.
          </SheetDescription>
        </SheetHeader>

        {/* Buscador + compras */}
        <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 space-y-2.5">
          <p className="text-xs text-zinc-400 font-medium">Añadir posición:</p>

          {picked ? (
            <div className="flex items-center gap-2 rounded-md border border-emerald-800 bg-emerald-950/30 px-2.5 py-1.5">
              <span className="font-semibold text-sm">{picked.symbol}</span>
              <span className="text-xs text-zinc-400 truncate">{picked.name}</span>
              <span className="text-[10px] text-zinc-600 uppercase ml-auto">{picked.assetClass === 'crypto' ? 'cripto' : 'acción'}</span>
              <button onClick={() => setPicked(null)} className="text-zinc-500 hover:text-red-400"><X size={13} /></button>
            </div>
          ) : (
            <div ref={searchRef} className="relative">
              <div className="flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-2.5 h-11">
                {searching ? <Loader2 size={13} className="text-zinc-500 animate-spin" /> : <Search size={13} className="text-zinc-500" />}
                <input value={query} onChange={e => setQuery(e.target.value)}
                  aria-label="Buscar activo para mi portafolio"
                  placeholder="Buscar (ej. HOOD, SHIB, MSTR…)"
                  className="min-w-0 bg-transparent outline-none text-sm w-full placeholder:text-zinc-500" />
              </div>
              {results.length > 0 && (
                <div className="absolute top-full mt-1 left-0 right-0 z-50 rounded-md border border-zinc-700 bg-zinc-900 shadow-xl overflow-hidden">
                  {results.map(a => (
                    <button key={`${a.assetClass}:${a.id}`}
                      onClick={() => { setPicked(a); setResults([]); setQuery(''); }}
                      className="w-full flex items-center gap-2 px-2.5 py-2 hover:bg-zinc-800 text-left text-sm transition-colors">
                      <span className="font-semibold">{a.symbol}</span>
                      <span className="text-xs text-zinc-500 truncate">{a.name}</span>
                      <span className="ml-auto text-[10px] text-zinc-600 uppercase">{a.assetClass === 'crypto' ? 'cripto' : 'acción'}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Lotes de compra */}
          <div className="space-y-1.5">
            <p className="text-[11px] text-zinc-500">Tus compras (puedes añadir varias a distintos precios):</p>
            {lots.map((lot, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input type="number" min="0" step="any" value={lot.quantity || ''}
                  inputMode="decimal" aria-label={`Cantidad de compra ${i + 1}`}
                  onChange={e => setLots(lots.map((l, j) => j === i ? { ...l, quantity: parseFloat(e.target.value) || 0 } : l))}
                  placeholder="Cantidad" className="min-w-0 bg-zinc-900 border-zinc-700 h-10 text-sm" />
                <Input type="number" min="0" step="any" value={lot.price || ''}
                  inputMode="decimal" aria-label={`Precio de compra ${i + 1} (USD)`}
                  onChange={e => setLots(lots.map((l, j) => j === i ? { ...l, price: parseFloat(e.target.value) || 0 } : l))}
                  placeholder="Precio $" className="min-w-0 bg-zinc-900 border-zinc-700 h-10 text-sm" />
                {lots.length > 1 && (
                  <button onClick={() => setLots(lots.filter((_, j) => j !== i))} className="text-zinc-500 hover:text-red-400 shrink-0">
                    <X size={13} />
                  </button>
                )}
              </div>
            ))}
            <button onClick={() => setLots([...lots, { quantity: 0, price: 0 }])}
              className="min-h-10 text-xs text-indigo-300 hover:text-indigo-200 flex items-center gap-1">
              <Plus size={11} /> Añadir otra compra
            </button>
          </div>

          {avg > 0 && (
            <div className="rounded bg-zinc-950/60 border border-zinc-800 px-2.5 py-1.5 text-xs">
              <span className="text-zinc-400">Total: <strong className="text-zinc-100">{qty}</strong> unidades · </span>
              <span className="text-zinc-400">Precio promedio: <strong className="text-emerald-400">${avg.toLocaleString('es', { maximumFractionDigits: 6 })}</strong></span>
            </div>
          )}

          <Button onClick={submit} disabled={!picked} size="sm" className="w-full gap-1.5 bg-emerald-600 hover:bg-emerald-500">
            <Plus size={14} /> Añadir a mi portafolio
          </Button>
        </div>

        {/* Lista de posiciones */}
        <div className="mt-4 space-y-2">
          {enriched.length === 0 && (
            <p className="text-sm text-zinc-400 text-center py-4">
              Sin posiciones. Busca arriba lo que tengas en Robinhood.
            </p>
          )}
          {enriched.map(p => {
            const a = p.analysis;
            const isSell = a && a.composite <= -20;
            return (
              <div key={p.assetId}
                className={cn('rounded-lg border px-3 py-2.5',
                  isSell ? 'border-red-900/60 bg-red-950/20' : 'border-zinc-800 bg-zinc-900/60')}>
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => a && onSelect(a)} className="font-semibold text-sm hover:underline">
                    {p.symbol}
                  </button>
                  {a ? <SignalBadge signal={a.signal} /> : <span className="text-[10px] text-zinc-600">cargando…</span>}
                  {isSell && <span className="text-[10px] text-red-400 font-semibold">¡REVISAR!</span>}
                  <button onClick={() => onRemove(p.assetId)} className="ml-auto text-zinc-500 hover:text-red-400 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
                {a && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-[11px] text-zinc-400 font-mono">
                    <span>{fmtPrice(a.price)}</span>
                    {p.qty > 0 && <span>{p.qty} uds</span>}
                    {p.avg > 0 && <span>prom. ${p.avg.toLocaleString('es', { maximumFractionDigits: 6 })}</span>}
                    {p.value !== null && <span>valor: ${p.value.toFixed(2)}</span>}
                    {p.pnl !== null && (
                      <span className={p.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                        {p.pnl >= 0 ? '+' : ''}{p.pnl.toFixed(1)}%
                        {p.pnlUsd !== null && ` (${p.pnlUsd >= 0 ? '+' : ''}$${p.pnlUsd.toFixed(2)})`}
                      </span>
                    )}
                  </div>
                )}
                {p.lots.length > 1 && (
                  <p className="text-[10px] text-zinc-600 mt-0.5">
                    {p.lots.length} compras: {p.lots.map(l => `${l.quantity}@$${l.price}`).join(' · ')}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Respaldo */}
        <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 space-y-2">
          <p className="text-xs text-zinc-400 font-medium">Respaldo de tu portafolio</p>
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            Tus posiciones se guardan en tu cuenta: inicia sesión desde cualquier dispositivo y ahí estarán.
            Además puedes exportar un respaldo en JSON por si acaso.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button onClick={exportBackup} disabled={positions.length === 0} variant="outline" size="sm"
              className="h-10 min-w-0 gap-1.5 border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-xs">
              <Download size={13} /> Exportar respaldo
            </Button>
            <Button onClick={() => fileRef.current?.click()} variant="outline" size="sm"
              className="h-10 min-w-0 gap-1.5 border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-xs">
              <Upload size={13} /> Importar respaldo
            </Button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={importBackup} />
          </div>
          {importMsg && <p className="text-[11px] text-emerald-400">{importMsg}</p>}
        </div>

        <p className="mt-4 text-[11px] text-zinc-600 leading-relaxed">
          Guardado en tu cuenta (nube) con caché local para arranque rápido. El precio promedio pondera
          cada compra por su cantidad: (q₁×p₁ + q₂×p₂ + …) ÷ (q₁ + q₂ + …). Las posiciones en señal de
          VENTA se marcan en rojo.
        </p>
      </SheetContent>
    </Sheet>
  );
}
