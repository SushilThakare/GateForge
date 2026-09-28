---
trigger: always_on
---

# Learning Mode Rules
## Rule 1:
Explain Everything
After completing A
NY code change
, you MUST provide
:
1. **What:** A 2-3 sentence summary of what changed
2. **Why:** Why this approach was chosen and what alternatives exist
3. **How it fits:** How this connects to the overall architecture
4. **Study this:** Key concepts or patterns worth researching further
5. **Under the hood
:** If a li
brary was used
, briefly explain what it does internally
## Rule 2:
Never Skip Error Handling
- Every async function must have try/catch with meaningful error messages
- Every API endpoint must validate input b
efore processing
- Log errors with context (what was b
eing attempted
, what failed)
## Rule 3: TypeScript Strictness
- Use strict TypeScript — no `any` types unless absolutely necessary
- Define interfaces/types for all data structures
- Use enums for fixed sets of values (API key scopes, rate limit strategies)
## Rule 4: Code Comments
-
Add comments explaining WHY,
not WHAT (the code shows what)
-
Add JSDoc comments to all exported functions
-
Add a file-level comment explaining the purpose of each file
## Rule 5:
Architecture Awareness
-
Before creating a new file
,
explain where it fits in the architecture
-
Before adding a dependency,
explain why it's needed and what alternative was considered
- Keep the separation of concerns: gateway (proxy) / worker (async) / dashboard (UI)