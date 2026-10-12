'use client';

/**
 * @file packages/dashboard/src/components/anomalies/AnomalyReportCard.tsx
 * @description Expandable timeline card component rendering an AI Anomaly Report.
 * Displays overall risk, summary text, and an expandable list of detected anomalies
 * with severity badges, descriptions, quantitative evidence, and recommended actions.
 */

import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Clock,
  Terminal,
  Lightbulb,
  CheckCircle2,
  AlertTriangle,
  Layers,
} from 'lucide-react';
import { AnomalyItem, AnomalyReportItem } from '../../types/anomalies';
import { SeverityBadge } from './SeverityBadge';
import { RiskLevelBadge } from './RiskLevelBadge';

export interface AnomalyReportCardProps {
  report: AnomalyReportItem;
  defaultExpanded?: boolean;
}

/**
 * Formats a Date window into a compact readable string.
 */
function formatWindow(startIso: string, endIso: string): string {
  try {
    const start = new Date(startIso);
    const end = new Date(endIso);
    const dateStr = start.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
    const startTime = start.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
    const endTime = end.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${dateStr}, ${startTime} – ${endTime}`;
  } catch {
    return `${startIso} – ${endIso}`;
  }
}

/**
 * Formats a friendly label for AnomalyType enums.
 */
function formatAnomalyType(type: string): string {
  switch (type) {
    case 'TRAFFIC_SPIKE':
      return 'Traffic Spike';
    case 'HIGH_ERROR_RATE':
      return 'High Error Rate';
    case 'DDOS_PATTERN':
      return 'Potential DDoS Pattern';
    case 'RESPONSE_DEGRADATION':
      return 'Response Time Degradation';
    case 'UNUSUAL_ENDPOINT':
      return 'Unusual Endpoint Access';
    default:
      return type.replace(/_/g, ' ');
  }
}

/**
 * Card component presenting a single 1-hour traffic anomaly report.
 *
 * @param {AnomalyReportCardProps} props - Report data and expansion state
 * @returns {JSX.Element} Rendered card
 */
export function AnomalyReportCard({
  report,
  defaultExpanded = true,
}: AnomalyReportCardProps): JSX.Element {
  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded);

  const anomalyCount = report.anomalies.length;
  const isHealthy = anomalyCount === 0;

  return (
    <div
      className={`rounded-xl border transition-all duration-200 overflow-hidden ${
        report.overallRisk === 'CRITICAL'
          ? 'bg-slate-900/90 border-rose-900/60 shadow-lg shadow-rose-950/20'
          : report.overallRisk === 'HIGH'
          ? 'bg-slate-900/90 border-amber-900/50 shadow-md shadow-amber-950/15'
          : 'bg-slate-900/80 border-slate-800 hover:border-slate-700/80'
      }`}
    >
      {/* Header Bar */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="p-5 cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4 select-none hover:bg-slate-800/30 transition-colors"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsExpanded(!isExpanded);
          }
        }}
        aria-expanded={isExpanded}
      >
        <div className="space-y-2 flex-1">
          {/* Metadata Row: Window, Timestamp, Risk Badge */}
          <div className="flex flex-wrap items-center gap-3">
            <RiskLevelBadge risk={report.overallRisk} />

            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <span>{formatWindow(report.windowStart, report.windowEnd)}</span>
            </div>

            <div className="text-xs text-slate-400 font-mono">
              Reported: {new Date(report.createdAt).toLocaleTimeString()}
            </div>

            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                isHealthy
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-slate-800 text-slate-300 border border-slate-700'
              }`}
            >
              {isHealthy ? 'Healthy (0 Anomalies)' : `${anomalyCount} Anomaly${anomalyCount > 1 ? 'ies' : ''}`}
            </span>
          </div>

          {/* Executive Summary */}
          <p className="text-sm font-medium text-slate-200 leading-relaxed pr-2">
            {report.summary}
          </p>
        </div>

        {/* Expand / Collapse Action */}
        <div className="flex items-center gap-2 self-end md:self-center text-xs font-semibold text-sky-400 hover:text-sky-300">
          <span>{isExpanded ? 'Collapse' : 'View Details'}</span>
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </div>

      {/* Expandable Anomalies Section */}
      {isExpanded && (
        <div className="border-t border-slate-800/80 bg-slate-950/40 p-5 space-y-4">
          {isHealthy ? (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-emerald-300 text-xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <div>
                <span className="font-semibold">Normal Baseline Traffic</span> — All request rates,
                response times, error rates, and client IP behaviors conformed to expected thresholds.
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-400 font-mono">
                <span className="flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-sky-400" />
                  Detected Anomalies ({anomalyCount})
                </span>
                <span className="text-[11px] text-slate-400">
                  Evaluated via GPT-4o-mini &amp; LangChain
                </span>
              </div>

              {/* Anomaly Cards List */}
              {report.anomalies.map((anomaly: AnomalyItem, index: number) => (
                <div
                  key={anomaly.id || index}
                  className="rounded-lg border border-slate-800 bg-slate-900/70 p-4 space-y-3.5 shadow-sm"
                >
                  {/* Anomaly Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <SeverityBadge severity={anomaly.severity} />
                      <span className="text-sm font-bold text-slate-100">
                        {formatAnomalyType(anomaly.type)}
                      </span>
                    </div>
                  </div>

                  {/* Plain English Description */}
                  <p className="text-sm text-slate-300 leading-relaxed">
                    {anomaly.description}
                  </p>

                  {/* Quantitative Evidence Box */}
                  <div className="rounded-lg bg-slate-950/80 border border-slate-800/90 p-3.5 space-y-1.5">
                    <div className="flex items-center gap-2 text-[11px] font-mono font-semibold uppercase tracking-wider text-sky-400">
                      <Terminal className="w-3.5 h-3.5" />
                      <span>Evidence &amp; Quantitative Telemetry</span>
                    </div>
                    <p className="text-xs font-mono text-slate-300 leading-relaxed whitespace-pre-wrap">
                      {anomaly.evidence}
                    </p>
                  </div>

                  {/* Recommended Mitigation Action */}
                  <div className="rounded-lg bg-indigo-950/30 border border-indigo-900/50 p-3.5 space-y-1.5">
                    <div className="flex items-center gap-2 text-[11px] font-mono font-semibold uppercase tracking-wider text-indigo-300">
                      <Lightbulb className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Recommended Action</span>
                    </div>
                    <p className="text-xs text-indigo-200 leading-relaxed">
                      {anomaly.recommendation}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
