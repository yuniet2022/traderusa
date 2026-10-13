import type { IndicatorSnapshot } from '@/types';

export interface TradeLevels {
  bias: 'LARGO' | 'CORTO' | 'ESPERAR';
  entry: number;
  stop: number;
  target1: number;
  target2: number;
  note: string;
}

const r = (v: number) => {
  if (v >= 1000) return Math.round(v);
  if (v >= 100) return Math.round(v * 10) / 10;
  if (v >= 1) return Math.round(v * 100) / 100;
  return parseFloat(v.toPrecision(3));
};

/** Niveles de trading derivados del ATR (volatilidad) y la señal compuesta */
export function computeLevels(s: IndicatorSnapshot, composite: number): TradeLevels {
  const atr = s.atr14 > 0 ? s.atr14 : s.lastPrice * 0.02;
  const p = s.lastPrice;

  if (composite >= 20) {
    return {
      bias: 'LARGO',
      entry: r(p),
      stop: r(p - 2 * atr),
      target1: r(p + 2 * atr),
      target2: r(p + 3 * atr),
      note: 'Entrada al precio actual o en pullback hacia la SMA20. Stop 2×ATR bajo la entrada; si toca el objetivo 1, sube el stop al precio de entrada.',
    };
  }
  if (composite <= -20) {
    return {
      bias: 'CORTO',
      entry: r(p),
      stop: r(p + 2 * atr),
      target1: r(p - 2 * atr),
      target2: r(p - 3 * atr),
      note: 'Señal de venta: si tienes posición, es nivel de salida. Los niveles aplican para una posición corta (stop 2×ATR sobre la entrada).',
    };
  }
  return {
    bias: 'ESPERAR',
    entry: r(p),
    stop: r(p - 1.5 * atr),
    target1: r(p + 1.5 * atr),
    target2: r(p + 2.5 * atr),
    note: 'Sin señal clara (puntuación entre -20 y +20). Lo disciplinado es esperar a que aparezca una señal de COMPRA o VENTA.',
  };
}
