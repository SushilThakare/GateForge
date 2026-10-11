/**
 * @file packages/dashboard/src/app/api/keys/[id]/route.ts
 * @description Next.js App Router Route Handler for updating and revoking individual API keys.
 * Enforces Zod parameter validation and forwards commands to the Gateway.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiKeyScope } from '@/types/keys';
import { revokeGatewayKey, updateGatewayKey } from '@/lib/keysApi';

/**
 * Route parameter validation schema
 */
const idParamSchema = z.string().min(1, 'Key ID is required');

/**
 * Update request payload validation schema
 */
const updateKeySchema = z
  .object({
    name: z.string().min(1).max(100).trim().optional(),
    scopes: z.array(z.nativeEnum(ApiKeyScope)).min(1).optional(),
    rateLimit: z.number().int().positive().max(100000).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  });

/**
 * DELETE /api/keys/[id]
 * Revokes an existing API key.
 * 
 * @param {NextRequest} _req - NextRequest
 * @param {{ params: { id: string } }} context - Route params containing key ID
 * @returns {Promise<NextResponse>} Result confirmation
 */
export async function DELETE(
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

    await revokeGatewayKey(params.id);
    return NextResponse.json({ message: 'Key revoked successfully', id: params.id }, { status: 200 });
  } catch (error) {
    console.error('[Dashboard API /api/keys/[id] DELETE Error]:', error);
    return NextResponse.json(
      {
        error: 'Key Revocation Failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/keys/[id]
 * Updates rate limits, scopes, or names for an existing key.
 * 
 * @param {NextRequest} req - NextRequest containing JSON update payload
 * @param {{ params: { id: string } }} context - Route params containing key ID
 * @returns {Promise<NextResponse>} Updated key details
 */
export async function PATCH(
  req: NextRequest,
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

    const body = await req.json();
    const updateValidation = updateKeySchema.safeParse(body);
    if (!updateValidation.success) {
      return NextResponse.json(
        { error: 'Validation Error', details: updateValidation.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const updatedKey = await updateGatewayKey(params.id, updateValidation.data);
    return NextResponse.json({ message: 'Key updated successfully', key: updatedKey }, { status: 200 });
  } catch (error) {
    console.error('[Dashboard API /api/keys/[id] PATCH Error]:', error);
    return NextResponse.json(
      {
        error: 'Key Update Failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
