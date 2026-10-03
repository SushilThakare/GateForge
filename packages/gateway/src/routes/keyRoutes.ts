/**
 * @file packages/gateway/src/routes/keyRoutes.ts
 * @description Administrative REST endpoints for managing API keys in GateForge.
 * Supports CRUD operations, credential rotation, soft deletion (revocation), and key masking.
 * All routes require authentication and ADMIN scope authorization.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { ApiKeyScope } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
import { generateApiKeyString, maskApiKey } from '../utils/keyGenerator.js';

export const keyRouter: Router = Router();

/**
 * Zod validation schema for creating a new API key.
 */
export const createApiKeySchema = z.object({
  name: z
    .string({ required_error: 'Name is required' })
    .min(1, 'Name must contain at least 1 character')
    .max(100, 'Name must not exceed 100 characters')
    .trim(),
  scopes: z
    .array(z.nativeEnum(ApiKeyScope), {
      invalid_type_error: 'Scopes must be an array of valid ApiKeyScope values (READ, WRITE, ADMIN)',
    })
    .min(1, 'At least one scope must be assigned')
    .default([ApiKeyScope.READ]),
  rateLimit: z
    .number({ invalid_type_error: 'Rate limit must be a positive integer' })
    .int('Rate limit must be an integer')
    .positive('Rate limit must be greater than 0')
    .default(100),
});

/**
 * Zod validation schema for updating an existing API key.
 */
export const updateApiKeySchema = z
  .object({
    name: z.string().min(1).max(100).trim().optional(),
    scopes: z.array(z.nativeEnum(ApiKeyScope)).min(1).optional(),
    rateLimit: z.number().int().positive().optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    { message: 'At least one field (name, scopes, rateLimit, isActive) must be provided for update' }
  );

/**
 * Zod validation schema for UUID route parameters.
 */
export const keyIdParamSchema = z.object({
  id: z.string().uuid('Invalid API key ID format. Must be a valid UUID.'),
});

/**
 * Type inferred from createApiKeySchema
 */
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;

/**
 * Type inferred from updateApiKeySchema
 */
export type UpdateApiKeyInput = z.infer<typeof updateApiKeySchema>;

/**
 * Prefix constant for Redis cache invalidation
 */
const REDIS_KEY_PREFIX = 'api_key:';

/**
 * Helper function to immediately purge a key from Redis cache upon state modification.
 * 
 * @param {string} rawKey - Plaintext API key to purge
 * @returns {Promise<void>}
 */
async function invalidateRedisKeyCache(rawKey: string): Promise<void> {
  try {
    const cacheKey = `${REDIS_KEY_PREFIX}${rawKey}`;
    await redis.del(cacheKey);
  } catch (err) {
    // Non-fatal warning if Redis cache eviction fails; key will expire via TTL regardless
    console.warn('[KeyRoutes Cache Invalidation Warning]:', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * POST /api/keys
 * Creates a new API Key and returns the full plaintext secret once.
 */
keyRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate request body against Zod schema
    const validationResult = createApiKeySchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({
        error: 'Validation Error',
        details: validationResult.error.flatten().fieldErrors,
      });
      return;
    }

    const { name, scopes, rateLimit } = validationResult.data;

    // Generate high-entropy 256-bit API key with live prefix
    const rawKey = generateApiKeyString('gf_live_');

    const createdRecord = await prisma.apiKey.create({
      data: {
        name,
        key: rawKey,
        scopes,
        rateLimit,
        isActive: true,
      },
    });

    // Return the full secret once so the administrator can securely copy it
    res.status(201).json({
      message: 'API key created successfully. Store this secret securely — it will not be displayed again.',
      apiKey: rawKey,
      keyDetails: {
        id: createdRecord.id,
        name: createdRecord.name,
        scopes: createdRecord.scopes,
        rateLimit: createdRecord.rateLimit,
        isActive: createdRecord.isActive,
        createdAt: createdRecord.createdAt,
      },
    });
  } catch (error) {
    console.error('[KeyRoutes POST /api/keys Error]:', {
      error: error instanceof Error ? error.message : String(error),
      attemptedBy: req.apiKey?.id,
    });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create API key.',
    });
  }
});

/**
 * GET /api/keys
 * Lists all API keys in the database with masked secrets.
 */
keyRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const keys = await prisma.apiKey.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        key: true,
        name: true,
        scopes: true,
        rateLimit: true,
        isActive: true,
        lastUsedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Mask the plaintext key so credentials are never exposed in bulk list responses
    const maskedKeys = keys.map((k) => ({
      ...k,
      key: maskApiKey(k.key),
    }));

    res.status(200).json({
      keys: maskedKeys,
      count: maskedKeys.length,
    });
  } catch (error) {
    console.error('[KeyRoutes GET /api/keys Error]:', {
      error: error instanceof Error ? error.message : String(error),
      attemptedBy: req.apiKey?.id,
    });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve API keys.',
    });
  }
});

/**
 * DELETE /api/keys/:id
 * Soft deletes an API key by marking isActive as false and evicting it from Redis.
 */
