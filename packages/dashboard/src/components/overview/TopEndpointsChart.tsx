'use client';

/**
 * @file packages/dashboard/src/components/overview/TopEndpointsChart.tsx
 * @description Horizontal bar chart using Tremor BarChart for the GateForge Dashboard.
 * Displays the Top 5 most active gateway endpoints by total request volume.
 */

import React from 'react';
import { Card, Title, Text, BarChart, Flex, Badge } from '@tremor/react';
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
  // Format dataset for Tremor horizontal BarChart
  const chartData = (endpoints || []).map((item) => ({
    endpoint: item.endpoint,
    'Requests': item.count,
  }));

  const maxTraffic = endpoints.length > 0 ? endpoints[0].count : 0;

  return (
    <Card className="bg-slate-900/90 border border-slate-800 shadow-lg">
      <Flex justifyContent="between" alignItems="center" className="mb-4">
        <div>
          <Title className="text-slate-100 font-bold text-lg">
            Top 5 Endpoints
          </Title>
          <Text className="text-slate-400 text-xs">
            Most heavily trafficked downstream routes by request count
          </Text>
        </div>
        {maxTraffic > 0 && (
          <Badge size="sm" color="indigo">
            Peak: {maxTraffic.toLocaleString()} reqs
          </Badge>
        )}
      </Flex>

      <BarChart
        className="h-72 mt-4"
        data={chartData}
        index="endpoint"
        categories={['Requests']}
        colors={['sky']}
        layout="horizontal"
        valueFormatter={(val: number) => val.toLocaleString()}
        showLegend={false}
        showGridLines={true}
        noDataText="No endpoint traffic recorded yet."
      />
    </Card>
  );
}
