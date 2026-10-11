'use client';

/**
 * @file packages/dashboard/src/components/analytics/LatencyPercentilesChart.tsx
 * @description Multi-line chart tracking response time percentiles (p50, p95, p99).
 * Highlights the latency envelope and tail spikes using Tremor LineChart.
 */

import React from 'react';
import { Card, Title, Text, LineChart, Flex, Badge } from '@tremor/react';
import { LatencyPercentilePoint, AnalyticsTimeRangePreset } from '../../types/analytics';

export interface LatencyPercentilesChartProps {
  data: LatencyPercentilePoint[];
  preset: AnalyticsTimeRangePreset;
}

/**
 * Formats timestamps for percentile chart axes.
 *
 * @param {string} iso - ISO date string
 * @param {AnalyticsTimeRangePreset} preset - Selected time window
 * @returns {string} Formatted label
 */
function formatPercentileLabel(iso: string, preset: AnalyticsTimeRangePreset): string {
  try {
    const d = new Date(iso);
    if (preset === '1h' || preset === '6h' || preset === '24h') {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    }
    return d.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
    });
  } catch {
    return iso;
  }
}

/**
 * Renders the multi-line percentile chart card.
 *
 * @param {LatencyPercentilesChartProps} props - Percentiles time-series data and active preset
 * @returns {JSX.Element} Rendered Tremor LineChart card
 */
export function LatencyPercentilesChart({
  data,
  preset,
}: LatencyPercentilesChartProps): JSX.Element {
  const chartData = (data || []).map((pt) => ({
    time: formatPercentileLabel(pt.timestamp, preset),
    'p50 Median': pt.p50,
    'p95 Fast Tail': pt.p95,
    'p99 Extreme Tail': pt.p99,
  }));

  const latestPoint = chartData[chartData.length - 1];

  return (
    <Card className="bg-slate-900/90 border border-slate-800 shadow-lg">
      <Flex justifyContent="between" alignItems="center" className="mb-4">
        <div>
          <Title className="text-slate-100 font-bold text-lg">
            Response Time Percentiles (p50, p95, p99)
          </Title>
          <Text className="text-slate-400 text-xs mt-0.5">
            Statistical latency envelope over time • Real-time percentile dispersion
          </Text>
        </div>
        {latestPoint && (
          <Badge size="sm" color="amber">
            Current p99: {latestPoint['p99 Extreme Tail']} ms
          </Badge>
        )}
      </Flex>

      <LineChart
        className="h-72 mt-4"
        data={chartData}
        index="time"
        categories={['p50 Median', 'p95 Fast Tail', 'p99 Extreme Tail']}
        colors={['emerald', 'amber', 'rose']}
        valueFormatter={(val: number) => `${val.toLocaleString()} ms`}
        showLegend={true}
        showGridLines={true}
        curveType="monotone"
        noDataText="No latency telemetry logged in this interval."
      />
    </Card>
  );
}
