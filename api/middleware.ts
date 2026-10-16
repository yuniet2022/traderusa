import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { env } from './lib/env';

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    if (env.isProduction && error.code === 'INTERNAL_SERVER_ERROR') {
      return {
        ...shape,
        message: 'No se pudo completar la operación. Inténtalo de nuevo más tarde.',
        data: { ...shape.data, stack: undefined },
      };
    }
    return shape;
  },
});

export const createRouter = t.router;
export const publicQuery = t.procedure;
