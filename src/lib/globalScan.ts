import type { Asset } from "@/types";
import { assetKey } from "./intraday";

/** Two priority jobs then one broad-market job; neither queue monopolizes a round. */
export function globalScanOrder(
  eligible: Asset[],
  priority: Asset[],
  start: number,
  batch = 100,
  priorityStart = 0
) {
  if (!eligible.length)
    return {
      ordered: [],
      rotated: [],
      preferred: [],
      priorityKeys: new Set<string>(),
    };
  const allowed = new Map(eligible.map(a => [assetKey(a), a]));
  const selected = new Map(
    priority
      .filter(a => allowed.has(assetKey(a)))
      .map(a => [assetKey(a), allowed.get(assetKey(a))!])
  );
  const priorityKeys = new Set(selected.keys()),
    queue = [...selected.values()],
    pOffset = queue.length ? priorityStart % queue.length : 0;
  const preferred = [...queue.slice(pOffset), ...queue.slice(0, pOffset)];
  const offset = start % eligible.length,
    rotated = [...eligible.slice(offset), ...eligible.slice(0, offset)];
  const broad = rotated
    .filter(a => !priorityKeys.has(assetKey(a)))
    .slice(0, batch);
  const ordered: Asset[] = [];
  let p = 0,
    b = 0;
  while (p < preferred.length || b < broad.length) {
    for (let i = 0; i < 2 && p < preferred.length; i++)
      ordered.push(preferred[p++]);
    if (b < broad.length) ordered.push(broad[b++]);
  }
  return { ordered, rotated, preferred, priorityKeys };
}

/** Alternate asset classes instead of visiting every crypto before the first stock. */
export function balancedUniverse(assets: Asset[]): Asset[] {
  const stocks = assets.filter(a => a.assetClass === "stock"),
    crypto = assets.filter(a => a.assetClass === "crypto"),
    result: Asset[] = [];
  for (let i = 0; i < Math.max(stocks.length, crypto.length); i++) {
    if (stocks[i]) result.push(stocks[i]);
    if (crypto[i]) result.push(crypto[i]);
  }
  return result;
}
export function advanceGlobalCursor(
  rotated: Asset[],
  priorityKeys: Set<string>,
  completed: Set<string>
) {
  let consumed = 0;
  for (const a of rotated) {
    if (!priorityKeys.has(assetKey(a)) && !completed.has(assetKey(a))) break;
    consumed++;
  }
  return consumed;
}
