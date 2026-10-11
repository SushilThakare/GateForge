/**
 * @file packages/dashboard/src/app/page.tsx
 * @description Main Overview landing page for the GateForge Dashboard.
 * Implemented as a Next.js App Router Server Component that executes server-side data fetching
 * from the Gateway's /api/logs/stats endpoint, hydrating client-side Tremor visualization widgets.
 */

import React from 'react';
import { fetchGatewayStats } from '../lib/gatewayApi';
import { Header } from '../components/layout/Header';
import { StatCards } from '../components/overview/StatCards';
import { RequestsOverTimeChart } from '../components/overview/RequestsOverTimeChart';
import { TopEndpointsChart } from '../components/overview/TopEndpointsChart';
import { RecentErrorsTable } from '../components/overview/RecentErrorsTable';
import { LogStatisticsResponse } from '../types/stats';

/**
 * Opt into dynamic server rendering so telemetry is always evaluated live
 */
export const dynamic = 'force-dynamic';

/**
 * Overview HomePage Server Component.
 * Fetches 24h aggregated metrics and renders KPI stat cards, charts, and error diagnostic tables.
 * 
 * @returns {Promise<JSX.Element>} Rendered Overview page
 */
export default async function HomePage(): Promise<JSX.Element> {
  // Fetch initial telemetry from Gateway /api/logs/stats on the server side
  const stats: LogStatisticsResponse = await fetchGatewayStats('24h');

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <Header
        title="Gateway Overview"
        subtitle="Live telemetry aggregations, request throughput, and operational health metrics (Last 24h)"
      />

      {/* 4 Stat Cards: Total Requests, Error Rate %, Avg Response Time, Active API Keys */}
      <section aria-label="Key Performance Indicators">
        <StatCards stats={stats} />
      </section>

      {/* Primary Visualizations Grid: Requests Over Time & Top 5 Endpoints */}
      <section aria-label="Telemetry Charts" className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Requests over time chart (last 24h, 1 data point per 15 min) */}
        <RequestsOverTimeChart data={stats.requestsOverTime} />

        {/* Top 5 endpoints by request count (horizontal bar chart) */}
        <TopEndpointsChart endpoints={stats.topEndpoints} />
      </section>

      {/* Recent Errors Table: Last 10 failed requests */}
      <section aria-label="Recent Error Telemetry">
        <RecentErrorsTable errors={stats.recentErrors} />
      </section>
    </div>
  );
}
