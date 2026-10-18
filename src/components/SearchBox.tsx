import { useEffect, useRef, useState } from 'react';
import { searchAssets } from '@/lib/search';
import type { Asset } from '@/types';
import { Search, Loader2, Bitcoin, LineChart } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  onPick: (asset: Asset) => void;
  className?: string;
}

export function SearchBox({ onPick, className }: Props) {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<{ query: string; results: Asset[] }>({ query: '', results: [] });
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const searching = query.trim().length > 0 && search.query !== query;
  const results = search.query === query ? search.results : [];

  useEffect(() => {
    if (query.trim().length === 0) return;
    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const results = await searchAssets(query, controller.signal);
        if (!controller.signal.aborted) setSearch({ query, results });
      } catch {
        if (!controller.signal.aborted) setSearch({ query, results: [] });
      }
    }, 400);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <div ref={boxRef} className={cn('relative min-w-0 flex-1 basis-48 max-w-sm', className)}>
      <div className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 h-11 sm:h-9 focus-within:border-emerald-600 transition-colors">
        {searching ? <Loader2 size={15} className="text-zinc-500 animate-spin" /> : <Search size={15} className="text-zinc-500" />}
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => query.trim().length > 0 && setOpen(true)}
          onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}
          aria-label="Buscar acción o criptomoneda"
          autoComplete="off"
          placeholder="Buscar acción o cripto (ej. AAPL, BTC…)"
          className="bg-transparent outline-none text-sm min-w-0 w-full placeholder:text-zinc-600"
        />
      </div>
      {searching && <span role="status" className="sr-only">Buscando activos…</span>}
      {open && query.trim().length > 0 && !searching && (
        <div className="absolute top-full mt-1 left-0 right-0 z-50 rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl overflow-hidden">
          {results.length === 0 ? (
            <p className="px-3 py-2.5 text-xs text-zinc-500">Sin resultados para «{query}»</p>
          ) : results.map(a => (
            <button
              key={`${a.assetClass}:${a.id}`}
              onClick={() => { onPick(a); setQuery(''); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-zinc-800 text-left transition-colors"
            >
              {a.assetClass === 'crypto'
                ? <Bitcoin size={14} className="text-amber-400 shrink-0" />
                : <LineChart size={14} className="text-indigo-400 shrink-0" />}
              <span className="font-semibold text-sm">{a.symbol}</span>
              <span className="text-xs text-zinc-500 truncate">{a.name}</span>
              <span className="ml-auto text-[10px] text-zinc-600 uppercase">{a.assetClass === 'crypto' ? 'cripto' : 'acción'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
