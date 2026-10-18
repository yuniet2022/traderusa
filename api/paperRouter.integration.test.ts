import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { paperRouter } from "./paperRouter";
import { getDb } from "./queries/connection";
import { paperAccounts, paperTrades, users } from "@db/schema";
import { createSessionToken } from "./sessionUtil";
import type { TradingPlan } from "@contracts/trading";

describe.skipIf(process.env.TRADERUSA_DB_INTEGRATION !== "1")(
  "paper journal with local MySQL",
  () => {
    let db: ReturnType<typeof getDb>;
    const ids: number[] = [];
    const plan: TradingPlan = {
      assetId: "AAPL",
      symbol: "AAPL",
      assetClass: "stock",
      horizon: "swing",
      entry: 100,
      stop: 95,
      target: 110,
      feePercent: 0.1,
      fixedFee: 1,
      slippagePercent: 0.1,
      riskPercent: 1,
      note: "test plan",
    };
    const caller = (uid?: number) =>
      paperRouter.createCaller({
        req: new Request("http://localhost/", {
          headers: uid
            ? { cookie: `tr_session=${createSessionToken(uid, "test")}` }
            : {},
        }),
        resHeaders: new Headers(),
      });
    async function user(expiresAt?: Date) {
      const [result] = await db
        .insert(users)
        .values({
          username: `paper_${randomUUID().slice(0, 18)}`,
          passHash: "test-not-a-password",
          expiresAt,
        });
      const uid = Number(result.insertId);
      ids.push(uid);
      return { uid, api: caller(uid) };
    }
    beforeAll(() => {
      const url = new URL(process.env.DATABASE_URL ?? "");
      if (
        !["127.0.0.1", "localhost"].includes(url.hostname) ||
        url.pathname !== "/traderusa_test"
      )
        throw new Error(
          "Paper integration requires the isolated local test database."
        );
      db = getDb();
    });
    afterEach(async () => {
      if (ids.length) {
        await db.delete(paperTrades).where(inArray(paperTrades.userId, ids));
        await db
          .delete(paperAccounts)
          .where(inArray(paperAccounts.userId, ids));
        await db.delete(users).where(inArray(users.id, ids));
        ids.length = 0;
      }
    });
    afterAll(async () => {
      if (db) await db.$client.promise().end();
    });

    it("requires a current active user and rejects invalid long plans", async () => {
      await expect(caller().list()).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
      const expired = await user(new Date(Date.now() - 60000));
      await expect(
        expired.api.initialize({ capital: 10000 })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      const active = await user();
      await expect(
        active.api.open({
          requestId: randomUUID(),
          plan: { ...plan, stop: 101 },
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await db.delete(users).where(eq(users.id, active.uid));
      await expect(active.api.list()).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
    });

    it("initializes once under concurrent requests and keeps each account private", async () => {
      const a = await user(),
        b = await user();
      const outcomes = await Promise.allSettled([
        a.api.initialize({ capital: 10000 }),
        a.api.initialize({ capital: 20000 }),
      ]);
      expect(outcomes.filter(r => r.status === "fulfilled")).toHaveLength(1);
      const own = await a.api.list();
      expect([10000, 20000]).toContain(own.account?.initialCapital);
      expect((await b.api.list()).account).toBeNull();
    });

    it("deduplicates concurrent opens and prevents a second close from rewriting profit", async () => {
      const a = await user(),
        b = await user();
      await a.api.initialize({ capital: 10000 });
      const input = { requestId: randomUUID(), plan };
      const [one, two] = await Promise.all([
        a.api.open(input),
        a.api.open(input),
      ]);
      expect(one.id).toBe(two.id);
      const before = await a.api.list();
      expect(before.trades).toHaveLength(1);
      expect(before.account?.available).toBeLessThan(10000);
      expect((await b.api.list()).trades).toEqual([]);
      await expect(
        b.api.close({ id: one.id, price: 110, reason: "manual" })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      const [first, second] = await Promise.all([
        a.api.close({ id: one.id, price: 110, reason: "target" }),
        a.api.close({ id: one.id, price: 120, reason: "manual" }),
      ]);
      expect(second.net).toBe(first.net);
      const after = await a.api.list();
      expect(after.trades[0].plan).toEqual(before.trades[0].plan);
      expect(after.account?.reserved).toBe(0);
      expect(after.account?.openRisk).toBe(0);
      expect(after.account?.equity).toBeCloseTo(10000 + first.net!);
      expect(after.account?.available).toBeCloseTo(after.account!.equity);
    expect(after.account?.closedCount).toBe(1);
    expect(after.account?.winRate).toBe(100);
    expect(after.account?.expectancy).toBeCloseTo(first.net!);
    });

    it("serializes different simultaneous plans before checking aggregate risk", async () => {
      const { api } = await user();
      await api.initialize({ capital: 10000 });
      const highRisk = {
        ...plan,
        stop: 50,
        target: 200,
        riskPercent: 4,
        feePercent: 0,
        fixedFee: 0,
        slippagePercent: 0,
      };
      const outcomes = await Promise.allSettled([
        api.open({ requestId: randomUUID(), plan: highRisk }),
        api.open({ requestId: randomUUID(), plan: highRisk }),
      ]);
      expect(outcomes.filter(r => r.status === "fulfilled")).toHaveLength(1);
      const state = await api.list();
      expect(state.account?.openRisk).toBe(400);
      expect(state.trades).toHaveLength(1);
    });

    it("does not spend capital twice and preserves losses through a gap below the stop", async () => {
      const { api } = await user();
      await api.initialize({ capital: 10000 });
      const input = {
        ...plan,
        stop: 99,
        target: 110,
        feePercent: 0,
        fixedFee: 0,
        slippagePercent: 0,
        riskPercent: 1,
      };
      const first = await api.open({ requestId: randomUUID(), plan: input });
      await expect(
        api.open({ requestId: randomUUID(), plan: input })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await api.close({ id: first.id, price: 90, reason: "stop" });
      const state = await api.list();
      expect(state.account?.realized).toBe(-1000);
      expect(state.account?.available).toBe(9000);
      expect(state.trades[0].plan.estimatedLoss).toBe(100);
    });
  }
);
