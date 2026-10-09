/**
 * @file packages/gateway/src/routes/logRoutes.ts
 * @description Administrative and telemetry API routes for querying, filtering, and aggregating request logs.
 *
 * Architecture position:
 *   Admin / Dashboard UI ──HTTP──> Express logRoutes (/api/logs) ──Prisma / Raw SQL──> PostgreSQL RequestLog table
 *
 * Capabilities:
 *   - Cursor-based paginated log querying with filtering (by API key, status code family, date range).
 *   - High-performance statistical aggregation computing request throughput, error rates, and
 *     percentiles (p50, p95, p99) in a single database query using PostgreSQL PERCENTILE_CONT.
 *   - Detailed single-log inspection with associated API key metadata.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

export const logRouter: Router = Router();

// ──────────────────────────────────────────────────────────────────────────────
// Enums & Types
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Standard preset time windows for statistical aggregation.
 */
export enum TimeRangePreset {
  ONE_HOUR = '1h',
  TWENTY_FOUR_HOURS = '24h',
  SEVEN_DAYS = '7d',
}

/**
 * Status code category filter options.
 */
export enum StatusCodeFilter {
  SUCCESS_2XX = '2xx',
  REDIRECT_3XX = '3xx',
  CLIENT_ERROR_4XX = '4xx',
  SERVER_ERROR_5XX = '5xx',
}

/**
 * Cursor pagination metadata returned to clients.
 */
export interface CursorPaginationMeta {
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
}

/**
 * Aggregate metrics response structure.
 */
export interface LogStatisticsResponse {
  timeRange: string;
  dateFrom: string;
  dateTo: string;
  totalRequests: number;
  requestsPerMinute: number;
  avgResponseTimeMs: number;
  errorRatePercent: number;
  percentiles: {
    p50: number;
    p95: number;
    p99: number;
  };
  statusBreakdown: {
    status2xx: number;
    status3xx: number;
    status4xx: number;
    status5xx: number;
  };
}

/**
 * Raw aggregate row returned by PostgreSQL percentile aggregation query.
 */
interface RawStatsQueryResult {
  totalRequests: number | bigint;
  avgResponseTime: number | null;
  p50: number | null;
  p95: number | null;
  p99: number | null;
  errorCount: number | bigint;
  count2xx: number | bigint;
  count3xx: number | bigint;
  count4xx: number | bigint;
  count5xx: number | bigint;
}

// ──────────────────────────────────────────────────────────────────────────────
// Validation Schemas
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Validation schema for cursor-based log list query parameters.
 */
export const queryLogsSchema = z.object({
  cursor: z.string().uuid('Cursor must be a valid UUID').optional(),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 50))
    .refine((n) => !isNaN(n) && n >= 1 && n <= 100, {
      message: 'Limit must be an integer between 1 and 100',
    }),
  apiKeyId: z.string().uuid('Invalid apiKeyId UUID format').optional(),
  status: z
    .string()
    .optional()
    .refine(
      (val) =>
        !val ||
        ['2xx', '3xx', '4xx', '5xx'].includes(val) ||
        (!isNaN(Number(val)) && Number(val) >= 100 && Number(val) <= 599),
      {
        message: 'Status must be a valid status code (e.g. 200, 404) or family (2xx, 3xx, 4xx, 5xx)',
      }
    ),
  dateFrom: z.string().datetime({ offset: true }).or(z.string().min(1)).optional(),
  dateTo: z.string().datetime({ offset: true }).or(z.string().min(1)).optional(),
  method: z
    .string()
    .toUpperCase()
    .refine((val) => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'].includes(val), {
      message: 'Invalid HTTP method filter',
    })
    .optional(),
});

/**
 * Validation schema for statistics aggregation endpoint query parameters.
 */
export const logStatsQuerySchema = z.object({
  timeRange: z
    .nativeEnum(TimeRangePreset, {
      invalid_type_error: "timeRange must be '1h', '24h', or '7d'",
    })
    .default(TimeRangePreset.TWENTY_FOUR_HOURS),
  apiKeyId: z.string().uuid('Invalid apiKeyId UUID format').optional(),
  dateFrom: z.string().datetime({ offset: true }).or(z.string().min(1)).optional(),
  dateTo: z.string().datetime({ offset: true }).or(z.string().min(1)).optional(),
});

/**
 * Validation schema for UUID log ID parameter.
 */
export const logIdParamSchema = z.object({
  id: z.string().uuid('Invalid RequestLog ID format. Must be a valid UUID.'),
});

// ──────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Resolves date boundaries from preset time ranges or explicit date filters.
 *
 * @param {TimeRangePreset} preset - Preset window ('1h', '24h', '7d')
 * @param {string} [dateFrom] - Optional explicit ISO start date
 * @param {string} [dateTo] - Optional explicit ISO end date
 * @returns {{ from: Date; to: Date; durationMinutes: number }} Resolved date range and window span
 */
