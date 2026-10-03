/**
 * @file packages/gateway/src/index.ts
 * @description Entry point for the GateForge Gateway service.
 * Sits at the network perimeter, intercepting incoming HTTP client traffic.
 * Executes the middleware pipeline in sequence:
 * 1. Body Parsing (JSON)
 * 2. Unauthenticated endpoints (/health)
 * 3. API Key Authentication (apiKeyAuth)
 * 4. Administrative Management Routes (/api/keys guarded by ADMIN scope)
 * 5. Downstream Proxy & Upstream Forwarding (/v1/proxy/*)
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import { ApiKeyScope } from '@prisma/client';
import { apiKeyAuth } from './auth/apiKeyAuth.js';
import { requireScope } from './auth/requireScope.js';
import { keyRouter } from './routes/keyRoutes.js';
import { prisma } from './lib/prisma.js';
import { redis } from './lib/redis.js';

// Load environment variables from process env or local config file
dotenv.config();

/**
 * Interface representing the operational configuration for the Gateway HTTP server.
 */
export interface GatewayConfig {
  port: number;
  nodeEnv: string;
}

/**
 * Retrieves and validates server configuration options from environment variables.
 * 
 * @returns {GatewayConfig} The sanitized Gateway configuration object
 */
export function getGatewayConfig(): GatewayConfig {
  const portRaw = process.env.GATEWAY_PORT || '3000';
  const port = parseInt(portRaw, 10);

  // Fallback to default port if parsing yields NaN to prevent startup failures
  const validPort = isNaN(port) ? 3000 : port;

  return {
    port: validPort,
    nodeEnv: process.env.NODE_ENV || 'development',
  };
}

/**
 * Starts the Express Gateway server and registers base routes, auth middleware, and error handlers.
 * 
 * @returns {Promise<void>} Resolves when server is bound and listening
 */
export async function startGatewayServer(): Promise<void> {
  try {
    const config = getGatewayConfig();
    const app: Express = express();

    // 1. Standard JSON body parser for incoming gateway payloads
    app.use(express.json());

    // 2. Health check endpoint (exempt from API key auth for container orchestrators and load balancers)
    app.get('/health', (_req: Request, res: Response) => {
      res.status(200).json({ status: 'ok', service: 'gateway', timestamp: new Date().toISOString() });
    });

    // 3. API Key Authentication Middleware
    // Validates caller identity against Redis / PostgreSQL BEFORE allowing access to downstream services
    app.use(apiKeyAuth);

    // 4. Key Management Endpoints (Requires ADMIN scope)
    app.use('/api/keys', requireScope(ApiKeyScope.ADMIN), keyRouter);

    // 5. Downstream Proxy Route Handler (Stub representing upstream service proxy forwarding)
    app.all('/v1/proxy/*', (req: Request, res: Response) => {
      // Downstream middleware and handlers now have guaranteed access to req.apiKey
      res.status(200).json({
        message: 'Proxy request received and authenticated',
        path: req.path,
        method: req.method,
        client: {
          id: req.apiKey?.id,
          name: req.apiKey?.name,
          scopes: req.apiKey?.scopes,
          rateLimit: req.apiKey?.rateLimit,
        },
        timestamp: new Date().toISOString(),
      });
    });

    // Root catch-all for authenticated gateway routes
    app.get('/', (req: Request, res: Response) => {
      res.status(200).json({
        message: 'GateForge API Gateway',
        authenticatedAs: req.apiKey?.name,
        scopes: req.apiKey?.scopes,
      });
    });

    // 6. Global uncaught express error handler to ensure JSON errors are returned instead of HTML stacktraces
    app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
      // Log full error context for debugging in container stdout logs
      console.error('[Gateway Error Context]:', { message: err.message, stack: err.stack });
      res.status(500).json({ error: 'Internal Gateway Error', message: err.message });
    });

    const server = app.listen(config.port, () => {
      console.log(`[Gateway] Gateway service running on port ${config.port} (${config.nodeEnv})`);
    });

    // Graceful shutdown handling for container terminations
    const gracefulShutdown = async (signal: string): Promise<void> => {
      console.log(`[Gateway] Received ${signal}. Starting graceful shutdown...`);
      server.close(async () => {
        try {
          await redis.quit();
          await prisma.$disconnect();
          console.log('[Gateway] Closed database and Redis connections cleanly.');
          process.exit(0);
        } catch (closeErr) {
          console.error('[Gateway] Error during shutdown cleanup:', closeErr);
          process.exit(1);
        }
      });
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  } catch (error) {
    // Log explicit failure reason when initialization or socket binding throws
    console.error('[Gateway Fatal Startup Failure]:', {
      error: error instanceof Error ? error.message : String(error),
      attemptedAt: new Date().toISOString(),
    });
    process.exit(1);
  }
}

// Boot up the gateway service
startGatewayServer();
