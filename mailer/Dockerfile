# syntax=docker/dockerfile:1

# ── build ────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

# Manifests before sources: dependencies re-resolve only when they actually
# change, so editing src/ reuses the installed layer instead of paying npm ci.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ── production dependencies ──────────────────────────────────────────────────
# A separate install so typescript and @types/* never reach the final image.
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ── runtime ──────────────────────────────────────────────────────────────────
FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps  /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

# node:alpine ships an unprivileged `node` user (uid 1000).
USER node
EXPOSE 8790

# Not `npm start` - that runs `node --env-file=.env`, and here the configuration
# arrives as real environment variables from a Secret and a ConfigMap.
CMD ["node", "dist/server.js"]
