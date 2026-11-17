import type { Asset, CandleHistory } from "@/types";

/** Bounded workers; cancel/visibility changes stop publication and starting new requests. */
export async function scanIntraday(
  assets: Asset[],
  load: (asset: Asset, signal: AbortSignal) => Promise<CandleHistory | null>,
  publish: (
    asset: Asset,
    history: CandleHistory | null,
    failed: boolean
  ) => void,
  signal: AbortSignal,
  concurrency = 3
): Promise<number> {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, assets.length) }, async () => {
      while (!signal.aborted && cursor < assets.length) {
        const asset = assets[cursor++];
        try {
          const history = await load(asset, signal);
          if (!signal.aborted) publish(asset, history, false);
        } catch {
          if (!signal.aborted) publish(asset, null, true);
        }
      }
    })
  );
  return cursor;
}
