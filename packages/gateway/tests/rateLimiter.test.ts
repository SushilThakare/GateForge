/**
 * @file packages/gateway/tests/rateLimiter.test.ts
 * @description Integration tests for rateLimiter facade and rateLimitMiddleware Express adapter.
 *
 * Architecture Context:
 * Located in `packages/gateway/tests/`, this test suite validates the integration between
 * the public rate-limiting facade (`src/rateLimit/rateLimiter.ts`), the Express middleware
 * (`src/rateLimit/rateLimitMiddleware.ts`), and a live Redis store. It ensures dynamic
 * strategy switching, HTTP header formatting (X-RateLimit-*), and RFC 6585 compliant
 * HTTP 429 JSON responses with Retry-After headers.
 */

import { Request, Response, NextFunction } from 'express';
import {
  applyRateLimit,
  resolveRateLimitConfig,
  RateLimitStrategy,
  ResolvedRateLimitConfig,
} from '../src/rateLimit/rateLimiter.js';
import { rateLimitMiddleware } from '../src/rateLimit/rateLimitMiddleware.js';
import { AuthenticatedApiKey } from '../src/auth/apiKeyAuth.js';
import { ApiKeyScope } from '@prisma/client';
import { redis } from '../src/lib/redis.js';

describe('Rate Limiter Facade & Middleware Integration Tests', () => {
  const TEST_KEY_PREFIX = 'test_facade_';

  function generateKeyId(suffix: string): string {
    return `${TEST_KEY_PREFIX}${suffix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  }

  /**
   * Creates a mock Express Response object capturing status codes, JSON payloads, and headers.
   */
  function createMockResponse() {
    const headers: Record<string, string | number> = {};
    const res: Partial<Response> & {
      statusCode: number;
      jsonPayload: Record<string, unknown> | null;
      headers: Record<string, string | number>;
    } = {
      statusCode: 200,
      jsonPayload: null,
      headers,
      setHeader(name: string, value: string | number) {
        this.headers[name] = value;
        return this as unknown as Response;
      },
      status(code: number) {
        this.statusCode = code;
        return this as unknown as Response;
      },
      json(payload: Record<string, unknown>) {
        this.jsonPayload = payload;
        return this as unknown as Response;
      },
    };
    return res;
  }

  afterAll(async () => {
    try {
      const rlKeys = await redis.keys(`rl:${TEST_KEY_PREFIX}*`);
      const tbKeys = await redis.keys(`tb:${TEST_KEY_PREFIX}*`);
      const allKeys = [...rlKeys, ...tbKeys];
      if (allKeys.length > 0) {
        await redis.del(...allKeys);
      }
    } catch (err: unknown) {
      console.warn('[Test Cleanup Warning] Rate limiter facade cleanup error:', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // -------------------------------------------------------------------------
  // Facade Algorithm Switching
  // -------------------------------------------------------------------------
  describe('Facade Strategy Switching', () => {
    it('should switch to Sliding Window when strategy is SLIDING_WINDOW', async () => {
      const keyId = generateKeyId('sw_strategy');
      const config: ResolvedRateLimitConfig = {
        strategy: RateLimitStrategy.SLIDING_WINDOW,
        limit: 5,
        windowMs: 60000,
        capacity: 5,
        refillRate: 1,
      };

      const result = await applyRateLimit(keyId, config);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);

      // Verify Redis Sorted Set key was created (rl:<keyId>)
      const exists = await redis.exists(`rl:${keyId}`);
      expect(exists).toBe(1);

      await redis.del(`rl:${keyId}`);
    });

    it('should switch to Token Bucket when strategy is TOKEN_BUCKET', async () => {
      const keyId = generateKeyId('tb_strategy');
      const config: ResolvedRateLimitConfig = {
        strategy: RateLimitStrategy.TOKEN_BUCKET,
        limit: 10,
        windowMs: 60000,
        capacity: 8,
        refillRate: 2,
      };

      const result = await applyRateLimit(keyId, config);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(7); // 8 capacity - 1 consumed = 7

      // Verify Redis Hash key was created (tb:<keyId>)
      const exists = await redis.exists(`tb:${keyId}`);
      expect(exists).toBe(1);

      await redis.del(`tb:${keyId}`);
    });

    it('should resolve config with defaults when rateLimitConfig row is missing', () => {
      const apiKey: AuthenticatedApiKey = {
        id: 'legacy-key-id',
        key: 'gf_live_legacy',
        name: 'Legacy Client',
        scopes: [ApiKeyScope.READ],
        rateLimit: 50,
      };

      const resolved = resolveRateLimitConfig(apiKey);
      expect(resolved.strategy).toBe(RateLimitStrategy.SLIDING_WINDOW);
      expect(resolved.limit).toBe(50);
      expect(resolved.windowMs).toBe(60000);
      expect(resolved.capacity).toBe(50);
    });
  });

  // -------------------------------------------------------------------------
  // Middleware Integration: Headers and 429 Responses
  // -------------------------------------------------------------------------
  describe('rateLimitMiddleware Integration', () => {
    it('should attach X-RateLimit-* headers and invoke next() when request is allowed', async () => {
      const keyId = generateKeyId('mw_pass');
      const req = {
        apiKey: {
          id: keyId,
          key: 'gf_live_mock',
          name: 'Passing Client',
          scopes: [ApiKeyScope.READ],
          rateLimit: 100,
          rateLimitConfig: {
            strategy: 'SLIDING_WINDOW' as const,
            windowSeconds: 60,
            maxRequests: 10,
            capacity: null,
            refillRate: null,
          },
        },
      } as unknown as Request;

      const res = createMockResponse();
      let nextCalled = false;
      const next: NextFunction = () => {
        nextCalled = true;
      };

      await rateLimitMiddleware(req, res as unknown as Response, next);

      expect(nextCalled).toBe(true);
      expect(res.headers['X-RateLimit-Limit']).toBe(10);
      expect(res.headers['X-RateLimit-Remaining']).toBe(9);
      expect(res.headers['X-RateLimit-Strategy']).toBe('SLIDING_WINDOW');
      expect(res.headers['X-RateLimit-Reset']).toBeDefined();

      await redis.del(`rl:${keyId}`);
    });

    it('should return HTTP 429 with Retry-After header and JSON body when quota is exceeded', async () => {
      const keyId = generateKeyId('mw_throttle');
      const req = {
        apiKey: {
          id: keyId,
          key: 'gf_live_mock_throttled',
          name: 'Throttled Client',
          scopes: [ApiKeyScope.READ],
          rateLimit: 1,
          rateLimitConfig: {
            strategy: 'SLIDING_WINDOW' as const,
            windowSeconds: 60,
            maxRequests: 1,
            capacity: null,
            refillRate: null,
          },
        },
      } as unknown as Request;

      // 1st request: allowed
      const res1 = createMockResponse();
      let nextCalled1 = false;
      await rateLimitMiddleware(req, res1 as unknown as Response, () => {
        nextCalled1 = true;
      });
      expect(nextCalled1).toBe(true);

      // 2nd request: exceeded limit
      const res2 = createMockResponse();
      let nextCalled2 = false;
      await rateLimitMiddleware(req, res2 as unknown as Response, () => {
        nextCalled2 = true;
      });

      expect(nextCalled2).toBe(false);
      expect(res2.statusCode).toBe(429);
      expect(res2.headers['Retry-After']).toBeGreaterThanOrEqual(1);
      expect(res2.headers['X-RateLimit-Remaining']).toBe(0);

      // Verify exact JSON body format: { error: "Rate limit exceeded", retryAfter: <number> }
      expect(res2.jsonPayload).toEqual(
        expect.objectContaining({
          error: 'Rate limit exceeded',
          retryAfter: expect.any(Number),
        })
      );

      await redis.del(`rl:${keyId}`);
    });
  });
});
