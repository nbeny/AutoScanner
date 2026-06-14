# Phase 5.5 — Webhook Ingest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use `- [ ]`.

> **Date:** 2026-06-14
> **Spec:** `docs/superpowers/specs/2026-06-12-phase-5-...-design.md` §2 (5.5), §3.1 (WebhookEvent), §3.2 (webhook-jobs), §4 (webhook security), §5.5.
> **Branch:** `phase-5-5-webhooks` (off `main`). **Last sub-phase of Phase 5.**

**Goal:** An external tool (`burp`/`zap`/`generic`) POSTs findings to `/webhooks/:source` with a shared-secret token; they're persisted as `Finding`/`Asset` rows under the target engagement, reusing the parser-worker persistence layer.

**Architecture:** `POST /webhooks/:source` (api-gateway REST, token-auth via `X-Autoscanner-Token` vs `WEBHOOK_<SOURCE>_TOKEN`, constant-time compare, JSON ≤5 MB) inserts a `WebhookEvent` row and enqueues `webhook-jobs` `{ webhookEventId }`. The **parser-worker** gains a `WebhookProcessor` that loads the event, normalises the payload (per-source adapter → `NormalizedFinding[]` + `assetValue` + `engagementId`), creates a synthetic `Scan`+`ScanJob` (`scannerName = webhook:<source>`, terminal), upserts assets + findings via the existing `FindingPersister`, and marks the event `processedAt`/`resultingScanId`.

**Tech Stack:** NestJS REST + `@nestjs/throttler`, Prisma, BullMQ, `@autoscanner/correlation` (`canonicalize`, `findingDedupHash`), `@autoscanner/parsers` (`NormalizedFinding`), Jest.

---

## Pre-requisites / context
- **Finding persistence:** `apps/parser-worker/src/app/persisters/finding-persister.ts` `FindingPersister.upsert(scanJobId, assetId, finding: NormalizedFinding, assetCanonical, tx?)`. `NormalizedFinding` (`libs/parsers/src/types.ts`): `{ scannerName, title, severity (Severity enum), location?, cveId?, templateId?, evidence?, description? }`. `Severity` = `INFO|LOW|MEDIUM|HIGH|CRITICAL`.
- **Assets:** read `apps/parser-worker/src/app/persisters/asset-persister.ts` `upsertSimpleInTx` for the find-or-create-by-`{engagementId,type,canonicalValue}` pattern, and `canonicalize(value, { type })` from `@autoscanner/correlation`. The webhook processor will do a minimal inline asset upsert (DOMAIN by default; IP_ADDRESS if the value matches an IPv4 regex) and reuse `FindingPersister`. Read the `Asset` model + `AssetType` enum in `prisma/schema.prisma` for exact enum values.
- **A Finding requires a `scanJobId`** → create a synthetic `Scan` (status COMPLETED) + `ScanJob` (`scannerName: 'webhook:<source>'`, `target: source`, status COMPLETED) for the batch.
- **REST/throttler:** `@nestjs/throttler` is referenced in the spec as already configured — verify; if not wired, add `ThrottlerModule.forRoot([{ ttl: 60000, limit: 30 }])` to the webhooks module (or app) and `@Throttle`/`@UseGuards(ThrottlerGuard)` on the controller. Body limit: the global `express.json({ limit })` was set to 15mb in phase 5.4 — add a **per-route 5 MB guard**: check `JSON.stringify(body).length` or use a raw-body length check; simplest is a DTO-level size cap + an explicit check in the service (reject >5 MB serialized).
- **Token auth:** `WEBHOOK_GENERIC_TOKEN`, `WEBHOOK_ZAP_TOKEN`, `WEBHOOK_BURP_TOKEN` — add to `libs/config/src/env.schema.ts` as `.optional()`. If a source's token env is unset → that source returns 503 (not configured). Compare with `crypto.timingSafeEqual` (guard length first).
- **engagementId source:** the request body MUST include `engagementId` (all three formats). The service/normalizer validates it exists before persisting. (No per-engagement tokens in v1.)

---

