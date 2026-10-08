/**
 * @file packages/gateway/src/rateLimit/tokenBucket.ts
 * @description Token Bucket rate limiter for the GateForge API Gateway.
 *
 * CONCEPT
 * ───────
 * Imagine a physical bucket that:
 *   - Holds at most `capacity` tokens (the burst ceiling)
 *   - Is refilled at `refillRate` tokens per second continuously
 *   - Each incoming request consumes exactly 1 token
 *   - If the bucket is empty → reject the request
 *
 * This allows short bursts (the bucket fills up during idle time) while
 * enforcing a long-run average equal to refillRate req/s.
 *
 * REDIS STATE
 * ───────────
 * Each API key gets a Redis Hash with two fields:
 *   - tokens         : current floating-point token count
 *   - lastRefillAt   : Unix timestamp (ms) of the last refill calculation
 *
 * Key format: tb:<keyId>
 *
 * ATOMICITY
 * ─────────
 * The refill calculation + consume + write must be a single atomic operation.
 * A Lua script guarantees this — no interleaving between the HGET (read) and
 * HSET (write) that would otherwise allow two concurrent requests to each
 * read the same token count and both decrement it independently.
 */

import { redis } from '../lib/redis.js';
import type { RateLimitResult } from './slidingWindow.js';

// Re-export so callers can import from a single place if they choose
export type { RateLimitResult };

// ---------------------------------------------------------------------------
// Token Bucket Lua Script
// ---------------------------------------------------------------------------

/**
 * Atomic Lua script that implements the refill-then-consume cycle.
 *
 * KEYS[1]         → Redis Hash key, e.g. "tb:abc-uuid"
 * ARGV[1] nowMs   → Current Unix time in milliseconds (float-safe as string)
 * ARGV[2] capacity → Maximum tokens the bucket can hold
 * ARGV[3] refillRate → Tokens added per second (can be fractional, e.g. 0.5)
 * ARGV[4] ttlMs   → Time-to-live in ms for the key (auto-cleanup when idle)
 *
 * Returns a three-element array: [allowed (0|1), floor(tokens_after), retryAfterMs]
 *
 * REFILL FORMULA (derived inside Lua):
 *   elapsed   = (nowMs - lastRefillAt) / 1000          -- elapsed seconds
 *   newTokens = min(capacity, tokens + elapsed * refillRate)
 *   if newTokens >= 1:
 *     tokens_after = newTokens - 1    → ALLOW
 *   else:
 *     tokens_after = newTokens        → REJECT
 *     retryAfterMs = ceil((1 - newTokens) / refillRate * 1000)
 *
 * WHY FLOAT MATH IN LUA?
 * Lua numbers are IEEE 754 doubles — they handle fractional tokens correctly.
 * This matters for low refill rates like 0.5 tokens/sec (1 req every 2 seconds).
 */
const TOKEN_BUCKET_SCRIPT = `
  local key        = KEYS[1]
  local nowMs      = tonumber(ARGV[1])
  local capacity   = tonumber(ARGV[2])
  local refillRate = tonumber(ARGV[3])
  local ttlMs      = tonumber(ARGV[4])

  -- Read current bucket state from Redis Hash
  local data = redis.call('HMGET', key, 'tokens', 'lastRefillAt')
  local tokens      = tonumber(data[1])
  local lastRefillAt = tonumber(data[2])

  -- First-ever request for this key: initialise a full bucket
  if tokens == nil or lastRefillAt == nil then
    tokens      = capacity
    lastRefillAt = nowMs
  end

  -- ── REFILL ─────────────────────────────────────────────────────────────
  -- Calculate how many seconds elapsed since the last refill and add the
  -- proportional token count, clamped at capacity so the bucket never overflows.
  local elapsedSeconds = (nowMs - lastRefillAt) / 1000
  local refilled = tokens + (elapsedSeconds * refillRate)
  if refilled > capacity then
    refilled = capacity
  end

  -- ── CONSUME ────────────────────────────────────────────────────────────
  local allowed      = 0
  local retryAfterMs = 0

  if refilled >= 1 then
    -- Bucket has at least one token: consume it and allow the request
    allowed = 1
    refilled = refilled - 1
  else
    -- Not enough tokens yet: calculate how long until 1 full token accumulates
    -- retryAfterMs = ceil((1 - currentTokens) / refillRate * 1000)
    retryAfterMs = math.ceil(((1 - refilled) / refillRate) * 1000)
  end

  -- ── PERSIST ────────────────────────────────────────────────────────────
  -- Always persist the updated token count and the current timestamp.
  -- Even on rejection we update lastRefillAt so the next request gets the
  -- correct elapsed time and doesn't double-count idle time.
  redis.call('HSET', key, 'tokens', tostring(refilled), 'lastRefillAt', tostring(nowMs))

  -- Extend TTL so the key self-destructs after a full quiet period
  redis.call('PEXPIRE', key, ttlMs)

  -- Return floor(refilled) so TypeScript gets an integer for 'remaining' display
  return {allowed, math.floor(refilled), retryAfterMs}
`;

