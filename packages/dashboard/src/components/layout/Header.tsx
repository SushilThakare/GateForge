'use client';

/**
 * @file packages/dashboard/src/components/layout/Header.tsx
 * @description Top header bar for GateForge Dashboard displaying cluster connectivity,
 * active environment indicators, and breadcrumb header information.
 */

import React from 'react';
import { Activity, RefreshCw } from 'lucide-react';

/**
 * Props for Header component
 */
export interface HeaderProps {
  title?: string;
  subtitle?: string;
}

/**
 * Dashboard Header component.
 * 
 * @param {HeaderProps} props - Header labels and operational metadata
 * @returns {JSX.Element} Rendered Header element
 */
export function Header({
  title = 'System Overview',
  subtitle = 'Telemetry, throughput metrics, and rate limit health monitoring',
}: HeaderProps): JSX.Element {
  return (
    <header className="flex flex-col md:flex-row md:items-center justify-between pb-6 mb-6 border-b border-slate-800 gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-100 flex items-center gap-2.5">
          {title}
        </h1>
        <p className="text-sm text-slate-400 mt-1">{subtitle}</p>
      </div>

      <div className="flex items-center gap-3">
        {/* Gateway connection indicator badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-slate-300">Gateway: 3000</span>
        </div>

        {/* Refresh button */}
        <button
          onClick={() => window.location.reload()}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 text-xs font-medium transition-colors"
          title="Refresh dashboard metrics"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </button>
      </div>
    </header>
  );
}
