/**
 * @file packages/gateway/src/rateLimit/rateLimitMiddleware.ts
 * @description Express middleware that enforces per-API-key rate limiting using the
 * sliding window algorithm. Positioned in the middleware chain AFTER apiKeyAuth
 * so that req.apiKey is guaranteed to be populated before this runs.
 *
 * On rejection (HTTP 429) the response includes:
 *   - Retry-After header: seconds until the window resets
 *   - X-RateLimit-Limit: the configured limit
 *   - X-RateLimit-Remaining: remaining slots (0 on rejection)
 *   - X-RateLimit-Reset: Unix epoch (ms) when the window resets
 */

import { Request, Response, NextFunction } from 'express';
import { checkSlidingWindow } from './slidingWindow.js';

/**
 * Default window duration: 60 seconds expressed in milliseconds.
 * The window size could also come from per-key config in the future.
 */
const DEFAULT_WINDOW_MS = 60_000;

/**
 * Express middleware that checks the sliding window rate limit for the
 * authenticated API key attached to the request by apiKeyAuth.
 *
 * @param {Request} req - Express request (must have req.apiKey populated)
 * @param {Response} res - Express response
 * @param {NextFunction} next - Next middleware callback
 * @returns {Promise<void>}
 */
export async function rateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // apiKeyAuth always runs before this middleware, so req.apiKey should always exist.
  // Guard defensively anyway to satisfy TypeScript strict null checks.
  if (!req.apiKey) {
    res.status(401).json({ error: 'Unauthorized', message: 'API key context missing.' });
    return;
  }

  const { id: keyId, rateLimit: limit } = req.apiKey;

  try {
    const result = await checkSlidingWindow(keyId, limit, DEFAULT_WINDOW_MS);

    // Attach standard rate limit headers regardless of allow/reject decision
    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', result.resetAt);

    if (!result.allowed) {
      // Calculate how many seconds until the window resets for Retry-After header
      const retryAfterSeconds = Math.ceil((result.resetAt - Date.now()) / 1000);
      res.setHeader('Retry-After', retryAfterSeconds);

      res.status(429).json({
        error: 'Too Many Requests',
        message: `Rate limit of ${limit} requests per minute exceeded. Retry after ${retryAfterSeconds}s.`,
        resetAt: new Date(result.resetAt).toISOString(),
      });
      return;
    }

    next();
  } catch (err) {
    // Unexpected errors from checkSlidingWindow bubble here (Redis crash, script errors, etc.)
    console.error('[RateLimitMiddleware] Unexpected error during rate limit check:', {
      keyId,
      error: err instanceof Error ? err.message : String(err),
      path: req.path,
      timestamp: new Date().toISOString(),
    });
    // Fail open so a Redis blip does not take down the entire gateway
    next();
  }
}
