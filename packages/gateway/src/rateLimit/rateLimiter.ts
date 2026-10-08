/**
 * @file packages/gateway/src/rateLimit/rateLimiter.ts
 * @description Public facade for the GateForge rate limiting subsystem.
 *
 * This module is the single import point for anything that needs rate limiting.
 * It reads the strategy from the API key's config and delegates to the correct
 * algorithm implementation.  Consumers never need to know whether they are
 * talking to a ZSET-based sliding window or a Hash-based token bucket.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  rateLimiter.ts  (← you are here: public facade)                    │
 * │      ├── slidingWindow.ts  (SLIDING_WINDOW / FIXED_WINDOW)           │
 * │      └── tokenBucket.ts   (TOKEN_BUCKET)                             │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Architecture note
 * ─────────────────
 * Keeping algorithm selection in this facade rather than in the Express
 * middleware means the rate limiting logic is testable without Express, and a
 * future gRPC or WebSocket gateway can reuse the same facade unchanged.
 */

import { checkSlidingWindow, type RateLimitResult } from './slidingWindow.js';
import { checkTokenBucket } from './tokenBucket.js';
import type { AuthenticatedApiKey } from '../auth/apiKeyAuth.js';

// Re-export the shared result type so callers only need one import
export type { RateLimitResult };

// ---------------------------------------------------------------------------
// Strategy enum mirror
// ---------------------------------------------------------------------------

/**
 * The three rate-limiting strategies supported by GateForge.
 * Mirrors the Prisma `RateLimitStrategy` enum so we never import Prisma types
 * deep inside the rate-limit hot path (keeps the module dependency graph shallow).
 */
export const RateLimitStrategy = {
  SLIDING_WINDOW: 'SLIDING_WINDOW',
  FIXED_WINDOW: 'FIXED_WINDOW',
  TOKEN_BUCKET: 'TOKEN_BUCKET',
} as const;

export type RateLimitStrategyValue = (typeof RateLimitStrategy)[keyof typeof RateLimitStrategy];

// ---------------------------------------------------------------------------
// Resolved config type
// ---------------------------------------------------------------------------

/**
 * The resolved, validated configuration used internally by `applyRateLimit`.
 * Built from the raw `AuthenticatedApiKey` so callers don't need to understand
 * the nullable-field gymnastics from the DB.
 */
export interface ResolvedRateLimitConfig {
  strategy: RateLimitStrategyValue;
  /** Requests allowed per window (sliding / fixed window). */
  limit: number;
  /** Window duration in ms (sliding / fixed window). */
  windowMs: number;
  /** Max tokens in the bucket — equals the burst size (token bucket). */
  capacity: number;
  /** Tokens replenished per second (token bucket). */
  refillRate: number;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/** Fallback window when no RateLimitConfig row exists. */
const DEFAULT_WINDOW_MS = 60_000;

/** Fallback refill rate when token bucket config is partially set. */
const DEFAULT_REFILL_RATE = 10; // 10 tokens / second

// ---------------------------------------------------------------------------
// Config resolver
// ---------------------------------------------------------------------------

/**
 * Resolves the rate-limit configuration from an `AuthenticatedApiKey` into a
 * clean, fully-typed `ResolvedRateLimitConfig` with no nullable fields.
 *
 * Priority:
 *   1. `rateLimitConfig` row (per-key DB config, most specific)
 *   2. `rateLimit` field (legacy per-minute integer on the ApiKey row)
 *   3. Module-level defaults (safety net)
 *
 * @param {AuthenticatedApiKey} apiKey - The authenticated key with optional config
 * @returns {ResolvedRateLimitConfig} Fully resolved, non-nullable config object
 */
export function resolveRateLimitConfig(apiKey: AuthenticatedApiKey): ResolvedRateLimitConfig {
  const cfg = apiKey.rateLimitConfig;

  const strategy: RateLimitStrategyValue =
    (cfg?.strategy as RateLimitStrategyValue | undefined) ?? RateLimitStrategy.SLIDING_WINDOW;

  // Sliding / fixed window parameters
  const limit = cfg?.maxRequests ?? apiKey.rateLimit;
  const windowMs = cfg?.windowSeconds ? cfg.windowSeconds * 1000 : DEFAULT_WINDOW_MS;

  // Token bucket parameters — fall back gracefully so we never pass null to the algorithm
  const capacity = cfg?.capacity ?? limit;
  const refillRate = cfg?.refillRate ?? DEFAULT_REFILL_RATE;

  return { strategy, limit, windowMs, capacity, refillRate };
}

// ---------------------------------------------------------------------------
// Core facade function
// ---------------------------------------------------------------------------

/**
 * Applies the rate limit for an API key by selecting and invoking the correct
 * algorithm based on the key's resolved configuration.
 *
 * This is the single function the Express middleware (or any other consumer)
 * calls. It returns a `RateLimitResult` regardless of which algorithm ran.
 *
 * Algorithm selection:
 *   - TOKEN_BUCKET     → `checkTokenBucket`   (Redis Hash + Lua, burst-aware)
 *   - SLIDING_WINDOW   → `checkSlidingWindow`  (Redis ZSET + Lua, precise)
 *   - FIXED_WINDOW     → `checkSlidingWindow`  (same impl; true FW is a future extension)
 *
 * @param {string} keyId - The API key's database UUID (used as Redis key prefix)
 * @param {ResolvedRateLimitConfig} config - The resolved rate limit parameters
 * @returns {Promise<RateLimitResult>} Allow/deny decision with remaining quota and reset time
 *
 * @example
 * const config = resolveRateLimitConfig(req.apiKey);
 * const result = await applyRateLimit(req.apiKey.id, config);
 * if (!result.allowed) {
 *   res.status(429).json({ error: 'Rate limit exceeded', retryAfter: ... });
 * }
 */
export async function applyRateLimit(
  keyId: string,
  config: ResolvedRateLimitConfig
): Promise<RateLimitResult> {
  switch (config.strategy) {
    case RateLimitStrategy.TOKEN_BUCKET:
      return checkTokenBucket(keyId, {
        capacity: config.capacity,
        refillRate: config.refillRate,
      });

    case RateLimitStrategy.SLIDING_WINDOW:
    case RateLimitStrategy.FIXED_WINDOW:
    default:
      // FIXED_WINDOW falls back to sliding window — prevents boundary-burst without
      // requiring a separate implementation at this stage.
      return checkSlidingWindow(keyId, config.limit, config.windowMs);
  }
}
