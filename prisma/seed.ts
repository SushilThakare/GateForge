/**
 * @file prisma/seed.ts
 * @description Database seeding script for GateForge.
 * Populates PostgreSQL with initial development and testing API keys using cryptographically
 * secure random bytes. Fits into the data initialization phase of the gateway.
 */

import { PrismaClient, ApiKeyScope } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

/**
 * Interface representing the specification for creating a seed API Key
 */
export interface SeedKeySpec {
  name: string;
  scopes: ApiKeyScope[];
  rateLimit: number;
  prefix: string;
}

/**
 * Generates a cryptographically secure 32-byte random hex string for use as an API Key.
 * 
 * @param {string} prefix - Prefix tag for clear key environment identification (e.g. 'gf_live_', 'gf_test_')
 * @returns {string} A 32-byte hex string prefixed with the environment tag
 */
export function generate32ByteApiKey(prefix: string = 'gf_'): string {
  // Use crypto.randomBytes(32) to generate 256 bits (32 bytes) of cryptographic randomness
  const buffer = crypto.randomBytes(32);
  return `${prefix}${buffer.toString('hex')}`;
}

/**
 * Seeding script execution entry point.
 * Upserts test API keys and outputs generated credentials to standard output.
 * 
 * @returns {Promise<void>}
 */
export async function seedDatabase(): Promise<void> {
  console.log('[Seed] Initializing GateForge database seed process...');

  const keySpecs: SeedKeySpec[] = [
    {
      name: 'Production Key',
      scopes: [ApiKeyScope.READ, ApiKeyScope.WRITE],
      rateLimit: 1000,
      prefix: 'gf_live_',
    },
    {
      name: 'Development Key',
      scopes: [ApiKeyScope.READ],
      rateLimit: 60,
      prefix: 'gf_test_',
    },
  ];

  try {
    for (const spec of keySpecs) {
      // Check if key with matching name already exists to prevent duplicate test entries
      const existing = await prisma.apiKey.findFirst({
        where: { name: spec.name },
      });

      if (existing) {
        console.log(`[Seed] Key "${spec.name}" already exists (ID: ${existing.id}). Skipping creation.`);
        continue;
      }

      // Generate a new 32-byte (64 hex characters) secure key
      const secureKeyValue = generate32ByteApiKey(spec.prefix);

      const createdKey = await prisma.apiKey.create({
        data: {
          name: spec.name,
          key: secureKeyValue,
          scopes: spec.scopes,
          rateLimit: spec.rateLimit,
          isActive: true,
        },
      });

      console.log(`[Seed] Created key "${createdKey.name}":`);
      console.log(`       ID: ${createdKey.id}`);
      console.log(`       Key: ${createdKey.key}`);
      console.log(`       Scopes: ${createdKey.scopes.join(', ')}`);
      console.log(`       Rate Limit: ${createdKey.rateLimit} req/min`);
    }

    console.log('[Seed] Database seeding completed successfully.');
  } catch (error) {
    console.error('[Seed Fatal Failure] Error seeding API keys:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

// Execute seed if called directly as entry script
if (process.argv[1]?.includes('seed.ts')) {
  seedDatabase()
    .catch((err: unknown) => {
      console.error('[Seed Top-Level Error]:', err);
      process.exit(1);
    })
    .finally(async () => {
      // Ensure database connections are gracefully released
      await prisma.$disconnect();
    });
}
