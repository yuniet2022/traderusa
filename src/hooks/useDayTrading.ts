import { useEffect, useMemo, useRef, useState } from "react";
import type { Asset, AssetAnalysis, CandleHistory } from "@/types";
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
import { useMarketClock } from "./useMarketClock";
import { toast } from "sonner";

type Record = {
  history: CandleHistory | null;
  failed: boolean;
  interval: IntradayInterval;
};
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
  const [enabled, setEnabled] = useState(false);
  const [interval, setInterval] = useState<IntradayInterval>("5m");
  const [records, setRecords] = useState<Map<string, Record>>(() => new Map());
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [notices, setNotices] = useState<IntradayNotice[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const ledger = useRef(new IntradayNoticeLedger());
  const nextStart = useRef(0);
  const now = useMarketClock();
  const assetsJSON = JSON.stringify(
    analyses
      .map(a => a.asset)
      .sort((a, b) => assetKey(a).localeCompare(assetKey(b)))
  );
  const assets = useMemo(() => JSON.parse(assetsJSON) as Asset[], [assetsJSON]);

  useEffect(() => {
    if (!enabled || !assets.length) return;
    let alive = true,
      busy = false;
    let controller: AbortController | null = null;
    const canScan = () =>
      alive && document.visibilityState !== "hidden" && navigator.onLine;
    const cancel = () => {
      controller?.abort();
    };
    const run = async () => {
      if (busy || !canScan()) return;
      busy = true;
      setScanning(true);
      setProgress(0);
      controller = new AbortController();
      const active = controller;
      const start = nextStart.current % assets.length;
      const ordered = [...assets.slice(start), ...assets.slice(0, start)];
      const deadline = window.setTimeout(() => active.abort(), 45000);
      try {
        const started = await scanIntraday(
          ordered,
          async (asset, signal) => {
            if (!marketSession(asset.assetClass, Date.now()).openNow)
              return null;
            return loadTimeframeHistory(asset, interval, signal);
          },
          (asset, history, failed) => {
            if (!canScan()) return;
            setRecords(previous => {
              const copy = new Map(previous),
                old = copy.get(assetKey(asset));
              const newer = old?.interval === interval ? old.history : null;
              const regressed =
                !!history &&
                !!newer &&
                ((history.candles.at(-1)?.time ?? 0) <
                  (newer.candles.at(-1)?.time ?? 0) ||
                  !!(
                    history.priceAsOf &&
                    newer.priceAsOf &&
                    history.priceAsOf < newer.priceAsOf
                  ));
              copy.set(assetKey(asset), {
                interval,
                history: failed || regressed ? newer : history,
                failed: failed || regressed,
              });
              return copy;
            });
            setProgress(p => p + 1);
          },
          active.signal
        );
        if (alive) nextStart.current = (start + started) % assets.length;
      } finally {
        clearTimeout(deadline);
        busy = false;
        if (alive) setScanning(false);
        // A quick hide/show may happen before the cancelled round finishes.
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
        : analyses.map(a => {
            const record = records.get(assetKey(a.asset));
            const sameInterval = record?.interval === interval;
            const reading = detectEntrySetups(
              a.asset,
              sameInterval ? record.history : null,
              a.candles,
              now,
              intradaySeconds(interval),
              sameInterval && record.failed
            );
            return intradayAction(
              reading,
              positions.find(
                p =>
                  p.assetId === a.asset.id &&
                  p.assetClass === a.asset.assetClass
              ),
              alerts
            );
          }),
    [enabled, analyses, positions, alerts, records, now, interval]
  );

  useEffect(() => {
    if (!enabled || document.visibilityState === "hidden" || !navigator.onLine)
      return;
    const next = ledger.current.collect(actions);
    if (!next.length) return;
    const at = Date.now();
    for (const action of next) {
      const title = `${action.reading.asset.symbol} · ${action.title}`;
      toast(title, { description: action.detail, duration: 15000 });
      fireNotification(title, action.detail);
    }
    setNotices(previous =>
      [
        ...next.map((action, i) => ({
          id: `${at}:${action.key}:${i}`,
          at,
          action,
        })),
        ...previous,
      ].slice(0, 50)
    );
  }, [actions, enabled]);

  return {
    enabled,
    interval,
    actions,
    notices,
    scanning,
    progress,
    start: () => setEnabled(true),
    stop: () => {
      setEnabled(false);
      setScanning(false);
    },
    setInterval,
    refresh: () => setRefreshKey(k => k + 1),
  };
}
