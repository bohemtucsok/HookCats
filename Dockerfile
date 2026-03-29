# Multi-stage build for Node.js webhook server
# Stage 1: Build stage
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm ci --omit=dev && npm cache clean --force && rm -f package-lock.json node_modules/.package-lock.json

# Stage 2: Production stage
FROM node:18-alpine AS production

# Update system packages (fix CVEs), install curl for health checks, remove npm/yarn (not needed at runtime)
RUN apk upgrade --no-cache && apk add --no-cache curl && \
    rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
           /opt/yarn-* /usr/local/bin/yarn /usr/local/bin/yarnpkg

# Create app user for security (non-root)
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy node_modules from builder stage
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copy application source code
COPY --chown=nodejs:nodejs package.json ./
COPY --chown=nodejs:nodejs src/ ./src/
COPY --chown=nodejs:nodejs docker-entrypoint.sh ./

# Create necessary directories with proper permissions
RUN mkdir -p /app/logs && chown -R nodejs:nodejs /app && \
    chmod +x /app/docker-entrypoint.sh

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 6688

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:6688/health || exit 1

# Environment variables (can be overridden by docker-compose)
ENV NODE_ENV=production
ENV PORT=6688
ENV LOG_LEVEL=info

# Start the application with migrations
CMD ["./docker-entrypoint.sh"]