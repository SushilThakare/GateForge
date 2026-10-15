# =============================================================================
# packages/dashboard/Dockerfile
# Multi-stage production Dockerfile for the GateForge Dashboard (Next.js 14).
#
# Uses `output: 'standalone'` in next.config.js so the final image contains
# only the traced production files — not all of node_modules.
# =============================================================================

# ── Stage 1: Builder ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

# Copy monorepo root and dashboard manifests.
COPY package*.json ./
COPY packages/dashboard/package*.json ./packages/dashboard/

# Install all dependencies needed for the Next.js build step.
RUN npm ci --ignore-scripts

# Copy Prisma schema so the client can be generated before the build.
COPY prisma ./prisma
RUN npx prisma generate

# Copy the dashboard source.
COPY packages/dashboard ./packages/dashboard

# NEXT_TELEMETRY_DISABLED=1 opts out of anonymous usage statistics during build.
ENV NEXT_TELEMETRY_DISABLED=1

# Build Next.js — with output: 'standalone' this creates:
#   .next/standalone  → self-contained server (node server.js)
#   .next/static      → compiled CSS/JS chunks (must be copied manually)
RUN npm run build --workspace=packages/dashboard


# ── Stage 2: Production Runner ────────────────────────────────────────────────
FROM node:20-alpine AS runner

RUN apk add --no-cache openssl libc6-compat

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Non-root user for security.
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

WORKDIR /app

# The standalone output includes its own minimal server.js and the exact
# node_modules subset it needs — we copy only those three directories.

# 1. The standalone server bundle (server.js + minimal node_modules).
COPY --chown=nextjs:nodejs --from=builder /app/packages/dashboard/.next/standalone ./

# 2. Static assets (CSS, JS chunks) — must be served from the same process.
COPY --chown=nextjs:nodejs --from=builder /app/packages/dashboard/.next/static ./packages/dashboard/.next/static

# 3. Public folder (favicons, images, etc.).
COPY --chown=nextjs:nodejs --from=builder /app/packages/dashboard/public ./packages/dashboard/public

USER nextjs

# The standalone server listens on PORT (defaults to 3000 inside the container).
# We map host 3001 → container 3001 in docker-compose.
ENV PORT=3001
ENV HOSTNAME="0.0.0.0"

EXPOSE 3001

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

# Run the standalone Next.js server — no `next start` needed, just `node`.
CMD ["node", "packages/dashboard/.next/standalone/packages/dashboard/server.js"]
