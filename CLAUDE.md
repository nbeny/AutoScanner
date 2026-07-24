# CLAUDE.md

Guidance for Claude Code (and other AI agents) working in this repository. See `README.md` for the user-facing overview.

## What this is

AutoScanner is a single-operator pentest/red-team platform. It runs ~98 security scanners (Kali/ProjectDiscovery tools) in sandboxed Docker containers, normalises their output into a unified asset/finding model, correlates duplicate findings across tools, enriches with CVE data, and scores risk. Nx 20 monorepo, NestJS 11, Prisma 6 (PostgreSQL), Redis/BullMQ, MinIO, Apollo GraphQL, React frontend.

## The scan pipeline (mental model)

A run flows through queue-driven workers — nothing runs inline in the API:

1. **api-gateway** — `runScan` (single scanner) or `runTemplate` (multi-step chain) GraphQL mutations create `Scan` + `ScanJob` rows atomically and enqueue to BullMQ.
2. **scan-worker** (`scan-jobs`) — resolves credentials/OAST, calls the scanner's `build()` to construct the Docker command, runs it in a sandboxed container (`libs/docker-runner`), streams logs to Redis, stores raw output to MinIO, enqueues a parse job.
3. **parser-worker** (`parse-jobs`) — runs the scanner's parser to normalise output into entities, persists them, then dedups + correlates findings and recomputes risk score.
4. **orchestrator-worker** (`template-runs`) — for templates only: resolves each step's targets via `ContextBuilder` (root `target`, discovered `subdomains`, `ipAddresses`, `urls`, `endpoints`, `emails`), dispatches child scan jobs step by step.
5. Support workers: `cve-enricher-worker`, `nvd-sync-worker`, `report-worker`, `notification-worker`, `scheduler`.

Queue names: `libs/queues/src/queue-names.ts`. The target string (IP/domain/URL/CIDR/bucket) is **not** validated against a type at the API — each scanner's `build()` decides how to use it.

## Key locations

| Concern                     | Path                                                                            |
| --------------------------- | ------------------------------------------------------------------------------- |
| Scanner contract + registry | `libs/scanner-sdk/src/` (`types.ts`, `registry.ts`)                             |
| A scanner adapter           | `libs/scanners/<name>/src/<name>.scanner.ts`                                    |
| Scanner registration        | `libs/scanners/all/src/all-scanners.module.ts`                                  |
| Templates                   | `libs/templates/src/builtins/*.ts`, types in `../types.ts`                      |
| Output parsers              | `libs/parsers/src/`                                                             |
| Correlation + risk          | `libs/correlation/src/`                                                         |
| CVE / CPE matching          | `libs/cve/src/`                                                                 |
| Scan entry point            | `apps/api-gateway/src/app/scans/` (resolver + service)                          |
| Scan execution              | `apps/scan-worker/src/app/scan-job.processor.ts`                                |
| Parse + persist             | `apps/parser-worker/src/app/parse-job.processor.ts`                             |
| Template orchestration      | `apps/orchestrator-worker/src/app/` (processor, step-executor, context-builder) |
| Prisma schema               | `prisma/schema.prisma`                                                          |

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
- **Formatting**: Prettier (`pnpm format`), ESLint. Match surrounding code style.

## Local dev gotchas

- `pnpm dev:up` starts postgres + redis + minio (lean). Mongo is behind a compose profile: `pnpm dev:up:mongo`. Without the stack running, smoke checks and `database:test` fail with `ECONNREFUSED`.
- Custom scanner images must be built (`pnpm scanners:build`) before those scanners can run.
- OAST/interactsh for out-of-band injection testing: `pnpm oast:up`.

## Git / workflow

- Default branch is `main`. Commit or push only when the user asks; branch before committing if on `main`.
- Do not push or force-push without explicit consent.
- Design specs and phase plans live under `docs/superpowers/` — these are a historical record, not living docs; don't rewrite them.
