/**
 * @file packages/dashboard/src/types/anomalies.ts
 * @description Strict TypeScript interfaces, enums, and types for AI Anomaly Detection in GateForge.
 * Defines models for reports, detected anomalies, severity categorizations, filter parameters,
 * and operational scheduler status telemetry.
 */

/**
 * Severity ranking of an AI-identified anomaly.
 */
export enum AnomalySeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

/**
 * Behavioral category of the anomaly detected by the LangChain / GPT-4o-mini analyzer.
 */
export enum AnomalyType {
  TRAFFIC_SPIKE = 'TRAFFIC_SPIKE',
  HIGH_ERROR_RATE = 'HIGH_ERROR_RATE',
  DDOS_PATTERN = 'DDOS_PATTERN',
  RESPONSE_DEGRADATION = 'RESPONSE_DEGRADATION',
  UNUSUAL_ENDPOINT = 'UNUSUAL_ENDPOINT',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Aggregate risk level of the entire 1-hour traffic analysis window.
 */
export enum RiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

/**
 * Represents an individual anomaly event detected within a 1-hour report window.
 */
export interface AnomalyItem {
  id: string;
  reportId: string;
  type: AnomalyType | string;
  severity: AnomalySeverity | string;
  description: string;
  evidence: string;
  recommendation: string;
  createdAt: string;
}

/**
 * 1-hour AI Traffic Anomaly Report entity containing executive summary and child anomalies.
 */
export interface AnomalyReportItem {
  id: string;
  windowStart: string;
  windowEnd: string;
  summary: string;
  overallRisk: RiskLevel | string;
  anomalies: AnomalyItem[];
  createdAt: string;
}

/**
 * BullMQ scheduler and operational lifecycle metadata.
 */
export interface AnomalyStatusMeta {
  lastRunAt: string | null;
  nextScheduledAt: string | null;
  totalReports: number;
  activeAlertsCount: number;
  status: 'idle' | 'running' | 'scheduled';
}

/**
 * Standard API response payload returned when listing anomaly reports.
 */
export interface AnomalyListResponse {
  reports: AnomalyReportItem[];
  status: AnomalyStatusMeta;
}

/**
 * Query filter parameters supported by the anomalies timeline.
 */
export interface FetchAnomaliesParams {
  severity?: 'ALL' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  dateRange?: '1h' | '24h' | '7d' | '30d' | 'all';
  limit?: number;
}

/**
 * Response payload returned upon triggering an on-demand analysis run.
 */
export interface TriggerAnalysisResponse {
  success: boolean;
  message: string;
  jobId?: string;
  queuedAt?: string;
}
