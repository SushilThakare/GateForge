/**
 * @file packages/gateway/tests/integration/fullLifecycle.integration.test.ts
 * @description End-to-end integration test suite validating the complete GateForge request lifecycle.
 *
 * Architecture Context:
 * Positioned in `packages/gateway/tests/integration/`.
 * Executes against live PostgreSQL and Redis instances (running via Docker Compose or local daemons).
 * Tests the end-to-end flow spanning:
 * 1. Express perimeter proxy gateway
 * 2. API key authentication & credential rotation
 * 3. Redis-backed sliding window rate limiting
 * 4. Asynchronous telemetry ingestion via BullMQ worker
 * 5. Edge error boundaries (400, 401, 429, 502)
 */

import request from 'supertest';
import { Express } from 'express';
import { Worker, Job } from 'bullmq';
import { ApiKeyScope, RateLimitStrategy } from '@prisma/client';
import { createGatewayApp } from '../../src/index.js';
import { prisma } from '../../src/lib/prisma.js';
import { redis } from '../../src/lib/redis.js';
import { closeRequestLogsQueue } from '../../src/queue/logProducer.js';
import {
  FIXTURE_CONSTANTS,
  cleanTestDatabase,
  seedTestApiKey,
} from '../fixtures/testFixtures.js';
import {
  REQUEST_LOGS_QUEUE_NAME,
  processLogJob,
  flushBatch,
  startBatchTimers,
  stopLogProcessor,
} from '../../../worker/src/processors/logProcessor.js';
import { createWorkerRedisClient } from '../../../worker/src/lib/redis.js';

// Top-level Jest timeout
jest.setTimeout(30000);

