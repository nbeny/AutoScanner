# AutoScanner

Single-operator pentest / red-team platform: asset discovery, sandboxed orchestration of Kali tools, finding correlation, reporting.

> **Phase 0** is the foundation: monorepo, dev stack, auth, Prisma. Scanner orchestration, parsers, correlation, and frontend land in subsequent phases. See `docs/superpowers/specs/` for the full design and `docs/superpowers/plans/` for phase plans.

## Stack

Nx 20 monorepo · NestJS 11 · Prisma 6 · PostgreSQL 16 · Redis 7 · MongoDB 7 · MinIO · TypeScript 5.7 · GraphQL (Apollo, code-first) · Pino · Prometheus.

## Quickstart (Phase 0)

Prerequisites: Node 22 (`nvm use`), pnpm 9, Docker Desktop / Docker Engine v25+.

```bash
git clone <repo> && cd autoscanner
pnpm install
cp .env.example .env
# Generate secure secrets and paste into .env:
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('MASTER_ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('base64'))"

# Bring up dev dependencies:
pnpm dev:up                  # postgres + redis + mongo + minio
pnpm prisma migrate deploy
pnpm seed                    # creates operator user from OPERATOR_EMAIL/PASSWORD

# Run the API:
pnpm nx serve api-gateway
```

In another terminal:

```bash
# Login (REST):
curl -sX POST http://localhost:4000/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"admin@autoscanner.local","password":"changeme"}'

# Use the accessToken with GraphQL:
curl -sX POST http://localhost:4000/graphql \
  -H 'content-type: application/json' \
  -H "authorization: Bearer <accessToken>" \
  -d '{"query":"{ me { id email } }"}'
```

## Routes (Phase 0)

| Verb   | Path            | Notes                                                            |
| ------ | --------------- | ---------------------------------------------------------------- |
| `POST` | `/auth/login`   | `{email, password}` → `{accessToken, refreshToken, expiresIn}`   |
| `POST` | `/auth/refresh` | `{refreshToken}` → new tokens (rotation)                         |
| `POST` | `/auth/logout`  | guarded; revokes current session                                 |
| `POST` | `/graphql`      | GraphQL Apollo, includes `me`, `engagements`, `createEngagement` |
| `GET`  | `/health`       | liveness                                                         |
| `GET`  | `/ready`        | readiness (DB + Redis + S3)                                      |
| `GET`  | `/metrics`      | Prometheus exposition                                            |

## Scripts

| Command                      | Purpose                                 |
| ---------------------------- | --------------------------------------- |
| `pnpm dev:up`                | bring up the dev stack (Docker Compose) |
| `pnpm dev:down`              | tear down the dev stack                 |
| `pnpm prisma:migrate:dev`    | create + apply new migration            |
| `pnpm prisma:migrate:deploy` | apply pending migrations                |
| `pnpm prisma:studio`         | open Prisma Studio                      |
| `pnpm seed`                  | seed operator user (idempotent)         |
| `pnpm nx serve api-gateway`  | run the API                             |
| `pnpm nx test <project>`     | unit tests                              |
| `pnpm nx e2e api-gateway`    | end-to-end tests (requires dev stack)   |
| `pnpm format`                | Prettier on all files                   |
| `pnpm lint`                  | ESLint across projects                  |

## Layout

```
apps/api-gateway/       NestJS HTTP + GraphQL
libs/auth/              Password, JWT, TOTP helpers
libs/common/            Domain errors + AES-GCM SecretBox
libs/config/            Zod-validated env config
libs/database/          PrismaService + PrismaModule
libs/logging/           Pino-based structured logging
prisma/                 Schema + migrations + seed
docker/                 docker-compose dev stack
docs/superpowers/       Specs and phase plans
```

## CI

GitHub Actions runs `lint`, `type-check`, `test`, `build`, and `e2e` against Postgres / Redis / MinIO services. See `.github/workflows/ci.yml`.

## License

Internal — not open source at this stage.
