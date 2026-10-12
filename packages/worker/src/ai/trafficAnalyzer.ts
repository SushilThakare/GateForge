/**
 * @file packages/worker/src/ai/trafficAnalyzer.ts
 * @description AI-powered traffic anomaly detection for GateForge.
 *
 * Architecture position:
 *   PostgreSQL (RequestLog) → aggregateTrafficMetrics() → LangChain / GPT-4o-mini
 *                                                              ↓ (structured Zod output)
 *                                                    saveAnomalyReport() → PostgreSQL (AnomalyReport + Anomaly)
 *   BullMQ repeatable job (every hour) → runTrafficAnalysis()
 *
 * Why LLMs for anomaly detection?
 *   Traditional statistical methods (z-score, moving average, STL decomposition) need
 *   historical baselines and hand-tuned thresholds for EACH metric independently.
 *   An LLM can reason across ALL metrics simultaneously with zero calibration —
 *   it understands that "low RPM + high error rate + few IPs" together indicate a
 *   targeted attack, which pure stats would miss without complex correlation code.
 */

import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { z } from 'zod';
import { Queue } from 'bullmq';
import { prisma } from '../lib/prisma.js';
import { getRedisConfig } from '../lib/redis.js';
import type { AnomalySeverity, AnomalyType, RiskLevel } from '@prisma/client';

// ──────────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────────

/** BullMQ queue name dedicated to scheduled analysis jobs */
export const ANOMALY_ANALYSIS_QUEUE_NAME = 'anomaly-analysis' as const;

/** How far back (in ms) to look at traffic data — 1 hour */
export const ANALYSIS_WINDOW_MS = 60 * 60 * 1000;

/** Repeatable job key used to identify and deduplicate the scheduled run */
export const ANALYSIS_JOB_KEY = 'hourly-traffic-analysis' as const;

// ──────────────────────────────────────────────────────────────────────────────
// Zod Schemas — Traffic Metrics (aggregated from DB)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Per-minute time-series data point for the prompt.
 */
export const MinuteDataPointSchema = z.object({
  /** ISO minute label, e.g. "2024-03-15T14:23:00Z" */
  minute: z.string(),
  /** Total requests in this minute */
  requestCount: z.number().int().nonnegative(),
  /** Number of requests with status >= 400 */
  errorCount: z.number().int().nonnegative(),
  /** Computed error rate as a percentage (0–100) */
  errorRatePct: z.number().nonnegative(),
  /** Number of distinct IP addresses seen */
  uniqueIps: z.number().int().nonnegative(),
  /** Average response time in milliseconds */
  avgResponseMs: z.number().nonnegative(),
  /** 99th-percentile response time in milliseconds */
  p99ResponseMs: z.number().nonnegative(),
});

export type MinuteDataPoint = z.infer<typeof MinuteDataPointSchema>;

/**
 * Summary for a single endpoint over the analysis window.
 */
export const EndpointSummarySchema = z.object({
  path: z.string(),
  method: z.string(),
  totalRequests: z.number().int().nonnegative(),
  errorRatePct: z.number().nonnegative(),
  avgResponseMs: z.number().nonnegative(),
});

export type EndpointSummary = z.infer<typeof EndpointSummarySchema>;

/**
 * Full aggregated traffic metrics payload fed to the LLM.
 */
export const TrafficMetricsSchema = z.object({
  windowStart: z.string(),
  windowEnd: z.string(),
  totalRequests: z.number().int().nonnegative(),
  overallErrorRatePct: z.number().nonnegative(),
  avgRequestsPerMinute: z.number().nonnegative(),
  peakRequestsPerMinute: z.number().int().nonnegative(),
  avgResponseMs: z.number().nonnegative(),
  p99ResponseMs: z.number().nonnegative(),
  /** Minute-level time series (up to 60 points) */
  timeSeries: z.array(MinuteDataPointSchema),
  /** Top 10 endpoints by request volume */
  topEndpoints: z.array(EndpointSummarySchema),
});

