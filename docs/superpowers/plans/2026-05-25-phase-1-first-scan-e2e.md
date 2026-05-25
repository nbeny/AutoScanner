# Phase 1 — Premier scan E2E

> **Status:** Draft. Code listings are intentionally light — each task should be expanded with concrete test + implementation listings at the moment it's picked up, the way Phase 0 was written. The structure, sequencing, file paths, and acceptance criteria are fixed.

## Goal

Run an nmap scan end-to-end:
1. Operator triggers a scan from **CLI or UI** against a target inside an engagement scope.
2. `scan-worker` pulls the job, runs the sandboxed `instrumentisto/nmap` container, streams stdout, captures the XML, and uploads it to MinIO.
3. `parser-worker` parses the XML and persists `Asset` / `Port` / `Service` rows.
4. The UI / CLI shows live logs (GraphQL subscription) and the resulting findings table.

Spec references: §1 (Phase 1), §6 (orchestration), §7 (docker runner), §8 (scanner SDK), §10 (parser engine), §12 (GraphQL), §14 (realtime), §15 (storage), §17 (CLI), §18 (frontend).

## Conventions

Same as Phase 0:
- TDD per task (failing test → impl → green → commit).
- Conventional commits with `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`.
- All new libs follow `libs/<name>/` with `src/index.ts` barrel + jest config + `tsconfig.lib.json` + `tsconfig.spec.json`.
- Path alias `@autoscanner/<name>` already wired in `tsconfig.base.json`; add new entries there.

## Definition of done (Phase 1 acceptance)

- `pnpm nx serve api-gateway` + `pnpm nx serve scan-worker` + `pnpm nx serve parser-worker` + `pnpm nx serve frontend` boot cleanly against `pnpm dev:up`.
- From the CLI: `autoscanner scan run --engagement <id> --target 127.0.0.1` triggers a scan, streams logs, and exits with the finding count.
- From the UI: login → engagement → "New scan" form (nmap, target, port range) → live logs panel populated → findings table refreshes when scan completes.
- The raw XML lands in MinIO under `raw-outputs/<engagementId>/<scanJobId>/nmap.xml`.
- `Asset` + `Port` + `Service` rows exist for the target post-scan; re-running the same scan upserts (no duplicates).
- All existing Phase 0 tests stay green; new unit + e2e suites pass.
- CI updated to start the scan-worker / parser-worker for e2e, or to scope the e2e suite to api-gateway with worker integration tested separately.

---

## Task list

### Foundations (libs that everything else depends on)

#### Task 1 — Prisma additions: `Scan`, `ScanJob`, `Port`, `Service`, `Finding`

**Files:**
- `prisma/schema.prisma` (extend)
- `prisma/migrations/<ts>_phase1_scan_models/migration.sql` (generated)

**Models (per spec §4):**
- `Scan` (id, engagementId, name, status, createdById, createdAt, completedAt)
- `ScanJob` (id, scanId, scannerName, target, input Json, status, queuedAt, startedAt, completedAt, exitCode, durationMs, rawOutputKey, errorMessage)
- `Port` (id, assetId, number, protocol, state) — unique `(assetId, number, protocol)`
- `Service` (id, portId, name, product, version, banner, cpe[])
- `Finding` (id, assetId, scanJobId, dedupHash, title, severity, location, cveId, templateId, evidence Json, firstSeenAt, lastSeenAt) — unique `(assetId, dedupHash)`

**Acceptance:** `pnpm prisma migrate dev --name phase1_scan_models` succeeds, `prisma format` clean, Prisma client regenerates.

**Commit:** `feat(db): add Scan, ScanJob, Port, Service, Finding models`

---

#### Task 2 — Lib `@autoscanner/queues`

**Files:**
- `libs/queues/{project.json,jest.config.ts,tsconfig.*}`
- `libs/queues/src/{index.ts, queue-names.ts, job-payloads.ts, queues.module.ts, bullmq.config.ts}`
- `libs/queues/src/__tests__/job-payloads.spec.ts`

