/**
 * @file packages/dashboard/src/app/api/keys/[id]/rotate/route.ts
 * @description Next.js App Router Route Handler for rotating an API key's secret.
 * Calls Gateway to generate a fresh 256-bit secret, immediately invalidating the previous one.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { rotateGatewayKey } from '@/lib/keysApi';

const idParamSchema = z.string().min(1, 'Key ID is required');

/**
 * POST /api/keys/[id]/rotate
 * Generates a replacement secret for an existing key ID.
 * 
 * @param {NextRequest} _req - NextRequest
 * @param {{ params: { id: string } }} context - Route params containing key ID
 * @returns {Promise<NextResponse>} Rotated secret details
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const idValidation = idParamSchema.safeParse(params.id);
    if (!idValidation.success) {
      return NextResponse.json(
        { error: 'Invalid ID', details: idValidation.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const result = await rotateGatewayKey(params.id);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('[Dashboard API /api/keys/[id]/rotate Error]:', error);
    return NextResponse.json(
      {
        error: 'Key Rotation Failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