## File Structure
- `prisma/schema.prisma` (+ migration) — `WebhookEvent` model.
- `libs/queues/src/*` — `WEBHOOK_JOBS` + `WebhookJobPayload { webhookEventId }`.
- `apps/api-gateway/src/app/webhooks/` — `webhooks.controller.ts`, `webhooks.service.ts`, `webhooks.module.ts`, `dto/webhook-ingest.dto.ts`, tests. Register in `app.module.ts`. Env tokens.
- `apps/parser-worker/src/app/webhook/` — `webhook-normalizer.ts` (per-source adapters → normalized), `webhook.processor.ts`, tests. Wire into parser-worker `app.module.ts` (+ register `WEBHOOK_JOBS` consumer).
- `apps/api-gateway-e2e/src/scenarios/webhooks-e2e.spec.ts` (gated `WEBHOOK_E2E`).

---

## T1 — WebhookEvent model + webhook-jobs queue
- [ ] **T1.1** — `prisma/schema.prisma` after `Agent`:

```prisma
model WebhookEvent {
  id              String   @id @default(cuid())
  source          String
  payload         Json
  receivedFromIp  String?
  receivedAt      DateTime @default(now())
  processedAt     DateTime?
  resultingScanId String?
  errorMessage    String?

  @@index([source])
  @@index([processedAt])
}
```

- [ ] **T1.2** — Hand-write migration `prisma/migrations/20260614020000_phase5_webhooks/migration.sql` (no DB; mirror prior migrations: CreateTable + 2 indexes; no FKs). `pnpm prisma generate`.
- [ ] **T1.3** — `libs/queues/src/queue-names.ts`: add `WEBHOOK_JOBS: 'webhook-jobs',`. `job-payloads.ts`: `export interface WebhookJobPayload { webhookEventId: string; }` + map entry. `queues.module.ts`: register `{ name: QueueName.WEBHOOK_JOBS }`.
- [ ] **T1.4** — Verify `type-check -p database,queues`. Commit: `feat(phase-5.5): WebhookEvent model + webhook-jobs queue`.

---

## T2 — Webhook normalizer (TDD)
`apps/parser-worker/src/app/webhook/webhook-normalizer.ts`. Pure functions, fully unit-testable.

- [ ] **T2.1** — Types + API:

```ts
import type { NormalizedFinding } from '@autoscanner/parsers';

export interface NormalizedWebhookFinding extends NormalizedFinding { assetValue: string; }
export interface NormalizedWebhookBatch {
  engagementId: string;
  source: string;
  findings: NormalizedWebhookFinding[];
}
export class WebhookNormalizationError extends Error {}

export function normalizeWebhook(source: string, payload: unknown): NormalizedWebhookBatch;
```

- [ ] **T2.2** — Behavior (TDD, write tests first in `__tests__/webhook-normalizer.spec.ts`):
  - **generic** shape `{ engagementId, findings: [{ title, severity, assetValue, location?, cveId?, evidence? }] }`: validate `engagementId` is a non-empty string; map each finding, coercing `severity` to the `Severity` enum (uppercase; accept INFO/LOW/MEDIUM/HIGH/CRITICAL; reject unknown → error). `scannerName: 'webhook:generic'`.
  - **zap** shape (ZAP JSON report-ish) `{ engagementId, site: [{ alerts: [{ name, riskdesc|riskcode, uri|instances }] }] }` OR a simplified `{ engagementId, alerts: [{ name, risk, url }] }` — support the SIMPLIFIED shape `{ engagementId, alerts: [{ name, risk, url, cweid? }] }`: map `risk` (`High|Medium|Low|Informational`) → `HIGH|MEDIUM|LOW|INFO`; `assetValue` = host from `url`; `title` = `name`; `location` = `url`. `scannerName: 'webhook:zap'`.
  - **burp** simplified shape `{ engagementId, issues: [{ name, severity, host, path? }] }`: severity `High|Medium|Low|Information` → `HIGH|MEDIUM|LOW|INFO`; `assetValue` = `host`; `location` = `host + (path ?? '')`. `scannerName: 'webhook:burp'`.
  - unknown source → `WebhookNormalizationError`.
  - missing/empty `engagementId` or `findings`/`alerts`/`issues` not an array → `WebhookNormalizationError`.
  - A helper `hostFromUrl(url)` extracts the hostname (fallback to the raw value if not a URL).
