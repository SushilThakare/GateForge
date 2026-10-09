/**
 * @file packages/worker/src/lib/prisma.ts
 * @description Centralized Prisma Client singleton for the Worker service.
 * Sits in the persistence layer of the worker architecture.
 * Ensures connection pooling is bounded and avoids connection exhaustion
 * when executing concurrent database transactions and batch writes.
 */

import { PrismaClient } from '@prisma/client';

/**
 * Global declaration to support singleton reuse during development watch mode (tsx watch).
 */
declare global {
  // eslint-disable-next-line no-var
  var __workerPrismaClient: PrismaClient | undefined;
}

/**
 * Creates or retrieves the singleton PrismaClient instance for the worker service.
 * 
 * @returns {PrismaClient} Initialized Prisma Client
 */
function createPrismaClient(): PrismaClient {
  if (process.env.NODE_ENV === 'production') {
    return new PrismaClient();
  }

  if (!global.__workerPrismaClient) {
    global.__workerPrismaClient = new PrismaClient({
      log: ['error', 'warn'],
    });
  }

  return global.__workerPrismaClient;
}

/**
 * Singleton Prisma Client export for the worker service.
 */
export const prisma: PrismaClient = createPrismaClient();
