/**
 * @file packages/dashboard/src/types/stats.ts
 * @description TypeScript interface definitions and enums for GateForge telemetry statistics,
 * API metrics, and dashboard state management.
 */

/**
 * Standard preset time window identifiers for statistical aggregation.
 */
export enum TimeRangePreset {
  ONE_HOUR = '1h',
  TWENTY_FOUR_HOURS = '24h',
  SEVEN_DAYS = '7d',
}

/**
 * Dashboard navigation sections supported by the App Router sidebar.
 */
export enum DashboardRoute {
  OVERVIEW = '/',
  API_KEYS = '/keys',
  LOGS = '/logs',
  ANALYTICS = '/analytics',
  ANOMALIES = '/anomalies',
}

/**
 * Single 15-minute time-series data point for requests over time.
 */
export interface RequestsOverTimePoint {
  timestamp: string;
  requests: number;
  errors: number;
}

/**
 * Top endpoint representation with request count for horizontal bar chart.
 */
export interface TopEndpointItem {
  endpoint: string;
  count: number;
}

/**
 * Detailed failed request log entry for recent errors table.
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
 * Status code distribution breakdown.
 */
export interface StatusBreakdown {
  status2xx: number;
  status3xx: number;
  status4xx: number;
  status5xx: number;
}

/**
 * Percentile latency breakdown in milliseconds.
 */
export interface LatencyPercentiles {
  p50: number;
  p95: number;
  p99: number;
}

/**
 * Complete statistics response payload returned by the gateway's /api/logs/stats endpoint.
 */
export interface LogStatisticsResponse {
  timeRange: string;
  dateFrom: string;
  dateTo: string;
  totalRequests: number;
  requestsPerMinute: number;
  avgResponseTimeMs: number;
  errorRatePercent: number;
  percentiles: LatencyPercentiles;
  statusBreakdown: StatusBreakdown;
  activeApiKeys: number;
  requestsOverTime: RequestsOverTimePoint[];
  topEndpoints: TopEndpointItem[];
  recentErrors: RecentErrorItem[];
}
