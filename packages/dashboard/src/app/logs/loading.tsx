/**
 * @file packages/dashboard/src/app/logs/loading.tsx
 * @description Loading UI skeleton for Logs route during initial server data streaming.
 */

import React from 'react';

export default function LogsLoading(): JSX.Element {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="pb-6 border-b border-slate-800 flex justify-between items-center animate-pulse">
        <div>
          <div className="h-7 w-44 bg-slate-800 rounded mb-2" />
          <div className="h-4 w-80 bg-slate-800/60 rounded" />
        </div>
        <div className="h-8 w-28 bg-slate-800 rounded" />
      </div>

      {/* Filter Bar skeleton */}
      <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl animate-pulse space-y-3">
        <div className="h-10 bg-slate-950 rounded-xl" />
        <div className="flex gap-3">
          <div className="h-8 w-32 bg-slate-800/50 rounded-lg" />
          <div className="h-8 w-36 bg-slate-800/50 rounded-lg" />
          <div className="h-8 w-32 bg-slate-800/50 rounded-lg" />
        </div>
      </div>

      {/* Table skeleton */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 animate-pulse space-y-3">
        <div className="h-8 bg-slate-950 rounded-xl" />
        <div className="h-10 bg-slate-800/30 rounded-xl" />
        <div className="h-10 bg-slate-800/20 rounded-xl" />
        <div className="h-10 bg-slate-800/30 rounded-xl" />
        <div className="h-10 bg-slate-800/20 rounded-xl" />
        <div className="h-10 bg-slate-800/30 rounded-xl" />
      </div>
    </div>
  );
}
