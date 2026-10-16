FROM node:20-alpine AS builder

WORKDIR /app

# Copy package manifests
COPY package*.json ./
COPY shared/package*.json ./shared/
COPY server/package*.json ./server/
COPY web/package*.json ./web/

# Install dependencies for building
RUN npm ci

# Copy source files
COPY shared/ ./shared/
COPY server/ ./server/
COPY web/ ./web/

# Build web frontend and server backend
RUN npm run build -w web
RUN npm run build -w server

# Production runner stage
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Copy package manifests for runtime install
COPY package*.json ./
COPY shared/package*.json ./shared/
COPY server/package*.json ./server/
COPY web/package*.json ./web/

# Install production dependencies only
RUN npm ci --omit=dev

# Copy built code and assets
COPY --from=builder /app/shared/ ./shared/
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/prompts ./server/prompts
COPY --from=builder /app/web/dist ./web/dist

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "server/dist/index.js"]
