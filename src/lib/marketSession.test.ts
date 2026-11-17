import { describe, expect, it } from "vitest";
import {
  marketSession,
  nextRegularSession,
  sessionPresentation,
} from "./marketSession";

describe("regular-session presentation and next opening", () => {
  it("identifies a normal close without presenting it as a data outage", () => {
    const now = Date.UTC(2026, 10, 17, 22, 31);
    const view = sessionPresentation("stock", now);
    expect(view.paused).toBe(true);
    expect(view.title).toBe("Sesión regular finalizada");
    expect(view.schedule).toContain("09:30–16:00");
    expect(nextRegularSession(now)?.open).toBe(Date.UTC(2026, 10, 18, 14, 30));
    expect(view.nextOpening).toContain("18/11/2026");
    expect(view.nextOpening).toContain("09:30");
    expect(view.nextOpening).toContain("Nueva York");
  });
  it("points premarket to today and waits for regular open to resume", () => {
    const before = Date.UTC(2026, 10, 17, 14, 29, 59);
    expect(sessionPresentation("stock", before).title).toContain(
      "Antes de la apertura"
    );
    expect(nextRegularSession(before)?.open).toBe(
      Date.UTC(2026, 10, 17, 14, 30)
    );
    expect(sessionPresentation("stock", before + 1000).paused).toBe(false);
  });
  it("skips Thanksgiving and reports the early-close session correctly", () => {
    const after = Date.UTC(2026, 10, 25, 22);
    expect(nextRegularSession(after)?.open).toBe(
      Date.UTC(2026, 10, 27, 14, 30)
    );
    const shortDay = sessionPresentation(
      "stock",
      Date.UTC(2026, 10, 27, 18, 1)
    );
    expect(shortDay.paused).toBe(true);
    expect(shortDay.schedule).toContain("13:00");
    expect(nextRegularSession(Date.UTC(2026, 10, 27, 18, 1))?.key).toBe(
      "2026-11-30"
    );
  });
  it("resolves a weekend crossing the DST boundary in New York", () => {
    const after = Date.UTC(2026, 9, 30, 21);
    expect(nextRegularSession(after)?.open).toBe(Date.UTC(2026, 10, 2, 14, 30));
    expect(marketSession("stock", after).close).toBe(Date.UTC(2026, 9, 30, 20));
  });
  it("does not apply the stock pause to weekend crypto or invent unsupported dates", () => {
    expect(
      sessionPresentation("crypto", Date.UTC(2026, 10, 21, 22)).paused
    ).toBe(false);
    expect(
      sessionPresentation("crypto", Date.UTC(2026, 10, 21, 22)).nextOpening
    ).toBeNull();
    expect(nextRegularSession(Date.UTC(2035, 0, 2, 12))).toBeNull();
    expect(
      sessionPresentation("stock", Date.UTC(2035, 0, 2, 12)).title
    ).toContain("fuera de cobertura");
  });
});
