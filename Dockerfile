# syntax=docker/dockerfile:1

# Base image with Node 20 LTS
FROM node:20-bullseye-slim AS base
WORKDIR /app

# Install production dependencies first (leverages Docker layer cache)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source
COPY . .

# Expose runtime port
EXPOSE 3000

# Default environment settings
ENV NODE_ENV=production \
    PORT=3000

# Start the backend API
CMD ["node", "server.js"]
