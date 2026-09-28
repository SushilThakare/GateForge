---
trigger: always_on
---

--
name
: rate-limit-algorithms
description
: Reference for rate limiting algorithms used in GateForge
---
# Rate Limiting Algorithms
## Sliding Window Log
- Track each request timestamp in a sorted set (Redis ZSET)
- On new request: remove entries older than window,
- Pros: Precise
,
no burst at window boundary
- Cons: Memory grows with request count
count remaining
## Sliding Window Counter (Hybrid)
- Com
b
ine fixed window counters with weighted overlap
- Formula: rate = prev_window_count * overlap_percentage + current_window_count
- Pros: Memory efficient, smooth rate estimation
- Cons:
Approximate (not exact)
## Token Bucket
-
Bucket starts full of tokens (capacity = burst limit)
- Each request consumes 1 token
- Tokens refill at a constant rate
- Pros:
Allows bursts,
intuitive
, widely used (AWS, Stripe)
- Cons: Slightly more complex to implement correctly
## Implementation Notes
- Use Redis Lua scripts for atomic operations (check + increment must b
e atomic)
- Return X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset headers
- Return Retry-
After header on 429 responses