**Content:**
- Enum `QueueName` (`SCAN_JOBS`, `PARSE_JOBS`).
- Typed payload interfaces per queue (`ScanJobPayload { scanJobId, scannerName, target, input, engagementId }`, `ParseJobPayload { scanJobId, rawOutputKey, parserName, scannerName, target, engagementId }`).
- `BullMqConnectionFactory` reading `REDIS_URL` via `AppConfigService`.
- `QueuesModule` exporting registered queues (`BullModule.registerQueueAsync(...)`).
- Standard defaults from spec §6.1 (removeOnComplete/Fail, attempts=3, exponential backoff).

**Test:** payload type narrowing + queue-name enum stability.

**Commit:** `feat(queues): add BullMQ queue names, payloads, and config`

---

#### Task 3 — Lib `@autoscanner/docker-runner`

**Files:**
- `libs/docker-runner/{project.json,jest.config.ts,tsconfig.*}`
- `libs/docker-runner/src/{index.ts, types.ts, dockerode-runner.ts, docker-runner.module.ts}`
- `libs/docker-runner/src/__tests__/dockerode-runner.spec.ts` (integration; conditionally skip if no Docker socket)

**Content (spec §7):**
- `RunSpec` / `RunResult` / `DockerRunner` types verbatim from spec.
- Implementation uses `dockerode` to: pullIfMissing, create container with sandbox defaults (cap-drop ALL + sec-opt no-new-privileges + pids-limit + tmpfs + user 1000:1000 + memory/cpu limits + bridge default), attach to streams, demux stdout/stderr to callbacks, enforce `timeoutMs` and `abortSignal` (→ `docker kill`), return exit code and timing.
- Default network `bridge`; allow override (`host` will be used by nmap).
- Streaming mode: `onStdout`/`onStderr` callbacks; no captured file. Capture mode: write to scratch files in `os.tmpdir()/autoscanner-<jobId>/`.

**Test:** integration test runs `alpine echo hi` (skipped via `describeSkipIfNoDocker` helper if `DOCKER_HOST`/socket unavailable). Asserts exit code 0, stdout chunk received, container removed after run.

**Commit:** `feat(docker-runner): sandboxed Docker exec with streaming and timeouts`

---

#### Task 4 — Lib `@autoscanner/scanner-sdk`

**Files:**
- `libs/scanner-sdk/{project.json,jest.config.ts,tsconfig.*}`
- `libs/scanner-sdk/src/{index.ts, types.ts, registry.ts, scanner-sdk.module.ts}`
- `libs/scanner-sdk/src/__tests__/registry.spec.ts`

**Content (spec §8):**
- `ScannerDefinition`, `ScannerCategory`, `BuildContext`, `RawOutputFormat` types.
- `@Injectable() ScannerRegistry` with `register(def)` (throws on duplicate name), `get(name)` (throws `ScannerNotFoundError`), `list(filter?)`.
- Re-export `z` for adapters.

**Test:** registry register/get/list + duplicate throw + not-found throw.

**Commit:** `feat(scanner-sdk): scanner registry and ScannerDefinition contract`

---

#### Task 5 — Lib `@autoscanner/storage` (MinIO client)

**Files:**
- `libs/storage/{project.json,jest.config.ts,tsconfig.*}`
- `libs/storage/src/{index.ts, s3-client.factory.ts, raw-output.service.ts, storage.module.ts}`
- `libs/storage/src/__tests__/raw-output.service.spec.ts` (integration against MinIO)

**Content:**
- `@aws-sdk/client-s3` client built from `S3_ENDPOINT/REGION/ACCESS_KEY/SECRET_KEY` (force `pathStyle: true` for MinIO).
- `RawOutputService.upload({ engagementId, scanJobId, filename, body })` → returns `key` (`raw-outputs/<engagementId>/<scanJobId>/<filename>`).
- `RawOutputService.download(key)` → `Readable`.
- Module-init checks bucket exists; creates it if missing.

