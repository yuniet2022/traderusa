import { describe, expect, it } from 'vitest';
import type { Candle } from '@/types';
import { analyzeMarketEvidence } from './marketEvidence';

const start = Date.UTC(2026, 9, 19, 12)/1000;
const make = (count = 420): Candle[] => Array.from({ length: count }, (_, i) => {
  const close = 100 + Math.sin(i/8)*2 + i*0.01;
  return { time: start+i*300, open: close-0.2, high: close+0.4, low: close-0.5, close, volume: 1000 };
});
const read = (rows: Candle[]) => analyzeMarketEvidence(rows, 300, (rows.at(-1)!.time+300)*1000)!;

describe('closed-candle market evidence and historical cases', () => {
  it('ignores incomplete and future candles even if they contain huge price and volume moves', () => {
    const rows = make(100), now = (rows.at(-1)!.time+300)*1000;
    const base = analyzeMarketEvidence(rows, 300, now)!;
    const future = [...rows, { time: now/1000, open: 1000, high: 1200, low: 900, close: 1150, volume: 1e9 }];
    const result = analyzeMarketEvidence(future, 300, now+100000)!;
    expect(result.current).toEqual(base.current);
    expect(result.models).toEqual(base.models);
    expect(result.analogs).toEqual(base.analogs);
    expect(result.omittedOpenBars).toBe(1);
  });
  it('does not call OHLC pressure executed buy volume or fabricate volume confirmation', () => {
    const rows = make().map(c => ({ ...c, volume: 0 }));
    const result = read(rows);
    expect(result.current.pressure).toBeNull();
    expect(result.current.rvol).toBeNull();
    expect(result.models.find(m => m.name === 'Participación estimada')?.direction).toBe('mixed');
  });
  it('detects a price-volume breakout as an early scenario rather than requiring a long-term uptrend', () => {
    const rows = make(100).map((c, i) => ({ ...c, open: 100+Math.sin(i)*0.1, close: 100+Math.sin(i)*0.1, high: 100.3, low: 99.7 }));
    const last = rows.at(-1)!;
    rows[rows.length-1] = { ...last, open: 100, high: 102.1, low: 99.9, close: 102, volume: 2500 };
    const result = read(rows);
    expect(result.phase).toBe('early');
    expect(result.current.rvol).toBe(2.5);
    expect(result.current.pressure).toBeGreaterThan(0);
  });
  it('flags exhaustion after a rise with rejection and deteriorating momentum', () => {
    const rows = make(100).map((c, i) => ({ ...c, open: 100+i*0.3, close: 100+i*0.3+0.2, high: 100+i*0.3+0.4, low: 100+i*0.3-0.2 }));
    for (let i=97;i<100;i++) rows[i] = { ...rows[i], open: 129, high: 133, low: 127.5, close: 128.5-(i-97)*0.1, volume: 2000 };
    expect(read(rows).phase).toBe('exhaustion');
  });
  it('leaves empirical expectations unknown without enough comparable historical outcomes', () => {
    const result = read(make(60));
    expect(result.analogs.count).toBe(0);
    expect(result.analogs.medianReturn).toBeNull();
    expect(analyzeMarketEvidence(make(59), 300, Infinity)).toBeNull();
  });
  it('computes empirical summaries only from prior, separate outcome windows', () => {
    const result = read(make());
    expect(result.analogs.count).toBeGreaterThanOrEqual(8);
    expect(result.analogs.up+result.analogs.down+result.analogs.flat).toBe(result.analogs.count);
    expect(result.analogs.lowerReturn).toBeLessThanOrEqual(result.analogs.medianReturn!);
    expect(result.analogs.medianReturn).toBeLessThanOrEqual(result.analogs.upperReturn!);
    // Outcomes more recent than the 20-bar embargo cannot change the historical sample.
    const rows = make();
    const modified = rows.map((c, i) => i>=rows.length-15 && i<rows.length-10 ? { ...c, volume: c.volume*5 } : c);
    expect(read(modified).analogs).toEqual(result.analogs);
  });
  it('closes US daily candles at 16:00 New York, including UTC-midnight Stooq dates', () => {
    const rows = make(70).map((c, i) => ({ ...c, time: Date.UTC(2026, 7, 15+i)/1000 }));
    const lastDate = new Date(rows.at(-1)!.time*1000);
    const close = Date.UTC(lastDate.getUTCFullYear(), lastDate.getUTCMonth(), lastDate.getUTCDate(), 20);
    const before = analyzeMarketEvidence(rows, 86400, close-1, 'stock')!;
    const after = analyzeMarketEvidence(rows, 86400, close+1, 'stock')!;
    expect(after.closedBars).toBe(before.closedBars+1);
    expect(after.lastClosedAt).toBe(close);
  });
});
