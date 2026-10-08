/**
 * @file packages/gateway/tests/slidingWindow.test.ts
 * @description Integration tests for the Sliding Window rate limiter using a live Redis instance.
 *
 * Architecture Context:
 * Located in `packages/gateway/tests/`, this test suite validates the sliding window
 * implementation in `src/rateLimit/slidingWindow.ts`. It sends real Redis commands over
 * TCP to verify Sorted Set (ZSET) manipulations, Lua script atomicity, window pruning,
 * boundary enforcement, and concurrency safety.
 */

import { checkSlidingWindow, RateLimitResult } from '../src/rateLimit/slidingWindow.js';
import { redis } from '../src/lib/redis.js';

describe('Sliding Window Rate Limiter Integration Tests', () => {
  // Test key prefix namespace to ensure clean isolation from production keys
  const TEST_KEY_PREFIX = 'test_sw_key_';

  /**
   * Helper function to generate unique key IDs per test case to avoid state leakage.
   *
   * @param {string} suffix - Descriptive test label
   * @returns {string} Unique test key identifier
   */
  function generateTestKey(suffix: string): string {
    return `${TEST_KEY_PREFIX}${suffix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  }

  /**
   * Helper function to remove Redis keys created during tests.
   *
   * @param {string} keyId - API key ID whose rate-limit ZSET should be purged
   * @returns {Promise<void>}
   */
  async function cleanupRedisKey(keyId: string): Promise<void> {
    try {
      await redis.del(`rl:${keyId}`);
    } catch (err: unknown) {
      console.warn(`[Test Cleanup Warning] Failed to delete key rl:${keyId}:`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Ensure Redis connection is healthy before tests execute
  beforeAll(async () => {
    try {
      const pingResponse = await redis.ping();
      expect(pingResponse).toBe('PONG');
    } catch (err: unknown) {
      throw new Error(
        `Redis connection check failed before running tests: ${
          err instanceof Error ? err.message : String(err)
        }. Ensure Redis is running on localhost:6379.`
      );
    }
  });

  afterAll(async () => {
    // Delete any remaining keys matching test pattern
    try {
      const keys = await redis.keys(`rl:${TEST_KEY_PREFIX}*`);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch (err: unknown) {
      console.warn('[Test Cleanup Warning] Global cleanup encountered error:', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // -------------------------------------------------------------------------
  // Case 1: Normal request within limit → should pass
  // -------------------------------------------------------------------------
  describe('Case 1: Normal request within limit', () => {
    it('should allow requests and decrement remaining quota when within limit', async () => {
      const keyId = generateTestKey('normal_pass');
      const limit = 5;
      const windowMs = 60000;

      try {
        // First request: should pass with remaining = limit - 1 (4)
        const firstResult: RateLimitResult = await checkSlidingWindow(keyId, limit, windowMs);
        expect(firstResult.allowed).toBe(true);
        expect(firstResult.remaining).toBe(4);
        expect(firstResult.resetAt).toBeGreaterThan(Date.now());

        // Second request: should pass with remaining = 3
        const secondResult: RateLimitResult = await checkSlidingWindow(keyId, limit, windowMs);
        expect(secondResult.allowed).toBe(true);
        expect(secondResult.remaining).toBe(3);

        // Third request: should pass with remaining = 2
        const thirdResult: RateLimitResult = await checkSlidingWindow(keyId, limit, windowMs);
        expect(thirdResult.allowed).toBe(true);
        expect(thirdResult.remaining).toBe(2);
      } finally {
        await cleanupRedisKey(keyId);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Case 2: Request at exact limit → should be rejected (the Nth+1 request)
  // -------------------------------------------------------------------------
  describe('Case 2: Exact limit boundary and rejection', () => {
    it('should allow up to exact limit N, and reject the (N+1)th request', async () => {
      const keyId = generateTestKey('exact_limit');
      const limit = 3;
      const windowMs = 60000;

      try {
        // Send exactly N requests (all should pass)
        for (let i = 1; i <= limit; i++) {
          const result = await checkSlidingWindow(keyId, limit, windowMs);
          expect(result.allowed).toBe(true);
          expect(result.remaining).toBe(limit - i);
        }

        // The (N + 1)th request must be rejected
        const rejectedResult = await checkSlidingWindow(keyId, limit, windowMs);
        expect(rejectedResult.allowed).toBe(false);
        expect(rejectedResult.remaining).toBe(0);
        expect(rejectedResult.resetAt).toBeGreaterThan(Date.now());

        // Subsequent requests while still inside window must also be rejected
        const anotherRejected = await checkSlidingWindow(keyId, limit, windowMs);
        expect(anotherRejected.allowed).toBe(false);
        expect(anotherRejected.remaining).toBe(0);
      } finally {
        await cleanupRedisKey(keyId);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Case 3: Requests after window expires → counter should reset
  // -------------------------------------------------------------------------
  describe('Case 3: Window expiration and counter reset', () => {
    it('should reset quota once the window duration has elapsed', async () => {
      const keyId = generateTestKey('window_expire');
      const limit = 2;
      // Use a short 700ms window to test automatic pruning without slowing test suite
      const shortWindowMs = 700;

      try {
        // Exhaust the quota: 2 requests allowed
        const res1 = await checkSlidingWindow(keyId, limit, shortWindowMs);
        const res2 = await checkSlidingWindow(keyId, limit, shortWindowMs);
        expect(res1.allowed).toBe(true);
        expect(res2.allowed).toBe(true);

        // Immediate 3rd request should fail
        const res3 = await checkSlidingWindow(keyId, limit, shortWindowMs);
        expect(res3.allowed).toBe(false);

        // Wait for the sliding window to slide past the old requests (850ms > 700ms)
        await new Promise((resolve) => setTimeout(resolve, 850));

        // After window expires, old timestamps are pruned; new request must succeed
        const resAfterExpiry = await checkSlidingWindow(keyId, limit, shortWindowMs);
        expect(resAfterExpiry.allowed).toBe(true);
        expect(resAfterExpiry.remaining).toBe(limit - 1);
      } finally {
        await cleanupRedisKey(keyId);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Case 5: Concurrent requests → race condition test
  // -------------------------------------------------------------------------
  describe('Case 5: Concurrent requests race condition test', () => {
    it('should handle simultaneous requests atomically without exceeding the limit', async () => {
      const keyId = generateTestKey('concurrent_burst');
      const limit = 10;
      const windowMs = 60000;
      const totalConcurrentRequests = 25;

      try {
        // Fire 25 requests simultaneously using Promise.all
        // Without Lua atomicity, multiple requests would read count < 10 simultaneously
        // and allow more than 10 requests through.
        const promises: Promise<RateLimitResult>[] = [];
        for (let i = 0; i < totalConcurrentRequests; i++) {
          promises.push(checkSlidingWindow(keyId, limit, windowMs));
        }

        const results = await Promise.all(promises);

        const allowedCount = results.filter((r) => r.allowed).length;
        const rejectedCount = results.filter((r) => !r.allowed).length;

        // Exactly 'limit' requests MUST be allowed, no more, no less
        expect(allowedCount).toBe(limit);
        expect(rejectedCount).toBe(totalConcurrentRequests - limit);

        // Verify all rejected responses report remaining = 0
        const rejectedResults = results.filter((r) => !r.allowed);
        for (const rejected of rejectedResults) {
          expect(rejected.remaining).toBe(0);
        }
      } finally {
        await cleanupRedisKey(keyId);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Case 6: Different API keys → independent rate limits
  // -------------------------------------------------------------------------
  describe('Case 6: Independent rate limits across distinct API keys', () => {
    it('should maintain independent sliding windows and counters for separate keys', async () => {
      const keyA = generateTestKey('tenant_alpha');
      const keyB = generateTestKey('tenant_beta');
      const limit = 2;
      const windowMs = 60000;

      try {
        // Exhaust quota for Tenant A
        const a1 = await checkSlidingWindow(keyA, limit, windowMs);
        const a2 = await checkSlidingWindow(keyA, limit, windowMs);
        const a3 = await checkSlidingWindow(keyA, limit, windowMs);

        expect(a1.allowed).toBe(true);
        expect(a2.allowed).toBe(true);
        expect(a3.allowed).toBe(false); // Tenant A is throttled

        // Tenant B should be completely unaffected and have full quota available
        const b1 = await checkSlidingWindow(keyB, limit, windowMs);
        expect(b1.allowed).toBe(true);
        expect(b1.remaining).toBe(limit - 1);

        const b2 = await checkSlidingWindow(keyB, limit, windowMs);
        expect(b2.allowed).toBe(true);
        expect(b2.remaining).toBe(0);

        // Tenant B only throttles on its own 3rd request
        const b3 = await checkSlidingWindow(keyB, limit, windowMs);
        expect(b3.allowed).toBe(false);
      } finally {
        await cleanupRedisKey(keyA);
        await cleanupRedisKey(keyB);
      }
    });
  });
});
