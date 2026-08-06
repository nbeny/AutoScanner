# CLAUDE.md

Guidance for Claude Code (and other AI agents) working in this repository. See `README.md` for the user-facing overview.

## What this is

AutoScanner is a single-operator pentest/red-team platform. It runs **120 security scanners** (Kali/ProjectDiscovery tools) in sandboxed Docker containers, normalises their output into a unified asset/finding model, correlates duplicate findings across tools, enriches with CVE data, and scores risk. Nx 20 monorepo, NestJS 11, Prisma 6 (PostgreSQL), Redis/BullMQ, MinIO, Apollo GraphQL, React frontend.

The full per-scanner inventory (name, path, Docker image, underlying CLI tool, categories) — split into the OSINT / passive group and the IP / active-scanning group — lives in [`scanner.md`](scanner.md). Regenerate it from `libs/scanners/all/src/all-scanners.module.ts` whenever scanners are added or removed.

## The scan pipeline (mental model)

A run flows through Kafka-consuming workers — nothing runs inline in the API:

1. **api-gateway** — `runScan` (single scanner) or `runTemplate` (multi-step chain) GraphQL mutations create `Scan` + `ScanJob` rows atomically and publish a `security.scanner.requested` Kafka event.
2. **scan-worker** (consumes `security.scanner.requested`) — resolves credentials/OAST, calls the scanner's `build()` to construct the Docker command, runs it in a sandboxed container (`libs/docker-runner`), streams logs to Redis, stores raw output to MinIO, then publishes `security.parse.requested`.
3. **parser-worker** (consumes `security.parse.requested`) — runs the scanner's parser to normalise output into entities, persists them, then dedups + correlates findings and recomputes risk score.
4. **orchestrator-worker** (`template-runs`) — for templates only: resolves each step's targets via `ContextBuilder` (root `target`, discovered `subdomains`, `ipAddresses`, `urls`, `endpoints`, `emails`), dispatches child scan jobs step by step.
5. **ai-orchestrator-worker** (`ai-runs`) — AutoHunt: an _AI-driven_ alternative to static templates. Instead of a fixed step list, Claude Sonnet decides the next scanner(s) after each parsed result. See below.
6. Support workers: `cve-enricher-worker`, `nvd-sync-worker`, `report-worker`, `notification-worker`, `scheduler`.

**Messaging backbone**: domain events flow over **Kafka (Redpanda)** topics named `security.*`, each with `.retry` + `.dlq` companions (registry: `libs/messaging/src/topics`; consumer framework: `MessageConsumer`/`ConsumerRegistrar`; provision topics with `pnpm kafka:provision`). BullMQ is **legacy** — many code comments still say "BullMQ" but the runtime is Kafka; `libs/queues/src/queue-names.ts` now only backs a BullMQ-shaped health contract. Host workers reach Kafka at `localhost:19092` (external listener); in-container services use `redpanda:9092` (`KAFKA_BROKERS` defaults to `localhost:19092`).

The target string (IP/domain/URL/CIDR/bucket) is **not** validated against a type at the API — each scanner's `build()` decides how to use it.

## AutoHunt (AI-autonomous hunting)

A Google-style page (`/hunt`) where the operator types an IP / range / CIDR (IPv4 **and** IPv6) and the platform autonomously hunts every vulnerability, with **Claude Sonnet deciding the next scanner from each result**. The run is shown as a live scan-graph and ends with an AI-written audit.

- **`runAiScan` mutation** (`apps/api-gateway/src/app/ai-runs/`) auto-provisions a "Quick Scans" engagement, grants all capabilities, scopes the target, creates an `AiRun`, and enqueues `ai-runs`.
- **`ai-orchestrator-worker`** runs the agentic loop per host: build world state (DB entities) → ask Claude (via `libs/claude-agent`) which scanner(s) to run next → validate against the registry + Zod schema → dispatch via `libs/scan-dispatch` (`ScanDispatcher`, the proven subscribe-before-create + poll/push completion pattern) → repeat under **guardrails** (`maxScans`/`maxDepth`/`timeBudgetMs`/`hostCap`, editable from the page) → write an audit. A **degraded fallback** (deterministic methodology) keeps the run progressing when Claude is empty/quota-limited.
- **Claude runs in a container via the operator's subscription** (no API key): `libs/claude-agent` spawns `claude -p --output-format json` and scrubs `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN` from the child env (ported from `../BotTrading`). Container + read-only credential mounts: `docker/Dockerfile.ai-orchestrator` + `docker/ai/docker-compose.ai.yml`; env in `.env.example` (`ANTHROPIC_*`, `CLAUDE_DIR`, `CLAUDE_CONFIG`). In local dev the worker uses the host `claude` binary if you're logged in.
- **Live view** (`apps/frontend/src/features/hunt/`) subscribes to `aiRunEvents` (Redis channel `airun:events:<id>`) and renders an SVG scan-graph (`AiRunNode` tree via `parentNodeId`), decision timeline, and audit panel.
- Data model: `AiRun` / `AiRunNode` / `AiDecision` in `prisma/schema.prisma`; `Scan.aiRunId`/`aiRunNodeId` link child scans back to the run/graph. `pwncat` (`libs/scanners/pwncat/`) is an experimental best-effort exploit probe the AI may select.

## Key locations

