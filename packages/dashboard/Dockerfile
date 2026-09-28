FROM node:20-alpine

WORKDIR /app

# Copy monorepo manifests
COPY package*.json ./
COPY packages/dashboard/package*.json ./packages/dashboard/

# Install dependencies across workspaces
RUN npm install

# Copy source files
COPY packages/dashboard ./packages/dashboard
COPY prisma ./prisma

# Build Next.js app output
RUN npm run build --workspace=packages/dashboard

EXPOSE 3001

CMD ["npm", "run", "start", "--workspace=packages/dashboard"]
