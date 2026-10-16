import { afterEach, describe, expect, it, vi } from 'vitest';

const { findUser } = vi.hoisted(() => ({ findUser: vi.fn() }));
vi.mock('./queries/connection', () => ({ getDb: () => ({ query: { users: { findFirst: findUser } } }) }));
vi.mock('./lib/env', () => ({ env: { isProduction: true, appId: 'test', appSecret: 'test-secret' } }));
import { handleTrpcRequest } from './trpcHandler';

afterEach(() => vi.restoreAllMocks());

describe('production API database diagnostics', () => {
  it.each(['ER_NO_SUCH_TABLE', 'ER_ACCESS_DENIED_ERROR', 'ECONNREFUSED'])(
    'reports %s in server logs without exposing query parameters', async code => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      const cause = Object.assign(new Error('Database credentials must stay private'), { code });
      findUser.mockRejectedValueOnce(new Error('Failed query: SELECT passHash FROM tr_users; params: private-value', { cause }));
      const response = await handleTrpcRequest(new Request('http://localhost/api/trpc/auth.login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ json: { username: `test_${code}`, password: 'private-value' } }),
      }));
      const body = await response.text();
      expect(response.status).toBe(500);
      expect(body).toContain('No se pudo completar');
      expect(body).not.toMatch(/SELECT|passHash|private-value|Database credentials|Failed query/);
      expect(log).toHaveBeenCalledWith('[API_ERROR]', JSON.stringify({ procedure: 'auth.login', code }));
      expect(JSON.stringify(log.mock.calls)).not.toMatch(/private-value|Database credentials|SELECT/);
    },
  );

  it('keeps invalid-login messages without treating them as server failures', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    findUser.mockResolvedValueOnce(undefined);
    const response = await handleTrpcRequest(new Request('http://localhost/api/trpc/auth.login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ json: { username: 'nonexistent', password: 'private-value' } }),
    }));
    expect(response.status).toBe(401);
    expect(await response.text()).toContain('Usuario o contraseña incorrectos');
    expect(log).not.toHaveBeenCalled();
  });
});
