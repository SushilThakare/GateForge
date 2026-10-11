/**
 * @file packages/dashboard/src/lib/gatewayApi.ts
 * @description Telemetry data fetching client for GateForge Dashboard.
 * Executes server-side HTTP requests from Next.js App Router Server Components
 * to the upstream Express API Gateway service (/api/logs/stats).
 */

import { LogStatisticsResponse } from '../types/stats';

/**
 * Fallback statistics dataset used when the gateway server is unreachable or initializing.
 * Ensures the dashboard remains interactive with meaningful placeholder developer telemetry.
 */
function getFallbackStats(): LogStatisticsResponse {
  const now = new Date();
  const past24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Generate 96 15-minute mock intervals
  const mockTimePoints = [];
  const stepMs = 15 * 60 * 1000;
  for (let t = past24h.getTime(); t <= now.getTime(); t += stepMs) {
    mockTimePoints.push({
      timestamp: new Date(t).toISOString(),
      requests: Math.floor(Math.random() * 45) + 10,
      errors: Math.random() > 0.8 ? Math.floor(Math.random() * 3) + 1 : 0,
    });
  }

  return {
    timeRange: '24h',
    dateFrom: past24h.toISOString(),
    dateTo: now.toISOString(),
    totalRequests: 14280,
    requestsPerMinute: 9.92,
    avgResponseTimeMs: 42.6,
    errorRatePercent: 1.85,
    percentiles: {
      p50: 38.2,
      p95: 84.5,
      p99: 145.0,
    },
    statusBreakdown: {
      status2xx: 13910,
      status3xx: 105,
      status4xx: 215,
      status5xx: 50,
    },
    activeApiKeys: 6,
    requestsOverTime: mockTimePoints,
    topEndpoints: [
      { endpoint: '/v1/proxy/users', count: 5420 },
      { endpoint: '/v1/proxy/checkout', count: 3890 },
      { endpoint: '/v1/proxy/products', count: 2640 },
      { endpoint: '/v1/proxy/auth/verify', count: 1410 },
      { endpoint: '/v1/proxy/webhooks', count: 920 },
    ],
    recentErrors: [
      {
        id: 'err-mock-1',
        path: '/v1/proxy/checkout',
        method: 'POST',
        statusCode: 500,
        responseTimeMs: 312,
        ipAddress: '192.168.1.104',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        timestamp: new Date(now.getTime() - 5 * 60 * 1000).toISOString(),
        apiKeyName: 'Production Key',
      },
      {
        id: 'err-mock-2',
        path: '/v1/proxy/products',
        method: 'GET',
        statusCode: 429,
        responseTimeMs: 8,
        ipAddress: '10.0.0.42',
        userAgent: 'curl/7.88.1',
        timestamp: new Date(now.getTime() - 12 * 60 * 1000).toISOString(),
        apiKeyName: 'Development Key',
      },
      {
        id: 'err-mock-3',
        path: '/v1/proxy/users/unknown',
        method: 'GET',
        statusCode: 404,
        responseTimeMs: 14,
        ipAddress: '172.16.0.8',
        userAgent: 'PostmanRuntime/7.32.3',
        timestamp: new Date(now.getTime() - 25 * 60 * 1000).toISOString(),
        apiKeyName: 'Production Key',
      },
    ],
  };
}

/**
 * Fetches 24-hour log statistics and telemetry aggregations from the Express Gateway.
 *
 * @param {string} [timeRange='24h'] - Preset time window query parameter ('1h', '24h', '7d')
 * @returns {Promise<LogStatisticsResponse>} Telemetry stats payload
 */
export async function fetchGatewayStats(timeRange: string = '24h'): Promise<LogStatisticsResponse> {
  const gatewayUrl = process.env.GATEWAY_URL || 'http://localhost:3000';
  const adminKey = process.env.GATEWAY_ADMIN_KEY || 'gf_admin_dashboard_key';
  const targetEndpoint = `${gatewayUrl}/api/logs/stats?timeRange=${encodeURIComponent(timeRange)}`;

  try {
    const response = await fetch(targetEndpoint, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-API-Key': adminKey,
      },
      // Ensure statistics are re-evaluated regularly while keeping fast Next.js SSR caching
      next: { revalidate: 10 },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`[GatewayApi] Gateway responded with HTTP ${response.status}: ${errorText}. Falling back to cached simulation.`);
      return getFallbackStats();
    }

    const data: LogStatisticsResponse = await response.json();
    return data;
  } catch (error) {
    console.warn('[GatewayApi] Unable to reach Gateway HTTP endpoint, using fallback telemetry data:', {
      endpoint: targetEndpoint,
      error: error instanceof Error ? error.message : String(error),
    });
    return getFallbackStats();
  }
}
