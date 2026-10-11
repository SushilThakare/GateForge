/**
 * @file packages/dashboard/src/app/logs/page.tsx
 * @description Request Logs viewer page for GateForge.
 * Next.js App Router Server Component executing initial server-side fetching
 * of telemetry logs and API keys, passing them to the virtualized LogViewerTable.
 */

import React from 'react';
import { fetchGatewayLogs } from '../../lib/logsApi';
import { fetchGatewayKeys } from '../../lib/keysApi';
import { Header } from '../../components/layout/Header';
import { LogViewerTable } from '../../components/logs/LogViewerTable';
import { LogListResponse } from '../../types/logs';
import { ApiKeyItem } from '../../types/keys';

export const dynamic = 'force-dynamic';

/**
 * Request Logs Page Server Component.
 * 
 * @returns {Promise<JSX.Element>} Rendered page with initial logs and keys
 */
export default async function LogsPage(): Promise<JSX.Element> {
  // Fetch initial telemetry logs and registered API keys in parallel on the server
  const [logsResponse, apiKeys]: [LogListResponse, ApiKeyItem[]] = await Promise.all([
    fetchGatewayLogs({ limit: 50, dateRange: '24h' }),
    fetchGatewayKeys(),
  ]);

  return (
    <div className="space-y-6">
      <Header
        title="Request Logs"
        subtitle="Real-time virtualized log viewer with cursor pagination, SSE streaming, and filter inspection"
      />

      <section aria-label="Request Telemetry Log Stream">
        <LogViewerTable
          initialLogs={logsResponse.logs}
          initialPagination={logsResponse.pagination}
          apiKeys={apiKeys}
        />
      </section>
    </div>
  );
}
