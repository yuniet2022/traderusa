import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSessionToken, readSessionCookie, verifySessionToken, sessionCookieHeader, clearSessionCookieHeader } from './sessionUtil';

vi.mock('./lib/env', () => ({ env: { appSecret: 'test-only-session-secret', isProduction: true } }));
afterEach(() => vi.useRealTimers());

function signPayload(payload: unknown) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', 'test-only-session-secret').update(body).digest('base64url');
  return `${body}.${signature}`;
}

describe('session handling', () => {
  it('accepts a valid signed session', () => {
    expect(verifySessionToken(createSessionToken(42, 'test-user'))).toMatchObject({ uid: 42, username: 'test-user' });
  });

  it('rejects a changed payload or signature', () => {
    const token = createSessionToken(42, 'test-user');
    expect(verifySessionToken(`x${token}`)).toBeNull();
    expect(verifySessionToken(`${token}x`)).toBeNull();
  });

  it('expires a session at its exact expiration time', () => {
    vi.useFakeTimers();
    const token = createSessionToken(42, 'test-user');
    vi.advanceTimersByTime(30 * 24 * 60 * 60 * 1000);
    expect(verifySessionToken(token)).toBeNull();
  });

  it.each([
    { uid: 42, username: 'user' },
    { uid: 42, username: 'user', exp: '9999999999999' },
    { uid: -1, username: 'user', exp: 9999999999999 },
    { uid: 0.5, username: 'user', exp: 9999999999999 },
    { uid: 42, username: {}, exp: 9999999999999 },
  ])('rejects a malformed signed payload: %j', payload => {
    expect(verifySessionToken(signPayload(payload))).toBeNull();
  });

  it('handles invalid cookie encoding without crashing the API', () => {
    const req = new Request('http://localhost/', { headers: { cookie: 'tr_session=%E0%A4%A' } });
    expect(readSessionCookie(req)).toBeNull();
  });

  it('reads the session among other cookies', () => {
    const token = createSessionToken(42, 'test-user');
    const req = new Request('http://localhost/', { headers: { cookie: `other=1; tr_session=${token}` } });
    expect(readSessionCookie(req)?.uid).toBe(42);
  });

  it('sets and clears production cookies over HTTPS only', () => {
    expect(sessionCookieHeader('token')).toContain('; Secure');
    expect(clearSessionCookieHeader()).toContain('; Secure');
  });
});
