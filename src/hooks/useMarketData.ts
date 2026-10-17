import { useCallback, useEffect, useRef, useState } from 'react';
import type { Asset, AssetAnalysis, Quote } from '@/types';
import { WATCHLIST, loadCandles } from '@/lib/data';
import { scanMarket } from '@/lib/marketRefresh';
import { fetchLiveCrypto, fetchLiveStocks } from '@/lib/live';
import { buildAssetAnalysis, repriceAnalysis } from '@/lib/analysis';
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

async function analyzeAsset(asset: Asset, quotes: Record<string, Quote>, previous?: AssetAnalysis, signal?: AbortSignal): Promise<AssetAnalysis | null> {
  const history = await loadCandles(asset, signal);
  let quote = quotes[`${asset.assetClass}:${asset.id}`];
  if (previous?.quoteReceivedAt && (!quote || !Number.isFinite(quote.price) || quote.price <= 0
    || (quote.asOf && previous.priceAsOf && quote.asOf < previous.priceAsOf))) {
    // Preserve the last known quote if a history refresh cannot obtain a newer one.
    quote = { price: previous.price, change24h: previous.change24h, source: previous.priceSource,
      asOf: previous.priceAsOf ?? undefined, receivedAt: previous.quoteReceivedAt, cached: true };
  }
  return buildAssetAnalysis(asset, history, quote);
}

