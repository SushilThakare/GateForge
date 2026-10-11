'use client';

/**
 * @file packages/dashboard/src/components/analytics/TopKeysBarChart.tsx
 * @description Horizontal bar chart and ranked breakdown of the top API keys by request volume.
 * Uses Tremor BarChart with layout="horizontal" and a high-density summary breakdown.
 */

import React from 'react';
import { Card, Title, Text, BarChart, Flex, Badge } from '@tremor/react';
import { TopKeyUsageItem } from '../../types/analytics';

export interface TopKeysBarChartProps {
  topKeys: TopKeyUsageItem[];
}

/**
 * Renders the top API keys usage horizontal bar chart.
 *
 * @param {TopKeysBarChartProps} props - Ranked API keys usage data
 * @returns {JSX.Element} Rendered Tremor BarChart card
 */
export function TopKeysBarChart({ topKeys }: TopKeysBarChartProps): JSX.Element {
  const chartData = (topKeys || []).map((k) => ({
    name: k.keyName,
    'Requests': k.requestCount,
  }));

  const totalKeyTraffic = topKeys.reduce((acc, k) => acc + k.requestCount, 0);

  return (
    <Card className="bg-slate-900/90 border border-slate-800 shadow-lg flex flex-col justify-between">
      <div>
        <Flex justifyContent="between" alignItems="center" className="mb-4">
          <div>
            <Title className="text-slate-100 font-bold text-lg">
              Top API Keys by Usage
            </Title>
            <Text className="text-slate-400 text-xs mt-0.5">
              Horizontal request distribution across client keys
            </Text>
          </div>
          <Badge size="sm" color="indigo">
            {totalKeyTraffic.toLocaleString()} total key reqs
          </Badge>
        </Flex>

        <BarChart
          className="h-64 mt-2"
          data={chartData}
          index="name"
          categories={['Requests']}
          colors={['indigo']}
          layout="horizontal"
          valueFormatter={(val: number) => val.toLocaleString()}
          showLegend={false}
          showGridLines={true}
          noDataText="No API key traffic logged for this window."
        />
      </div>

      {topKeys.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-800/80 space-y-2">
          {topKeys.slice(0, 4).map((k, idx) => (
            <div
              key={k.apiKeyId ?? `key-${idx}`}
              className="flex items-center justify-between text-xs py-1 px-2 rounded hover:bg-slate-800/40 transition-colors"
            >
              <div className="flex items-center space-x-2">
                <span className="text-slate-500 font-mono w-4">{idx + 1}.</span>
                <span className="text-slate-200 font-medium truncate max-w-[140px] sm:max-w-[180px]">
                  {k.keyName}
                </span>
              </div>
              <div className="flex items-center space-x-3 text-right">
                <span className="text-slate-400 font-mono">
                  {k.requestCount.toLocaleString()} ({k.percentage}%)
                </span>
                <span className="text-slate-500 font-mono hidden sm:inline">
                  {k.avgLatencyMs}ms
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                    k.errorRatePercent > 2.0
                      ? 'bg-rose-500/20 text-rose-300'
                      : 'bg-emerald-500/20 text-emerald-300'
                  }`}
                >
                  {k.errorRatePercent.toFixed(1)}% err
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