**Test:** upload then download round-trip against the live MinIO from `pnpm dev:up`.

**Commit:** `feat(storage): add S3/MinIO client with raw-output upload/download`

---

#### Task 6 — Lib `@autoscanner/parsers` with `nmap-xml`

**Files:**
- `libs/parsers/{project.json,jest.config.ts,tsconfig.*}`
- `libs/parsers/src/{index.ts, types.ts, registry.ts, parsers.module.ts}`
- `libs/parsers/src/nmap-xml/{nmap-xml.parser.ts, nmap-xml.module.ts}`
- `libs/parsers/src/__tests__/nmap-xml.parser.spec.ts`
- `libs/parsers/src/__tests__/fixtures/nmap-localhost.xml` (real fixture: run `nmap -oX - 127.0.0.1` once and commit)

**Content (spec §10):**
- `NormalizedOutput` / `Parser` / `ParserContext` types.
- `ParserRegistry` injectable.
- `NmapXmlParser` uses `xml2js`. Extracts `host` → `address[ipv4]` → asset, `ports/port` → `(number, protocol, state)`, `service` → `(name, product, version)`, normalizes per spec §10.4 (ports int, protocol uppercase).

**Test:** parses fixture into expected `NormalizedOutput` (assert asset count, port set, service names).

**Commit:** `feat(parsers): add parser registry and nmap-xml parser`

---

#### Task 7 — Lib `libs/scanners/nmap`

**Files:**
- `libs/scanners/nmap/{project.json,jest.config.ts,tsconfig.*}`
- `libs/scanners/nmap/src/{index.ts, nmap.scanner.ts, nmap.module.ts}`
- `libs/scanners/nmap/src/__tests__/nmap.scanner.spec.ts`

**Content (spec §8.3):** the `NmapScanner` definition verbatim, Zod input schema, `build(input, target)` → command array. `NmapModule` auto-registers into `ScannerRegistry` on `onModuleInit`.

**Test:** `build()` argument-string snapshot for representative inputs (default, with serviceDetection off, with scripts).

**Commit:** `feat(scanners/nmap): add nmap ScannerDefinition with input schema`

---

### Workers

#### Task 8 — App `scan-worker`

**Files:**
- `apps/scan-worker/{project.json,webpack.config.js,tsconfig.app.json,src/main.ts,src/app/app.module.ts}`
- `apps/scan-worker/src/app/scan/{scan.processor.ts, scan.module.ts}`
- `apps/scan-worker/src/app/log-publisher.service.ts` (Redis pub/sub)
- `apps/scan-worker/test/jest-e2e.config.ts`
- `apps/scan-worker/test/scan.processor.e2e-spec.ts`

**Behavior:**
1. Subscribes to `SCAN_JOBS` queue.
2. On job: load `ScanJob` from Postgres, mark `RUNNING`, look up scanner via `ScannerRegistry`, call `scanner.build(input, target)`, hand to `DockerRunner.run(...)` with the scanner's docker config.
3. `onStdout` chunks → publish to Redis channel `scanjob:logs:<scanJobId>` AND accumulate in scratch buffer (also written incrementally to the captured file).
4. On exit: upload captured stdout to MinIO via `RawOutputService` → get `rawOutputKey`. Set `ScanJob.{status,exitCode,durationMs,rawOutputKey,completedAt}`.
5. Enqueue `ParseJobPayload` onto `PARSE_JOBS`.
6. Subscribes to Redis `scanjob:cancel:<id>` to abort in-flight runs via `AbortSignal`.

**Test (e2e):** with live Postgres + Redis + MinIO + Docker, enqueue a `nmap` job against `127.0.0.1`, await completion, assert: status `COMPLETED`, `rawOutputKey` set, MinIO object exists, a `PARSE_JOBS` job is queued.

