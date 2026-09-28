/**
 * @file packages/dashboard/src/app/layout.tsx
 * @description Root Layout component for the GateForge Next.js 14 Dashboard.
 * Serves as the top-level template wrapping all App Router routes with global HTML structure and meta tags.
 */

import React from 'react';
import './globals.css';

export const metadata = {
  title: 'GateForge — API Gateway Dashboard',
  description: 'Analytics, Rate Limit Monitoring, and Key Management Dashboard for GateForge Gateway',
};

/**
 * Props type definition for RootLayout component
 */
export interface RootLayoutProps {
  children: React.ReactNode;
}

/**
 * RootLayout functional component wrapping all dashboard views.
 * 
 * @param {RootLayoutProps} props - Children elements to render inside main content container
 * @returns {JSX.Element} Rendered HTML root layout structure
 */
export default function RootLayout({ children }: RootLayoutProps): JSX.Element {
  return (
    <html lang="en">
      <body>
        <main className="min-h-screen bg-slate-950 text-slate-100 font-sans">
          {children}
        </main>
      </body>
    </html>
  );
}
