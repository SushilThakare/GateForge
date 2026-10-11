/**
 * @file packages/dashboard/src/app/analytics/loading.tsx
 * @description Loading UI skeleton for the Analytics page.
 * Provides instant layout feedback during Server Component data fetching.
 */

import React from 'react';

export default function AnalyticsLoading(): JSX.Element {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="space-y-2">
        <div className="h-8 w-64 bg-slate-800 rounded-lg" />
        <div className="h-4 w-96 bg-slate-800/60 rounded" />
      </div>

      {/* Control bar skeleton */}
      <div className="h-16 bg-slate-900/60 border border-slate-800 rounded-xl" />

      {/* KPI Cards skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5].map((idx) => (
          <div
            key={idx}
            className="h-28 bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-3"
          >
            <div className="h-3 w-20 bg-slate-800 rounded" />
            <div className="h-7 w-28 bg-slate-700/60 rounded" />
            <div className="h-2.5 w-16 bg-slate-800/60 rounded" />
          </div>
        ))}
      </div>

      {/* Large Chart Skeleton 1 */}
      <div className="h-80 bg-slate-900/80 border border-slate-800 rounded-xl p-6 space-y-4">
        <div className="h-5 w-48 bg-slate-800 rounded" />
        <div className="h-56 bg-slate-800/40 rounded-lg" />
      </div>

      {/* Large Chart Skeleton 2 */}
      <div className="h-80 bg-slate-900/80 border border-slate-800 rounded-xl p-6 space-y-4">
        <div className="h-5 w-56 bg-slate-800 rounded" />
        <div className="h-56 bg-slate-800/40 rounded-lg" />
      </div>

      {/* Large Chart Skeleton 3 */}
      <div className="h-80 bg-slate-900/80 border border-slate-800 rounded-xl p-6 space-y-4">
        <div className="h-5 w-52 bg-slate-800 rounded" />
        <div className="h-56 bg-slate-800/40 rounded-lg" />
      </div>

      {/* Split Cards Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-72 bg-slate-900/80 border border-slate-800 rounded-xl p-6 space-y-4">
          <div className="h-5 w-44 bg-slate-800 rounded" />
          <div className="h-48 bg-slate-800/40 rounded-lg" />
        </div>
        <div className="h-72 bg-slate-900/80 border border-slate-800 rounded-xl p-6 space-y-4">
          <div className="h-5 w-44 bg-slate-800 rounded" />
          <div className="h-48 bg-slate-800/40 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