**Commit:** `feat(scan-worker): execute scan jobs in sandboxed containers and enqueue parse`

---

#### Task 9 — App `parser-worker`

**Files:**
- `apps/parser-worker/{project.json,webpack.config.js,tsconfig.app.json,src/main.ts,src/app/app.module.ts}`
- `apps/parser-worker/src/app/parse/{parse.processor.ts, persist.service.ts, parse.module.ts}`
- `apps/parser-worker/test/jest-e2e.config.ts`
- `apps/parser-worker/test/parse.processor.e2e-spec.ts`

**Behavior:**
1. Subscribes to `PARSE_JOBS`.
2. Download raw output from MinIO using `rawOutputKey`.
3. Look up parser via `ParserRegistry.get(payload.parserName)`.
4. Parse → `NormalizedOutput`.
5. `PersistService.persist(normalized, ctx)`: upserts `Asset` (by `(engagementId, type, value)`), then `Port` upserts on `(assetId, number, protocol)`, then `Service` rows. All in one Prisma transaction.
6. On success: publish Redis `scanjob:done:<scanJobId>` and mark `ScanJob` parsed.

**Test (e2e):** seed a `ScanJob` row with the `nmap-localhost.xml` fixture already uploaded to MinIO, enqueue a `PARSE_JOBS` job, await completion, assert Asset/Port/Service rows present and that a re-run upserts (no duplicates).

**Commit:** `feat(parser-worker): persist Asset/Port/Service from parsed raw outputs`

---

### API surface

#### Task 10 — GraphQL: `Scan` / `ScanJob` types and queries

**Files:**
- `apps/api-gateway/src/app/scans/{dto/*.ts, scans.service.ts, scans.resolver.ts, scans.module.ts}`
- `apps/api-gateway/test/scans.e2e-spec.ts`

**Surface:**
- `type Scan { id, name, status, engagement, jobs[], createdAt, completedAt }`.
- `type ScanJob { id, scannerName, target, status, exitCode, durationMs, rawOutputKey, completedAt }`.
- `query scans(engagementId: ID!): [Scan!]!` (guarded).
- `query scan(id: ID!): Scan` (guarded).
- DataLoader for `Scan.jobs`.

**Test (e2e):** create a scan via Prisma, query it, assert nested jobs hydrate without N+1.

**Commit:** `feat(api-gateway): expose scans and scan jobs over GraphQL`

---

#### Task 11 — GraphQL mutation: `runScan`

**Files:**
- `apps/api-gateway/src/app/scans/dto/run-scan.input.ts`
- `apps/api-gateway/src/app/scans/scans.service.ts` (extend)
- `apps/api-gateway/src/app/scans/scans.resolver.ts` (extend)
- `apps/api-gateway/test/scans-run.e2e-spec.ts`

