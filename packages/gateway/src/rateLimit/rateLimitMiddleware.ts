/**
 * @file packages/gateway/src/rateLimit/rateLimitMiddleware.ts
 * @description Express middleware that enforces per-API-key rate limiting.
 *
 * This file is intentionally thin. All algorithm logic lives in:
 *   - rateLimiter.ts   (strategy selection + config resolution)
 *   - slidingWindow.ts (SLIDING_WINDOW / FIXED_WINDOW implementation)
 *   - tokenBucket.ts   (TOKEN_BUCKET implementation)
 *
 * Middleware pipeline position:
 *   CORS → JSON body parser → apiKeyAuth → rateLimitMiddleware → routes
 *
 * On every allowed request it sets these response headers (RFC 6585 / IETF draft):
 *   X-RateLimit-Limit     : the configured max requests / token capacity
 *   X-RateLimit-Remaining : slots / tokens left in the current window
 *   X-RateLimit-Reset     : Unix timestamp (seconds) when the window resets
 *   X-RateLimit-Strategy  : algorithm in use (informational, non-standard)
 *
 * On a rejected request (HTTP 429) it additionally sets:
 *   Retry-After           : seconds until the client may retry (RFC 7231 §7.1.3)
 *
 * JSON 429 body shape:
 *   { error: "Rate limit exceeded", retryAfter: <seconds:number> }
 */

import { Request, Response, NextFunction } from 'express';
import { applyRateLimit, resolveRateLimitConfig } from './rateLimiter.js';

/**
 * Applies the per-API-key rate limit and sets the appropriate response headers.
 *
 * @param {Request}      req  - Express request; req.apiKey must be populated by apiKeyAuth
 * @param {Response}     res  - Express response
 * @param {NextFunction} next - Call to pass control to the next middleware
 * @returns {Promise<void>}
 */
export async function rateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Defensive guard: apiKeyAuth always runs first, but TypeScript requires the check
  if (!req.apiKey) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'API key context missing from request. Ensure apiKeyAuth runs before rateLimitMiddleware.',
    });
    return;
  }

  const keyId = req.apiKey.id;

  try {
    // 1. Resolve config (handles all nullability + defaults in one place)
    const config = resolveRateLimitConfig(req.apiKey);

    // 2. Delegate to the appropriate algorithm via the facade
    const result = await applyRateLimit(keyId, config);

    // 3. Compute the display limit: capacity for token bucket, request count otherwise
    const displayLimit =
      config.strategy === 'TOKEN_BUCKET' ? config.capacity : config.limit;

    // ── RATE LIMIT RESPONSE HEADERS ────────────────────────────────────────
    // X-RateLimit-Reset is expressed in Unix seconds (not ms) to match GitHub /
    // Twitter convention and be directly usable with `new Date(resetAt * 1000)`.
    const resetAtSeconds = Math.ceil(result.resetAt / 1000);

    res.setHeader('X-RateLimit-Limit', displayLimit);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', resetAtSeconds);
    res.setHeader('X-RateLimit-Strategy', config.strategy);

    // 4. Reject with 429 if the algorithm said "no"
    if (!result.allowed) {
      // Retry-After: whole-second ceiling — never tell the client "0s, try immediately"
      // when they might hammer us again before the token refills.
      const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));

      res.setHeader('Retry-After', retryAfter);

      res.status(429).json({
        // Spec-mandated shape: { error: "Rate limit exceeded", retryAfter: <int> }
        error: 'Rate limit exceeded',
        retryAfter,
      });
      return;
    }

    // 5. Request is within quota — continue to the next middleware / route
    next();
  } catch (err) {
    // If anything inside the rate-limit subsystem throws unexpectedly (e.g. a
    // programming error, not a Redis timeout — those are caught inside the algorithms
    // and fail-open themselves), we log and fail open here too so a bug in this
    // middleware never takes down the gateway entirely.
    console.error('[RateLimitMiddleware] Unexpected top-level error — failing open:', {
      keyId,
      error: err instanceof Error ? err.message : String(err),
      path: req.path,
      method: req.method,
      timestamp: new Date().toISOString(),
    });
    next();
  }
}
