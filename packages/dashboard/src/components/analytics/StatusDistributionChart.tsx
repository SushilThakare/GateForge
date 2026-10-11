'use client';

/**
 * @file packages/dashboard/src/components/analytics/StatusDistributionChart.tsx
 * @description Stacked bar chart showing status code distributions grouped by hour.
 * Visualizes 2xx, 3xx, 4xx, and 5xx response ratios using Tremor BarChart with stack={true}.
 */

import React from 'react';
import { Card, Title, Text, BarChart, Flex, Badge } from '@tremor/react';
import { StatusDistributionPoint, AnalyticsTimeRangePreset } from '../../types/analytics';

export interface StatusDistributionChartProps {
  data: StatusDistributionPoint[];
  preset: AnalyticsTimeRangePreset;
}

/**
 * Formats time labels for status distribution chart.
 *
 * @param {string} iso - ISO date string
 * @param {AnalyticsTimeRangePreset} preset - Time range preset
 * @returns {string} Formatted label
 */
function formatStatusTime(iso: string, preset: AnalyticsTimeRangePreset): string {
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
 * Renders the stacked bar chart for HTTP status code distributions.
 *
 * @param {StatusDistributionChartProps} props - Hourly status code buckets and preset
 * @returns {JSX.Element} Rendered Tremor BarChart card
 */
export function StatusDistributionChart({
  data,
  preset,
}: StatusDistributionChartProps): JSX.Element {
  const chartData = (data || []).map((pt) => ({
    time: formatStatusTime(pt.timestamp, preset),
    '2xx Success': pt.status2xx,
    '3xx Redirect': pt.status3xx,
    '4xx Client Error': pt.status4xx,
    '5xx Server Error': pt.status5xx,
  }));

  const total2xx = chartData.reduce((acc, c) => acc + c['2xx Success'], 0);
  const totalErrors = chartData.reduce(
    (acc, c) => acc + c['4xx Client Error'] + c['5xx Server Error'],
    0
  );
  const totalAll = total2xx + totalErrors + chartData.reduce((acc, c) => acc + c['3xx Redirect'], 0);
  const successRatio = totalAll > 0 ? ((total2xx / totalAll) * 100).toFixed(1) : '100';

  return (
    <Card className="bg-slate-900/90 border border-slate-800 shadow-lg">
      <Flex justifyContent="between" alignItems="center" className="mb-4">
        <div>
          <Title className="text-slate-100 font-bold text-lg">
            HTTP Status Code Distribution
          </Title>
          <Text className="text-slate-400 text-xs mt-0.5">
            Grouped hourly breakdown by HTTP response class (2xx, 3xx, 4xx, 5xx)
          </Text>
        </div>
        <Badge size="sm" color="emerald">
          {successRatio}% 2xx Success Rate
        </Badge>
      </Flex>

      <BarChart
        className="h-72 mt-4"
        data={chartData}
        index="time"
        categories={['2xx Success', '3xx Redirect', '4xx Client Error', '5xx Server Error']}
        colors={['emerald', 'sky', 'amber', 'rose']}
        stack={true}
        valueFormatter={(val: number) => val.toLocaleString()}
        showLegend={true}
        showGridLines={true}
        noDataText="No HTTP status codes recorded for this interval."
      />
    </Card>
  );
}
