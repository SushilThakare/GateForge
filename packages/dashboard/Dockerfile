FROM node:20-alpine

# Install OpenSSL and compatibility libraries required by Prisma Client on Alpine Linux
RUN apk add --no-cache openssl openssl1.1-compat libc6-compat 2>/dev/null || apk add --no-cache openssl libc6-compat

WORKDIR /app

# Copy monorepo manifests
COPY package*.json ./
COPY packages/dashboard/package*.json ./packages/dashboard/

# Install dependencies across workspaces
RUN npm install

# Copy source files
COPY packages/dashboard ./packages/dashboard
COPY prisma ./prisma

# Generate Prisma client types from schema before compilation
RUN npx prisma generate

# Build Next.js app output
RUN npm run build --workspace=packages/dashboard

EXPOSE 3001

CMD ["npm", "run", "start", "--workspace=packages/dashboard"]
