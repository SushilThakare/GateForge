/**
 * @file packages/dashboard/src/app/keys/page.tsx
 * @description API Keys Management page for GateForge.
 * Next.js App Router Server Component that executes server-side fetching of registered
 * credentials and 7-day usage metrics, passing them to the interactive ApiKeyTable.
 */

import React from 'react';
import { fetchGatewayKeys } from '../../lib/keysApi';
import { Header } from '../../components/layout/Header';
import { ApiKeyTable } from '../../components/keys/ApiKeyTable';
import { ApiKeyItem } from '../../types/keys';

export const dynamic = 'force-dynamic';

/**
 * API Keys Management page Server Component.
 * 
 * @returns {Promise<JSX.Element>} Rendered page with initial keys
 */
export default async function ApiKeysPage(): Promise<JSX.Element> {
  const initialKeys: ApiKeyItem[] = await fetchGatewayKeys();

  return (
    <div className="space-y-6">
      <Header
        title="API Keys"
        subtitle="Manage client authentication credentials, token bucket allowances, and access scopes"
      />

      <section aria-label="API Keys Management Table">
        <ApiKeyTable initialKeys={initialKeys} />
      </section>
    </div>
  );
}
