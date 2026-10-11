/**
 * @file packages/dashboard/src/app/loading.tsx
 * @description Next.js App Router Loading UI skeleton for the Overview page.
 * Displayed automatically via React Suspense streaming while Server Components fetch telemetry data.
 */

import React from 'react';

/**
 * Skeleton pulse card component.
 */
function SkeletonCard(): JSX.Element {
  return (
    <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 animate-pulse">
      <div className="h-3 w-28 bg-slate-800 rounded mb-3" />
      <div className="h-8 w-36 bg-slate-700/60 rounded mb-4" />
      <div className="h-3 w-20 bg-slate-800/80 rounded" />
    </div>
  );
}

/**
 * Overview Loading UI skeleton component.
 * 
 * @returns {JSX.Element} Rendered loading skeleton
 */
export default function OverviewLoading(): JSX.Element {
  return (
    <div className="space-y-6">
      {/* Header Skeleton */}
      <div className="pb-6 border-b border-slate-800 flex justify-between items-center animate-pulse">
        <div>
          <div className="h-7 w-48 bg-slate-800 rounded mb-2" />
          <div className="h-4 w-72 bg-slate-800/60 rounded" />
        </div>
        <div className="h-8 w-28 bg-slate-800 rounded" />
      </div>

      {/* 4 Stat Cards Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>

      {/* Charts Grid Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 h-80 animate-pulse">
          <div className="h-4 w-40 bg-slate-800 rounded mb-2" />
          <div className="h-3 w-60 bg-slate-800/60 rounded mb-6" />
          <div className="h-52 bg-slate-800/40 rounded" />
        </div>
        <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 h-80 animate-pulse">
          <div className="h-4 w-40 bg-slate-800 rounded mb-2" />
          <div className="h-3 w-60 bg-slate-800/60 rounded mb-6" />
          <div className="h-52 bg-slate-800/40 rounded" />
        </div>
      </div>

      {/* Table Skeleton */}
      <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 h-64 animate-pulse">
        <div className="h-4 w-48 bg-slate-800 rounded mb-2" />
        <div className="h-3 w-72 bg-slate-800/60 rounded mb-6" />
        <div className="space-y-3">
          <div className="h-8 bg-slate-800/40 rounded" />
          <div className="h-8 bg-slate-800/30 rounded" />
          <div className="h-8 bg-slate-800/20 rounded" />
        </div>
      </div>
    </div>
  );
}
