# AutoScanner

Single-operator pentest / red-team platform: asset discovery, sandboxed orchestration of ~100 Kali/ProjectDiscovery tools, cross-scanner finding correlation, CVE enrichment, and reporting.

You point it at a target (IP, domain, URL, CIDR, cloud bucket…), it runs the relevant scanners in isolated Docker containers, normalises their output into a unified asset/finding model, correlates duplicate findings across tools into single vulnerabilities, enriches them with CVE data, and scores the risk.

## Stack

Nx 20 monorepo · NestJS 11 · Prisma 6 · PostgreSQL 16 · Redis 7 · MongoDB 7 (optional) · MinIO · BullMQ 5 · Apollo GraphQL · React 18 + Vite + Tailwind · TypeScript 5.7 · Pino · Prometheus.

## How a scan works (the pipeline)

There are two ways to launch work against a target:

- **Single scan** — run one scanner (e.g. `nmap`) on one target via the `runScan` GraphQL mutation / CLI.
- **Template** — run a curated multi-step chain (e.g. `ip-active-audit`) via `runTemplate`. The orchestrator resolves each step's targets from what previous steps discovered and fans out scans in order.

Both feed the same asynchronous, queue-driven pipeline:

```
runScan / runTemplate (api-gateway, GraphQL)
        │
        ▼
  [BullMQ scan-jobs] ── scan-worker ── runs scanner in a sandboxed Docker container
        │                                  (mem/CPU/network/timeout limits, caps dropped,
        │                                   credentials + OAST injected at runtime)
        │                                  raw output ─► MinIO (raw-outputs bucket)
        ▼
  [BullMQ parse-jobs] ── parser-worker ── normalises raw output (per-scanner parser)
        │                                  ─► persists Assets / Ports / Services /
        │                                     Technologies / Findings / DNS / Endpoints / OSINT
        │                                  ─► dedup + correlation → CorrelatedFinding
        │                                  ─► recompute asset risk score
        ▼
  [cve-discovery / cve-enrichment] ── match services (CPE) to CVEs, pull CVSS from NVD
```

Templates additionally flow through **orchestrator-worker** (`template-runs` queue), which builds each step's target set from the `ContextBuilder` (root `target`, discovered `subdomains`, `ipAddresses`, `urls`, `endpoints`, `emails`), dispatches child scan jobs, and waits for completion before advancing.

### AutoHunt — AI-autonomous hunting

Beyond single scans and static templates there's a third way in: the **AutoHunt** page (`/hunt`), a Google-style search box. Type an IP, range, or CIDR (IPv4 **and** IPv6) and the platform hunts _every_ vulnerability autonomously — **Claude Sonnet decides which scanner to run next after each result**, chaining recon → enumeration → web discovery → vuln scanning → active injection → opportunistic exploitation (up to an experimental `pwncat` probe). Every scan is stored and shown as a **live scan-graph** (the path), with an AI-written **audit** at the end.

- The `ai-orchestrator-worker` runs the loop: build world state → ask Claude which scanner(s) next → validate against the registry → dispatch → repeat under configurable **guardrails** (`maxScans` / `maxDepth` / `timeBudgetMs` / `hostCap`, editable on the page) → audit. Ranges are auto-expanded to live hosts, each hunted per-host.
- Claude runs **in a container via your Claude subscription** (no API key): the worker spawns the `claude` CLI and scrubs API-key env vars to force the subscription session (`libs/claude-agent`, mirroring `../BotTrading`). In local dev it uses the host `claude` if you're logged in; containerized via `docker/ai/docker-compose.ai.yml` with read-only mounts of `~/.claude` (set `CLAUDE_DIR` / `CLAUDE_CONFIG` + the `ANTHROPIC_*` vars in `.env`).
- Run it: `pnpm nx serve ai-orchestrator-worker` alongside the usual workers, open `/hunt`, type a target. Live updates stream over the `aiRunEvents` GraphQL subscription.

### What happens for a bare IP

Choose a template based on how aggressive you want to be:

