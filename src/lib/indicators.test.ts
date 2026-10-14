import { describe, expect, it } from 'vitest';
import { rsi, high52w } from './indicators';

describe('RSI', () => {
  it('is neutral throughout a flat series after warmup', () => {
    const values = rsi(Array(40).fill(100));
    expect(values.slice(0, 14)).toEqual(Array(14).fill(null));
    expect(values.slice(14)).toEqual(Array(26).fill(50));
  });

  it('distinguishes exclusively rising and falling prices from flat prices', () => {
    expect(rsi(Array.from({ length: 30 }, (_, i) => 100 + i)).slice(14)).toEqual(Array(16).fill(100));
    expect(rsi(Array.from({ length: 30 }, (_, i) => 100 - i)).slice(14)).toEqual(Array(16).fill(0));
  });

  it('keeps insufficient history distinct from a computed zero', () => {
    expect(rsi(Array(14).fill(100))).toEqual(Array(14).fill(null));
  });
});

it('uses a full crypto year rather than 252 trading sessions for the annual high', () => {
  const closes = [200, ...Array(300).fill(100)];
  expect(high52w(closes)).toBe(100);
  expect(high52w(closes, 365)).toBe(200);
});
