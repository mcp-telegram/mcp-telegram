FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ src/
RUN npx tsc

FROM node:22-alpine
WORKDIR /app
# Runtime dependencies only: dev tooling (TypeScript, Biome, test runners) has no
# business in the image that holds a Telegram session.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=builder /app/dist ./dist
ENTRYPOINT ["node", "dist/index.js"]
