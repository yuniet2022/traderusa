import { describe, expect, it } from 'vitest';
import { horizonContext } from './horizonContext';
import type { Candle } from '@/types';

const make = (rising = true, count = 300): Candle[] => Array.from({length:count},(_,i) => {
  const close = rising ? 100+i*0.2 : 200-i*0.2;
  return {time:Date.UTC(2025,0,i+1)/1000,open:close,high:close+1,low:close-1,close,volume:1000};
});
const now = Date.UTC(2026,9,23,21);
describe('day, month and quarter have distinct meanings', () => {
  it('recognizes a possible daily pause while month, quarter and price structure remain positive', () => {
    const rows=make();
    const result=horizonContext(rows,'stock',rows.at(-1)!.close,-2.98,now);
    expect(result.month).toBeGreaterThan(0);expect(result.quarter).toBeGreaterThan(0);
    expect(result.context).toContain('Posible pausa');
    expect(result.structureHeld).toBe(true);
  });
  it('does not call every red day a normal pause when price structure has deteriorated', () => {
    expect(horizonContext(make(),'stock',80,-2.98,now).context).toContain('deterioro');
  });
  it('distinguishes a green daily bounce from a sustained recovery in a declining history', () => {
    const rows=make(false);
    expect(horizonContext(rows,'stock',rows.at(-1)!.close,3,now).context).toContain('rebote');
  });
  it('uses trading-session horizons for equities and calendar-day horizons for crypto', () => {
    const stock=horizonContext(make(),'stock',159.8,0,now),crypto=horizonContext(make(),'crypto',159.8,0,now);
    expect([stock.monthBars,stock.quarterBars]).toEqual([21,63]);
    expect([crypto.monthBars,crypto.quarterBars]).toEqual([30,90]);
    expect(stock.month).not.toBe(crypto.month);
  });
  it('keeps a missing quarter unknown rather than extrapolating a shorter history', () => {
    expect(horizonContext(make(true,60),'stock',112,-1,now).quarter).toBeNull();
  });
});
