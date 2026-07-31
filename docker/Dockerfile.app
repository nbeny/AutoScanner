# Generic image builder for a NestJS app in the AutoScanner monorepo.
# Build with --build-arg APP=<nx project name> (e.g. api-gateway) and run
# `node dist/apps/<APP>/main.js`. Compose services may override the command
# (e.g. to run `prisma migrate deploy` first).
FROM node:22-slim AS base

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Monorepo build (simple, correct). COPY respects .dockerignore, so host
# node_modules/dist are not shipped — pnpm regenerates them in-image.
COPY . .
ARG APP
RUN corepack enable \
  && pnpm install --frozen-lockfile \
  && pnpm prisma generate \
  && pnpm nx build "$APP"

RUN useradd --create-home --uid 10001 appuser \
  && chown -R appuser:appuser /app
USER appuser

ENV APP=${APP}
CMD ["sh", "-c", "node dist/apps/${APP}/main.js"]
