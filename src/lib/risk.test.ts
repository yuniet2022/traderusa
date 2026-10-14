import { describe, expect, it } from 'vitest';
import { calculatePositionSize, type PositionSizeInput } from './risk';

const input: PositionSizeInput = {
  capital: 10000, riskPercent: 1, entry: 100, stop: 95, target: 110, direction: 'long', fractional: false,
};

describe('position sizing', () => {
  it('sizes a long trade to its risk budget', () => {
    expect(calculatePositionSize(input)).toEqual({ quantity: 20, positionValue: 2000, estimatedLoss: 100, estimatedGain: 200, rewardRisk: 2, riskBudget: 100 });
  });

  it('sizes a short trade with the stop above the entry', () => {
    expect(calculatePositionSize({ ...input, direction: 'short', stop: 105, target: 90 }).quantity).toBe(20);
  });

  it('limits exposure to available capital even with a very close stop', () => {
    const result = calculatePositionSize({ ...input, stop: 99.99 });
    expect(result.quantity).toBe(100);
    expect(result.positionValue).toBeLessThanOrEqual(input.capital);
    expect(result.estimatedLoss).toBeLessThanOrEqual(result.riskBudget);
  });

  it('rounds whole shares down to keep risk below the budget', () => {
    const result = calculatePositionSize({ ...input, stop: 94 });
    expect(result.quantity).toBe(16);
    expect(result.estimatedLoss).toBe(96);
  });

  it('supports fractional units without rounding risk upward', () => {
    const result = calculatePositionSize({ ...input, stop: 94, fractional: true });
    expect(result.quantity).toBeCloseTo(16.66666666, 8);
    expect(result.estimatedLoss).toBeLessThanOrEqual(result.riskBudget);
  });

  it('returns zero when even one whole share exceeds the budget', () => {
    expect(calculatePositionSize({ ...input, capital: 20 }).quantity).toBe(0);
  });

  it.each([
    { capital: 0 }, { capital: Infinity }, { riskPercent: NaN }, { riskPercent: 101 },
    { entry: -1 }, { stop: 100 }, { stop: 101 }, { target: 90 },
  ])('rejects invalid input: %j', override => {
    expect(() => calculatePositionSize({ ...input, ...override })).toThrow();
  });
});