- [ ] **T2.3** — Green. Commit: `feat(phase-5.5): webhook payload normalizer (generic/zap/burp)`.

---

## T3 — api-gateway ingest endpoint (TDD)
- [ ] **T3.1** — `dto/webhook-ingest.dto.ts`: minimal — accept arbitrary JSON object body (the controller passes the raw body through; normalization happens in the worker). Validate it's an object. (Keep validation light; the normalizer does the real validation in the worker.)
- [ ] **T3.2** — `webhooks.service.ts` (inject `PrismaService`, `@InjectQueue(WEBHOOK_JOBS)`, `AppConfigService`):
  - `tokenForSource(source)`: returns `cfg.env.WEBHOOK_<SOURCE>_TOKEN` for `'generic'|'zap'|'burp'`, else undefined.
  - `verifyToken(source, providedToken)`: if no configured token → throw a `ServiceUnavailableException('webhook source not configured')`; if `providedToken` missing or not constant-time-equal → `UnauthorizedException`. Use `crypto.timingSafeEqual` on equal-length Buffers (compare lengths first).
  - `ingest(source, payload, ip)`: enforce `source ∈ {generic,zap,burp}` (else `NotFoundException`); enforce serialized size ≤ 5 MB (`Buffer.byteLength(JSON.stringify(payload)) <= 5_242_880` else `PayloadTooLargeException`); insert `WebhookEvent { source, payload, receivedFromIp: ip }`; enqueue `webhook-jobs { webhookEventId }` (on enqueue failure: set `errorMessage`, rethrow). Return `{ webhookEventId }`.
  - TDD: unknown source → 404; unconfigured token → 503; bad token → 401; happy path inserts event + enqueues; oversized payload → 413; enqueue failure sets errorMessage + rethrows.
- [ ] **T3.3** — `webhooks.controller.ts` `@Controller('webhooks')`: `@Post(':source')` `@HttpCode(202)` — read token from header `x-autoscanner-token` (`@Headers`), call `verifyToken` then `ingest`; return `{ accepted: true, webhookEventId }`. Apply `@UseGuards(ThrottlerGuard)` + `@Throttle({ default: { ttl: 60000, limit: 30 } })` (per spec §4: 30/min/IP).
- [ ] **T3.4** — `webhooks.module.ts`: providers service; controller; import `ThrottlerModule.forRoot([...])` if not globally present (check `app.module.ts` first — if Throttler is already global, just use the guard). Add `WEBHOOK_GENERIC_TOKEN`/`WEBHOOK_ZAP_TOKEN`/`WEBHOOK_BURP_TOKEN` (`.optional()`) to `libs/config/src/env.schema.ts`. Register `WebhooksModule` in `app.module.ts`.
- [ ] **T3.5** — Verify `type-check,test -p api-gateway,config`. Commit: `feat(phase-5.5): /webhooks/:source ingest (token auth + enqueue)`.

---

## T4 — parser-worker WebhookProcessor (TDD)
- [ ] **T4.1** — `apps/parser-worker/src/app/webhook/webhook.processor.ts`: `@Processor(QueueName.WEBHOOK_JOBS) extends WorkerHost`. Inject `PrismaService`, `FindingPersister`. `process(job)`:
  1. Load `WebhookEvent` by `job.data.webhookEventId`; if missing → return.
  2. `normalizeWebhook(event.source, event.payload)` → batch. On `WebhookNormalizationError`: set `event.errorMessage`, `processedAt: now`, return (don't throw — bad payloads shouldn't infinitely retry).
  3. Validate engagement exists (`engagement.findUnique`); if not → set errorMessage + processedAt, return.
  4. Create synthetic `Scan` (engagementId, status COMPLETED, name `webhook:<source>`, createdById = engagement.ownerId) + `ScanJob` (scanId, scannerName `webhook:<source>`, target source, status COMPLETED, input `{}`, completedAt now).
  5. For each finding: determine asset type (IPv4 regex → `IP_ADDRESS`, else `DOMAIN`), `canonicalValue = canonicalize(assetValue, { type })`, find-or-create `Asset` by `{ engagementId, type, canonicalValue, deletedAt: null }` (mirror `asset-persister.upsertSimpleInTx`), get `assetId`; `FindingPersister.upsert(scanJob.id, assetId, { scannerName, title, severity, location, cveId, evidence }, canonicalValue)`.
  6. Update `WebhookEvent { processedAt: now, resultingScanId: scan.id }`.
  - Return `{ findingsPersisted: n }`.
