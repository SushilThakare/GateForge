/**
 * @file packages/dashboard/src/types/logs.ts
 * @description TypeScript interface definitions and enums for Request Logs,
 * cursor-based pagination, filter parameters, and Server-Sent Events (SSE).
 */

/**
 * Standard HTTP Status Code family filter categories.
 */
export enum StatusFamilyFilter {
  ALL = 'all',
  SUCCESS_2XX = '2xx',
  REDIRECT_3XX = '3xx',
  CLIENT_ERROR_4XX = '4xx',
  SERVER_ERROR_5XX = '5xx',
}

/**
 * Filter state parameters applied to log queries.
 */
export interface LogsFilterState {
  status: string;
  apiKeyId: string;
  dateRange: string;
  path: string;
  method?: string;
}

/**
 * Cursor pagination metadata returned with log list queries.
 */
export interface CursorPaginationMeta {
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
}

/**
 * Single request log record returned by list endpoints and rendered in virtualized rows.
 */
export interface RequestLogItem {
  id: string;
  apiKeyId: string | null;
  apiKeyName: string | null;
  path: string;
  method: string;
  statusCode: number;
  responseTimeMs: number;
  ipAddress: string;
  userAgent: string | null;
  timestamp: string;
}

/**
 * Full log details payload including associated API key metadata for slide-out inspection.
 */
export interface RequestLogDetail extends RequestLogItem {
  apiKey?: {
    id: string;
    name: string;
    scopes: string[];
    rateLimit: number;
    isActive: boolean;
    createdAt: string;
  } | null;
}

/**
 * Response structure returned by cursor-paginated log queries.
 */
export interface LogListResponse {
  logs: RequestLogItem[];
  pagination: CursorPaginationMeta;
}
