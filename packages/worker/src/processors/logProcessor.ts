/**
 * @file packages/worker/src/processors/logProcessor.ts
 * @description BullMQ request log processor with batching, validation, DLQ handling, and metrics.
 *
 * Architecture position:
 *   Redis "request-logs" queue → logProcessor (Worker) → In-Memory Buffer (Batch Accumulator)
 *                                                               ↓ (100 items OR 5 seconds)
 *                                                      PostgreSQL RequestLog table (Prisma createMany)
 *                                                               ↓ (on terminal failure)
 *                                                      Redis "request-logs-dlq" Dead Letter Queue
 *
 * Why Batch Processing?
 *   Instead of initiating a separate PostgreSQL transaction and network round-trip for every
 *   single HTTP request log (which would bottleneck under heavy traffic), logs are buffered
 *   in memory and flushed in bulk (`createMany`). This converts 100 round-trips into 1,
 *   reducing database connection pressure and CPU load by orders of magnitude.
 */

import { Job, Queue } from 'bullmq';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { getRedisConfig } from '../lib/redis.js';

// ──────────────────────────────────────────────────────────────────────────────
// Configuration Constants & Enums
// ──────────────────────────────────────────────────────────────────────────────

/** Maximum number of log records to accumulate before triggering an immediate batch flush */
export const BATCH_SIZE_THRESHOLD = 100;

/** Maximum time in milliseconds to wait before flushing pending logs */
export const BATCH_FLUSH_INTERVAL_MS = 5000;

/** Canonical queue name consumed by this processor */
export const REQUEST_LOGS_QUEUE_NAME = 'request-logs' as const;

/** Canonical dead letter queue name for poisoned or permanently failed jobs */
export const DEAD_LETTER_QUEUE_NAME = 'request-logs-dlq' as const;

/**
 * Metric reporting interval in milliseconds (1 minute).
 */
export const METRICS_INTERVAL_MS = 60000;

// ──────────────────────────────────────────────────────────────────────────────
// Schema Validation & Types
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Runtime Zod validation schema for incoming job payloads from the Gateway producer.
 * Guarantees schema adherence and guards database queries against malformed payloads.
 */
export const RequestLogPayloadSchema = z.object({
  method: z.string().min(1, 'HTTP method is required'),
  path: z.string().min(1, 'Request path is required'),
  statusCode: z.number().int('Status code must be an integer'),
  responseTimeMs: z.number().nonnegative('Response time cannot be negative'),
  apiKeyId: z.string().nullable().optional(),
  clientIp: z.string().default('unknown'),
  userAgent: z.string().nullable().optional(),
  timestamp: z.string().datetime({ offset: true }).or(z.string().min(1)),
});

export type ValidatedRequestLog = z.infer<typeof RequestLogPayloadSchema>;

/**
 * Internal pending batch item encapsulating the validated payload and async completion hooks.
 */
interface PendingBatchItem {
  job: Job<ValidatedRequestLog>;
  data: ValidatedRequestLog;
  resolve: () => void;
  reject: (err: Error) => void;
}

/**
 * Dead Letter Queue payload schema containing diagnostic metadata.
 */
export interface DeadLetterPayload {
  originalJobId: string | undefined;
  queueName: string;
  data: unknown;
  failedReason: string;
  attemptsMade: number;
  failedAt: string;
}

/**
 * Snapshot of operational worker metrics.
 */
export interface WorkerMetrics {
  jobsProcessed: number;
  jobsFailed: number;
  batchesFlushed: number;
  totalBatchSizeAccumulated: number;
  averageBatchSize: number;
  failureRatePercent: number;
  windowStartTime: number;
}

// ──────────────────────────────────────────────────────────────────────────────
// Dead Letter Queue Singleton
// ──────────────────────────────────────────────────────────────────────────────

let deadLetterQueue: Queue<DeadLetterPayload> | null = null;

/**
 * Returns the singleton BullMQ Dead Letter Queue instance.
 * 
 * @returns {Queue<DeadLetterPayload>} Initialized DLQ instance
 */
export function getDeadLetterQueue(): Queue<DeadLetterPayload> {
  if (!deadLetterQueue) {
    const config = getRedisConfig();
    const connection = config.url ? { url: config.url } : { host: config.host, port: config.port };

    deadLetterQueue = new Queue<DeadLetterPayload>(DEAD_LETTER_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        removeOnComplete: false, // Retain all DLQ records for manual inspection & replaying
        removeOnFail: false,
      },
    });

    deadLetterQueue.on('error', (err: Error) => {
      console.error('[DLQ Error] Connection failure on Dead Letter Queue:', {
        message: err.message,
        timestamp: new Date().toISOString(),
      });
    });
  }

  return deadLetterQueue;
}

