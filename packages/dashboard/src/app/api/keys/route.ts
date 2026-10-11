/**
 * @file packages/dashboard/src/app/api/keys/route.ts
 * @description Next.js App Router Route Handler for listing and creating API keys.
 * Validates inputs using Zod, enforces strict typing, and proxies securely to the Gateway service.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiKeyScope } from '@/types/keys';
import { fetchGatewayKeys, createGatewayKey } from '@/lib/keysApi';

/**
 * Zod validation schema for creating an API key.
 */
const createKeySchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name cannot exceed 100 characters').trim(),
  scopes: z.array(z.nativeEnum(ApiKeyScope)).min(1, 'At least one scope must be selected'),
  rateLimit: z.number().int().positive('Rate limit must be a positive integer').max(100000),
});

/**
 * GET /api/keys
 * Retrieves all registered API keys with masked secrets.
 * 
 * @returns {Promise<NextResponse>} JSON list of keys
 */
export async function GET(): Promise<NextResponse> {
  try {
    const keys = await fetchGatewayKeys();
    return NextResponse.json({ keys, count: keys.length }, { status: 200 });
  } catch (error) {
    console.error('[Dashboard API /api/keys GET Error]:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to retrieve keys' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/keys
 * Validates input and creates a new API key on the Gateway.
 * 
 * @param {NextRequest} req - Next.js Request object
 * @returns {Promise<NextResponse>} Created key payload including one-time secret
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const validation = createKeySchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation Error', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const result = await createGatewayKey(validation.data);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('[Dashboard API /api/keys POST Error]:', error);
    return NextResponse.json(
      {
        error: 'Key Creation Failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
