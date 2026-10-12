/**
 * @file packages/dashboard/src/app/api/anomalies/run/route.ts
 * @description Next.js App Router Route Handler (BFF) for triggering on-demand AI anomaly analysis.
 * Proxies the manual trigger request to the Gateway's /api/anomalies/run endpoint.
 */

import { NextRequest, NextResponse } from 'next/server';
import { triggerGatewayAnalysis } from '@/lib/anomaliesApi';

export const dynamic = 'force-dynamic';

/**
 * POST /api/anomalies/run
 * Initiates an immediate traffic analysis execution via the BullMQ background queue.
 *
 * @param {NextRequest} req - Incoming HTTP request
 * @returns {Promise<NextResponse>} JSON response with execution confirmation
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const result = await triggerGatewayAnalysis();
    return NextResponse.json(result, { status: 202 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Dashboard API /api/anomalies/run POST Error]:', {
      error: message,
      url: req.url,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to initiate anomaly analysis' },
      { status: 500 }
    );
  }
}
