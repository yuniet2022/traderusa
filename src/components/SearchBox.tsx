import { useEffect, useRef, useState } from 'react';
import { searchAssets } from '@/lib/search';
import type { Asset } from '@/types';
import { Search, Loader2, Bitcoin, LineChart } from 'lucide-react';

interface Props {
  onPick: (asset: Asset) => void;
}

export function SearchBox({ onPick }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Asset[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.trim().length === 0) { setResults([]); setOpen(false); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      const r = await searchAssets(query);
      setResults(r);
      setSearching(false);
      setOpen(true);
    }, 400);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <div ref={boxRef} className="relative w-full max-w-sm">
      <div className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 h-9 focus-within:border-emerald-600 transition-colors">
        {searching ? <Loader2 size={15} className="text-zinc-500 animate-spin" /> : <Search size={15} className="text-zinc-500" />}
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Buscar acción o cripto (ej. AAPL, BTC…)"
          className="bg-transparent outline-none text-sm w-full placeholder:text-zinc-600"
        />
      </div>
      {open && (
        <div className="absolute top-10 left-0 right-0 z-50 rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl overflow-hidden">
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
