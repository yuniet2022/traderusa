import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { createRouter, publicQuery } from "./middleware";
import type { TrpcContext } from "./context";
import { getDb } from "./queries/connection";
import { users, accessCodes } from "@db/schema";
import { readSessionCookie } from "./sessionUtil";

async function requireAdmin(ctx: TrpcContext): Promise<number> {
  const session = readSessionCookie(ctx.req);
  if (!session) throw new TRPCError({ code: "UNAUTHORIZED", message: "Inicia sesión" });
  const db = getDb();
  const user = await db.query.users.findFirst({ where: eq(users.id, session.uid) });
  if (!user || user.isAdmin !== 1) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Solo el administrador" });
  }
  return user.id;
}

export const adminRouter = createRouter({
  /** Genera un código de acceso de un solo uso. */
  createCode: publicQuery
    .input(z.object({
      days: z.number().int().min(1).max(3650).default(30),
      note: z.string().max(128).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      const db = getDb();
      const code = randomBytes(6).toString("hex").toUpperCase(); // ej. "A3F9C21D7E04"
      await db.insert(accessCodes).values({ code, days: input.days, note: input.note ?? null });
      return { code, days: input.days };
    }),

  listCodes: publicQuery.query(async ({ ctx }) => {
    await requireAdmin(ctx);
    const db = getDb();
    const rows = await db.query.accessCodes.findMany({ orderBy: [desc(accessCodes.createdAt)] });
    return rows.map(r => ({
      id: r.id,
      code: r.code,
      days: r.days,
      note: r.note,
      usedBy: r.usedBy,
      usedAt: r.usedAt?.getTime() ?? null,
      revoked: r.revoked === 1,
      createdAt: r.createdAt.getTime(),
    }));
  }),

  revokeCode: publicQuery
    .input(z.object({ code: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      const db = getDb();
      await db.update(accessCodes).set({ revoked: 1 }).where(eq(accessCodes.code, input.code));
      return { ok: true };
    }),

  listUsers: publicQuery.query(async ({ ctx }) => {
    await requireAdmin(ctx);
    const db = getDb();
    const rows = await db.query.users.findMany({ orderBy: [desc(users.createdAt)] });
    return rows.map(u => ({
      id: u.id,
      username: u.username,
      isAdmin: u.isAdmin === 1,
      expiresAt: u.expiresAt?.getTime() ?? null,
      daysLeft: u.expiresAt ? Math.ceil((u.expiresAt.getTime() - Date.now()) / 86400000) : null,
      createdAt: u.createdAt.getTime(),
      lastSignInAt: u.lastSignInAt.getTime(),
    }));
  }),

  /** Extiende la suscripción de un usuario N días desde hoy (renovación). */
  extendUser: publicQuery
    .input(z.object({ username: z.string().min(1), days: z.number().int().min(1).max(3650) }))
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      const db = getDb();
      const user = await db.query.users.findFirst({ where: eq(users.username, input.username) });
      if (!user) throw new Error("Usuario no encontrado");
      const base = user.expiresAt && user.expiresAt.getTime() > Date.now()
        ? user.expiresAt.getTime()
        : Date.now();
      await db.update(users)
        .set({ expiresAt: new Date(base + input.days * 86400000) })
        .where(eq(users.id, user.id));
      return { ok: true };
    }),

  /** Desactiva un usuario (vence su acceso de inmediato). */
  suspendUser: publicQuery
    .input(z.object({ username: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      const db = getDb();
      await db.update(users)
        .set({ expiresAt: new Date(0) })
        .where(eq(users.username, input.username));
      return { ok: true };
    }),
});
