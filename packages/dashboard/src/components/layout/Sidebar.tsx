'use client';

/**
 * @file packages/dashboard/src/components/layout/Sidebar.tsx
 * @description Responsive dark-themed sidebar navigation component for GateForge Dashboard.
 * Includes routes: Overview, API Keys, Logs, Analytics, Anomalies.
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
  ShieldCheck,
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
  { name: 'Logs', href: DashboardRoute.LOGS, icon: FileText },
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
      <div className="lg:hidden flex items-center justify-between p-4 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-400">
            <Zap className="w-5 h-5" />
          </div>
          <span className="font-bold text-slate-100 tracking-wide text-lg">GateForge</span>
        </div>
        <button
          onClick={() => setIsOpenMobile(!isOpenMobile)}
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500"
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
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-slate-950 border-r border-slate-800/80 flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand / Logo section */}
        <div className="p-6 border-b border-slate-800/60 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-600 to-cyan-400 flex items-center justify-center text-slate-950 font-black shadow-lg shadow-sky-500/20 group-hover:shadow-sky-500/40 transition-all">
              <Zap className="w-5 h-5 fill-slate-950 text-slate-950" />
            </div>
            <div>
              <div className="font-bold text-slate-100 tracking-tight text-lg leading-tight flex items-center gap-1.5">
                GateForge
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  v1.0
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">Gateway Control Plane</p>
            </div>
          </Link>
          <button
            onClick={() => setIsOpenMobile(false)}
            className="lg:hidden p-1.5 text-slate-400 hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Link Items */}
        <nav className="flex-1 px-3 py-6 space-y-1.5 overflow-y-auto">
          <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 font-mono">
            Navigation
          </div>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setIsOpenMobile(false)}
                className={`flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all group ${
                  isActive
                    ? 'bg-sky-500/10 text-sky-400 border border-sky-500/30 shadow-sm shadow-sky-500/10 font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/80 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`w-4 h-4 transition-colors ${
                      isActive ? 'text-sky-400' : 'text-slate-400 group-hover:text-slate-300'
                    }`}
                  />
                  <span>{item.name}</span>
                </div>
                {item.badge && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* System & Gateway Status Card */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-950/40">
          <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 text-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-400 font-mono">Cluster Status</span>
              <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Live
              </span>
            </div>
            <div className="flex items-center gap-2 text-slate-400">
              <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
              <span>Proxy &amp; Redis Synced</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
