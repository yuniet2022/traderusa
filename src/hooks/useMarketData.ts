import { useCallback, useEffect, useRef, useState } from 'react';
import type { Asset, AssetAnalysis, Quote } from '@/types';
import { WATCHLIST, loadCandles, loadQuotes } from '@/lib/data';
import { fetchLiveCrypto, fetchLiveStocks } from '@/lib/live';
import { buildSnapshot, runStrategies, detectRegime, compositeScore, signalFromScore, detectExtension, entryTiming } from '@/lib/strategies';
import { computeLevels } from '@/lib/levels';
import {
  type AlertRule, type AlertKind, loadAlerts, saveAlerts, makeAlert, checkAlerts, alertLabel,
  ensureNotifyPermission, fireNotification,
} from '@/lib/alerts';
import { type Position, loadPortfolio, savePortfolio, makePosition } from '@/lib/portfolio';
import { trpc } from '@/providers/trpc';
import { toast } from 'sonner';

const CUSTOM_KEY = 'tr_custom_assets_v1';

function loadCustomAssets(): Asset[] {
  try { return JSON.parse(localStorage.getItem(CUSTOM_KEY) ?? '[]') as Asset[]; }
  catch { return []; }
}

async function analyzeAsset(asset: Asset, quotes: Record<string, Quote>): Promise<AssetAnalysis | null> {
  const { candles, source } = await loadCandles(asset);
  const q = quotes[asset.id];
  // usar el precio en vivo como última vela para que la señal refleje el mercado actual
  if (q && candles.length > 0) {
    const lastC = candles[candles.length - 1];
    candles[candles.length - 1] = {
      ...lastC,
      close: q.price,
      high: Math.max(lastC.high, q.price),
      low: Math.min(lastC.low, q.price),
    };
  }
  const ind = buildSnapshot(candles);
  const votes = runStrategies(ind);
  const regime = detectRegime(ind);
  const raw = compositeScore(votes, regime);
  const extension = detectExtension(ind);
  const timing = entryTiming(ind);
  // regla de veto: un pico vertical jamás puede ser compra
  let composite = raw;
  if (extension === 2) composite = Math.min(raw, 19);
  else if (extension === 1) composite = Math.min(raw, 45);
  // timing de entrada: si la señal es de compra pero el precio está extendido, reducir
  if (composite > 0) composite = composite * timing.factor;
  // REGLA DURA: si el timing está bloqueado (precio extendido), una compra pasa a NEUTRAL
  if (timing.block && composite > 0) composite = Math.min(composite, 19);
  const n = candles.length;
  const derivedChange = n >= 2 && candles[n - 2].close > 0
    ? (candles[n - 1].close / candles[n - 2].close - 1) * 100
    : null;
  const signal = signalFromScore(composite);
  return {
    asset,
    price: q?.price ?? ind.lastPrice,
    change24h: q?.change24h ?? derivedChange,
    candles,
    indicators: ind,
    votes,
    composite,
    signal,
    extension,
    timing,
    levels: computeLevels(ind, composite),
    regime,
    dataSource: source,
    updatedAt: Date.now(),
  };
}

