export interface BuyLot {
  quantity: number;
  price: number;
}

export interface Position {
  assetId: string;
  symbol: string;
  assetClass: 'crypto' | 'stock';
  lots: BuyLot[];           // cada compra con su cantidad y precio
  addedAt: number;
}

const KEY = 'tr_portfolio_v2';

export function loadPortfolio(): Position[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Position[];
  } catch { /* ignore */ }
  // migrar desde v1 (quantity/buyPrice sueltos)
  try {
    const old = JSON.parse(localStorage.getItem('tr_portfolio_v1') ?? '[]') as { assetId: string; symbol: string; assetClass: 'crypto' | 'stock'; quantity: number; buyPrice: number }[];
    return old.map(o => ({
      assetId: o.assetId, symbol: o.symbol, assetClass: o.assetClass,
      lots: o.quantity > 0 && o.buyPrice > 0 ? [{ quantity: o.quantity, price: o.buyPrice }] : [],
      addedAt: Date.now(),
    }));
  } catch { return []; }
}

export function savePortfolio(p: Position[]) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

export function makePosition(partial: Omit<Position, 'addedAt'>): Position {
  return { ...partial, addedAt: Date.now() };
}

/** Precio promedio ponderado de todas las compras */
export function avgBuyPrice(lots: BuyLot[]): number {
  const totalQty = lots.reduce((s, l) => s + l.quantity, 0);
  if (totalQty === 0) return 0;
  return lots.reduce((s, l) => s + l.quantity * l.price, 0) / totalQty;
}

export function totalQuantity(lots: BuyLot[]): number {
  return lots.reduce((s, l) => s + l.quantity, 0);
}
