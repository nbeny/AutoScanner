# Kali tool runner — SP3a : backend runner pipeline (event-driven)

**Date:** 2026-08-07
**Status:** Draft (pending user review)

## Program context

Part of the Kali tool catalog program (see `2026-08-07-kali-tool-catalog-sp1-acquisition-design.md`).
Goal of SP3: a free "Exegol-like" runner — the operator composes an arbitrary Kali tool command
and runs it from the web app, with live progress and a clean (non-raw) rendered result.

**Execution model (decided 2026-08-07):** one fat `kali-toolbox` image (kali-linux-large, all
tools), but the worker spawns an **ephemeral container per run** (`docker run --rm kali-toolbox
<argv>`) reusing `libs/docker-runner` — NOT running the consumer inside Kali (rejected: loses
per-scan isolation + widens credential blast radius).

SP3 is split:
- **SP3a (this spec) — backend runner pipeline.** Model + migration, `kali-toolbox` image,
  `kali-tool-worker` (2 Kafka consumers: run → parse+persist), topics, generic output parser,
  `runKaliTool` mutation + queries + `kaliToolRunEvents` subscription. Testable via API, NO UI.
- **SP3b — frontend command-builder + live view** (driven by SP1's `kaliTool(binary)` options;
  renders the parsed result per format). Separate spec/plan.

## Problem

The 120 structured scanners each run in their own per-tool Docker image and normalize output into
entities. There is no way to run an arbitrary Kali tool (of the 600+ documented in SP1) with
operator-chosen arguments and see a clean result. SP3a builds the event-driven backend for that.

## Goals

- Persist a **`KaliToolRun`** (Prisma) capturing binary, args, status, raw output ref, parsed
  result, exit code.
- Execute the command in an **ephemeral `kali-toolbox` container** via `libs/docker-runner`
  (argv-only, no shell), capturing output to MinIO.
- Drive it through **Kafka**: `run → parse+persist`, two topics, two idempotent consumers (mirrors
  the existing `scanner.requested → parse.requested` split, where the parse stage also persists).
- **Parse output generically by format** (JSON preferred; else best-effort table / key-value /
  clean text) into a structured `parsedJson` — never a raw blob.
- Stream **live progress** at every step via a `kaliToolRunEvents` GraphQL subscription
  (Redis pub/sub), mirroring the AiRun events pattern.
- Enforce **safety**: engagement authz, binary allowlist (SP1 dataset), scope gate on target-like
  args, docker-runner isolation, output/arg caps.

## Non-goals (YAGNI)

- No UI (SP3b).
- No normalized findings / correlation from free runs (raw + generic parse only; normalization is a
  possible later follow-up).
- No per-tool bespoke parsers (SP1 decision: generic-by-format; per-tool parsers deferred).
- No auto-injection of JSON flags — the command-builder (SP3b) assists; SP3a's parser just detects
  the received format.
- Not building `kali-linux-everything` (use `kali-linux-large`, same knob as SP1).

## Design

### 1. Data model (Prisma) — `KaliToolRun`

Mirrors `AiRun` shape/conventions.

```prisma
enum KaliToolRunStatus {
  PENDING   // created, requested event published
  RUNNING   // container executing
  PARSING   // output captured, parse+persist consumer working
  COMPLETED // parsed result persisted
  FAILED
}

model KaliToolRun {
  id            String            @id @default(cuid())
  engagementId  String
  createdById   String
  binary        String
  argsJson      Json              // string[] argv (excluding the binary)
  target        String?           // optional target-like arg, for scope context
  jsonRequested Boolean           @default(false)
  status        KaliToolRunStatus @default(PENDING)
  rawOutputRef  String?           // MinIO object key of the captured stdout/stderr
  outputFormat  String?           // 'json' | 'table' | 'keyvalue' | 'text'
  exitCode      Int?
  parsedJson    Json?             // { format, view } produced by the parse stage
  errorMessage  String?
  startedAt     DateTime?
  completedAt   DateTime?
  createdAt     DateTime          @default(now())
  updatedAt     DateTime          @updatedAt

  engagement Engagement @relation(fields: [engagementId], references: [id], onDelete: Cascade)
  createdBy  User       @relation(fields: [createdById], references: [id])

  @@index([engagementId])
}
```
Add back-relations on `Engagement` and `User`. One migration (`prisma migrate dev`).

