/**
 * @file packages/gateway/src/routes/anomalyRoutes.ts
 * @description Administrative API routes for retrieving AI anomaly detection reports and triggering manual analysis.
 *
 * Architecture position:
 *   Dashboard UI ──HTTP──> Express anomalyRoutes (/api/anomalies) ──Prisma──> PostgreSQL AnomalyReport / Anomaly
 *                                             │
 *                                             └──BullMQ──> Redis "anomaly-analysis" Queue ──> Worker Service
 *
 * Why expose an API route for manual runs?
 *   While scheduled hourly runs catch periodic deviations, DevOps engineers investigating an ongoing
 *   incident or deploying hotfixes need the ability to trigger real-time AI analysis on-demand.
 *   Enqueuing a BullMQ job ensures the heavy LLM computation runs asynchronously in the worker
 *   without blocking the gateway process or client HTTP request.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { Queue } from 'bullmq';
import { AnomalySeverity, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

export const anomalyRouter: Router = Router();

/** Canonical queue name shared with the worker package */
export const ANOMALY_ANALYSIS_QUEUE_NAME = 'anomaly-analysis' as const;

/** Singleton BullMQ Queue instance for dispatching anomaly analysis jobs */
let anomalyQueue: Queue | null = null;

/**
 * Returns the singleton BullMQ Queue instance for dispatching analysis jobs.
 *
 * @returns {Queue} Initialized BullMQ queue
 */
function getAnomalyQueue(): Queue {
  if (!anomalyQueue) {
    const redisUrl = process.env.REDIS_URL;
    const host = process.env.REDIS_HOST || 'localhost';
    const port = parseInt(process.env.REDIS_PORT || '6379', 10);

    const connection = redisUrl
      ? { url: redisUrl }
      : { host, port: isNaN(port) ? 6379 : port };

    anomalyQueue = new Queue(ANOMALY_ANALYSIS_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 25 },
        attempts: 2,
      },
    });

    anomalyQueue.on('error', (err: Error) => {
      console.error('[AnomalyRoutes Queue Error]:', {
        message: err.message,
        timestamp: new Date().toISOString(),
      });
    });
  }

  return anomalyQueue;
}

/**
 * Zod validation schema for querying anomaly reports.
 */
export const queryAnomaliesSchema = z.object({
  severity: z
    .enum(['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'])
    .default('ALL'),
  dateRange: z
    .enum(['1h', '24h', '7d', '30d', 'all'])
    .default('24h'),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? Math.min(Math.max(parseInt(val, 10), 1), 100) : 50)),
});

/**
 * Resolves the start boundary Date from a preset string.
 *
 * @param {string} range - Preset identifier
 * @returns {Date | undefined} Computed lower timestamp boundary
 */
function resolveDateFrom(range: string): Date | undefined {
  if (range === 'all') return undefined;
  const now = Date.now();
  if (range === '1h') return new Date(now - 60 * 60 * 1000);
  if (range === '24h') return new Date(now - 24 * 60 * 60 * 1000);
  if (range === '7d') return new Date(now - 7 * 24 * 60 * 60 * 1000);
  if (range === '30d') return new Date(now - 30 * 24 * 60 * 60 * 1000);
  return undefined;
}

/**
 * GET /api/anomalies
 * Retrieves chronological timeline of AI anomaly reports with nested anomalies,
 * filtered by severity and date range, accompanied by scheduling operational metadata.
 */
anomalyRouter.get('/', async (req: Request, res: Response) => {
  try {
    const parseResult = queryAnomaliesSchema.safeParse(req.query);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Validation Error',
        details: parseResult.error.flatten().fieldErrors,
      });
    }

    const { severity, dateRange, limit } = parseResult.data;
    const dateFrom = resolveDateFrom(dateRange);

    // Build Prisma where filter
    const whereClause: Prisma.AnomalyReportWhereInput = {};
    if (dateFrom) {
      whereClause.createdAt = { gte: dateFrom };
    }

    if (severity !== 'ALL') {
      whereClause.anomalies = {
        some: {
          severity: severity as AnomalySeverity,
        },
      };
    }

    // Execute queries in parallel: filtered reports, total count, latest report
    const [reports, totalCount, latestReport, recentAlertsCount] = await Promise.all([
      prisma.anomalyReport.findMany({
        where: whereClause,
        include: {
          anomalies: {
            orderBy: {
              createdAt: 'desc',
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: limit,
      }),
      prisma.anomalyReport.count(),
      prisma.anomalyReport.findFirst({
        orderBy: {
          createdAt: 'desc',
        },
      }),
      prisma.anomaly.count({
        where: {
          severity: { in: [AnomalySeverity.CRITICAL, AnomalySeverity.HIGH] },
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    const lastRunAt = latestReport ? latestReport.createdAt.toISOString() : null;
    const nextScheduledAt = lastRunAt
      ? new Date(new Date(lastRunAt).getTime() + 60 * 60 * 1000).toISOString()
      : new Date(Date.now() + 60 * 60 * 1000).toISOString();

    return res.status(200).json({
      reports,
      status: {
        lastRunAt,
        nextScheduledAt,
        totalReports: totalCount,
        activeAlertsCount: recentAlertsCount,
        status: 'scheduled',
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[AnomalyRoutes GET / Error]:', {
      error: message,
      query: req.query,
      timestamp: new Date().toISOString(),
    });

    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve anomaly reports.',
    });
  }
});

/**
 * POST /api/anomalies/run
 * Enqueues an on-demand anomaly analysis job into the BullMQ "anomaly-analysis" queue.
 */
anomalyRouter.post('/run', async (req: Request, res: Response) => {
  try {
    const queue = getAnomalyQueue();
    const requestedAt = new Date().toISOString();

    const job = await queue.add(
      'manual-traffic-analysis',
      {
        triggeredBy: 'manual_api',
        requestedBy: req.apiKey?.name || 'admin',
        requestedAt,
      },
      {
        priority: 1, // Higher priority than routine scheduled runs
      }
    );

    console.log('[AnomalyRoutes] Manual traffic analysis enqueued:', {
      jobId: job.id,
      requestedAt,
      caller: req.apiKey?.name,
    });

    return res.status(202).json({
      success: true,
      message: 'Anomaly analysis triggered successfully. Job is queued for processing.',
      jobId: job.id,
      queuedAt: requestedAt,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[AnomalyRoutes POST /run Error]:', {
      error: message,
      timestamp: new Date().toISOString(),
    });

    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to enqueue anomaly analysis job.',
    });
  }
});