function notifySignalChanges(previous: AssetAnalysis[], next: AssetAnalysis[]) {
  const prevMap = new Map(previous.map(a => [`${a.asset.assetClass}:${a.asset.id}`, a.signal]));
  for (const a of next) {
    const prev = prevMap.get(`${a.asset.assetClass}:${a.asset.id}`);
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
}

export function useMarketData(userId: number | null) {
  const [analyses, setAnalyses] = useState<AssetAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [marketNotice, setMarketNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [alerts, setAlerts] = useState<AlertRule[]>(() => loadAlerts());
  const [portfolio, setPortfolio] = useState<Position[]>(() => loadPortfolio());
  const busy = useRef(false);
  const tickBusy = useRef(false);
  const refreshVersion = useRef(0);
  const refreshAbort = useRef<AbortController | null>(null);
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
    if (busy.current && !refreshAbort.current?.signal.aborted) return;
    busy.current = true;
    const version = ++refreshVersion.current;
    const controller = new AbortController();
    refreshAbort.current = controller;
    setLoading(true);
    setMarketNotice(null);
    try {
      const key = (asset: Asset) => `${asset.assetClass}:${asset.id}`;
      const all = [...new Map([...WATCHLIST, ...loadCustomAssets()].map(asset => [key(asset), asset])).values()];
      setProgress({ completed: 0, total: all.length });
      const before = analysesRef.current;
      const previous = new Map(before.map(a => [key(a.asset), a]));
      const scanKeys = new Set(all.map(key));
      const found = new Map(before.map(a => [key(a.asset), { ...a, dataSource: 'cached' as const } as AssetAnalysis]));
      const summary = await scanMarket(all, (asset, signal) => analyzeAsset(asset, {}, previous.get(key(asset)), signal), {
        signal: controller.signal,
        onProgress: completed => { if (refreshVersion.current === version) setProgress({ completed, total: all.length }); },
        onResult: analysis => {
          if (refreshVersion.current !== version) return;
          for (const extra of analysesRef.current) if (!scanKeys.has(key(extra.asset))) found.set(key(extra.asset), extra);
          found.set(key(analysis.asset), analysis);
          const partial = [...found.values()].sort((a, b) => b.composite - a.composite);
          analysesRef.current = partial;
          setAnalyses(partial);
        },
      });
      if (controller.signal.aborted || refreshVersion.current !== version) return;
      const results = [...found.values()].sort((a, b) => b.composite - a.composite);
      notifySignalChanges(before, results);
      analysesRef.current = results;
      setAnalyses(results);
      if (summary.succeeded) setUpdatedAt(Date.now());
      if (summary.failed) setMarketNotice(summary.succeeded || results.length
        ? `No se pudieron actualizar ${summary.failed} activos. Se muestran los datos disponibles y la caché identificada.`
        : 'Las fuentes de mercado no respondieron. Puedes reintentar la carga en unos momentos.');
      // alertas personalizadas de señal
      const prices: Record<string, number> = {};
      const signals: Record<string, AssetAnalysis['signal']> = {};
      for (const a of results) { prices[a.asset.id] = a.price; signals[a.asset.id] = a.signal; }
      handleFiredAlerts(checkAlerts(alertsRef.current.map(x => ({ ...x })), prices, signals));
    } finally {
      if (refreshVersion.current === version) {
        if (!controller.signal.aborted) setLoading(false);
        busy.current = false;
      }
    }
  }, [handleFiredAlerts]);

  /* Cotizaciones: consulta cada 30s, con posible retraso del proveedor. */
  const tick = useCallback(async () => {
    if (busy.current || tickBusy.current) return;
    tickBusy.current = true;
    const version = refreshVersion.current;
    try {
      const current = analysesRef.current;
      if (current.length === 0) return;
      const cryptoIds = current.filter(a => a.asset.assetClass === 'crypto').map(a => a.asset.id);
      const stockIds = current.filter(a => a.asset.assetClass === 'stock').map(a => a.asset.id);
      const [cr, sr] = await Promise.allSettled([fetchLiveCrypto(cryptoIds), fetchLiveStocks(stockIds)]);
      if (busy.current || refreshVersion.current !== version) return;
      const crypto = cr.status === 'fulfilled' ? cr.value : {};
      const stocks = sr.status === 'fulfilled' ? sr.value : {};
      const previous = analysesRef.current;
      const next = previous.map(a => repriceAnalysis(a, (a.asset.assetClass === 'crypto' ? crypto : stocks)[a.asset.id]));
      if (!next.some((a, i) => a !== previous[i])) return;
      next.sort((a, b) => b.composite - a.composite);
      notifySignalChanges(previous, next);
      analysesRef.current = next;
      setAnalyses(next);
      setUpdatedAt(Date.now());
      const prices: Record<string, number> = {};
      const signals: Record<string, AssetAnalysis['signal']> = {};
      for (const a of next) { prices[a.asset.id] = a.price; signals[a.asset.id] = a.signal; }
      handleFiredAlerts(checkAlerts(alertsRef.current.map(x => ({ ...x })), prices, signals));
    } finally {
      tickBusy.current = false;
    }
  }, [handleFiredAlerts]);

  useEffect(() => {
    refresh();
    const t1 = setInterval(refresh, 5 * 60 * 1000);
    const t2 = setInterval(tick, 30 * 1000);
    return () => { clearInterval(t1); clearInterval(t2); refreshAbort.current?.abort(); };
  }, [refresh, tick]);

  const addAsset = useCallback(async (asset: Asset): Promise<AssetAnalysis | null> => {
    const exists = analysesRef.current.some(a => a.asset.id === asset.id && a.asset.assetClass === asset.assetClass);
    if (exists) return analysesRef.current.find(a => a.asset.id === asset.id && a.asset.assetClass === asset.assetClass) ?? null;
    // guardar en personalizados
    const custom = loadCustomAssets();
    if (!custom.some(c => c.id === asset.id && c.assetClass === asset.assetClass)) {
      try { localStorage.setItem(CUSTOM_KEY, JSON.stringify([...custom, asset])); } catch { /* ignore */ }
    }
    try {
      const analysis = await analyzeAsset(asset, {});
      if (analysis) {
        const next = [...analysesRef.current.filter(a => a.asset.id !== asset.id || a.asset.assetClass !== asset.assetClass), analysis].sort((x, y) => y.composite - x.composite);
        analysesRef.current = next;
        setAnalyses(next);
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

  return { analyses, loading, marketNotice, progress, quoteCount: analyses.filter(a => a.dataSource === 'quote').length, updatedAt, refresh, addAsset, alerts, addAlert, removeAlert, portfolio, addPosition, removePosition };
}