### 2. Execution — `kali-toolbox` image + docker-runner

- **Image** `autoscanner/kali-toolbox:1.0` from `kalilinux/kali-rolling` + `kali-linux-large`
  (knob `KALI_META`, same as SP1). Added to `tools/scanners/build-images.sh` (`pnpm scanners:build`).
  Built once; not pulled at run time from a public registry.
- The **run consumer** builds `argv = [binary, ...args]` and runs it through `libs/docker-runner`
  with a `kali-toolbox` docker spec: `network` (default `bridge`; overridable), `readonlyRootfs:
  true`, dropped capabilities, `memoryLimitMb`, `defaultTimeoutMs`, **no shell** (argv passed as the
  container command array). stdout+stderr captured, **size-capped**, stored to MinIO
  (`rawOutputRef`). `exitCode` recorded.
- **Binary allowlist**: reject any `binary` not present in the SP1 dataset
  (`KaliCatalogService.findByBinary`) — enforced at the mutation (fast fail) AND re-checked in the
  worker (defense in depth).

### 3. Kafka flow + topics

Add to `libs/messaging/src/topics.ts` (framework auto-creates `.retry` + `.dlq`). Two topics,
mirroring the scan pipeline's `scanner.requested → parse.requested` (where the parse stage also
persists):

```
'security.kalitool.requested':       { partitions: 3, group: 'kali-tool-run' }
'security.kalitool.parse.requested': { partitions: 3, group: 'kali-tool-parse' }
```

Flow (each stage idempotent; guards on `status`; at-least-once safe):
1. `runKaliTool` mutation → row `PENDING` + publish `security.kalitool.requested {runId}`.
2. **run consumer**: `PENDING→RUNNING`, docker-run the command, capture stdout/stderr → MinIO
   (`rawOutputRef`), record `exitCode`, publish `security.kalitool.parse.requested {runId}`.
3. **parse+persist consumer**: `RUNNING→PARSING`, load raw from MinIO, `parseToolOutput` →
   `{format, view}`, write `outputFormat` + `parsedJson`, `→COMPLETED`.
Any stage failure → `FAILED` + `errorMessage` + a terminal event.

There is no separate persist stage: parsing and persistence are fast, tightly coupled, and run in
the same consumer (exactly as `parser-worker` persists after parsing). This also avoids shipping the
(potentially large) parsed payload over an extra Kafka hop.

### 4. Generic output parser (pure, by format)

`parseToolOutput(raw: string): { format: 'json'|'table'|'keyvalue'|'text'; view: unknown }`
(lives in `apps/kali-tool-worker/src/app/parse/parse-tool-output.ts`, unit-tested there):
- Strip ANSI escape codes first.
- If the trimmed body starts with `{`/`[` and `JSON.parse` succeeds → `format:'json'`, `view` = the
  parsed value.
- Else if it looks tabular (≥2 lines with a consistent delimiter — whitespace-aligned columns, TSV,
  or CSV) → `format:'table'`, `view = { headers, rows }`.
- Else if the body is dominated by `key: value` lines → `format:'keyvalue'`,
  `view = { pairs: [{key, value}] }`.
- Else → `format:'text'`, `view = { lines }` (trimmed, ANSI-stripped).
`rawOutputRef` is always retained; the UI renders `view` per `format` — never a raw JSON blob.

### 5. Worker — `kali-tool-worker`

