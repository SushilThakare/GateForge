---
name: prisma-dashboard-queries
description: Optimized Prisma queries for aggregated telemetry and API key metrics in GateForge.
---

# Prisma Dashboard Queries Skill

## Efficient Telemetry Aggregation
- **Grouped Request Counts**:
  Use `prisma.requestLog.groupBy()` to calculate request totals, status counts, or per-key request distributions without loading entire datasets into RAM.
- **Indexing Awareness**:
  Always query `RequestLog` using indexed fields: `[apiKeyId, timestamp]` or `[timestamp]`.
- **Pagination**:
  Use cursor-based or `skip`/`take` pagination for tabular request log feeds to keep memory consumption low.
