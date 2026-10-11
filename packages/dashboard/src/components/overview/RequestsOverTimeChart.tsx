'use client';

/**
 * @file packages/dashboard/src/components/overview/RequestsOverTimeChart.tsx
 * @description Time-series throughput chart using Tremor AreaChart for the GateForge Dashboard.
 * Displays request volume and errors over the last 24 hours with 15-minute granularity (96 points).
 */

import React from 'react';
import { Card, Title, Text, AreaChart, Flex, Badge } from '@tremor/react';
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
  // Format dataset for Tremor AreaChart
  const chartData = (data || []).map((point) => ({
    time: formatTimeLabel(point.timestamp),
    'Total Requests': point.requests,
    'Errors (4xx/5xx)': point.errors,
  }));

  const totalPoints = chartData.length;
  const totalVolume = chartData.reduce((acc, curr) => acc + curr['Total Requests'], 0);

  return (
    <Card className="bg-slate-900/90 border border-slate-800 shadow-lg">
      <Flex justifyContent="between" alignItems="center" className="mb-4">
        <div>
          <Title className="text-slate-100 font-bold text-lg">
            Requests Over Time (Last 24h)
          </Title>
          <Text className="text-slate-400 text-xs">
            15-minute bucket resolution • {totalPoints} sampled intervals
          </Text>
        </div>
        <Badge size="sm" color="sky">
          {totalVolume.toLocaleString()} total logged
        </Badge>
      </Flex>

      <AreaChart
        className="h-72 mt-4"
        data={chartData}
        index="time"
        categories={['Total Requests', 'Errors (4xx/5xx)']}
        colors={['cyan', 'rose']}
        valueFormatter={(val: number) => val.toLocaleString()}
        showLegend={true}
        showGridLines={true}
        curveType="monotone"
        noDataText="No request telemetry logs recorded for the selected window."
      />
    </Card>
  );
}