// ──────────────────────────────────────────────────────────────────────────────
// Batch Accumulator & Processor State
// ──────────────────────────────────────────────────────────────────────────────

/** In-memory buffer storing pending logs awaiting bulk insert */
const batchBuffer: PendingBatchItem[] = [];

/** Lock flag ensuring concurrent flushes do not execute simultaneously */
let isFlushing = false;

/** Active timer reference for interval-based batch flushing */
let flushTimer: NodeJS.Timeout | null = null;

/** Active timer reference for metrics reporting */
let metricsTimer: NodeJS.Timeout | null = null;

/** Metrics accumulator for monitoring throughput and reliability */
const metrics: WorkerMetrics = {
  jobsProcessed: 0,
  jobsFailed: 0,
  batchesFlushed: 0,
  totalBatchSizeAccumulated: 0,
  averageBatchSize: 0,
  failureRatePercent: 0,
  windowStartTime: Date.now(),
};

// ──────────────────────────────────────────────────────────────────────────────
// Core Batch Processing Logic
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Flushes all currently accumulated log items to PostgreSQL in a single bulk operation.
 * 
 * @returns {Promise<number>} Number of records inserted
 */
export async function flushBatch(): Promise<number> {
  // Prevent concurrent flush executions
  if (isFlushing || batchBuffer.length === 0) {
    return 0;
  }

  isFlushing = true;

  // Drain the buffer into a local slice
  const itemsToFlush = batchBuffer.splice(0, batchBuffer.length);
  const count = itemsToFlush.length;

  try {
    // Map validated payloads to Prisma schema columns
    const records = itemsToFlush.map((item) => {
      let parsedDate: Date;
      try {
        parsedDate = new Date(item.data.timestamp);
        if (isNaN(parsedDate.getTime())) {
          parsedDate = new Date();
        }
      } catch {
        parsedDate = new Date();
      }

      return {
        apiKeyId: item.data.apiKeyId || null,
        path: item.data.path,
        method: item.data.method,
        statusCode: item.data.statusCode,
        responseTimeMs: Math.round(item.data.responseTimeMs),
        ipAddress: item.data.clientIp || 'unknown',
        userAgent: item.data.userAgent || null,
        timestamp: parsedDate,
      };
    });

    // Bulk insert into PostgreSQL via Prisma createMany
    await prisma.requestLog.createMany({
      data: records,
      skipDuplicates: false,
    });

    // Update operational metrics
    metrics.jobsProcessed += count;
    metrics.batchesFlushed += 1;
    metrics.totalBatchSizeAccumulated += count;
    metrics.averageBatchSize =
      metrics.totalBatchSizeAccumulated / metrics.batchesFlushed;

    // Resolve all promises in the flushed batch to complete BullMQ jobs
    for (const item of itemsToFlush) {
      item.resolve();
    }

    return count;
  } catch (dbError: unknown) {
    const errorInstance =
      dbError instanceof Error
        ? dbError
        : new Error(String(dbError));

    console.error('[LogProcessor Batch Error] Database write failed during batch flush:', {
      batchSize: count,
      error: errorInstance.message,
      timestamp: new Date().toISOString(),
    });

    // Reject all pending job promises so BullMQ can trigger job-level retries
    for (const item of itemsToFlush) {
      item.reject(errorInstance);
    }

    throw errorInstance;
  } finally {
    isFlushing = false;
  }
}

/**
 * BullMQ job processor callback that validates each job and enqueues it into the batch buffer.
 * 
 * @param {Job<unknown>} job - Raw BullMQ job received from Redis
 * @returns {Promise<void>} Resolves when the batch containing this job is persisted
 */
