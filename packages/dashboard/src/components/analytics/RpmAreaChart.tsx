'use client';

/**
 * @file packages/dashboard/src/components/analytics/RpmAreaChart.tsx
 * @description High-resolution Requests Per Minute (RPM) time-series chart.
 * Uses Tremor AreaChart with gradient fill and responsive axis formatting.
 */

import React from 'react';
import { Card, Title, Text, AreaChart, Flex, Badge } from '@tremor/react';
import { RpmDataPoint, AnalyticsTimeRangePreset } from '../../types/analytics';

export interface RpmAreaChartProps {
  data: RpmDataPoint[];
  preset: AnalyticsTimeRangePreset;
}

/**
 * Formats ISO timestamps into human-readable labels tailored to the active time range.
 *
 * @param {string} iso - ISO date string
 * @param {AnalyticsTimeRangePreset} preset - Active time horizon
 * @returns {string} Formatted label
 */
function formatRpmLabel(iso: string, preset: AnalyticsTimeRangePreset): string {
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
 * Renders the Requests Per Minute throughput area chart.
 *
 * @param {RpmAreaChartProps} props - Series datapoints and active preset
 * @returns {JSX.Element} Rendered Tremor AreaChart card
 */
export function RpmAreaChart({ data, preset }: RpmAreaChartProps): JSX.Element {
  const chartData = (data || []).map((pt) => ({
    time: formatRpmLabel(pt.timestamp, preset),
    'Requests / Min': pt.rpm,
    'Sampled Requests': pt.requestCount,
  }));

  const peakRpm = chartData.reduce(
    (max, curr) => (curr['Requests / Min'] > max ? curr['Requests / Min'] : max),
    0
  );

  return (
    <Card className="bg-slate-900/90 border border-slate-800 shadow-lg">
      <Flex justifyContent="between" alignItems="center" className="mb-4">
        <div>
          <Title className="text-slate-100 font-bold text-lg">
            Throughput: Requests Per Minute (RPM)
          </Title>
          <Text className="text-slate-400 text-xs mt-0.5">
            Continuous ingestion rate across {chartData.length} sampled time buckets
          </Text>
        </div>
        <Badge size="sm" color="sky">
          Peak: {peakRpm.toLocaleString()} RPM
        </Badge>
      </Flex>

      <AreaChart
        className="h-72 mt-4"
        data={chartData}
        index="time"
        categories={['Requests / Min']}
        colors={['cyan']}
        valueFormatter={(val: number) => `${val.toLocaleString()} rpm`}
        showLegend={false}
        showGridLines={true}
        curveType="monotone"
        noDataText="No throughput recorded for the chosen window."
      />
    </Card>
  );
}
