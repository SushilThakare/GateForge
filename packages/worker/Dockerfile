FROM node:20-alpine

# Install OpenSSL and compatibility libraries required by Prisma Client on Alpine Linux
RUN apk add --no-cache openssl openssl1.1-compat libc6-compat 2>/dev/null || apk add --no-cache openssl libc6-compat

WORKDIR /app

# Copy monorepo manifests
COPY package*.json ./
COPY packages/worker/package*.json ./packages/worker/

# Install dependencies across workspaces
RUN npm install

# Copy source files
COPY packages/worker ./packages/worker
COPY prisma ./prisma

# Generate Prisma client types from schema before compilation
RUN npx prisma generate

# Build TypeScript worker output
RUN npm run build --workspace=packages/worker

CMD ["npm", "run", "start", "--workspace=packages/worker"]
