import { describe, expect, it } from "vitest";
import { DailyContextCache } from "./dailyContextCache";

describe("daily context cache recovery", () => {
  it("does not indefinitely postpone retry by reusing a failed daily request", () => {
    const cache = new DailyContextCache();
    cache.set("stock:NEW", [], true, 1000);
    expect(cache.get("stock:NEW", 21000)?.missing).toBe(true);
    expect(cache.get("stock:NEW", 41000)?.at).toBe(1000);
    expect(cache.get("stock:NEW", 61000)).toBeUndefined();
    cache.set("stock:NEW", [], false, 62000);
    expect(cache.get("stock:NEW", 63000)?.missing).toBe(false);
  });
  it("keeps the original successful context timestamp and expires without fabricating fresh data", () => {
    const cache = new DailyContextCache();
    cache.set("crypto:NEW", [], false, 1000);
    expect(cache.get("crypto:NEW", 250000)?.at).toBe(1000);
    expect(cache.get("crypto:NEW", 301000)).toBeUndefined();
    expect(cache.get("crypto:NEW", 0)).toBeUndefined();
  });
  it("bounds retained history independently of the number of assets discovered", () => {
    const cache = new DailyContextCache();
    for (let i = 0; i < 250; i++) cache.set(String(i), [], false, 1000);
    expect(cache.get("0", 1001)).toBeUndefined();
    expect(cache.get("249", 1001)).toBeDefined();
  });
});
