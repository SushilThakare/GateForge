'use client';

/**
 * @file packages/dashboard/src/components/keys/EditRateLimitModal.tsx
 * @description Modal dialog component for editing an API key's rate limit quota
 * with an interactive slider and numeric feedback.
 */

import React, { useState, useEffect } from 'react';
import { X, Sliders, Loader2 } from 'lucide-react';
import { ApiKeyItem } from '../../types/keys';

/**
 * Props for EditRateLimitModal
 */
export interface EditRateLimitModalProps {
  isOpen: boolean;
  apiKey: ApiKeyItem | null;
  onClose: () => void;
  onSave: (id: string, newRateLimit: number) => Promise<void>;
}

/**
 * Modal dialog for modifying rate limit quotas.
 * 
 * @param {EditRateLimitModalProps} props - Modal open state, target key, close callback, and save handler
 * @returns {JSX.Element | null} Rendered modal dialog
 */
export function EditRateLimitModal({
  isOpen,
  apiKey,
  onClose,
  onSave,
}: EditRateLimitModalProps): JSX.Element | null {
  const [rateLimit, setRateLimit] = useState<number>(100);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (apiKey) {
      setRateLimit(apiKey.rateLimit);
    }
  }, [apiKey]);

  if (!isOpen || !apiKey) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      await onSave(apiKey.id, rateLimit);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update rate limit');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl shadow-black/80 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">Edit Rate Limit</h3>
              <p className="text-xs text-slate-400">Update request quota for {apiKey.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
              {error}
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Allowed Throughput
              </label>
              <span className="font-mono text-sm font-bold px-2.5 py-1 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
                {rateLimit.toLocaleString()} req / min
              </span>
            </div>
            <input
              type="range"
              min={10}
              max={3000}
              step={10}
              value={rateLimit}
              onChange={(e) => setRateLimit(Number(e.target.value))}
              disabled={isSubmitting}
              className="w-full accent-sky-400 bg-slate-800 rounded-lg cursor-pointer h-2"
            />
            <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-mono">
              <span>10 req/min</span>
              <span>1,500 req/min</span>
              <span>3,000 req/min</span>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold transition-all shadow-md shadow-sky-500/20 flex items-center gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save Changes</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
