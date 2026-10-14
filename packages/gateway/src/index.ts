/**
 * @file packages/gateway/src/index.ts
 * @description Entry point for the GateForge Gateway service.
 * Sits at the network perimeter, intercepting incoming HTTP client traffic.
 * Executes the middleware pipeline in sequence:
 * 1. CORS headers (cors package — allows browser clients to reach the gateway)
 * 2. Body Parsing (JSON)
 * 3. Unauthenticated endpoints (/health)
 * 4. API Key Authentication (apiKeyAuth)
 * 5. Rate Limiting (rateLimitMiddleware → rateLimiter → slidingWindow / tokenBucket)
 * 6. Administrative Management Routes (/api/keys guarded by ADMIN scope)
 * 7. Downstream Proxy & Upstream Forwarding (/v1/proxy/*)
 * 8. Error handling (handles 400 bad JSON and 500 internal errors)
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import { Server } from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import { ApiKeyScope } from '@prisma/client';
import { apiKeyAuth } from './auth/apiKeyAuth.js';
import { requireScope } from './auth/requireScope.js';
import { keyRouter } from './routes/keyRoutes.js';
import { logRouter } from './routes/logRoutes.js';
import { anomalyRouter } from './routes/anomalyRoutes.js';
import { rateLimitMiddleware } from './rateLimit/rateLimitMiddleware.js';
import { prisma } from './lib/prisma.js';
import { redis } from './lib/redis.js';
import { enqueueRequestLog, closeRequestLogsQueue } from './queue/logProducer.js';

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
 * Factory function creating and configuring the Express Gateway application instance.
 * Separated from startGatewayServer() to allow Supertest integration tests to mount
 * the application without binding to a physical TCP socket port.
 *
 * @returns {Express} Configured Express application instance ready for listening or testing
 */
