# Dockerfile for BunSNC
# Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]

FROM oven/bun:1-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy dependency files
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile --production

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app

# Copy dependency files and source
COPY package.json bun.lockb* ./
COPY . .

# Install all dependencies (including dev dependencies)
RUN bun install --frozen-lockfile

# Build the application
RUN bun run build

# Compile CLI binary
RUN bun compile src/cli/index.ts --out dist/bunsnc

# Production image
FROM oven/bun:1-alpine AS runner
WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 bunuser

# Install curl for health checks
RUN apk add --no-cache curl

# Copy production dependencies
COPY --from=deps --chown=bunuser:nodejs /app/node_modules ./node_modules

# Copy built application
COPY --from=builder --chown=bunuser:nodejs /app/dist ./dist
COPY --from=builder --chown=bunuser:nodejs /app/src ./src
COPY --from=builder --chown=bunuser:nodejs /app/package.json ./

# Switch to non-root user
USER bunuser

# Expose port
EXPOSE 3008

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3008/health || exit 1

# Default command
CMD ["bun", "run", "start", "--port", "3008"]