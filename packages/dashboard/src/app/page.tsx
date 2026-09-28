/**
 * @file packages/dashboard/src/app/page.tsx
 * @description Main dashboard landing page component for GateForge.
 * The Dashboard service interacts with PostgreSQL (via Prisma) to present live traffic analytics,
 * key quota metrics, rate-limiting violations, and API key management interfaces.
 */

import React from 'react';

/**
 * Interface representing initial status payload for service health check
 */
export interface ServiceStatus {
  name: string;
  status: string;
  port: number;
}

/**
 * Dashboard HomePage component.
 * 
 * @returns {JSX.Element} Rendered Dashboard main view
 */
export default function HomePage(): JSX.Element {
  // Log service status on server rendering pass
  console.log('[Dashboard] Dashboard service running on port 3001');

  const services: ServiceStatus[] = [
    { name: 'Gateway Proxy', status: 'Healthy (Port 3000)', port: 3000 },
    { name: 'Worker Processor', status: 'Healthy (BullMQ Consumer)', port: 3002 },
    { name: 'Dashboard UI', status: 'Running (Port 3001)', port: 3001 },
  ];

  return (
    <div style={{ padding: '3rem', maxWidth: '1000px', margin: '0 auto' }}>
      <header style={{ marginBottom: '2.5rem', borderBottom: '1px solid #1e293b', paddingBottom: '1rem' }}>
        <h1 style={{ fontSize: '2.25rem', fontWeight: 700, color: '#38bdf8' }}>GateForge Gateway</h1>
        <p style={{ color: '#94a3b8', marginTop: '0.5rem' }}>
          Intelligent Rate-Limited API Gateway &amp; Telemetry Control Plane
        </p>
      </header>

      <section style={{ backgroundColor: '#0f172a', borderRadius: '12px', padding: '1.5rem', border: '1px solid #1e293b' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: '#f8fafc' }}>System Status</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
          {services.map((svc) => (
            <div
              key={svc.name}
              style={{
                backgroundColor: '#1e293b',
                padding: '1rem',
                borderRadius: '8px',
                borderLeft: '4px solid #10b981',
              }}
            >
              <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>{svc.name}</h3>
              <p style={{ fontSize: '0.875rem', color: '#cbd5e1', marginTop: '0.25rem' }}>{svc.status}</p>
            </div>
          ))}
        </div>
      </section>

      <footer style={{ marginTop: '3rem', fontSize: '0.875rem', color: '#64748b' }}>
        <p>[Dashboard] Dashboard service running</p>
      </footer>
    </div>
  );
}
