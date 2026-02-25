/**
 * In-memory sliding window rate limiter.
 *
 * Tracks request timestamps per key in a Map. Expired entries are pruned
 * on access and periodically via a background sweep.
 *
 * Designed to fail open — if the limiter itself throws, the request is allowed.
 */

export type RateLimitResult = {
  success: boolean;
  remaining: number;
  resetAt: Date;
};

export type RateLimitOptions = {
  /** Unique key for this rate limit bucket, e.g. "unfurl:<userId>" */
  key: string;
  /** Maximum number of requests allowed in the window */
  limit: number;
  /** Window duration in milliseconds */
  windowMs: number;
};

const store = new Map<string, number[]>();

let sweepTimer: ReturnType<typeof setInterval> | null = null;
const SWEEP_INTERVAL_MS = 60_000;

function startSweep(): void {
  if (sweepTimer !== null) return;
  sweepTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of store) {
      const filtered = timestamps.filter((t) => t > now - SWEEP_INTERVAL_MS * 15);
      if (filtered.length === 0) {
        store.delete(key);
      } else {
        store.set(key, filtered);
      }
    }
  }, SWEEP_INTERVAL_MS);
  // Allow Node to exit even if the timer is running
  if (sweepTimer && typeof sweepTimer === "object" && "unref" in sweepTimer) {
    sweepTimer.unref();
  }
}

/**
 * Check and record a request against the sliding window rate limit.
 *
 * Returns { success: true } if the request is within limits,
 * or { success: false } with timing info if the limit is exceeded.
 *
 * Fails open: if an unexpected error occurs, returns success.
 */
export function rateLimit(options: RateLimitOptions): RateLimitResult {
  try {
    const { key, limit, windowMs } = options;
    const now = Date.now();
    const windowStart = now - windowMs;

    // Get existing timestamps, prune expired ones
    const timestamps = (store.get(key) ?? []).filter((t) => t > windowStart);

    if (timestamps.length >= limit) {
      const oldestInWindow = timestamps[0];
      const resetAt = new Date(oldestInWindow + windowMs);
      store.set(key, timestamps);
      return { success: false, remaining: 0, resetAt };
    }

    timestamps.push(now);
    store.set(key, timestamps);

    startSweep();

    return {
      success: true,
      remaining: limit - timestamps.length,
      resetAt: new Date(now + windowMs),
    };
  } catch {
    // Fail open — don't block requests if the limiter itself errors
    return {
      success: true,
      remaining: 1,
      resetAt: new Date(Date.now() + (options.windowMs ?? 60_000)),
    };
  }
}

/**
 * Reset the in-memory store. Useful for testing.
 */
export function resetRateLimitStore(): void {
  store.clear();
  if (sweepTimer !== null) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
}

/**
 * Get the number of tracked keys. Useful for testing cleanup behavior.
 */
export function getRateLimitStoreSize(): number {
  return store.size;
}
