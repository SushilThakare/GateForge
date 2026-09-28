---
trigger: always_on
---

---
name: project-architecture
description: Explains GateForge's architecture, data flow, and component responsibilities
---

# GateForge Architecture

## Data Flow
1. Client sends request → Gateway receives it
2. Gateway checks API key → validates against PostgreSQL (cached in Redis)
3. Gateway checks rate limit → Redis sliding window / token bucket
4. If allowed: proxy request to target API, log to BullMQ queue
5. If rate limited: return 429 with retry-after header
6. Worker processes log queue → writes to PostgreSQL
7. Worker periodically runs anomaly detection → feeds traffic patterns to LLM
8. Dashboard reads from PostgreSQL → displays analytics

## Component Responsibilities
- **Gateway**: Stateless proxy. Only reads from Redis/DB. Writes to BullMQ queue. MUST be fast (<2ms overhead).
- **Worker**: Stateless consumer. Reads from BullMQ. Writes to PostgreSQL. Runs AI analysis. Can be slow.
- **Dashboard**: Read-only UI. Reads from PostgreSQL via API routes. No direct Redis/queue access.

## Key Design Decisions
- Gateway and Worker are separate processes (not in the same Node.js instance) for isolation
- Redis is the source of truth for rate limits (not PostgreSQL — too slow)
- Logs go through BullMQ (not direct DB write) to avoid slowing down the proxy
- PostgreSQL for structured data (keys, logs, config). Redis for ephemeral data (rate limit counters, caches)
