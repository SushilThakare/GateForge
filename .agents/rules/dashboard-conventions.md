---
trigger: always_on
---

# Dashboard Conventions Rule

## Architecture Rules
1. **Server Components First**: Server components handle initial DB fetching. Client components are reserved strictly for interactive state and client-side charts.
2. **Error Boundaries & Loading UI**: Every route folder in `src/app` must include `loading.tsx` and `error.tsx` for graceful fallbacks.
3. **Strict TypeScript Types**: All API route inputs/outputs must be typed using Zod or explicit TypeScript interfaces.
