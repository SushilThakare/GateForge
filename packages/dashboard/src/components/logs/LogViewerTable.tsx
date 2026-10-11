'use client';

/**
 * @file packages/dashboard/src/components/logs/LogViewerTable.tsx
 * @description Virtualized request telemetry table component capable of rendering 10,000+ rows
 * at 60fps with @tanstack/react-virtual, cursor-based infinite scroll, live SSE streaming,
 * and a slide-out detail inspection drawer.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Clock, Loader2, ArrowDownCircle, CheckCircle2 } from 'lucide-react';
import {
  RequestLogItem,
  CursorPaginationMeta,
  LogsFilterState,
  StatusFamilyFilter,
  RequestLogDetail,
} from '../../types/logs';
import { ApiKeyItem } from '../../types/keys';
import { StatusBadge } from './StatusBadge';
import { LogFilterBar } from './LogFilterBar';
import { LogDetailPanel } from './LogDetailPanel';

export interface LogViewerTableProps {
  initialLogs: RequestLogItem[];
  initialPagination: CursorPaginationMeta;
  apiKeys: ApiKeyItem[];
}

/**
 * Formats ISO timestamp to short local time (HH:MM:SS.mmm)
 */
function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) +
      '.' + String(d.getMilliseconds()).padStart(3, '0');
  } catch {
    return iso;
  }
}