export async function processLogJob(job: Job<unknown>): Promise<void> {
  try {
    // 1. Validate payload schema at runtime
    const validationResult = RequestLogPayloadSchema.safeParse(job.data);

    if (!validationResult.success) {
      const validationErrorMessage = `Invalid RequestLog payload: ${validationResult.error.message}`;
      console.error(`[LogProcessor Validation Failure] Job #${job.id}:`, {
        error: validationResult.error.issues,
        rawPayload: job.data,
      });

      // Move corrupt payload to Dead Letter Queue immediately to avoid unneeded retry churn
      await dispatchToDeadLetterQueue(
        job,
        validationErrorMessage,
        job.attemptsMade
      );

      // Complete without throwing so queue does not redundantly retry malformed data
      return;
    }

    const validatedData = validationResult.data;

    // 2. Wrap job in a Promise and push to the batch accumulation buffer
    await new Promise<void>((resolve, reject) => {
      batchBuffer.push({
        job: job as Job<ValidatedRequestLog>,
        data: validatedData,
        resolve,
        reject,
      });

      // Trigger immediate flush if buffer reaches capacity threshold
      if (batchBuffer.length >= BATCH_SIZE_THRESHOLD) {
        flushBatch().catch((err: unknown) => {
          console.error('[LogProcessor] Immediate capacity flush error:', {
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
    });
  } catch (error: unknown) {
    metrics.jobsFailed += 1;
    const errorObj = error instanceof Error ? error : new Error(String(error));

    console.error(`[LogProcessor Job Failure] Error processing job #${job.id}:`, {
      attemptsMade: job.attemptsMade,
      error: errorObj.message,
    });

    throw errorObj;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Dead Letter Queue Handling
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Dispatches a permanently failed or poisoned job to the Dead Letter Queue for post-mortem analysis.
 * 
 * @param {Job<unknown>} job - Failed BullMQ job
 * @param {string} reason - Detailed reason for failure
 * @param {number} attemptsMade - Number of attempts executed
 * @returns {Promise<void>}
 */
export async function dispatchToDeadLetterQueue(
  job: Job<unknown>,
  reason: string,
  attemptsMade: number
): Promise<void> {
  try {
    const dlq = getDeadLetterQueue();
    const payload: DeadLetterPayload = {
      originalJobId: job.id,
      queueName: REQUEST_LOGS_QUEUE_NAME,
      data: job.data,
      failedReason: reason,
      attemptsMade,
      failedAt: new Date().toISOString(),
    };

    await dlq.add(`dlq-${job.id || Date.now()}`, payload);

    console.warn(`[LogProcessor DLQ] Job #${job.id} dispatched to Dead Letter Queue:`, {
      originalJobId: job.id,
      reason,
      attemptsMade,
    });
  } catch (dlqError: unknown) {
    console.error('[LogProcessor DLQ Failure] Could not route job to Dead Letter Queue:', {
      jobId: job.id,
      error: dlqError instanceof Error ? dlqError.message : String(dlqError),
    });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Metrics & Lifecycle Management
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Emits telemetry metrics to stdout periodically (e.g. every minute).
 */
export function logMetricsReport(): void {
  const elapsedMinutes = (Date.now() - metrics.windowStartTime) / 60000;
  const processedPerMinute =
    elapsedMinutes > 0
      ? Math.round(metrics.jobsProcessed / elapsedMinutes)
      : metrics.jobsProcessed;

  const totalAttempted = metrics.jobsProcessed + metrics.jobsFailed;
  const failureRatePercent =
    totalAttempted > 0
      ? Number(((metrics.jobsFailed / totalAttempted) * 100).toFixed(2))
      : 0;

  metrics.failureRatePercent = failureRatePercent;

  console.log('[Worker Metrics Snapshot]:', {
    processedPerMinute,
    totalProcessed: metrics.jobsProcessed,
    totalFailed: metrics.jobsFailed,
    failureRate: `${failureRatePercent}%`,
    batchesFlushed: metrics.batchesFlushed,
    averageBatchSize: Number(metrics.averageBatchSize.toFixed(1)),
    pendingBufferCount: batchBuffer.length,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Starts background timers for recurring batch flushes and metrics snapshots.
 * 
 * @returns {void}
 */
export function startBatchTimers(): void {
  if (!flushTimer) {
    flushTimer = setInterval(() => {
      if (batchBuffer.length > 0) {
        flushBatch().catch((err: unknown) => {
          console.error('[LogProcessor Interval Flush Error]:', {
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
    }, BATCH_FLUSH_INTERVAL_MS);
  }

  if (!metricsTimer) {
    metricsTimer = setInterval(() => {
      logMetricsReport();
    }, METRICS_INTERVAL_MS);
  }
}

/**
 * Stops background timers, drains remaining batch items, and closes the DLQ connection.
 * 
 * @returns {Promise<void>}
 */
export async function stopLogProcessor(): Promise<void> {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }

  if (metricsTimer) {
    clearInterval(metricsTimer);
    metricsTimer = null;
  }

  // Final flush of any pending records in buffer before shutdown
  if (batchBuffer.length > 0) {
    console.log(`[LogProcessor] Draining final ${batchBuffer.length} items from buffer...`);
    try {
      await flushBatch();
    } catch (err: unknown) {
      console.error('[LogProcessor Shutdown Drain Failure]:', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (deadLetterQueue) {
    try {
      await deadLetterQueue.close();
      deadLetterQueue = null;
      console.log('[LogProcessor] Dead Letter Queue connection closed.');
    } catch (err: unknown) {
      console.error('[LogProcessor DLQ Close Error]:', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
