import { useEffect, useState } from 'react';
import type { Asset } from '@/types';
import type { TradeFlow } from '@contracts/orderFlow';
import { marketJSON } from '@/lib/marketClient';

export function useTradeFlow(asset: Asset) {
  const key = `${asset.assetClass}:${asset.id}`;
  const [state, setState] = useState<{ key: string; flow: TradeFlow | null; error: boolean }>({ key, flow: null, error: false });
  useEffect(() => {
    if (asset.assetClass !== 'crypto') return;
    let alive = true, busy = false, generation = 0;
    let controller: AbortController | null = null;
    const cancel = () => { generation++; controller?.abort(); busy = false; };
    const load = async () => {
      if (!alive || busy || document.visibilityState === 'hidden' || !navigator.onLine) return;
      busy = true;
      const request = ++generation;
      controller = new AbortController();
      try {
        const flow = await marketJSON<TradeFlow>('flow', { assetClass: 'crypto', id: asset.id }, controller.signal);
        if (alive && request === generation) setState({ key, flow, error: false });
      } catch {
        if (alive && request === generation) setState(prev => ({ key, flow: prev.key === key ? prev.flow : null, error: true }));
      } finally { if (request === generation) busy = false; }
    };
    const resume = () => { void load(); };
    const visibility = () => { if (document.visibilityState === 'hidden') cancel(); else resume(); };
    void load();
    const timer = window.setInterval(resume, 15_000);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('online', resume);
    return () => { alive = false; cancel(); clearInterval(timer); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('online', resume); };
  }, [asset.id, asset.assetClass, key]);
  return state.key === key ? state : { key, flow: null, error: false };
}
