---
name: chart-patterns
description: Standardized chart component implementation guidelines for GateForge telemetry analytics.
---

# Chart Component Patterns Skill

## Recommended Libraries & Usage
- Use **Recharts** or **Tremor** for dashboard visual telemetry.
- Always wrap responsive containers (`ResponsiveContainer` in Recharts) with fixed aspect ratios or min-heights to prevent layout shifts.

## Key Dashboard Visualizations
1. **Time-Series Request Volume**: Line/Area chart displaying requests per minute aggregated over time.
2. **Latency Distribution**: Bar chart / histogram showing response time latency metrics (p50, p95, p99).
3. **HTTP Status Breakdown**: Pie/Donut chart illustrating status code distribution (2xx success vs 4xx/429 rate limits vs 5xx errors).
4. **Key Quota Gauges**: Progress indicators for remaining rate-limit quotas per active API Key.