One new Nx app `apps/kali-tool-worker` hosting **two `MessageConsumer`s** (run / parse+persist)
registered via `ConsumerRegistrar`, mirroring existing workers (`scan-worker`). Dependencies:
`libs/docker-runner`,
MinIO storage (reuse scan-worker's storage service), `PrismaService`, the events publisher (§6),
and `KaliCatalogService`/dataset for the allowlist. Host worker reaches Kafka at `localhost:19092`
(external listener), same as other host workers.

### 6. API + live subscription

In `apps/api-gateway`:
- **Mutation** `runKaliTool(input: RunKaliToolInput!): KaliToolRunObject`
  `RunKaliToolInput { engagementId: ID!, binary: String!, args: [String!]!, jsonOutput: Boolean }`
  (every field class-validator decorated per repo convention). Behavior: assert engagement access
  (same guard other engagement-scoped mutations use); **allowlist `binary`** against the SP1 dataset;
  **scope-gate** any arg parsing as host/IP/URL against the engagement's INCLUDE `ScopeRule`s (reuse
  the `hostInScope` logic from `ContextBuilder`) — reject out-of-scope targets; cap arg count/length;
  create `KaliToolRun` PENDING; publish `security.kalitool.requested`; return the run.
- **Queries** `kaliToolRun(id: ID!)`, `kaliToolRuns(engagementId: ID!)`.
- **Subscription** `kaliToolRunEvents(runId: ID!): KaliToolRunEvent` on Redis channel
  `kalitool:events:<runId>`. Publisher (`KaliToolRunEventsPublisher`, in the worker) and subscriber
  (`KaliToolRunEventsSubscriber`, in api-gateway) are **ported verbatim** from
  `AiRunEventsPublisher`/`AiRunEventsSubscriber` (rename + channel). Events: `{type:'status', status}`
  at each transition (`RUNNING`, `PARSING`, `COMPLETED`/`FAILED`), terminal `{type:'result', format}`
  (UI refetches the run) or `{type:'error', message}`. Both consumers publish; step granularity comes
  from the status transitions, not from the number of consumers.

### 7. Security & guardrails

- **Engagement authz** on the mutation (mandatory).
- **Binary allowlist** (SP1 dataset) at mutation + worker.
- **argv array only, never a shell** → no command injection.
- **Scope gate**: target-like args checked against engagement INCLUDE ScopeRules (strict default).
- **docker-runner isolation**: ephemeral `--rm`, `readonlyRootfs`, dropped caps, memory/cpu/timeout,
  network mode.
- **Caps**: max args count + per-arg length (mutation); captured output size cap (worker).
- Never log/return credentials; the run container gets only what it needs.

### 8. Testing

- **`parseToolOutput`** — fixtures: valid JSON object/array; whitespace-aligned table; CSV/TSV;
  key:value block; ANSI-laden text; empty. Assert `{format, view}`.
- **argv builder + allowlist** — unknown binary rejected; argv excludes shell metachars are passed
  literally (no interpretation).
- **Scope gate** — an out-of-scope host arg is rejected; an in-scope one passes; a non-target arg
  passes.
- **Consumers** — run→captures + publishes parse (mock docker-runner + MinIO); parse+persist→parses
  + writes DB → COMPLETED (mock MinIO + Prisma). Status transitions + idempotency (re-delivery
  no-ops).
- **Mutation** creates row + publishes requested. **Subscription** streams events (port the
  `ai-run-events.subscriber.spec` cases).
- Migration applies; `KaliToolRun` round-trips.

## Rollout

Additive: new model + migration, new topics (`pnpm kafka:provision`), new worker app, new
`kali-toolbox` image (`pnpm scanners:build`). No change to the 120-scanner pipeline. The worker must
be run on the host (like scan-worker/parser-worker) for a run to complete. Dataset must be generated
(`pnpm kali:catalog`) for the allowlist to cover >3 tools; with the seed, only nmap/ffuf/nikto are
allowlisted.

## Open questions (for the plan)

- Exact `docker-runner` entry API for an ad-hoc image+argv (vs the scanner-spec path) — confirm when
  writing the plan by reading `libs/docker-runner/src/dockerode-runner.ts`.
- MinIO storage service reuse: confirm the scan-worker's raw-output storage helper and bucket/key
  convention to mirror for `rawOutputRef`.
- Event payload for `parse.requested`: just `{runId}` (parse consumer re-reads MinIO) — confirm the
  raw output isn't so large that re-reading is wasteful; if it is, consider riding a MinIO ref only
  (already the plan). No parsed payload travels over Kafka.
