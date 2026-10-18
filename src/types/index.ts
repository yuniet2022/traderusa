export interface Candle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type AssetClass = 'crypto' | 'stock';

export interface Asset {
  id: string;          // coingecko id or stooq symbol
  symbol: string;      // display ticker
  name: string;
  assetClass: AssetClass;
}

export type SignalDirection = 'COMPRA FUERTE' | 'COMPRA' | 'NEUTRAL' | 'VENTA' | 'VENTA FUERTE';

export interface StrategyVote {
  strategyId: string;
  strategyName: string;
  family: 'Tendencia' | 'Momentum' | 'Reversión a la media' | 'Volatilidad';
  score: number;       // -100 .. +100
  signal: SignalDirection;
  reason: string;
}

export interface IndicatorSnapshot {
  rsi14: number;
  macdHist: number;
  macdLine: number;
  macdSignal: number;
  sma20: number;
  sma50: number;
  sma200: number;
  ema12: number;
  ema26: number;
  bbUpper: number;
  bbMid: number;
  bbLower: number;
  pctB: number;
  atr14: number;
  zscore20: number;
  ret1m: number;   // ~21d
  ret3m: number;   // ~63d
  ret6m: number;   // ~126d
  ret12m: number;  // ~252d
  distHigh52w: number; // % below 52w high (negative or 0)
  adxProxy: number;    // trend strength proxy 0-100
  lastPrice: number;
}

export interface TradeLevels {
  bias: 'LARGO' | 'CORTO' | 'ESPERAR';
  entry: number;
  stop: number;
  target1: number;
  target2: number;
  note: string;
}

export interface AssetAnalysis {
  asset: Asset;
  price: number;
  change24h: number | null;
  candles: Candle[];
  indicators: IndicatorSnapshot;
  votes: StrategyVote[];
  composite: number; // -100..+100
  signal: SignalDirection;
  /** 0 normal · 1 extendido · 2 pico vertical (compra vetada) */
  extension: 0 | 1 | 2;
  /** Timing de entrada: 1.0 = buen momento · 0.2 = mal momento · block = compra vetada por extensión */
  timing: { factor: number; note: string; block: boolean };
  levels: TradeLevels;
  regime: 'Tendencia' | 'Rango' | 'Mixto';
  dataSource: 'quote' | 'historical' | 'cached';
  priceSource: string;
  priceAsOf: number | null; // provider timestamp, milliseconds; unknown is not receipt time
  quoteReceivedAt: number | null;
  historyAsOf: number; // timestamp of the latest historical daily bar
  historySource: string;
  historyStale?: boolean;
  updatedAt: number;
}

export interface Quote {
  price: number;
  change24h: number | null;
  source?: string;
  asOf?: number;
  receivedAt?: number;
  cached?: boolean;
}

export interface CandleHistory {
  candles: Candle[];
  source: string;
  cached: boolean;
  /** Provider response receipt time; retained when a cached response is served. */
  fetchedAt?: number;
  /** Last market observation time, only when the provider supplies it. */
  priceAsOf?: number;
  stale?: boolean;
  dailyCloseOnly?: boolean;
}
