/**
 * Sliding-window rate limiter: in memory, per process, reset on a cold start.
 * Enough to slow a guessing script; the per-account lockout is the real guard.
 */
export function createRateLimiter(windowMs: number, max: number) {
  const hitsByKey = new Map<string, number[]>();
  return function isRateLimited(key: string): boolean {
    const now = Date.now();
    const hits = (hitsByKey.get(key) ?? []).filter((t) => now - t < windowMs);
    hits.push(now);
    hitsByKey.set(key, hits);
    if (hitsByKey.size > 5000) {
      for (const [k, v] of hitsByKey) if (v.every((t) => now - t >= windowMs)) hitsByKey.delete(k);
    }
    return hits.length > max;
  };
}
