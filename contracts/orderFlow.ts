export interface TradeFlow {
  source: 'Kraken';
  market: string;
  trades: number;
  buyNotional: number;
  sellNotional: number;
  buyShare: number;
  firstTradeAt: number;
  lastTradeAt: number;
  fetchedAt: number;
  cached: boolean;
  stale: boolean;
}
