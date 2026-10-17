/**
 * @file packages/dashboard/src/app/layout.tsx
 * @description Root Layout component for GateForge Next.js 14 Dashboard.
 * Embeds Geist & Geist Mono fonts, next-themes ThemeProvider, and responsive layout.
 */

import React from 'react';
import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { ThemeProvider } from '../components/theme/ThemeProvider';
import { Sidebar } from '../components/layout/Sidebar';
import './globals.css';

export const metadata: Metadata = {
  title: 'GateForge — API Gateway Control Plane',
  description: 'Real-time telemetry, rate limit enforcement, and developer control plane for GateForge.',
};

/**
 * Props definition for RootLayout
 */
export interface RootLayoutProps {
  children: React.ReactNode;
}

/**
 * RootLayout component wrapping all dashboard views with theme provider and layout structure.
 * 
 * @param {RootLayoutProps} props - Children route views
 * @returns {JSX.Element} Rendered HTML document root
 */
export default function RootLayout({ children }: RootLayoutProps): JSX.Element {
  return (
    <html lang="en" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-screen font-sans bg-stone-950 text-stone-100 antialiased selection:bg-persimmon-500 selection:text-stone-950 transition-colors duration-150">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <div className="min-h-screen flex flex-col lg:flex-row bg-stone-950 dark:bg-stone-950 light:bg-stone-50">
            {/* Responsive Sidebar navigation */}
            <Sidebar />

            {/* Main content viewport offset for fixed sidebar on desktop */}
            <main className="flex-1 lg:pl-64 flex flex-col min-w-0 transition-all">
              <div className="flex-1 w-full max-w-7xl mx-auto p-6 sm:p-8 lg:p-10">
                {children}
              </div>
            </main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
