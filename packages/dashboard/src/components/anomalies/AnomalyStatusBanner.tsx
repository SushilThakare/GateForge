'use client';

/**
 * @file packages/dashboard/src/components/anomalies/AnomalyStatusBanner.tsx
 * @description Operational telemetry banner for AI Anomaly Detection.
 * Displays when the last analysis ran, when the next run is scheduled,
 * and provides the interactive "Run Analysis Now" trigger button.
 */

import React from 'react';
import { Clock, Calendar, Sparkles, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { AnomalyStatusMeta } from '../../types/anomalies';

export interface AnomalyStatusBannerProps {
  status: AnomalyStatusMeta;
  isRunning: boolean;
  triggerMessage: string | null;
  triggerError: string | null;
  onRunAnalysis: () => Promise<void>;
}

/**
 * Formats an ISO date string into a friendly relative human string.
 */
function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return 'Never';
  const time = new Date(isoString).getTime();
  const diffSec = Math.floor((Date.now() - time) / 1000);

  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDays = Math.floor(diffHour / 24);
  return `${diffDays}d ago`;
}

/**
 * Formats a future ISO date string into an estimated countdown string.
 */
function formatFutureTime(isoString: string | null): string {
  if (!isoString) return 'In ~1 hour';
  const target = new Date(isoString).getTime();
  const diffSec = Math.floor((target - Date.now()) / 1000);

  if (diffSec <= 0) return 'Imminent';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `In ~${diffMin}m`;
  const diffHour = Math.floor(diffMin / 60);
  return `In ~${diffHour}h`;
}

/**
 * Status indicator and trigger header for the anomaly detection dashboard.
 *
 * @param {AnomalyStatusBannerProps} props - Operational status and trigger callbacks
 * @returns {JSX.Element} Status banner
 */
export function AnomalyStatusBanner({
  status,
  isRunning,
  triggerMessage,
  triggerError,
  onRunAnalysis,
}: AnomalyStatusBannerProps): JSX.Element {
  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-lg backdrop-blur-sm">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        {/* Left Side: Status Indicators */}
        <div className="flex flex-wrap items-center gap-6 text-sm">
          {/* Last Run */}
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-slate-800 border border-slate-700/60 text-sky-400">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs text-slate-400 font-medium">Last Analysis</div>
              <div className="font-semibold text-slate-200">
                {status.lastRunAt ? (
                  <span title={new Date(status.lastRunAt).toLocaleString()}>
                    {formatRelativeTime(status.lastRunAt)}
                  </span>
                ) : (
                  <span className="text-slate-400">No runs recorded</span>
                )}
              </div>
            </div>
          </div>

          <div className="h-8 w-[1px] bg-slate-800 hidden sm:block" />

          {/* Next Scheduled */}
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-slate-800 border border-slate-700/60 text-purple-400">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs text-slate-400 font-medium">Next Scheduled</div>
              <div className="font-semibold text-slate-200 flex items-center gap-2">
                <span>{formatFutureTime(status.nextScheduledAt)}</span>
                <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30">
                  Hourly
                </span>
              </div>
            </div>
          </div>

          <div className="h-8 w-[1px] bg-slate-800 hidden sm:block" />

          {/* Scheduler Daemon Telemetry */}
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </span>
            <span className="text-xs font-medium text-slate-300">
              BullMQ Scheduler Active
            </span>
          </div>
        </div>

        {/* Right Side: "Run Analysis Now" Action Button */}
        <div className="flex items-center gap-3 w-full lg:w-auto">
          <button
            onClick={() => onRunAnalysis()}
            disabled={isRunning}
            className={`w-full lg:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              isRunning
                ? 'bg-slate-800 text-slate-400 cursor-not-allowed border border-slate-700'
                : 'bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-slate-950 font-bold shadow-md shadow-sky-500/20 active:scale-95'
            }`}
            aria-label="Trigger Immediate AI Traffic Analysis"
          >
            {isRunning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
                <span>Running GPT-4o-mini...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 fill-slate-950" />
                <span>Run Analysis Now</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Contextual Feedback Messages */}
      {triggerMessage && (
        <div className="mt-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" />
          <span>{triggerMessage}</span>
        </div>
      )}

      {triggerError && (
        <div className="mt-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2 animate-fadeIn">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
          <span>{triggerError}</span>
        </div>
      )}
    </div>
  );
}
