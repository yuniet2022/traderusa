import type { AssetAnalysis } from '@/types';

export function PriceDataStatus({ analysis }: { analysis: AssetAnalysis }) {
  const state = analysis.dataSource === 'quote' ? 'Cotización' : analysis.dataSource === 'cached' ? 'Caché' : 'Histórico';
  const time = analysis.priceAsOf === null ? 'hora del proveedor no disponible'
    : new Date(analysis.priceAsOf).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' });
  return <span className="block text-[10px] font-normal text-zinc-500" title={`Consulta local: ${new Date(analysis.quoteReceivedAt ?? analysis.updatedAt).toLocaleString('es')}`}>
    {state} · {analysis.priceSource} · {time}
  </span>;
}
