'use client';

/**
 * @file packages/dashboard/src/components/anomalies/RiskLevelBadge.tsx
 * @description Color-coded badge with iconography indicating the overall risk level of an AnomalyReport.
 */

import React from 'react';
import { AlertOctagon, AlertTriangle, ShieldAlert, ShieldCheck } from 'lucide-react';
import { RiskLevel } from '../../types/anomalies';

export interface RiskLevelBadgeProps {
  risk: RiskLevel | string;
  className?: string;
}

/**
 * Renders an overall risk badge with accompanying iconography.
 *
 * @param {RiskLevelBadgeProps} props - The risk level to display
 * @returns {JSX.Element} Visual risk badge
 */
export function RiskLevelBadge({ risk, className = '' }: RiskLevelBadgeProps): JSX.Element {
  const normalized = String(risk).toUpperCase();

  switch (normalized) {
    case 'CRITICAL':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/50 shadow-md shadow-rose-950/50 ${className}`}
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
          </span>
          <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />
          <span>Critical Risk</span>
        </span>
      );

    case 'HIGH':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm shadow-amber-950/40 ${className}`}
        >
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
          <span>High Risk</span>
        </span>
      );

    case 'MEDIUM':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-yellow-500/15 text-yellow-300 border border-yellow-500/40 shadow-sm shadow-yellow-950/30 ${className}`}
        >
          <ShieldAlert className="w-3.5 h-3.5 text-yellow-400" />
          <span>Medium Risk</span>
        </span>
      );

    case 'LOW':
    default:
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 ${className}`}
        >
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Low Risk</span>
        </span>
      );
  }
}