export function resolveDateRange(
  preset: TimeRangePreset,
  dateFrom?: string,
  dateTo?: string
): { from: Date; to: Date; durationMinutes: number } {
  const to = dateTo ? new Date(dateTo) : new Date();
  let from: Date;

  if (dateFrom) {
    from = new Date(dateFrom);
  } else {
    from = new Date(to.getTime());
    switch (preset) {
      case TimeRangePreset.ONE_HOUR:
        from.setHours(from.getHours() - 1);
        break;
      case TimeRangePreset.SEVEN_DAYS:
        from.setDate(from.getDate() - 7);
        break;
      case TimeRangePreset.TWENTY_FOUR_HOURS:
      default:
        from.setHours(from.getHours() - 24);
        break;
    }
  }

  const durationMinutes = Math.max(1, (to.getTime() - from.getTime()) / 60000);
  return { from, to, durationMinutes };
}

/**
 * Builds Prisma status code filter conditions from string inputs.
 *
 * @param {string} status - Raw status query string (e.g., '200', '4xx')
 * @returns {Prisma.IntFilter | number | undefined} Prisma filter expression
 */
function buildStatusCodeFilter(status: string): Prisma.IntFilter | number | undefined {
  if (status === StatusCodeFilter.SUCCESS_2XX) {
    return { gte: 200, lt: 300 };
  }
  if (status === StatusCodeFilter.REDIRECT_3XX) {
    return { gte: 300, lt: 400 };
  }
  if (status === StatusCodeFilter.CLIENT_ERROR_4XX) {
    return { gte: 400, lt: 500 };
  }
  if (status === StatusCodeFilter.SERVER_ERROR_5XX) {
    return { gte: 500, lt: 600 };
  }
  const numericCode = parseInt(status, 10);
  return isNaN(numericCode) ? undefined : numericCode;
}

// ──────────────────────────────────────────────────────────────────────────────
// Route Handlers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/logs/stats
 * Returns statistical summaries: throughput, latency percentiles (p50, p95, p99), error rates.
 * Positioned before /:id route to avoid Express matching 'stats' as a UUID parameter.
 */
logRouter.get('/stats', async (req: Request, res: Response): Promise<void> => {
  try {
    const validation = logStatsQuerySchema.safeParse(req.query);
    if (!validation.success) {
      res.status(400).json({
        error: 'Validation Error',
        details: validation.error.flatten().fieldErrors,
      });
      return;
    }

    const { timeRange, apiKeyId, dateFrom, dateTo } = validation.data;
    const { from, to, durationMinutes } = resolveDateRange(timeRange, dateFrom, dateTo);

    // High-performance single-pass aggregation query using PostgreSQL PERCENTILE_CONT
    // Computes percentiles, averages, and status code counts in one database round-trip
    const rawResults = await prisma.$queryRaw<RawStatsQueryResult[]>`
      SELECT
        COUNT(*)::int AS "totalRequests",
        COALESCE(AVG("responseTimeMs"), 0)::float AS "avgResponseTime",
        COALESCE(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY "responseTimeMs"), 0)::float AS "p50",
        COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "responseTimeMs"), 0)::float AS "p95",
        COALESCE(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY "responseTimeMs"), 0)::float AS "p99",
        COUNT(CASE WHEN "statusCode" >= 400 THEN 1 END)::int AS "errorCount",
        COUNT(CASE WHEN "statusCode" >= 200 AND "statusCode" < 300 THEN 1 END)::int AS "count2xx",
        COUNT(CASE WHEN "statusCode" >= 300 AND "statusCode" < 400 THEN 1 END)::int AS "count3xx",
        COUNT(CASE WHEN "statusCode" >= 400 AND "statusCode" < 500 THEN 1 END)::int AS "count4xx",
        COUNT(CASE WHEN "statusCode" >= 500 THEN 1 END)::int AS "count5xx"
      FROM "RequestLog"
      WHERE "timestamp" >= ${from} AND "timestamp" <= ${to}
        AND (${apiKeyId ?? null}::text IS NULL OR "apiKeyId" = ${apiKeyId ?? null});
    `;

    const stats = rawResults[0] || {
      totalRequests: 0,
      avgResponseTime: 0,
      p50: 0,
      p95: 0,
      p99: 0,
      errorCount: 0,
      count2xx: 0,
      count3xx: 0,
      count4xx: 0,
      count5xx: 0,
    };

    const totalRequests = Number(stats.totalRequests);
    const errorCount = Number(stats.errorCount);
    const errorRatePercent =
      totalRequests > 0
        ? Number(((errorCount / totalRequests) * 100).toFixed(2))
        : 0;

    const requestsPerMinute = Number(
      (totalRequests / durationMinutes).toFixed(2)
    );

    const responsePayload: LogStatisticsResponse = {
      timeRange,
      dateFrom: from.toISOString(),
      dateTo: to.toISOString(),
      totalRequests,
      requestsPerMinute,
      avgResponseTimeMs: Number((stats.avgResponseTime ?? 0).toFixed(2)),
      errorRatePercent,
      percentiles: {
        p50: Number((stats.p50 ?? 0).toFixed(2)),
        p95: Number((stats.p95 ?? 0).toFixed(2)),
        p99: Number((stats.p99 ?? 0).toFixed(2)),
      },
      statusBreakdown: {
        status2xx: Number(stats.count2xx),
        status3xx: Number(stats.count3xx),
        status4xx: Number(stats.count4xx),
        status5xx: Number(stats.count5xx),
      },
    };

    res.status(200).json(responsePayload);
  } catch (error: unknown) {
    console.error('[LogRoutes GET /api/logs/stats Error]:', {
      error: error instanceof Error ? error.message : String(error),
      query: req.query,
    });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to compute request log statistics.',
    });
  }
});

