'use client';

/**
 * @file packages/dashboard/src/components/analytics/TimeRangeSelector.tsx
 * @description Segmented button control for switching analytics time horizons.
 * Supports 1h, 6h, 24h, 7d, and 30d time ranges without requiring full page reload.
 */

import React from 'react';
import { AnalyticsTimeRangePreset } from '../../types/analytics';

export interface TimeRangeSelectorProps {
  value: AnalyticsTimeRangePreset;
  onChange: (preset: AnalyticsTimeRangePreset) => void;
  isLoading?: boolean;
}

interface PresetOption {
  key: AnalyticsTimeRangePreset;
  label: string;
  sublabel: string;
}

const PRESETS: PresetOption[] = [
  { key: '1h', label: '1h', sublabel: 'Last 1 Hour' },
  { key: '6h', label: '6h', sublabel: 'Last 6 Hours' },
  { key: '24h', label: '24h', sublabel: 'Last 24 Hours' },
  { key: '7d', label: '7d', sublabel: 'Last 7 Days' },
  { key: '30d', label: '30d', sublabel: 'Last 30 Days' },
];

/**
 * Renders the time range selector pill bar.
 *
 * @param {TimeRangeSelectorProps} props - Current selection, change callback, and loading state
 * @returns {JSX.Element} Rendered pill selector
 */
export function TimeRangeSelector({
  value,
  onChange,
  isLoading = false,
}: TimeRangeSelectorProps): JSX.Element {
  return (
    <div className="flex items-center space-x-1.5 p-1 bg-slate-900/90 border border-slate-800 rounded-xl shadow-inner">
      {PRESETS.map((p) => {
        const isSelected = value === p.key;
        return (
          <button
            key={p.key}
            type="button"
            disabled={isLoading}
            onClick={() => onChange(p.key)}
            title={p.sublabel}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all duration-150 flex items-center space-x-1.5 ${
              isSelected
                ? 'bg-sky-500 text-slate-950 font-bold shadow-md shadow-sky-500/20'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
            } ${isLoading ? 'opacity-70 cursor-wait' : ''}`}
          >
            <span>{p.label}</span>
          </button>
        );
      })}
      {isLoading && (
        <span className="flex items-center px-2 text-xs text-sky-400 animate-pulse">
          <svg
            className="animate-spin h-3.5 w-3.5 mr-1 text-sky-400"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          Updating...
        </span>
      )}
    </div>
  );
}
