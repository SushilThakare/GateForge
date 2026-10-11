'use client';

/**
 * @file packages/dashboard/src/app/error.tsx
 * @description Next.js App Router Error Boundary for the Overview page segment.
 * Catches runtime rendering failures and network errors, providing graceful fallback UI
 * and an interactive retry mechanism.
 */

import React, { useEffect } from 'react';
import { AlertOctagon, RotateCcw } from 'lucide-react';

/**
 * Props for Error Boundary component
 */
export interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Overview Error Boundary component.
 * 
 * @param {ErrorPageProps} props - Captured error object and reset callback
 * @returns {JSX.Element} Rendered fallback error screen
 */
export default function OverviewError({ error, reset }: ErrorPageProps): JSX.Element {
  useEffect(() => {
    // Log error details with operational context
    console.error('[Overview Error Boundary]: Caught unhandled segment error:', {
      message: error.message,
      stack: error.stack,
      digest: error.digest,
      timestamp: new Date().toISOString(),
    });
  }, [error]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center mb-4 shadow-lg shadow-rose-500/10">
        <AlertOctagon className="w-8 h-8" />
      </div>

      <h2 className="text-xl font-bold text-slate-100 tracking-tight">
        Unable to Load Overview Telemetry
      </h2>
      <p className="text-sm text-slate-400 max-w-md mt-2 mb-6">
        An error occurred while communicating with the telemetry aggregator or rendering dashboard widgets.
        {error.message && (
          <span className="block mt-2 font-mono text-xs text-rose-300/80 bg-rose-950/40 p-2 rounded border border-rose-900/60">
            {error.message}
          </span>
        )}
      </p>

      <button
        onClick={() => reset()}
        className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-sm transition-colors shadow-md shadow-sky-500/20"
      >
        <RotateCcw className="w-4 h-4" />
        <span>Try Again</span>
      </button>
    </div>
  );
}
