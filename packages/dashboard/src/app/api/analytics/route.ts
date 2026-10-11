/**
 * @file packages/dashboard/src/app/api/analytics/route.ts
 * @description Next.js App Router Route Handler (BFF) for fetching advanced analytics.
 * Validates the timeRange query parameter with Zod, queries the Gateway, and returns
 * typed analytics payload for seamless client-side updates.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { fetchGatewayAnalytics } from '@/lib/analyticsApi';
import { AnalyticsTimeRangePreset } from '@/types/analytics';

export const dynamic = 'force-dynamic';

const analyticsRouteSchema = z.object({
  timeRange: z
    .enum(['1h', '6h', '24h', '7d', '30d'])
    .default('24h'),
});

/**
 * GET /api/analytics
 * Retrieves aggregated telemetry datasets for the requested time range.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const searchParams = Object.fromEntries(req.nextUrl.searchParams.entries());
    const validation = analyticsRouteSchema.safeParse(searchParams);

    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Validation Error',
          details: validation.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const preset = validation.data.timeRange as AnalyticsTimeRangePreset;
    const data = await fetchGatewayAnalytics(preset);

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error('[Dashboard API /api/analytics GET Error]:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to retrieve analytics' },
      { status: 500 }
    );
  }
}