| Concern                     | Path                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Scanner contract + registry | `libs/scanner-sdk/src/` (`types.ts`, `registry.ts`)                                                           |
| A scanner adapter           | `libs/scanners/<name>/src/<name>.scanner.ts`                                                                  |
| Scanner registration        | `libs/scanners/all/src/all-scanners.module.ts`                                                                |
| Templates                   | `libs/templates/src/builtins/*.ts`, types in `../types.ts`                                                    |
| Output parsers              | `libs/parsers/src/`                                                                                           |
| Correlation + risk          | `libs/correlation/src/`                                                                                       |
| CVE / CPE matching          | `libs/cve/src/`                                                                                               |
| Scan entry point            | `apps/api-gateway/src/app/scans/` (resolver + service)                                                        |
| Scan execution              | `apps/scan-worker/src/app/scan-job.processor.ts`                                                              |
| Parse + persist             | `apps/parser-worker/src/app/parse-job.processor.ts`                                                           |
| Template orchestration      | `apps/orchestrator-worker/src/app/` (processor, step-executor, context-builder)                               |
| AutoHunt AI loop            | `apps/ai-orchestrator-worker/src/app/` (ai-run.processor, world-state, decision-prompt/validator, guardrails) |
| Claude subscription bridge  | `libs/claude-agent/src/` (CLI transport, env scrub, stub transport)                                           |
| AI scan dispatch            | `libs/scan-dispatch/src/` (`ScanDispatcher`)                                                                  |
| AutoHunt API + UI           | `apps/api-gateway/src/app/ai-runs/`, `apps/frontend/src/features/hunt/`                                       |
| Prisma schema               | `prisma/schema.prisma`                                                                                        |

## Adding a scanner (the common task)

1. Create `libs/scanners/<name>/` following an existing scanner (e.g. `libs/scanners/nmap/`) — export a `ScannerDefinition` and a NestJS module.
2. Define: `name`, `category[]` (from `ScannerCategory`), `inputSchema` (Zod), `docker` spec (image, network, capabilities, memory, timeout), `build(input, target, ctx)`, `outputs[]` (format + parser name), `produces[]`, optional `requiresCredential`.
3. Add a parser in `libs/parsers/` if the output format is new.
4. Register the module in `libs/scanners/all/src/all-scanners.module.ts`.
5. If it uses a custom Docker image, add it to `tools/scanners/build-images.sh` (`pnpm scanners:build`).
6. Add it to relevant templates in `libs/templates/src/builtins/` if it belongs in a chain.

Prefer **reuse** of existing entity types and parsers over introducing new ones — recent phases have been reuse-only.

## Conventions

- **Package manager**: pnpm 9. **Node**: 22 (`nvm use`).
- **Nx targets**: `pnpm nx <target> <project>` or `pnpm test|lint|type-check|build` (run-many). Run the narrowest target for the projects you touched.
- **Secrets**: never log or return credentials. API keys / auth are AES-256-GCM sealed via `SecretBox` (`libs/common`), keyed from `MASTER_ENCRYPTION_KEY`, decrypted in-memory only at scan time.
- **Correlation invariant**: re-scans must never overwrite an operator's triage `status`. Findings dedup on a stable hash; CorrelatedFinding clusters on a structural signature (CVE → category → title fallback).
- **Idempotency**: workers assume at-least-once delivery — job processors are written to be safe on retry.
- **GraphQL input DTOs**: every field MUST carry a class-validator decorator (`@IsOptional`/`@IsEnum`/`@IsString`/…), not just `@Field()`. The global `ValidationPipe` runs `{ whitelist, forbidNonWhitelisted }`, so an undecorated field is rejected at runtime with `property <x> should not exist` (a GraphQL-valid query 400s).
- **Formatting**: Prettier (`pnpm format`), ESLint. Match surrounding code style.
- **Single test file**: `pnpm nx test <project> --testFile=<name>.spec.ts`.

## Local dev gotchas

- `pnpm dev:up` starts postgres + redis + minio + redpanda (lean, **infra only**). Mongo is behind a compose profile: `pnpm dev:up:mongo`. Without the stack running, smoke checks and `database:test` fail with `ECONNREFUSED`.
- **Full app in containers**: `docker compose -f docker/docker-compose.dev.yml --profile app up -d --build` builds api-gateway + microservices + frontend (front → http://localhost:4200, API → http://localhost:4000). The `app` profile does **not** include scan-worker / parser-worker — run those on the host via `pnpm nx serve scan-worker` / `pnpm nx serve parser-worker` (both are needed for a scan to complete + produce findings).
- Scanner images are **pulled, never built** at scan time (`pullIfMissing` in `libs/docker-runner`): public images auto-pull, but custom `autoscanner/<name>:1.0` images only exist locally after `pnpm scanners:build` — run it before those scanners can work.
- Dev login for testing GraphQL manually: `POST /auth/login {email,password}` (`OPERATOR_EMAIL`/`OPERATOR_PASSWORD` from `.env`, seeded via `pnpm seed`) → `{ accessToken }`; send as `Authorization: Bearer <token>`.
- OAST/interactsh for out-of-band injection testing: `pnpm oast:up`.

## Git / workflow

- Default branch is `main`. Commit or push only when the user asks; branch before committing if on `main`.
- Do not push or force-push without explicit consent.
