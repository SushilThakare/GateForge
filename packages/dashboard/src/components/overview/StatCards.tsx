'use client';

/**
 * @file packages/dashboard/src/components/overview/StatCards.tsx
 * @description Stat cards component using Tremor for the GateForge Dashboard overview page.
 * Displays 4 key operational metrics:
 * 1. Total Requests (24h)
 * 2. Error Rate %
 * 3. Avg Response Time (ms)
 * 4. Active API Keys
 */

import React from 'react';
import { Card, Metric, Text, Flex, Badge } from '@tremor/react';
import { Activity, AlertCircle, Clock, KeyRound } from 'lucide-react';
import { LogStatisticsResponse } from '../../types/stats';

/**
 * Props for StatCards component
 */
export interface StatCardsProps {
  stats: LogStatisticsResponse;
}

/**
 * Renders 4 primary KPI stat cards using Tremor primitives.
 * 
 * @param {StatCardsProps} props - Aggregated telemetry metrics
 * @returns {JSX.Element} Rendered grid of 4 stat cards
 */
export function StatCards({ stats }: StatCardsProps): JSX.Element {
  // Determine health color for error rate
  const errorRateColor =
    stats.errorRatePercent < 2
      ? 'emerald'
      : stats.errorRatePercent < 5
      ? 'amber'
      : 'rose';

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 1. Total Requests (24h) */}
      <Card decoration="top" decorationColor="sky" className="bg-slate-900/90 border border-slate-800 shadow-lg">
        <Flex justifyContent="between" alignItems="start">
          <div>
            <Text className="text-slate-400 font-medium text-xs uppercase tracking-wider">
              Total Requests (24h)
            </Text>
            <Metric className="text-slate-100 font-bold tracking-tight mt-1 text-2xl lg:text-3xl">
              {stats.totalRequests.toLocaleString()}
            </Metric>
          </div>
          <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400">
            <Activity className="w-5 h-5" />
          </div>
        </Flex>
        <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
          <span>Throughput</span>
          <span className="font-mono text-slate-300 font-medium">
            {stats.requestsPerMinute.toFixed(1)} req/min
          </span>
        </div>
      </Card>

      {/* 2. Error Rate % */}
      <Card
        decoration="top"
        decorationColor={errorRateColor}
        className="bg-slate-900/90 border border-slate-800 shadow-lg"
      >
        <Flex justifyContent="between" alignItems="start">
          <div>
            <Text className="text-slate-400 font-medium text-xs uppercase tracking-wider">
              Error Rate
            </Text>
            <Metric className="text-slate-100 font-bold tracking-tight mt-1 text-2xl lg:text-3xl">
              {stats.errorRatePercent.toFixed(2)}%
            </Metric>
          </div>
          <div className={`p-2.5 rounded-xl bg-${errorRateColor}-500/10 border border-${errorRateColor}-500/20 text-${errorRateColor}-400`}>
            <AlertCircle className="w-5 h-5" />
          </div>
        </Flex>
        <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
          <span>Status 4xx / 5xx</span>
          <Badge size="xs" color={errorRateColor}>
            {stats.statusBreakdown.status4xx + stats.statusBreakdown.status5xx} errors
          </Badge>
        </div>
      </Card>

      {/* 3. Avg Response Time */}
      <Card decoration="top" decorationColor="cyan" className="bg-slate-900/90 border border-slate-800 shadow-lg">
        <Flex justifyContent="between" alignItems="start">
          <div>
            <Text className="text-slate-400 font-medium text-xs uppercase tracking-wider">
              Avg Response Time
            </Text>
            <Metric className="text-slate-100 font-bold tracking-tight mt-1 text-2xl lg:text-3xl">
              {stats.avgResponseTimeMs.toFixed(1)} ms
            </Metric>
          </div>
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <Clock className="w-5 h-5" />
          </div>
        </Flex>
        <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
          <span>Latency p95</span>
          <span className="font-mono text-slate-300 font-medium">
            {stats.percentiles.p95.toFixed(1)} ms
          </span>
        </div>
      </Card>

      {/* 4. Active API Keys */}
      <Card decoration="top" decorationColor="indigo" className="bg-slate-900/90 border border-slate-800 shadow-lg">
        <Flex justifyContent="between" alignItems="start">
          <div>
            <Text className="text-slate-400 font-medium text-xs uppercase tracking-wider">
              Active API Keys
            </Text>
            <Metric className="text-slate-100 font-bold tracking-tight mt-1 text-2xl lg:text-3xl">
              {stats.activeApiKeys}
            </Metric>
          </div>
          <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <KeyRound className="w-5 h-5" />
          </div>
        </Flex>
        <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
          <span>Key Quota Status</span>
          <Badge size="xs" color="indigo">
            Enforced
          </Badge>
        </div>
      </Card>
    </div>
  );
}
