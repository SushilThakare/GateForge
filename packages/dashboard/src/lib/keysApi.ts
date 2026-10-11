/**
 * @file packages/dashboard/src/lib/keysApi.ts
 * @description API client utilities for managing API keys in GateForge.
 * Executes server-side and route handler requests to the upstream Express API Gateway (/api/keys),
 * handles authentication headers, error logging, and resilient fallbacks for local preview.
 */

import {
  ApiKeyItem,
  ApiKeyScope,
  CreateApiKeyPayload,
  CreateApiKeyResponse,
  UpdateApiKeyPayload,
  RotateApiKeyResponse,
} from '../types/keys';

/**
 * Fallback API keys list used when the gateway server is unreachable or offline during preview.
 */
function getFallbackKeys(): ApiKeyItem[] {
  const now = new Date();
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return [
    {
      id: 'key-demo-1',
      key: 'gf_live_••••••••••••••••••••••••••98a2f4',
      name: 'Production Primary Gateway',
      scopes: [ApiKeyScope.READ, ApiKeyScope.WRITE],
      rateLimit: 1000,
      isActive: true,
      lastUsedAt: new Date(now.getTime() - 2 * 60 * 1000).toISOString(),
      createdAt: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      usage7d: [
        { date: days[0], requests: 1420 },
        { date: days[1], requests: 1890 },
        { date: days[2], requests: 2100 },
        { date: days[3], requests: 1750 },
        { date: days[4], requests: 2400 },
        { date: days[5], requests: 980 },
        { date: days[6], requests: 1250 },
      ],
      totalRequests7d: 11790,
    },
    {
      id: 'key-demo-2',
      key: 'gf_test_••••••••••••••••••••••••••4c10eb',
      name: 'Internal Dev Analytics Key',
      scopes: [ApiKeyScope.READ],
      rateLimit: 120,
      isActive: true,
      lastUsedAt: new Date(now.getTime() - 45 * 60 * 1000).toISOString(),
      createdAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      usage7d: [
        { date: days[0], requests: 45 },
        { date: days[1], requests: 80 },
        { date: days[2], requests: 120 },
        { date: days[3], requests: 95 },
        { date: days[4], requests: 140 },
        { date: days[5], requests: 20 },
        { date: days[6], requests: 35 },
      ],
      totalRequests7d: 535,
    },
    {
      id: 'key-demo-3',
      key: 'gf_live_••••••••••••••••••••••••••77d9c1',
      name: 'Staging Integration Key (Revoked)',
      scopes: [ApiKeyScope.READ, ApiKeyScope.WRITE, ApiKeyScope.ADMIN],
      rateLimit: 300,
      isActive: false,
      lastUsedAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      usage7d: [
        { date: days[0], requests: 0 },
        { date: days[1], requests: 0 },
        { date: days[2], requests: 0 },
        { date: days[3], requests: 0 },
        { date: days[4], requests: 0 },
        { date: days[5], requests: 0 },
        { date: days[6], requests: 0 },
      ],
      totalRequests7d: 0,
    },
  ];
}

/**
 * Fetches all API keys from the Express Gateway service.
 * 
 * @returns {Promise<ApiKeyItem[]>} Array of masked API keys with 7-day usage telemetry
 */
export async function fetchGatewayKeys(): Promise<ApiKeyItem[]> {
  const gatewayUrl = process.env.GATEWAY_URL || 'http://localhost:3000';
  const adminKey = process.env.GATEWAY_ADMIN_KEY || 'gf_admin_dashboard_key';
  const targetEndpoint = `${gatewayUrl}/api/keys`;

  try {
    const response = await fetch(targetEndpoint, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-API-Key': adminKey,
      },
      next: { revalidate: 0 },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`[KeysApi] Gateway responded with HTTP ${response.status}: ${errorText}. Using fallback keys.`);
      return getFallbackKeys();
    }

    const data: { keys: ApiKeyItem[]; count: number } = await response.json();
    return data.keys || [];
  } catch (error) {
    console.warn('[KeysApi] Unable to reach Gateway HTTP endpoint, using fallback keys:', {
      endpoint: targetEndpoint,
      error: error instanceof Error ? error.message : String(error),
    });
    return getFallbackKeys();
  }
}

/**
 * Creates a new API key on the Express Gateway.
 * 
 * @param {CreateApiKeyPayload} payload - Key creation parameters
 * @returns {Promise<CreateApiKeyResponse>} Created key response containing the one-time plaintext key
 */
export async function createGatewayKey(payload: CreateApiKeyPayload): Promise<CreateApiKeyResponse> {
  const gatewayUrl = process.env.GATEWAY_URL || 'http://localhost:3000';
  const adminKey = process.env.GATEWAY_ADMIN_KEY || 'gf_admin_dashboard_key';
  const targetEndpoint = `${gatewayUrl}/api/keys`;

  const response = await fetch(targetEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-API-Key': adminKey,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({ message: 'Failed to create key' }));
    throw new Error(errData.message || `Creation failed with status ${response.status}`);
  }

  return response.json();
}

/**
 * Soft deletes (revokes) an API key on the Express Gateway.
 * 
 * @param {string} id - UUID of the key to revoke
 * @returns {Promise<void>}
 */
export async function revokeGatewayKey(id: string): Promise<void> {
  const gatewayUrl = process.env.GATEWAY_URL || 'http://localhost:3000';
  const adminKey = process.env.GATEWAY_ADMIN_KEY || 'gf_admin_dashboard_key';
  const targetEndpoint = `${gatewayUrl}/api/keys/${encodeURIComponent(id)}`;

  const response = await fetch(targetEndpoint, {
    method: 'DELETE',
    headers: {
      'Accept': 'application/json',
      'X-API-Key': adminKey,
    },
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({ message: 'Failed to revoke key' }));
    throw new Error(errData.message || `Revocation failed with status ${response.status}`);
  }
}

/**
 * Rotates an existing API key, generating a new secret and invalidating the old one.
 * 
 * @param {string} id - UUID of the key to rotate
 * @returns {Promise<RotateApiKeyResponse>} Rotation result with new one-time secret
 */
export async function rotateGatewayKey(id: string): Promise<RotateApiKeyResponse> {
  const gatewayUrl = process.env.GATEWAY_URL || 'http://localhost:3000';
  const adminKey = process.env.GATEWAY_ADMIN_KEY || 'gf_admin_dashboard_key';
  const targetEndpoint = `${gatewayUrl}/api/keys/${encodeURIComponent(id)}/rotate`;

  const response = await fetch(targetEndpoint, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'X-API-Key': adminKey,
    },
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({ message: 'Failed to rotate key' }));
    throw new Error(errData.message || `Rotation failed with status ${response.status}`);
  }

  return response.json();
}

/**
 * Updates an API key's rate limit or metadata.
 * 
 * @param {string} id - UUID of the key to update
 * @param {UpdateApiKeyPayload} payload - Fields to update
 * @returns {Promise<ApiKeyItem>} Updated key details
 */
export async function updateGatewayKey(id: string, payload: UpdateApiKeyPayload): Promise<ApiKeyItem> {
  const gatewayUrl = process.env.GATEWAY_URL || 'http://localhost:3000';
  const adminKey = process.env.GATEWAY_ADMIN_KEY || 'gf_admin_dashboard_key';
  const targetEndpoint = `${gatewayUrl}/api/keys/${encodeURIComponent(id)}`;

  const response = await fetch(targetEndpoint, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-API-Key': adminKey,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({ message: 'Failed to update key' }));
    throw new Error(errData.message || `Update failed with status ${response.status}`);
  }

  const result = await response.json();
  return result.key;
}
