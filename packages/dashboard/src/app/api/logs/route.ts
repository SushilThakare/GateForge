/**
 * @file packages/dashboard/src/app/api/logs/route.ts
 * @description Next.js App Router Route Handler for querying request logs.
 * Validates query parameters with Zod, parses cursor pagination, and proxies to Gateway.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { fetchGatewayLogs } from '@/lib/logsApi';

export const dynamic = 'force-dynamic';

const queryLogsSchema = z.object({
  cursor: z.string().optional(),
  limit: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 50)),
  apiKeyId: z.string().optional(),
  status: z.string().optional(),
  path: z.string().optional(),
  dateRange: z.string().optional(),
});

/**
 * GET /api/logs
 * Retrieves cursor-paginated logs.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const searchParams = Object.fromEntries(req.nextUrl.searchParams.entries());
    const validation = queryLogsSchema.safeParse(searchParams);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation Error', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const result = await fetchGatewayLogs(validation.data);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('[Dashboard API /api/logs GET Error]:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to retrieve logs' },
      { status: 500 }
    );
  }
}
