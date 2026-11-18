import { useEffect, useState } from "react";
import type { UniverseAsset, UniversePage } from "@contracts/universe";
import { marketJSON, MarketRequestError } from "@/lib/marketClient";

export function useMarketUniverse(enabled: boolean) {
  const [catalog, setCatalog] = useState<{
    assets: UniverseAsset[];
    coverage: UniversePage | null;
  }>({ assets: [], coverage: null });
  const [loading, setLoading] = useState(false),
    [error, setError] = useState<string | null>(null),
    [received, setReceived] = useState(0);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let alive = true,
      busy = false,
      forceRequested = revision > 0;
    const controller = new AbortController();
    const load = async () => {
      if (busy || document.visibilityState === "hidden" || !navigator.onLine)
        return;
      busy = true;
      const force = forceRequested;
      forceRequested = false;
      setLoading(true);
      setError(null);
      setReceived(0);
      try {
        for (let attempt = 0; attempt < 2; attempt++) {
          const assets: UniverseAsset[] = [];
          let offset: number | null = 0,
            version: string | undefined,
            coverage: UniversePage | null = null;
          try {
            while (offset !== null) {
              const page: UniversePage = await marketJSON(
                "universe",
                {
                  offset: String(offset),
                  limit: "500",
                  ...(version ? { version } : {}),
                  ...(force && offset === 0 && !attempt
                    ? { refresh: "1" }
                    : {}),
                },
                controller.signal
              );
              if (!alive) return;
              if (
                !Array.isArray(page.assets) ||
                !Number.isInteger(page.total) ||
                page.total < 0 ||
                page.total > 100000 ||
                page.assets.length > 500 ||
                typeof page.version !== "string" ||
                (page.nextOffset !== null &&
                  (!Number.isInteger(page.nextOffset) ||
                    page.nextOffset <= offset))
              )
                throw Error("Invalid catalog");
              if (version && page.version !== version)
                throw new MarketRequestError("Catalog changed", 409);
              assets.push(...page.assets);
              if (assets.length > 100000) throw Error("Catalog too large");
              version = page.version;
              coverage = page;
              offset = page.nextOffset;
              setReceived(assets.length);
            }
            if (!coverage || assets.length !== coverage.total)
              throw Error("Incomplete catalog");
            if (alive) setCatalog({ assets, coverage });
            break;
          } catch (e) {
            if (e instanceof MarketRequestError && e.status === 409 && !attempt)
              continue;
            throw e;
          }
        }
      } catch {
        if (alive)
          setError(
            "No se pudo ampliar el catálogo. La cobertura global está incompleta; se conservan los activos conocidos."
          );
      } finally {
        busy = false;
        if (alive) setLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 3600000);
    return () => {
      alive = false;
      controller.abort();
      clearInterval(timer);
    };
  }, [enabled, revision]);
  return {
    ...catalog,
    loading,
    error,
    received,
    refresh: () => setRevision(r => r + 1),
  };
}
