'use client';

/**
 * @file packages/dashboard/src/components/overview/StatCards.tsx
 * @description Refined KPI Stat cards for GateForge Overview.
 * Displays 4 key operational metrics with spacious layout and Persimmon accents:
 * 1. Total Requests (24h)
 * 2. Error Rate %
 * 3. Avg Response Time (ms)
 * 4. Active API Keys
 */

import React from 'react';
import { Activity, AlertCircle, Clock, KeyRound } from 'lucide-react';
import { LogStatisticsResponse } from '../../types/stats';

/**
 * Props for StatCards component
 */
export interface StatCardsProps {
  stats: LogStatisticsResponse;
}

/**
 * Renders 4 primary KPI stat cards with warm stone styling and generous whitespace.
 * 
 * @param {StatCardsProps} props - Aggregated telemetry metrics
 * @returns {JSX.Element} Rendered grid of 4 stat cards
 */
export function StatCards({ stats }: StatCardsProps): JSX.Element {
  const isErrorHigh = stats.errorRatePercent >= 5;
  const isErrorModerate = stats.errorRatePercent >= 2 && stats.errorRatePercent < 5;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {/* 1. Total Requests (24h) */}
      <div className="p-6 rounded-xl bg-stone-900/40 border border-stone-800/80 shadow-xs hover:border-stone-700/80 transition group">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-stone-400">Total Requests (24h)</span>
          <div className="p-2 rounded-lg bg-persimmon-500/10 text-persimmon-400">
            <Activity className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-4 flex items-baseline gap-2">
          <span className="text-3xl font-bold tracking-tight text-stone-100 font-mono">
            {stats.totalRequests.toLocaleString()}
          </span>
        </div>
        <div className="mt-3 pt-3 border-t border-stone-800/60 flex items-center justify-between text-xs text-stone-400">
          <span>Throughput</span>
          <span className="font-mono text-stone-300 font-medium">
            {stats.requestsPerMinute.toFixed(1)} req/min
          </span>
        </div>
      </div>

      {/* 2. Error Rate % */}
      <div className="p-6 rounded-xl bg-stone-900/40 border border-stone-800/80 shadow-xs hover:border-stone-700/80 transition group">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-stone-400">Error Rate</span>
          <div
            className={`p-2 rounded-lg ${
              isErrorHigh
                ? 'bg-rose-500/10 text-rose-400'
                : isErrorModerate
                ? 'bg-persimmon-500/10 text-persimmon-400'
                : 'bg-emerald-500/10 text-emerald-400'
            }`}
          >
            <AlertCircle className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-4 flex items-baseline gap-2">
          <span
            className={`text-3xl font-bold tracking-tight font-mono ${
              isErrorHigh
                ? 'text-rose-400'
                : isErrorModerate
                ? 'text-persimmon-400'
                : 'text-stone-100'
            }`}
          >
            {stats.errorRatePercent.toFixed(2)}%
          </span>
        </div>
        <div className="mt-3 pt-3 border-t border-stone-800/60 flex items-center justify-between text-xs text-stone-400">
          <span>Status 4xx / 5xx</span>
          <span className="font-mono text-stone-300 font-medium">
            {stats.statusBreakdown.status4xx + stats.statusBreakdown.status5xx} errors
          </span>
        </div>
      </div>

      {/* 3. Avg Response Time */}
      <div className="p-6 rounded-xl bg-stone-900/40 border border-stone-800/80 shadow-xs hover:border-stone-700/80 transition group">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-stone-400">Avg Response Time</span>
          <div className="p-2 rounded-lg bg-stone-800/80 text-stone-300">
            <Clock className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-4 flex items-baseline gap-1">
          <span className="text-3xl font-bold tracking-tight text-stone-100 font-mono">
            {stats.avgResponseTimeMs.toFixed(1)}
          </span>
          <span className="text-sm font-medium text-stone-400 font-mono">ms</span>
        </div>
        <div className="mt-3 pt-3 border-t border-stone-800/60 flex items-center justify-between text-xs text-stone-400">
          <span>Latency p95</span>
          <span className="font-mono text-stone-300 font-medium">
            {(stats.percentiles?.p95 ?? stats.avgResponseTimeMs).toFixed(1)} ms
          </span>
        </div>
      </div>

      {/* 4. Active API Keys */}
      <div className="p-6 rounded-xl bg-stone-900/40 border border-stone-800/80 shadow-xs hover:border-stone-700/80 transition group">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-stone-400">Active API Keys</span>
          <div className="p-2 rounded-lg bg-persimmon-500/10 text-persimmon-400">
            <KeyRound className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-4 flex items-baseline gap-2">
          <span className="text-3xl font-bold tracking-tight text-stone-100 font-mono">
            {stats.activeApiKeys}
          </span>
        </div>
        <div className="mt-3 pt-3 border-t border-stone-800/60 flex items-center justify-between text-xs text-stone-400">
          <span>Key Quota Status</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Enforced
          </span>
        </div>
      </div>
    </div>
  );
}
