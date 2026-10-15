/**
 * @file packages/dashboard/src/app/api/health/route.ts
 * @description Lightweight health check endpoint for the Dashboard service.
 *
 * This route is called by:
 *  - Docker HEALTHCHECK (wget -qO- http://localhost:3001/api/health)
 *  - Load balancers / uptime monitors
 *  - Container orchestrators (ECS, Kubernetes readiness probes)
 *
 * It intentionally does NOT check Prisma/DB — a slow DB shouldn't mark the
 * HTTP server itself as unhealthy. Add a /api/health/ready route if you need
 * a "readiness" probe that validates downstream deps.
 */

import { NextResponse } from 'next/server';

// Force dynamic rendering — we want a fresh timestamp on every call,
// not a statically cached response from build time.
export const dynamic = 'force-dynamic';

/**
 * GET /api/health
 * Returns 200 OK with service metadata when the Next.js server is running.
 */
export function GET(): NextResponse {
  return NextResponse.json(
    {
      status: 'ok',
      service: 'dashboard',
      timestamp: new Date().toISOString(),
    },
    { status: 200 }
  );
}
