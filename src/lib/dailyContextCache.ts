import type { Candle } from "@/types";

/** Reusing context never advances its receipt time or prevents retrying a failure. */
export class DailyContextCache {
  private entries = new Map<
    string,
    { candles: Candle[]; at: number; missing: boolean }
  >();
  get(key: string, now: number) {
    const entry = this.entries.get(key);
    const age = entry ? now - entry.at : Infinity;
    return entry && age >= 0 && age < (entry.missing ? 60000 : 300000)
      ? entry
      : undefined;
  }
  set(key: string, candles: Candle[], missing: boolean, now: number) {
    this.entries.delete(key);
    this.entries.set(key, { candles, at: now, missing });
    if (this.entries.size > 200)
      this.entries.delete(this.entries.keys().next().value!);
  }
}
