/**
 * @file packages/dashboard/src/types/analytics.ts
 * @description Strict TypeScript interfaces and types for GateForge Analytics.
 * Models time-range presets, latency percentiles, requests-per-minute series,
 * status code distributions, top API key usage, and geographic telemetry.
 */

export type AnalyticsTimeRangePreset = '1h' | '6h' | '24h' | '7d' | '30d';

export interface RpmDataPoint {
  timestamp: string;
  rpm: number;
  requestCount: number;
}

export interface LatencyPercentilePoint {
  timestamp: string;
  p50: number;
  p95: number;
  p99: number;
}

export interface StatusDistributionPoint {
  timestamp: string;
  status2xx: number;
  status3xx: number;
  status4xx: number;
  status5xx: number;
}

export interface TopKeyUsageItem {
  apiKeyId: string | null;
  keyName: string;
  requestCount: number;
  percentage: number;
  errorRatePercent: number;
  avgLatencyMs: number;
}

export interface GeoDistributionItem {
  countryCode: string;
  countryName: string;
  requestCount: number;
  percentage: number;
  avgLatencyMs: number;
}

export interface AnalyticsSummary {
  totalRequests: number;
  requestsPerMinute: number;
  avgResponseTimeMs: number;
  errorRatePercent: number;
  p50: number;
  p95: number;
  p99: number;
  activeApiKeys: number;
}

export interface AnalyticsResponse {
  timeRange: AnalyticsTimeRangePreset;
  dateFrom: string;
  dateTo: string;
  summary: AnalyticsSummary;
  rpmSeries: RpmDataPoint[];
  latencyPercentiles: LatencyPercentilePoint[];
  statusDistribution: StatusDistributionPoint[];
  topKeys: TopKeyUsageItem[];
  geoDistribution: GeoDistributionItem[];
}
