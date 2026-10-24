import { beforeEach, describe, expect, it, vi } from 'vitest';
const { findUser, diagnose } = vi.hoisted(() => ({ findUser: vi.fn(), diagnose: vi.fn() }));
vi.mock('./queries/connection', () => ({ getDb: () => ({ query: { users: { findFirst: findUser } } }) }));
vi.mock('./marketDiagnostics', () => ({ createMarketDiagnostics: () => diagnose }));
import { adminRouter } from './adminRouter';
import { createSessionToken, SESSION_COOKIE } from './sessionUtil';

const caller = (loggedIn: boolean) => adminRouter.createCaller({ req: new Request('http://localhost/', { headers: loggedIn ? { Cookie: `${SESSION_COOKIE}=${createSessionToken(1,'admin-test')}` } : {} }), resHeaders: new Headers() });
beforeEach(() => vi.resetAllMocks());
describe('market diagnostics access', () => {
  it('requires both authentication and an administrator account before probing', async () => {
    await expect(caller(false).marketDiagnostics()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    findUser.mockResolvedValue({ id: 1, isAdmin: 0 });
    await expect(caller(true).marketDiagnostics()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(diagnose).not.toHaveBeenCalled();
  });
  it('allows the administrator to run the fixed-provider diagnostic', async () => {
    findUser.mockResolvedValue({ id: 1, isAdmin: 1 });
    diagnose.mockResolvedValue({ checkedAt: 123, commit: null, results: [] });
    expect(await caller(true).marketDiagnostics()).toMatchObject({ checkedAt: 123 });
    expect(diagnose).toHaveBeenCalledTimes(1);
  });
});