export type TrafficMetrics = z.infer<typeof TrafficMetricsSchema>;

// ──────────────────────────────────────────────────────────────────────────────
// Zod Schemas — AI Output (structured response from LLM)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Zod schema that defines the exact structure we expect GPT-4o-mini to return.
 * LangChain converts this schema into an OpenAI "function call" JSON schema,
 * forcing the model to output valid JSON that matches this shape — eliminating
 * fragile regex parsing of free-form model output.
 */
export const AnomalySchema = z.object({
  type: z
    .enum(['TRAFFIC_SPIKE', 'HIGH_ERROR_RATE', 'DDOS_PATTERN', 'RESPONSE_DEGRADATION', 'UNUSUAL_ENDPOINT', 'UNKNOWN'])
    .describe('Category of the anomaly detected'),
  severity: z
    .enum(['low', 'medium', 'high', 'critical'])
    .describe('Severity level: low (informational), medium (monitor), high (investigate), critical (act now)'),
  description: z
    .string()
    .describe('1-2 sentence plain-English description of what was detected'),
  evidence: z
    .string()
    .describe('Specific numeric data points or timestamps from the metrics that support this finding'),
  recommendation: z
    .string()
    .describe('Concrete actionable step to investigate or mitigate this anomaly'),
});

export const AnalysisResultSchema = z.object({
  anomalies: z
    .array(AnomalySchema)
    .describe('List of all detected anomalies. Empty array if traffic looks normal.'),
  summary: z
    .string()
    .describe('1-2 sentence executive summary of the traffic window and its overall health'),
  overallRisk: z
    .enum(['low', 'medium', 'high', 'critical'])
    .describe('Holistic risk level of this traffic window considering all detected anomalies'),
});

export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
export type AnomalyResult = z.infer<typeof AnomalySchema>;

// ──────────────────────────────────────────────────────────────────────────────
// Step 1 — Aggregate Traffic Metrics from PostgreSQL
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Queries the last hour of RequestLog entries and computes per-minute time-series
 * metrics and top-endpoint summaries.
 *
 * Why raw SQL for aggregation?
 *   Prisma ORM doesn't support arbitrary `date_trunc` GROUP BY expressions in its
 *   query builder. Using `$queryRaw` gives us the full power of PostgreSQL window
 *   functions and percentile aggregates while still staying within the Prisma ecosystem.
 *
 * @param windowStartDate - Start of the analysis window (default: 1 hour ago)
 * @param windowEndDate   - End of the analysis window (default: now)
 * @returns {Promise<TrafficMetrics>} Aggregated metrics ready for the LLM prompt
 */
