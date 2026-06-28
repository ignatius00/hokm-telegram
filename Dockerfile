# ── Stage 1: Build client ─────────────────────────────────────────────────
FROM node:20-alpine AS client-build
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/
RUN npm ci
COPY client/ ./client/
WORKDIR /app/client
RUN npm run build

# ── Stage 2: Build server ─────────────────────────────────────────────────
FROM node:20-alpine AS server-build
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/
RUN npm ci
COPY server/ ./server/
WORKDIR /app/server
RUN npm run build

# ── Stage 3: Production ───────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

# Copy the whole workspace so node_modules resolution works
COPY package.json package-lock.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/
RUN npm ci --omit=dev

# Copy built artifacts
COPY --from=server-build /app/server/dist ./server/dist
COPY --from=client-build /app/client/dist ./client/dist

# Environment
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000
WORKDIR /app/server
CMD ["node", "dist/main.js"]
