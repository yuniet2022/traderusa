/** Prices come from our authenticated API; the browser does not use public CORS proxies. */
export class MarketRequestError extends Error {
  readonly status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}
export async function marketJSON<T>(path: 'history' | 'quotes' | 'search', query: Record<string, string>, signal?: AbortSignal): Promise<T> {
  signal?.throwIfAborted();
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(), path === 'search' ? 12_000 : 15_000);
  try {
    const response = await fetch(`/api/market/${path}?${new URLSearchParams(query)}`, { credentials: 'same-origin', signal: controller.signal });
    if (!response.ok) throw new MarketRequestError(response.status === 401 ? 'Inicia sesión para consultar el mercado.' : 'Datos de mercado no disponibles temporalmente.', response.status);
    return await response.json() as T;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
