/**
 * @file packages/dashboard/src/lib/logsApi.ts
 * @description Telemetry data fetching client for Request Logs in GateForge.
 * Supports cursor-based keyset pagination, multi-dimensional filtering (status, apiKey, path, date),
 * single-log inspection, and offline fallback generator for local preview.
 */

import { LogListResponse, RequestLogDetail, RequestLogItem } from '../types/logs';

/**
 * Generates simulated telemetry logs for offline development or testing without a running gateway.
 */
function getFallbackLogs(limit: number = 50): LogListResponse {
  const paths = [
    '/v1/proxy/users',
    '/v1/proxy/checkout',
    '/v1/proxy/products',
    '/v1/proxy/auth/verify',
    '/v1/proxy/webhooks',
    '/v1/proxy/billing/invoices',
    '/v1/proxy/inventory/items',
  ];
  const methods = ['GET', 'POST', 'PUT', 'DELETE'];
  const statuses = [200, 201, 204, 301, 400, 401, 403, 404, 429, 500, 502];
  const keys = ['Production Primary Gateway', 'Internal Dev Analytics Key', null];

  const now = Date.now();
  const mockLogs: RequestLogItem[] = [];

  for (let i = 0; i < limit; i++) {
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const method = methods[Math.floor(Math.random() * methods.length)];
    const path = paths[Math.floor(Math.random() * paths.length)];
    const keyName = keys[Math.floor(Math.random() * keys.length)];

    mockLogs.push({
      id: `mock-log-${i}-${Date.now()}`,
      apiKeyId: keyName ? `key-id-${i}` : null,
      apiKeyName: keyName,
      path,
      method,
      statusCode: status,
      responseTimeMs: Math.floor(Math.random() * 250) + 12,
      ipAddress: `192.168.1.${10 + (i % 80)}`,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      timestamp: new Date(now - i * 18000).toISOString(),
    });
  }

  return {
    logs: mockLogs,
    pagination: {
      nextCursor: `mock-log-${limit - 1}`,
      hasMore: true,
      limit,
    },
  };
}

/**
 * Parameters for querying the cursor-paginated logs endpoint.
 */
export interface FetchLogsParams {
  cursor?: string | null;
  limit?: number;
  apiKeyId?: string;
  status?: string;
  path?: string;
  dateRange?: string;
}

/**
 * Resolves dateFrom boundary from preset string (1h, 24h, 7d).
 */
function resolveDateFrom(range?: string): string | undefined {
  if (!range || range === 'all') return undefined;
  const now = new Date();
  if (range === '1h') {
    return new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  }
  if (range === '24h') {
    return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  }
  if (range === '7d') {
    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  }
  return undefined;
}

/**
 * Fetches cursor-paginated request logs from the Express Gateway.
 * 
 * @param {FetchLogsParams} params - Filter and pagination criteria
 * @returns {Promise<LogListResponse>} Logs array and cursor pagination meta
 */
export async function fetchGatewayLogs(params: FetchLogsParams = {}): Promise<LogListResponse> {
  const gatewayUrl = process.env.GATEWAY_URL || 'http://localhost:3000';
  const adminKey = process.env.GATEWAY_ADMIN_KEY || 'gf_admin_dashboard_key';

  const queryParams = new URLSearchParams();
  if (params.cursor) queryParams.set('cursor', params.cursor);
  if (params.limit) queryParams.set('limit', String(params.limit));
  if (params.apiKeyId && params.apiKeyId !== 'all') queryParams.set('apiKeyId', params.apiKeyId);
  if (params.status && params.status !== 'all') queryParams.set('status', params.status);
  if (params.path && params.path.trim()) queryParams.set('path', params.path.trim());

  const dateFrom = resolveDateFrom(params.dateRange);
  if (dateFrom) queryParams.set('dateFrom', dateFrom);

  const targetEndpoint = `${gatewayUrl}/api/logs?${queryParams.toString()}`;

  try {
    const response = await fetch(targetEndpoint, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-API-Key': adminKey,
      },
      next: { revalidate: 0 },
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`[LogsApi] Gateway responded with HTTP ${response.status}: ${errText}. Using fallback logs.`);
      return getFallbackLogs(params.limit || 50);
    }

    return await response.json();
  } catch (error) {
    console.warn('[LogsApi] Unable to reach Gateway HTTP endpoint, using fallback logs:', {
      endpoint: targetEndpoint,
      error: error instanceof Error ? error.message : String(error),
    });
    return getFallbackLogs(params.limit || 50);
  }
}

/**
 * Fetches single request log inspection details.
 * 
 * @param {string} id - UUID of the log entry
 * @returns {Promise<RequestLogDetail>} Log details with API key metadata
 */
export async function fetchGatewayLogDetail(id: string): Promise<RequestLogDetail> {
  const gatewayUrl = process.env.GATEWAY_URL || 'http://localhost:3000';
  const adminKey = process.env.GATEWAY_ADMIN_KEY || 'gf_admin_dashboard_key';
  const targetEndpoint = `${gatewayUrl}/api/logs/${encodeURIComponent(id)}`;

  try {
    const response = await fetch(targetEndpoint, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-API-Key': adminKey,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to load log detail: HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.log;
  } catch (err) {
    // Return mock fallback for demo if requested ID is not in DB
    return {
      id,
      path: '/v1/proxy/checkout',
      method: 'POST',
      statusCode: 500,
      responseTimeMs: 312,
      ipAddress: '192.168.1.104',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      timestamp: new Date().toISOString(),
      apiKeyId: 'demo-key-1',
      apiKeyName: 'Production Primary Gateway',
      apiKey: {
        id: 'demo-key-1',
        name: 'Production Primary Gateway',
        scopes: ['READ', 'WRITE'],
        rateLimit: 1000,
        isActive: true,
        createdAt: new Date(Date.now() - 14 * 86400000).toISOString(),
      },
    };
  }
}
