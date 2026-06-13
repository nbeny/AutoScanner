# AutoScanner

Single-operator pentest / red-team platform: asset discovery, sandboxed orchestration of Kali tools, finding correlation, reporting.

> **Phase 1** delivers the first scan end-to-end: queue an `nmap` job from the CLI or the React UI, watch the logs stream live, see parsed assets/ports/services in the database, and download the raw XML output from MinIO. See `docs/superpowers/specs/` for the full design and `docs/superpowers/plans/` for phase plans.

## Stack

Nx 20 monorepo · NestJS 11 · Prisma 6 · PostgreSQL 16 · Redis 7 · MongoDB 7 · MinIO · BullMQ 5 · Apollo GraphQL · React 18 + Vite + Tailwind · TypeScript 5.7 · Pino · Prometheus.

## Quickstart

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
```

## Phase 1 — first scan end-to-end

Open four terminals (or use `nx run-many` / a process manager):

```bash
pnpm nx serve api-gateway    # REST + GraphQL on :4000
pnpm nx serve scan-worker    # consumes scan queue, runs scanners in Docker
pnpm nx serve parser-worker  # consumes parse queue, persists Asset/Port/Service
pnpm nx serve frontend       # Vite dev server on :5173
```

### Run a scan from the UI

1. Open <http://localhost:5173>, sign in with the operator credentials (`OPERATOR_EMAIL` / `OPERATOR_PASSWORD`) — point "API URL" at `http://localhost:4000`.
2. Create an engagement.
3. Open the engagement → fill the **Run a scan** form (default scanner `nmap`, target `127.0.0.1`, optional JSON like `{"ports":"1-1024"}`).
4. The scan status section appears and tails stdout/stderr live via the GraphQL `scanJobLogs` subscription. The assets table refreshes when the scan completes; the "download raw output" link follows a 1h-TTL presigned URL to MinIO.

### Run a scan from the CLI

```bash
pnpm nx run cli:build
node dist/apps/cli/main.js login \
  --api-url http://localhost:4000 \
  --email admin@autoscanner.local \
  --password changeme

node dist/apps/cli/main.js engagement create --name "Demo" --client "Acme"
node dist/apps/cli/main.js engagement list

node dist/apps/cli/main.js scan run \
  -e <engagementId> -s nmap -t 127.0.0.1 \
  -o '{"ports":"22,80,443","serviceDetection":true}'

node dist/apps/cli/main.js scan status <scanId>
node dist/apps/cli/main.js scan raw <scanJobId>   # prints a 1h presigned URL
```

### Verify

