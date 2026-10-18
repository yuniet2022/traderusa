import {
  mysqlTable,
  varchar,
  timestamp,
  bigint,
  int,
  double,
  json,
  uniqueIndex,
} from "drizzle-orm/mysql-core";
import type { PaperSnapshot } from '@contracts/trading';

/** Usuarios con login por usuario + contraseña (hash scrypt). */
export const users = mysqlTable("tr_users", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
  username: varchar("username", { length: 64 }).notNull().unique(),
  passHash: varchar("passHash", { length: 255 }).notNull(),
  displayName: varchar("displayName", { length: 128 }),
  isAdmin: int("isAdmin").notNull().default(0),
  /** null = sin vencimiento (admin); si vence, se bloquea el acceso */
  expiresAt: timestamp("expiresAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  lastSignInAt: timestamp("lastSignInAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;

/** Códigos de acceso de un solo uso para registrarse (vendidos como suscripción). */
export const accessCodes = mysqlTable("tr_access_codes", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
  code: varchar("code", { length: 32 }).notNull().unique(),
  days: int("days").notNull().default(30),
  note: varchar("note", { length: 128 }),
  usedBy: varchar("usedBy", { length: 64 }),
  usedAt: timestamp("usedAt"),
  revoked: int("revoked").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AccessCode = typeof accessCodes.$inferSelect;

/** Lote de compra dentro de una posición. */
export interface BuyLot {
  quantity: number;
  price: number;
}

/** Posiciones del portafolio, una fila por usuario+activo. */
export const positions = mysqlTable(
  "tr_positions",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
    assetId: varchar("assetId", { length: 64 }).notNull(),
    symbol: varchar("symbol", { length: 32 }).notNull(),
    assetClass: varchar("assetClass", { length: 16 }).notNull(),
    lots: json("lots").$type<BuyLot[]>().notNull(),
    addedAt: timestamp("addedAt").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("uq_positions_user_asset").on(t.userId, t.assetId)],
);

export type Position = typeof positions.$inferSelect;

/** Alertas de señal por usuario. */
export const alerts = mysqlTable(
  "tr_alerts",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
    assetId: varchar("assetId", { length: 64 }).notNull(),
    symbol: varchar("symbol", { length: 32 }).notNull(),
    kind: varchar("kind", { length: 32 }).notNull(),
    price: double("price"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("uq_alerts_user_asset_kind").on(t.userId, t.assetId, t.kind)],
);

export type Alert = typeof alerts.$inferSelect;

/** Virtual capital is initialized once; it is never a brokerage balance. */
export const paperAccounts = mysqlTable('tr_paper_accounts', {
  userId: bigint('userId', { mode: 'number', unsigned: true }).primaryKey(),
  initialCapital: double('initialCapital').notNull(),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
});

/** Append-only plans; a close updates only the exit fields once. */
export const paperTrades = mysqlTable('tr_paper_trades', {
  id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  userId: bigint('userId', { mode: 'number', unsigned: true }).notNull(),
  requestId: varchar('requestId', { length: 36 }).notNull(),
  plan: json('plan').$type<PaperSnapshot>().notNull(),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  closedAt: timestamp('closedAt'),
  exitPrice: double('exitPrice'),
  net: double('net'),
  exitReason: varchar('exitReason', { length: 32 }),
}, t => [uniqueIndex('uq_paper_user_request').on(t.userId, t.requestId)]);