export function createGatewayApp(): Express {
  const app: Express = express();

  // 1. CORS — must come first so browser preflight (OPTIONS) requests are answered
  // immediately without hitting auth or rate limiting middleware.
  app.use(cors({
    origin: process.env.CORS_ORIGIN ?? '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-API-Key', 'Authorization', 'X-Target-Url'],
    exposedHeaders: [
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
      'X-RateLimit-Strategy',
      'Retry-After',
    ],
    maxAge: 86_400,
  }));

  // 2. Standard JSON body parser for incoming gateway payloads
  app.use(express.json());

  // 3. Health check endpoint (exempt from API key auth for container orchestrators and load balancers)
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', service: 'gateway', timestamp: new Date().toISOString() });
  });

  // 4. API Key Authentication Middleware
  // Validates caller identity against Redis / PostgreSQL BEFORE allowing access to downstream services
  app.use(apiKeyAuth);

  // 5. Rate Limiter Middleware
  // Checks per-API-key request quotas atomically using Redis sliding window / token bucket.
  app.use(rateLimitMiddleware);

  // 6. Key Management Endpoints (Requires ADMIN scope)
  app.use('/api/keys', requireScope(ApiKeyScope.ADMIN), keyRouter);

  // 7. Log Viewer & Analytics Endpoints (Requires ADMIN scope)
  app.use('/api/logs', requireScope(ApiKeyScope.ADMIN), logRouter);

  // 8. AI Anomaly Detection Endpoints (Requires ADMIN scope)
  app.use('/api/anomalies', requireScope(ApiKeyScope.ADMIN), anomalyRouter);

  // 9. Downstream Proxy Route Handler & Upstream Forwarding
  app.all('/v1/proxy/*', async (req: Request, res: Response) => {
    const requestStartMs = Date.now();
    const apiKeyId =
      req.apiKey?.id && req.apiKey.id !== '00000000-0000-0000-0000-000000000000'
        ? req.apiKey.id
        : null;

    // Check if an explicit target URL is configured via header or environment variable
    const targetUrlHeader = req.headers['x-target-url'] as string | undefined;
    const targetBase = targetUrlHeader || process.env.UPSTREAM_TARGET_URL;

    if (targetBase) {
      try {
        const proxySubPath = req.params[0] ?? '';
        const targetUrl = new URL(proxySubPath, targetBase.endsWith('/') ? targetBase : `${targetBase}/`).toString();

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const upstreamResponse = await fetch(targetUrl, {
          method: req.method,
          headers: {
            'Content-Type': req.headers['content-type'] || 'application/json',
            'X-Forwarded-For': req.ip || '127.0.0.1',
          },
          body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        const upstreamData = await upstreamResponse.text();

        res.on('finish', () => {
          enqueueRequestLog({
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            responseTimeMs: Date.now() - requestStartMs,
            apiKeyId,
            clientIp: req.ip ?? req.socket?.remoteAddress ?? 'unknown',
            userAgent: (req.headers['user-agent'] as string | undefined) ?? 'unknown',
            timestamp: new Date().toISOString(),
          });
        });

        res.status(upstreamResponse.status).send(upstreamData);
        return;
      } catch (targetErr: unknown) {
        // Target is down / unreachable / timed out -> return HTTP 502 Bad Gateway
        res.on('finish', () => {
          enqueueRequestLog({
            method: req.method,
            path: req.path,
            statusCode: 502,
            responseTimeMs: Date.now() - requestStartMs,
            apiKeyId,
            clientIp: req.ip ?? req.socket?.remoteAddress ?? 'unknown',
            userAgent: (req.headers['user-agent'] as string | undefined) ?? 'unknown',
            timestamp: new Date().toISOString(),
          });
        });

        res.status(502).json({
          error: 'Bad Gateway',
          message: 'Upstream target service is unavailable or timed out.',
          details: targetErr instanceof Error ? targetErr.message : String(targetErr),
        });
        return;
      }
    }

    // Default mock response when no live external upstream target is specified
    res.on('finish', () => {
      enqueueRequestLog({
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        responseTimeMs: Date.now() - requestStartMs,
        apiKeyId,
        clientIp: req.ip ?? req.socket?.remoteAddress ?? 'unknown',
        userAgent: (req.headers['user-agent'] as string | undefined) ?? 'unknown',
        timestamp: new Date().toISOString(),
      });
    });

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

  // Global error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    // Detect JSON body parser syntax errors (malformed request -> 400)
    if ('status' in err && (err as { status: number }).status === 400) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Malformed request payload. Unable to parse JSON.',
        details: err.message,
      });
      return;
    }

    // Log full error context for debugging in container stdout logs
    console.error('[Gateway Error Context]:', { message: err.message, stack: err.stack });
    res.status(500).json({ error: 'Internal Gateway Error', message: err.message });
  });

  return app;
}

/**
 * Starts the Express Gateway server and registers base routes, auth middleware, and error handlers.
 * 
 * @returns {Promise<Server>} Resolves when server is bound and listening
 */
export async function startGatewayServer(): Promise<Server> {
  try {
    const config = getGatewayConfig();
    const app = createGatewayApp();

    const server = app.listen(config.port, () => {
      console.log(`[Gateway] Gateway service running on port ${config.port} (${config.nodeEnv})`);
    });

    // Graceful shutdown handling for container terminations
    const gracefulShutdown = async (signal: string): Promise<void> => {
      console.log(`[Gateway] Received ${signal}. Starting graceful shutdown...`);
      server.close(async () => {
        try {
          // Close BullMQ queue producer
          await closeRequestLogsQueue();
          // Close ioredis connection
          await redis.quit();
          // Disconnect Prisma PostgreSQL connection pool
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

    return server;
  } catch (error) {
    // Log explicit failure reason when initialization or socket binding throws
    console.error('[Gateway Fatal Startup Failure]:', {
      error: error instanceof Error ? error.message : String(error),
      attemptedAt: new Date().toISOString(),
    });
    process.exit(1);
  }
}

// Boot up the gateway service in non-test environments
if (process.env.NODE_ENV !== 'test') {
  startGatewayServer();
}