export function LogViewerTable({
  initialLogs,
  initialPagination,
  apiKeys,
}: LogViewerTableProps): JSX.Element {
  const [logs, setLogs] = useState<RequestLogItem[]>(initialLogs);
  const [pagination, setPagination] = useState<CursorPaginationMeta>(initialPagination);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [isRealTime, setIsRealTime] = useState<boolean>(true);
  const [selectedLog, setSelectedLog] = useState<RequestLogDetail | null>(null);

  const [filter, setFilter] = useState<LogsFilterState>({
    status: StatusFamilyFilter.ALL,
    apiKeyId: 'all',
    dateRange: '24h',
    path: '',
  });

  // Reference to virtual scroll container
  const parentRef = useRef<HTMLDivElement>(null);

  // Setup headless row virtualizer from @tanstack/react-virtual
  const rowVirtualizer = useVirtualizer({
    count: logs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
    overscan: 12,
  });

  // Load more logs via cursor-based pagination
  const loadMoreLogs = useCallback(async () => {
    if (!pagination.hasMore || !pagination.nextCursor || isLoadingMore) return;

    setIsLoadingMore(true);
    try {
      const queryParams = new URLSearchParams({
        cursor: pagination.nextCursor,
        limit: '50',
      });
      if (filter.status !== 'all') queryParams.set('status', filter.status);
      if (filter.apiKeyId !== 'all') queryParams.set('apiKeyId', filter.apiKeyId);
      if (filter.dateRange !== 'all') queryParams.set('dateRange', filter.dateRange);
      if (filter.path.trim()) queryParams.set('path', filter.path.trim());

      const res = await fetch(`/api/logs?${queryParams.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch next log page');

      const data = await res.json();
      setLogs((prev) => [...prev, ...data.logs]);
      setPagination(data.pagination);
    } catch (err) {
      console.error('[LogViewerTable loadMore error]:', err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [pagination, isLoadingMore, filter]);

  // Check scroll position to trigger cursor pagination infinite loading
  const virtualItems = rowVirtualizer.getVirtualItems();
  const lastItem = virtualItems[virtualItems.length - 1];

  useEffect(() => {
    if (!lastItem) return;
    if (
      lastItem.index >= logs.length - 4 &&
      pagination.hasMore &&
      !isLoadingMore
    ) {
      loadMoreLogs();
    }
  }, [lastItem, logs.length, pagination.hasMore, isLoadingMore, loadMoreLogs]);

  // Re-fetch when filters change
  const isFirstMount = useRef(true);
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }

    const timer = setTimeout(async () => {
      const queryParams = new URLSearchParams({ limit: '50' });
      if (filter.status !== 'all') queryParams.set('status', filter.status);
      if (filter.apiKeyId !== 'all') queryParams.set('apiKeyId', filter.apiKeyId);
      if (filter.dateRange !== 'all') queryParams.set('dateRange', filter.dateRange);
      if (filter.path.trim()) queryParams.set('path', filter.path.trim());

      try {
        const res = await fetch(`/api/logs?${queryParams.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setLogs(data.logs);
          setPagination(data.pagination);
          // Reset scroll position to top
          if (parentRef.current) {
            parentRef.current.scrollTop = 0;
          }
        }
      } catch (err) {
        console.error('[LogViewer filter error]:', err);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [filter]);

  // Server-Sent Events (SSE) listener for Real-time mode
  useEffect(() => {
    if (!isRealTime) return;

    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource('/api/logs/stream');

      eventSource.onmessage = (event) => {
        try {
          if (!event.data || event.data.startsWith(':')) return;
          const incoming: RequestLogItem = JSON.parse(event.data);

          // Apply client-side filter matching to incoming live events
          if (filter.status !== 'all') {
            const family = `${Math.floor(incoming.statusCode / 100)}xx`;
            if (filter.status !== family && filter.status !== String(incoming.statusCode)) return;
          }
          if (filter.apiKeyId !== 'all' && incoming.apiKeyId !== filter.apiKeyId) return;
          if (filter.path.trim() && !incoming.path.toLowerCase().includes(filter.path.trim().toLowerCase())) return;

          // Prepend incoming log to top of the virtualized dataset
          setLogs((prev) => [incoming, ...prev]);
        } catch {
          // Swallow heartbeat or malformed frames
        }
      };

      eventSource.onerror = () => {
        // EventSource will automatically attempt reconnection
      };
    } catch (sseErr) {
      console.warn('[SSE Connection Warning]:', sseErr);
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [isRealTime, filter]);

  return (
    <div className="space-y-4">
      {/* Interactive Filter Bar */}
      <LogFilterBar
        filter={filter}
        onFilterChange={setFilter}
        apiKeys={apiKeys}
        isRealTime={isRealTime}
        onToggleRealTime={() => setIsRealTime(!isRealTime)}
        totalLoaded={logs.length}
      />

      {/* Main Virtualized Table Card */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl overflow-hidden flex flex-col">
        {/* Fixed Table Header */}
        <div className="grid grid-cols-12 gap-3 px-6 py-3.5 bg-slate-950/80 border-b border-slate-800 text-[11px] font-mono uppercase text-slate-400 font-bold select-none">
          <div className="col-span-2">Timestamp</div>
          <div className="col-span-1">Status</div>
          <div className="col-span-1">Method</div>
          <div className="col-span-4">Path</div>
          <div className="col-span-1">Latency</div>
          <div className="col-span-1">Client IP</div>
          <div className="col-span-2 text-right">API Key</div>
        </div>

        {/* Scrollable Virtual Viewport */}
        <div
          ref={parentRef}
          className="h-[560px] overflow-y-auto relative divide-y divide-slate-800/40 select-text"
        >
          {logs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8">
              <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-slate-400 mb-3">
                <CheckCircle2 className="w-6 h-6 text-sky-400" />
              </div>
              <h4 className="text-slate-200 font-semibold text-sm">No Logs Matching Filter</h4>
              <p className="text-slate-400 text-xs mt-1 max-w-sm">
                Try widening your status or date range filters, or trigger a test request via the gateway proxy.
              </p>
            </div>
          ) : (
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {virtualItems.map((virtualRow) => {
                const log = logs[virtualRow.index];
                if (!log) return null;

                return (
                  <div
                    key={log.id || virtualRow.index}
                    onClick={() => setSelectedLog(log)}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    className="grid grid-cols-12 gap-3 px-6 items-center text-xs hover:bg-slate-800/40 cursor-pointer transition-colors border-b border-slate-800/40"
                  >
                    {/* Timestamp */}
                    <div className="col-span-2 font-mono text-[11px] text-slate-400 flex items-center gap-1.5 truncate">
                      <Clock className="w-3 h-3 text-slate-500 shrink-0" />
                      <span>{formatTime(log.timestamp)}</span>
                    </div>

                    {/* Status Badge */}
                    <div className="col-span-1">
                      <StatusBadge statusCode={log.statusCode} size="sm" />
                    </div>

                    {/* Method */}
                    <div className="col-span-1">
                      <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-950 text-slate-300 border border-slate-800">
                        {log.method}
                      </span>
                    </div>

                    {/* Path */}
                    <div className="col-span-4 font-mono text-xs text-slate-200 truncate" title={log.path}>
                      {log.path}
                    </div>

                    {/* Latency */}
                    <div className="col-span-1 font-mono text-xs text-slate-300">
                      {log.responseTimeMs} ms
                    </div>

                    {/* Client IP */}
                    <div className="col-span-1 font-mono text-[11px] text-slate-400 truncate" title={log.ipAddress}>
                      {log.ipAddress}
                    </div>

                    {/* API Key */}
                    <div className="col-span-2 text-right truncate" title={log.apiKeyName || 'Unauthenticated'}>
                      <span className="text-xs text-slate-300 font-medium">
                        {log.apiKeyName || <span className="text-slate-500 italic">Unauth</span>}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Loading indicator on bottom scroll */}
          {isLoadingMore && (
            <div className="p-3 text-center text-xs text-sky-400 bg-slate-950/80 flex items-center justify-center gap-2 font-mono">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Fetching next cursor page...</span>
            </div>
          )}
        </div>

        {/* Footer Status Bar */}
        <div className="px-6 py-2.5 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between text-[11px] font-mono text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Virtualized Viewport Active</span>
          </div>
          <div className="flex items-center gap-4">
            {pagination.hasMore && (
              <span className="flex items-center gap-1 text-slate-400">
                <ArrowDownCircle className="w-3.5 h-3.5" />
                <span>Scroll down to auto-load</span>
              </span>
            )}
            <span>Rendered Rows: {virtualItems.length} (Total in memory: {logs.length.toLocaleString()})</span>
          </div>
        </div>
      </div>

      {/* Slide-out Detail Inspection Drawer */}
      <LogDetailPanel log={selectedLog} onClose={() => setSelectedLog(null)} />
    </div>
  );
}
