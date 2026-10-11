/**
 * @file packages/dashboard/src/app/api/logs/[id]/route.ts
 * @description Next.js App Router Route Handler for fetching detailed log diagnostic metadata.
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchGatewayLogDetail } from '@/lib/logsApi';

/**
 * GET /api/logs/[id]
 * Retrieves full telemetry details for a single request log.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const log = await fetchGatewayLogDetail(params.id);
    return NextResponse.json({ log }, { status: 200 });
  } catch (error) {
    console.error('[Dashboard API /api/logs/[id] GET Error]:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to retrieve log details' },
      { status: 500 }
    );
  }
}
