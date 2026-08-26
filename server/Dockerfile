# syntax=docker/dockerfile:1
FROM node:20-alpine AS base

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application source
COPY . .

# Create volume mount directory for zero-knowledge data store
RUN mkdir -p /app/data && chown -R node:node /app

USER node

EXPOSE 4000

ENV PORT=4000
ENV NODE_ENV=production
ENV DATA_DIR=/app/data

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/health || exit 1

CMD ["node", "index.js"]
