/** Single-process attempt budget. Multi-instance deployments need a shared edge/Redis limiter. */
export function createLoginLimiter({ limit = 10, windowMs = 15 * 60_000, maxEntries = 10_000, now = Date.now } = {}) {
  const entries = new Map<string, { attempts: number; resetAt: number }>();
  let nextCleanup = 0;
  return {
    consume(username: string) {
      const time = now();
      if (time >= nextCleanup || entries.size >= maxEntries) {
        for (const [key, entry] of entries) if (entry.resetAt <= time) entries.delete(key);
        nextCleanup = time + 60_000;
      }
      const key = username.trim().toLowerCase();
      let entry = entries.get(key);
      if (!entry || entry.resetAt <= time) {
        if (!entry && entries.size >= maxEntries) return { allowed: false, retryAfterSeconds: 60 };
        entry = { attempts: 0, resetAt: time + windowMs };
        entries.set(key, entry);
      }
      const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - time) / 1000));
      if (entry.attempts >= limit) return { allowed: false, retryAfterSeconds };
      entry.attempts++;
      return { allowed: true, retryAfterSeconds: 0 };
    },
  };
}

export const loginLimiter = createLoginLimiter();
