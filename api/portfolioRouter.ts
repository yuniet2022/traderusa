import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, publicQuery } from "./middleware";
import type { TrpcContext } from "./context";
import { getDb } from "./queries/connection";
import { positions, alerts, type BuyLot } from "@db/schema";
import { readSessionCookie } from "./sessionUtil";

function requireUser(ctx: TrpcContext): { uid: number; username: string } {
  const session = readSessionCookie(ctx.req);
  if (!session) throw new TRPCError({ code: "UNAUTHORIZED", message: "Inicia sesión" });
  return { uid: session.uid, username: session.username };
}

const lotSchema = z.object({ quantity: z.number().positive(), price: z.number().positive() });

export const portfolioRouter = createRouter({
  list: publicQuery.query(async ({ ctx }) => {
    const { uid } = requireUser(ctx);
    const db = getDb();
    const rows = await db.query.positions.findMany({ where: eq(positions.userId, uid) });
    return rows.map(r => ({
      assetId: r.assetId,
      symbol: r.symbol,
      assetClass: r.assetClass as "crypto" | "stock",
      lots: r.lots as BuyLot[],
      addedAt: r.addedAt.getTime(),
    }));
  }),

  save: publicQuery
    .input(z.object({
      assetId: z.string().min(1).max(64),
      symbol: z.string().min(1).max(32),
      assetClass: z.enum(["crypto", "stock"]),
      lots: z.array(lotSchema),
    }))
    .mutation(async ({ ctx, input }) => {
      const { uid } = requireUser(ctx);
      const db = getDb();
      const existing = await db.query.positions.findFirst({
        where: and(eq(positions.userId, uid), eq(positions.assetId, input.assetId)),
      });
      if (existing) {
        await db.update(positions).set({ lots: input.lots, symbol: input.symbol, assetClass: input.assetClass })
          .where(eq(positions.id, existing.id));
      } else {
        await db.insert(positions).values({
          userId: uid, assetId: input.assetId, symbol: input.symbol,
          assetClass: input.assetClass, lots: input.lots,
        });
      }
      return { ok: true };
    }),

  remove: publicQuery
    .input(z.object({ assetId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { uid } = requireUser(ctx);
      const db = getDb();
      await db.delete(positions)
        .where(and(eq(positions.userId, uid), eq(positions.assetId, input.assetId)));
      return { ok: true };
    }),
});

export const alertsRouter = createRouter({
  list: publicQuery.query(async ({ ctx }) => {
    const { uid } = requireUser(ctx);
    const db = getDb();
    const rows = await db.query.alerts.findMany({ where: eq(alerts.userId, uid) });
    return rows.map(r => ({
      id: `${r.assetId}:${r.kind}`,
      assetId: r.assetId,
      symbol: r.symbol,
      kind: r.kind,
      price: r.price ?? undefined,
      createdAt: r.createdAt.getTime(),
    }));
  }),

  add: publicQuery
    .input(z.object({
      assetId: z.string().min(1).max(64),
      symbol: z.string().min(1).max(32),
      kind: z.string().min(1).max(32),
      price: z.number().positive().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { uid } = requireUser(ctx);
      const db = getDb();
      const existing = await db.query.alerts.findFirst({
        where: and(eq(alerts.userId, uid), eq(alerts.assetId, input.assetId), eq(alerts.kind, input.kind)),
      });
      if (!existing) {
        await db.insert(alerts).values({
          userId: uid, assetId: input.assetId, symbol: input.symbol, kind: input.kind,
          price: input.price ?? null,
        });
      } else if (input.price !== undefined) {
        await db.update(alerts).set({ price: input.price }).where(eq(alerts.id, existing.id));
      }
      return { ok: true };
    }),

  remove: publicQuery
    .input(z.object({ assetId: z.string().min(1), kind: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { uid } = requireUser(ctx);
      const db = getDb();
      if (input.kind) {
        await db.delete(alerts).where(and(
          eq(alerts.userId, uid), eq(alerts.assetId, input.assetId), eq(alerts.kind, input.kind)));
      } else {
        await db.delete(alerts).where(and(eq(alerts.userId, uid), eq(alerts.assetId, input.assetId)));
      }
      return { ok: true };
    }),
});
