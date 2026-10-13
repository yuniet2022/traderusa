import { createRouter, publicQuery } from "./middleware";
import { authRouter } from "./authRouter";
import { portfolioRouter, alertsRouter } from "./portfolioRouter";
import { adminRouter } from "./adminRouter";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  portfolio: portfolioRouter,
  alerts: alertsRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
