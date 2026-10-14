import { randomBytes } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { authRouter } from './authRouter';
import { getDb } from './queries/connection';
import { users, accessCodes } from '@db/schema';
import { hashPassword } from './sessionUtil';

// Explicit opt-in: these tests write only isolated fixtures to a local test/development database.
describe.skipIf(process.env.TRADERUSA_DB_INTEGRATION !== '1')('authentication with local MySQL', () => {
  let db: ReturnType<typeof getDb>;
  const usernames: string[] = [];
  const codes: string[] = [];
  const password = 'test-only-password';
  const unique = () => randomBytes(6).toString('hex');
  const username = () => { const name = `test_${unique()}`; usernames.push(name); return name; };
  const caller = () => {
    const headers = new Headers();
    return { api: authRouter.createCaller({ req: new Request('http://localhost/'), resHeaders: headers }), headers };
  };
  const newCode = async (revoked = 0) => {
    const code = `TEST_${unique().toUpperCase()}`;
    codes.push(code);
    await db.insert(accessCodes).values({ code, days: 30, revoked });
    return code;
  };

  beforeAll(() => {
    const url = new URL(process.env.DATABASE_URL ?? '');
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !['/traderusa', '/traderusa_test'].includes(url.pathname)) {
      throw new Error('Integration tests require the dedicated local traderusa database.');
    }
    db = getDb();
  });
  afterEach(async () => {
    if (usernames.length) await db.delete(users).where(inArray(users.username, usernames));
    if (codes.length) await db.delete(accessCodes).where(inArray(accessCodes.code, codes));
    usernames.length = 0;
    codes.length = 0;
  });
  afterAll(async () => { if (db) await db.$client.promise().end(); });

  it('allows exactly one of two simultaneous registrations to consume a code', async () => {
    const accessCode = await newCode();
    const names = [username(), username()];
    const requests = [caller(), caller()];
    const outcomes = await Promise.allSettled(names.map((name, i) => requests[i].api.register({ username: name, password, accessCode })));
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(result => result.status === 'rejected')).toHaveLength(1);
    const created = await db.select().from(users).where(inArray(users.username, names));
    expect(created).toHaveLength(1);
    const [code] = await db.select().from(accessCodes).where(eq(accessCodes.code, accessCode));
    expect(code.usedBy).toBe(created[0].username);
    expect(requests.filter(request => request.headers.has('Set-Cookie'))).toHaveLength(1);
  });

  it('does not consume the losing code when two registrations race for one username', async () => {
    const name = username();
    const access = [await newCode(), await newCode()];
    const results = await Promise.allSettled(access.map(accessCode => caller().api.register({ username: name, password, accessCode })));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const unused = await db.select().from(accessCodes).where(inArray(accessCodes.code, access));
    expect(unused.filter(code => code.usedBy === null)).toHaveLength(1);
    const remaining = unused.find(code => code.usedBy === null)!;
    await expect(caller().api.register({ username: username(), password, accessCode: remaining.code })).resolves.toBeDefined();
  });

  it('rejects a revoked code without creating a user or session', async () => {
    const accessCode = await newCode(1);
    const name = username();
    const request = caller();
    await expect(request.api.register({ username: name, password, accessCode })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(await db.select().from(users).where(eq(users.username, name))).toHaveLength(0);
    expect(request.headers.has('Set-Cookie')).toBe(false);
  });

  it('returns a rate limit and retry header before another password check', async () => {
    const name = username();
    await db.insert(users).values({ username: name, passHash: hashPassword(password) });
    for (let i = 0; i < 10; i++) {
      await expect(caller().api.login({ username: name, password: 'wrong-password' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    }
    const request = caller();
    await expect(request.api.login({ username: name, password })).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
    expect(Number(request.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(request.headers.has('Set-Cookie')).toBe(false);
  });
});
