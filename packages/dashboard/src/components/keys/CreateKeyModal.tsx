'use client';

/**
 * @file packages/dashboard/src/components/keys/CreateKeyModal.tsx
 * @description Modal dialog component for creating new API keys with controlled inputs
 * for key name, multi-select scopes, and interactive rate limit slider.
 */

import React, { useState } from 'react';
import { X, ShieldAlert, KeyRound, Loader2 } from 'lucide-react';
import { ApiKeyScope, CreateApiKeyPayload } from '../../types/keys';

/**
 * Props for CreateKeyModal
 */
export interface CreateKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateApiKeyPayload) => Promise<void>;
}

const AVAILABLE_SCOPES = [
  {
    scope: ApiKeyScope.READ,
    label: 'READ',
    description: 'Allows querying telemetry logs, metrics, and proxying read requests.',
  },
  {
    scope: ApiKeyScope.WRITE,
    label: 'WRITE',
    description: 'Allows executing state-modifying requests through downstream proxy routes.',
  },
  {
    scope: ApiKeyScope.ADMIN,
    label: 'ADMIN',
    description: 'Full administrative access to manage API keys, quotas, and system settings.',
  },
];

/**
 * Controlled modal form component for provisioning an API key.
 * 
 * @param {CreateKeyModalProps} props - Modal open state, close callback, and submit handler
 * @returns {JSX.Element | null} Rendered modal dialog
 */
export function CreateKeyModal({ isOpen, onClose, onSubmit }: CreateKeyModalProps): JSX.Element | null {
  const [name, setName] = useState<string>('');
  const [scopes, setScopes] = useState<ApiKeyScope[]>([ApiKeyScope.READ]);
  const [rateLimit, setRateLimit] = useState<number>(100);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const toggleScope = (scope: ApiKeyScope) => {
    if (scopes.includes(scope)) {
      // Prevent unselecting all scopes
      if (scopes.length === 1) return;
      setScopes(scopes.filter((s) => s !== scope));
    } else {
      setScopes([...scopes, scope]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMessage('Please provide a key name or service identifier.');
      return;
    }

    if (scopes.length === 0) {
      setErrorMessage('At least one permission scope must be selected.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await onSubmit({
        name: name.trim(),
        scopes,
        rateLimit,
      });
      // Reset state upon successful submission
      setName('');
      setScopes([ApiKeyScope.READ]);
      setRateLimit(100);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to create key');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl shadow-black/80 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">Create New API Key</h2>
              <p className="text-xs text-slate-400">Generate secure credentials for downstream client services</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {errorMessage && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Key Name Input */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
              Key Name / Description
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Billing Worker, Mobile Client, Internal Tool"
              disabled={isSubmitting}
              className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
            />
          </div>

          {/* Scopes Multi-select */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
              Permission Scopes
            </label>
            <div className="space-y-2">
              {AVAILABLE_SCOPES.map(({ scope, label, description }) => {
                const isSelected = scopes.includes(scope);
                return (
                  <div
                    key={scope}
                    onClick={() => !isSubmitting && toggleScope(scope)}
                    className={`p-3 rounded-xl border text-xs cursor-pointer transition-all flex items-start gap-3 ${
                      isSelected
                        ? 'bg-sky-500/10 border-sky-500/40 text-slate-200'
                        : 'bg-slate-950/60 border-slate-800/80 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}}
                      className="mt-0.5 rounded border-slate-700 text-sky-500 focus:ring-sky-500 bg-slate-900"
                    />
                    <div>
                      <div className="font-semibold text-slate-100 flex items-center gap-2">
                        <span>{label}</span>
                        {scope === ApiKeyScope.ADMIN && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                            Elevated
                          </span>
                        )}
                      </div>
                      <p className="text-slate-400 text-[11px] mt-0.5">{description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Rate Limit Slider */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Rate Limit Quota
              </label>
              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
                {rateLimit.toLocaleString()} req / min
              </span>
            </div>
            <input
              type="range"
              min={10}
              max={2000}
              step={10}
              value={rateLimit}
              onChange={(e) => setRateLimit(Number(e.target.value))}
              disabled={isSubmitting}
              className="w-full accent-sky-400 bg-slate-800 rounded-lg cursor-pointer h-2"
            />
            <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-mono">
              <span>10 req/min (Strict)</span>
              <span>1,000 req/min (Standard)</span>
              <span>2,000 req/min (High)</span>
            </div>
          </div>

          {/* Actions */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-sm font-bold transition-all shadow-md shadow-sky-500/20 flex items-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Generating...</span>
                </>
              ) : (
                <span>Generate API Key</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
