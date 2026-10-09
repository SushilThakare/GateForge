/**
 * @file packages/worker/src/lib/redis.ts
 * @description Centralized Redis connection configuration and ioredis instance for the Worker service.
 * Fits into the messaging/caching infrastructure layer of the worker package.
 * Supplies connection configs with appropriate retry and ready-check strategies for BullMQ consumers.
 */

import Redis, { RedisOptions } from 'ioredis';

/**
 * Interface representing Redis connection configuration parameters.
 */
export interface RedisConnectionConfig {
  host: string;
  port: number;
  url?: string;
}

/**
 * Parses and returns validated Redis connection details from environment variables.
 * 
 * @returns {RedisConnectionConfig} Validated Redis host/port/url configuration
 */
export function getRedisConfig(): RedisConnectionConfig {
  const url = process.env.REDIS_URL;
  const host = process.env.REDIS_HOST || 'localhost';
  const portRaw = process.env.REDIS_PORT || '6379';
  const port = parseInt(portRaw, 10);
  const validPort = isNaN(port) ? 6379 : port;

  return { host, port: validPort, url };
}

/**
 * Generates options suitable for BullMQ worker connections.
 * BullMQ requires `maxRetriesPerRequest: null` on its worker connection to support blocking commands (BRPOPLPUSH).
 * 
 * @returns {RedisOptions} Options object for ioredis initialization
 */
export function createBullMQConnectionOptions(): RedisOptions {
  const config = getRedisConfig();

  if (config.url) {
    return {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    };
  }

  return {
    host: config.host,
    port: config.port,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
}

/**
 * Creates an ioredis client configured specifically for BullMQ worker operations.
 * 
 * @returns {Redis} Connected ioredis instance
 */
export function createWorkerRedisClient(): Redis {
  const config = getRedisConfig();
  const options = createBullMQConnectionOptions();

  const client = config.url ? new Redis(config.url, options) : new Redis(options);

  client.on('error', (err: Error) => {
    // Log Redis connectivity errors with timestamp to monitor infrastructure state
    console.error('[Worker Redis Error]:', {
      message: err.message,
      timestamp: new Date().toISOString(),
    });
  });

  return client;
}
