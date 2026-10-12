/**
 * @file packages/dashboard/src/app/api/anomalies/route.ts
 * @description Next.js App Router Route Handler (BFF) for querying AI Anomaly Reports.
 * Validates query parameters with Zod, queries the Gateway, and returns typed anomaly reports.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { fetchGatewayAnomalies } from '@/lib/anomaliesApi';

export const dynamic = 'force-dynamic';

/**
 * Zod validation schema for client query parameters.
 */
const queryAnomaliesSchema = z.object({
  severity: z
    .enum(['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'])
    .default('ALL'),
  dateRange: z
    .enum(['1h', '24h', '7d', '30d', 'all'])
    .default('24h'),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 50)),
});

/**
 * GET /api/anomalies
 * Retrieves filtered list of AI anomaly reports and scheduler status.
 *
 * @param {NextRequest} req - Incoming HTTP request
 * @returns {Promise<NextResponse>} JSON response with reports and status
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const searchParams = Object.fromEntries(req.nextUrl.searchParams.entries());
    const validation = queryAnomaliesSchema.safeParse(searchParams);

    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Validation Error',
          details: validation.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const result = await fetchGatewayAnomalies(validation.data);
    return NextResponse.json(result, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Dashboard API /api/anomalies GET Error]:', {
      error: message,
      url: req.url,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to retrieve anomaly reports' },
      { status: 500 }
    );
  }
}
