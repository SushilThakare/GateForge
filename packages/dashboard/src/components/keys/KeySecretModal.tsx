'use client';

/**
 * @file packages/dashboard/src/components/keys/KeySecretModal.tsx
 * @description One-time secret reveal modal dialog for newly provisioned or rotated API keys.
 * Emphasizes zero-knowledge storage principles: the secret cannot be retrieved once dismissed.
 */

import React, { useState } from 'react';
import { Copy, Check, AlertTriangle, ShieldCheck } from 'lucide-react';
import { ApiKeyItem } from '../../types/keys';

/**
 * Props for KeySecretModal
 */
export interface KeySecretModalProps {
  isOpen: boolean;
  apiKeySecret: string;
  keyDetails: ApiKeyItem | null;
  onClose: () => void;
}

/**
 * Modal dialog presenting the unmasked plaintext API key once.
 * 
 * @param {KeySecretModalProps} props - Modal open state, raw secret, metadata, and close callback
 * @returns {JSX.Element | null} Rendered modal dialog
 */
export function KeySecretModal({
  isOpen,
  apiKeySecret,
  keyDetails,
  onClose,
}: KeySecretModalProps): JSX.Element | null {
  const [copied, setCopied] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(apiKeySecret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl shadow-black/90 overflow-hidden flex flex-col">
        {/* Security Warning Banner */}
        <div className="p-4 bg-amber-500/10 border-b border-amber-500/20 text-amber-300 text-xs flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0 text-amber-400" />
          <div>
            <span className="font-bold">One-Time Secret Revelation:</span> Please copy and store this API key now.
            For security, it is stored hashed in the control plane and will <span className="underline font-semibold">never</span> be displayed again.
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5">
          <div>
            <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              API Key Generated Successfully
            </h3>
            {keyDetails && (
              <p className="text-xs text-slate-400 mt-1">
                Credential assigned to <span className="font-semibold text-slate-200">{keyDetails.name}</span> with quota{' '}
                <span className="font-mono text-sky-400">{keyDetails.rateLimit} req/min</span>.
              </p>
            )}
          </div>

          {/* Copyable Key Monospace Box */}
          <div className="space-y-2">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 font-mono">
              Secret API Key
            </label>
            <div className="flex items-center gap-2 p-3 rounded-xl bg-slate-950 border border-slate-800 focus-within:border-sky-500 transition-colors">
              <input
                type="text"
                readOnly
                value={apiKeySecret}
                className="w-full bg-transparent font-mono text-xs text-emerald-400 tracking-wide outline-none select-all"
              />
              <button
                onClick={handleCopy}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 ${
                  copied
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30'
                }`}
                title="Copy API key to clipboard"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Scopes Overview */}
          {keyDetails?.scopes && (
            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-xs">
              <span className="text-slate-400 text-[11px] uppercase tracking-wider font-mono block mb-1.5">
                Granted Scopes
              </span>
              <div className="flex flex-wrap gap-1.5">
                {keyDetails.scopes.map((scope) => (
                  <span
                    key={scope}
                    className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700"
                  >
                    {scope}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Footer Action */}
          <div className="pt-3 border-t border-slate-800 flex justify-end">
            <button
              onClick={onClose}
              className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-bold transition-all shadow-md shadow-emerald-500/20"
            >
              I Have Securely Saved This Key
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
