import { useEffect, useMemo, useRef, useState } from "react";
import type { Asset, AssetAnalysis, Candle, CandleHistory } from "@/types";
import type { Position } from "@/lib/portfolio";
import type { AlertRule } from "@/lib/alerts";
import { fireNotification } from "@/lib/alerts";
import { loadTimeframeHistory } from "@/lib/data";
import { detectEntrySetups } from "@/lib/entrySetups";
import { marketSession } from "@/lib/marketSession";
import {
  assetKey,
  intradayAction,
  intradaySeconds,
  IntradayNoticeLedger,
  type IntradayAction,
  type IntradayInterval,
} from "@/lib/intraday";
import { scanIntraday } from "@/lib/intradayScan";
import {
  globalScanOrder,
  advanceGlobalCursor,
  balancedUniverse,
} from "@/lib/globalScan";
import { useMarketClock } from "./useMarketClock";
import { useMarketUniverse } from "./useMarketUniverse";
import { DailyContextCache } from "@/lib/dailyContextCache";
import { toast } from "sonner";

interface ScanHistory extends CandleHistory {
  daily?: Candle[];
  dailyUnavailable?: boolean;
}
interface ScanRecord {
  asset: Asset;
  history: ScanHistory | null;
  failed: boolean;
  interval: IntradayInterval;
  priority: boolean;
}
export interface IntradayNotice {
  id: string;
  at: number;
  action: IntradayAction;
}

