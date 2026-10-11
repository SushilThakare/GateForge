/**
 * @file packages/dashboard/src/app/anomalies/loading.tsx
 * @description Loading UI skeleton for Anomalies route.
 */

import React from 'react';

export default function AnomaliesLoading(): JSX.Element {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-10 w-64 bg-slate-800 rounded" />
      <div className="h-64 bg-slate-900/60 border border-slate-800 rounded-xl" />
    </div>
  );
}
