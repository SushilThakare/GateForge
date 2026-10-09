/**
 * @file packages/worker/src/index.ts
 * @description Entry point bootstrapping the GateForge background worker process.
 * Fits into the async background processing tier of the GateForge architecture.
 */

import { startWorker } from './worker.js';

// Boot up the worker consumer service
startWorker().catch((err: unknown) => {
  console.error('[Worker Boot Error]:', {
    error: err instanceof Error ? err.message : String(err),
    timestamp: new Date().toISOString(),
  });
  process.exit(1);
});

export * from './worker.js';
export * from './processors/logProcessor.js';
