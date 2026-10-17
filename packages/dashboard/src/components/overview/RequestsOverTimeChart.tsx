'use client';

/**
 * @file packages/dashboard/src/components/overview/RequestsOverTimeChart.tsx
 * @description Time-series throughput chart using Tremor AreaChart styled with Persimmon Orange
 * and Warm Stone palette for the GateForge Dashboard.
 */

import React from 'react';
import { Card, AreaChart } from '@tremor/react';
import { RequestsOverTimePoint } from '../../types/stats';

/**
 * Props for RequestsOverTimeChart component
 */
export interface RequestsOverTimeChartProps {
  data: RequestsOverTimePoint[];
}

/**
 * Formats ISO timestamp to short human-readable 24-hour time "HH:MM".
 * 
 * @param {string} isoString - ISO formatted date string
 * @returns {string} Formatted time string
 */
function formatTimeLabel(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return isoString;
  }
}

/**
 * Renders the 24h requests and errors area chart.
 * 
 * @param {RequestsOverTimeChartProps} props - Array of 15-minute bucket data points
 * @returns {JSX.Element} Rendered Tremor AreaChart card
 */
export function RequestsOverTimeChart({ data }: RequestsOverTimeChartProps): JSX.Element {
  // Format dataset for AreaChart
  const chartData = (data || []).map((point) => ({
    time: formatTimeLabel(point.timestamp),
    'Total Requests': point.requests,
    'Errors': point.errors,
  }));

  const totalPoints = chartData.length;
  const totalVolume = chartData.reduce((acc, curr) => acc + curr['Total Requests'], 0);

  return (
    <Card className="!bg-stone-900/40 !border-stone-800/80 shadow-xs !p-6 !rounded-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
        <div>
          <h3 className="text-sm font-semibold text-stone-100">Requests Over Time (Last 24h)</h3>
          <p className="text-xs text-stone-400 mt-0.5">
            15-minute bucket resolution • {totalPoints} sampled intervals
          </p>
        </div>
        <span className="self-start sm:self-auto px-2.5 py-1 rounded-full text-[11px] font-mono font-medium bg-stone-800/80 text-stone-300 border border-stone-700/60">
          {totalVolume.toLocaleString()} total logged
        </span>
      </div>

      <AreaChart
        className="h-72 mt-4"
        data={chartData}
        index="time"
        categories={['Total Requests', 'Errors']}
        colors={['orange', 'rose']}
        valueFormatter={(val: number) => val.toLocaleString()}
        showLegend={true}
        showGridLines={true}
        curveType="monotone"
        noDataText="No request telemetry logs recorded for the selected window."
      />
    </Card>
  );
}