- [ ] **T4.2** — Wire into `apps/parser-worker/src/app/app.module.ts`: add `WebhookProcessor` to providers (FindingPersister is already a provider there; ensure `AssetMergeService`/correlation isn't required — keep the webhook path independent of the heavy parse path). Confirm `QueuesModule` registers `WEBHOOK_JOBS` (done in T1).
- [ ] **T4.3** — TDD `__tests__/webhook.processor.spec.ts` (mock Prisma + a real/mock FindingPersister): (1) generic payload with 2 findings → creates Scan+ScanJob, upserts 2 assets + 2 findings, marks event processed with resultingScanId; (2) bad payload → errorMessage set, no scan created, no throw; (3) unknown engagement → errorMessage, no findings; (4) missing event → no-op.
- [ ] **T4.4** — Verify `type-check,test -p parser-worker`. Commit: `feat(phase-5.5): parser-worker webhook processor (normalize → Finding/Asset)`.

---

## T5 — e2e + integration + validation
- [ ] **T5.1** — `apps/api-gateway-e2e/src/scenarios/webhooks-e2e.spec.ts` gated base env + `WEBHOOK_E2E=1` (mirror scheduler-graphql-e2e). Scenario: login; create engagement (capture id); `POST ${apiUrl}/webhooks/generic` with header `x-autoscanner-token: <WEBHOOK_GENERIC_TOKEN from env>` and body `{ engagementId, findings: [{ title:'XSS', severity:'HIGH', assetValue:'app.example.com', location:'https://app.example.com/x' }] }` → expect 202; poll GraphQL `findings(engagementId)` until ≥1 finding with title 'XSS' (or timeout) → assert present. Requires `E2E_WEBHOOK_GENERIC_TOKEN` env (document it). Type-check only (stays skipped).
- [ ] **T5.2** — `.env.example`: add commented `WEBHOOK_GENERIC_TOKEN=`, `WEBHOOK_ZAP_TOKEN=`, `WEBHOOK_BURP_TOKEN=`.
- [ ] **T5.3** — Full validation: `pnpm nx run-many -t type-check,test -p queues,config,api-gateway,parser-worker,common,frontend` + e2e tsc. All green.
- [ ] **T5.4** — Commit remaining; ready to merge.

---

## Validation criteria (spec §5.5)
- Unit: generic ZAP-shaped payload → normalized findings (T2); processor persists Finding/Asset (T4).
- e2e `WEBHOOK_E2E`: POST /webhooks/generic → finding visible in `findings(engagementId)` (T5).

## Out of scope (v1)
- Per-engagement webhook tokens (one token per source).
- Full ZAP/Burp native report schemas — simplified shapes only (`alerts[]`/`issues[]`).
- UI "Webhook activity" feed.
- XXE/zip-bomb (JSON-only ingest + 5 MB cap covers the realistic surface).
- De-dup of WebhookEvents / idempotency keys.

## Self-review notes
- Token compare is constant-time; unconfigured source → 503; 30/min/IP throttle; 5 MB cap.
- engagementId comes from the payload, validated before persist.
- Findings reuse `FindingPersister` dedup (`findingDedupHash`); synthetic ScanJob satisfies the FK.
- Bad payloads set `errorMessage` + `processedAt` and do NOT throw (no infinite BullMQ retry).
