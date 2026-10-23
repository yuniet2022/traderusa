import type { SignalDirection } from '@/types';

export type AlertKind = 'price_above' | 'price_below' | 'signal_buy' | 'signal_sell';

export interface AlertRule {
  id: string;
  assetId: string;
  symbol: string;
  kind: AlertKind;
  price?: number;
  createdAt: number;
  triggered: boolean;
}

const KEY = 'tr_alerts_v1';

export function loadAlerts(): AlertRule[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as AlertRule[];
  } catch { return []; }
}

export function saveAlerts(alerts: AlertRule[]) {
  try { localStorage.setItem(KEY, JSON.stringify(alerts)); } catch { /* ignore */ }
}

export function makeAlert(partial: Omit<AlertRule, 'id' | 'createdAt' | 'triggered'>): AlertRule {
  return { ...partial, id: Math.random().toString(36).slice(2, 10), createdAt: Date.now(), triggered: false };
}

const BUY_SIGNALS: SignalDirection[] = ['COMPRA', 'COMPRA FUERTE'];
const SELL_SIGNALS: SignalDirection[] = ['VENTA', 'VENTA FUERTE'];

/** Devuelve las alertas disparadas y las marca. */
export function checkAlerts(
  alerts: AlertRule[],
  prices: Record<string, number>,
  signals: Record<string, SignalDirection>,
): AlertRule[] {
  const fired: AlertRule[] = [];
  for (const a of alerts) {
    if (a.triggered) continue;
    const price = prices[a.assetId];
    const signal = signals[a.assetId];
    let hit = false;
    if (a.kind === 'price_above' && price !== undefined && a.price !== undefined && price >= a.price) hit = true;
    if (a.kind === 'price_below' && price !== undefined && a.price !== undefined && price <= a.price) hit = true;
    if (a.kind === 'signal_buy' && signal && BUY_SIGNALS.includes(signal)) hit = true;
    if (a.kind === 'signal_sell' && signal && SELL_SIGNALS.includes(signal)) hit = true;
    if (hit) { a.triggered = true; fired.push(a); }
  }
  return fired;
}

export function alertLabel(a: AlertRule): string {
  switch (a.kind) {
    case 'price_above': return `${a.symbol} suba a $${a.price}`;
    case 'price_below': return `${a.symbol} baje a $${a.price}`;
    case 'signal_buy': return `sesgo alcista en ${a.symbol} (lectura técnica)`;
    case 'signal_sell': return `sesgo bajista en ${a.symbol} (lectura técnica)`;
  }
}

export async function ensureNotifyPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'default') {
    return (await Notification.requestPermission()) === 'granted';
  }
  return false;
}

export function fireNotification(title: string, body: string) {
  if ('Notification' in window && Notification.permission === 'granted') {
    try { new Notification(title, { body }); } catch { /* ignore */ }
  }
}
