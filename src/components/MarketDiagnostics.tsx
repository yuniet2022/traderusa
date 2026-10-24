import { trpc } from '@/providers/trpc';
import { Button } from './ui/button';
import { toast } from 'sonner';

const explanations: Record<string, string> = {
  REQUEST_TIMEOUT: 'La petición agotó 6 segundos sin recibir cabeceras.',
  ENOTFOUND: 'No se pudo resolver el dominio.', EAI_AGAIN: 'Fallo temporal al resolver el dominio.',
  ENETUNREACH: 'Red de destino inaccesible.', EHOSTUNREACH: 'Servidor de destino inaccesible.',
  UND_ERR_CONNECT_TIMEOUT: 'La conexión no se completó a tiempo.',
  HTTP_451: 'Acceso restringido por el proveedor.', HTTP_403: 'El proveedor rechazó el acceso.',
  HTTP_429: 'El proveedor limitó las consultas.',
};
export function MarketDiagnostics() {
  const report = trpc.admin.marketDiagnostics.useQuery(undefined, { enabled: false, retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false });
  return <section className="mt-4 rounded-lg border border-indigo-900 bg-indigo-950/20 p-3 space-y-2" aria-label="Diagnóstico de fuentes de mercado">
    <h3 className="text-sm font-semibold">Conexión con las fuentes de mercado</h3>
    <p className="text-xs text-zinc-400">Esta prueba consulta desde el servidor donde está desplegada la app, sin depender de tu computadora. Comprueba respuestas HTTP; no valida todavía las cotizaciones.</p>
    <Button size="sm" className="min-h-10 h-auto max-w-full whitespace-normal" disabled={report.isFetching} onClick={() => { void report.refetch(); }}>{report.isFetching ? 'Comprobando fuentes…' : 'Diagnosticar fuentes'}</Button>
    {report.error && <p role="alert" className="text-xs text-red-300">No se pudo ejecutar el diagnóstico: {report.error.message}</p>}
    {report.data && <>
      <p className="text-[11px] text-zinc-400">Prueba: {new Date(report.data.checkedAt).toLocaleString('es')}{report.data.commit ? ` · Versión ${report.data.commit}` : ''}. Se reutiliza durante un minuto.</p>
      <div className="space-y-2" role="status">
        {report.data.results.map(result => <div key={result.source} className="min-w-0 rounded-md border border-zinc-800 p-2 text-xs">
          <p className="break-all text-zinc-200">{result.source}</p>
          <p className={result.ok ? 'text-emerald-300' : 'text-amber-300'}>{result.code} · {result.elapsedMs} ms</p>
          <p className="mt-1 text-zinc-400">{explanations[result.code] ?? (result.ok ? 'Se recibió una respuesta HTTP correcta.' : 'Conserva este código para investigar la conexión.')}</p>
        </div>)}
      </div>
      <Button variant="outline" size="sm" className="min-h-10" onClick={() => {
        navigator.clipboard?.writeText(JSON.stringify(report.data, null, 2)).then(() => toast.success('Diagnóstico copiado'), () => toast.error('No se pudo copiar; puedes seleccionar los códigos.'));
      }}>Copiar diagnóstico</Button>
    </>}
  </section>;
}
