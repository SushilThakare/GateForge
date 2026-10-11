'use client';

/**
 * @file packages/dashboard/src/components/logs/StatusBadge.tsx
 * @description Color-coded HTTP status code badge component.
 * Maps status families to strict color themes:
 * - 2xx: Green (Emerald)
 * - 3xx: Blue (Sky)
 * - 4xx: Yellow (Amber)
 * - 5xx: Red (Rose)
 */

import React from 'react';

export interface StatusBadgeProps {
  statusCode: number;
  size?: 'sm' | 'md';
}

/**
 * Returns color classes and label for a status code family
 */
function getStatusTheme(code: number): {
  bg: string;
  text: string;
  border: string;
  dot: string;
} {
  if (code >= 200 && code < 300) {
    return {
      bg: 'bg-emerald-500/10',
      text: 'text-emerald-400',
      border: 'border-emerald-500/20',
      dot: 'bg-emerald-400',
    };
  }
  if (code >= 300 && code < 400) {
    return {
      bg: 'bg-sky-500/10',
      text: 'text-sky-400',
      border: 'border-sky-500/20',
      dot: 'bg-sky-400',
    };
  }
  if (code >= 400 && code < 500) {
    return {
      bg: 'bg-amber-500/10',
      text: 'text-amber-400',
      border: 'border-amber-500/20',
      dot: 'bg-amber-400',
    };
  }
  return {
    bg: 'bg-rose-500/10',
    text: 'text-rose-400',
    border: 'border-rose-500/20',
    dot: 'bg-rose-400',
  };
}

export function StatusBadge({ statusCode, size = 'sm' }: StatusBadgeProps): JSX.Element {
  const theme = getStatusTheme(statusCode);
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md font-mono font-bold border ${theme.bg} ${theme.text} ${theme.border} ${sizeClasses}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${theme.dot}`} />
      <span>{statusCode}</span>
    </span>
  );
}
