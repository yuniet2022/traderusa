import type { Asset, AssetAnalysis, CandleHistory, Quote } from '@/types';
import { buildSnapshot, runStrategies, detectRegime, compositeScore, signalFromScore, detectExtension, entryTiming } from './strategies';
import { computeLevels } from './levels';

const timestamp = (value?: number) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;

export function buildAssetAnalysis(asset: Asset, history: CandleHistory, quote?: Quote, now = Date.now()): AssetAnalysis {
  if (history.candles.length < 60) throw new Error('Historial insuficiente para calcular señales.');
  const candles = history.candles.map(c => ({ ...c }));
  const previous = candles[candles.length - 1];
  const historyAsOf = previous.time * 1000;
  const historyPriceAsOf = timestamp(history.priceAsOf);
  const quoteAsOf = timestamp(quote?.asOf);
  const usableQuote = quote && Number.isFinite(quote.price) && quote.price > 0
    && (quoteAsOf === null || quoteAsOf >= Math.max(historyAsOf, historyPriceAsOf ?? 0)) ? quote : undefined;

  if (usableQuote) {
    // A new UTC day starts a provisional bar containing only observed quote prices.
    // Keep prior daily closes intact; unseen intraday OHLC/volume are not reconstructed.
    const day = quoteAsOf === null ? null : Math.floor(quoteAsOf / 86400000) * 86400;
    if (day !== null && day > previous.time) {
      candles.push({ time: day, open: usableQuote.price, high: usableQuote.price, low: usableQuote.price, close: usableQuote.price, volume: 0 });
    } else {
      candles[candles.length - 1] = {
        ...previous, close: usableQuote.price,
        high: Math.max(previous.high, usableQuote.price), low: Math.min(previous.low, usableQuote.price),
      };
    }
  }

  const indicators = buildSnapshot(candles, asset.assetClass === 'crypto' ? 365 : 252);
  const votes = runStrategies(indicators);
  const regime = detectRegime(indicators);
  const raw = compositeScore(votes, regime);
  const extension = detectExtension(indicators);
  const timing = entryTiming(indicators);
  let composite = extension === 2 ? Math.min(raw, 19) : extension === 1 ? Math.min(raw, 45) : raw;
  if (composite > 0) composite *= timing.factor;
  if (timing.block && composite > 0) composite = Math.min(composite, 19);
  const n = candles.length;
  const derivedChange = candles[n - 2].close > 0 ? (candles[n - 1].close / candles[n - 2].close - 1) * 100 : null;
  return {
    asset, candles, indicators, votes, regime, composite, extension, timing,
    price: indicators.lastPrice,
    change24h: usableQuote?.change24h !== null && Number.isFinite(usableQuote?.change24h)
      ? usableQuote!.change24h : derivedChange,
    signal: signalFromScore(composite), levels: computeLevels(indicators, composite),
    dataSource: usableQuote ? (usableQuote.cached ? 'cached' : 'quote') : (history.cached ? 'cached' : 'historical'),
    priceSource: usableQuote?.source ?? history.source,
    priceKind: usableQuote ? 'quote' : 'historical',
    priceAsOf: usableQuote ? quoteAsOf : historyPriceAsOf,
    quoteReceivedAt: usableQuote ? timestamp(usableQuote.receivedAt) : null,
    historyAsOf, historyFetchedAt: timestamp(history.fetchedAt), historySource: history.source, historyStale: history.stale ?? false,
    updatedAt: now,
  };
}

export function repriceAnalysis(analysis: AssetAnalysis, quote: Quote | undefined, now = Date.now()): AssetAnalysis {
  if (!quote || !Number.isFinite(quote.price) || quote.price <= 0) return analysis;
  const asOf = timestamp(quote.asOf);
  if (asOf !== null && asOf < (analysis.priceAsOf ?? analysis.historyAsOf)) return analysis;
  if (quote.receivedAt && analysis.quoteReceivedAt && quote.receivedAt < analysis.quoteReceivedAt) return analysis;
  const next = buildAssetAnalysis(analysis.asset, { candles: analysis.candles, source: analysis.historySource, cached: analysis.dataSource === 'cached', stale: analysis.historyStale,
    fetchedAt: analysis.historyFetchedAt ?? undefined }, quote, now);
  return { ...next, historyAsOf: analysis.historyAsOf };
}