describe('GateForge Full Lifecycle Integration Test Suite', () => {
  let app: Express;
  let testWorker: Worker;

  beforeAll(async () => {
    // 1. Verify Redis connectivity
    try {
      const pingRes = await redis.ping();
      expect(pingRes).toBe('PONG');
    } catch (redisErr: unknown) {
      throw new Error(
        `Redis connection check failed: ${
          redisErr instanceof Error ? redisErr.message : String(redisErr)
        }. Ensure Redis container is running.`
      );
    }

    // 2. Verify PostgreSQL connectivity via Prisma
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (dbErr: unknown) {
      throw new Error(
        `PostgreSQL connection check failed: ${
          dbErr instanceof Error ? dbErr.message : String(dbErr)
        }. Ensure PostgreSQL container is running.`
      );
    }

    // 3. Clean test database of stale records
    await cleanTestDatabase();

    // 4. Instantiate Express Gateway application
    app = createGatewayApp();

    // 5. Start background worker instance with maxRetriesPerRequest: null
    startBatchTimers();
    testWorker = new Worker(
      REQUEST_LOGS_QUEUE_NAME,
      async (job: Job) => {
        await processLogJob(job);
      },
      {
        connection: createWorkerRedisClient(),
        concurrency: 5,
      }
    );
  });

  afterAll(async () => {
    // Teardown worker and timers
    try {
      if (testWorker) {
        await testWorker.close(true);
      }
      await closeRequestLogsQueue();
      await stopLogProcessor();
      // Purge test keys and logs generated during test run
      await cleanTestDatabase();
    } catch (cleanupErr: unknown) {
      console.warn('[afterAll] Teardown warning:', cleanupErr);
    }
  }, 15000);

  // ──────────────────────────────────────────────────────────────────────────
  // Scenario 1: End-to-end Request Lifecycle
  // ──────────────────────────────────────────────────────────────────────────
  describe('Scenario 1: End-to-End Request Lifecycle', () => {
    it('should create an API key, proxy requests, persist logs via worker, and expose analytics', async () => {
      // Step A: Create API key as Administrator
      const createRes = await request(app)
        .post('/api/keys')
        .set('X-API-Key', FIXTURE_CONSTANTS.ADMIN_KEY_HEADER)
        .send({
          name: `${FIXTURE_CONSTANTS.TEST_KEY_PREFIX} E2E Analytics Key`,
          scopes: [ApiKeyScope.READ, ApiKeyScope.WRITE],
          rateLimit: 500,
        })
        .expect(201);

      expect(createRes.body.apiKey).toBeDefined();
      expect(createRes.body.keyDetails.id).toBeDefined();

      const clientApiKey = createRes.body.apiKey as string;
      const clientKeyId = createRes.body.keyDetails.id as string;

      // Step B: Make proxied request through Gateway using the created key
      const proxyRes = await request(app)
        .get('/v1/proxy/users/profile')
        .set('X-API-Key', clientApiKey)
        .expect(200);

      expect(proxyRes.body.message).toBe('Proxy request received and authenticated');
      expect(proxyRes.body.client.id).toBe(clientKeyId);
      expect(proxyRes.headers['x-ratelimit-limit']).toBeDefined();
      expect(proxyRes.headers['x-ratelimit-remaining']).toBeDefined();

      // Step C: Wait briefly for job to reach worker and flush batch buffer to PostgreSQL
      await new Promise((resolve) => setTimeout(resolve, 500));
      await flushBatch();

      // Verify log was persisted in the RequestLog table
      const persistedLogs = await prisma.requestLog.findMany({
        where: { apiKeyId: clientKeyId },
      });

      expect(persistedLogs.length).toBeGreaterThanOrEqual(1);
      const targetLog = persistedLogs[0];
      expect(targetLog.path).toBe('/v1/proxy/users/profile');
      expect(targetLog.method).toBe('GET');
      expect(targetLog.statusCode).toBe(200);
      expect(targetLog.responseTimeMs).toBeGreaterThanOrEqual(0);

      // Step D: Check analytics aggregation endpoint
      const statsRes = await request(app)
        .get('/api/logs/stats')
        .set('X-API-Key', FIXTURE_CONSTANTS.ADMIN_KEY_HEADER)
        .query({ timeRange: '1h', apiKeyId: clientKeyId })
        .expect(200);

      expect(statsRes.body.totalRequests).toBeGreaterThanOrEqual(1);
      expect(statsRes.body.statusBreakdown.status2xx).toBeGreaterThanOrEqual(1);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Scenario 2: Rate Limiting Enforcement & Reset
  // ──────────────────────────────────────────────────────────────────────────
  describe('Scenario 2: Rate Limiting & Window Reset', () => {
    it('should allow N requests, reject the (N+1)th with 429, and allow requests after window reset', async () => {
      // Arrange: Seed an API key with a 2-request quota over a 2-second sliding window
      const { key, record } = await seedTestApiKey({
        name: 'Rate Limit Window Key',
        rateLimitConfig: {
          strategy: RateLimitStrategy.SLIDING_WINDOW,
          windowSeconds: 2,
          maxRequests: 2,
        },
      });

      // Request 1: Should succeed (Remaining: 1)
      const res1 = await request(app)
        .get('/v1/proxy/test/quota')
        .set('X-API-Key', key)
        .expect(200);
      expect(res1.headers['x-ratelimit-remaining']).toBe('1');

      // Request 2: Should succeed (Remaining: 0)
      const res2 = await request(app)
        .get('/v1/proxy/test/quota')
        .set('X-API-Key', key)
        .expect(200);
      expect(res2.headers['x-ratelimit-remaining']).toBe('0');

      // Request 3 (N+1): Should be rejected with 429 Too Many Requests
      const res3 = await request(app)
        .get('/v1/proxy/test/quota')
        .set('X-API-Key', key)
        .expect(429);

      expect(res3.body.error).toBe('Rate limit exceeded');
      expect(res3.headers['retry-after']).toBeDefined();
      expect(parseInt(res3.headers['retry-after'], 10)).toBeGreaterThanOrEqual(1);

      // Wait for the 2-second window duration to expire
      await new Promise((resolve) => setTimeout(resolve, 2200));

      // Request 4: Window has reset -> request should now be accepted
      const res4 = await request(app)
        .get('/v1/proxy/test/quota')
        .set('X-API-Key', key)
        .expect(200);

      expect(res4.body.message).toBe('Proxy request received and authenticated');
      expect(res4.headers['x-ratelimit-remaining']).toBe('1');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Scenario 3: API Key Management Lifecycle
  // ──────────────────────────────────────────────────────────────────────────
  describe('Scenario 3: API Key Management (Create, Use, Rotate, Revoke)', () => {
    it('should complete key lifecycle: create -> use -> rotate -> verify old fails/new works -> revoke -> verify all fail', async () => {
      // 1. Create API key
      const createRes = await request(app)
        .post('/api/keys')
        .set('X-API-Key', FIXTURE_CONSTANTS.ADMIN_KEY_HEADER)
        .send({
          name: `${FIXTURE_CONSTANTS.TEST_KEY_PREFIX} Lifecycle Management Key`,
          scopes: [ApiKeyScope.READ],
          rateLimit: 100,
        })
        .expect(201);

      const originalKey = createRes.body.apiKey as string;
      const keyId = createRes.body.keyDetails.id as string;

      // 2. Use API key -> should succeed
      await request(app)
        .get('/v1/proxy/lifecycle')
        .set('X-API-Key', originalKey)
        .expect(200);

      // 3. Rotate key secret
      const rotateRes = await request(app)
        .post(`/api/keys/${keyId}/rotate`)
        .set('X-API-Key', FIXTURE_CONSTANTS.ADMIN_KEY_HEADER)
        .expect(200);

      const rotatedKey = rotateRes.body.newApiKey as string;
      expect(rotatedKey).toBeDefined();
      expect(rotatedKey).not.toBe(originalKey);

      // 4. Old key must now fail with 401 Unauthorized
      const oldKeyAttempt = await request(app)
        .get('/v1/proxy/lifecycle')
        .set('X-API-Key', originalKey)
        .expect(401);

      expect(oldKeyAttempt.body.error).toBe('Unauthorized');

      // 5. New rotated key must work with 200 OK
      const newKeyAttempt = await request(app)
        .get('/v1/proxy/lifecycle')
        .set('X-API-Key', rotatedKey)
        .expect(200);

      expect(newKeyAttempt.body.message).toBe('Proxy request received and authenticated');

      // 6. Revoke key (soft delete)
      await request(app)
        .delete(`/api/keys/${keyId}`)
        .set('X-API-Key', FIXTURE_CONSTANTS.ADMIN_KEY_HEADER)
        .expect(200);

      // 7. All requests with revoked key must fail with 401 Unauthorized
      const revokedAttempt = await request(app)
        .get('/v1/proxy/lifecycle')
        .set('X-API-Key', rotatedKey)
        .expect(401);

      expect(revokedAttempt.body.error).toBe('Unauthorized');
      expect(revokedAttempt.body.message).toContain('deactivated');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Scenario 4: Worker Processing Telemetry Within 10 Seconds
  // ──────────────────────────────────────────────────────────────────────────
  describe('Scenario 4: Worker Telemetry Batch Processing', () => {
    it('should consume enqueued requests and persist logs to PostgreSQL within 10 seconds', async () => {
      // Arrange: Seed fresh key for isolated telemetry tracking
      const { key, record } = await seedTestApiKey({
        name: 'Worker Telemetry Key',
      });

      // Send 3 requests through Gateway proxy
      await request(app)
        .get('/v1/proxy/test/telemetry-1')
        .set('X-API-Key', key)
        .expect(200);

      await request(app)
        .get('/v1/proxy/test/telemetry-2')
        .set('X-API-Key', key)
        .expect(200);

      await request(app)
        .get('/v1/proxy/test/telemetry-3')
        .set('X-API-Key', key)
        .expect(200);

      // Worker automatically flushes every 5 seconds (BATCH_FLUSH_INTERVAL_MS).
      // Poll PostgreSQL until logs are persisted, up to a strict 10 second timeout.
      const startTime = Date.now();
      const MAX_WAIT_MS = 10000;
      let logsInDb: Array<{ id: string; path: string; statusCode: number }> = [];

      while (Date.now() - startTime < MAX_WAIT_MS) {
        logsInDb = await prisma.requestLog.findMany({
          where: { apiKeyId: record.id },
          select: { id: true, path: true, statusCode: true },
        });

        if (logsInDb.length >= 3) {
          break;
        }

        // Wait 500ms before next poll attempt
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      // Assert that all 3 logs appeared in the database within the 10-second threshold
      expect(logsInDb.length).toBeGreaterThanOrEqual(3);
      const paths = logsInDb.map((l) => l.path);
      expect(paths).toContain('/v1/proxy/test/telemetry-1');
      expect(paths).toContain('/v1/proxy/test/telemetry-2');
      expect(paths).toContain('/v1/proxy/test/telemetry-3');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Scenario 5: Error Handling Boundaries
  // ──────────────────────────────────────────────────────────────────────────
  describe('Scenario 5: Error Handling (401, 400, 502)', () => {
    it('should return 401 Unauthorized for missing or invalid API keys', async () => {
      // 1. Missing header
      const missingRes = await request(app)
        .get('/v1/proxy/test')
        .expect(401);

      expect(missingRes.body.error).toBe('Unauthorized');
      expect(missingRes.body.message).toContain('Missing API key');

      // 2. Non-existent / invalid key
      const invalidRes = await request(app)
        .get('/v1/proxy/test')
        .set('X-API-Key', 'gf_live_completely_fake_invalid_secret_key')
        .expect(401);

      expect(invalidRes.body.error).toBe('Unauthorized');
      expect(invalidRes.body.message).toContain('Invalid API key');
    });

    it('should return 400 Bad Request for malformed JSON or validation errors', async () => {
      // 1. Malformed JSON payload (triggers JSON parse syntax error in express.json)
      const malformedJsonRes = await request(app)
        .post('/api/keys')
        .set('X-API-Key', FIXTURE_CONSTANTS.ADMIN_KEY_HEADER)
        .set('Content-Type', 'application/json')
        .send('{ "invalid_json": true, ') // deliberately unclosed JSON syntax
        .expect(400);

      expect(malformedJsonRes.body.error).toBe('Bad Request');
      expect(malformedJsonRes.body.message).toContain('Malformed request payload');

      // 2. Schema validation error (violates Zod schema constraints: empty name, negative limit)
      const schemaValidationRes = await request(app)
        .post('/api/keys')
        .set('X-API-Key', FIXTURE_CONSTANTS.ADMIN_KEY_HEADER)
        .send({
          name: '',
          rateLimit: -50,
        })
        .expect(400);

      expect(schemaValidationRes.body.error).toBe('Validation Error');
      expect(schemaValidationRes.body.details).toBeDefined();
    });

    it('should return 502 Bad Gateway when upstream target service is down or unreachable', async () => {
      const { key } = await seedTestApiKey({ name: 'Target Down Key' });

      // Specify an upstream target on an unopened local port (guaranteed ECONNREFUSED)
      const targetDownRes = await request(app)
        .get('/v1/proxy/test/service-unreachable')
        .set('X-API-Key', key)
        .set('X-Target-Url', 'http://127.0.0.1:59997')
        .expect(502);

      expect(targetDownRes.body.error).toBe('Bad Gateway');
      expect(targetDownRes.body.message).toContain('Upstream target service is unavailable');
    });
  });
});