export function useDayTrading(
  analyses: AssetAnalysis[],
  positions: Position[],
  alerts: AlertRule[]
) {
  const [enabled, setEnabled] = useState(false),
    [interval, setInterval] = useState<IntradayInterval>("5m");
  const [records, setRecords] = useState<Map<string, ScanRecord>>(
    () => new Map()
  );
  const [scanning, setScanning] = useState(false),
    [progress, setProgress] = useState(0);
  const [notices, setNotices] = useState<IntradayNotice[]>([]),
    [refreshKey, setRefreshKey] = useState(0);
  const [coverage, setCoverage] = useState({
    attempted: 0,
    analysed: 0,
    failed: 0,
    dailyMissing: 0,
  });
  const universe = useMarketUniverse(enabled),
    now = useMarketClock();
  const context = useRef({ analyses, positions, alerts }),
    ledger = useRef(new IntradayNoticeLedger());
  const attempts = useRef(
    new Map<string, { ok: boolean; dailyMissing: boolean }>()
  );
  const nextStart = useRef(0),
    nextPriority = useRef(0),
    pins = useRef(new Map<string, Asset>());
  const latest = useRef(new Map<string, ScanRecord>()),
    dailyCache = useRef(new DailyContextCache());
  useEffect(() => {
    context.current = { analyses, positions, alerts };
  }, [analyses, positions, alerts]);
  const knownJSON = JSON.stringify([
    ...analyses.map(a => a.asset),
    ...positions.map(p => ({
      id: p.assetId,
      symbol: p.symbol,
      name: p.symbol,
      assetClass: p.assetClass,
    })),
  ]);
  const assets = useMemo(() => {
    const map = new Map<string, Asset>();
    for (const a of universe.assets) map.set(assetKey(a), a);
    for (const a of JSON.parse(knownJSON) as Asset[]) map.set(assetKey(a), a);
    const highlighted = new Set(
      universe.assets
        .filter(a => a.catalogSources.some(s => s.startsWith("Yahoo Finance")))
        .map(assetKey)
    );
    return balancedUniverse(
      [...map.values()].sort(
        (a, b) =>
          Number(highlighted.has(assetKey(b))) -
            Number(highlighted.has(assetKey(a))) ||
          assetKey(a).localeCompare(assetKey(b))
      )
    );
  }, [universe.assets, knownJSON]);

  useEffect(() => {
    if (!enabled || !assets.length) return;
    let alive = true,
      busy = false;
    let controller: AbortController | null = null;
    let buyNoticeCount = 0;
    const canScan = () =>
      alive && document.visibilityState !== "hidden" && navigator.onLine;
    const cancel = () => controller?.abort();
    const notify = (actions: IntradayAction[]) => {
      if (!canScan()) return;
      const next = ledger.current.collect(actions);
      if (!next.length) return;
      const at = Date.now();
      for (const action of next) {
        const title = `${action.reading.asset.symbol} · ${action.title}`;
        if (action.kind === "buy") buyNoticeCount++;
        if (action.kind === "sell" || buyNoticeCount <= 3) {
          toast(title, {
            id: `intraday:${action.key}`,
            description: action.detail,
            duration: 15000,
          });
          fireNotification(title, action.detail);
        } else {
          toast(`${buyNoticeCount} posibles compras detectadas en esta ronda`, {
            id: "intraday-buy-summary",
            description:
              "Revisa los resultados y el historial de Day trading; cada plan requiere comprobar vigencia y riesgo.",
            duration: 15000,
          });
        }
      }
      setNotices(old =>
        [
          ...next.map((action, i) => ({
            id: `${at}:${action.key}:${i}`,
            at,
            action,
          })),
          ...old,
        ].slice(0, 50)
      );
    };
    const run = async () => {
      if (busy || !canScan()) return;
      busy = true;
      buyNoticeCount = 0;
      setScanning(true);
      setProgress(0);
      const allowed = new Set(assets.map(assetKey));
      for (const key of attempts.current.keys())
        if (!allowed.has(key)) attempts.current.delete(key);
      const retained = [...attempts.current.values()];
      setCoverage({
        attempted: retained.length,
        analysed: retained.filter(s => s.ok).length,
        failed: retained.filter(s => !s.ok).length,
        dailyMissing: retained.filter(s => s.dailyMissing).length,
      });
      controller = new AbortController();
      const active = controller;
      const stockOpen = marketSession("stock", Date.now()).openNow;
      const eligible = assets.filter(
        a => a.assetClass === "crypto" || stockOpen
      );
      if (!eligible.length) {
        busy = false;
        setScanning(false);
        return;
      }
      const start = nextStart.current % eligible.length;
      const held = new Set(
        context.current.positions.map(p => `${p.assetClass}:${p.assetId}`)
      );
      const priority = [
        ...eligible.filter(a => held.has(assetKey(a))),
        ...pins.current.values(),
        ...[...latest.current.values()]
          .filter(r => r.priority && r.interval === interval)
          .slice(-20)
          .map(r => r.asset),
      ];
      const priorityOffset = nextPriority.current;
      const { ordered, rotated, preferred, priorityKeys } = globalScanOrder(
        eligible,
        priority,
        start,
        100,
        priorityOffset
      );
      const completed = new Set<string>();
      const deadline = window.setTimeout(() => active.abort(), 45000);
      try {
        await scanIntraday(
          ordered,
          async (asset, signal) => {
            const known = context.current.analyses.find(
              a => assetKey(a.asset) === assetKey(asset)
            );
            const cached = dailyCache.current.get(assetKey(asset), Date.now());
            const useKnown = known && !known.historyStale;
            const dailyTask = useKnown
              ? Promise.resolve(known.candles)
              : cached
                ? cached.missing
                  ? Promise.reject(Error("Daily history unavailable"))
                  : Promise.resolve(cached.candles)
                : loadTimeframeHistory(
                    asset,
                    "1d",
                    AbortSignal.any([signal, AbortSignal.timeout(6000)])
                  ).then(h => {
                    if (h.stale) throw Error("Stale daily history");
                    return h.candles;
                  });
            const [intraday, day] = await Promise.allSettled([
              loadTimeframeHistory(asset, interval, signal),
              dailyTask,
            ]);
            signal.throwIfAborted();
            if (intraday.status !== "fulfilled")
              throw Error("No intraday history");
            const daily = day.status === "fulfilled" ? day.value : [];
            if (!useKnown && !cached)
              dailyCache.current.set(
                assetKey(asset),
                daily,
                day.status !== "fulfilled",
                Date.now()
              );
            return {
              ...intraday.value,
              daily,
              dailyUnavailable: day.status !== "fulfilled",
            } as ScanHistory;
          },
          (asset, incoming, failed) => {
            if (!canScan()) return;
            const key = assetKey(asset),
              old = latest.current.get(key),
              previous = old?.interval === interval ? old.history : null;
            completed.add(key);
            const data = incoming as ScanHistory | null;
            const regressed =
              !!data &&
              !!previous &&
              ((data.candles.at(-1)?.time ?? 0) <
                (previous.candles.at(-1)?.time ?? 0) ||
                !!(
                  data.priceAsOf &&
                  previous.priceAsOf &&
                  data.priceAsOf < previous.priceAsOf
                ));
            const history = failed || regressed ? previous : data;
            const reading = detectEntrySetups(
              asset,
              history,
              history?.daily ?? [],
              Date.now(),
              intradaySeconds(interval),
              failed || regressed
            );
            const action = intradayAction(
              reading,
              context.current.positions.find(
                p => p.assetId === asset.id && p.assetClass === asset.assetClass
              ),
              context.current.alerts
            );
            notify([action]);
            const ok =
              !!history && !failed && !regressed && reading.closed.length >= 20;
            attempts.current.set(key, {
              ok,
              dailyMissing: history?.dailyUnavailable ?? false,
            });
            const stats = [...attempts.current.values()];
            setCoverage({
              attempted: stats.length,
              analysed: stats.filter(s => s.ok).length,
              failed: stats.filter(s => !s.ok).length,
              dailyMissing: stats.filter(s => s.dailyMissing).length,
            });
            const next = new Map(latest.current);
            next.delete(key);
            next.set(key, {
              asset,
              history,
              failed: failed || regressed,
              interval,
              priority: action.kind === "buy" || action.kind === "sell",
            });
            if (next.size > 120) {
              const protectedKey = (k: string) =>
                held.has(k) || pins.current.has(k);
              const evict =
                [...next.entries()].find(
                  ([k, v]) =>
                    !protectedKey(k) &&
                    (!v.priority ||
                      Date.now() - (v.history?.fetchedAt ?? 0) > 30000)
                )?.[0] ??
                [...next.keys()].find(k => !protectedKey(k)) ??
                next.keys().next().value!;
              next.delete(evict);
            }
            latest.current = next;
            setRecords(next);
            setProgress(n => n + 1);
          },
          active.signal
        );
      } finally {
        clearTimeout(deadline);
        busy = false;
        if (alive) {
          // Advance past priority assets too, so the broad-market cursor cannot starve.
          const consumed = advanceGlobalCursor(
            rotated,
            priorityKeys,
            completed
          );
          let priorityConsumed = 0;
          for (const a of preferred) {
            if (!completed.has(assetKey(a))) break;
            priorityConsumed++;
          }
          nextPriority.current = preferred.length
            ? (priorityOffset + priorityConsumed) % preferred.length
            : 0;
          nextStart.current = (start + consumed) % eligible.length;
          setScanning(false);
          if (canScan() && buyNoticeCount > 3)
            fireNotification(
              "TradeRadar · Resumen de compras",
              `${buyNoticeCount} posibles compras detectadas en esta ronda. Revisa Day trading para comprobar planes, vigencia y riesgo.`
            );
        }
        if (alive && active.signal.aborted && canScan())
          queueMicrotask(() => {
            void run();
          });
      }
    };
    const visibility = () => {
      if (!canScan()) cancel();
      else void run();
    };
    void run();
    const timer = window.setInterval(() => {
      void run();
    }, 20000);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("offline", cancel);
    window.addEventListener("online", visibility);
    return () => {
      alive = false;
      cancel();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("offline", cancel);
      window.removeEventListener("online", visibility);
    };
  }, [enabled, assets, interval, refreshKey]);

  const actions = useMemo(
    () =>
      !enabled
        ? []
        : [...records.values()]
            .filter(r => r.interval === interval)
            .map(r => {
              const reading = detectEntrySetups(
                r.asset,
                r.history,
                r.history?.daily ?? [],
                now,
                intradaySeconds(interval),
                r.failed
              );
              return intradayAction(
                reading,
                positions.find(
                  p =>
                    p.assetId === r.asset.id &&
                    p.assetClass === r.asset.assetClass
                ),
                alerts
              );
            }),
    [enabled, records, now, interval, positions, alerts]
  );
  const closedStocks = marketSession("stock", now).openNow
    ? 0
    : assets.filter(a => a.assetClass === "stock").length;
  return {
    enabled,
    interval,
    actions,
    notices,
    scanning,
    progress,
    universe,
    assets,
    coverage,
    closedStocks,
    start: () => setEnabled(true),
    stop: () => {
      setEnabled(false);
      setScanning(false);
    },
    setInterval: (value: IntradayInterval) => {
      if (value !== interval) {
        attempts.current.clear();
        setCoverage({ attempted: 0, analysed: 0, failed: 0, dailyMissing: 0 });
      }
      setInterval(value);
    },
    refresh: () => setRefreshKey(k => k + 1),
    inspect: (asset: Asset) => {
      pins.current.set(assetKey(asset), asset);
      if (pins.current.size > 10)
        pins.current.delete(pins.current.keys().next().value!);
      setRefreshKey(k => k + 1);
    },
    dailyFor: (asset: Asset) =>
      latest.current.get(assetKey(asset))?.history?.daily ?? [],
  };
}
