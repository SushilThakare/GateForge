/**
 * @file packages/gateway/src/index.ts
 * @description Entry point for the GateForge Gateway service.
 * The Gateway service sits at the edge of the architecture, intercepting incoming HTTP requests,
 * evaluating rate limits, validating API keys, and reverse-proxying traffic to upstream services.
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';

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
 * Starts the Express Gateway server and registers base routes and global error handlers.
 * 
 * @returns {Promise<void>} Resolves when server is bound and listening
 */
export async function startGatewayServer(): Promise<void> {
  try {
    const config = getGatewayConfig();
    const app: Express = express();

    // Standard JSON body parser for incoming gateway payloads
    app.use(express.json());

    // Health check endpoint to verify service readiness in container orchestrators
    app.get('/health', (_req: Request, res: Response) => {
      res.status(200).json({ status: 'ok', service: 'gateway', timestamp: new Date().toISOString() });
    });

    // Global uncaught express error handler to ensure JSON errors are returned instead of HTML stacktraces
    app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
      // Log full error context for debugging in container stdout logs
      console.error('[Gateway Error Context]:', { message: err.message, stack: err.stack });
      res.status(500).json({ error: 'Internal Gateway Error', message: err.message });
    });

    app.listen(config.port, () => {
      console.log(`[Gateway] Gateway service running on port ${config.port} (${config.nodeEnv})`);
    });
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
