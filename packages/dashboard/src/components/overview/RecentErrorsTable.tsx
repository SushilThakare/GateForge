'use client';

/**
 * @file packages/dashboard/src/components/overview/RecentErrorsTable.tsx
 * @description Recent errors table using Tremor Table primitives for the GateForge Dashboard.
 * Displays the last 10 failed requests (statusCode >= 400) with diagnostic metadata.
 */

import React from 'react';
import {
  Card,
  Title,
  Text,
  Table,
  TableHead,
  TableRow,
  TableHeaderCell,
  TableBody,
  TableCell,
  Badge,
  Flex,
} from '@tremor/react';
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
 * @returns {JSX.Element} Rendered Tremor Table card
 */
export function RecentErrorsTable({ errors }: RecentErrorsTableProps): JSX.Element {
  const hasErrors = errors && errors.length > 0;

  return (
    <Card className="bg-slate-900/90 border border-slate-800 shadow-lg">
      <Flex justifyContent="between" alignItems="center" className="mb-4">
        <div>
          <Title className="text-slate-100 font-bold text-lg">
            Recent Errors (Last 10 Failures)
          </Title>
          <Text className="text-slate-400 text-xs">
            Live diagnostic stream of 4xx client errors and 5xx upstream failures
          </Text>
        </div>
        <Badge size="sm" color={hasErrors ? 'rose' : 'emerald'}>
          {hasErrors ? `${errors.length} recent logged` : '0 errors'}
        </Badge>
      </Flex>

      {!hasErrors ? (
        <div className="py-12 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-3">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h4 className="text-slate-200 font-semibold text-sm">All Systems Operational</h4>
          <p className="text-slate-400 text-xs max-w-sm mt-1">
            No 4xx or 5xx request failures recorded in the current telemetry window.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table className="mt-2">
            <TableHead>
              <TableRow className="border-b border-slate-800">
                <TableHeaderCell className="text-slate-400 font-mono text-xs uppercase">Timestamp</TableHeaderCell>
                <TableHeaderCell className="text-slate-400 font-mono text-xs uppercase">Method &amp; Path</TableHeaderCell>
                <TableHeaderCell className="text-slate-400 font-mono text-xs uppercase">Status</TableHeaderCell>
                <TableHeaderCell className="text-slate-400 font-mono text-xs uppercase">Latency</TableHeaderCell>
                <TableHeaderCell className="text-slate-400 font-mono text-xs uppercase">Client IP</TableHeaderCell>
                <TableHeaderCell className="text-slate-400 font-mono text-xs uppercase">API Key</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {errors.map((err) => {
                const is5xx = err.statusCode >= 500;
                const statusColor = is5xx ? 'rose' : 'amber';

                return (
                  <TableRow key={err.id} className="border-b border-slate-800/60 hover:bg-slate-800/30 transition-colors">
                    <TableCell className="font-mono text-xs text-slate-300">
                      {formatDateTime(err.timestamp)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                          {err.method}
                        </span>
                        <span className="font-mono text-xs text-slate-200 truncate max-w-xs" title={err.path}>
                          {err.path}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge size="xs" color={statusColor}>
                        {err.statusCode}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-300">
                      {err.responseTimeMs} ms
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-400">
                      {err.ipAddress}
                    </TableCell>
                    <TableCell className="text-xs text-slate-300 font-medium">
                      {err.apiKeyName || <span className="text-slate-400 italic">Unauthenticated</span>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}
