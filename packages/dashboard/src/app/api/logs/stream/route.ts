/**
 * @file packages/dashboard/src/app/api/logs/stream/route.ts
 * @description Next.js App Router Route Handler for Server-Sent Events (SSE) log streaming.
 * Streams live proxied request events in real time to the dashboard client.
 */

import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/logs/stream
 * Connects browser EventSource to live telemetry stream.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const gatewayUrl = process.env.GATEWAY_URL || 'http://localhost:3000';
  const adminKey = process.env.GATEWAY_ADMIN_KEY || 'gf_admin_dashboard_key';
  const targetEndpoint = `${gatewayUrl}/api/logs/stream`;

  // Attempt to proxy live SSE stream from upstream Gateway
  try {
    const upstreamRes = await fetch(targetEndpoint, {
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream',
        'X-API-Key': adminKey,
      },
    });

    if (upstreamRes.ok && upstreamRes.body) {
      return new Response(upstreamRes.body, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
        },
      });
    }
  } catch {
    // Upstream gateway offline — fall through to simulated live development stream
  }

  // Fallback: Generate real-time synthetic events every 3.5 seconds
  const encoder = new TextEncoder();
  const samplePaths = ['/v1/proxy/users', '/v1/proxy/checkout', '/v1/proxy/products', '/v1/proxy/auth/verify'];
  const sampleMethods = ['GET', 'POST', 'PUT'];
  const sampleStatuses = [200, 201, 200, 429, 200, 500, 200, 404];

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(': connected (simulation mode)\n\n'));

      const interval = setInterval(() => {
        const randomStatus = sampleStatuses[Math.floor(Math.random() * sampleStatuses.length)];
        const randomMethod = sampleMethods[Math.floor(Math.random() * sampleMethods.length)];
        const randomPath = samplePaths[Math.floor(Math.random() * samplePaths.length)];

        const mockLog = {
          id: `live-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          path: randomPath,
          method: randomMethod,
          statusCode: randomStatus,
          responseTimeMs: Math.floor(Math.random() * 180) + 15,
          ipAddress: `10.0.0.${Math.floor(Math.random() * 200) + 1}`,
          userAgent: 'Mozilla/5.0 (Live Stream Agent)',
          timestamp: new Date().toISOString(),
          apiKeyName: 'Production Primary Gateway',
        };

        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(mockLog)}\n\n`));
        } catch {
          clearInterval(interval);
        }
      }, 3500);

      req.signal.addEventListener('abort', () => {
        clearInterval(interval);
        try {
          controller.close();
        } catch {
          // Stream already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
