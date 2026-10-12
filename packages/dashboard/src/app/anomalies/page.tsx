/**
 * @file packages/dashboard/src/app/anomalies/page.tsx
 * @description Next.js App Router Server Component for AI Traffic Anomaly Detection.
 * Executes server-side data fetching for the initial 24h anomaly timeline and scheduler status,
 * streaming the interactive AnomalyDashboard client workspace to the browser.
 *
 * Architecture position:
 *   Server Component (initial DB/Gateway fetch) ──> AnomalyDashboard (Client Component)
 *
 * Adheres strictly to dashboard-conventions.md:
 * 1. Server Components First: Initial data fetching is handled on the server.
 * 2. Error Boundaries & Loading UI: Pair with loading.tsx and error.tsx in the same folder.
 * 3. Strict TypeScript Types: All props and state typed via explicit interfaces.
 */

import React from 'react';
import { Header } from '../../components/layout/Header';
import { fetchGatewayAnomalies } from '../../lib/anomaliesApi';
import { AnomalyDashboard } from '../../components/anomalies/AnomalyDashboard';
import { AnomalyListResponse } from '../../types/anomalies';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'AI Anomaly Detection — GateForge',
  description:
    'Real-time traffic anomaly detection powered by GPT-4o-mini and BullMQ hourly repeatable jobs.',
};

/**
 * Server Component entry point for /anomalies.
 *
 * @returns {Promise<JSX.Element>} Rendered page with initial anomaly reports and scheduler telemetry
 */
export default async function AnomaliesPage(): Promise<JSX.Element> {
  // Fetch initial anomaly reports and scheduler status on the server
  const initialData: AnomalyListResponse = await fetchGatewayAnomalies({
    severity: 'ALL',
    dateRange: '24h',
  });

  return (
    <div className="space-y-6">
      <Header
        title="AI Anomaly Detection"
        subtitle="Automated hourly pattern recognition detecting traffic spikes, DDoS signatures, and latency degradation"
      />

      <AnomalyDashboard initialData={initialData} />
    </div>
  );
}
