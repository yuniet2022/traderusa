import { describe, expect, it } from 'vitest';
import { positionMetrics } from './positionContext';

describe('actual long position context', () => {
  it('shows a loss at the quoted price rather than treating a bearish target as a profitable exit', () => {
    const metrics = positionMetrics({ lots: [{ quantity: 89, price: 2.43 }] }, 1.63)!;
    expect(metrics.value).toBeCloseTo(145.07);
    expect(metrics.invested).toBeCloseTo(216.27);
    expect(metrics.pnl).toBeCloseTo(-71.20);
    expect(metrics.recoveryPercent).toBeCloseTo(49.07975);
    expect(positionMetrics({ lots: [{ quantity: 89, price: 2.43 }] }, 1.40)!.pnl).toBeLessThan(metrics.pnl!);
  });
  it('uses the full recorded cost rather than a displayed rounded average', () => {
    const metrics = positionMetrics({ lots: [{ quantity: 89, price: 216.04 / 89 }] }, 1.63)!;
    expect(metrics.pnl).toBeCloseTo(-70.97);
  });
  it('weights multiple lots and measures the return from invested capital', () => {
    const metrics = positionMetrics({ lots: [{ quantity: 10, price: 3 }, { quantity: 20, price: 1.5 }] }, 2.5)!;
    expect(metrics).toMatchObject({ quantity: 30, invested: 60, average: 2, value: 75, pnl: 15, pnlPercent: 25, recoveryPercent: null });
  });
  it('does not invent zero profit or a zero current value when prices are missing', () => {
    for (const price of [undefined, null, 0, -1, NaN, Infinity]) {
      expect(positionMetrics({ lots: [{ quantity: 2, price: 3 }] }, price)).toMatchObject({ average: 3, invested: 6, value: null, pnl: null, pnlPercent: null });
    }
  });
  it('keeps result unknown until every purchase has a valid quantity and cost', () => {
    expect(positionMetrics({ lots: [] }, 100)).toBeNull();
    for (const lot of [{ quantity: 0, price: 2 }, { quantity: 2, price: 0 }, { quantity: -1, price: 2 }, { quantity: NaN, price: 2 }, { quantity: 1, price: Infinity }]) {
      expect(positionMetrics({ lots: [{ quantity: 1, price: 3 }, lot] }, 100)).toBeNull();
    }
  });
  it('supports fractional crypto positions and exact break-even without an unnecessary recovery target', () => {
    expect(positionMetrics({ lots: [{ quantity: 0.125, price: 80000 }] }, 80000)).toMatchObject({ invested: 10000, value: 10000, pnl: 0, pnlPercent: 0, recoveryPercent: null });
  });
});
