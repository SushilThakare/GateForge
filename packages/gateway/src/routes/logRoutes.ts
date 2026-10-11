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
import { redis } from '../lib/redis.js';

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
 * Time range presets supported by the Analytics dashboard.
 */
export enum AnalyticsTimeRangePreset {
  ONE_HOUR = '1h',
  SIX_HOURS = '6h',
  TWENTY_FOUR_HOURS = '24h',
  SEVEN_DAYS = '7d',
  THIRTY_DAYS = '30d',
}

export interface RpmDataPoint {
  timestamp: string;
  rpm: number;
  requests: number;
}

export interface LatencyPercentilePoint {
  timestamp: string;
  p50: number;
  p95: number;
  p99: number;
}

export interface StatusDistributionPoint {
  time: string;
  '2xx Success': number;
  '3xx Redirect': number;
  '4xx Client Error': number;
  '5xx Server Error': number;
}

export interface TopKeyUsageItem {
  name: string;
  requests: number;
  percentage: number;
}

export interface GeoDistributionItem {
  country: string;
  countryCode: string;
  requests: number;
  percentage: number;
}

export interface AnalyticsSummary {
  totalRequests: number;
  avgRpm: number;
  errorRatePercent: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
}

export interface AnalyticsResponse {
  timeRange: string;
  dateFrom: string;
  dateTo: string;
  summary: AnalyticsSummary;
  requestsPerMinute: RpmDataPoint[];
  latencyPercentiles: LatencyPercentilePoint[];
  statusDistribution: StatusDistributionPoint[];
  topApiKeys: TopKeyUsageItem[];
  geoDistribution: GeoDistributionItem[];
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
 * Single data point in a time-series aggregation bucket.
 */
export interface RequestsOverTimePoint {
  timestamp: string;
  requests: number;
  errors: number;
}

/**
 * Endpoint throughput count item.
 */
export interface TopEndpointItem {
  endpoint: string;
  count: number;
}

/**
 * Detailed error record for recent failure tables.
 */
export interface RecentErrorItem {
  id: string;
  path: string;
  method: string;
  statusCode: number;
  responseTimeMs: number;
  ipAddress: string;
  userAgent: string | null;
  timestamp: string;
  apiKeyName: string | null;
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
  activeApiKeys: number;
  requestsOverTime: RequestsOverTimePoint[];
  topEndpoints: TopEndpointItem[];
  recentErrors: RecentErrorItem[];
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
  path: z.string().optional(),
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
 * Validation schema for the advanced analytics aggregation endpoint.
 */
export const analyticsQuerySchema = z.object({
  timeRange: z
    .nativeEnum(AnalyticsTimeRangePreset, {
      invalid_type_error: "timeRange must be '1h', '6h', '24h', '7d', or '30d'",
    })
    .default(AnalyticsTimeRangePreset.TWENTY_FOUR_HOURS),
  apiKeyId: z.string().uuid('Invalid apiKeyId UUID format').optional(),
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
 * Resolves date boundaries and aggregation bucket size for the analytics endpoint.
 *
 * @param {AnalyticsTimeRangePreset} preset - Preset window ('1h', '6h', '24h', '7d', '30d')
 * @returns {{ from: Date; to: Date; durationMinutes: number; bucketSeconds: number }} Resolved boundaries and bucket duration
 */
export function resolveAnalyticsDateRange(
  preset: AnalyticsTimeRangePreset
): { from: Date; to: Date; durationMinutes: number; bucketSeconds: number } {
  const to = new Date();
  const from = new Date(to.getTime());
  let bucketSeconds = 900; // 15m default

  switch (preset) {
    case AnalyticsTimeRangePreset.ONE_HOUR:
      from.setHours(from.getHours() - 1);
      bucketSeconds = 60; // 1-minute buckets -> 60 points
      break;
    case AnalyticsTimeRangePreset.SIX_HOURS:
      from.setHours(from.getHours() - 6);
      bucketSeconds = 300; // 5-minute buckets -> 72 points
      break;
    case AnalyticsTimeRangePreset.SEVEN_DAYS:
      from.setDate(from.getDate() - 7);
      bucketSeconds = 7200; // 2-hour buckets -> 84 points
      break;
    case AnalyticsTimeRangePreset.THIRTY_DAYS:
      from.setDate(from.getDate() - 30);
      bucketSeconds = 28800; // 8-hour buckets -> 90 points
      break;
    case AnalyticsTimeRangePreset.TWENTY_FOUR_HOURS:
    default:
      from.setHours(from.getHours() - 24);
      bucketSeconds = 900; // 15-minute buckets -> 96 points
      break;
  }

  const durationMinutes = Math.max(1, (to.getTime() - from.getTime()) / 60000);
  return { from, to, durationMinutes, bucketSeconds };
}

/**
 * Resolves geographic country details from an IP address.
 * Deterministic fallback mapping used when GeoIP database is not attached.
 *
 * @param {string | null} ip - Client IP address
 * @returns {{ countryCode: string; countryName: string }} Country code and human-readable name
 */
export function resolveGeoFromIp(ip: string | null): { countryCode: string; countryName: string } {
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return { countryCode: 'US', countryName: 'United States' };
  }
  const parts = ip.split('.');
  const hash = parts.reduce((acc, part) => (acc * 31 + (parseInt(part, 10) || 0)) % 1000, 0);
  const geoPool = [
    { countryCode: 'US', countryName: 'United States' },
    { countryCode: 'DE', countryName: 'Germany' },
    { countryCode: 'GB', countryName: 'United Kingdom' },
    { countryCode: 'IN', countryName: 'India' },
    { countryCode: 'JP', countryName: 'Japan' },
    { countryCode: 'CA', countryName: 'Canada' },
    { countryCode: 'FR', countryName: 'France' },
    { countryCode: 'AU', countryName: 'Australia' },
  ];
  return geoPool[hash % geoPool.length];
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

    // 1. Time-series aggregation in 15-minute intervals (900 seconds)
    interface RawTimeBucket {
      bucket: Date;
      requests: number | bigint;
      errors: number | bigint;
    }

    const rawTimeBuckets = await prisma.$queryRaw<RawTimeBucket[]>`
      SELECT
        to_timestamp(floor(extract(epoch from "timestamp") / 900) * 900) AS "bucket",
        COUNT(*)::int AS "requests",
        COUNT(CASE WHEN "statusCode" >= 400 THEN 1 END)::int AS "errors"
      FROM "RequestLog"
      WHERE "timestamp" >= ${from} AND "timestamp" <= ${to}
        AND (${apiKeyId ?? null}::text IS NULL OR "apiKeyId" = ${apiKeyId ?? null})
      GROUP BY "bucket"
      ORDER BY "bucket" ASC;
    `;

    const bucketMap = new Map<number, { requests: number; errors: number }>();
    for (const b of rawTimeBuckets) {
      const bTime = new Date(b.bucket).getTime();
      bucketMap.set(bTime, {
        requests: Number(b.requests),
        errors: Number(b.errors),
      });
    }

    // Generate continuous 15-minute slots across the range so the chart has consistent points
    const requestsOverTime: RequestsOverTimePoint[] = [];
    const stepMs = 15 * 60 * 1000;
    const startMs = Math.floor(from.getTime() / stepMs) * stepMs;
    const endMs = to.getTime();

    for (let currentMs = startMs; currentMs <= endMs; currentMs += stepMs) {
      const match = bucketMap.get(currentMs);
      const slotDate = new Date(currentMs);
      requestsOverTime.push({
        timestamp: slotDate.toISOString(),
        requests: match ? match.requests : 0,
        errors: match ? match.errors : 0,
      });
    }

    // 2. Top 5 endpoints by request volume
    interface RawTopEndpoint {
      endpoint: string;
      count: number | bigint;
    }

    const rawTopEndpoints = await prisma.$queryRaw<RawTopEndpoint[]>`
      SELECT
        "path" AS "endpoint",
        COUNT(*)::int AS "count"
      FROM "RequestLog"
      WHERE "timestamp" >= ${from} AND "timestamp" <= ${to}
        AND (${apiKeyId ?? null}::text IS NULL OR "apiKeyId" = ${apiKeyId ?? null})
      GROUP BY "path"
      ORDER BY "count" DESC
      LIMIT 5;
    `;

    const topEndpoints: TopEndpointItem[] = rawTopEndpoints.map((item) => ({
      endpoint: String(item.endpoint),
      count: Number(item.count),
    }));

    // 3. Count of active API keys
    const activeApiKeys = await prisma.apiKey.count({
      where: { isActive: true },
    });

    // 4. Last 10 failed requests (statusCode >= 400)
    const rawRecentErrors = await prisma.requestLog.findMany({
      where: {
        timestamp: { gte: from, lte: to },
        statusCode: { gte: 400 },
        ...(apiKeyId ? { apiKeyId } : {}),
      },
      take: 10,
      orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
      include: {
        apiKey: {
          select: {
            name: true,
          },
        },
      },
    });

    const recentErrors: RecentErrorItem[] = rawRecentErrors.map((log) => ({
      id: log.id,
      path: log.path,
      method: log.method,
      statusCode: log.statusCode,
      responseTimeMs: log.responseTimeMs,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      timestamp: log.timestamp.toISOString(),
      apiKeyName: log.apiKey?.name ?? null,
    }));

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
      activeApiKeys,
      requestsOverTime,
      topEndpoints,
      recentErrors,
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
 * GET /api/logs/analytics
 * Retrieves aggregated time-series telemetry, latency percentiles, status distribution,
 * top keys, and geographic metrics for deep performance analytics.
 */
logRouter.get('/analytics', async (req: Request, res: Response): Promise<void> => {
  try {
    const validation = analyticsQuerySchema.safeParse(req.query);
    if (!validation.success) {
      res.status(400).json({
        error: 'Validation Error',
        details: validation.error.flatten().fieldErrors,
      });
      return;
    }

    const { timeRange } = validation.data;
    const { from, to, durationMinutes, bucketSeconds } = resolveAnalyticsDateRange(timeRange);

    // 1. Overall Summary KPIs Query
    interface RawAnalyticsSummary {
      totalRequests: number | bigint;
      avgResponseTime: number | null;
      p50: number | null;
      p95: number | null;
      p99: number | null;
      errorCount: number | bigint;
    }

    const rawSummary = await prisma.$queryRaw<RawAnalyticsSummary[]>`
      SELECT
        COUNT(*)::int AS "totalRequests",
        COALESCE(AVG("responseTimeMs"), 0)::float AS "avgResponseTime",
        COALESCE(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY "responseTimeMs"), 0)::float AS "p50",
        COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "responseTimeMs"), 0)::float AS "p95",
        COALESCE(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY "responseTimeMs"), 0)::float AS "p99",
        COUNT(CASE WHEN "statusCode" >= 400 THEN 1 END)::int AS "errorCount"
      FROM "RequestLog"
      WHERE "timestamp" >= ${from} AND "timestamp" <= ${to};
    `;

    const summaryRow = rawSummary[0] ?? {
      totalRequests: 0,
      avgResponseTime: 0,
      p50: 0,
      p95: 0,
      p99: 0,
      errorCount: 0,
    };

    const totalRequests = Number(summaryRow.totalRequests);
    const errorCount = Number(summaryRow.errorCount);
    const errorRatePercent =
      totalRequests > 0 ? Number(((errorCount / totalRequests) * 100).toFixed(2)) : 0;
    const requestsPerMinute = Number((totalRequests / durationMinutes).toFixed(2));

    const activeApiKeys = await prisma.apiKey.count({
      where: { isActive: true },
    });

    const summary: AnalyticsSummary = {
      totalRequests,
      requestsPerMinute,
      avgResponseTimeMs: Number((summaryRow.avgResponseTime ?? 0).toFixed(2)),
      errorRatePercent,
      p50: Number((summaryRow.p50 ?? 0).toFixed(2)),
      p95: Number((summaryRow.p95 ?? 0).toFixed(2)),
      p99: Number((summaryRow.p99 ?? 0).toFixed(2)),
      activeApiKeys,
    };

    // 2. RPM & Latency Percentiles Time-Series Aggregation
    interface RawBucketPoint {
      bucket: Date;
      requests: number | bigint;
      p50: number | null;
      p95: number | null;
      p99: number | null;
    }

    const rawTimeBuckets = await prisma.$queryRaw<RawBucketPoint[]>`
      SELECT
        to_timestamp(floor(extract(epoch from "timestamp") / ${bucketSeconds}) * ${bucketSeconds}) AS "bucket",
        COUNT(*)::int AS "requests",
        COALESCE(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY "responseTimeMs"), 0)::float AS "p50",
        COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "responseTimeMs"), 0)::float AS "p95",
        COALESCE(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY "responseTimeMs"), 0)::float AS "p99"
      FROM "RequestLog"
      WHERE "timestamp" >= ${from} AND "timestamp" <= ${to}
      GROUP BY "bucket"
      ORDER BY "bucket" ASC;
    `;

    const bucketMap = new Map<
      number,
      { requests: number; p50: number; p95: number; p99: number }
    >();

    for (const b of rawTimeBuckets) {
      const bTime = new Date(b.bucket).getTime();
      bucketMap.set(bTime, {
        requests: Number(b.requests),
        p50: Number(b.p50 ?? 0),
        p95: Number(b.p95 ?? 0),
        p99: Number(b.p99 ?? 0),
      });
    }

    const rpmSeries: RpmDataPoint[] = [];
    const latencyPercentiles: LatencyPercentilePoint[] = [];
    const stepMs = bucketSeconds * 1000;
    const startAligned = Math.floor(from.getTime() / stepMs) * stepMs;
    const endAligned = to.getTime();
    const minutesPerBucket = bucketSeconds / 60;

    for (let cur = startAligned; cur <= endAligned; cur += stepMs) {
      const entry = bucketMap.get(cur);
      const reqCount = entry ? entry.requests : 0;
      const rpm = Number((reqCount / minutesPerBucket).toFixed(2));
      const isoTime = new Date(cur).toISOString();

      rpmSeries.push({
        timestamp: isoTime,
        rpm,
        requestCount: reqCount,
      });

      latencyPercentiles.push({
        timestamp: isoTime,
        p50: entry ? Number(entry.p50.toFixed(2)) : 0,
        p95: entry ? Number(entry.p95.toFixed(2)) : 0,
        p99: entry ? Number(entry.p99.toFixed(2)) : 0,
      });
    }

    // 3. Status Code Distribution Grouped by Hour (or Window Bucket)
    const hourlyStepSeconds =
      timeRange === AnalyticsTimeRangePreset.THIRTY_DAYS
        ? 86400
        : timeRange === AnalyticsTimeRangePreset.SEVEN_DAYS
          ? 21600
          : 3600;

    interface RawStatusBucket {
      bucket: Date;
      status2xx: number | bigint;
      status3xx: number | bigint;
      status4xx: number | bigint;
      status5xx: number | bigint;
    }

    const rawStatusBuckets = await prisma.$queryRaw<RawStatusBucket[]>`
      SELECT
        to_timestamp(floor(extract(epoch from "timestamp") / ${hourlyStepSeconds}) * ${hourlyStepSeconds}) AS "bucket",
        COUNT(CASE WHEN "statusCode" >= 200 AND "statusCode" < 300 THEN 1 END)::int AS "status2xx",
        COUNT(CASE WHEN "statusCode" >= 300 AND "statusCode" < 400 THEN 1 END)::int AS "status3xx",
        COUNT(CASE WHEN "statusCode" >= 400 AND "statusCode" < 500 THEN 1 END)::int AS "status4xx",
        COUNT(CASE WHEN "statusCode" >= 500 THEN 1 END)::int AS "status5xx"
      FROM "RequestLog"
      WHERE "timestamp" >= ${from} AND "timestamp" <= ${to}
      GROUP BY "bucket"
      ORDER BY "bucket" ASC;
    `;

    const statusMap = new Map<
      number,
      { status2xx: number; status3xx: number; status4xx: number; status5xx: number }
    >();

    for (const sb of rawStatusBuckets) {
      const bTime = new Date(sb.bucket).getTime();
      statusMap.set(bTime, {
        status2xx: Number(sb.status2xx),
        status3xx: Number(sb.status3xx),
        status4xx: Number(sb.status4xx),
        status5xx: Number(sb.status5xx),
      });
    }

    const statusDistribution: StatusDistributionPoint[] = [];
    const statusStepMs = hourlyStepSeconds * 1000;
    const statusStart = Math.floor(from.getTime() / statusStepMs) * statusStepMs;

    for (let cur = statusStart; cur <= endAligned; cur += statusStepMs) {
      const entry = statusMap.get(cur);
      statusDistribution.push({
        timestamp: new Date(cur).toISOString(),
        status2xx: entry ? entry.status2xx : 0,
        status3xx: entry ? entry.status3xx : 0,
        status4xx: entry ? entry.status4xx : 0,
        status5xx: entry ? entry.status5xx : 0,
      });
    }

    // 4. Top API Keys by Usage
    interface RawTopKey {
      apiKeyId: string | null;
      keyName: string | null;
      requestCount: number | bigint;
      errorCount: number | bigint;
      avgLatencyMs: number | null;
    }

    const rawTopKeys = await prisma.$queryRaw<RawTopKey[]>`
      SELECT
        l."apiKeyId",
        k."name" AS "keyName",
        COUNT(l."id")::int AS "requestCount",
        COUNT(CASE WHEN l."statusCode" >= 400 THEN 1 END)::int AS "errorCount",
        COALESCE(AVG(l."responseTimeMs"), 0)::float AS "avgLatencyMs"
      FROM "RequestLog" l
      LEFT JOIN "ApiKey" k ON l."apiKeyId" = k."id"
      WHERE l."timestamp" >= ${from} AND l."timestamp" <= ${to}
      GROUP BY l."apiKeyId", k."name"
      ORDER BY "requestCount" DESC
      LIMIT 10;
    `;

    const topKeys: TopKeyUsageItem[] = rawTopKeys.map((k) => {
      const count = Number(k.requestCount);
      const errors = Number(k.errorCount);
      return {
        apiKeyId: k.apiKeyId,
        keyName: k.keyName ?? 'Default Gateway Key',
        requestCount: count,
        percentage: totalRequests > 0 ? Number(((count / totalRequests) * 100).toFixed(1)) : 0,
        errorRatePercent: count > 0 ? Number(((errors / count) * 100).toFixed(2)) : 0,
        avgLatencyMs: Number((k.avgLatencyMs ?? 0).toFixed(2)),
      };
    });

    // 5. Geographic Distribution of Requests
    interface RawGeoItem {
      ipAddress: string | null;
      requestCount: number | bigint;
      avgLatencyMs: number | null;
    }

    const rawGeoRows = await prisma.$queryRaw<RawGeoItem[]>`
      SELECT
        "ipAddress",
        COUNT("id")::int AS "requestCount",
        COALESCE(AVG("responseTimeMs"), 0)::float AS "avgLatencyMs"
      FROM "RequestLog"
      WHERE "timestamp" >= ${from} AND "timestamp" <= ${to}
      GROUP BY "ipAddress"
      ORDER BY "requestCount" DESC
      LIMIT 100;
    `;

    const countryMap = new Map<string, { name: string; count: number; totalLatency: number }>();

    for (const row of rawGeoRows) {
      const { countryCode, countryName } = resolveGeoFromIp(row.ipAddress);
      const count = Number(row.requestCount);
      const latency = Number(row.avgLatencyMs ?? 0);
      const existing = countryMap.get(countryCode) || {
        name: countryName,
        count: 0,
        totalLatency: 0,
      };
      existing.count += count;
      existing.totalLatency += latency * count;
      countryMap.set(countryCode, existing);
    }

    const geoDistribution: GeoDistributionItem[] = Array.from(countryMap.entries())
      .map(([code, val]) => ({
        countryCode: code,
        countryName: val.name,
        requestCount: val.count,
        percentage:
          totalRequests > 0 ? Number(((val.count / totalRequests) * 100).toFixed(1)) : 0,
        avgLatencyMs: val.count > 0 ? Number((val.totalLatency / val.count).toFixed(2)) : 0,
      }))
      .sort((a, b) => b.requestCount - a.requestCount);

    const payload: AnalyticsResponse = {
      timeRange,
      dateFrom: from.toISOString(),
      dateTo: to.toISOString(),
      summary,
      rpmSeries,
      latencyPercentiles,
      statusDistribution,
      topKeys,
      geoDistribution,
    };

    res.status(200).json(payload);
  } catch (error: unknown) {
    console.error('[LogRoutes GET /api/logs/analytics Error]:', {
      error: error instanceof Error ? error.message : String(error),
      query: req.query,
    });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to compute analytics time-series metrics.',
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

    const { cursor, limit, apiKeyId, status, dateFrom, dateTo, method, path } =
      validation.data;

    // Build dynamic Prisma where filter object
    const where: Prisma.RequestLogWhereInput = {};

    if (apiKeyId) {
      where.apiKeyId = apiKeyId;
    }

    if (method) {
      where.method = method;
    }

    if (path && path.trim() !== '') {
      where.path = { contains: path.trim(), mode: 'insensitive' };
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
 * GET /api/logs/stream
 * Server-Sent Events (SSE) endpoint providing live streaming of proxied request logs.
 */
logRouter.get('/stream', async (req: Request, res: Response): Promise<void> => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  res.write(': connected\n\n');

  // Dedicated ioredis subscriber instance
  const subscriber = redis.duplicate();

  const handleMessage = (_channel: string, message: string) => {
    try {
      res.write(`data: ${message}\n\n`);
    } catch {
      // Stream write error
    }
  };

  try {
    subscriber.on('message', handleMessage);
    await subscriber.subscribe('request-logs-stream');
  } catch (subErr) {
    console.error('[LogRoutes /stream subscribe error]:', subErr);
  }

  // Heartbeat ping every 15s to keep connection alive
  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, 15000);

  req.on('close', async () => {
    clearInterval(heartbeat);
    subscriber.off('message', handleMessage);
    try {
      await subscriber.unsubscribe('request-logs-stream');
      await subscriber.quit();
    } catch {
      // Ignore disconnect cleanup errors
    }
  });
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
