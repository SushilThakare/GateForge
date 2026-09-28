---
trigger: always_on
---

---
name: prompting-guide
description: How to prompt the agent effectively for each phase of GateForge
---

# Prompting Best Practices for GateForge

## General Rules
1. Always specify the PHASE you're working on
2. Reference the architecture skill when making structural decisions
3. Ask for explanations after every change
4. Be specific about file locations and naming conventions
5. Ask the agent to create tests alongside the implementation

## Anti-Patterns (DON'T do this)
- "Build the entire gateway" → too vague, you'll get a mess
- "Add rate limiting" → doesn't specify algorithm, storage, or where in the middleware chain
- "Make it work" → no context, no learning

## Good Patterns (DO this)
- "Implement the sliding window rate limiter in packages/gateway/src/rateLimit/slidingWindow.ts. Use Redis ZSET for tracking. Explain the algorithm step by step."
- "Create the BullMQ log producer that queues request metadata. Explain why we use a queue instead of writing directly to the database."
- "Write integration tests for the rate limiter. Test: normal request, rate-limited request, window reset. Use Jest + Supertest."
