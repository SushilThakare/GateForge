# =============================================================================
# packages/gateway/Dockerfile
# Multi-stage production Dockerfile for the GateForge Gateway service.
#
# WHY multi-stage:
#   Stage 1 (builder) installs ALL deps (including devDeps) and compiles TypeScript.
#   Stage 2 (runner) starts clean, copies only the compiled JS + prod deps.
#   Result: final image has NO TypeScript compiler, no source files, no test code.
# =============================================================================

# ── Stage 1: Builder ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

# Prisma needs openssl at build time to generate the correct native client binary.
# libc6-compat satisfies glibc shims required by some native add-ons on Alpine.
RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

# Copy monorepo root manifests first — Docker layer-caches this step as long as
# these files don't change, which avoids re-downloading all node_modules on
# every source-code change.
COPY package*.json ./
COPY packages/gateway/package*.json ./packages/gateway/

# Install ALL dependencies (devDeps included) so TypeScript can compile.
# --ignore-scripts prevents post-install scripts from running prematurely.
RUN npm ci --ignore-scripts

# Copy Prisma schema before generating so the client binary matches the schema.
COPY prisma ./prisma

# Generate the Prisma Client targeting the Alpine Linux OpenSSL 3.x binary.
# The schema.prisma binaryTargets field includes "linux-musl-openssl-3.0.x".
RUN npx prisma generate

# Copy the gateway source code.
COPY packages/gateway ./packages/gateway

# Compile TypeScript → JavaScript (outputs to packages/gateway/dist).
RUN npm run build --workspace=packages/gateway


# ── Stage 2: Production Runner ────────────────────────────────────────────────
FROM node:20-alpine AS runner

# Runtime openssl is still needed by the Prisma engine binary inside the container.
RUN apk add --no-cache openssl libc6-compat

# Run as a non-root user for security — principle of least privilege.
# The `node` user is pre-created in the official node image.
USER node

WORKDIR /app

# Copy only the monorepo root + gateway package manifests (no devDeps in this layer).
COPY --chown=node:node package*.json ./
COPY --chown=node:node packages/gateway/package*.json ./packages/gateway/

# Install ONLY production dependencies (no TypeScript, jest, etc.).
# This is the primary reason the final image is significantly smaller.
RUN npm ci --omit=dev --ignore-scripts

# Copy the generated Prisma client from the builder (contains the native binary).
COPY --chown=node:node --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --chown=node:node --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --chown=node:node prisma ./prisma

# Copy the compiled JavaScript output — NOT the TypeScript source files.
COPY --chown=node:node --from=builder /app/packages/gateway/dist ./packages/gateway/dist

# Expose the gateway HTTP port. The actual port value is read from $GATEWAY_PORT
# at runtime, but 3000 is the documented default.
EXPOSE 3000

# Health check so Docker/Compose knows when the gateway is ready to serve traffic.
# The /health endpoint is a lightweight Express route that returns 200 OK.
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# Start the compiled JS directly with node (faster startup, no TypeScript overhead).
CMD ["node", "packages/gateway/dist/index.js"]
