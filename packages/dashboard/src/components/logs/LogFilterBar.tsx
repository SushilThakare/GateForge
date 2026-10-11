'use client';

/**
 * @file packages/dashboard/src/components/logs/LogFilterBar.tsx
 * @description Interactive filter bar for the Request Log Viewer.
 * Supports path search, status family filter, API key selector, date ranges,
 * and real-time streaming toggle with live beacon indicators.
 */

import React from 'react';
import { Search, Radio, Filter, Calendar, KeyRound } from 'lucide-react';
import { LogsFilterState, StatusFamilyFilter } from '../../types/logs';
import { ApiKeyItem } from '../../types/keys';

export interface LogFilterBarProps {
  filter: LogsFilterState;
  onFilterChange: (newFilter: LogsFilterState) => void;
  apiKeys: ApiKeyItem[];
  isRealTime: boolean;
  onToggleRealTime: () => void;
  totalLoaded: number;
}

export function LogFilterBar({
  filter,
  onFilterChange,
  apiKeys,
  isRealTime,
  onToggleRealTime,
  totalLoaded,
}: LogFilterBarProps): JSX.Element {
  return (
    <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl flex flex-col gap-3">
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        {/* Search by Path Input */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={filter.path}
            onChange={(e) => onFilterChange({ ...filter, path: e.target.value })}
            placeholder="Search request path (e.g. /v1/proxy/users)..."
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all font-mono"
          />
        </div>

        {/* Real-time SSE Toggle Button */}
        <div className="flex items-center gap-2 self-end lg:self-auto">
          <button
            onClick={onToggleRealTime}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all border ${
              isRealTime
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400 shadow-md shadow-emerald-500/10'
                : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
            title={isRealTime ? 'Pause real-time log ingestion' : 'Stream live logs via Server-Sent Events'}
          >
            <Radio className={`w-3.5 h-3.5 ${isRealTime ? 'animate-pulse text-emerald-400' : ''}`} />
            <span>{isRealTime ? 'LIVE STREAM' : 'PAUSED'}</span>
            <span
              className={`w-2 h-2 rounded-full ${
                isRealTime ? 'bg-emerald-400 animate-ping' : 'bg-slate-600'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Secondary Filter Controls Row */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pt-3 border-t border-slate-800/80 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Family Filter */}
          <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={filter.status}
              onChange={(e) => onFilterChange({ ...filter, status: e.target.value })}
              className="bg-transparent text-slate-200 text-xs focus:outline-none cursor-pointer pr-1"
            >
              <option value={StatusFamilyFilter.ALL} className="bg-slate-900">All Statuses</option>
              <option value={StatusFamilyFilter.SUCCESS_2XX} className="bg-slate-900">2xx Success</option>
              <option value={StatusFamilyFilter.REDIRECT_3XX} className="bg-slate-900">3xx Redirect</option>
              <option value={StatusFamilyFilter.CLIENT_ERROR_4XX} className="bg-slate-900">4xx Client Error</option>
              <option value={StatusFamilyFilter.SERVER_ERROR_5XX} className="bg-slate-900">5xx Server Error</option>
            </select>
          </div>

          {/* API Key Selector */}
          <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
            <KeyRound className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={filter.apiKeyId}
              onChange={(e) => onFilterChange({ ...filter, apiKeyId: e.target.value })}
              className="bg-transparent text-slate-200 text-xs focus:outline-none cursor-pointer pr-1 max-w-[160px] truncate"
            >
              <option value="all" className="bg-slate-900">All API Keys</option>
              {apiKeys.map((k) => (
                <option key={k.id} value={k.id} className="bg-slate-900">
                  {k.name}
                </option>
              ))}
            </select>
          </div>

          {/* Date Range Selector */}
          <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={filter.dateRange}
              onChange={(e) => onFilterChange({ ...filter, dateRange: e.target.value })}
              className="bg-transparent text-slate-200 text-xs focus:outline-none cursor-pointer pr-1"
            >
              <option value="1h" className="bg-slate-900">Last 1 Hour</option>
              <option value="24h" className="bg-slate-900">Last 24 Hours</option>
              <option value="7d" className="bg-slate-900">Last 7 Days</option>
              <option value="all" className="bg-slate-900">All Time</option>
            </select>
          </div>
        </div>

        {/* Total Loaded Badge */}
        <div className="text-[11px] font-mono text-slate-400">
          Showing <span className="font-semibold text-slate-200">{totalLoaded.toLocaleString()}</span> entries
        </div>
      </div>
    </div>
  );
}
