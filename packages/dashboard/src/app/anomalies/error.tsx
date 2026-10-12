'use client';

/**
 * @file packages/dashboard/src/app/anomalies/error.tsx
 * @description React Error Boundary component for the Anomalies dashboard route.
 * Catches unhandled runtime exceptions during data fetching or rendering, providing
 * actionable diagnostic context and a retry trigger.
 */

import React, { useEffect } from 'react';
import { AlertOctagon, RotateCw } from 'lucide-react';

export interface AnomaliesErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Error fallback UI for /anomalies.
 *
 * @param {AnomaliesErrorProps} props - The captured Error and reset callback
 * @returns {JSX.Element} Error fallback container
 */
export default function AnomaliesError({ error, reset }: AnomaliesErrorProps): JSX.Element {
  useEffect(() => {
    // Log the error with diagnostic context
    console.error('[Anomalies Route Error Boundary Caught]:', {
      message: error.message,
      stack: error.stack,
      digest: error.digest,
      timestamp: new Date().toISOString(),
    });
  }, [error]);

  return (
    <div className="p-8 my-8 text-center bg-slate-900 border border-slate-800 rounded-xl max-w-xl mx-auto space-y-4 shadow-xl">
      <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto text-rose-400">
        <AlertOctagon className="w-6 h-6" />
      </div>

      <div className="space-y-1">
        <h2 className="text-base font-bold text-slate-100">Unable to Load Anomaly Reports</h2>
        <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
          {error.message || 'An unexpected error occurred while communicating with the telemetry service.'}
        </p>
      </div>

      <div className="pt-2">
        <button
          onClick={() => reset()}
          className="inline-flex items-center gap-2 px-4 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold rounded-lg text-xs transition-all active:scale-95"
        >
          <RotateCw className="w-3.5 h-3.5" />
          <span>Retry Loading</span>
        </button>
      </div>
    </div>
  );
}
