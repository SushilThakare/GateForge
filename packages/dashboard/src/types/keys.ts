/**
 * @file packages/dashboard/src/types/keys.ts
 * @description TypeScript interface definitions and enums for API Key management,
 * scopes, rate limits, and 7-day usage telemetry in the GateForge Dashboard.
 */

/**
 * Scope permissions supported by GateForge API keys.
 */
export enum ApiKeyScope {
  READ = 'READ',
  WRITE = 'WRITE',
  ADMIN = 'ADMIN',
}

/**
 * Single daily usage data point for the 7-day sparkline.
 */
export interface DailyUsagePoint {
  date: string;
  requests: number;
}

/**
 * API Key entity structure returned by list endpoints and rendered in tables.
 */
export interface ApiKeyItem {
  id: string;
  key: string;
  name: string;
  scopes: ApiKeyScope[];
  rateLimit: number;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
  usage7d?: DailyUsagePoint[];
  totalRequests7d?: number;
}

/**
 * Payload required to create a new API Key.
 */
export interface CreateApiKeyPayload {
  name: string;
  scopes: ApiKeyScope[];
  rateLimit: number;
}

/**
 * Successful response from the API key creation endpoint.
 * Contains the plaintext key secret that is revealed ONCE.
 */
export interface CreateApiKeyResponse {
  message: string;
  apiKey: string;
  keyDetails: ApiKeyItem;
}

/**
 * Payload for updating an existing API key.
 */
export interface UpdateApiKeyPayload {
  name?: string;
  scopes?: ApiKeyScope[];
  rateLimit?: number;
  isActive?: boolean;
}

/**
 * Response when rotating an existing API key.
 * Contains the new plaintext key secret that is revealed ONCE.
 */
export interface RotateApiKeyResponse {
  message: string;
  newApiKey: string;
  keyDetails: ApiKeyItem;
}
