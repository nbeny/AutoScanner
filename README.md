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

## Correlation v2

Cross-scanner correlated findings group the same issue reported by multiple scanners into a single **CorrelatedFinding** with _N_ source references. A deterministic **structural signature** (CVE id → curated category → per-scanner title fallback) ensures that `nuclei`, `nmap` script output, and any future scanner that detects the same vulnerability converge on one row instead of cluttering the findings list with duplicates.

### Triage statuses

| Status           | Meaning                           |
| ---------------- | --------------------------------- |
| `OPEN`           | Detected, not yet reviewed        |
| `TRIAGED`        | Acknowledged, under investigation |
| `CONFIRMED`      | Confirmed exploitable / in scope  |
| `FALSE_POSITIVE` | Noise; excluded from risk score   |
| `RESOLVED`       | Remediated or accepted            |

### Risk score v2

- Each distinct structural signature is counted **once** — duplicates across scanners do not inflate the score.
- CVSS v3 base score is pulled from the CVE cache (`cveInfo` resolver) when a `cveId` is present; falls back to a severity-to-score mapping for findings without a CVE.
- Findings in `FALSE_POSITIVE` or `RESOLVED` status are **excluded** from the score.

### GraphQL surface

```graphql
# List correlated findings for an engagement (paginated; optional severity /
# status / search filters).
query {
  correlatedFindings(
    engagementId: "eng_…"
    severity: HIGH # optional
    status: OPEN # optional
    search: "XSS" # optional full-text
    limit: 100 # default 100
    offset: 0 # default 0
  ) {
    id
    title
    severity # LOW | MEDIUM | HIGH | CRITICAL | INFORMATIONAL
    status # OPEN | TRIAGED | CONFIRMED | FALSE_POSITIVE | RESOLVED
    sourceCount # how many scanner findings were merged
    sources # scanner names, e.g. ["nuclei", "nmap"]
    cveId # nullable — populated when a CVE was matched
    firstSeenAt
    lastSeenAt
  }
}

# Triage a finding.
mutation {
  setFindingStatus(id: "cf_…", status: FALSE_POSITIVE) {
    id
    status
  }
}
```

### Automated acceptance (opt-in)

`apps/api-gateway-e2e/src/scenarios/correlation-v2-e2e.spec.ts` validates the resolver end-to-end. It is double opt-in:

```bash
E2E_API_URL=http://localhost:4000 \
E2E_EMAIL=admin@autoscanner.local \
E2E_PASSWORD=changeme \
E2E_RUN_CORRELATION=1 \
pnpm nx e2e api-gateway-e2e
```

Add `E2E_CORR_ENGAGEMENT_ID=<id>` to target a pre-populated engagement and `E2E_CORRELATION_EXPECT_CLUSTER=1` to additionally assert ≥ 1 multi-source cluster and exercise the triage round-trip (`setFindingStatus` → `FALSE_POSITIVE` → restore `OPEN`). Without these flags the suite resolves the query and confirms the resolver is wired, even against a fresh empty engagement.

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
