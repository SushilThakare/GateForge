/**
 * @file packages/gateway/src/rateLimit/slidingWindow.ts
 * @description Sliding Window rate limiter for the GateForge API Gateway.
 *
 * Uses a Redis Sorted Set (ZSET) where each member is a unique request identifier
 * and the score is the Unix timestamp (in milliseconds) of when the request arrived.
 *
 * On every incoming request we:
 *   1. Atomically remove all entries older than the current window via ZREMRANGEBYSCORE
 *   2. Count remaining entries with ZCARD
 *   3. If count >= limit → reject immediately (no mutation to the set)
 *   4. If count < limit → add the current request with ZADD, then set the key TTL
 *
 * All four operations execute inside a single Redis Lua script to guarantee atomicity
 * and prevent race conditions under concurrent load.
 */

import { redis } from '../lib/redis.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The result returned by checkSlidingWindow describing whether a request was
 * allowed and how many more requests the caller may make in the current window.
 */
export interface RateLimitResult {
  /** True when the request was accepted and counted; false when it was rejected. */
  allowed: boolean;
  /** How many more requests may be made before the limit resets. */
  remaining: number;
  /**
   * Unix timestamp (ms) at which the OLDEST request in the current window will
   * expire, freeing one slot. When the window is empty or the request was allowed
   * with room to spare this equals now + windowMs (worst-case next reset).
   */
  resetAt: number;
}

// ---------------------------------------------------------------------------
// Lua Script
// ---------------------------------------------------------------------------

/**
 * Atomic Lua script executed inside Redis.
 *
 * KEYS[1]  → the sorted-set key, e.g. "rl:key_abc123"
 * ARGV[1]  → windowStart  : lower bound for the current window (ms timestamp, exclusive)
 * ARGV[2]  → now          : current Unix time in ms (used as the new entry's score)
 * ARGV[3]  → limit        : maximum allowed requests in the window
 * ARGV[4]  → windowMs     : window duration in ms (used for TTL)
 * ARGV[5]  → member       : unique request identifier (now + random suffix)
 *
 * Returns a two-element array: [allowed (0|1), currentCount]
 *
 * Why Lua?
 * --------
 * Redis executes Lua scripts atomically — no other Redis command can interleave
 * during script execution. Without Lua, the read-then-write pattern (ZCARD then
 * ZADD) is a classic TOCTOU race: two concurrent requests could both read count=4
 * on a limit=5, both decide "I'm allowed", both ZADD, and the actual count becomes
 * 6 — one over the limit. The Lua script makes the check-and-write a single
 * indivisible operation, exactly like a database transaction.
 */
const SLIDING_WINDOW_SCRIPT = `
  local key        = KEYS[1]
  local windowStart = tonumber(ARGV[1])
  local now        = tonumber(ARGV[2])
  local limit      = tonumber(ARGV[3])
  local windowMs   = tonumber(ARGV[4])
  local member     = ARGV[5]

  -- Step 1: Evict all timestamps that have fallen outside the window.
  -- ZREMRANGEBYSCORE removes entries with score in [0, windowStart].
  redis.call('ZREMRANGEBYSCORE', key, 0, windowStart)

  -- Step 2: Count how many timestamps remain inside the window.
  local count = redis.call('ZCARD', key)

  -- Step 3: Check against the limit BEFORE writing.
  if count >= limit then
    -- Over the limit → return rejected state without mutating the set.
    return {0, count}
  end

  -- Step 4: Record this request by adding a member whose score is the current ms timestamp.
  -- The member must be unique; we use now + a random salt appended by the caller.
  redis.call('ZADD', key, now, member)

  -- Step 5: Extend the key's TTL so it auto-expires after one full idle window.
  -- PEXPIRE uses millisecond precision.
  redis.call('PEXPIRE', key, windowMs)

  return {1, count + 1}
`;

// ---------------------------------------------------------------------------
// Module-level script SHA cache
// ---------------------------------------------------------------------------

/**
 * Cached SHA1 digest returned by SCRIPT LOAD. Using EVALSHA instead of EVAL
 * avoids re-transmitting the full Lua source on every request, reducing
 * bandwidth and latency on the hot path.
 */
let scriptSha: string | null = null;

/**
 * Loads the Lua script into Redis script cache on first call and caches the SHA.
 * Subsequent calls return the cached SHA without any Redis round-trip.
 *
 * @returns {Promise<string>} SHA1 digest of the loaded Lua script
 * @throws {Error} If the SCRIPT LOAD command fails
 */
