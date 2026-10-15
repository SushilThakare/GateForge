/**
 * @file packages/gateway/tests/fixtures/testFixtures.ts
 * @description Test fixtures and data seeding utilities for GateForge integration testing.
 *
 * Architecture Context:
 * Positioned in the test support tier (`packages/gateway/tests/fixtures/`).
 * Manages database population, Redis cache cleansing, and deterministic test identities
 * so integration tests run against isolated state without leaking records across suites.
 */

import { ApiKey, ApiKeyScope, RateLimitStrategy } from '@prisma/client';
import { prisma } from '../../src/lib/prisma.js';
import { redis } from '../../src/lib/redis.js';
import { generateApiKeyString } from '../../src/utils/keyGenerator.js';

/**
 * Standard test environment keys and names.
 */
export const FIXTURE_CONSTANTS = {
  ADMIN_KEY_HEADER: process.env.GATEWAY_ADMIN_KEY || 'gf_admin_dashboard_key',
  TEST_KEY_PREFIX: '[Integration Test]',
} as const;

/**
 * Parameters for creating an ephemeral test API key.
 */
export interface CreateTestKeyParams {
  name?: string;
  scopes?: ApiKeyScope[];
  rateLimit?: number;
  isActive?: boolean;
  rateLimitConfig?: {
    strategy: RateLimitStrategy;
    windowSeconds: number;
    maxRequests: number;
    capacity?: number;
    refillRate?: number;
  };
}

/**
 * Seeds a fresh API key directly into PostgreSQL with optional rate limit config.
 * Bypasses HTTP routing to allow tests to arrange their prerequisites deterministically.
 *
 * @param {CreateTestKeyParams} params - Configuration options for the seeded key
 * @returns {Promise<{ key: string; record: ApiKey }>} The plaintext secret and database record
 */
export async function seedTestApiKey(
  params: CreateTestKeyParams = {}
): Promise<{ key: string; record: ApiKey }> {
  try {
    const rawKey = generateApiKeyString('gf_test_');
    const name = `${FIXTURE_CONSTANTS.TEST_KEY_PREFIX} ${params.name || 'Standard Client'} ${Date.now()}`;

    const record = await prisma.apiKey.create({
      data: {
        name,
        key: rawKey,
        scopes: params.scopes || [ApiKeyScope.READ],
        rateLimit: params.rateLimit ?? 100,
        isActive: params.isActive ?? true,
        rateLimitConfig: params.rateLimitConfig
          ? {
              create: {
                strategy: params.rateLimitConfig.strategy,
                windowSeconds: params.rateLimitConfig.windowSeconds,
                maxRequests: params.rateLimitConfig.maxRequests,
                capacity: params.rateLimitConfig.capacity ?? null,
                refillRate: params.rateLimitConfig.refillRate ?? null,
              },
            }
          : undefined,
      },
    });

    return { key: rawKey, record };
  } catch (error: unknown) {
    throw new Error(
      `Failed to seed test API key: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Purges all test-generated records from PostgreSQL and matching keys from Redis.
 * Ensures strict test isolation and prevents accumulation of ephemeral test data.
 *
 * @returns {Promise<void>}
 */
export async function cleanTestDatabase(): Promise<void> {
  try {
    // 1. Delete request logs associated with test keys or test paths
    await prisma.requestLog.deleteMany({
      where: {
        OR: [
          { path: { startsWith: '/v1/proxy/test' } },
          { path: { startsWith: '/v1/proxy/lifecycle' } },
          { path: { startsWith: '/v1/proxy/users' } },
          { apiKey: { name: { startsWith: FIXTURE_CONSTANTS.TEST_KEY_PREFIX } } },
        ],
      },
    });

    // 2. Cascade delete rate limit configs and test API keys
    await prisma.apiKey.deleteMany({
      where: {
        name: { startsWith: FIXTURE_CONSTANTS.TEST_KEY_PREFIX },
      },
    });

    // 3. Clear Redis rate limit counters, cached keys, and test BullMQ queue keys
    const redisKeys = await redis.keys('api_key:*');
    const rateLimitKeys = await redis.keys('rl:*');
    const bullKeys = await redis.keys('bull:request-logs*');
    const allKeys = [...redisKeys, ...rateLimitKeys, ...bullKeys];

    if (allKeys.length > 0) {
      await redis.del(...allKeys);
    }
  } catch (error: unknown) {
    console.warn('[cleanTestDatabase] Error during cleanup:', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Helper to invalidate Redis cache for a specific API key string.
 *
 * @param {string} rawKey - Plaintext API key to evict
 * @returns {Promise<void>}
 */
export async function evictKeyFromRedis(rawKey: string): Promise<void> {
  try {
    await redis.del(`api_key:${rawKey}`);
  } catch (error: unknown) {
    console.warn(`[evictKeyFromRedis] Failed to delete cache for key ${rawKey}:`, error);
  }
}
