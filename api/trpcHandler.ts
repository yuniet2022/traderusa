import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from './router';
import { createContext } from './context';

export function handleTrpcRequest(req: Request) {
  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext,
    onError({ error, path }) {
      if (error.code !== 'INTERNAL_SERVER_ERROR') return;
      let cause: unknown = error;
      let code = 'UNKNOWN';
      for (let depth = 0; depth < 8 && cause && typeof cause === 'object'; depth++) {
        const current = cause as { code?: unknown; cause?: unknown };
        if (typeof current.code === 'string' && /^[A-Z][A-Z0-9_]{1,63}$/.test(current.code)) code = current.code;
        cause = current.cause;
      }
      // Never log the exception message: database errors can contain SQL and passwords.
      console.error('[API_ERROR]', JSON.stringify({
        procedure: path && /^[a-zA-Z0-9_.]{1,100}$/.test(path) ? path : 'unknown',
        code,
      }));
    },
  });
}
