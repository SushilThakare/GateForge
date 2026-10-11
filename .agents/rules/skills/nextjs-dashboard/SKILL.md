---
name: nextjs-dashboard
description: Guidelines, data fetching patterns, and UI design rules for GateForge Phase 4 Next.js Dashboard.
---

# GateForge Next.js Dashboard Skill

## Architecture & Data Flow
- **Server-First Data Fetching**: Fetch data in React Server Components directly using Prisma (`@gateforge/dashboard` connects to PostgreSQL via Prisma).
- **Client Components (`'use client'`)**: Only use client components for interactive UI elements (e.g. chart tooltips, filtering dropdowns, modal dialogs, API key secret toggles).
- **API Routes**: Place API endpoints under `src/app/api/` for any asynchronous operations or client-side polling.

## UI & Styling Standards
- Use Tailwind CSS with dark theme aesthetics matching `#0f172a` (slate-900) background and slate accents.
- Responsive layout with a sticky sidebar/navigation header.
- Status indicators with clear color semantics:
  - Green (`emerald-500`): Active, 2xx HTTP Status
  - Yellow (`amber-500`): Rate limited (429), Warnings
  - Red (`rose-500`): 5xx HTTP Errors, Inactive key
