/**
 * @file packages/gateway/src/rateLimit/rateLimitMiddleware.ts
 * @description Express middleware that enforces per-API-key rate limiting.
 * Dispatches to the algorithm configured for each key:
 *   - SLIDING_WINDOW (default) → checkSlidingWindow (Redis ZSET)
 *   - TOKEN_BUCKET             → checkTokenBucket   (Redis Hash)
 *   - FIXED_WINDOW             → falls back to sliding window (future extension point)
 *
 * Positioned in the middleware chain AFTER apiKeyAuth so req.apiKey is guaranteed
 * to be populated with both the key metadata AND its rateLimitConfig.
 *
 * HTTP response headers emitted on every request:
 *   X-RateLimit-Limit      → configured limit / capacity
 *   X-RateLimit-Remaining  → remaining requests / tokens
 *   X-RateLimit-Reset      → Unix epoch ms when quota resets
 *   Retry-After            → seconds to wait (only on 429)
 */

import { Request, Response, NextFunction } from 'express';
import { checkSlidingWindow } from './slidingWindow.js';
import { checkTokenBucket } from './tokenBucket.js';




/**
 * Express middleware that reads req.apiKey.rateLimitConfig to determine which
 * rate limiting algorithm to apply, then enforces the configured limit.
 *
 * Algorithm dispatch logic:
 *   1. If rateLimitConfig exists with strategy TOKEN_BUCKET → use token bucket
 *      (requires capacity and refillRate; falls back to sliding window if missing)
 *   2. Otherwise → use sliding window (covers SLIDING_WINDOW, FIXED_WINDOW, and
 *      the legacy rateLimit field with no config row)
 *
 * @param {Request} req - Express request (must have req.apiKey populated by apiKeyAuth)
 * @param {Response} res - Express response
 * @param {NextFunction} next - Next middleware callback
 * @returns {Promise<void>}
 */
export async function rateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // apiKeyAuth always runs before this; guard defensively for type safety
  if (!req.apiKey) {
    res.status(401).json({ error: 'Unauthorized', message: 'API key context missing.' });
    return;
  }

  const { id: keyId, rateLimit, rateLimitConfig } = req.apiKey;

  try {
    let result;
    let displayLimit: number;

    // ── ALGORITHM DISPATCH ──────────────────────────────────────────────────
    const strategy = rateLimitConfig?.strategy ?? 'SLIDING_WINDOW';

    if (
      strategy === 'TOKEN_BUCKET' &&
      rateLimitConfig?.capacity != null &&
      rateLimitConfig?.refillRate != null
    ) {
      // TOKEN BUCKET: burst-friendly, continuous refill
      // displayLimit = capacity (how many tokens fit in the bucket at once)
      displayLimit = rateLimitConfig.capacity;
      result = await checkTokenBucket(keyId, {
        capacity: rateLimitConfig.capacity,
        refillRate: rateLimitConfig.refillRate,
      });
    } else {
      // SLIDING WINDOW (default) — also used as fallback for FIXED_WINDOW
      // and for token-bucket configs missing capacity/refillRate values
      const limit = rateLimitConfig?.maxRequests ?? rateLimit;
      const windowMs = (rateLimitConfig?.windowSeconds ?? 60) * 1000;
      displayLimit = limit;
      result = await checkSlidingWindow(keyId, limit, windowMs);
    }

    // ── STANDARD RATE LIMIT HEADERS ─────────────────────────────────────────
    res.setHeader('X-RateLimit-Limit', displayLimit);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', result.resetAt);
    res.setHeader('X-RateLimit-Strategy', strategy);

    if (!result.allowed) {
      const retryAfterSeconds = Math.ceil((result.resetAt - Date.now()) / 1000);
      res.setHeader('Retry-After', retryAfterSeconds);

      res.status(429).json({
        error: 'Too Many Requests',
        message:
          strategy === 'TOKEN_BUCKET'
            ? `Token bucket exhausted. Retry after ${retryAfterSeconds}s (refill rate: ${rateLimitConfig?.refillRate ?? '?'} tokens/sec).`
            : `Rate limit of ${displayLimit} requests exceeded. Retry after ${retryAfterSeconds}s.`,
        strategy,
        resetAt: new Date(result.resetAt).toISOString(),
      });
      return;
    }

    next();
  } catch (err) {
    // Fail open so a transient Redis error does not block all gateway traffic
    console.error('[RateLimitMiddleware] Unexpected error during rate limit check:', {
      keyId,
      strategy: req.apiKey.rateLimitConfig?.strategy ?? 'SLIDING_WINDOW',
      error: err instanceof Error ? err.message : String(err),
      path: req.path,
      timestamp: new Date().toISOString(),
    });
    next();
  }
}
