'use client';

/**
 * @file packages/dashboard/src/components/overview/RecentErrorsTable.tsx
 * @description Clean, spacious recent errors table using warm stone surfaces,
 * crisp Geist typography, and refined status pills.
 */

import React from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { RecentErrorItem } from '../../types/stats';

/**
 * Props for RecentErrorsTable component
 */
export interface RecentErrorsTableProps {
  errors: RecentErrorItem[];
}

/**
 * Formats ISO timestamp to short human-readable date and time.
 * 
 * @param {string} isoString - ISO string timestamp
 * @returns {string} Formatted timestamp string
 */
function formatDateTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}`;
  } catch {
    return isoString;
  }
}

/**
 * Renders the table of 10 most recent error logs.
 * 
 * @param {RecentErrorsTableProps} props - Array of failed request logs
 * @returns {JSX.Element} Rendered table component
 */
export function RecentErrorsTable({ errors }: RecentErrorsTableProps): JSX.Element {
  const hasErrors = errors && errors.length > 0;

  return (
    <div className="rounded-xl bg-stone-900/40 border border-stone-800/80 shadow-xs overflow-hidden">
      <div className="p-6 border-b border-stone-800/80 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-stone-100">
            Recent Errors (Last 10 Failures)
          </h3>
          <p className="text-xs text-stone-400 mt-0.5">
            Live diagnostic stream of 4xx client errors and 5xx upstream failures
          </p>
        </div>
        <span
          className={`px-2.5 py-1 rounded-full text-[11px] font-mono font-medium ${
            hasErrors
              ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
              : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
          }`}
        >
          {hasErrors ? `${errors.length} recent logged` : '0 errors'}
        </span>
      </div>

      {!hasErrors ? (
        <div className="py-14 flex flex-col items-center justify-center text-center">
          <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-3">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <h4 className="text-stone-200 font-semibold text-sm">All Systems Operational</h4>
          <p className="text-stone-400 text-xs max-w-sm mt-1">
            No 4xx or 5xx request failures recorded in the current telemetry window.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-stone-400 font-medium border-b border-stone-800/80 bg-stone-950/40">
              <tr>
                <th className="py-3 px-6 font-mono uppercase text-[11px]">Timestamp</th>
                <th className="py-3 px-6 font-mono uppercase text-[11px]">Method &amp; Path</th>
                <th className="py-3 px-6 font-mono uppercase text-[11px]">Status</th>
                <th className="py-3 px-6 font-mono uppercase text-[11px]">Latency</th>
                <th className="py-3 px-6 font-mono uppercase text-[11px]">Client IP</th>
                <th className="py-3 px-6 font-mono uppercase text-[11px]">API Key</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-800/60 text-stone-300">
              {errors.map((err) => {
                const is5xx = err.statusCode >= 500;

                return (
                  <tr key={err.id} className="hover:bg-stone-800/30 transition">
                    <td className="py-3.5 px-6 font-mono text-stone-400 whitespace-nowrap">
                      {formatDateTime(err.timestamp)}
                    </td>
                    <td className="py-3.5 px-6 whitespace-nowrap">
                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold font-mono bg-stone-800 text-stone-200 mr-2">
                        {err.method}
                      </span>
                      <span className="font-mono text-stone-200">{err.path}</span>
                    </td>
                    <td className="py-3.5 px-6 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-mono text-[11px] font-medium ${
                          is5xx
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            : 'bg-persimmon-500/10 text-persimmon-400 border border-persimmon-500/20'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            is5xx ? 'bg-rose-400' : 'bg-persimmon-400'
                          }`}
                        />
                        {err.statusCode}
                      </span>
                    </td>
                    <td className="py-3.5 px-6 font-mono text-stone-400 whitespace-nowrap">
                      {err.responseTimeMs.toFixed(1)} ms
                    </td>
                    <td className="py-3.5 px-6 font-mono text-stone-400 whitespace-nowrap">
                      {err.ipAddress || '—'}
                    </td>
                    <td className="py-3.5 px-6 font-mono text-stone-400 whitespace-nowrap">
                      {err.apiKeyName ? (
                        <span className="text-stone-300">{err.apiKeyName}</span>
                      ) : (
                        <span className="text-stone-400 italic">None</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
