FROM node:20-alpine

WORKDIR /app

# Copy monorepo manifests
COPY package*.json ./
COPY packages/worker/package*.json ./packages/worker/

# Install dependencies across workspaces
RUN npm install

# Copy source files
COPY packages/worker ./packages/worker
COPY prisma ./prisma

# Build TypeScript worker output
RUN npm run build --workspace=packages/worker

CMD ["npm", "run", "start", "--workspace=packages/worker"]
