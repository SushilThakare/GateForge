'use client';

/**
 * @file packages/dashboard/src/components/logs/LogDetailPanel.tsx
 * @description Slide-out drawer panel displaying detailed metadata, diagnostic timing,
 * and client credentials for a selected request log entry.
 */

import React, { useState } from 'react';
import { X, Copy, Check, ShieldCheck, Clock, Globe, Laptop, Terminal } from 'lucide-react';
import { RequestLogDetail } from '../../types/logs';
import { StatusBadge } from './StatusBadge';

export interface LogDetailPanelProps {
  log: RequestLogDetail | null;
  onClose: () => void;
}

export function LogDetailPanel({ log, onClose }: LogDetailPanelProps): JSX.Element | null {
  const [copiedJson, setCopiedJson] = useState<boolean>(false);

  if (!log) return null;

  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(log, null, 2));
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 2000);
    } catch {
      // Ignore clipboard write failure
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-lg bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
          {/* Header */}
          <div className="p-6 border-b border-slate-800 flex items-start justify-between bg-slate-950/60">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700">
                  {log.method}
                </span>
                <StatusBadge statusCode={log.statusCode} size="md" />
              </div>
              <h3 className="font-mono text-sm font-semibold text-slate-100 break-all pt-1">
                {log.path}
              </h3>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
            {/* KPI Summary Cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-medium mb-1">
                  <Clock className="w-3.5 h-3.5 text-sky-400" />
                  <span>Response Time</span>
                </div>
                <div className="font-mono text-lg font-bold text-slate-100">
                  {log.responseTimeMs} ms
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-medium mb-1">
                  <Globe className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Client IP</span>
                </div>
                <div className="font-mono text-sm font-semibold text-slate-200 truncate" title={log.ipAddress}>
                  {log.ipAddress}
                </div>
              </div>
            </div>

            {/* Client Identity & API Key */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-semibold text-slate-200">
                  <ShieldCheck className="w-4 h-4 text-sky-400" />
                  <span>Client Authentication</span>
                </div>
                <span className="font-mono text-[10px] text-slate-400">
                  {log.apiKeyId ? 'Authenticated' : 'Public / Unauth'}
                </span>
              </div>

              <div className="space-y-2 pt-1 border-t border-slate-800/80 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-400">API Key Name:</span>
                  <span className="font-semibold text-slate-200">
                    {log.apiKeyName || <span className="text-slate-400 italic">None</span>}
                  </span>
                </div>
                {log.apiKeyId && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Key ID:</span>
                    <span className="font-mono text-slate-300 truncate max-w-[200px]" title={log.apiKeyId}>
                      {log.apiKeyId}
                    </span>
                  </div>
                )}
                {log.apiKey?.scopes && (
                  <div className="flex justify-between items-center pt-1">
                    <span className="text-slate-400">Scopes:</span>
                    <div className="flex gap-1">
                      {log.apiKey.scopes.map((s) => (
                        <span key={s} className="px-1.5 py-0.5 rounded font-mono text-[9px] bg-slate-800 text-slate-300">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Request Telemetry Details */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
              <div className="flex items-center gap-2 font-semibold text-slate-200">
                <Laptop className="w-4 h-4 text-purple-400" />
                <span>Request Telemetry</span>
              </div>

              <div className="space-y-2 pt-1 border-t border-slate-800/80 text-[11px]">
                <div>
                  <span className="text-slate-400 block mb-0.5">Timestamp:</span>
                  <span className="font-mono text-slate-200">
                    {new Date(log.timestamp).toUTCString()} ({log.timestamp})
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">User Agent:</span>
                  <span className="font-mono text-slate-300 break-all text-[10px]">
                    {log.userAgent || 'unknown'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">Unique Log ID:</span>
                  <span className="font-mono text-slate-400 text-[10px] select-all">
                    {log.id}
                  </span>
                </div>
              </div>
            </div>

            {/* Raw JSON Payload */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-semibold text-slate-200">
                  <Terminal className="w-4 h-4 text-amber-400" />
                  <span>Raw JSON Record</span>
                </div>
                <button
                  onClick={handleCopyJson}
                  className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono transition-colors"
                >
                  {copiedJson ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy JSON</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-[10px] font-mono text-slate-300 overflow-x-auto max-h-48">
                {JSON.stringify(log, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
