/**
 * @file packages/gateway/tests/tokenBucket.test.ts
 * @description Integration tests for the Token Bucket rate limiter using a live Redis instance.
 *
 * Architecture Context:
 * Located in `packages/gateway/tests/`, this test suite validates the token bucket
 * algorithm in `src/rateLimit/tokenBucket.ts`. It tests real Redis Hash operations (HMGET,
 * HSET, PEXPIRE) and Lua script atomic execution for capacity tracking, instant burst
 * consumption, fractional time-based token refilling, concurrency safety, and multi-tenant isolation.
 */

import { checkTokenBucket, TokenBucketParams } from '../src/rateLimit/tokenBucket.js';
import { redis } from '../src/lib/redis.js';

describe('Token Bucket Rate Limiter Integration Tests', () => {
  // Unique namespace to prevent key collisions between runs
  const TEST_KEY_PREFIX = 'test_tb_key_';

  /**
   * Generates a unique API key identifier per test scenario.
   *
   * @param {string} suffix - Human-readable scenario name
   * @returns {string} Unique test key identifier
   */
  function generateTestKey(suffix: string): string {
    return `${TEST_KEY_PREFIX}${suffix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  }

  /**
   * Cleans up the Redis Hash created for a test key.
   *
   * @param {string} keyId - Key identifier whose token bucket should be removed
   * @returns {Promise<void>}
   */
  async function cleanupRedisKey(keyId: string): Promise<void> {
    try {
      await redis.del(`tb:${keyId}`);
    } catch (err: unknown) {
      console.warn(`[Test Cleanup Warning] Failed to delete key tb:${keyId}:`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

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
    try {
      const keys = await redis.keys(`tb:${TEST_KEY_PREFIX}*`);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch (err: unknown) {
      console.warn('[Test Cleanup Warning] Global token bucket cleanup encountered error:', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // -------------------------------------------------------------------------
  // Case 1: Normal request within limit → should pass
  // -------------------------------------------------------------------------
  describe('Case 1: Normal request within limit', () => {
    it('should consume 1 token per request and report decreasing remaining tokens', async () => {
      const keyId = generateTestKey('normal_consume');
      const params: TokenBucketParams = {
        capacity: 10,
        refillRate: 2, // 2 tokens/sec
      };

      try {
        // Initial request on empty bucket initializes bucket with full capacity (10) and consumes 1 → remaining: 9
        const res1 = await checkTokenBucket(keyId, params);
        expect(res1.allowed).toBe(true);
        expect(res1.remaining).toBe(9);
        expect(res1.resetAt).toBeGreaterThan(Date.now());

        // Second request consumes another token → remaining: 8
        const res2 = await checkTokenBucket(keyId, params);
        expect(res2.allowed).toBe(true);
        expect(res2.remaining).toBe(8);

        // Third request consumes another token → remaining: 7
        const res3 = await checkTokenBucket(keyId, params);
        expect(res3.allowed).toBe(true);
        expect(res3.remaining).toBe(7);
      } finally {
        await cleanupRedisKey(keyId);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Case 2: Request at exact limit → should be rejected (the Nth+1 request)
  // -------------------------------------------------------------------------
  describe('Case 2: Exact limit boundary and rejection', () => {
    it('should reject the (capacity + 1)th immediate request with accurate resetAt', async () => {
      const keyId = generateTestKey('exact_exhaustion');
      const capacity = 3;
      const refillRate = 1; // 1 token per second
      const params: TokenBucketParams = { capacity, refillRate };

      try {
        // Drain all 3 tokens immediately
        for (let i = 1; i <= capacity; i++) {
          const res = await checkTokenBucket(keyId, params);
          expect(res.allowed).toBe(true);
          expect(res.remaining).toBe(capacity - i);
        }

        // The 4th request must be rejected because bucket has < 1 token
        const rejected = await checkTokenBucket(keyId, params);
        expect(rejected.allowed).toBe(false);
        expect(rejected.remaining).toBe(0);
        expect(rejected.resetAt).toBeGreaterThan(Date.now());

        // Verify that retry duration is approximately 1 second (since refillRate = 1/s and tokens < 1)
        const retryWaitMs = rejected.resetAt - Date.now();
        expect(retryWaitMs).toBeGreaterThan(0);
        expect(retryWaitMs).toBeLessThanOrEqual(1500);
      } finally {
        await cleanupRedisKey(keyId);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Case 3: Refill over time → counter should replenish
  // -------------------------------------------------------------------------
  describe('Case 3: Token replenishment over time', () => {
    it('should refill tokens continuously based on elapsed time', async () => {
      const keyId = generateTestKey('time_refill');
      const capacity = 2;
      // Refill rate: 4 tokens per second (1 token every 250ms)
      const refillRate = 4;
      const params: TokenBucketParams = { capacity, refillRate };

      try {
        // Drain both tokens immediately
        const res1 = await checkTokenBucket(keyId, params);
        const res2 = await checkTokenBucket(keyId, params);
        expect(res1.allowed).toBe(true);
        expect(res2.allowed).toBe(true);

        // Third immediate request is rejected
        const rejected = await checkTokenBucket(keyId, params);
        expect(rejected.allowed).toBe(false);

        // Wait 300ms (at 4 tokens/s, 300ms yields 0.3 * 4 = 1.2 tokens > 1 token)
        await new Promise((resolve) => setTimeout(resolve, 300));

        // Now a request should succeed because at least 1 token has refilled
        const refilledRes = await checkTokenBucket(keyId, params);
        expect(refilledRes.allowed).toBe(true);
      } finally {
        await cleanupRedisKey(keyId);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Case 4: Burst handling in token bucket → should allow burst up to capacity
  // -------------------------------------------------------------------------
  describe('Case 4: Burst handling up to capacity', () => {
    it('should permit an instant burst equal to capacity and deny beyond capacity', async () => {
      const keyId = generateTestKey('burst_capacity');
      const burstSize = 6;
      // Very low refill rate: 0.1 tokens/sec (1 token every 10 seconds)
      // This isolates burst testing from refill contributions during the test execution window
      const refillRate = 0.1;
      const params: TokenBucketParams = { capacity: burstSize, refillRate };

      try {
        const burstResults = [];
        // Fire rapid sequential requests up to burst size
        for (let i = 0; i < burstSize; i++) {
          burstResults.push(await checkTokenBucket(keyId, params));
        }

        // All 'burstSize' requests must be allowed
        expect(burstResults.every((r) => r.allowed)).toBe(true);
        expect(burstResults[burstResults.length - 1].remaining).toBe(0);

        // Immediate subsequent request exceeding burst capacity must be rejected
        const overflowResult = await checkTokenBucket(keyId, params);
        expect(overflowResult.allowed).toBe(false);
        expect(overflowResult.remaining).toBe(0);
      } finally {
        await cleanupRedisKey(keyId);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Case 5: Concurrent requests → race condition test
  // -------------------------------------------------------------------------
  describe('Case 5: Concurrent requests race condition test', () => {
    it('should strictly enforce capacity limit when multiple requests execute simultaneously', async () => {
      const keyId = generateTestKey('concurrent_tokens');
      const capacity = 8;
      const refillRate = 0.5; // low refill rate to prevent refills during simultaneous execution
      const params: TokenBucketParams = { capacity, refillRate };
      const totalConcurrentRequests = 20;

      try {
        // Dispatch 20 simultaneous requests
        const requests = Array.from({ length: totalConcurrentRequests }, () =>
          checkTokenBucket(keyId, params)
        );

        const results = await Promise.all(requests);

        const allowedCount = results.filter((r) => r.allowed).length;
        const rejectedCount = results.filter((r) => !r.allowed).length;

        // The Lua script must ensure EXACTLY capacity (8) requests pass, and 12 are rejected
        expect(allowedCount).toBe(capacity);
        expect(rejectedCount).toBe(totalConcurrentRequests - capacity);

        // Check that final remaining token count is 0
        const postCheck = await checkTokenBucket(keyId, params);
        expect(postCheck.allowed).toBe(false);
        expect(postCheck.remaining).toBe(0);
      } finally {
        await cleanupRedisKey(keyId);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Case 6: Different API keys → independent rate limits
  // -------------------------------------------------------------------------
  describe('Case 6: Independent token buckets for distinct API keys', () => {
    it('should maintain completely isolated token buckets across different API keys', async () => {
      const keyA = generateTestKey('client_alpha');
      const keyB = generateTestKey('client_beta');
      const params: TokenBucketParams = { capacity: 2, refillRate: 0.1 };

      try {
        // Completely exhaust Key A
        const a1 = await checkTokenBucket(keyA, params);
        const a2 = await checkTokenBucket(keyA, params);
        const a3 = await checkTokenBucket(keyA, params);

        expect(a1.allowed).toBe(true);
        expect(a2.allowed).toBe(true);
        expect(a3.allowed).toBe(false); // Key A is blocked

        // Key B must have its full capacity completely untouched
        const b1 = await checkTokenBucket(keyB, params);
        expect(b1.allowed).toBe(true);
        expect(b1.remaining).toBe(1);

        const b2 = await checkTokenBucket(keyB, params);
        expect(b2.allowed).toBe(true);
        expect(b2.remaining).toBe(0);

        // Key B only blocks when its own bucket is depleted
        const b3 = await checkTokenBucket(keyB, params);
        expect(b3.allowed).toBe(false);
      } finally {
        await cleanupRedisKey(keyA);
        await cleanupRedisKey(keyB);
      }
    });
  });
});