**Behavior:**
- Input: `engagementId`, `scannerName`, `target`, `input: JSON` (free-form, validated by scanner's Zod schema), optional `name`.
- Validates target against the engagement's `ScopeRule` rows (out-of-scope → `403 ScopeError`).
- Validates `input` against `scanner.inputSchema` (Zod).
- Creates a `Scan` row + one `ScanJob` row (`status=PENDING`), enqueues onto `SCAN_JOBS` (status flips to `QUEUED` after enqueue).
- Returns the created `Scan`.

**Test (e2e):** out-of-scope target → 403; valid request → returns Scan and a job is observable in BullMQ. Mock the BullMQ queue in this e2e (workers are tested separately).

**Commit:** `feat(api-gateway): add runScan mutation with scope + input validation`

---

#### Task 12 — GraphQL subscription: `scanJobLogs`

**Files:**
- `apps/api-gateway/src/app/scans/scan-logs.subscription.ts`
- `apps/api-gateway/src/app/scans/scans.module.ts` (wire `graphql-subscriptions` + Redis PubSub)
- `apps/api-gateway/src/main.ts` (enable WebSocket transport for subscriptions)
- `apps/api-gateway/test/scan-subscription.e2e-spec.ts`

**Content (spec §14):**
- Use `graphql-redis-subscriptions` backed by `REDIS_URL`.
- Channel mapping: subscription `scanJobLogs(jobId)` filters Redis channel `scanjob:logs:<jobId>`.
- Auth: same `JwtAuthGuard`, but adapted for subscription context (token in `connectionParams.authorization`).

**Test (e2e):** subscribe over WS, publish a few log lines via `RedisPubSub.publish`, assert client receives them in order.

**Commit:** `feat(api-gateway): add scanJobLogs subscription with WS + Redis pubsub`

---

#### Task 13 — REST: `GET /scans/:id/raw-output/:filename`

**Files:**
- `apps/api-gateway/src/app/scans/scans.controller.ts`
- `apps/api-gateway/test/scan-raw-output.e2e-spec.ts`

**Behavior:** guarded download endpoint streaming from MinIO via `RawOutputService.download(key)`. Returns 404 if job not found or key missing.

**Commit:** `feat(api-gateway): add raw output download endpoint`

---

### CLI

#### Task 14 — App `cli`

**Files:**
- `apps/cli/{project.json,tsconfig.app.json,src/main.ts,src/commands/{login.ts,scan-run.ts,whoami.ts}}`
- `apps/cli/src/lib/{config-store.ts, graphql-client.ts}`
- `apps/cli/test/cli.spec.ts`

**Content (spec §17):**
- `commander` for command parsing.
- Config persisted at `~/.autoscanner/config.json` (server URL + tokens).
- Commands:
  - `autoscanner login --server <url>` → email/password prompt → stores tokens.
  - `autoscanner whoami` → calls `me` query.
  - `autoscanner scan run --engagement <id> --target <ip> [--scanner nmap] [--ports 1-1000]` → calls `runScan`, then opens WS subscription to `scanJobLogs`, prints log lines, prints final summary (exit code, finding count via follow-up query) on completion.

**Test:** unit-test the argument parsing + config store. The full live CLI flow is exercised by Task 17.

**Commit:** `feat(cli): add CLI with login, whoami, and scan run`

---

### Frontend

#### Task 15 — App `frontend` scaffold + auth

**Files:**
- `apps/frontend/` Vite + React + Apollo Client + React Router (spec §18.1).
- `apps/frontend/src/{main.tsx, app.tsx, apollo.ts, routes.tsx}`.
- `apps/frontend/src/features/auth/{login-page.tsx, auth-context.tsx, use-tokens.ts}`.
- `apps/frontend/src/features/engagements/{engagements-page.tsx, engagement-page.tsx}`.
- `apps/frontend/test/login.spec.tsx` (vitest + RTL).

**Behavior:**
- Login page hits `POST /auth/login` (REST), stores access+refresh in memory + refresh in `localStorage`.
- Apollo `httpLink` injects `Authorization: Bearer ...`; on 401 → refresh via `errorLink` then retry.
- Protected route wrapper redirects to `/login` if no access token.
- Engagement list page queries `engagements` GraphQL.

**Test (unit):** login form submit calls REST and stores tokens; protected route redirects when unauthenticated.

**Commit:** `feat(frontend): scaffold Vite+React app with login and engagement list`

---

#### Task 16 — Frontend: scan page with live logs

**Files:**
- `apps/frontend/src/features/scans/{new-scan-form.tsx, scan-page.tsx, log-stream.tsx, findings-table.tsx}`
- `apps/frontend/src/apollo-ws.ts` (graphql-ws link for subscriptions)
- `apps/frontend/test/scan-page.spec.tsx`

**Behavior:**
- "New scan" form: scanner = nmap (only option in Phase 1), target string, port range.
- On submit → `runScan` mutation → navigates to `/scans/<id>`.
- Scan page: subscribes to `scanJobLogs`, appends lines to a virtualized list. Polls or refetches scan status; once `COMPLETED`, queries findings (Asset/Port/Service) and renders the table.

**Test (unit):** new-scan-form submit calls mutation; scan page renders received log lines.

**Commit:** `feat(frontend): add scan creation + live log streaming + findings table`

---

### Integration

#### Task 17 — Full E2E: CLI-driven nmap scan against localhost

**Files:**
- `e2e/full-stack/{jest.config.ts, full-scan.e2e-spec.ts, helpers/spawn-services.ts}` (new top-level e2e project, registered in root `nx.json`)

**Behavior:**
- Boot api-gateway + scan-worker + parser-worker as child processes against the live dev stack.
- Run `autoscanner login` + `autoscanner scan run --engagement <seeded> --target 127.0.0.1 --ports 22-80`.
- Wait for completion (poll `scan(id)` until status `COMPLETED`).
- Assert: Asset for 127.0.0.1 exists, at least 1 Port row, raw XML exists in MinIO.

**Commit:** `test(e2e): full CLI → workers → DB scan flow on localhost`

---

#### Task 18 — CI: add workers and e2e

**Files:**
- `.github/workflows/ci.yml` (extend)

**Changes:**
- After existing build step, start `scan-worker` and `parser-worker` as background services (use the build artifacts from `nx affected -t build`).
- Run the new full-stack e2e job in a separate matrix entry so it's isolated from the unit suite.
- Add `services: docker:dind` if running scan-worker inside the runner (or accept that Phase 1 e2e relies on the runner's Docker socket via `docker:24-dind` sidecar — preferred).
- Cache nmap docker image pull where possible.

**Commit:** `ci: run scan-worker + parser-worker for full-stack e2e`

---

#### Task 19 — Docs: README + new env vars

**Files:**
- `README.md` (Phase 1 section: new routes, subscription endpoint, CLI quickstart, frontend dev command).
- `.env.example` / `.env` (any new vars: e.g. `DOCKER_HOST` override for non-default sockets; `FRONTEND_URL` already present).

**Commit:** `docs: document Phase 1 scan flow, CLI, and frontend`

---

## Decisions

1. **Docker socket:** `@autoscanner/docker-runner` reads `DOCKER_HOST` from env if set, otherwise falls back to platform default (`//./pipe/docker_engine` on Windows, `/var/run/docker.sock` on *nix). `DOCKER_HOST` added to `.env.example` (commented out by default).
2. **WebSocket auth:** subscriptions authenticate via `connectionParams.authorization: 'Bearer <accessToken>'`. No cookie path. Matches the HTTP transport.
3. **nmap privileges:** nmap container runs as root with `NET_RAW`/`NET_ADMIN`/`NET_BIND_SERVICE` and `network: host`, as per spec §8.3. The Docker sandbox is the trust boundary; user-namespacing is deferred to Phase 6 hardening.
4. **Frontend stack:** Vite + React 18 + TypeScript + Apollo Client + React Router + Tailwind + shadcn/ui + Vitest + React Testing Library, per spec §18.1.
5. **CI Docker:** GitHub Actions `ubuntu-latest` runners have Docker natively; pull `instrumentisto/nmap` during the full-stack e2e step. Network mode `host` works on Linux runners. No DinD sidecar needed.

## Suggested sequencing

Sequential blocks (work within a block can parallelize if multiple agents):

- **Block A (foundation libs):** Tasks 1 → 2 → 3 → 4 → 5 → 6 → 7
- **Block B (workers):** Tasks 8, 9 (8 must precede 9 in commit order; both depend on A)
- **Block C (API):** Tasks 10 → 11 → 12 → 13 (depend on A)
- **Block D (clients):** Tasks 14 (CLI), 15 → 16 (frontend) — depend on C
- **Block E (integration):** Tasks 17 → 18 → 19

Targeting ~3 weeks at 1-2 tasks/day.
