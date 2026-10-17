import type { Asset } from '@/types';

/** Limit both concurrency and total scan time; each result is delivered immediately. */
export async function scanMarket<T>(assets: Asset[], analyze: (asset: Asset, signal: AbortSignal) => Promise<T | null>, options: {
  signal: AbortSignal;
  onResult: (result: T) => void;
  onProgress: (completed: number) => void;
  timeoutMs?: number;
}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal.addEventListener('abort', abort, { once: true });
  if (options.signal.aborted) controller.abort();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, options.timeoutMs ?? 45_000);
  let index = 0; let completed = 0; let succeeded = 0;
  async function worker() {
    while (!controller.signal.aborted && index < assets.length) {
      const asset = assets[index++];
      try {
        const result = await new Promise<T | null>((resolve, reject) => {
          const cancel = () => reject(new DOMException('Scan cancelled', 'AbortError'));
          controller.signal.addEventListener('abort', cancel, { once: true });
          Promise.resolve().then(() => analyze(asset, controller.signal)).then(resolve, reject).finally(() => controller.signal.removeEventListener('abort', cancel));
        });
        if (controller.signal.aborted) return;
        if (result) { options.onResult(result); succeeded++; }
      } catch { /* A failed asset must not hold up the other workers. */ }
      if (!controller.signal.aborted) options.onProgress(++completed);
    }
  }
  try { await Promise.all(Array.from({ length: Math.min(4, assets.length) }, worker)); }
  finally { clearTimeout(timer); options.signal.removeEventListener('abort', abort); }
  return { succeeded, failed: assets.length - succeeded, timedOut };
}
