import { describe, expect, it } from 'vitest';
import { calculatePositionSize, type PositionSizeInput } from './risk';

const input: PositionSizeInput = {
  capital: 10000, riskPercent: 1, entry: 100, stop: 95, target: 110, direction: 'long', fractional: false,
};

describe('position sizing', () => {
  it('sizes a long trade to its risk budget', () => {
    expect(calculatePositionSize(input)).toMatchObject({ quantity: 20, positionValue: 2000, estimatedLoss: 100, estimatedGain: 200, rewardRisk: 2, riskBudget: 100, totalTargetCosts: 0, capitalUsed: 2000 });
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

  it('includes costs on both sides when sizing and calculating long results', () => {
    const result = calculatePositionSize({ ...input, feePercent: 0.1, fixedFee: 1, slippagePercent: 0.1 });
    expect(result.quantity).toBe(18);
    expect(result.entryFill).toBeCloseTo(100.1);
    expect(result.stopFill).toBeCloseTo(94.905);
    expect(result.targetFill).toBeCloseTo(109.89);
    expect(result.capitalUsed).toBeCloseTo(1804.6018);
    expect(result.estimatedLoss).toBeCloseTo(99.02009);
    expect(result.estimatedGain).toBeCloseTo(170.44018);
    expect(result.totalTargetCosts).toBeCloseTo(9.55982);
    expect(result.estimatedLoss).toBeLessThanOrEqual(result.riskBudget);
  });

  it('models adverse fills in the opposite direction for a short', () => {
    const result = calculatePositionSize({ ...input, direction: 'short', stop: 105, target: 90, feePercent: 0.1, fixedFee: 1, slippagePercent: 0.1 });
    expect(result.quantity).toBe(18);
    expect(result.entryFill).toBeCloseTo(99.9);
    expect(result.stopFill).toBeCloseTo(105.105);
    expect(result.targetFill).toBeCloseTo(90.09);
    expect(result.estimatedLoss).toBeCloseTo(99.38009);
    expect(result.estimatedGain).toBeCloseTo(171.16018);
  });

  it('reserves entry fees as part of available capital', () => {
    const result = calculatePositionSize({ ...input, capital: 100, riskPercent: 100, stop: 99.9, feePercent: 1, fixedFee: 1, fractional: true });
    expect(result.capitalUsed).toBeLessThanOrEqual(100);
    expect(result.quantity).toBeLessThan(1);
  });

  it('does not charge fees when the risk budget cannot fund an operation', () => {
    const result = calculatePositionSize({ ...input, capital: 100, riskPercent: 1, fixedFee: 1, fractional: true });
    expect(result).toMatchObject({ quantity: 0, capitalUsed: 0, estimatedLoss: 0, estimatedGain: 0, totalTargetCosts: 0, breakEvenWinRate: null });
  });

  it('shows a negative result when a small target cannot cover execution costs', () => {
    const result = calculatePositionSize({ ...input, target: 100.01, feePercent: 0.1, fixedFee: 1, slippagePercent: 0.1 });
    expect(result.quantity).toBeGreaterThan(0);
    expect(result.estimatedGain).toBeLessThan(0);
    expect(result.breakEvenWinRate).toBeNull();
  });

  it('calculates a break-even threshold without presenting it as a measured win rate', () => {
    const noCosts = calculatePositionSize({ ...input, target: 105 });
    const costs = calculatePositionSize({ ...input, target: 105, feePercent: 0.1 });
    expect(noCosts.breakEvenWinRate).toBe(50);
    expect(costs.breakEvenWinRate).toBeGreaterThan(50);
    expect(costs.rewardRisk).toBeLessThan(1);
  });

  it.each([
    { capital: 0 }, { capital: Infinity }, { riskPercent: NaN }, { riskPercent: 101 },
    { entry: -1 }, { stop: 100 }, { stop: 101 }, { target: 90 },
    { feePercent: -1 }, { feePercent: 100 }, { fixedFee: -1 }, { fixedFee: NaN },
    { slippagePercent: -1 }, { slippagePercent: 100 },
  ])('rejects invalid input: %j', override => {
    expect(() => calculatePositionSize({ ...input, ...override })).toThrow();
  });
});
