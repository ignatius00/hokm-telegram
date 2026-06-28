# ── Stage 1: Build client ─────────────────────────────────────────────────
FROM node:20-alpine AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ── Stage 2: Build server ─────────────────────────────────────────────────
FROM node:20-alpine AS server-build
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npm run build

# ── Stage 3: Production ───────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

# Copy server production artifacts
COPY server/package*.json ./server/
WORKDIR /app/server
RUN npm ci --omit=dev
COPY --from=server-build /app/server/dist ./dist

# Copy built client
COPY --from=client-build /app/client/dist /app/client/dist

# Environment
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "dist/main.js"]
