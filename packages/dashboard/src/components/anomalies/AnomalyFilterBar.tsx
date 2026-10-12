'use client';

/**
 * @file packages/dashboard/src/components/anomalies/AnomalyFilterBar.tsx
 * @description Filter toolbar for the anomaly detection timeline.
 * Allows filtering reports by severity level, date range window, and search keyword.
 */

import React from 'react';
import { Filter, Search, RotateCw, X } from 'lucide-react';

export interface AnomalyFilterBarProps {
  selectedSeverity: string;
  selectedDateRange: string;
  searchQuery: string;
  isLoading: boolean;
  onSeverityChange: (severity: string) => void;
  onDateRangeChange: (range: string) => void;
  onSearchChange: (query: string) => void;
  onRefresh: () => void;
}

const SEVERITY_OPTIONS = [
  { label: 'All Severities', value: 'ALL' },
  { label: 'Critical Only', value: 'CRITICAL', color: 'text-rose-400' },
  { label: 'High Only', value: 'HIGH', color: 'text-amber-400' },
  { label: 'Medium Only', value: 'MEDIUM', color: 'text-yellow-400' },
  { label: 'Low / Normal', value: 'LOW', color: 'text-emerald-400' },
];

const DATE_RANGE_OPTIONS = [
  { label: 'Last 1 Hour', value: '1h' },
  { label: 'Last 24 Hours', value: '24h' },
  { label: 'Last 7 Days', value: '7d' },
  { label: 'Last 30 Days', value: '30d' },
  { label: 'All History', value: 'all' },
];

/**
 * Renders the filter controls for the anomaly detection dashboard.
 *
 * @param {AnomalyFilterBarProps} props - Current filter values and update handlers
 * @returns {JSX.Element} Filter bar
 */
export function AnomalyFilterBar({
  selectedSeverity,
  selectedDateRange,
  searchQuery,
  isLoading,
  onSeverityChange,
  onDateRangeChange,
  onSearchChange,
  onRefresh,
}: AnomalyFilterBarProps): JSX.Element {
  const hasActiveFilters =
    selectedSeverity !== 'ALL' || selectedDateRange !== '24h' || searchQuery.trim().length > 0;

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
      {/* Left: Filter Controls */}
      <div className="flex flex-wrap items-center gap-3 flex-1">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400 font-mono pr-1">
          <Filter className="w-3.5 h-3.5 text-sky-400" />
          <span>Filters</span>
        </div>

        {/* Severity Selector */}
        <div className="relative">
          <select
            value={selectedSeverity}
            onChange={(e) => onSeverityChange(e.target.value)}
            className="bg-slate-800 border border-slate-700 hover:border-slate-600 text-slate-200 text-xs font-medium rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all cursor-pointer"
            aria-label="Filter by Severity"
          >
            {SEVERITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Date Range Selector */}
        <div className="relative">
          <select
            value={selectedDateRange}
            onChange={(e) => onDateRangeChange(e.target.value)}
            className="bg-slate-800 border border-slate-700 hover:border-slate-600 text-slate-200 text-xs font-medium rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all cursor-pointer"
            aria-label="Filter by Date Range"
          >
            {DATE_RANGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Search Query Input */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search anomalies, evidence, endpoints..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-slate-800/90 border border-slate-700 hover:border-slate-600 text-slate-200 text-xs rounded-lg pl-8 pr-8 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all placeholder:text-slate-500"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              aria-label="Clear Search Input"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Reset Filter Button */}
        {hasActiveFilters && (
          <button
            onClick={() => {
              onSeverityChange('ALL');
              onDateRangeChange('24h');
              onSearchChange('');
            }}
            className="text-xs text-slate-400 hover:text-slate-200 underline underline-offset-2 flex items-center gap-1"
          >
            Reset
          </button>
        )}
      </div>

      {/* Right: Refresh Button */}
      <div className="flex items-center justify-end">
        <button
          onClick={() => onRefresh()}
          disabled={isLoading}
          className="inline-flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs font-medium text-slate-300 transition-all"
          aria-label="Refresh Anomaly Reports"
        >
          <RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-sky-400' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>
    </div>
  );
}
