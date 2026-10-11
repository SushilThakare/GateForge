/**
 * @file packages/dashboard/src/app/keys/page.tsx
 * @description API Keys Management placeholder view for GateForge Dashboard.
 */

import React from 'react';
import { Header } from '../../components/layout/Header';
import { Card, Title, Text } from '@tremor/react';

export default function ApiKeysPage(): JSX.Element {
  return (
    <div className="space-y-6">
      <Header
        title="API Keys Management"
        subtitle="Manage client credentials, token bucket allowances, and access scopes"
      />
      <Card className="bg-slate-900/90 border border-slate-800 p-8 text-center">
        <Title className="text-slate-100 text-lg">API Key Management Module</Title>
        <Text className="text-slate-400 mt-2">
          Create, inspect, rotate, and revoke client credentials with fine-grained rate limits.
        </Text>
      </Card>
    </div>
  );
}
