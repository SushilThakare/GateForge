/**
 * @file packages/worker/src/index.ts
 * @description Entry point for the GateForge Worker service.
 * The Worker service runs asynchronously off the main proxy hot path. It consumes request telemetry
 * items pushed onto Redis queue (via BullMQ) by the Gateway, batching or processing them into PostgreSQL.
 */

import dotenv from 'dotenv';
import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';

dotenv.config();

/**
 * Structure of telemetry job payload passed from Gateway to Worker queue
 */
export interface RequestLogPayload {
  apiKeyId?: string;
  path: string;
  method: string;
  statusCode: number;
  responseTimeMs: number;
  ipAddress: string;
  userAgent?: string;
  timestamp: string;
}

/**
 * Configuration options for Redis connection used by BullMQ worker
 */
export interface WorkerRedisConfig {
  host: string;
  port: number;
}

/**
 * Parses and returns validated Redis connection details from environment variables.
 * 
 * @returns {WorkerRedisConfig} Configuration object containing Redis host and port
 */
export function getWorkerRedisConfig(): WorkerRedisConfig {
  const host = process.env.REDIS_HOST || 'localhost';
  const portRaw = process.env.REDIS_PORT || '6379';
  const port = parseInt(portRaw, 10);
  const validPort = isNaN(port) ? 6379 : port;

  return { host, port: validPort };
}

/**
 * Initializes BullMQ queue consumer worker and attaches event handlers for processing request logs.
 * 
 * @returns {Promise<Worker>} Initialized BullMQ Worker instance
 */
export async function startWorkerService(): Promise<Worker<RequestLogPayload>> {
  try {
    const redisConfig = getWorkerRedisConfig();

    // Use ioredis instance for BullMQ to handle queue consumption connections
    const connection = new Redis({
      host: redisConfig.host,
      port: redisConfig.port,
      maxRetriesPerRequest: null, // Required setting for BullMQ workers
    });

    // Handle initial Redis connection errors to avoid unhandled promise rejections
    connection.on('error', (err: Error) => {
      console.error('[Worker Redis Connection Error]:', { message: err.message });
    });

    // Queue processor handler function
    const worker = new Worker<RequestLogPayload>(
      'request-logs-queue',
      async (job: Job<RequestLogPayload>) => {
        try {
          // Log telemetry data processing stub
          console.log(`[Worker] Processing telemetry job #${job.id}: ${job.data.method} ${job.data.path} (${job.data.statusCode})`);
        } catch (jobError) {
          // Catch and rethrow error with job context so BullMQ registers retry attempt
          console.error(`[Worker Job Processing Failure] Job #${job.id}:`, {
            error: jobError instanceof Error ? jobError.message : String(jobError),
            jobData: job.data,
          });
          throw jobError;
        }
      },
      { connection }
    );

    worker.on('completed', (job: Job) => {
      console.log(`[Worker] Job #${job.id} completed successfully`);
    });

    worker.on('failed', (job: Job | undefined, err: Error) => {
      console.error(`[Worker] Job #${job?.id || 'unknown'} failed:`, { error: err.message });
    });

    console.log('[Worker] Worker service running (listening on request-logs-queue)');
    return worker;
  } catch (error) {
    console.error('[Worker Fatal Startup Failure]:', {
      error: error instanceof Error ? error.message : String(error),
      attemptedAt: new Date().toISOString(),
    });
    process.exit(1);
  }
}

// Boot up worker consumer service
startWorkerService();
