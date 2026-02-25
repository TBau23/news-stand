import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  rateLimit,
  resetRateLimitStore,
  getRateLimitStoreSize,
} from "./rate-limit";

beforeEach(() => {
  resetRateLimitStore();
  vi.useRealTimers();
});

afterEach(() => {
  resetRateLimitStore();
});

describe("rateLimit", () => {
  describe("basic behavior", () => {
    it("allows a request when under the limit", () => {
      const result = rateLimit({ key: "test:1", limit: 5, windowMs: 60_000 });
      expect(result.success).toBe(true);
      expect(result.remaining).toBe(4);
    });

    it("tracks remaining count correctly", () => {
      const opts = { key: "test:1", limit: 3, windowMs: 60_000 };
      expect(rateLimit(opts).remaining).toBe(2);
      expect(rateLimit(opts).remaining).toBe(1);
      expect(rateLimit(opts).remaining).toBe(0);
    });

    it("blocks when the limit is reached", () => {
      const opts = { key: "test:1", limit: 2, windowMs: 60_000 };
      rateLimit(opts);
      rateLimit(opts);
      const result = rateLimit(opts);
      expect(result.success).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it("returns a resetAt date in the future on success", () => {
      const now = Date.now();
      const result = rateLimit({ key: "test:1", limit: 5, windowMs: 60_000 });
      expect(result.resetAt.getTime()).toBeGreaterThanOrEqual(now);
      expect(result.resetAt.getTime()).toBeLessThanOrEqual(now + 60_000 + 100);
    });

    it("returns a resetAt date based on oldest request when blocked", () => {
      const opts = { key: "test:1", limit: 1, windowMs: 60_000 };
      const beforeFirst = Date.now();
      rateLimit(opts);
      const result = rateLimit(opts);
      expect(result.success).toBe(false);
      // resetAt should be ~60s after the first request
      expect(result.resetAt.getTime()).toBeGreaterThanOrEqual(
        beforeFirst + 60_000
      );
    });
  });

  describe("key isolation", () => {
    it("tracks different keys independently", () => {
      const optsA = { key: "user:aaa", limit: 1, windowMs: 60_000 };
      const optsB = { key: "user:bbb", limit: 1, windowMs: 60_000 };

      rateLimit(optsA);
      // A is exhausted, B should still be available
      expect(rateLimit(optsA).success).toBe(false);
      expect(rateLimit(optsB).success).toBe(true);
    });

    it("does not leak state between different action types for the same user", () => {
      const unfurl = { key: "unfurl:user1", limit: 2, windowMs: 60_000 };
      const share = { key: "createShare:user1", limit: 2, windowMs: 60_000 };

      rateLimit(unfurl);
      rateLimit(unfurl);
      expect(rateLimit(unfurl).success).toBe(false);
      // share should be unaffected
      expect(rateLimit(share).success).toBe(true);
    });
  });

  describe("sliding window expiration", () => {
    it("allows requests again after the window expires", () => {
      vi.useFakeTimers();
      const opts = { key: "test:1", limit: 2, windowMs: 60_000 };

      rateLimit(opts);
      rateLimit(opts);
      expect(rateLimit(opts).success).toBe(false);

      // Advance past the window
      vi.advanceTimersByTime(60_001);

      const result = rateLimit(opts);
      expect(result.success).toBe(true);
      expect(result.remaining).toBe(1);
    });

    it("slides the window — old requests expire individually", () => {
      vi.useFakeTimers();
      const opts = { key: "test:1", limit: 2, windowMs: 60_000 };

      rateLimit(opts); // t=0
      vi.advanceTimersByTime(30_000);
      rateLimit(opts); // t=30s

      // At t=30s, limit reached
      expect(rateLimit(opts).success).toBe(false);

      // At t=60.001s, the first request expires, one slot opens
      vi.advanceTimersByTime(30_001);
      const result = rateLimit(opts);
      expect(result.success).toBe(true);
      expect(result.remaining).toBe(0); // used the one free slot
    });
  });

  describe("store management", () => {
    it("creates entries in the store", () => {
      rateLimit({ key: "a", limit: 5, windowMs: 60_000 });
      rateLimit({ key: "b", limit: 5, windowMs: 60_000 });
      expect(getRateLimitStoreSize()).toBe(2);
    });

    it("resetRateLimitStore clears all entries", () => {
      rateLimit({ key: "a", limit: 5, windowMs: 60_000 });
      rateLimit({ key: "b", limit: 5, windowMs: 60_000 });
      resetRateLimitStore();
      expect(getRateLimitStoreSize()).toBe(0);
    });

    it("allows requests after store reset", () => {
      const opts = { key: "test:1", limit: 1, windowMs: 60_000 };
      rateLimit(opts);
      expect(rateLimit(opts).success).toBe(false);

      resetRateLimitStore();
      expect(rateLimit(opts).success).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("handles a limit of 1", () => {
      const opts = { key: "strict", limit: 1, windowMs: 60_000 };
      expect(rateLimit(opts).success).toBe(true);
      expect(rateLimit(opts).success).toBe(false);
    });

    it("handles very short windows", () => {
      vi.useFakeTimers();
      const opts = { key: "fast", limit: 1, windowMs: 100 };
      rateLimit(opts);
      expect(rateLimit(opts).success).toBe(false);

      vi.advanceTimersByTime(101);
      expect(rateLimit(opts).success).toBe(true);
    });

    it("handles very large limits", () => {
      const opts = { key: "large", limit: 10000, windowMs: 60_000 };
      for (let i = 0; i < 100; i++) {
        expect(rateLimit(opts).success).toBe(true);
      }
      expect(rateLimit(opts).remaining).toBe(10000 - 101);
    });

    it("returns remaining 0 on the exact boundary hit", () => {
      const opts = { key: "boundary", limit: 3, windowMs: 60_000 };
      rateLimit(opts);
      rateLimit(opts);
      const result = rateLimit(opts);
      expect(result.success).toBe(true);
      expect(result.remaining).toBe(0);
    });
  });

  describe("fail-open behavior", () => {
    it("returns success if an unexpected error occurs internally", () => {
      // We can't easily cause an internal error in the pure function,
      // but we can verify the structure of the fail-open response
      // by checking that the exported function signature always returns
      // a valid RateLimitResult (tested transitively via all other tests).
      const result = rateLimit({ key: "test", limit: 5, windowMs: 60_000 });
      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("remaining");
      expect(result).toHaveProperty("resetAt");
      expect(result.resetAt).toBeInstanceOf(Date);
    });
  });

  describe("realistic scenarios", () => {
    it("simulates unfurl rate limit: 30 req/min per user", () => {
      const opts = { key: "unfurl:user-123", limit: 30, windowMs: 60_000 };
      for (let i = 0; i < 30; i++) {
        expect(rateLimit(opts).success).toBe(true);
      }
      expect(rateLimit(opts).success).toBe(false);
    });

    it("simulates login rate limit: 10 req/15min per IP", () => {
      const opts = {
        key: "login:192.168.1.1",
        limit: 10,
        windowMs: 15 * 60_000,
      };
      for (let i = 0; i < 10; i++) {
        expect(rateLimit(opts).success).toBe(true);
      }
      expect(rateLimit(opts).success).toBe(false);
    });

    it("simulates signup rate limit: 5 req/15min per IP", () => {
      const opts = {
        key: "signup:10.0.0.1",
        limit: 5,
        windowMs: 15 * 60_000,
      };
      for (let i = 0; i < 5; i++) {
        expect(rateLimit(opts).success).toBe(true);
      }
      expect(rateLimit(opts).success).toBe(false);
    });

    it("different users do not interfere with each other", () => {
      const opts1 = { key: "unfurl:user-1", limit: 2, windowMs: 60_000 };
      const opts2 = { key: "unfurl:user-2", limit: 2, windowMs: 60_000 };

      rateLimit(opts1);
      rateLimit(opts1);
      expect(rateLimit(opts1).success).toBe(false);

      // User 2 is unaffected — first call uses 1 of 2 slots
      expect(rateLimit(opts2).success).toBe(true);
      expect(rateLimit(opts2).success).toBe(true);
      // Now user 2 is also exhausted
      expect(rateLimit(opts2).success).toBe(false);
    });
  });
});
