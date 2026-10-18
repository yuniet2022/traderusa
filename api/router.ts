import { createRouter, publicQuery } from "./middleware";
import { authRouter } from "./authRouter";
import { portfolioRouter, alertsRouter } from "./portfolioRouter";
import { adminRouter } from "./adminRouter";
import { paperRouter } from './paperRouter';

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  portfolio: portfolioRouter,
  alerts: alertsRouter,
  admin: adminRouter,
  paper: paperRouter,
});

export type AppRouter = typeof appRouter;