- **GraphQL**: query `assets(engagementId: ...)` → expect at least the scanned host with the open ports listed.
- **MinIO** (UI on <http://localhost:9001>, login `autoscanner` / `devpassword`): the `raw-outputs` bucket has the XML under `engagements/<id>/scans/<id>/jobs/<id>/nmap.xml`.

### Automated acceptance

`apps/api-gateway-e2e/src/scenarios/first-scan-e2e.spec.ts` runs the full flow against a live stack. It is opt-in:

```bash
E2E_API_URL=http://localhost:4000 \
E2E_EMAIL=admin@autoscanner.local \
E2E_PASSWORD=changeme \
E2E_TARGET=127.0.0.1 \
pnpm nx e2e api-gateway-e2e
```

Without those env vars the suite skips, so CI stays green when no live stack is available.

## Phase 6.1 — broad passive recon

Four new scanners join the passive discovery stack:

| Scanner       | Image                                        | Notes                                    |
| ------------- | -------------------------------------------- | ---------------------------------------- |
| `findomain`   | `edu4rdshl/findomain:9.0.4` (registry)       | Passive subdomain enumeration            |
| `amass`       | `caffix/amass:v4.2.0` (registry)             | Passive mode only (`-passive`)           |
| `assetfinder` | `autoscanner/assetfinder:1.0` (custom build) | Subdomain enumeration via public sources |
| `puredns`     | `autoscanner/puredns:1.0` (custom build)     | DNS bruteforce with a bundled wordlist   |

A new `recon-passive-deep` template chains all five passive discovery scanners through resolution and probing:
**subfinder → assetfinder → findomain → amass → puredns → dnsx → httpx**

### Build the custom scanner images

The two custom images must be built before running `assetfinder` or `puredns` locally or in CI. Docker must be running.

```bash
pnpm scanners:build
```

This builds `autoscanner/assetfinder:1.0` and `autoscanner/puredns:1.0` via `tools/scanners/build-images.sh`.

### Run the template

```graphql
mutation {
  runTemplate(
    input: { engagementId: "<id>", templateName: "recon-passive-deep", target: "client.com" }
  ) {
    id
    status
  }
}
```

Input type: `RunTemplateInput { engagementId: ID!, templateName: String!, target: String! }`.

> **amass** runs passive-only (no active DNS requests).  
> **puredns** brute-forces using a small bundled wordlist. `runTemplate` takes no per-scanner options, so to override the wordlist run `puredns` standalone via `runScan` with a `{ "wordlist": "/path/in/image" }` input (or `{ "mode": "resolve" }` to validate a host list instead of brute-forcing).

## Routes

| Verb   | Path                              | Notes                                                                                                   |
| ------ | --------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `POST` | `/auth/login`                     | `{email, password}` → `{accessToken, refreshToken, expiresIn}`                                          |
| `POST` | `/auth/refresh`                   | `{refreshToken}` → new tokens (rotation)                                                                |
| `POST` | `/auth/logout`                    | guarded; revokes current session                                                                        |
| `POST` | `/graphql`                        | GraphQL Apollo: `me`, `engagements`, `createEngagement`, `runScan`, `scan`, `assets`, sub `scanJobLogs` |
| `GET`  | `/scan-jobs/:id/raw`              | guarded; 302 redirect to 1h presigned MinIO URL                                                         |
| `GET`  | `/health` · `/ready` · `/metrics` | liveness / readiness / Prometheus                                                                       |

## Scripts

| Command                       | Purpose                                                        |
| ----------------------------- | -------------------------------------------------------------- |
| `pnpm dev:up` / `dev:down`    | bring up / tear down the dev stack                             |
| `pnpm prisma:migrate:dev`     | create + apply new migration                                   |
| `pnpm prisma:migrate:deploy`  | apply pending migrations                                       |
| `pnpm prisma:studio`          | open Prisma Studio                                             |
| `pnpm seed`                   | seed operator user (idempotent)                                |
| `pnpm nx serve <app>`         | run an app (api-gateway, scan-worker, parser-worker, frontend) |
| `pnpm nx test <project>`      | unit tests                                                     |
| `pnpm nx e2e api-gateway-e2e` | acceptance suite (env-gated; see above)                        |
| `pnpm format` · `pnpm lint`   | Prettier / ESLint across projects                              |

## Layout

```
apps/api-gateway/       NestJS HTTP + GraphQL
apps/scan-worker/       BullMQ consumer, runs scanners in Docker
apps/parser-worker/     BullMQ consumer, parses outputs → DB
apps/frontend/          React + Vite + Tailwind + Apollo
apps/cli/               commander-based CLI (autoscanner)
libs/auth/              Password, JWT, TOTP helpers
libs/common/            Domain errors + AES-GCM SecretBox
libs/config/            Zod-validated env config
libs/database/          PrismaService + PrismaModule
libs/docker-runner/     Sandboxed container exec
libs/log-stream/        Redis pub/sub for live scan logs
libs/parsers/           Output parsers (NmapXmlParser)
libs/queues/            BullMQ queue names + helpers
libs/scanner-sdk/       Scanner contract + registry
libs/scanners/nmap/     Nmap adapter
libs/storage/           MinIO/S3 client + presigner
prisma/                 Schema + migrations + seed
docker/                 docker-compose dev stack
docs/superpowers/       Specs and phase plans
```

## CI

GitHub Actions runs `lint`, `type-check`, `test`, `build`, and `e2e` against Postgres / Redis / MinIO services. See `.github/workflows/ci.yml`.

## License

Internal — not open source at this stage.
