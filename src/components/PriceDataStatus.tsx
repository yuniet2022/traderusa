import type { AssetAnalysis } from '@/types';

export function PriceDataStatus({ analysis }: { analysis: AssetAnalysis }) {
  const isQuote = analysis.priceKind === 'quote' || (!analysis.priceKind && analysis.quoteReceivedAt !== null);
  const state = isQuote ? 'Cotización' : 'Histórico diario';
  const consultedAt = isQuote ? analysis.quoteReceivedAt : analysis.historyFetchedAt;
  const format = (time: number) => new Date(time).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' });
  // Older analysis objects used the bar start as priceAsOf. Never label that as a trade.
  const providerTime = analysis.priceKind || isQuote ? analysis.priceAsOf : null;
  return <div className="min-w-0 text-[11px] leading-relaxed font-sans font-normal text-zinc-400">
    <span className="block">{state}{analysis.dataSource === 'cached' ? ' · Caché' : ''} · {analysis.priceSource}</span>
    <details className="whitespace-normal" onClick={event => event.stopPropagation()}>
      <summary className="cursor-pointer rounded text-zinc-400 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
        {consultedAt ? `Consulta a fuente: ${format(consultedAt)}` : 'Ver fechas · consulta no informada'}
      </summary>
      <div className="mt-1 space-y-0.5 text-left text-zinc-300">
        <p>{providerTime ? `Hora del precio informada por el proveedor: ${format(providerTime)}` : 'El proveedor no informa la hora del precio.'}</p>
        <p>Inicio de vela diaria: {format(analysis.historyAsOf)}</p>
        {!consultedAt && <p>Hora de consulta a la fuente no disponible.</p>}
        <p className="text-zinc-400">Horas en {Intl.DateTimeFormat().resolvedOptions().timeZone}. Consultar la fuente no garantiza una operación reciente.</p>
      </div>
    </details>
    {analysis.historyStale && <span className="block text-amber-300">Señal con historial anterior; pendiente de actualizar.</span>}
  </div>;
}
