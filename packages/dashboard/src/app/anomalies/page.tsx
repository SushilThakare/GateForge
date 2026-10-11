/**
 * @file packages/dashboard/src/app/anomalies/page.tsx
 * @description AI Anomaly Detection placeholder view for GateForge Dashboard.
 */

import React from 'react';
import { Header } from '../../components/layout/Header';
import { Card, Title, Text } from '@tremor/react';

export default function AnomaliesPage(): JSX.Element {
  return (
    <div className="space-y-6">
      <Header
        title="Anomaly Detection"
        subtitle="Intelligent traffic spike detection, credential abuse, and brute-force mitigation"
      />
      <Card className="bg-slate-900/90 border border-slate-800 p-8 text-center">
        <Title className="text-slate-100 text-lg">AI Anomaly Detection Module</Title>
        <Text className="text-slate-400 mt-2">
          Automated heuristic and statistical deviation tracking for traffic anomalies and rate-limit violations.
        </Text>
      </Card>
    </div>
  );
}