/**
 * GET /api/logs
 * Returns a cursor-paginated list of request telemetry logs with filtering.
 */
logRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const validation = queryLogsSchema.safeParse(req.query);
    if (!validation.success) {
      res.status(400).json({
        error: 'Validation Error',
        details: validation.error.flatten().fieldErrors,
      });
      return;
    }

    const { cursor, limit, apiKeyId, status, dateFrom, dateTo, method } =
      validation.data;

    // Build dynamic Prisma where filter object
    const where: Prisma.RequestLogWhereInput = {};

    if (apiKeyId) {
      where.apiKeyId = apiKeyId;
    }

    if (method) {
      where.method = method;
    }

    if (status) {
      const statusCodeFilter = buildStatusCodeFilter(status);
      if (statusCodeFilter !== undefined) {
        where.statusCode = statusCodeFilter;
      }
    }

    if (dateFrom || dateTo) {
      where.timestamp = {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo ? { lte: new Date(dateTo) } : {}),
      };
    }

    // Keyset / Cursor Pagination with Prisma
    // Fetch limit + 1 items to determine if subsequent pages exist without running an expensive COUNT(*)
    const logs = await prisma.requestLog.findMany({
      where,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
      include: {
        apiKey: {
          select: {
            id: true,
            name: true,
            isActive: true,
          },
        },
      },
    });

    const hasMore = logs.length > limit;
    const paginatedItems = hasMore ? logs.slice(0, limit) : logs;
    const nextCursor =
      hasMore && paginatedItems.length > 0
        ? paginatedItems[paginatedItems.length - 1].id
        : null;

    const formattedLogs = paginatedItems.map((log) => ({
      id: log.id,
      apiKeyId: log.apiKeyId,
      apiKeyName: log.apiKey?.name ?? null,
      path: log.path,
      method: log.method,
      statusCode: log.statusCode,
      responseTimeMs: log.responseTimeMs,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      timestamp: log.timestamp.toISOString(),
    }));

    res.status(200).json({
      logs: formattedLogs,
      pagination: {
        nextCursor,
        hasMore,
        limit,
      },
    });
  } catch (error: unknown) {
    console.error('[LogRoutes GET /api/logs Error]:', {
      error: error instanceof Error ? error.message : String(error),
      query: req.query,
    });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve request logs.',
    });
  }
});

/**
 * GET /api/logs/:id
 * Retrieves detailed inspection information for a single request log entry.
 */
logRouter.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const paramValidation = logIdParamSchema.safeParse(req.params);
    if (!paramValidation.success) {
      res.status(400).json({
        error: 'Validation Error',
        details: paramValidation.error.flatten().fieldErrors,
      });
      return;
    }

    const { id } = paramValidation.data;

    const logEntry = await prisma.requestLog.findUnique({
      where: { id },
      include: {
        apiKey: {
          select: {
            id: true,
            name: true,
            scopes: true,
            rateLimit: true,
            isActive: true,
            createdAt: true,
          },
        },
      },
    });

    if (!logEntry) {
      res.status(404).json({
        error: 'Not Found',
        message: `Request log with ID '${id}' does not exist.`,
      });
      return;
    }

    res.status(200).json({
      log: {
        id: logEntry.id,
        path: logEntry.path,
        method: logEntry.method,
        statusCode: logEntry.statusCode,
        responseTimeMs: logEntry.responseTimeMs,
        ipAddress: logEntry.ipAddress,
        userAgent: logEntry.userAgent,
        timestamp: logEntry.timestamp.toISOString(),
        apiKey: logEntry.apiKey
          ? {
              id: logEntry.apiKey.id,
              name: logEntry.apiKey.name,
              scopes: logEntry.apiKey.scopes,
              rateLimit: logEntry.apiKey.rateLimit,
              isActive: logEntry.apiKey.isActive,
              createdAt: logEntry.apiKey.createdAt.toISOString(),
            }
          : null,
      },
    });
  } catch (error: unknown) {
    console.error('[LogRoutes GET /api/logs/:id Error]:', {
      error: error instanceof Error ? error.message : String(error),
      targetId: req.params.id,
    });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve request log details.',
    });
  }
});