// ---------------------------------------------------------------------------
// Script SHA cache
// ---------------------------------------------------------------------------

/**
 * Module-level cache for the SHA1 of the loaded Lua script.
 * SCRIPT LOAD is called once; all subsequent requests use EVALSHA.
 */
let scriptSha: string | null = null;

/**
 * Loads the token-bucket Lua script into Redis on first call and returns the
 * SHA1 fingerprint for use with EVALSHA.
 *
 * @returns {Promise<string>} SHA1 digest
 * @throws {Error} When SCRIPT LOAD fails (Redis unavailable)
 */
async function getScriptSha(): Promise<string> {
  if (scriptSha) return scriptSha;

  try {
    scriptSha = await redis.script('LOAD', TOKEN_BUCKET_SCRIPT) as string;
    return scriptSha;
  } catch (err) {
    throw new Error(
      `[TokenBucket] Failed to load Lua script into Redis: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}

// ---------------------------------------------------------------------------
// Redis key helper
// ---------------------------------------------------------------------------

/**
 * Constructs the Redis Hash key for a given API key ID.
 * "tb:" namespace avoids collisions with the ZSET keys used by the sliding window ("rl:").
 *
 * @param {string} keyId - The API key's database UUID
 * @returns {string} Namespaced Redis key, e.g. "tb:abc-123"
 */
function buildRedisKey(keyId: string): string {
  return `tb:${keyId}`;
}

// ---------------------------------------------------------------------------
// Token Bucket parameters
// ---------------------------------------------------------------------------

/**
 * Configuration for the token bucket algorithm per API key.
 * Both fields come from the RateLimitConfig row in PostgreSQL.
 */
export interface TokenBucketParams {
  /**
   * Maximum number of tokens the bucket can hold.
   * This equals the maximum burst size — how many requests can fire simultaneously
   * before the key is throttled.
   */
  capacity: number;
  /**
   * Tokens added to the bucket per second.
   * Determines the long-run sustainable request rate.
   * e.g., refillRate=10 means the key can sustain 10 requests/second indefinitely.
   */
  refillRate: number;
}

// ---------------------------------------------------------------------------
// Core function
// ---------------------------------------------------------------------------

/**
 * Checks whether an API key has tokens available using the Token Bucket algorithm.
 *
 * On each call:
 *   1. Redis Hash is read to get `tokens` + `lastRefillAt`
 *   2. Tokens are refilled proportional to elapsed time since last refill
 *   3. If tokens >= 1 → consume 1 token → ALLOW
 *   4. If tokens < 1 → REJECT, compute retry-after time
 *   5. New state is written back atomically via Lua
 *
 * The key's TTL is refreshed to `capacity / refillRate * 2` seconds so it
 * auto-expires during prolonged idle periods rather than leaking memory.
 *
 * @param {string} keyId - The API key's database UUID
 * @param {TokenBucketParams} params - Bucket capacity and refill rate
 * @returns {Promise<RateLimitResult>} The rate limit decision and remaining tokens
 *
 * @example
 * // Burst of 20, sustain 5/sec
 * const result = await checkTokenBucket('key-uuid', { capacity: 20, refillRate: 5 });
 * if (!result.allowed) {
 *   res.status(429).json({ error: 'Rate limit exceeded', resetAt: result.resetAt });
 * }
 */
export async function checkTokenBucket(
  keyId: string,
  params: TokenBucketParams
): Promise<RateLimitResult> {
  const { capacity, refillRate } = params;
  const now = Date.now();
  const redisKey = buildRedisKey(keyId);

  // TTL = time for an empty bucket to fully refill × 2 (safety margin)
  // This prevents the key from living forever if a client stops sending requests.
  const ttlMs = Math.ceil((capacity / refillRate) * 2 * 1000);

  try {
    const sha = await getScriptSha();

    const result = await redis.evalsha(
      sha,
      1,          // number of keys
      redisKey,   // KEYS[1]
      now,        // ARGV[1]: current timestamp ms
      capacity,   // ARGV[2]: max tokens (burst ceiling)
      refillRate, // ARGV[3]: tokens per second
      ttlMs       // ARGV[4]: key TTL in ms
    ) as [number, number, number];

    const [allowedFlag, remainingTokens, retryAfterMs] = result;
    const allowed = allowedFlag === 1;

    // resetAt: the point in time when the bucket will have 1 full token available again.
    // For allowed requests this is a conservative "worst case" (now + time to refill 1 token).
    // For rejected requests retryAfterMs is the precise wait.
    const resetAt = now + (allowed ? Math.ceil(1000 / refillRate) : retryAfterMs);

    return {
      allowed,
      remaining: remainingTokens,
      resetAt,
    };
  } catch (err) {
    // Fail-open: if Redis is unavailable, let the request through rather than
    // blocking all traffic. Log clearly so the ops team can investigate.
    console.error('[TokenBucket] Redis error during rate limit check — failing open:', {
      keyId,
      error: err instanceof Error ? err.message : String(err),
      timestamp: new Date().toISOString(),
    });

    return {
      allowed: true,
      remaining: 0,
      resetAt: now + Math.ceil(1000 / refillRate),
    };
  }
}
