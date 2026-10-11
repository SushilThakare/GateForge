'use client';

/**
 * @file packages/dashboard/src/components/keys/ApiKeyTable.tsx
 * @description Interactive API key management table component for GateForge Dashboard.
 * Displays key metadata, status, 7-day usage sparkline, and supports optimistic UI mutations
 * (Revoke, Rotate, Edit Rate Limit, and Create Key).
 */

import React, { useState } from 'react';
import {
  Card,
  Table,
  TableHead,
  TableRow,
  TableHeaderCell,
  TableBody,
  TableCell,
  Badge,
  SparkAreaChart,
  Flex,
} from '@tremor/react';
import {
  Plus,
  KeyRound,
  RotateCw,
  Ban,
  Pencil,
  Clock,
  Search,
} from 'lucide-react';
import {
  ApiKeyItem,
  ApiKeyScope,
  CreateApiKeyPayload,
  CreateApiKeyResponse,
  RotateApiKeyResponse,
} from '../../types/keys';
import { CreateKeyModal } from './CreateKeyModal';
import { KeySecretModal } from './KeySecretModal';
import { EditRateLimitModal } from './EditRateLimitModal';

/**
 * Props for ApiKeyTable component
 */
export interface ApiKeyTableProps {
  initialKeys: ApiKeyItem[];
}

/**
 * Formats date into relative human readable string (e.g. "5m ago", "2d ago", "Never used")
 */
function formatLastUsed(dateStr: string | null): string {
  if (!dateStr) return 'Never used';
  try {
    const timestamp = new Date(dateStr).getTime();
    const now = Date.now();
    const diffSec = Math.floor((now - timestamp) / 1000);

    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return `${Math.floor(diffSec / 86400)}d ago`;
  } catch {
    return 'Unknown';
  }
}

/**
 * Formats created timestamp into readable date
 */
function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

/**
 * ApiKeyTable component with optimistic mutation handling.
 * 
 * @param {ApiKeyTableProps} props - Initial API keys array from Server Component
 * @returns {JSX.Element} Rendered table and modal controllers
 */
