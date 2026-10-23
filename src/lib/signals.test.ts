import { describe, expect, it } from 'vitest';
import { marketChangeMessage } from './signals';
import { alertLabel, checkAlerts, makeAlert } from './alerts';

const next = { asset: { id: 'INDI', symbol: 'INDI', name: 'INDI', assetClass: 'stock' as const }, signal: 'VENTA FUERTE' as const, composite: -65 };
describe('market bias is distinct from a personal exit', () => {
  it('describes a bearish transition without sending a sell instruction', () => {
    const message = marketChangeMessage('COMPRA', next)!;
    expect(message).toContain('sesgo bajista fuerte');
    expect(message).toContain('costo');
    expect(message).not.toMatch(/venta|vender/i);
    expect(marketChangeMessage('VENTA', next)).toBeNull();
    expect(marketChangeMessage(undefined, next)).toBeNull();
    expect(marketChangeMessage('COMPRA', { ...next, historyStale: true })).toBeNull();
  });
  it('keeps saved technical alerts compatible while explaining their market meaning', () => {
    const alert = makeAlert({ assetId: 'INDI', symbol: 'INDI', kind: 'signal_sell' });
    expect(checkAlerts([alert], { INDI: 1.63 }, { INDI: 'VENTA FUERTE' })).toEqual([alert]);
    expect(alertLabel(alert)).toContain('sesgo bajista');
    expect(alertLabel(alert)).not.toMatch(/venta|vender/i);
  });
  it('uses the user price thresholds independently of the technical score', () => {
    const above = makeAlert({ assetId: 'INDI', symbol: 'INDI', kind: 'price_above', price: 2.6 });
    const below = makeAlert({ assetId: 'INDI', symbol: 'INDI', kind: 'price_below', price: 1.5 });
    expect(checkAlerts([above, below], { INDI: 1.63 }, { INDI: 'VENTA FUERTE' })).toEqual([]);
    expect(checkAlerts([above, below], { INDI: 1.49 }, { INDI: 'COMPRA FUERTE' })).toEqual([below]);
    expect(checkAlerts([above, below], { INDI: 2.61 }, { INDI: 'VENTA FUERTE' })).toEqual([above]);
  });
});
