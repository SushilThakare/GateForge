'use client';

/**
 * @file packages/dashboard/src/components/overview/TopEndpointsChart.tsx
 * @description Horizontal bar chart using Tremor BarChart styled with Warm Stone and
 * Persimmon Orange tones for the GateForge Dashboard overview.
 */

import React from 'react';
import { Card, BarChart } from '@tremor/react';
import { TopEndpointItem } from '../../types/stats';

/**
 * Props for TopEndpointsChart component
 */
export interface TopEndpointsChartProps {
  endpoints: TopEndpointItem[];
}

/**
 * Renders a horizontal bar chart displaying top 5 endpoints by throughput.
 * 
 * @param {TopEndpointsChartProps} props - Array of top endpoint count objects
 * @returns {JSX.Element} Rendered Tremor BarChart card
 */
export function TopEndpointsChart({ endpoints }: TopEndpointsChartProps): JSX.Element {
  // Format dataset for horizontal BarChart
  const chartData = (endpoints || []).map((item) => ({
    endpoint: item.endpoint,
    'Requests': item.count,
  }));

  const maxTraffic = endpoints.length > 0 ? endpoints[0].count : 0;

  return (
    <Card className="!bg-stone-900/40 !border-stone-800/80 shadow-xs !p-6 !rounded-xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-sm font-semibold text-stone-100">Top 5 Endpoints</h3>
          <p className="text-xs text-stone-400 mt-0.5">
            Most heavily trafficked downstream routes by request count
          </p>
        </div>
        {maxTraffic > 0 && (
          <span className="px-2.5 py-1 rounded-full text-[11px] font-mono font-medium bg-persimmon-500/10 text-persimmon-400 border border-persimmon-500/20">
            Peak: {maxTraffic.toLocaleString()} reqs
          </span>
        )}
      </div>

      <BarChart
        className="h-72 mt-4"
        data={chartData}
        index="endpoint"
        categories={['Requests']}
        colors={['orange']}
        layout="horizontal"
        valueFormatter={(val: number) => val.toLocaleString()}
        showLegend={false}
        showGridLines={true}
        noDataText="No endpoint traffic recorded yet."
      />
    </Card>
  );
}
