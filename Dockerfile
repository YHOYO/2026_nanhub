# ============================================
# NaNProxy - All-in-one Docker Container
# ============================================

# Build stage
FROM node:18-alpine AS builder

# Install build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev for build)
RUN npm install

# Copy source code
COPY . .

# ============================================
# Production stage
# ============================================

FROM node:18-alpine AS production

# Install runtime dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

# Create app user (non-root)
RUN addgroup -g 1001 -S nanproxy && \
    adduser -S nanproxy -u 1001 -G nanproxy

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy source code from builder
COPY --from=builder /app/src ./src

# Create necessary directories (use /data for persistent storage on NaN Cloud)
RUN mkdir -p /data logs && \
    chown -R nanproxy:nanproxy /app /data

# Switch to non-root user
USER nanproxy

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080
ENV DATABASE_PATH=/data/nanproxy.db

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Start application
CMD ["node", "src/index.js"]