export function useMarketData(userId: number | null) {
  const [analyses, setAnalyses] = useState<AssetAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [liveCount, setLiveCount] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [alerts, setAlerts] = useState<AlertRule[]>(() => loadAlerts());
  const [portfolio, setPortfolio] = useState<Position[]>(() => loadPortfolio());
  const busy = useRef(false);
  const analysesRef = useRef<AssetAnalysis[]>([]);
  analysesRef.current = analyses;
  const alertsRef = useRef<AlertRule[]>(alerts);
  alertsRef.current = alerts;

  /* ---------- Sincronización con la cuenta (servidor) ---------- */
  const serverPortfolio = trpc.portfolio.list.useQuery(undefined, {
    enabled: !!userId, retry: false, refetchOnWindowFocus: false,
  });
  const serverAlerts = trpc.alerts.list.useQuery(undefined, {
    enabled: !!userId, retry: false, refetchOnWindowFocus: false,
  });
  const savePosMut = trpc.portfolio.save.useMutation();
  const removePosMut = trpc.portfolio.remove.useMutation();
  const addAlertMut = trpc.alerts.add.useMutation();
  const removeAlertMut = trpc.alerts.remove.useMutation();
  const hydratedFor = useRef<number | null>(null);
  const addAssetRef = useRef<(a: Asset) => Promise<AssetAnalysis | null>>(async () => null);

  useEffect(() => {
    if (!userId || !serverPortfolio.data || hydratedFor.current === userId) return;
    hydratedFor.current = userId;
    const list = serverPortfolio.data as Position[];
    setPortfolio(list);
    savePortfolio(list); // caché local para arranque rápido
    // asegurar que los activos del portafolio se carguen en el escáner aunque no estén en la lista
    for (const p of list) {
      if (!analysesRef.current.some(a => a.asset.id === p.assetId)) {
        void addAssetRef.current({ id: p.assetId, symbol: p.symbol, name: p.symbol, assetClass: p.assetClass });
      }
    }
  }, [userId, serverPortfolio.data]);

  useEffect(() => {
    if (!userId || !serverAlerts.data) return;
    const list: AlertRule[] = serverAlerts.data.map(a => ({
      id: a.id, assetId: a.assetId, symbol: a.symbol,
      kind: a.kind as AlertKind, price: a.price,
      createdAt: a.createdAt, triggered: false,
    }));
    setAlerts(prev => {
      // conservar el estado "triggered" local de las que ya existen
      const prevMap = new Map(prev.map(x => [`${x.assetId}:${x.kind}`, x.triggered]));
      const merged = list.map(a => ({ ...a, triggered: prevMap.get(`${a.assetId}:${a.kind}`) ?? false }));
      saveAlerts(merged);
      return merged;
    });
  }, [userId, serverAlerts.data]);

  const handleFiredAlerts = useCallback((fired: AlertRule[]) => {
    if (fired.length === 0) return;
    for (const a of fired) {
      const msg = `Alerta activada: ${alertLabel(a)}`;
      toast.warning(msg, { duration: 10000 });
      fireNotification('TradeRadar', msg);
    }
    setAlerts(prev => {
      const next = prev.map(a => fired.some(f => f.id === a.id) ? { ...a, triggered: true } : a);
      saveAlerts(next);
      return next;
    });
  }, []);

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    try {
      const all = [...WATCHLIST, ...loadCustomAssets()];
      const quotes = await loadQuotes(all).catch(() => ({} as Record<string, Quote>));
      const results: AssetAnalysis[] = [];
      let live = 0;
      for (const asset of all) {
        try {
          const a = await analyzeAsset(asset, quotes);
          if (a) {
            live++;
            results.push(a);
          }
        } catch { /* sin datos reales → no se muestra, jamás se inventa */ }
      }
      results.sort((a, b) => b.composite - a.composite);
      // ALERTAS AUTOMÁTICAS: notificar cuando un activo cambia a compra/venta o sale de ella
      const prevMap = new Map(analysesRef.current.map(a => [a.asset.id, a.signal]));
      for (const a of results) {
        const prev = prevMap.get(a.asset.id);
        if (!prev || prev === a.signal) continue;
        const isBuy = a.signal === 'COMPRA' || a.signal === 'COMPRA FUERTE';
        const isSell = a.signal === 'VENTA' || a.signal === 'VENTA FUERTE';
        const wasBuy = prev === 'COMPRA' || prev === 'COMPRA FUERTE';
        const wasSell = prev === 'VENTA' || prev === 'VENTA FUERTE';
        let msg: string | null = null;
        if (isBuy && !wasBuy) msg = `🟢 ${a.asset.symbol}: nueva señal de ${a.signal} (score ${a.composite.toFixed(0)})`;
        else if (isSell && !wasSell) msg = `🔴 ${a.asset.symbol}: nueva señal de ${a.signal} (score ${a.composite.toFixed(0)})`;
        else if (!isBuy && wasBuy) msg = `⚪ ${a.asset.symbol}: la señal de compra se desactivó (ahora ${a.signal})`;
        else if (!isSell && wasSell) msg = `⚪ ${a.asset.symbol}: la señal de venta se desactivó (ahora ${a.signal})`;
        if (msg) {
          toast(msg, { duration: 12000 });
          fireNotification('TradeRadar', msg);
        }
      }
      setAnalyses(results);
      setLiveCount(live);
      setUpdatedAt(Date.now());
      // alertas personalizadas de señal
      const prices: Record<string, number> = {};
      const signals: Record<string, AssetAnalysis['signal']> = {};
      for (const a of results) { prices[a.asset.id] = a.price; signals[a.asset.id] = a.signal; }
      handleFiredAlerts(checkAlerts(alertsRef.current.map(x => ({ ...x })), prices, signals));
    } finally {
      setLoading(false);
      busy.current = false;
    }
  }, [handleFiredAlerts]);

  /* Ticks de precio en vivo: cripto cada 30s, acciones cada 60s */
  const tick = useCallback(async () => {
    const current = analysesRef.current;
    if (current.length === 0) return;
    const cryptoIds = current.filter(a => a.asset.assetClass === 'crypto').map(a => a.asset.id);
    const stockIds = current.filter(a => a.asset.assetClass === 'stock').map(a => a.asset.id);
    const quotes: Record<string, Quote> = {};
    const [cr, sr] = await Promise.allSettled([
      fetchLiveCrypto(cryptoIds),
      fetchLiveStocks(stockIds),
    ]);
    if (cr.status === 'fulfilled') Object.assign(quotes, cr.value);
    if (sr.status === 'fulfilled') Object.assign(quotes, sr.value);
    if (Object.keys(quotes).length === 0) return;

    setAnalyses(prev => prev.map(a => {
      const q = quotes[a.asset.id];
      return q ? { ...a, price: q.price, change24h: q.change24h ?? a.change24h } : a;
    }));
    // alertas de precio
    const prices: Record<string, number> = {};
    for (const [k, v] of Object.entries(quotes)) prices[k] = v.price;
    handleFiredAlerts(checkAlerts(alertsRef.current.map(x => ({ ...x })), prices, {}));
  }, [handleFiredAlerts]);

  useEffect(() => {
    refresh();
    const t1 = setInterval(refresh, 5 * 60 * 1000);
    const t2 = setInterval(tick, 30 * 1000);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, [refresh, tick]);

  const addAsset = useCallback(async (asset: Asset): Promise<AssetAnalysis | null> => {
    const exists = analysesRef.current.some(a => a.asset.id === asset.id && a.asset.assetClass === asset.assetClass);
    if (exists) return analysesRef.current.find(a => a.asset.id === asset.id) ?? null;
    // guardar en personalizados
    const custom = loadCustomAssets();
    if (!custom.some(c => c.id === asset.id)) {
      try { localStorage.setItem(CUSTOM_KEY, JSON.stringify([...custom, asset])); } catch { /* ignore */ }
    }
    try {
      const analysis = await analyzeAsset(asset, {});
      if (analysis) {
        setAnalyses(prev => [...prev, analysis].sort((x, y) => y.composite - x.composite));
        return analysis;
      }
    } catch { /* fallo */ }
    return null;
  }, []);
  addAssetRef.current = addAsset;

  const addPosition = useCallback((p: Omit<Position, 'addedAt'>) => {
    setPortfolio(prev => {
      const next = [...prev.filter(x => x.assetId !== p.assetId), makePosition(p)];
      savePortfolio(next);
      return next;
    });
    if (userId) {
      savePosMut.mutate({ assetId: p.assetId, symbol: p.symbol, assetClass: p.assetClass, lots: p.lots });
    }
    toast.success(`${p.symbol} añadido a tu portafolio`);
  }, [userId, savePosMut.mutate]);

  const removePosition = useCallback((assetId: string) => {
    setPortfolio(prev => {
      const next = prev.filter(x => x.assetId !== assetId);
      savePortfolio(next);
      return next;
    });
    if (userId) removePosMut.mutate({ assetId });
  }, [userId, removePosMut.mutate]);

  const addAlert = useCallback(async (partial: Parameters<typeof makeAlert>[0]) => {
    await ensureNotifyPermission();
    setAlerts(prev => {
      const next = [...prev, makeAlert(partial)];
      saveAlerts(next);
      return next;
    });
    if (userId) {
      addAlertMut.mutate({ assetId: partial.assetId, symbol: partial.symbol, kind: partial.kind, price: partial.price });
    }
    toast.success('Alerta creada: ' + alertLabel(partial as AlertRule));
  }, [userId, addAlertMut.mutate]);

  const removeAlert = useCallback((id: string) => {
    const target = alertsRef.current.find(a => a.id === id);
    setAlerts(prev => {
      const next = prev.filter(a => a.id !== id);
      saveAlerts(next);
      return next;
    });
    if (userId && target) removeAlertMut.mutate({ assetId: target.assetId, kind: target.kind });
  }, [userId, removeAlertMut.mutate]);

  return { analyses, loading, liveCount, updatedAt, refresh, addAsset, alerts, addAlert, removeAlert, portfolio, addPosition, removePosition };
}
