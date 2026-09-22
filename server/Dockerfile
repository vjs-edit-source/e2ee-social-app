# syntax=docker/dockerfile:1
FROM node:20-alpine AS base

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy application source
COPY . .

# Create volume mount directory for zero-knowledge data store
RUN mkdir -p /app/data && chown -R node:node /app

USER node

EXPOSE 4000 8080

ENV NODE_ENV=production
ENV DATA_DIR=/app/data

CMD ["node", "index.js"]

