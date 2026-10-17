/**
 * @file packages/dashboard/src/components/theme/ThemeProvider.tsx
 * @description ThemeProvider wrapper leveraging next-themes to provide seamless
 * light and dark mode switching with system preference detection.
 */

'use client';

import React from 'react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';

type ThemeProviderProps = React.ComponentProps<typeof NextThemesProvider>;

/**
 * Custom ThemeProvider wrapping children with next-themes context.
 * 
 * @param {ThemeProviderProps} props - Children and configuration options
 * @returns {JSX.Element} Wrapped component hierarchy
 */
export function ThemeProvider({ children, ...props }: ThemeProviderProps): JSX.Element {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
