import { describe, expect, it } from 'vitest';
import { createLoginLimiter } from './loginLimiter';

describe('login attempt budget', () => {
  it('limits equivalent usernames across casing and whitespace', () => {
    const limiter = createLoginLimiter({ limit: 2, now: () => 1000 });
    expect(limiter.consume(' User ').allowed).toBe(true);
    expect(limiter.consume('user').allowed).toBe(true);
    expect(limiter.consume('USER')).toEqual({ allowed: false, retryAfterSeconds: 900 });
    expect(limiter.consume('another-user').allowed).toBe(true);
  });

  it('expires the budget at the window boundary', () => {
    let time = 1000;
    const limiter = createLoginLimiter({ limit: 1, windowMs: 1000, now: () => time });
    limiter.consume('user');
    time = 1999;
    expect(limiter.consume('user').allowed).toBe(false);
    time = 2000;
    expect(limiter.consume('user').allowed).toBe(true);
  });

  it('bounds memory without evicting active limits to admit an attacker', () => {
    let time = 0;
    const limiter = createLoginLimiter({ limit: 1, maxEntries: 1, windowMs: 1000, now: () => time });
    limiter.consume('user');
    expect(limiter.consume('other').allowed).toBe(false);
    expect(limiter.consume('user').allowed).toBe(false);
    time = 1000;
    expect(limiter.consume('other').allowed).toBe(true);
  });
});