export async function aggregateTrafficMetrics(
  windowStartDate: Date = new Date(Date.now() - ANALYSIS_WINDOW_MS),
  windowEndDate: Date = new Date()
): Promise<TrafficMetrics> {
  // ── 1a. Per-minute time series ─────────────────────────────────────────────
  //
  // Computes request count, error count, unique IPs, avg response time, and
  // the 99th percentile response time for each calendar minute in the window.
  // `percentile_disc` is a PostgreSQL ordered-set aggregate — no ORM equivalent.
  const rawTimeSeries = await prisma.$queryRaw<
    Array<{
      minute: Date;
      request_count: bigint;
      error_count: bigint;
      unique_ips: bigint;
      avg_response_ms: number;
      p99_response_ms: number;
    }>
  >`
    SELECT
      date_trunc('minute', timestamp) AS minute,
      COUNT(*)                        AS request_count,
      COUNT(*) FILTER (WHERE "statusCode" >= 400) AS error_count,
      COUNT(DISTINCT "ipAddress")     AS unique_ips,
      AVG("responseTimeMs")::float    AS avg_response_ms,
      PERCENTILE_DISC(0.99) WITHIN GROUP (ORDER BY "responseTimeMs") AS p99_response_ms
    FROM "RequestLog"
    WHERE timestamp >= ${windowStartDate}
      AND timestamp <  ${windowEndDate}
    GROUP BY date_trunc('minute', timestamp)
    ORDER BY minute ASC
  `;

  // ── 1b. Top-10 endpoints by volume ────────────────────────────────────────
  const rawEndpoints = await prisma.$queryRaw<
    Array<{
      path: string;
      method: string;
      total_requests: bigint;
      error_count: bigint;
      avg_response_ms: number;
    }>
  >`
    SELECT
      path,
      method,
      COUNT(*)    AS total_requests,
      COUNT(*) FILTER (WHERE "statusCode" >= 400) AS error_count,
      AVG("responseTimeMs")::float AS avg_response_ms
    FROM "RequestLog"
    WHERE timestamp >= ${windowStartDate}
      AND timestamp <  ${windowEndDate}
    GROUP BY path, method
    ORDER BY total_requests DESC
    LIMIT 10
  `;

  // ── 1c. Normalize BigInt → number (Prisma returns COUNT as BigInt in raw SQL) ──
  const timeSeries: MinuteDataPoint[] = rawTimeSeries.map((row) => {
    const requestCount = Number(row.request_count);
    const errorCount = Number(row.error_count);
    const errorRatePct = requestCount > 0 ? (errorCount / requestCount) * 100 : 0;

    return {
      minute: row.minute.toISOString(),
      requestCount,
      errorCount,
      errorRatePct: Math.round(errorRatePct * 100) / 100,
      uniqueIps: Number(row.unique_ips),
      avgResponseMs: Math.round(row.avg_response_ms ?? 0),
      p99ResponseMs: Math.round(row.p99_response_ms ?? 0),
    };
  });

  const topEndpoints: EndpointSummary[] = rawEndpoints.map((row) => {
    const totalRequests = Number(row.total_requests);
    const errorCount = Number(row.error_count);
    const errorRatePct = totalRequests > 0 ? (errorCount / totalRequests) * 100 : 0;

    return {
      path: row.path,
      method: row.method,
      totalRequests,
      errorRatePct: Math.round(errorRatePct * 100) / 100,
      avgResponseMs: Math.round(row.avg_response_ms ?? 0),
    };
  });

  // ── 1d. Compute window-level aggregates ───────────────────────────────────
  const totalRequests = timeSeries.reduce((sum, m) => sum + m.requestCount, 0);
  const totalErrors = timeSeries.reduce((sum, m) => sum + m.errorCount, 0);
  const overallErrorRatePct = totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;
  const avgRequestsPerMinute = timeSeries.length > 0 ? totalRequests / timeSeries.length : 0;
  const peakRequestsPerMinute = timeSeries.length > 0
    ? Math.max(...timeSeries.map((m) => m.requestCount))
    : 0;
  const allResponseTimes = timeSeries.map((m) => m.avgResponseMs).filter((t) => t > 0);
  const avgResponseMs = allResponseTimes.length > 0
    ? allResponseTimes.reduce((s, t) => s + t, 0) / allResponseTimes.length
    : 0;
  const p99ResponseMs = timeSeries.length > 0
    ? Math.max(...timeSeries.map((m) => m.p99ResponseMs))
    : 0;

  return {
    windowStart: windowStartDate.toISOString(),
    windowEnd: windowEndDate.toISOString(),
    totalRequests,
    overallErrorRatePct: Math.round(overallErrorRatePct * 100) / 100,
    avgRequestsPerMinute: Math.round(avgRequestsPerMinute * 10) / 10,
    peakRequestsPerMinute,
    avgResponseMs: Math.round(avgResponseMs),
    p99ResponseMs,
    timeSeries,
    topEndpoints,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Step 2 — Call GPT-4o-mini via LangChain with Structured Output
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Sends aggregated traffic metrics to GPT-4o-mini and returns a structured
 * anomaly analysis result.
 *
 * How LangChain structured output works:
 *   1. `model.withStructuredOutput(schema)` converts our Zod schema into an
 *      OpenAI `tools` call definition (JSON Schema format).
 *   2. OpenAI's function-calling API forces the model to return JSON that
 *      matches the schema exactly — no free-form hallucination of keys.
 *   3. LangChain automatically parses and validates the response through Zod,
 *      throwing a ZodError if the model somehow violates the schema.
 *
 * @param metrics - Aggregated traffic data from aggregateTrafficMetrics()
 * @returns {Promise<AnalysisResult>} Validated anomaly analysis from the LLM
 */
export async function analyzeTrafficWithAI(metrics: TrafficMetrics): Promise<AnalysisResult> {
  const openAIApiKey = process.env.OPENAI_API_KEY;
  if (!openAIApiKey) {
    throw new Error(
      '[TrafficAnalyzer] OPENAI_API_KEY environment variable is not set. ' +
      'Add it to your .env file to enable AI anomaly detection.'
    );
  }

  // GPT-4o-mini is chosen over GPT-4o for cost efficiency:
  // ~$0.15/1M input tokens vs $5/1M — and anomaly detection doesn't require
  // deep creative reasoning, just pattern recognition on structured data.
  const model = new ChatOpenAI({
    model: 'gpt-4o-mini',
    temperature: 0.1, // Very low temperature → consistent, deterministic analysis
    apiKey: openAIApiKey,
  });

  // Attach our Zod schema → LangChain converts it to an OpenAI function definition.
  // This is the key trick: the model MUST call this "function" with the right shape.
  const structuredModel = model.withStructuredOutput(AnalysisResultSchema, {
    name: 'traffic_anomaly_analysis',
  });

  // ── Prompt Engineering Strategy ───────────────────────────────────────────
  //
  // 1. SYSTEM: Establish role + detection criteria with concrete thresholds.
  //    Specific numbers (>3x, >10% error rate) prevent vague outputs.
  //
  // 2. FEW-SHOT PATTERN: We embed named detection patterns with clear triggers
  //    so the model has calibrated reference points — this is more reliable
  //    than asking it to "detect anything unusual" without guidance.
  //
  // 3. SELF-CONSISTENCY INSTRUCTION: Ask it to justify with evidence from the
  //    data. This grounds the model and reduces hallucinated anomalies.
  const promptTemplate = ChatPromptTemplate.fromMessages([
    [
      'system',
      `You are an expert API gateway traffic analyst and security engineer.
Your job is to analyze 1-hour traffic windows from an API gateway and identify anomalies.

DETECTION CRITERIA (use these thresholds as guidance, not hard rules):
• TRAFFIC_SPIKE:        A minute with requests > 3x the window's average RPM
• HIGH_ERROR_RATE:      Error rate > 10% for 3+ consecutive minutes, or > 25% any single minute
• DDOS_PATTERN:         High request volume with very few unique IPs (requests/uniqueIps > 50 for a minute)
• RESPONSE_DEGRADATION: p99 response time > 3x the window average for 2+ consecutive minutes
• UNUSUAL_ENDPOINT:     An endpoint with sudden appearance or error rate > 30% and > 20 total requests

SEVERITY GUIDE:
• critical: Immediate action needed (active attack, complete degradation)
• high:     Investigate within the hour (spike, partial degradation)
• medium:   Monitor closely (warning signs, marginal thresholds)
• low:      Informational (slightly elevated, worth noting)

IMPORTANT:
- Only report anomalies supported by specific numbers from the provided data.
- If traffic is completely normal, return an empty anomalies array.
- Be concise. Evidence should cite actual numbers from the metrics.
- Do NOT invent anomalies that aren't clearly present in the data.`,
    ],
    [
      'human',
      `Analyze this API gateway traffic data from {windowStart} to {windowEnd}:

WINDOW SUMMARY:
- Total requests: {totalRequests}
- Average RPM: {avgRequestsPerMinute}
- Peak RPM: {peakRequestsPerMinute}
- Overall error rate: {overallErrorRatePct}%
- Average response time: {avgResponseMs}ms
- P99 response time: {p99ResponseMs}ms

PER-MINUTE TIME SERIES (last 60 minutes):
{timeSeries}

TOP ENDPOINTS:
{topEndpoints}

Identify all anomalies, explain each with specific evidence from the data above, and provide an overall risk assessment.`,
    ],
  ]);

  // Format time series as a compact table for the prompt — LLMs read tabular
  // data better than JSON arrays when the data is dense (60 rows × 6 columns)
  const timeSeriesTable = metrics.timeSeries
    .map(
      (m) =>
        `  ${m.minute.slice(11, 16)} UTC | req:${m.requestCount.toString().padStart(5)} | err:${m.errorRatePct.toFixed(1).padStart(5)}% | ips:${m.uniqueIps.toString().padStart(4)} | avg:${m.avgResponseMs}ms | p99:${m.p99ResponseMs}ms`
    )
    .join('\n');

  const endpointsTable = metrics.topEndpoints
    .map(
      (e) =>
        `  ${e.method.padEnd(6)} ${e.path.padEnd(40)} | reqs:${e.totalRequests.toString().padStart(6)} | err:${e.errorRatePct.toFixed(1).padStart(5)}% | avg:${e.avgResponseMs}ms`
    )
    .join('\n');

  try {
    const chain = promptTemplate.pipe(structuredModel);

    console.log('[TrafficAnalyzer] Sending traffic metrics to GPT-4o-mini...', {
      windowStart: metrics.windowStart,
      windowEnd: metrics.windowEnd,
      totalRequests: metrics.totalRequests,
      timeSeriesPoints: metrics.timeSeries.length,
    });

    const result = await chain.invoke({
      windowStart: metrics.windowStart,
      windowEnd: metrics.windowEnd,
      totalRequests: metrics.totalRequests,
      avgRequestsPerMinute: metrics.avgRequestsPerMinute,
      peakRequestsPerMinute: metrics.peakRequestsPerMinute,
      overallErrorRatePct: metrics.overallErrorRatePct,
      avgResponseMs: metrics.avgResponseMs,
      p99ResponseMs: metrics.p99ResponseMs,
      timeSeries: timeSeriesTable || '  (no traffic data in this window)',
      topEndpoints: endpointsTable || '  (no endpoints accessed in this window)',
    });

    console.log('[TrafficAnalyzer] AI analysis complete:', {
      anomalyCount: result.anomalies.length,
      overallRisk: result.overallRisk,
      summary: result.summary,
    });

    return result;
  } catch (error: unknown) {
    throw new Error(
      `[TrafficAnalyzer] LLM call failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Step 3 — Persist Analysis Result to PostgreSQL
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Maps a lowercase severity string from the LLM to the PostgreSQL enum value.
 * The Prisma enum uses UPPER_CASE; the LLM returns lowercase for readability.
 */
function mapSeverity(s: string): AnomalySeverity {
  const map: Record<string, AnomalySeverity> = {
    low: 'LOW',
    medium: 'MEDIUM',
    high: 'HIGH',
    critical: 'CRITICAL',
  };
  return map[s] ?? 'LOW';
}

/**
 * Maps a string anomaly type to the Prisma enum value.
 */
function mapAnomalyType(t: string): AnomalyType {
  const map: Record<string, AnomalyType> = {
    TRAFFIC_SPIKE: 'TRAFFIC_SPIKE',
    HIGH_ERROR_RATE: 'HIGH_ERROR_RATE',
    DDOS_PATTERN: 'DDOS_PATTERN',
    RESPONSE_DEGRADATION: 'RESPONSE_DEGRADATION',
    UNUSUAL_ENDPOINT: 'UNUSUAL_ENDPOINT',
    UNKNOWN: 'UNKNOWN',
  };
  return map[t] ?? 'UNKNOWN';
}

/**
 * Maps a lowercase risk level string to the Prisma enum value.
 */
function mapRiskLevel(r: string): RiskLevel {
  const map: Record<string, RiskLevel> = {
    low: 'LOW',
    medium: 'MEDIUM',
    high: 'HIGH',
    critical: 'CRITICAL',
  };
  return map[r] ?? 'LOW';
}

/**
 * Saves an AI-generated anomaly analysis to PostgreSQL using a Prisma nested
 * create (AnomalyReport + its child Anomaly rows in one transaction).
 *
 * Why a nested create instead of createMany?
 *   Prisma nested writes execute inside a single implicit transaction, ensuring
 *   that either the entire report (header + all anomalies) is saved, or nothing
 *   is. This prevents orphaned AnomalyReport rows with no children.
 *
 * @param result  - Structured analysis from analyzeTrafficWithAI()
 * @param metrics - Original metrics (used to record the analysis window timestamps)
 * @returns {Promise<string>} UUID of the newly created AnomalyReport
 */
export async function saveAnomalyReport(
  result: AnalysisResult,
  metrics: TrafficMetrics
): Promise<string> {
  try {
    const report = await prisma.anomalyReport.create({
      data: {
        windowStart: new Date(metrics.windowStart),
        windowEnd: new Date(metrics.windowEnd),
        summary: result.summary,
        overallRisk: mapRiskLevel(result.overallRisk),
        // Nested create — Prisma wraps this in a single transaction automatically
        anomalies: {
          create: result.anomalies.map((anomaly) => ({
            type: mapAnomalyType(anomaly.type),
            severity: mapSeverity(anomaly.severity),
            description: anomaly.description,
            evidence: anomaly.evidence,
            recommendation: anomaly.recommendation,
          })),
        },
      },
    });

    console.log('[TrafficAnalyzer] Anomaly report saved:', {
      reportId: report.id,
      overallRisk: report.overallRisk,
      anomalyCount: result.anomalies.length,
      windowStart: metrics.windowStart,
    });

    return report.id;
  } catch (error: unknown) {
    throw new Error(
      `[TrafficAnalyzer] Failed to save anomaly report: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Step 4 — Orchestrator: Full Analysis Pipeline
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Runs the complete traffic analysis pipeline:
 *   1. Aggregate last-hour metrics from PostgreSQL
 *   2. Send to GPT-4o-mini for anomaly detection
 *   3. Save structured result to PostgreSQL
 *
 * This function is called by the BullMQ repeatable job processor.
 *
 * @returns {Promise<{ reportId: string; anomalyCount: number; overallRisk: string }>}
 */
export async function runTrafficAnalysis(): Promise<{
  reportId: string;
  anomalyCount: number;
  overallRisk: string;
}> {
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - ANALYSIS_WINDOW_MS);

  console.log('[TrafficAnalyzer] Starting hourly traffic analysis...', {
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
  });

  try {
    // Step 1: Aggregate metrics
    const metrics = await aggregateTrafficMetrics(windowStart, windowEnd);

    if (metrics.totalRequests === 0) {
      console.log('[TrafficAnalyzer] No traffic in this window — skipping LLM call to save cost.');
      // Save a benign report without calling the LLM (zero cost for idle periods)
      const reportId = await saveAnomalyReport(
        {
          anomalies: [],
          summary: 'No traffic was recorded in this analysis window.',
          overallRisk: 'low',
        },
        metrics
      );
      return { reportId, anomalyCount: 0, overallRisk: 'low' };
    }

    // Step 2: Analyze with AI
    const analysisResult = await analyzeTrafficWithAI(metrics);

    // Step 3: Persist to PostgreSQL
    const reportId = await saveAnomalyReport(analysisResult, metrics);

    return {
      reportId,
      anomalyCount: analysisResult.anomalies.length,
      overallRisk: analysisResult.overallRisk,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[TrafficAnalyzer] Analysis pipeline failed:', { error: message });
    throw new Error(`Traffic analysis pipeline failed: ${message}`);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Step 5 — BullMQ Repeatable Job Setup
// ──────────────────────────────────────────────────────────────────────────────

/**
 * BullMQ Queue singleton for the anomaly analysis scheduler.
 * Kept as a module-level singleton so we don't create duplicate queue instances
 * across multiple calls to setupAnomalyAnalysisSchedule().
 */
let analysisQueue: Queue | null = null;

/**
 * Returns the singleton BullMQ Queue for anomaly analysis jobs.
 * Creates the queue on first call.
 */
function getAnalysisQueue(): Queue {
  if (!analysisQueue) {
    const config = getRedisConfig();
    const connection = config.url
      ? { url: config.url }
      : { host: config.host, port: config.port };

    analysisQueue = new Queue(ANOMALY_ANALYSIS_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 30_000 }, // 30s → 60s on retry
        removeOnComplete: { count: 48 }, // Keep last 48 completed (48h of hourly runs)
        removeOnFail: { count: 24 },
      },
    });

    analysisQueue.on('error', (err: Error) => {
      console.error('[TrafficAnalyzer Queue Error]:', {
        message: err.message,
        timestamp: new Date().toISOString(),
      });
    });
  }

  return analysisQueue;
}

/**
 * Registers a BullMQ repeatable job that fires every hour to run traffic analysis.
 *
 * What is a "repeatable job"?
 *   Unlike a one-shot job (`queue.add()`), a repeatable job is managed by BullMQ
 *   itself using a cron-like scheduler backed by Redis sorted sets. BullMQ stores
 *   the next execution timestamp as a score in a Redis key; when that time arrives,
 *   it promotes the job to the "waiting" state so a worker can pick it up.
 *
 *   Advantages over a raw `setInterval`:
 *   - Survives worker restarts (schedule is persisted in Redis)
 *   - Exactly-once execution (even with multiple worker instances)
 *   - Full observability via BullMQ Board or bull-board UI
 *   - Deduplicates by `jobId` so re-registering doesn't create duplicates
 *
 * @returns {Promise<void>}
 */
export async function setupAnomalyAnalysisSchedule(): Promise<void> {
  try {
    const queue = getAnalysisQueue();

    // Remove any existing repeatable job with this key to avoid stale schedules
    // when the cron expression changes during a deployment.
    const existingRepeatables = await queue.getRepeatableJobs();
    for (const job of existingRepeatables) {
      if (job.key.includes(ANALYSIS_JOB_KEY)) {
        await queue.removeRepeatableByKey(job.key);
        console.log('[TrafficAnalyzer] Removed stale repeatable job:', job.key);
      }
    }

    // Register the new repeatable job with a cron expression.
    // `every: 3_600_000` (ms) is equivalent to "0 * * * *" but uses BullMQ's
    // built-in interval scheduler which is more precise for sub-minute intervals.
    await queue.add(
      ANALYSIS_JOB_KEY,
      { triggeredBy: 'schedule' }, // Minimal job payload — analysis reads from DB directly
      {
        repeat: {
          every: 60 * 60 * 1000, // Every 1 hour in milliseconds
        },
        jobId: ANALYSIS_JOB_KEY, // Deduplication key — prevents double-scheduling
      }
    );

    console.log('[TrafficAnalyzer] Hourly anomaly analysis schedule registered:', {
      queue: ANOMALY_ANALYSIS_QUEUE_NAME,
      interval: '1 hour',
      jobId: ANALYSIS_JOB_KEY,
    });
  } catch (error: unknown) {
    // Non-fatal: log and continue — the worker will still process request logs
    console.error('[TrafficAnalyzer] Failed to register repeatable job:', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Closes the analysis queue connection gracefully during worker shutdown.
 *
 * @returns {Promise<void>}
 */
export async function stopAnalysisScheduler(): Promise<void> {
  if (analysisQueue) {
    try {
      await analysisQueue.close();
      analysisQueue = null;
      console.log('[TrafficAnalyzer] Analysis queue connection closed.');
    } catch (err: unknown) {
      console.error('[TrafficAnalyzer] Error closing analysis queue:', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
