/**
 * @file packages/dashboard/src/app/layout.tsx
 * @description Root Layout component for the GateForge Next.js 14 Dashboard.
 * Embeds global styles, dark-mode default theme, and responsive Sidebar layout navigation.
 */

import React from 'react';
import type { Metadata } from 'next';
import { Sidebar } from '../components/layout/Sidebar';
import './globals.css';

export const metadata: Metadata = {
  title: 'GateForge — API Gateway Dashboard',
  description: 'Real-time telemetry, rate limit enforcement, and developer control plane for GateForge.',
};

/**
 * Props definition for RootLayout
 */
export interface RootLayoutProps {
  children: React.ReactNode;
}

/**
 * RootLayout component wrapping all dashboard views with sidebar navigation and dark theme.
 * 
 * @param {RootLayoutProps} props - Children route views
 * @returns {JSX.Element} Rendered HTML document root
 */
export default function RootLayout({ children }: RootLayoutProps): JSX.Element {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#080c14] text-slate-100 antialiased selection:bg-sky-500 selection:text-slate-950">
        <div className="min-h-screen flex flex-col lg:flex-row">
          {/* Responsive Sidebar navigation */}
          <Sidebar />

          {/* Main content viewport offset for fixed sidebar on desktop */}
          <main className="flex-1 lg:pl-64 flex flex-col min-w-0 transition-all">
            <div className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