export function ApiKeyTable({ initialKeys }: ApiKeyTableProps): JSX.Element {
  const [keys, setKeys] = useState<ApiKeyItem[]>(initialKeys);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modal dialog states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [isSecretModalOpen, setIsSecretModalOpen] = useState<boolean>(false);
  const [revealedSecret, setRevealedSecret] = useState<string>('');
  const [revealedKeyDetails, setRevealedKeyDetails] = useState<ApiKeyItem | null>(null);

  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [editingKey, setEditingKey] = useState<ApiKeyItem | null>(null);

  // Optimistic UI Handler: Revoke Key
  const handleRevoke = async (keyToRevoke: ApiKeyItem) => {
    const confirmRevoke = window.confirm(
      `Are you sure you want to revoke key "${keyToRevoke.name}"? This action takes effect immediately and rejects all future client requests.`
    );
    if (!confirmRevoke) return;

    // 1. Snapshot previous state for rollback
    const previousKeys = [...keys];

    // 2. Optimistic UI update: instantly update UI state before network roundtrip completes
    setKeys((prev) =>
      prev.map((k) => (k.id === keyToRevoke.id ? { ...k, isActive: false } : k))
    );

    // 3. Sync with backend API
    try {
      const res = await fetch(`/api/keys/${keyToRevoke.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        throw new Error('Server rejected key revocation');
      }
    } catch (err) {
      // 4. Rollback immediately if API rejects request
      setKeys(previousKeys);
      alert(`Failed to revoke key: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Rotate Key Secret Handler
  const handleRotate = async (keyToRotate: ApiKeyItem) => {
    const confirmRotate = window.confirm(
      `Rotate secret for "${keyToRotate.name}"? The existing secret will be invalidated immediately.`
    );
    if (!confirmRotate) return;

    try {
      const res = await fetch(`/api/keys/${keyToRotate.id}/rotate`, {
        method: 'POST',
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ message: 'Rotation failed' }));
        throw new Error(errData.message || 'Rotation failed');
      }

      const data: RotateApiKeyResponse = await res.json();

      // Update local state timestamp
      setKeys((prev) =>
        prev.map((k) =>
          k.id === keyToRotate.id ? { ...k, updatedAt: data.keyDetails.updatedAt } : k
        )
      );

      // Reveal new secret once
      setRevealedSecret(data.newApiKey);
      setRevealedKeyDetails(keyToRotate);
      setIsSecretModalOpen(true);
    } catch (err) {
      alert(`Failed to rotate key: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Optimistic UI Handler: Edit Rate Limit
  const handleSaveRateLimit = async (id: string, newRateLimit: number) => {
    const previousKeys = [...keys];

    // Optimistically update rate limit in state
    setKeys((prev) =>
      prev.map((k) => (k.id === id ? { ...k, rateLimit: newRateLimit } : k))
    );

    try {
      const res = await fetch(`/api/keys/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rateLimit: newRateLimit }),
      });

      if (!res.ok) {
        throw new Error('Server rejected rate limit update');
      }
    } catch (err) {
      setKeys(previousKeys);
      throw err;
    }
  };

  // Create Key Handler
  const handleCreateKey = async (payload: CreateApiKeyPayload) => {
    const res = await fetch('/api/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({ message: 'Creation failed' }));
      throw new Error(errData.message || 'Key creation failed');
    }

    const data: CreateApiKeyResponse = await res.json();

    const newKeyItem: ApiKeyItem = {
      ...data.keyDetails,
      usage7d: [
        { date: 'Mon', requests: 0 },
        { date: 'Tue', requests: 0 },
        { date: 'Wed', requests: 0 },
        { date: 'Thu', requests: 0 },
        { date: 'Fri', requests: 0 },
        { date: 'Sat', requests: 0 },
        { date: 'Sun', requests: 0 },
      ],
      totalRequests7d: 0,
    };

    setKeys((prev) => [newKeyItem, ...prev]);
    setIsCreateModalOpen(false);
    setRevealedSecret(data.apiKey);
    setRevealedKeyDetails(newKeyItem);
    setIsSecretModalOpen(true);
  };

  // Filter keys by search input
  const filteredKeys = keys.filter(
    (k) =>
      k.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      k.key.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Top Bar with Search & Create Button */}
      <Flex justifyContent="between" alignItems="center" className="flex-col sm:flex-row gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search keys by name or prefix..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all"
          />
        </div>

        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs transition-all shadow-md shadow-sky-500/20"
        >
          <Plus className="w-4 h-4" />
          <span>Create API Key</span>
        </button>
      </Flex>

      {/* Main Table Card */}
      <Card className="bg-slate-900/90 border border-slate-800 shadow-xl overflow-hidden p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHead className="bg-slate-950/60 border-b border-slate-800">
              <TableRow>
                <TableHeaderCell className="text-slate-400 font-mono text-xs uppercase py-3.5 pl-6">
                  Key Details
                </TableHeaderCell>
                <TableHeaderCell className="text-slate-400 font-mono text-xs uppercase py-3.5">
                  Scopes
                </TableHeaderCell>
                <TableHeaderCell className="text-slate-400 font-mono text-xs uppercase py-3.5">
                  Rate Limit
                </TableHeaderCell>
                <TableHeaderCell className="text-slate-400 font-mono text-xs uppercase py-3.5">
                  Status
                </TableHeaderCell>
                <TableHeaderCell className="text-slate-400 font-mono text-xs uppercase py-3.5">
                  Usage (7 Days)
                </TableHeaderCell>
                <TableHeaderCell className="text-slate-400 font-mono text-xs uppercase py-3.5">
                  Activity
                </TableHeaderCell>
                <TableHeaderCell className="text-slate-400 font-mono text-xs uppercase py-3.5 pr-6 text-right">
                  Actions
                </TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredKeys.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-slate-400 text-xs">
                    No matching API keys found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredKeys.map((apiKey) => {
                  const sparklineData =
                    apiKey.usage7d && apiKey.usage7d.length > 0
                      ? apiKey.usage7d
                      : [
                          { date: 'Mon', requests: 0 },
                          { date: 'Tue', requests: 0 },
                          { date: 'Wed', requests: 0 },
                          { date: 'Thu', requests: 0 },
                          { date: 'Fri', requests: 0 },
                          { date: 'Sat', requests: 0 },
                          { date: 'Sun', requests: 0 },
                        ];

                  return (
                    <TableRow
                      key={apiKey.id}
                      className="border-b border-slate-800/60 hover:bg-slate-800/25 transition-colors"
                    >
                      {/* Name & Key */}
                      <TableCell className="pl-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                            apiKey.isActive
                              ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                              : 'bg-slate-800 text-slate-400 border border-slate-700'
                          }`}>
                            <KeyRound className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="font-semibold text-slate-100 text-sm">
                              {apiKey.name}
                            </div>
                            <div className="font-mono text-xs text-slate-400 tracking-wider">
                              {apiKey.key}
                            </div>
                          </div>
                        </div>
                      </TableCell>

                      {/* Scopes */}
                      <TableCell className="py-4">
                        <div className="flex flex-wrap gap-1">
                          {apiKey.scopes.map((scope) => (
                            <Badge
                              key={scope}
                              size="xs"
                              color={
                                scope === ApiKeyScope.ADMIN
                                  ? 'purple'
                                  : scope === ApiKeyScope.WRITE
                                  ? 'blue'
                                  : 'slate'
                              }
                            >
                              {scope}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>

                      {/* Rate Limit */}
                      <TableCell className="py-4 font-mono text-xs text-slate-200">
                        <div className="flex items-center gap-1.5">
                          <span>{apiKey.rateLimit.toLocaleString()} req/m</span>
                          <button
                            onClick={() => {
                              setEditingKey(apiKey);
                              setIsEditModalOpen(true);
                            }}
                            className="p-1 text-slate-400 hover:text-sky-400 rounded transition-colors"
                            title="Edit rate limit quota"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        </div>
                      </TableCell>

                      {/* Status */}
                      <TableCell className="py-4">
                        <Badge
                          size="xs"
                          color={apiKey.isActive ? 'emerald' : 'rose'}
                        >
                          <span className="flex items-center gap-1">
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                apiKey.isActive ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'
                              }`}
                            />
                            {apiKey.isActive ? 'Active' : 'Revoked'}
                          </span>
                        </Badge>
                      </TableCell>

                      {/* 7-Day Usage Sparkline */}
                      <TableCell className="py-4">
                        <div className="flex items-center gap-3">
                          <SparkAreaChart
                            data={sparklineData}
                            categories={['requests']}
                            index="date"
                            colors={[apiKey.isActive ? 'sky' : 'slate']}
                            className="h-8 w-28"
                          />
                          <span className="text-[11px] font-mono text-slate-400">
                            {(apiKey.totalRequests7d ?? 0).toLocaleString()} reqs
                          </span>
                        </div>
                      </TableCell>

                      {/* Activity (Created & Last Used) */}
                      <TableCell className="py-4">
                        <div className="text-xs space-y-0.5">
                          <div className="text-slate-300 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            <span>{formatLastUsed(apiKey.lastUsedAt)}</span>
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono">
                            Created {formatDate(apiKey.createdAt)}
                          </div>
                        </div>
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="pr-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Rotate Button */}
                          <button
                            onClick={() => handleRotate(apiKey)}
                            disabled={!apiKey.isActive}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:hover:text-slate-400"
                            title="Rotate Key (Invalidates current secret)"
                          >
                            <RotateCw className="w-3.5 h-3.5" />
                          </button>

                          {/* Revoke Button (Optimistic UI) */}
                          <button
                            onClick={() => handleRevoke(apiKey)}
                            disabled={!apiKey.isActive}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:hover:text-slate-400"
                            title={apiKey.isActive ? 'Revoke Key' : 'Key already revoked'}
                          >
                            <Ban className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Controlled Modals */}
      <CreateKeyModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleCreateKey}
      />

      <KeySecretModal
        isOpen={isSecretModalOpen}
        apiKeySecret={revealedSecret}
        keyDetails={revealedKeyDetails}
        onClose={() => setIsSecretModalOpen(false)}
      />

      <EditRateLimitModal
        isOpen={isEditModalOpen}
        apiKey={editingKey}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingKey(null);
        }}
        onSave={handleSaveRateLimit}
      />
    </div>
  );
}
