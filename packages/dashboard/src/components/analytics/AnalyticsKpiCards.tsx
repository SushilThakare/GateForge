'use client';

/**
 * @file packages/dashboard/src/components/analytics/AnalyticsKpiCards.tsx
 * @description High-impact metric cards displaying vital gateway telemetry KPIs.
 * Renders Total Requests, Requests/Min, p50 median latency, p99 tail latency,
 * and overall error percentage with contextual status indicators.
 */

import React from 'react';
import { Card, Metric, Text, Flex, Badge, Grid } from '@tremor/react';
import { AnalyticsSummary, AnalyticsTimeRangePreset } from '../../types/analytics';

export interface AnalyticsKpiCardsProps {
  summary: AnalyticsSummary;
  timeRange: AnalyticsTimeRangePreset;
}

/**
 * Renders the top-line KPI grid.
 *
 * @param {AnalyticsKpiCardsProps} props - Aggregated telemetry summary and active time range
 * @returns {JSX.Element} Rendered Tremor metric cards grid
 */
export function AnalyticsKpiCards({
  summary,
  timeRange,
}: AnalyticsKpiCardsProps): JSX.Element {
  const isHealthyError = summary.errorRatePercent < 2.0;
  const isHealthyTailLatency = summary.p99 < 200;

  return (
    <Grid numItemsSm={2} numItemsLg={5} className="gap-4">
      {/* 1. Total Requests */}
      <Card className="bg-slate-900/90 border border-slate-800 shadow-md">
        <Flex justifyContent="between" alignItems="start">
          <Text className="text-slate-400 text-xs uppercase font-medium tracking-wider">
            Total Requests
          </Text>
          <Badge size="xs" color="sky">
            {timeRange}
          </Badge>
        </Flex>
        <Metric className="text-slate-100 font-extrabold text-2xl mt-2">
          {summary.totalRequests.toLocaleString()}
        </Metric>
        <Text className="text-slate-500 text-xs mt-1">
          {summary.activeApiKeys} active keys authenticated
        </Text>
      </Card>

      {/* 2. Requests per Minute */}
      <Card className="bg-slate-900/90 border border-slate-800 shadow-md">
        <Flex justifyContent="between" alignItems="start">
          <Text className="text-slate-400 text-xs uppercase font-medium tracking-wider">
            Avg Throughput
          </Text>
          <Badge size="xs" color="indigo">
            RPM
          </Badge>
        </Flex>
        <Metric className="text-slate-100 font-extrabold text-2xl mt-2">
          {summary.requestsPerMinute.toLocaleString()}{' '}
          <span className="text-xs font-normal text-slate-400">req/m</span>
        </Metric>
        <Text className="text-slate-500 text-xs mt-1">
          Mean cadence over window
        </Text>
      </Card>

      {/* 3. p50 Median Latency */}
      <Card className="bg-slate-900/90 border border-slate-800 shadow-md">
        <Flex justifyContent="between" alignItems="start">
          <Text className="text-slate-400 text-xs uppercase font-medium tracking-wider">
            Median Latency (p50)
          </Text>
          <Badge size="xs" color="emerald">
            Typical
          </Badge>
        </Flex>
        <Metric className="text-emerald-400 font-extrabold text-2xl mt-2">
          {summary.p50}{' '}
          <span className="text-xs font-normal text-slate-400">ms</span>
        </Metric>
        <Text className="text-slate-500 text-xs mt-1">
          Avg response: {summary.avgResponseTimeMs} ms
        </Text>
      </Card>

      {/* 4. p99 Tail Latency */}
      <Card className="bg-slate-900/90 border border-slate-800 shadow-md">
        <Flex justifyContent="between" alignItems="start">
          <Text className="text-slate-400 text-xs uppercase font-medium tracking-wider">
            Tail Latency (p99)
          </Text>
          <Badge size="xs" color={isHealthyTailLatency ? 'amber' : 'rose'}>
            99th %ile
          </Badge>
        </Flex>
        <Metric
          className={`${
            isHealthyTailLatency ? 'text-amber-400' : 'text-rose-400'
          } font-extrabold text-2xl mt-2`}
        >
          {summary.p99}{' '}
          <span className="text-xs font-normal text-slate-400">ms</span>
        </Metric>
        <Text className="text-slate-500 text-xs mt-1">
          p95 percentile: {summary.p95} ms
        </Text>
      </Card>

      {/* 5. Error Rate */}
      <Card className="bg-slate-900/90 border border-slate-800 shadow-md">
        <Flex justifyContent="between" alignItems="start">
          <Text className="text-slate-400 text-xs uppercase font-medium tracking-wider">
            Error Rate
          </Text>
          <Badge size="xs" color={isHealthyError ? 'emerald' : 'rose'}>
            {isHealthyError ? 'Nominal' : 'Elevated'}
          </Badge>
        </Flex>
        <Metric
          className={`${
            isHealthyError ? 'text-slate-100' : 'text-rose-400'
          } font-extrabold text-2xl mt-2`}
        >
          {summary.errorRatePercent.toFixed(2)}%
        </Metric>
        <Text className="text-slate-500 text-xs mt-1">
          {isHealthyError ? 'Within SLA threshold (<2%)' : 'Exceeds SLA threshold'}
        </Text>
      </Card>
    </Grid>
  );
}
