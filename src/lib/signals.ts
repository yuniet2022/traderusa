import type { AssetAnalysis, SignalDirection } from '@/types';

const labels: Record<SignalDirection, string> = {
  'COMPRA FUERTE': 'SESGO ALCISTA FUERTE',
  COMPRA: 'SESGO ALCISTA',
  NEUTRAL: 'NEUTRAL',
  VENTA: 'SESGO BAJISTA',
  'VENTA FUERTE': 'SESGO BAJISTA FUERTE',
};

export function marketSignalLabel(signal: SignalDirection): string { return labels[signal]; }

export function marketChangeMessage(previous: SignalDirection | undefined, next: Pick<AssetAnalysis, 'asset' | 'signal' | 'composite' | 'historyStale'>): string | null {
  if (!previous || previous === next.signal || next.historyStale) return null;
  const family = (signal: SignalDirection) => signal.startsWith('COMPRA') ? 'up' : signal.startsWith('VENTA') ? 'down' : 'neutral';
  if (family(previous) === family(next.signal)) return null;
  return `${next.asset.symbol}: ${marketSignalLabel(next.signal).toLocaleLowerCase('es')} (puntuación ${next.composite.toFixed(0)}). Lectura del mercado; revisa tu costo y tus umbrales de riesgo.`;
}
