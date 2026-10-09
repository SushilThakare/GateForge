/**
 * @file packages/worker/src/worker.ts
 * @description Main worker runner and consumer service for GateForge.
 *
 * Architecture position:
 *   Subscribes to the "request-logs" BullMQ queue via Redis.
 *   Dispatches jobs to `processLogJob` (batch accumulator), handles worker lifecycle events,
 *   tracks retries, and transfers permanently failed jobs to the Dead Letter Queue.
 *
 * Why a separate worker process?
 *   Isolates heavy asynchronous write workloads (batching, database connection pooling, metrics)
 *   from the latency-critical API gateway proxy. If the database experiences heavy locks
 *   or latency spikes, only the background queue depth grows; the proxy remains unaffected.
 */

import dotenv from 'dotenv';
import { Worker, Job } from 'bullmq';
import {
  REQUEST_LOGS_QUEUE_NAME,
  processLogJob,
  dispatchToDeadLetterQueue,
  startBatchTimers,
  stopLogProcessor,
} from './processors/logProcessor.js';
import { createWorkerRedisClient } from './lib/redis.js';
import { prisma } from './lib/prisma.js';

dotenv.config();

/**
 * Worker runtime configuration interface.
 */
export interface WorkerConfig {
  concurrency: number;
  maxAttempts: number;
}

/**
 * Parses and returns worker configuration options from environment.
 * 
 * @returns {WorkerConfig} Validated worker settings
 */
export function getWorkerConfig(): WorkerConfig {
  const concurrencyRaw = process.env.WORKER_CONCURRENCY || '10';
  const concurrency = parseInt(concurrencyRaw, 10);
  const validConcurrency = isNaN(concurrency) || concurrency < 1 ? 10 : concurrency;

  return {
    concurrency: validConcurrency,
    maxAttempts: 3,
  };
}

/**
 * Singleton Worker instance reference.
 */
let workerInstance: Worker | null = null;

/**
 * Starts the BullMQ worker service and initializes batch timers.
 * 
 * @returns {Promise<Worker>} The active BullMQ Worker instance
 */
export async function startWorker(): Promise<Worker> {
  try {
    const config = getWorkerConfig();
    const connection = createWorkerRedisClient();

    // Start batch flush timer and periodic metric reporting
    startBatchTimers();

    workerInstance = new Worker(
      REQUEST_LOGS_QUEUE_NAME,
      async (job: Job) => {
        await processLogJob(job);
      },
      {
        connection,
        concurrency: config.concurrency,
        // Exponential backoff configuration for retrying failed jobs
        settings: {
          backoffStrategy: (attemptsMade: number) => {
            // Exponential: 1s, 2s, 4s, etc. (1000 * 2^(attemptsMade - 1))
            return Math.pow(2, Math.max(0, attemptsMade - 1)) * 1000;
          },
        },
      }
    );

    // Event handler: Job successfully processed and batched
    workerInstance.on('completed', (job: Job) => {
      // Completed jobs logged at debug level to keep stdout clean during high throughput
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[Worker] Job #${job.id} successfully completed`);
      }
    });

    // Event handler: Job attempt failure
    workerInstance.on('failed', async (job: Job | undefined, err: Error) => {
      if (!job) {
        console.error('[Worker Error] Unidentified job failure:', { error: err.message });
        return;
      }

      const maxAllowedAttempts = job.opts.attempts || config.maxAttempts;
      console.warn(`[Worker Attempt Failed] Job #${job.id} attempt ${job.attemptsMade}/${maxAllowedAttempts}:`, {
        error: err.message,
        path: job.data?.path,
        method: job.data?.method,
      });

      // If maximum attempts reached or exceeded, route to Dead Letter Queue
      if (job.attemptsMade >= maxAllowedAttempts) {
        console.error(`[Worker Terminal Failure] Job #${job.id} exceeded all ${maxAllowedAttempts} attempts. Moving to DLQ.`);
        await dispatchToDeadLetterQueue(job, err.message, job.attemptsMade);
      }
    });

    workerInstance.on('error', (err: Error) => {
      console.error('[Worker Fatal Error]:', { message: err.message });
    });

    console.log(`[Worker] GateForge Worker service listening on "${REQUEST_LOGS_QUEUE_NAME}" (concurrency: ${config.concurrency})`);

    return workerInstance;
  } catch (error: unknown) {
    console.error('[Worker Startup Failure]:', {
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
    process.exit(1);
  }
}

/**
 * Gracefully shuts down the worker process, flushing buffers and closing open connections.
 * 
 * @param {string} signal - The termination signal received (SIGTERM / SIGINT)
 * @returns {Promise<void>}
 */
export async function gracefulWorkerShutdown(signal: string): Promise<void> {
  console.log(`[Worker] Received ${signal}. Initiating graceful shutdown...`);

  try {
    if (workerInstance) {
      // Pause worker to stop accepting new jobs
      await workerInstance.close();
      workerInstance = null;
      console.log('[Worker] BullMQ worker consumer closed.');
    }

    // Stop timers, flush pending batch items, close DLQ
    await stopLogProcessor();

    // Disconnect Prisma PostgreSQL connection pool
    await prisma.$disconnect();
    console.log('[Worker] PostgreSQL connection disconnected.');

    console.log('[Worker] Graceful shutdown completed cleanly.');
    process.exit(0);
  } catch (shutdownError: unknown) {
    console.error('[Worker Shutdown Error]:', {
      error: shutdownError instanceof Error ? shutdownError.message : String(shutdownError),
    });
    process.exit(1);
  }
}

// Register process signal handlers for container and terminal shutdowns
process.on('SIGTERM', () => gracefulWorkerShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulWorkerShutdown('SIGINT'));
