import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createRouter, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { users, accessCodes } from "@db/schema";
import { loginLimiter } from './loginLimiter';
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  readSessionCookie,
  sessionCookieHeader,
  clearSessionCookieHeader,
} from "./sessionUtil";

const usernameSchema = z.string().trim().min(3, "mínimo 3 caracteres").max(32)
  .regex(/^[a-zA-Z0-9_.-]+$/, "solo letras, números, punto, guion y guion bajo");

const credentials = z.object({
  username: usernameSchema,
  password: z.string().min(6, "mínimo 6 caracteres").max(128),
});

const registration = credentials.extend({
  accessCode: z.string().trim().min(4, "código de acceso requerido").max(32),
});

function toClientUser(u: typeof users.$inferSelect) {
  const daysLeft = u.expiresAt
    ? Math.ceil((u.expiresAt.getTime() - Date.now()) / 86400000)
    : null;
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    isAdmin: u.isAdmin === 1,
    expiresAt: u.expiresAt?.getTime() ?? null,
    daysLeft,
  };
}

function assertActive(u: typeof users.$inferSelect) {
  if (u.expiresAt && u.expiresAt.getTime() < Date.now()) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Tu suscripción venció. Contacta al administrador para renovarla.",
    });
  }
}

export const authRouter = createRouter({
  /** Usuario actual según la cookie de sesión (null si no hay sesión). */
  me: publicQuery.query(async ({ ctx }) => {
    const session = readSessionCookie(ctx.req);
    if (!session) return null;
    const db = getDb();
    const user = await db.query.users.findFirst({ where: eq(users.id, session.uid) });
    if (!user) return null;
    assertActive(user);
    return toClientUser(user);
  }),

  /** Registro CERRADO: solo con un código de acceso válido y sin usar. */
  register: publicQuery.input(registration).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const passHash = hashPassword(input.password);
    const created = await db.transaction(async tx => {
      // Lock the code until both user creation and code consumption commit.
      const [code] = await tx.select().from(accessCodes)
        .where(eq(accessCodes.code, input.accessCode.toUpperCase())).limit(1).for('update');
      if (!code || code.revoked === 1 || code.usedBy !== null) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Código de acceso inválido o ya utilizado' });
      }
      const existing = await tx.query.users.findFirst({ where: eq(users.username, input.username) });
      if (existing) throw new TRPCError({ code: 'CONFLICT', message: 'Ese nombre de usuario ya existe' });
      const inserted = await tx.insert(users).values({
        username: input.username, passHash, displayName: input.username,
        expiresAt: new Date(Date.now() + code.days * 86400000),
      });
      const uid = Number(inserted[0].insertId);
      await tx.update(accessCodes).set({ usedBy: input.username, usedAt: new Date() }).where(eq(accessCodes.id, code.id));
      const user = await tx.query.users.findFirst({ where: eq(users.id, uid) });
      if (!user) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      return user;
    });
    ctx.resHeaders.append("Set-Cookie", sessionCookieHeader(createSessionToken(created.id, input.username)));
    return toClientUser(created);
  }),

  login: publicQuery.input(credentials).mutation(async ({ ctx, input }) => {
    const attempt = loginLimiter.consume(input.username);
    if (!attempt.allowed) {
      ctx.resHeaders.set('Retry-After', String(attempt.retryAfterSeconds));
      throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Demasiados intentos de acceso. Intenta de nuevo más tarde.' });
    }
    const db = getDb();
    const user = await db.query.users.findFirst({ where: eq(users.username, input.username) });
    if (!user || !verifyPassword(input.password, user.passHash)) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Usuario o contraseña incorrectos' });
    }
    assertActive(user);
    await db.update(users).set({ lastSignInAt: new Date() }).where(eq(users.id, user.id));
    ctx.resHeaders.append("Set-Cookie", sessionCookieHeader(createSessionToken(user.id, user.username)));
    return toClientUser(user);
  }),

  logout: publicQuery.mutation(({ ctx }) => {
    ctx.resHeaders.append("Set-Cookie", clearSessionCookieHeader());
    return { ok: true };
  }),
});