| Template           | Behaviour                                                                                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ip-passive-intel` | Passive only: reputation (`abuseipdb`, `greynoise`) + CIDR expansion (`mapcidr`).                                                                               |
| `ip-active-audit`  | Full active audit: `masscan` → `nmap -sV` → per-protocol audits (ssh/smb/rdp/snmp/smtp/tls) → web probe (`httpx` → `nikto` → `nuclei` → `wafw00f` → `whatweb`). |
| `ip-recon-full`    | `ip-passive-intel` + `ip-active-audit` combined.                                                                                                                |

Vulnerabilities surface mainly from `nuclei` (template engine), `nikto`, the per-protocol audits, and automatic **CPE→CVE** matching on detected services. Active injection scanners (`sqli-scan`, `xss-scan`, `ssti-scan`, `cmdi-scan`, `web-dast`) require discovered URLs/endpoints, so they only apply to web targets (e.g. `web-deep-active-injection`), not a bare IP.

## Scanners & templates

**~98 scanners** across 24 categories (network discovery, port scan, service detection, DNS, subdomain enum, web fingerprint/enum, vuln scan, SSL/TLS, SMB/Windows, Active Directory, cloud, k8s, OSINT, identity OSINT, passive recon, API security, SMTP, SNMP, password/protocol audits, …). Each is a self-contained module under `libs/scanners/<name>/` declaring its Docker image, input schema (Zod), `build()` command, output parser, and the entities it produces. All are registered in `libs/scanners/all/src/all-scanners.module.ts` and looked up at runtime via the `ScannerRegistry` (`libs/scanner-sdk`).

**~27 built-in templates** live in `libs/templates/src/builtins/` — including `recon-passive` / `recon-passive-deep` / `recon-active` / `recon-active-deep-v2`, `web-fingerprint` / `web-content` / `web-app-audit` / `web-deep-active-injection`, `osint-passive` / `osint-passive-deep` / `osint-meta-deep`, `identity-osint`, `email-surface-recon`, `service-recon`, `network-vuln`, `vuln-active`, `active-directory-recon`, `cloud-exposure`, `k8s-recon`, and the `ip-*` templates above.

Some scanners are **key-gated** (Shodan, Censys, SecurityTrails, AbuseIPDB, GreyNoise, …). Their API keys are stored **AES-256-GCM encrypted** via the `SecretBox` utility (keyed from `MASTER_ENCRYPTION_KEY`), decrypted in-memory at scan time, injected as env vars into the container, and never persisted in plaintext or logged. Manage them on the `/settings` page or via `setApiCredential`. Cloud provider credentials (AWS/Azure/GCP) are managed similarly through the `libs/cloud-credentials` surface.

### Build custom scanner images

Scanners that ship a custom image (rather than a public registry image) must be built before use. Docker must be running:

```bash
pnpm scanners:build   # runs tools/scanners/build-images.sh
```

## Quickstart

Prerequisites: Node 22 (`nvm use`), pnpm 9, Docker Desktop / Docker Engine v25+.

```bash
git clone <repo> && cd autoscanner
pnpm install
cp .env.example .env
# Generate secure secrets and paste into .env:
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('MASTER_ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('base64'))"

# Bring up dev dependencies (postgres + redis + minio; add mongo with dev:up:mongo):
pnpm dev:up
pnpm prisma:migrate:deploy
pnpm seed                    # creates operator user from OPERATOR_EMAIL/PASSWORD
```

## Running the stack

Serve the apps you need (a process manager or `nx run-many` works too):

```bash
pnpm nx serve api-gateway          # REST + GraphQL on :4000
pnpm nx serve scan-worker          # consumes scan-jobs, runs scanners in Docker
pnpm nx serve parser-worker        # consumes parse-jobs, persists entities + correlates
pnpm nx serve orchestrator-worker  # consumes template-runs, drives multi-step templates
pnpm nx serve ai-orchestrator-worker # consumes ai-runs, drives AutoHunt (needs Claude CLI logged in)
pnpm nx serve frontend             # Vite dev server on :5173
```

Optional workers, each backed by its own BullMQ queue: `cve-enricher-worker`, `nvd-sync-worker` (offline CVE mirror), `report-worker`, `notification-worker`, `scheduler` (scheduled/recurring runs).

### Run a scan from the UI

1. Open <http://localhost:5173>, sign in with the operator credentials (`OPERATOR_EMAIL` / `OPERATOR_PASSWORD`) — point "API URL" at `http://localhost:4000`.
2. Create an engagement.
3. Open the engagement → **Run a scan** (single scanner) or launch a **template**. Scan status tails stdout/stderr live via the `scanJobLogs` GraphQL subscription; the assets / findings tables refresh on completion.

### Run a scan from the CLI

```bash
pnpm nx run cli:build
node dist/apps/cli/main.js login --api-url http://localhost:4000 --email <op-email> --password <op-pass>

node dist/apps/cli/main.js engagement create --name "Demo" --client "Acme"

# Single scanner:
node dist/apps/cli/main.js scan run -e <engagementId> -s nmap -t 127.0.0.1 \
  -o '{"ports":"22,80,443","serviceDetection":true}'

node dist/apps/cli/main.js scan status <scanId>
node dist/apps/cli/main.js scan raw <scanJobId>   # prints a 1h presigned MinIO URL
```

### Run a template via GraphQL

```graphql
mutation {
  runTemplate(
    input: { engagementId: "<id>", templateName: "ip-active-audit", target: "203.0.113.10" }
  ) {
    id
    status
  }
}
```

`RunTemplateInput { engagementId: ID!, templateName: String!, target: String! }`. `runTemplate` takes no per-scanner options — run a scanner standalone via `runScan` to override its input.

## Correlation v2, risk & triage

Findings for the same issue reported by multiple scanners are grouped into a single **CorrelatedFinding** with _N_ source references. A deterministic **structural signature** (CVE id → curated category → per-scanner title fallback) makes `nuclei`, `tlsx`, `sslscan`, CPE→CVE matches, etc. converge on one row instead of cluttering the list.

Triage statuses: `OPEN` → `TRIAGED` → `CONFIRMED` / `FALSE_POSITIVE` / `RESOLVED`. Operator triage is never overwritten by re-scans.

**Risk score v2**: each distinct structural signature counts once (duplicates don't inflate the score); CVSS v3 base score is pulled from the CVE cache when a `cveId` is present, otherwise a severity-to-weight mapping is used; `FALSE_POSITIVE` / `RESOLVED` findings are excluded.

```graphql
query {
  correlatedFindings(engagementId: "eng_…", severity: HIGH, status: OPEN, limit: 100) {
    id
    title
    severity
    status
    sourceCount
    sources
    cveId
    firstSeenAt
    lastSeenAt
  }
}

mutation {
  setFindingStatus(id: "cf_…", status: FALSE_POSITIVE) {
    id
    status
  }
}
```

## Routes

| Verb   | Path                              | Notes                                                          |
| ------ | --------------------------------- | -------------------------------------------------------------- |
| `POST` | `/auth/login`                     | `{email, password}` → `{accessToken, refreshToken, expiresIn}` |
| `POST` | `/auth/refresh`                   | `{refreshToken}` → new tokens (rotation)                       |
| `POST` | `/auth/logout`                    | guarded; revokes current session                               |
| `POST` | `/graphql`                        | Apollo GraphQL (engagements, scans, templates, findings, …)    |
| `GET`  | `/scan-jobs/:id/raw`              | guarded; 302 redirect to 1h presigned MinIO URL                |
| `GET`  | `/health` · `/ready` · `/metrics` | liveness / readiness / Prometheus                              |

## Scripts

| Command                                       | Purpose                                              |
| --------------------------------------------- | ---------------------------------------------------- |
| `pnpm dev:up` / `dev:up:mongo` / `dev:down`   | bring up / tear down the dev stack (mongo is opt-in) |
| `pnpm oast:up` / `oast:down`                  | self-hosted OAST/interactsh server for OOB testing   |
| `pnpm scanners:build`                         | build custom scanner Docker images                   |
| `pnpm prisma:migrate:dev` / `:deploy`         | create+apply / apply migrations                      |
| `pnpm prisma:studio`                          | open Prisma Studio                                   |
| `pnpm seed`                                   | seed operator user (idempotent)                      |
| `pnpm recompute:risk-scores`                  | recompute all asset risk scores                      |
| `pnpm nx serve <app>`                         | run an app                                           |
| `pnpm test` · `lint` · `type-check` · `build` | Nx `run-many` across projects                        |
| `pnpm format` · `format:check`                | Prettier                                             |

## Layout

```
apps/
  api-gateway/          NestJS HTTP + GraphQL entry point
  scan-worker/          runs scanners in sandboxed Docker (scan-jobs queue)
  parser-worker/        parses raw output → DB, dedup + correlation (parse-jobs)
  orchestrator-worker/  drives multi-step templates (template-runs)
  cve-enricher-worker/  enriches findings with CVE/CVSS data (cve-enrichment)
  nvd-sync-worker/      maintains an offline NVD mirror (nvd-sync)
  report-worker/        generates reports (report-jobs)
  notification-worker/  notifications + webhooks (notification-jobs / webhook-jobs)
  scheduler/            scheduled / recurring scans
  frontend/             React + Vite + Tailwind + Apollo
  cli/                  commander-based CLI (autoscanner)
libs/
  scanner-sdk/          scanner contract + ScannerRegistry
  scanners/             ~98 scanner adapters (one module each) + all/ aggregator
  templates/            ~27 built-in multi-step templates + ContextBuilder types
  parsers/              per-scanner output → normalized entity parsers
  correlation/          finding dedup, CorrelatedFinding clustering, risk scoring
  cve/                  CVE cache, CPE→CVE matching, NVD client
  docker-runner/        sandboxed container exec (limits, caps, binds)
  queues/               BullMQ queue names + helpers
  database/             PrismaService + PrismaModule
  storage/              MinIO/S3 client + presigner
  log-stream/           Redis pub/sub for live scan logs
  engagement-events/    engagement event stream (asset added, risk changed, …)
  auth/ common/ config/ logging/ notifications/ reporting/ insight/ cloud-credentials/
prisma/                 schema + migrations + seed + scripts
docker/                 dev compose stack, OAST server, greenbone/openvas
docs/superpowers/       design specs and phase plans (historical record)
```

## CI

GitHub Actions runs `lint`, `type-check`, `test`, `build`, and `e2e` against Postgres / Redis / MinIO services. See `.github/workflows/ci.yml`.

## License

Internal — not open source at this stage.
