import type { AssetClass } from "../src/types";
import type { BrokerAvailability } from "../contracts/availability";

const normalize = (symbol: unknown) =>
  typeof symbol === "string" ? symbol.toUpperCase().replaceAll(".", "-") : "";
export function robinhoodStockAvailable(
  doc: unknown,
  id: string
): boolean | null {
  const data = doc as { results?: unknown; next?: unknown };
  if (!data || !Array.isArray(data.results)) return null;
  const found = data.results.some(
    r =>
      r &&
      normalize(r.symbol) === normalize(id) &&
      r.tradeable !== false &&
      r.tradability !== "untradable" &&
      (r.tradeable === true || r.tradability === "tradable") &&
      (!r.state || r.state === "active")
  );
  return found ? true : data.next ? null : false;
}
export function robinhoodCryptoAvailable(
  doc: unknown,
  id: string
): boolean | null {
  const data = doc as { results?: unknown; next?: unknown };
  if (!data || !Array.isArray(data.results)) return null;
  const found = data.results.some(
    r =>
      r &&
      normalize(r.asset_currency?.code) === normalize(id) &&
      r.quote_currency?.code === "USD" &&
      r.tradability === "tradable" &&
      (!r.asset_currency?.state || r.asset_currency.state === "active")
  );
  return found ? true : data.next ? null : false;
}

/** Read-only public listing check. No login, account connection or order endpoint. */
export function createRobinhoodAvailability(
  options: { fetch?: typeof fetch; now?: () => number } = {}
) {
  const request = options.fetch ?? fetch,
    now = options.now ?? Date.now;
  const cache = new Map<string, BrokerAvailability>(),
    pending = new Map<string, Promise<BrokerAvailability>>();
  let crypto: { value: unknown; at: number } | null = null,
    cryptoPending: Promise<unknown> | null = null;
  const cooldown = new Map<string, number>();
  let active = 0;
  async function read(url: string) {
    const host = new URL(url).hostname;
    if (active >= 4 || (cooldown.get(host) ?? 0) > now())
      throw Error("Unavailable");
    active++;
    try {
      const response = await request(url, {
        signal: AbortSignal.timeout(6000),
        headers: { Accept: "application/json", "User-Agent": "TraderUSA/1.0" },
      });
      if (!response.ok) {
        if ([401, 403, 429, 451].includes(response.status))
          cooldown.set(host, now() + 60000);
        await response.body?.cancel();
        throw Error("Unavailable");
      }
      const reader = response.body?.getReader();
      if (!reader) throw Error("Empty");
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          bytes += part.value.byteLength;
          if (bytes > 2000000) {
            await reader.cancel();
            throw Error("Too large");
          }
          chunks.push(part.value);
        }
      } finally {
        reader.releaseLock();
      }
      return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    } catch (error) {
      cooldown.set(host, now() + 60000);
      throw error;
    } finally {
      active--;
    }
  }
  async function cryptoCatalog() {
    if (crypto && now() - crypto.at < 3600000) return crypto.value;
    if (cryptoPending) return cryptoPending;
    cryptoPending = read("https://nummus.robinhood.com/currency_pairs/").then(
      value => {
        crypto = { value, at: now() };
        return value;
      }
    );
    try {
      return await cryptoPending;
    } finally {
      cryptoPending = null;
    }
  }
  async function check(
    assetClass: AssetClass,
    id: string
  ): Promise<BrokerAvailability> {
    const key = `${assetClass}:${id}`,
      old = cache.get(key);
    if (
      old &&
      now() - old.checkedAt < (old.available === null ? 60000 : 3600000)
    )
      return old;
    const shared = pending.get(key);
    if (shared) return shared;
    const promise = (async () => {
      let available: boolean | null = null;
      try {
        if (assetClass === "crypto")
          available = robinhoodCryptoAvailable(await cryptoCatalog(), id);
        else {
          const url = new URL("https://api.robinhood.com/instruments/");
          url.searchParams.set("symbol", id.replaceAll("-", "."));
          available = robinhoodStockAvailable(await read(url.toString()), id);
        }
      } catch {
        /* Unknown remains unknown; an inaccessible listing is not a negative. */
      }
      const value: BrokerAvailability = {
        available,
        checkedAt: now(),
        source: "Robinhood",
      };
      cache.delete(key);
      cache.set(key, value);
      if (cache.size > 10000) cache.delete(cache.keys().next().value!);
      return value;
    })();
    pending.set(key, promise);
    try {
      return await promise;
    } finally {
      pending.delete(key);
    }
  }
  return { check };
}
