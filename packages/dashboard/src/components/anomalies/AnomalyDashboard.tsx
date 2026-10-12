'use client';

/**
 * @file packages/dashboard/src/components/anomalies/AnomalyDashboard.tsx
 * @description Main interactive client component for the AI Anomaly Detection dashboard.
 * Manages client-side filter state (severity, date range, search text), connects to
 * the Next.js BFF API route (/api/anomalies), and handles on-demand analysis triggers.
 */

import React, { useState, useTransition, useMemo } from 'react';
import { AnomalyListResponse, AnomalyReportItem, AnomalyStatusMeta } from '../../types/anomalies';
import { AnomalyStatusBanner } from './AnomalyStatusBanner';
import { AnomalyFilterBar } from './AnomalyFilterBar';
import { AnomalyReportCard } from './AnomalyReportCard';
import { ShieldCheck, AlertCircle, RefreshCw } from 'lucide-react';

export interface AnomalyDashboardProps {
  initialData: AnomalyListResponse;
}

/**
 * Anomaly Detection Dashboard Client Component.
 *
 * @param {AnomalyDashboardProps} props - Initial server-fetched dataset
 * @returns {JSX.Element} Interactive anomalies view
 */
export function AnomalyDashboard({ initialData }: AnomalyDashboardProps): JSX.Element {
  const [reports, setReports] = useState<AnomalyReportItem[]>(initialData.reports);
  const [status, setStatus] = useState<AnomalyStatusMeta>(initialData.status);

  // Filter & Search states
  const [selectedSeverity, setSelectedSeverity] = useState<string>('ALL');
  const [selectedDateRange, setSelectedDateRange] = useState<string>('24h');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Async execution states
  const [isPending, startTransition] = useTransition();
  const [isTriggering, setIsTriggering] = useState<boolean>(false);
  const [triggerMessage, setTriggerMessage] = useState<string | null>(null);
  const [triggerError, setTriggerError] = useState<string | null>(null);

  /**
   * Refetches reports from the BFF endpoint based on current active filters.
   */
  const fetchFilteredReports = async (
    severity: string = selectedSeverity,
    dateRange: string = selectedDateRange
  ): Promise<void> => {
    try {
      const params = new URLSearchParams();
      if (severity !== 'ALL') params.set('severity', severity);
      if (dateRange !== 'all') params.set('dateRange', dateRange);

      const res = await fetch(`/api/anomalies?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch anomalies (HTTP ${res.status})`);
      }

      const data: AnomalyListResponse = await res.json();
      startTransition(() => {
        setReports(data.reports);
        setStatus(data.status);
      });
    } catch (err: unknown) {
      console.error('[AnomalyDashboard] Failed to refresh anomalies:', err);
    }
  };

  /**
   * Handles user severity filter selection.
   */
  const handleSeverityChange = (newSeverity: string): void => {
    setSelectedSeverity(newSeverity);
    fetchFilteredReports(newSeverity, selectedDateRange);
  };

  /**
   * Handles user date range filter selection.
   */
  const handleDateRangeChange = (newDateRange: string): void => {
    setSelectedDateRange(newDateRange);
    fetchFilteredReports(selectedSeverity, newDateRange);
  };

  /**
   * Triggers an immediate AI traffic analysis run on the background worker.
   */
  const handleRunAnalysis = async (): Promise<void> => {
    setIsTriggering(true);
    setTriggerMessage(null);
    setTriggerError(null);

    try {
      const res = await fetch('/api/anomalies/run', {
        method: 'POST',
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || `Trigger failed with HTTP ${res.status}`);
      }

      const data = await res.json();
      setTriggerMessage(
        data.message || 'Analysis initiated successfully! The worker is evaluating traffic telemetry.'
      );

      // Re-fetch reports after a brief interval to reflect fresh results
      setTimeout(() => {
        fetchFilteredReports(selectedSeverity, selectedDateRange);
      }, 3000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setTriggerError(message);
    } finally {
      setIsTriggering(false);
    }
  };

  /**
   * Client-side search filtering across summary text, anomaly descriptions, and evidence.
   */
  const displayedReports = useMemo(() => {
    if (!searchQuery.trim()) return reports;
    const q = searchQuery.toLowerCase();

    return reports.filter((report) => {
      const matchSummary = report.summary.toLowerCase().includes(q);
      const matchAnomalies = report.anomalies.some(
        (a) =>
          a.description.toLowerCase().includes(q) ||
          a.evidence.toLowerCase().includes(q) ||
          a.type.toLowerCase().includes(q) ||
          a.recommendation.toLowerCase().includes(q)
      );
      return matchSummary || matchAnomalies;
    });
  }, [reports, searchQuery]);

  return (
    <div className="space-y-6">
      {/* 1. Status Indicator & Trigger Banner */}
      <section aria-label="Anomaly Detection Status">
        <AnomalyStatusBanner
          status={status}
          isRunning={isTriggering}
          triggerMessage={triggerMessage}
          triggerError={triggerError}
          onRunAnalysis={handleRunAnalysis}
        />
      </section>

      {/* 2. Filter Bar (Severity, Date Range, Search) */}
      <section aria-label="Anomaly Filters">
        <AnomalyFilterBar
          selectedSeverity={selectedSeverity}
          selectedDateRange={selectedDateRange}
          searchQuery={searchQuery}
          isLoading={isPending}
          onSeverityChange={handleSeverityChange}
          onDateRangeChange={handleDateRangeChange}
          onSearchChange={setSearchQuery}
          onRefresh={() => fetchFilteredReports(selectedSeverity, selectedDateRange)}
        />
      </section>

      {/* 3. Timeline of Anomaly Reports */}
      <section aria-label="Anomaly Reports Timeline" className="space-y-4">
        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-400 font-mono px-1">
          <span>Timeline (Most Recent First)</span>
          <span>Showing {displayedReports.length} Reports</span>
        </div>

        {displayedReports.length === 0 ? (
          <div className="p-12 text-center rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
              <ShieldCheck className="w-6 h-6 text-emerald-400" />
            </div>
            <h3 className="text-sm font-semibold text-slate-200">No Anomaly Reports Found</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              No anomaly reports matched your active filter criteria ({selectedSeverity} severity in{' '}
              {selectedDateRange}). All gateway traffic remained within normal boundaries.
            </p>
          </div>
        ) : (
          displayedReports.map((report: AnomalyReportItem) => (
            <AnomalyReportCard key={report.id} report={report} defaultExpanded={true} />
          ))
        )}
      </section>
    </div>
  );
}
