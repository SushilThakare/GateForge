/**
 * @file packages/gateway/src/auth/apiKeyAuth.ts
 * @description API Key authentication and authorization middleware for GateForge.
 * Positioned in the early Express middleware chain directly after CORS/body-parsing.
 * Validates the caller credentials against Redis cache or PostgreSQL, attaches key metadata
 * to the request context for downstream rate limiters and proxies, and asynchronously records usage.
 */

import { Request, Response, NextFunction } from 'express';
import { ApiKeyScope } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';

/**
 * Structured API Key metadata attached to the Express Request for downstream middleware consumption.
 */
export interface AuthenticatedApiKey {
  id: string;
  key: string;
  name: string;
  scopes: ApiKeyScope[];
  rateLimit: number;
}

// Augment the Express Request type declaration so downstream middleware and route handlers
// can access req.apiKey with full TypeScript type safety and compile-time autocomplete.
declare global {
  namespace Express {
    interface Request {
      apiKey?: AuthenticatedApiKey;
    }
  }
}

/**
 * Prefix key for Redis caching to avoid key collisions across different gateway domains.
 */
const REDIS_KEY_PREFIX = 'api_key:';

/**
 * Cache expiration TTL in seconds. 60 seconds provides an optimal balance between
 * slashing database roundtrips and keeping key revocation propagation latency low.
 */
const REDIS_CACHE_TTL_SECONDS = 60;

/**
 * Asynchronously updates the lastUsedAt timestamp in PostgreSQL.
 * Executed as 'fire-and-forget' so the incoming request is never blocked waiting for DB write I/O.
 * 
 * @param {string} keyId - Primary key ID of the authenticated API key
 * @returns {void}
 */
export function fireAndForgetLastUsedUpdate(keyId: string): void {
  // Deliberately omitted 'await' to ensure zero latency overhead on the proxy hot path
  prisma.apiKey
    .update({
      where: { id: keyId },
      data: { lastUsedAt: new Date() },
    })
    .catch((err: unknown) => {
      // Catch background errors so unhandled rejections do not terminate the Node process
      console.error('[ApiKeyAuth] Background lastUsedAt update failure:', {
        keyId,
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      });
    });
}

/**
 * Express middleware that extracts and validates API keys from the X-API-Key request header.
 * 
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {NextFunction} next - Express next middleware callback
 * @returns {Promise<void>} Resolves when request is authenticated or rejected
 */
export async function apiKeyAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Extract X-API-Key header (case-insensitive in Express)
    const rawHeader = req.headers['x-api-key'];
    const apiKey = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

    // Reject immediately if header is missing or empty
    if (!apiKey || apiKey.trim() === '') {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing API key. Please provide a valid key via the X-API-Key header.',
      });
      return;
    }

    const trimmedKey = apiKey.trim();
    const cacheKey = `${REDIS_KEY_PREFIX}${trimmedKey}`;

    // 1. Check Redis cache first to bypass expensive relational DB queries on hot path
    try {
      const cachedData = await redis.get(cacheKey);
      if (cachedData) {
        const parsedKey: AuthenticatedApiKey = JSON.parse(cachedData);

        // Attach credential payload to req for downstream rate limiting and routing
        req.apiKey = parsedKey;

        // Fire and forget lastUsedAt timestamp update in background
        fireAndForgetLastUsedUpdate(parsedKey.id);

        next();
        return;
      }
    } catch (cacheError) {
      // If Redis read fails, log warning and gracefully degrade by falling through to PostgreSQL
      console.warn('[ApiKeyAuth] Redis cache read failed, falling back to PostgreSQL:', {
        error: cacheError instanceof Error ? cacheError.message : String(cacheError),
      });
    }

    // 2. Query PostgreSQL via Prisma when cache miss occurs
    const keyRecord = await prisma.apiKey.findUnique({
      where: { key: trimmedKey },
      select: {
        id: true,
        key: true,
        name: true,
        scopes: true,
        rateLimit: true,
        isActive: true,
      },
    });

    // Validate key existence
    if (!keyRecord) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid API key provided.',
      });
      return;
    }

    // Validate active status (enforce revocation)
    if (!keyRecord.isActive) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'API key is deactivated. Please contact your administrator.',
      });
      return;
    }

    const authenticatedData: AuthenticatedApiKey = {
      id: keyRecord.id,
      key: keyRecord.key,
      name: keyRecord.name,
      scopes: keyRecord.scopes,
      rateLimit: keyRecord.rateLimit,
    };

    // 3. Cache valid key in Redis for 60 seconds
    redis
      .set(cacheKey, JSON.stringify(authenticatedData), 'EX', REDIS_CACHE_TTL_SECONDS)
      .catch((redisSetError: unknown) => {
        // Failing to write to cache is non-fatal; request should still proceed
        console.warn('[ApiKeyAuth] Failed to set Redis cache for API key:', {
          keyId: authenticatedData.id,
          error: redisSetError instanceof Error ? redisSetError.message : String(redisSetError),
        });
      });

    // Fire and forget timestamp update
    fireAndForgetLastUsedUpdate(authenticatedData.id);

    // Attach key metadata to request
    req.apiKey = authenticatedData;

    next();
  } catch (error) {
    console.error('[ApiKeyAuth Fatal Failure] Unexpected error during authentication:', {
      error: error instanceof Error ? error.message : String(error),
      path: req.path,
      method: req.method,
      ip: req.ip,
    });
    res.status(500).json({
      error: 'Internal Gateway Error',
      message: 'An unexpected authentication failure occurred.',
    });
  }
}
