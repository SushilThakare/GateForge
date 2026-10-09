FROM node:20-alpine

# Install OpenSSL and compatibility libraries required by Prisma Client on Alpine Linux
RUN apk add --no-cache openssl openssl1.1-compat libc6-compat 2>/dev/null || apk add --no-cache openssl libc6-compat

WORKDIR /app

# Copy monorepo manifests
COPY package*.json ./
COPY packages/gateway/package*.json ./packages/gateway/

# Install dependencies across workspaces
RUN npm install

# Copy source files
COPY packages/gateway ./packages/gateway
COPY prisma ./prisma

# Generate Prisma client types from schema before compilation
RUN npx prisma generate

# Build TypeScript gateway output
RUN npm run build --workspace=packages/gateway

EXPOSE 3000

CMD ["npm", "run", "start", "--workspace=packages/gateway"]
