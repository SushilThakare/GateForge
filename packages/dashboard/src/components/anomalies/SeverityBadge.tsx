'use client';

/**
 * @file packages/dashboard/src/components/anomalies/SeverityBadge.tsx
 * @description Visually distinct severity badge for individual anomaly items.
 *
 * Requirements:
 * - Critical: Red badge with an active animated pulsing dot
 * - High: Orange badge
 * - Medium: Yellow badge
 * - Low: Green/gray badge
 */

import React from 'react';
import { AnomalySeverity } from '../../types/anomalies';

export interface SeverityBadgeProps {
  severity: AnomalySeverity | string;
  className?: string;
  showDot?: boolean;
}

/**
 * Renders a color-coded and animated badge indicating the severity of an anomaly.
 *
 * @param {SeverityBadgeProps} props - Severity level and styling options
 * @returns {JSX.Element} The rendered severity badge
 */
export function SeverityBadge({
  severity,
  className = '',
  showDot = true,
}: SeverityBadgeProps): JSX.Element {
  const normalized = String(severity).toUpperCase();

  switch (normalized) {
    case 'CRITICAL':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/40 shadow-sm shadow-rose-950/40 ${className}`}
        >
          {showDot && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
            </span>
          )}
          <span>Critical</span>
        </span>
      );

    case 'HIGH':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/40 shadow-sm shadow-amber-950/30 ${className}`}
        >
          {showDot && <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />}
          <span>High</span>
        </span>
      );

    case 'MEDIUM':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-yellow-500/15 text-yellow-300 border border-yellow-500/40 shadow-sm shadow-yellow-950/20 ${className}`}
        >
          {showDot && <span className="inline-block h-2 w-2 rounded-full bg-yellow-500" />}
          <span>Medium</span>
        </span>
      );

    case 'LOW':
    default:
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700 ${className}`}
        >
          {showDot && <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />}
          <span>Low</span>
        </span>
      );
  }
}
