FROM node:20-alpine

WORKDIR /app

# Copy monorepo manifests
COPY package*.json ./
COPY packages/gateway/package*.json ./packages/gateway/

# Install dependencies across workspaces
RUN npm install

# Copy source files
COPY packages/gateway ./packages/gateway
COPY prisma ./prisma

# Build TypeScript gateway output
RUN npm run build --workspace=packages/gateway

EXPOSE 3000

CMD ["npm", "run", "start", "--workspace=packages/gateway"]
