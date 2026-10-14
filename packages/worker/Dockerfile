# =============================================================================
# packages/worker/Dockerfile
# Multi-stage production Dockerfile for the GateForge Worker service.
#
# The worker consumes BullMQ jobs from Redis and writes log telemetry to
# Postgres via Prisma. Same two-stage pattern as the gateway Dockerfile.
# =============================================================================

# ── Stage 1: Builder ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

# Layer-cache package manifests separately from source code.
COPY package*.json ./
COPY packages/worker/package*.json ./packages/worker/

# Install all deps (dev + prod) required to compile TypeScript.
RUN npm ci --ignore-scripts

COPY prisma ./prisma

# Generate the Prisma Client binary for Alpine Linux.
RUN npx prisma generate

COPY packages/worker ./packages/worker

# Compile TypeScript → JavaScript (outputs to packages/worker/dist).
RUN npm run build --workspace=packages/worker


# ── Stage 2: Production Runner ────────────────────────────────────────────────
FROM node:20-alpine AS runner

RUN apk add --no-cache openssl libc6-compat

# Non-root user for security.
USER node

WORKDIR /app

COPY --chown=node:node package*.json ./
COPY --chown=node:node packages/worker/package*.json ./packages/worker/

# Production-only dependencies — no TypeScript compiler in the final image.
RUN npm ci --omit=dev --ignore-scripts

# Copy Prisma native binary from builder stage.
COPY --chown=node:node --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --chown=node:node --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --chown=node:node prisma ./prisma

# Copy compiled worker output only.
COPY --chown=node:node --from=builder /app/packages/worker/dist ./packages/worker/dist

# The worker doesn't expose an HTTP port (it's a background process consumer),
# but we include a process-level health check via BullMQ queue ping.
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "const {Redis} = require('ioredis'); \
    const r = new Redis(process.env.REDIS_URL || 'redis://redis:6379', {lazyConnect:true, connectTimeout:5000}); \
    r.connect().then(()=>r.ping()).then(()=>process.exit(0)).catch(()=>process.exit(1))"

CMD ["node", "packages/worker/dist/index.js"]
