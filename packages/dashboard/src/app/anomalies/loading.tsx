/**
 * @file packages/dashboard/src/app/anomalies/loading.tsx
 * @description Loading UI skeleton for the Anomalies route.
 * Renders pulse placeholders for the status banner, filter bar, and timeline report cards
 * during streaming server-side data fetching.
 */

import React from 'react';

/**
 * Loading skeleton component for /anomalies.
 *
 * @returns {JSX.Element} Pulse skeleton loader
 */
export default function AnomaliesLoading(): JSX.Element {
  return (
    <div className="space-y-6 animate-pulse" aria-label="Loading Anomalies Dashboard">
      {/* Page Header Skeleton */}
      <div className="space-y-2">
        <div className="h-8 w-64 bg-slate-800 rounded-lg" />
        <div className="h-4 w-96 bg-slate-800/60 rounded" />
      </div>

      {/* Status Banner Skeleton */}
      <div className="h-24 bg-slate-900/90 border border-slate-800 rounded-xl p-5 flex items-center justify-between">
        <div className="flex gap-8">
          <div className="h-10 w-36 bg-slate-800 rounded-lg" />
          <div className="h-10 w-36 bg-slate-800 rounded-lg hidden sm:block" />
          <div className="h-10 w-36 bg-slate-800 rounded-lg hidden md:block" />
        </div>
        <div className="h-10 w-40 bg-slate-800 rounded-lg" />
      </div>

      {/* Filter Bar Skeleton */}
      <div className="h-14 bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex items-center gap-4">
        <div className="h-8 w-32 bg-slate-800 rounded-lg" />
        <div className="h-8 w-32 bg-slate-800 rounded-lg" />
        <div className="h-8 w-64 bg-slate-800 rounded-lg flex-1" />
      </div>

      {/* Timeline Report Cards Skeletons */}
      <div className="space-y-4">
        {[1, 2, 3].map((item) => (
          <div
            key={item}
            className="rounded-xl border border-slate-800 bg-slate-900/70 p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-6 w-28 bg-slate-800 rounded-full" />
                <div className="h-4 w-40 bg-slate-800 rounded" />
              </div>
              <div className="h-5 w-24 bg-slate-800 rounded" />
            </div>
            <div className="h-4 w-full bg-slate-800/70 rounded" />
            <div className="h-20 bg-slate-950/60 border border-slate-800/80 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