keyRouter.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const paramValidation = keyIdParamSchema.safeParse(req.params);
    if (!paramValidation.success) {
      res.status(400).json({
        error: 'Validation Error',
        details: paramValidation.error.flatten().fieldErrors,
      });
      return;
    }

    const { id } = paramValidation.data;

    const existingKey = await prisma.apiKey.findUnique({
      where: { id },
    });

    if (!existingKey) {
      res.status(404).json({
        error: 'Not Found',
        message: `API key with ID '${id}' does not exist.`,
      });
      return;
    }

    // Soft delete by updating isActive flag to preserve historical audit logs
    const updatedKey = await prisma.apiKey.update({
      where: { id },
      data: { isActive: false },
    });

    // Purge cached key from Redis immediately so deactivated key is rejected right away
    await invalidateRedisKeyCache(existingKey.key);

    res.status(200).json({
      message: 'API key revoked successfully.',
      key: {
        id: updatedKey.id,
        name: updatedKey.name,
        isActive: updatedKey.isActive,
        updatedAt: updatedKey.updatedAt,
      },
    });
  } catch (error) {
    console.error('[KeyRoutes DELETE /api/keys/:id Error]:', {
      error: error instanceof Error ? error.message : String(error),
      targetId: req.params.id,
    });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to revoke API key.',
    });
  }
});

/**
 * PATCH /api/keys/:id
 * Updates API key configuration (name, scopes, rateLimit, isActive) and invalidates Redis cache.
 */
keyRouter.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const paramValidation = keyIdParamSchema.safeParse(req.params);
    if (!paramValidation.success) {
      res.status(400).json({
        error: 'Validation Error',
        details: paramValidation.error.flatten().fieldErrors,
      });
      return;
    }

    const bodyValidation = updateApiKeySchema.safeParse(req.body);
    if (!bodyValidation.success) {
      res.status(400).json({
        error: 'Validation Error',
        details: bodyValidation.error.flatten().fieldErrors,
      });
      return;
    }

    const { id } = paramValidation.data;
    const updateData = bodyValidation.data;

    const existingKey = await prisma.apiKey.findUnique({
      where: { id },
    });

    if (!existingKey) {
      res.status(404).json({
        error: 'Not Found',
        message: `API key with ID '${id}' does not exist.`,
      });
      return;
    }

    const updatedKey = await prisma.apiKey.update({
      where: { id },
      data: updateData,
    });

    // Invalidate Redis cache so updated scopes and rate limits apply on subsequent requests
    await invalidateRedisKeyCache(existingKey.key);

    res.status(200).json({
      message: 'API key updated successfully.',
      key: {
        id: updatedKey.id,
        name: updatedKey.name,
        key: maskApiKey(updatedKey.key),
        scopes: updatedKey.scopes,
        rateLimit: updatedKey.rateLimit,
        isActive: updatedKey.isActive,
        updatedAt: updatedKey.updatedAt,
      },
    });
  } catch (error) {
    console.error('[KeyRoutes PATCH /api/keys/:id Error]:', {
      error: error instanceof Error ? error.message : String(error),
      targetId: req.params.id,
    });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update API key.',
    });
  }
});

/**
 * POST /api/keys/:id/rotate
 * Generates a new key secret for an existing key ID, invalidating the previous secret immediately.
 */
keyRouter.post('/:id/rotate', async (req: Request, res: Response): Promise<void> => {
  try {
    const paramValidation = keyIdParamSchema.safeParse(req.params);
    if (!paramValidation.success) {
      res.status(400).json({
        error: 'Validation Error',
        details: paramValidation.error.flatten().fieldErrors,
      });
      return;
    }

    const { id } = paramValidation.data;

    const existingKey = await prisma.apiKey.findUnique({
      where: { id },
    });

    if (!existingKey) {
      res.status(404).json({
        error: 'Not Found',
        message: `API key with ID '${id}' does not exist.`,
      });
      return;
    }

    // Generate fresh 32-byte secret
    const newRawKey = generateApiKeyString('gf_live_');

    // Update the key secret in PostgreSQL
    const updatedRecord = await prisma.apiKey.update({
      where: { id },
      data: {
        key: newRawKey,
      },
    });

    // Invalidate the old key secret in Redis immediately so old credentials cease to work
    await invalidateRedisKeyCache(existingKey.key);

    res.status(200).json({
      message: 'API key rotated successfully. The old key has been invalidated immediately.',
      newApiKey: newRawKey,
      keyDetails: {
        id: updatedRecord.id,
        name: updatedRecord.name,
        scopes: updatedRecord.scopes,
        rateLimit: updatedRecord.rateLimit,
        isActive: updatedRecord.isActive,
        updatedAt: updatedRecord.updatedAt,
      },
    });
  } catch (error) {
    console.error('[KeyRoutes POST /api/keys/:id/rotate Error]:', {
      error: error instanceof Error ? error.message : String(error),
      targetId: req.params.id,
    });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to rotate API key.',
    });
  }
});
