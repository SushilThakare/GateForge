'use client';

/**
 * @file packages/dashboard/src/components/analytics/GeoDistributionChart.tsx
 * @description Geographic distribution of gateway traffic by country/region.
 * Visualizes request origin distribution and latency across international regions.
 */

import React from 'react';
import { Card, Title, Text, BarChart, Flex, Badge } from '@tremor/react';
import { GeoDistributionItem } from '../../types/analytics';

export interface GeoDistributionChartProps {
  geoDistribution: GeoDistributionItem[];
}

/**
 * Maps 2-letter country code to Unicode regional indicator flag emojis.
 *
 * @param {string} code - Two-letter ISO country code
 * @returns {string} Emoji flag
 */
function getCountryFlag(code: string): string {
  if (!code || code.length !== 2) return '🌐';
  const base = 127397;
  return String.fromCodePoint(
    code.toUpperCase().charCodeAt(0) + base,
    code.toUpperCase().charCodeAt(1) + base
  );
}

/**
 * Renders the geographic traffic distribution card.
 *
 * @param {GeoDistributionChartProps} props - Geographic telemetry list
 * @returns {JSX.Element} Rendered geographic visualization card
 */
export function GeoDistributionChart({
  geoDistribution,
}: GeoDistributionChartProps): JSX.Element {
  const chartData = (geoDistribution || []).map((g) => ({
    country: `${getCountryFlag(g.countryCode)} ${g.countryName}`,
    'Requests': g.requestCount,
  }));

  const totalGeoVolume = geoDistribution.reduce((acc, g) => acc + g.requestCount, 0);

  return (
    <Card className="bg-slate-900/90 border border-slate-800 shadow-lg flex flex-col justify-between">
      <div>
        <Flex justifyContent="between" alignItems="center" className="mb-4">
          <div>
            <Title className="text-slate-100 font-bold text-lg">
              Geographic Traffic Distribution
            </Title>
            <Text className="text-slate-400 text-xs mt-0.5">
              Client requests aggregated by IP geographic origin and regional latency
            </Text>
          </div>
          <Badge size="sm" color="teal">
            {geoDistribution.length} regions detected
          </Badge>
        </Flex>

        <BarChart
          className="h-64 mt-2"
          data={chartData}
          index="country"
          categories={['Requests']}
          colors={['teal']}
          layout="horizontal"
          valueFormatter={(val: number) => val.toLocaleString()}
          showLegend={false}
          showGridLines={true}
          noDataText="No geographic IP traffic logged for this window."
        />
      </div>

      {geoDistribution.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-800/80 space-y-2">
          {geoDistribution.slice(0, 4).map((g) => (
            <div
              key={g.countryCode}
              className="flex items-center justify-between text-xs py-1 px-2 rounded hover:bg-slate-800/40 transition-colors"
            >
              <div className="flex items-center space-x-2">
                <span className="text-base">{getCountryFlag(g.countryCode)}</span>
                <span className="text-slate-200 font-medium">{g.countryName}</span>
                <span className="text-slate-500 font-mono text-[10px]">
                  ({g.countryCode})
                </span>
              </div>
              <div className="flex items-center space-x-3 text-right">
                <span className="text-slate-300 font-mono">
                  {g.requestCount.toLocaleString()} ({g.percentage}%)
                </span>
                <span className="text-slate-400 font-mono text-xs">
                  ~{g.avgLatencyMs}ms ping
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
