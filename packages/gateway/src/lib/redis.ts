/**
 * @file packages/gateway/src/lib/redis.ts
 * @description Centralized Redis connection instance for the Gateway service.
 * Redis is utilized by the Gateway for sub-millisecond API key credential caching and sliding-window
 * rate limit counters, shielding PostgreSQL from high-frequency read spikes on the proxy hot path.
 */

import Redis from 'ioredis';

/**
 * Creates and configures the Redis client instance with resilient retry parameters.
 * 
 * @returns {Redis} Initialized Redis client
 */
function createRedisClient(): Redis {
  const redisUrl = process.env.REDIS_URL;
  const host = process.env.REDIS_HOST || 'localhost';
  const port = parseInt(process.env.REDIS_PORT || '6379', 10);

  // Use URL connection if present, otherwise fall back to host/port configuration
  const client = redisUrl
    ? new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
      })
    : new Redis({
        host,
        port: isNaN(port) ? 6379 : port,
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
      });

  // Attach error handler to prevent uncaught exception crashes when Redis restarts
  client.on('error', (err: Error) => {
    console.error('[Gateway Redis Error]:', {
      message: err.message,
      stack: err.stack,
      attemptedAt: new Date().toISOString(),
    });
  });

  client.on('connect', () => {
    console.log('[Gateway Redis] Connection established successfully');
  });

  return client;
}

/**
 * Singleton Redis client export for the Gateway service.
 */
export const redis: Redis = createRedisClient();
