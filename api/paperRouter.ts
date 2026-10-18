import { z } from "zod";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { paperAccounts, paperTrades, users } from "@db/schema";
import { planSchema, settleLong } from "@contracts/trading";
import { calculatePositionSize } from "../src/lib/risk";
import { createRouter, publicQuery } from "./middleware";
import { readSessionCookie } from "./sessionUtil";
import { getDb } from "./queries/connection";
import type { TrpcContext } from "./context";

type Transaction = Parameters<
  Parameters<ReturnType<typeof getDb>["transaction"]>[0]
>[0];
async function activeUser(ctx: TrpcContext, tx?: Transaction) {
  const session = readSessionCookie(ctx.req);
  if (!session)
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Inicia sesión." });
  const db = tx ?? getDb();
  const query = db
    .select()
    .from(users)
    .where(eq(users.id, session.uid))
    .limit(1);
  // Serialize all account mutations on the user's existing row, including first initialization.
  const [user] = tx ? await query.for("update") : await query;
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED" });
  if (user.expiresAt && user.expiresAt.getTime() <= Date.now())
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Tu suscripción venció.",
    });
  return user.id;
}
async function balance(
  db: Transaction | ReturnType<typeof getDb>,
  uid: number
) {
  const [account] = await db
    .select()
    .from(paperAccounts)
    .where(eq(paperAccounts.userId, uid));
  if (!account) return null;
  const [totals] = await db
    .select({
      net: sql<number>`COALESCE(SUM(${paperTrades.net}), 0)`,
      count: sql<number>`COUNT(*)`,
      closedCount: sql<number>`COUNT(${paperTrades.net})`,
      wins: sql<number>`COALESCE(SUM(CASE WHEN ${paperTrades.net} > 0 THEN 1 ELSE 0 END), 0)`,
    })
    .from(paperTrades)
    .where(eq(paperTrades.userId, uid));
  const open = await db
    .select()
    .from(paperTrades)
    .where(and(eq(paperTrades.userId, uid), isNull(paperTrades.closedAt)));
  const reserved = open.reduce((s, t) => s + t.plan.capitalUsed, 0);
  const openRisk = open.reduce((s, t) => s + t.plan.estimatedLoss, 0);
  const realized = Number(totals.net),
    equity = account.initialCapital + realized;
  const closedCount = Number(totals.closedCount);
  return {
    initialCapital: account.initialCapital,
    realized,
    equity,
    reserved,
    available: equity - reserved,
    openRisk,
    openCount: open.length,
    count: Number(totals.count),
    closedCount,
    winRate: closedCount ? (Number(totals.wins) / closedCount) * 100 : null,
    expectancy: closedCount ? realized / closedCount : null,
  };
}

export const paperRouter = createRouter({
  list: publicQuery.query(({ ctx }) =>
    getDb().transaction(async db => {
      const uid = await activeUser(ctx, db);
      const account = await balance(db, uid);
      const recent = await db
        .select()
        .from(paperTrades)
        .where(eq(paperTrades.userId, uid))
        .orderBy(desc(paperTrades.id))
        .limit(100);
      const open = await db
        .select()
        .from(paperTrades)
        .where(and(eq(paperTrades.userId, uid), isNull(paperTrades.closedAt)));
      const trades = [
        ...new Map([...open, ...recent].map(t => [t.id, t])).values(),
      ].sort((a, b) => b.id - a.id);
      return { account, trades };
    })
  ),
  initialize: publicQuery
    .input(z.object({ capital: z.number().finite().min(100).max(1e8) }))
    .mutation(({ ctx, input }) =>
      getDb().transaction(async tx => {
        const uid = await activeUser(ctx, tx);
        if (await balance(tx, uid))
          throw new TRPCError({
            code: "CONFLICT",
            message: "La cuenta simulada ya está creada.",
          });
        await tx
          .insert(paperAccounts)
          .values({ userId: uid, initialCapital: input.capital });
        return { ok: true };
      })
    ),
  open: publicQuery
    .input(z.object({ requestId: z.uuid(), plan: planSchema }))
    .mutation(({ ctx, input }) =>
      getDb().transaction(async tx => {
        const uid = await activeUser(ctx, tx);
        const [existing] = await tx
          .select()
          .from(paperTrades)
          .where(
            and(
              eq(paperTrades.userId, uid),
              eq(paperTrades.requestId, input.requestId)
            )
          );
        if (existing) return { id: existing.id };
        const account = await balance(tx, uid);
        if (!account)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Crea primero tu cuenta simulada.",
          });
        if (account.openCount >= 20 || account.count >= 10000)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Límite de operaciones simuladas alcanzado.",
          });
        if (account.available <= 0 || account.equity <= 0)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No queda capital virtual disponible.",
          });
        const size = calculatePositionSize({
          ...input.plan,
          capital: account.available,
          direction: "long",
          fractional: input.plan.assetClass === "crypto",
        });
        if (!size.quantity || size.estimatedGain <= 0)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "El capital o el objetivo no cubren el riesgo y los costes.",
          });
        if (
          account.openRisk + size.estimatedLoss >
          account.equity * 0.05 + 1e-8
        )
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "El riesgo conjunto de las simulaciones superaría el límite del 5%.",
          });
        const result = await tx.insert(paperTrades).values({
          userId: uid,
          requestId: input.requestId,
          plan: {
            ...input.plan,
            quantity: size.quantity,
            entryFill: size.entryFill,
            entryFee: size.capitalUsed - size.positionValue,
            capitalUsed: size.capitalUsed,
            estimatedLoss: size.estimatedLoss,
            estimatedGain: size.estimatedGain,
          },
        });
        return { id: Number(result[0].insertId) };
      })
    ),
  close: publicQuery
    .input(
      z.object({
        id: z.number().int().positive(),
        price: z.number().finite().positive().max(1e12),
        reason: z.enum(["manual", "stop", "target", "time"]),
      })
    )
    .mutation(({ ctx, input }) =>
      getDb().transaction(async tx => {
        const uid = await activeUser(ctx, tx);
        const [trade] = await tx
          .select()
          .from(paperTrades)
          .where(
            and(eq(paperTrades.id, input.id), eq(paperTrades.userId, uid))
          );
        if (!trade)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Operación no encontrada.",
          });
        if (trade.closedAt) return { net: trade.net };
        const p = trade.plan,
          result = settleLong(
            p.quantity,
            p.entryFill,
            p.entryFee,
            input.price,
            p
          );
        await tx
          .update(paperTrades)
          .set({
            closedAt: new Date(),
            exitPrice: result.exitFill,
            net: result.net,
            exitReason: input.reason,
          })
          .where(eq(paperTrades.id, trade.id));
        return { net: result.net };
      })
    ),
});
