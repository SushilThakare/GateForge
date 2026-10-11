/**
 * @file packages/dashboard/src/app/analytics/page.tsx
 * @description Next.js App Router Server Component for the Performance Analytics page.
 * Handles server-side initial telemetry fetching and streams the interactive
 * analytics client workspace to the browser.
 */

import React from 'react';
import { Header } from '../../components/layout/Header';
import { fetchGatewayAnalytics } from '../../lib/analyticsApi';
import { AnalyticsDashboard } from '../../components/analytics/AnalyticsDashboard';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Analytics — GateForge',
  description:
    'Deep latency percentiles (p50, p95, p99), throughput histograms, and geographic request distribution.',
};

/**
 * Server Component entry point for /analytics.
 * Fetches initial 24h analytics dataset from Gateway before streaming to client.
 */
export default async function AnalyticsPage(): Promise<JSX.Element> {
  const initialData = await fetchGatewayAnalytics('24h');

  return (
    <div className="space-y-6">
      <Header
        title="Performance Analytics"
        subtitle="Latency percentiles, throughput cadence, status distributions, and geographic traffic"
      />
      <AnalyticsDashboard initialData={initialData} />
    </div>
  );
}
