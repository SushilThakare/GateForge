/**
 * @file packages/gateway/src/lib/prisma.ts
 * @description Centralized Prisma Client singleton for the Gateway service.
 * In a long-running Node.js process, instantiating multiple PrismaClient instances leads to database
 * connection pool exhaustion. Exporting a single instance guarantees bounded connection pooling.
 */

import { PrismaClient } from '@prisma/client';

/**
 * Global declaration to support singleton pattern during development hot-reloading (e.g. tsx watch).
 */
declare global {
  // eslint-disable-next-line no-var
  var __prismaClient: PrismaClient | undefined;
}

/**
 * Creates or retrieves the singleton PrismaClient instance.
 * Reuses the existing client in development to prevent hot-reload connection leaks.
 * 
 * @returns {PrismaClient} Connected Prisma Client instance
 */
function createPrismaClient(): PrismaClient {
  if (process.env.NODE_ENV === 'production') {
    return new PrismaClient();
  }

  if (!global.__prismaClient) {
    global.__prismaClient = new PrismaClient({
      log: ['error', 'warn'],
    });
  }

  return global.__prismaClient;
}

/**
 * Singleton Prisma client export for the Gateway service.
 */
export const prisma: PrismaClient = createPrismaClient();
