# Multi-stage Dockerfile for Production Deployment
# Optimized for AWS App Runner, AWS ECS, or any Container Service

# Stage 1: Build the React + Vite frontend
FROM node:22-alpine AS builder
WORKDIR /app

# Install dependencies with frozen lockfile
COPY package*.json ./
RUN npm ci

# Copy source code and build client
COPY . .
RUN npm run build

# Stage 2: Production Runtime
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000

# Install production dependencies only
COPY package*.json ./
RUN npm ci --only=production

# Copy built frontend assets from builder
COPY --from=builder /app/dist ./dist

# Copy backend files and configurations
COPY server.js ./
COPY src/ ./src/

# Create directories for private session recordings and temporary streamed uploads
RUN mkdir -p /app/uploads/recordings /app/uploads/tmp && chown -R node:node /app

# Run with non-root security privileges
USER node

EXPOSE 5000

# Healthcheck to ensure container availability via dedicated /api/health probe
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/health || exit 1

CMD ["node", "server.js"]

