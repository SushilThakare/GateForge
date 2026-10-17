/**
 * @file packages/dashboard/src/components/theme/ThemeToggle.tsx
 * @description Accessible theme switcher toggle button supporting dark and light modes.
 */

'use client';

import React, { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon } from 'lucide-react';

/**
 * Theme toggle button component.
 * 
 * @returns {JSX.Element | null} Rendered theme button
 */
export function ThemeToggle(): JSX.Element | null {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState<boolean>(false);

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="w-8 h-8 rounded-lg bg-stone-900/40 border border-stone-800/80" />
    );
  }

  const isDark = resolvedTheme === 'dark';

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="p-2 rounded-lg bg-stone-900/60 hover:bg-stone-800 border border-stone-800 text-stone-300 hover:text-stone-100 dark:bg-stone-900/60 dark:hover:bg-stone-800 dark:border-stone-800 dark:text-stone-300 dark:hover:text-stone-100 transition-colors"
      title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      aria-label="Toggle theme"
    >
      {isDark ? (
        <Sun className="w-4 h-4 text-persimmon-400" />
      ) : (
        <Moon className="w-4 h-4 text-stone-700" />
      )}
    </button>
  );
}
