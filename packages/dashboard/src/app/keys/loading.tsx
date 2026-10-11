/**
 * @file packages/dashboard/src/app/keys/loading.tsx
 * @description Loading UI skeleton for API Keys route during server data streaming.
 */

import React from 'react';

export default function KeysLoading(): JSX.Element {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="pb-6 border-b border-slate-800 flex justify-between items-center animate-pulse">
        <div>
          <div className="h-7 w-40 bg-slate-800 rounded mb-2" />
          <div className="h-4 w-72 bg-slate-800/60 rounded" />
        </div>
        <div className="h-8 w-28 bg-slate-800 rounded" />
      </div>

      {/* Action Bar skeleton */}
      <div className="flex justify-between items-center animate-pulse">
        <div className="h-9 w-64 bg-slate-900 border border-slate-800 rounded-xl" />
        <div className="h-9 w-36 bg-slate-800 rounded-xl" />
      </div>

      {/* Table skeleton */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 animate-pulse space-y-4">
        <div className="h-10 bg-slate-950/60 rounded-xl" />
        <div className="h-14 bg-slate-800/30 rounded-xl" />
        <div className="h-14 bg-slate-800/20 rounded-xl" />
        <div className="h-14 bg-slate-800/30 rounded-xl" />
        <div className="h-14 bg-slate-800/20 rounded-xl" />
      </div>
    </div>
  );
}
