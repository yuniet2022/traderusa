import { useCallback, useEffect, useRef, useState } from 'react';
import type { Asset, CandleHistory } from '@/types';
import { loadTimeframeHistory, type Timeframe } from '@/lib/data';

const POLL_MS = 10_000;
type State = { key: string; history: CandleHistory | null; loading: boolean; error: string | null };

export function useCandleHistory(asset: Asset, timeframe: Timeframe) {
  const { id, assetClass } = asset;
  const key = `${assetClass}:${id}:${timeframe}`;
  const [state, setState] = useState<State>({ key, history: null, loading: true, error: null });
  const refreshRef = useRef<() => void>(() => {});
  const refresh = useCallback(() => refreshRef.current(), []);

  useEffect(() => {
    let alive = true;
    let busy = false;
    let version = 0;
    let controller: AbortController | null = null;
    setState({ key, history: null, loading: true, error: null });

    function cancel() {
      version++;
      controller?.abort();
      busy = false;
      if (alive) setState(prev => ({ ...prev, loading: false }));
    }
    async function load() {
      if (!alive || busy || document.visibilityState === 'hidden') return;
      if (!navigator.onLine) {
        setState(prev => ({ ...prev, loading: false, error: 'Sin conexión. Se conservan las últimas velas disponibles.' }));
        return;
      }
      busy = true;
      const request = ++version;
      controller = new AbortController();
      setState(prev => ({ ...prev, loading: true }));
      try {
        const history = await loadTimeframeHistory({ id, assetClass, symbol: id, name: id }, timeframe, controller.signal);
        if (!alive || version !== request) return;
        if (!history.candles?.length) throw new Error('No candles');
        setState(prev => {
          const previous = prev.history;
          const olderBar = previous && history.candles.at(-1)!.time < previous.candles.at(-1)!.time;
          const olderPrice = previous?.priceAsOf && history.priceAsOf && history.priceAsOf < previous.priceAsOf;
          if (olderBar || olderPrice) return { ...prev, loading: false, error: 'La fuente devolvió datos anteriores. Se conserva el último gráfico disponible.' };
          return { key, history, loading: false, error: null };
        });
      } catch {
        if (alive && version === request) setState(prev => ({ ...prev, loading: false, error: 'No se pudo actualizar el gráfico. Se reintentará automáticamente.' }));
      } finally {
        if (version === request) busy = false;
      }
    }
    function resume() { if (document.visibilityState !== 'hidden') void load(); }
    function visibility() { if (document.visibilityState === 'hidden') cancel(); else resume(); }
    function offline() {
      cancel();
      setState(prev => ({ ...prev, error: 'Sin conexión. Se conservan las últimas velas disponibles.' }));
    }
    const manual = () => { void load(); };
    refreshRef.current = manual;
    void load();
    const timer = window.setInterval(resume, POLL_MS);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('focus', resume);
    window.addEventListener('online', resume);
    window.addEventListener('offline', offline);
    return () => {
      alive = false;
      cancel();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('focus', resume);
      window.removeEventListener('online', resume);
      window.removeEventListener('offline', offline);
      if (refreshRef.current === manual) refreshRef.current = () => {};
    };
  }, [id, assetClass, timeframe, key]);

  return { ...(state.key === key ? state : { key, history: null, loading: true, error: null }), refresh };
}
