/**
 * @file packages/gateway/src/utils/keyGenerator.ts
 * @description Cryptographic utilities for generating and masking API keys.
 * Uses Node's CSPRNG (crypto.randomBytes) to produce high-entropy 256-bit API keys and provides
 * safe masking transformations to protect credentials from leaking in list views or logs.
 */

import crypto from 'crypto';

/**
 * Generates a cryptographically secure 32-byte (256-bit) hex-encoded API key with a designated prefix.
 * 
 * @param {string} prefix - Environment identifier prefix (e.g. 'gf_live_', 'gf_test_')
 * @returns {string} The full, plaintext API key string
 */
export function generateApiKeyString(prefix: string = 'gf_live_'): string {
  // 32 random bytes = 256 bits of entropy = 64 hexadecimal characters
  const randomBytes = crypto.randomBytes(32).toString('hex');
  return `${prefix}${randomBytes}`;
}

/**
 * Masks an API key for safe display in administrative dashboards and API responses.
 * Follows the industry standard (e.g. Stripe, GitHub, OpenAI) of displaying only the last 8 characters
 * so administrators can identify which key is being referenced without revealing the secret.
 * 
 * @param {string} key - Plaintext API key
 * @returns {string} Masked key string (e.g. 'gf_live_...9f8b7a6c')
 */
export function maskApiKey(key: string): string {
  if (!key || key.length <= 8) {
    return '********';
  }

  const last8Chars = key.slice(-8);
  const lastUnderscore = key.lastIndexOf('_');
  const prefix = lastUnderscore !== -1 ? key.slice(0, lastUnderscore + 1) : 'gf_';

  return `${prefix}••••••••••••••••••••••••••••••••${last8Chars}`;
}
