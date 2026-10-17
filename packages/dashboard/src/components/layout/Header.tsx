'use client';

/**
 * @file packages/dashboard/src/components/layout/Header.tsx
 * @description Top header bar for GateForge Dashboard displaying cluster connectivity,
 * active environment indicators, theme toggle, and refresh action.
 */

import React from 'react';
import { RefreshCw } from 'lucide-react';
import { ThemeToggle } from '../theme/ThemeToggle';

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
    <header className="flex flex-col md:flex-row md:items-center justify-between pb-6 mb-8 border-b border-stone-800/80 gap-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-stone-100 flex items-center gap-2.5">
          {title}
        </h1>
        <p className="text-xs text-stone-400 mt-1">{subtitle}</p>
      </div>

      <div className="flex items-center gap-3">
        {/* Gateway connection indicator badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-stone-900/60 border border-stone-800 text-xs font-mono">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-stone-300">Gateway: 3000</span>
        </div>

        {/* Theme Toggle (Dark/Light) */}
        <ThemeToggle />

        {/* Refresh button */}
        <button
          onClick={() => window.location.reload()}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-stone-900/60 hover:bg-stone-800 border border-stone-800 text-stone-300 hover:text-stone-100 text-xs font-medium transition-colors"
          title="Refresh dashboard metrics"
        >
          <RefreshCw className="w-3.5 h-3.5 text-stone-400" />
          <span>Refresh</span>
        </button>
      </div>
    </header>
  );
}
