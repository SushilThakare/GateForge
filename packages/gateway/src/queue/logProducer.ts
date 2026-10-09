/**
 * @file packages/gateway/src/queue/logProducer.ts
 * @description BullMQ-backed request log producer for the GateForge Gateway.
 *
 * Architecture position:
 *   Express proxy handler → logProducer.enqueueRequestLog() → Redis "request-logs" queue
 *                                                                    ↓
 *                                                              Worker service (async consumer)
 *                                                                    ↓
 *                                                              PostgreSQL request_logs table
 *
 * Why a queue and NOT a direct DB write here?
 *   The gateway lives on the hot path — every microsecond of added latency is felt by API
 *   consumers. A PostgreSQL INSERT on every proxy call would add 5–30 ms of network I/O to
 *   each response. By enqueuing a tiny JSON blob into Redis (a pure in-memory store), the
 *   overhead is <1 ms, and the expensive DB write is offloaded to the worker service which
 *   can run at its own pace, batch writes, and retry on failure without affecting the caller.
 *
 * Fire-and-forget pattern:
 *   We deliberately do NOT await the queue.add() call. The response is already sent to the
 *   client before this function is even called. Any queue failure is caught silently so it
 *   never surfaces as an error to the API consumer.
 */

import { Queue, QueueOptions } from 'bullmq';

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Structured payload representing a single proxied request event.
 * Every field is intentionally typed — no `any` allowed.
 */
export interface RequestLogJobData {
  /** HTTP verb (GET, POST, PUT, PATCH, DELETE, etc.) */
  method: string;
  /** Request path as seen by the gateway (e.g. /v1/proxy/users) */
  path: string;
  /** HTTP status code sent to the client (200, 429, 401, 500, …) */
  statusCode: number;
  /** Total round-trip time in milliseconds from request receipt to response send */
  responseTimeMs: number;
  /** Database ID of the authenticated API key, or null for unauthenticated requests */
  apiKeyId: string | null;
  /** Client IP address (may be the proxy IP if behind a load balancer) */
  clientIp: string;
  /** Raw User-Agent header string for analytics and debugging */
  userAgent: string;
  /** ISO 8601 timestamp of when the request was received */
  timestamp: string;
}

/** Discriminated union for the result of an enqueue attempt */
export type EnqueueResult =
  | { success: true; jobId: string }
  | { success: false; error: string };

// ──────────────────────────────────────────────────────────────────────────────
// Queue name constant
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Canonical queue name shared between this producer and the worker consumer.
 * Both MUST reference the exact same string — this is the "contract" between them.
 * Exported so the worker package can import it instead of duplicating the string literal.
 */
export const REQUEST_LOGS_QUEUE_NAME = 'request-logs' as const;

// ──────────────────────────────────────────────────────────────────────────────
// Queue singleton
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Lazily-initialized BullMQ Queue instance.
 * Singleton pattern avoids creating redundant Redis connections on each enqueue call.
 */
let requestLogsQueue: Queue<RequestLogJobData> | null = null;

/**
 * Builds the BullMQ Queue connection options from the current environment.
 * BullMQ requires its OWN Redis connection config (separate from our ioredis client)
 * because BullMQ manages its own connection pool internally via ioredis under the hood.
 *
 * @returns {QueueOptions} BullMQ-compatible connection configuration
 */
function buildQueueOptions(): QueueOptions {
  const redisUrl = process.env.REDIS_URL;
  const host = process.env.REDIS_HOST || 'localhost';
  const port = parseInt(process.env.REDIS_PORT || '6379', 10);

  // BullMQ's `connection` accepts either a host/port object or a full URL string
  const connection = redisUrl
    ? { url: redisUrl }
    : { host, port: isNaN(port) ? 6379 : port };

  return {
    connection,
    // defaultJobOptions apply to every job added via this queue instance
    defaultJobOptions: {
      // Keep the last 500 completed jobs visible in the BullMQ dashboard for debugging
      removeOnComplete: { count: 500 },
      // Retain failed jobs for 7 days so the worker can be inspected and rerun
      removeOnFail: { age: 60 * 60 * 24 * 7 },
      // Attempt to deliver the job up to 3 times with exponential back-off
      // before marking it as permanently failed. This handles transient DB blips.
      attempts: 3,
      backoff: {
        type: 'exponential',
        // Initial delay: 1 second → 2 s → 4 s
        delay: 1000,
      },
    },
  };
}

/**
 * Returns the singleton BullMQ Queue, creating it on first call.
 * Subsequent calls return the same instance to reuse the Redis connection.
 *
 * @returns {Queue<RequestLogJobData>} The initialized request-logs queue
 */
export function getRequestLogsQueue(): Queue<RequestLogJobData> {
  // Only instantiate once — subsequent calls reuse the existing connection
  if (!requestLogsQueue) {
    requestLogsQueue = new Queue<RequestLogJobData>(
      REQUEST_LOGS_QUEUE_NAME,
      buildQueueOptions()
    );

    // Surface connection-level errors in logs so ops teams can diagnose Redis outages
    requestLogsQueue.on('error', (err: Error) => {
      console.error('[LogProducer] BullMQ queue connection error:', {
        message: err.message,
        timestamp: new Date().toISOString(),
      });
    });

    console.log(`[LogProducer] Initialized BullMQ queue: "${REQUEST_LOGS_QUEUE_NAME}"`);
  }

  return requestLogsQueue;
}

// ──────────────────────────────────────────────────────────────────────────────
// Core producer function
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Enqueues a request log job into the "request-logs" BullMQ queue.
 *
 * This is the primary public API of this module. It is designed to be called in a
 * "fire-and-forget" manner — the caller should NOT await this function if it has
 * already sent the HTTP response, ensuring zero latency impact on the client.
 *
 * Internally it catches all errors so a Redis outage or BullMQ failure can NEVER
 * propagate back to the request handler and cause a 500 error for the API consumer.
 *
 * @param {RequestLogJobData} data - Structured log data for the completed request
 * @returns {Promise<EnqueueResult>} Result object indicating success or failure reason
 */
export async function enqueueRequestLog(
  data: RequestLogJobData
): Promise<EnqueueResult> {
  try {
    const queue = getRequestLogsQueue();

    // Use the timestamp as a human-readable job name for easy identification in the
    // BullMQ dashboard/Bull Board UI: "GET /v1/proxy/users @ 2026-10-10T02:40:00.000Z"
    const jobName = `${data.method} ${data.path} @ ${data.timestamp}`;

    const job = await queue.add(jobName, data);

    return { success: true, jobId: job.id ?? 'unknown' };
  } catch (err: unknown) {
    // Log the failure with enough context to diagnose the root cause, but swallow
    // the error so it never propagates to the calling HTTP handler.
    const message = err instanceof Error ? err.message : String(err);
    console.error('[LogProducer] Failed to enqueue request log:', {
      error: message,
      path: data.path,
      method: data.method,
      apiKeyId: data.apiKeyId,
      timestamp: data.timestamp,
    });
    return { success: false, error: message };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Graceful shutdown helper
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Closes the BullMQ queue connection cleanly during Gateway shutdown.
 * Call this alongside prisma.$disconnect() and redis.quit() in the SIGTERM handler.
 *
 * @returns {Promise<void>}
 */
export async function closeRequestLogsQueue(): Promise<void> {
  if (requestLogsQueue) {
    try {
      await requestLogsQueue.close();
      requestLogsQueue = null;
      console.log('[LogProducer] BullMQ queue connection closed cleanly.');
    } catch (err: unknown) {
      console.error('[LogProducer] Error closing BullMQ queue:', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
