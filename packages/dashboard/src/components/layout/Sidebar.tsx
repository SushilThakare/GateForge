'use client';

/**
 * @file packages/dashboard/src/components/layout/Sidebar.tsx
 * @description Refined warm minimal sidebar navigation for GateForge Dashboard.
 * Clean, spacious, using stone palettes and Persimmon orange active states.
 */

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  KeyRound,
  FileText,
  LineChart,
  AlertTriangle,
  Menu,
  X,
  Zap,
} from 'lucide-react';
import { DashboardRoute } from '../../types/stats';

/**
 * Navigation item specification
 */
export interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

const NAV_ITEMS: NavItem[] = [
  { name: 'Overview', href: DashboardRoute.OVERVIEW, icon: LayoutDashboard },
  { name: 'API Keys', href: DashboardRoute.API_KEYS, icon: KeyRound },
  { name: 'Request Logs', href: DashboardRoute.LOGS, icon: FileText },
  { name: 'Analytics', href: DashboardRoute.ANALYTICS, icon: LineChart },
  { name: 'Anomalies', href: DashboardRoute.ANOMALIES, icon: AlertTriangle, badge: 'AI' },
];

/**
 * Responsive Sidebar component supporting desktop, tablet, and mobile breakpoints.
 * 
 * @returns {JSX.Element} Rendered Sidebar navigation
 */
export function Sidebar(): JSX.Element {
  const pathname = usePathname();
  const [isOpenMobile, setIsOpenMobile] = useState<boolean>(false);

  return (
    <>
      {/* Mobile / Tablet Toggle Header */}
      <div className="lg:hidden flex items-center justify-between p-4 bg-stone-950/90 backdrop-blur-md border-b border-stone-800 sticky top-0 z-40">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-persimmon-500 flex items-center justify-center text-stone-950 font-bold text-xs shadow-sm">
            GF
          </div>
          <span className="font-semibold text-stone-100 tracking-tight text-base">GateForge</span>
        </div>
        <button
          onClick={() => setIsOpenMobile(!isOpenMobile)}
          className="p-2 rounded-lg bg-stone-900 hover:bg-stone-800 text-stone-300 focus:outline-none"
          aria-label="Toggle Navigation Menu"
        >
          {isOpenMobile ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsOpenMobile(false)}
        />
      )}

      {/* Main Sidebar Drawer */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-stone-950/95 border-r border-stone-800/80 flex flex-col justify-between transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-6 space-y-8">
          {/* Brand / Logo section */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-8 h-8 rounded-lg bg-persimmon-500 flex items-center justify-center text-stone-950 font-bold text-sm shadow-sm shadow-persimmon-500/20 group-hover:scale-105 transition-transform">
              GF
            </div>
            <div>
              <div className="font-semibold text-stone-100 tracking-tight text-base leading-tight">
                GateForge
              </div>
              <p className="text-[11px] text-stone-400 font-normal">API Gateway Control</p>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="space-y-1.5">
            <div className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider px-3 mb-2">
              Platform
            </div>

            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.href === DashboardRoute.OVERVIEW
                  ? pathname === '/' || pathname === ''
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsOpenMobile(false)}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-stone-900 text-stone-100 border border-stone-800 shadow-xs'
                      : 'text-stone-400 hover:text-stone-200 hover:bg-stone-900/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon
                      className={`w-4 h-4 transition-colors ${
                        isActive ? 'text-persimmon-400' : 'text-stone-400'
                      }`}
                    />
                    <span>{item.name}</span>
                  </div>

                  {item.badge && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-persimmon-500/10 text-persimmon-400 border border-persimmon-500/20">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Footer / Gateway Health Indicator */}
        <div className="p-6 border-t border-stone-800/80 flex items-center justify-between bg-stone-950">
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 ring-4 ring-emerald-500/20"></span>
            <span className="text-xs text-stone-300 font-medium">Gateway Live</span>
          </div>
          <span className="text-[11px] font-mono text-stone-400">:3000</span>
        </div>
      </aside>
    </>
  );
}