async function getScriptSha(): Promise<string> {
  if (scriptSha) return scriptSha;

  try {
    // SCRIPT LOAD stores the script server-side and returns its SHA1 fingerprint.
    // This is idempotent — repeated loads of the same script always return the same SHA.
    scriptSha = await redis.script('LOAD', SLIDING_WINDOW_SCRIPT) as string;
    return scriptSha;
  } catch (err) {
    throw new Error(
      `[SlidingWindow] Failed to load Lua script into Redis: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}

// ---------------------------------------------------------------------------
// Redis key helpers
// ---------------------------------------------------------------------------

/**
 * Constructs the Redis ZSET key for a given API key ID.
 * Namespacing under "rl:" avoids collisions with auth cache keys ("api_key:").
 *
 * @param {string} keyId - The API key's database UUID
 * @returns {string} Namespaced Redis key
 */
function buildRedisKey(keyId: string): string {
  return `rl:${keyId}`;
}

// ---------------------------------------------------------------------------
// Core function
// ---------------------------------------------------------------------------

/**
 * Checks whether an API key is within its rate limit using a sliding window algorithm.
 *
 * The sliding window is tracked by a Redis Sorted Set. Each allowed request
 * inserts an entry with score = current timestamp (ms). On the next request,
 * entries older than `windowMs` are pruned first, then the surviving count is
 * compared against `limit`. This happens atomically via a Lua script.
 *
 * @param {string} keyId    - Unique identifier of the API key (database UUID)
 * @param {number} limit    - Maximum number of requests allowed within the window
 * @param {number} windowMs - Window duration in milliseconds (e.g. 60_000 for 1 minute)
 * @returns {Promise<RateLimitResult>} Whether the request is allowed and remaining quota
 *
 * @example
 * // 100 requests per 60 seconds for key "abc-123"
 * const result = await checkSlidingWindow('abc-123', 100, 60_000);
 * if (!result.allowed) {
 *   res.status(429).json({ error: 'Rate limit exceeded', resetAt: result.resetAt });
 * }
 */
export async function checkSlidingWindow(
  keyId: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const now = Date.now();
  // windowStart is the oldest timestamp we will keep (exclusive lower bound).
  // Any entry scored <= windowStart is outside the sliding window and gets evicted.
  const windowStart = now - windowMs;

  // A unique member string prevents duplicate-score collisions inside the ZSET.
  // Two requests arriving at the exact same millisecond would otherwise share a score
  // and ZADD would silently overwrite the earlier member if the string were identical.
  const uniqueMember = `${now}:${Math.random().toString(36).slice(2, 9)}`;

  const redisKey = buildRedisKey(keyId);

  try {
    const sha = await getScriptSha();

    // Execute the Lua script atomically.
    // evalsha(sha, numkeys, key1, arg1, arg2, ...) — ioredis accepts flat variadic args.
    const result = await redis.evalsha(
      sha,
      1,               // number of keys
      redisKey,        // KEYS[1]
      windowStart,     // ARGV[1]: lower time bound (entries older than this are pruned)
      now,             // ARGV[2]: current timestamp used as the new entry's score
      limit,           // ARGV[3]: requests-per-window limit
      windowMs,        // ARGV[4]: window duration in ms (for PEXPIRE TTL)
      uniqueMember     // ARGV[5]: unique member string to avoid score collisions
    ) as [number, number];

    const [allowedFlag, currentCount] = result;
    const allowed = allowedFlag === 1;

    // remaining = how many more requests may be made before hitting the ceiling.
    // If rejected, currentCount == limit (or higher due to a burst during eviction),
    // so remaining is clamped at 0.
    const remaining = Math.max(0, limit - currentCount);

    // resetAt represents when the oldest entry in the window expires.
    // If the window is empty or allowance was granted we return now + windowMs as
    // the conservative worst-case reset time. This is what we expose in HTTP headers.
    const resetAt = now + windowMs;

    return { allowed, remaining, resetAt };
  } catch (err) {
    // If Redis is temporarily unavailable, we fail open (allow the request) rather
    // than fail closed (block all traffic). This is a deliberate product decision —
    // edit this behaviour based on your security vs. availability tradeoff.
    console.error('[SlidingWindow] Redis error during rate limit check — failing open:', {
      keyId,
      error: err instanceof Error ? err.message : String(err),
      timestamp: new Date().toISOString(),
    });

    // Fail-open: allow the request with a conservative remaining count of 0
    // so the caller knows the quota state is unknown.
    return {
      allowed: true,
      remaining: 0,
      resetAt: now + windowMs,
    };
  }
}
