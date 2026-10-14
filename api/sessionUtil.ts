import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { env } from "./lib/env";

/* ---------- Hash de contraseñas (scrypt) ---------- */

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

/* ---------- Sesión JWT (HS256, 30 días) ---------- */

const b64u = (buf: Buffer | string) =>
  Buffer.from(buf).toString("base64url");

function sign(data: string): string {
  return createHmac("sha256", env.appSecret).update(data).digest("base64url");
}

export interface SessionPayload {
  uid: number;
  username: string;
  exp: number;
}

export function createSessionToken(uid: number, username: string): string {
  const payload: SessionPayload = {
    uid,
    username,
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000,
  };
  const body = b64u(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = Buffer.from(sign(body));
  const actual = Buffer.from(sig);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as SessionPayload;
    if (!Number.isSafeInteger(payload.uid) || payload.uid <= 0
      || typeof payload.username !== 'string' || !payload.username
      || typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)
      || payload.exp <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/* ---------- Cookie ---------- */

export const SESSION_COOKIE = "tr_session";

export function readSessionCookie(req: Request): SessionPayload | null {
  const raw = req.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === SESSION_COOKIE) {
      try {
        return verifySessionToken(decodeURIComponent(v.join("=")));
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function sessionCookieHeader(token: string): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 3600}${env.isProduction ? '; Secure' : ''}`;
}

export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${env.isProduction ? '; Secure' : ''}`;
}
