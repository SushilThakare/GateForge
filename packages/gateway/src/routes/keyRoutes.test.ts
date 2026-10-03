/**
 * @file packages/gateway/src/routes/keyRoutes.test.ts
 * @description Unit tests for key management routes, Zod schemas, scope guards, and masking.
 */

import { Request, Response } from 'express';
import { ApiKeyScope } from '@prisma/client';
import { createApiKeySchema, updateApiKeySchema, keyIdParamSchema } from './keyRoutes.js';
import { maskApiKey, generateApiKeyString } from '../utils/keyGenerator.js';
import { requireScope } from '../auth/requireScope.js';
import { redis } from '../lib/redis.js';
import { prisma } from '../lib/prisma.js';

/**
 * Helper to construct a mock Express response object.
 */
function createMockResponse() {
  const res: Partial<Response> & { statusCode: number; jsonBody: unknown } = {
    statusCode: 200,
    jsonBody: null,
    status(code: number) {
      this.statusCode = code;
      return this as unknown as Response;
    },
    json(body: unknown) {
      this.jsonBody = body;
      return this as unknown as Response;
    },
  };
  return res;
}

async function runKeyManagementTests(): Promise<void> {
  console.log('[Test] Running Key Management & Validation tests...');

  // 1. Test Key Generator
  {
    const generated = generateApiKeyString('gf_live_');
    if (!generated.startsWith('gf_live_') || generated.length !== 8 + 64) {
      throw new Error(`Test 1 Failed: Unexpected generated key format: ${generated}`);
    }
    console.log('✓ Test 1: generateApiKeyString produces valid 32-byte (64-hex char) prefixed keys');
  }

  // 2. Test Key Masking
  {
    const sampleKey = 'gf_live_11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff';
    const masked = maskApiKey(sampleKey);
    if (!masked.startsWith('gf_live_') || !masked.endsWith('ccddeeff') || masked.includes('112233445566')) {
      throw new Error(`Test 2 Failed: Key masking did not mask secret or preserve suffix: ${masked}`);
    }
    console.log('✓ Test 2: maskApiKey securely masks middle characters while preserving suffix');
  }

  // 3. Test Zod createApiKeySchema validation
  {
    // Valid case
    const valid = createApiKeySchema.safeParse({
      name: 'Analytics Service Key',
      scopes: [ApiKeyScope.READ, ApiKeyScope.WRITE],
      rateLimit: 250,
    });
    if (!valid.success) {
      throw new Error('Test 3a Failed: Valid create schema was rejected');
    }

    // Invalid rateLimit (negative)
    const invalidRate = createApiKeySchema.safeParse({
      name: 'Invalid Key',
      scopes: [ApiKeyScope.READ],
      rateLimit: -10,
    });
    if (invalidRate.success) {
      throw new Error('Test 3b Failed: Negative rateLimit was incorrectly accepted');
    }

    // Invalid scope
    const invalidScope = createApiKeySchema.safeParse({
      name: 'Invalid Scope Key',
      scopes: ['SUPERUSER'],
    });
    if (invalidScope.success) {
      throw new Error('Test 3c Failed: Unknown scope string was incorrectly accepted');
    }
    console.log('✓ Test 3: createApiKeySchema enforces strict schema, scope enum, and positive rate limit');
  }

  // 4. Test Zod updateApiKeySchema
  {
    const validUpdate = updateApiKeySchema.safeParse({
      rateLimit: 500,
    });
    if (!validUpdate.success) {
      throw new Error('Test 4a Failed: Valid partial update was rejected');
    }

    const emptyUpdate = updateApiKeySchema.safeParse({});
    if (emptyUpdate.success) {
      throw new Error('Test 4b Failed: Empty update payload should be rejected');
    }
    console.log('✓ Test 4: updateApiKeySchema validates partial updates and rejects empty bodies');
  }

  // 5. Test Zod UUID Param Schema
  {
    const validUuid = keyIdParamSchema.safeParse({ id: '550e8400-e29b-41d4-a716-446655440000' });
    const invalidUuid = keyIdParamSchema.safeParse({ id: 'non-uuid-string' });
    if (!validUuid.success || invalidUuid.success) {
      throw new Error('Test 5 Failed: UUID parameter validator failed');
    }
    console.log('✓ Test 5: keyIdParamSchema enforces strict UUID format');
  }

  // 6. Test requireScope middleware
  {
    const adminMiddleware = requireScope(ApiKeyScope.ADMIN);

    // Case A: Missing ADMIN scope -> 403 Forbidden
    const nonAdminReq = {
      apiKey: {
        id: 'user-key',
        key: 'gf_read',
        name: 'Read Only Key',
        scopes: [ApiKeyScope.READ],
        rateLimit: 100,
      },
      path: '/api/keys',
    } as unknown as Request;
    const resForbidden = createMockResponse();
    let nextCalled = false;
    adminMiddleware(nonAdminReq, resForbidden as unknown as Response, () => { nextCalled = true; });

    if (resForbidden.statusCode !== 403 || nextCalled) {
      throw new Error(`Test 6a Failed: Expected 403 for non-admin, got ${resForbidden.statusCode}`);
    }

    // Case B: Has ADMIN scope -> next() called
    const adminReq = {
      apiKey: {
        id: 'admin-key',
        key: 'gf_admin',
        name: 'Admin Key',
        scopes: [ApiKeyScope.ADMIN, ApiKeyScope.WRITE],
        rateLimit: 1000,
      },
      path: '/api/keys',
    } as unknown as Request;
    const resAllowed = createMockResponse();
    let adminNextCalled = false;
    adminMiddleware(adminReq, resAllowed as unknown as Response, () => { adminNextCalled = true; });

    if (!adminNextCalled || resAllowed.statusCode !== 200) {
      throw new Error('Test 6b Failed: next() was not called for admin-scoped request');
    }
    console.log('✓ Test 6: requireScope correctly rejects non-ADMIN callers with 403 and permits ADMIN callers');
  }

  console.log('[Test] All Key Management unit tests passed successfully!');
}

runKeyManagementTests()
  .then(async () => {
    try {
      await redis.quit();
      await prisma.$disconnect();
    } catch {
      // Ignore cleanup error
    }
    process.exit(0);
  })
  .catch((err) => {
    console.error('[Test Failure]:', err);
    process.exit(1);
  });
