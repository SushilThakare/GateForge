'use client';

/**
 * @file packages/dashboard/src/components/analytics/AnalyticsDashboard.tsx
 * @description Interactive client component orchestrating the GateForge Analytics page.
 * Manages active time-range state, seamless client-side data updates without full page reloads,
 * and composes KPI cards, throughput area charts, percentile charts, status charts,
 * top keys, and geographic distribution.
 */

import React, { useState, useTransition } from 'react';
import { AnalyticsResponse, AnalyticsTimeRangePreset } from '../../types/analytics';
import { TimeRangeSelector } from './TimeRangeSelector';
import { AnalyticsKpiCards } from './AnalyticsKpiCards';
import { RpmAreaChart } from './RpmAreaChart';
import { LatencyPercentilesChart } from './LatencyPercentilesChart';
import { StatusDistributionChart } from './StatusDistributionChart';
import { TopKeysBarChart } from './TopKeysBarChart';
import { GeoDistributionChart } from './GeoDistributionChart';
import { Card, Flex, Text } from '@tremor/react';

export interface AnalyticsDashboardProps {
  initialData: AnalyticsResponse;
}

/**
 * Renders the full interactive analytics workspace.
 *
 * @param {AnalyticsDashboardProps} props - Initial server-fetched telemetry dataset
 * @returns {JSX.Element} Interactive analytics view
 */
export function AnalyticsDashboard({
  initialData,
}: AnalyticsDashboardProps): JSX.Element {
  const [data, setData] = useState<AnalyticsResponse>(initialData);
  const [timeRange, setTimeRange] = useState<AnalyticsTimeRangePreset>(
    initialData.timeRange
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  /**
   * Handles time-range changes with optimistic transition and non-reloading fetch.
   */
  const handleRangeChange = async (newPreset: AnalyticsTimeRangePreset) => {
    if (newPreset === timeRange && !errorNotice) return;

    setTimeRange(newPreset);
    setIsLoading(true);
    setErrorNotice(null);

    try {
      const response = await fetch(`/api/analytics?timeRange=${newPreset}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const refreshedData: AnalyticsResponse = await response.json();

      startTransition(() => {
        setData(refreshedData);
      });
    } catch (err) {
      console.error('[AnalyticsDashboard] Error updating analytics dataset:', err);
      setErrorNotice(
        `Unable to refresh ${newPreset} telemetry. Displaying cached snapshot.`
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Time-Range Control Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 bg-slate-900/60 border border-slate-800 rounded-xl">
        <div>
          <h2 className="text-sm font-semibold text-slate-200">
            Telemetry Analysis Window
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Range: <span className="text-slate-300 font-mono">{new Date(data.dateFrom).toLocaleString()}</span> – <span className="text-slate-300 font-mono">{new Date(data.dateTo).toLocaleString()}</span>
          </p>
        </div>

        <TimeRangeSelector
          value={timeRange}
          onChange={handleRangeChange}
          isLoading={isLoading}
        />
      </div>

      {errorNotice && (
        <Card className="bg-rose-950/40 border border-rose-800/80 p-3">
          <Flex justifyContent="between" alignItems="center">
            <Text className="text-xs text-rose-300 font-medium">{errorNotice}</Text>
            <button
              onClick={() => handleRangeChange(timeRange)}
              className="text-xs text-sky-400 hover:underline font-semibold"
            >
              Retry
            </button>
          </Flex>
        </Card>
      )}

      {/* 1. Topline KPI Metric Cards */}
      <AnalyticsKpiCards summary={data.summary} timeRange={timeRange} />

      {/* 2. Requests Per Minute Area Chart */}
      <RpmAreaChart data={data.rpmSeries} preset={timeRange} />

      {/* 3. Latency Percentiles Multi-Line Chart */}
      <LatencyPercentilesChart data={data.latencyPercentiles} preset={timeRange} />

      {/* 4. Status Code Distribution Stacked Bar Chart */}
      <StatusDistributionChart data={data.statusDistribution} preset={timeRange} />

      {/* 5. Top API Keys and Geographic Distribution Side-by-Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TopKeysBarChart topKeys={data.topKeys} />
        <GeoDistributionChart geoDistribution={data.geoDistribution} />
      </div>
    </div>
  );
}
