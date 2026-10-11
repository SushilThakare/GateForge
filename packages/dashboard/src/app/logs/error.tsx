'use client';

/**
 * @file packages/dashboard/src/app/logs/error.tsx
 * @description Error boundary for Logs route.
 */

import React from 'react';

export interface LogsErrorProps {
  error: Error;
  reset: () => void;
}

export default function LogsError({ error, reset }: LogsErrorProps): JSX.Element {
  return (
    <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-xl">
      <h2 className="text-lg font-bold text-rose-400">Error Loading Logs</h2>
      <p className="text-sm text-slate-400 mt-2">{error.message}</p>
      <button
        onClick={() => reset()}
        className="mt-4 px-4 py-2 bg-sky-500 text-slate-950 font-semibold rounded-lg text-sm"
      >
        Retry
      </button>
    </div>
  );
}
