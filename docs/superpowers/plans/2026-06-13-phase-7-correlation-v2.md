# Phase 7 — Correlation Engine v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or executing-plans. Steps use checkbox (`- [ ]`) tracking.

**Goal:** Group the same issue reported by multiple scanners into one `CorrelatedFinding` (with N sources), and make the asset risk score count each issue once using real CVSS.

**Architecture:** A new `CorrelatedFinding` cluster parent + a deterministic scanner-independent `structuralFindingHash` (CVE → curated category → per-scanner fallback). A `CorrelateFindingsService` runs in `parser-worker` after the v1 dedup pass; risk-v2 recomputes from clusters. GraphQL + a frontend correlated-findings view with triage. Spec: `docs/superpowers/specs/2026-06-13-phase-7-correlation-v2-design.md`. Independent of the recon (`phase-6.x`) branches.

**Tech Stack:** Nx · NestJS · Prisma 6 · BullMQ · Apollo GraphQL · React · Jest.

## Context the engineer must know
- **No local Postgres.** Edit `prisma/schema.prisma`, run `pnpm prisma validate` + `pnpm prisma generate` (offline), and hand-write migration SQL (mirror `prisma/migrations/20260527000000_phase2_recon_models/migration.sql` conventions). `migrate deploy` runs in CI.
- **v1 today** (`apps/parser-worker/src/app/parse-job.processor.ts`): after persisting findings, it runs `this.assetMerge.dedupFindings(engagementId)` (a "correlation pass" helper, ~line 152) and calls `recomputeRiskScoreForAsset(tx, assetId)` per asset (after the per-asset `$transaction`, wrapped in `withRetryOnSerializationConflict`). `recomputeRiskScoreForAsset` (`libs/correlation/src/recompute-risk-score.ts`) reads `asset.findings {severity, cveId}` + ports and calls `computeRiskScore` (`libs/correlation/src/risk-score.ts`).
- **Finding dedup v1** (`libs/correlation/src/finding-dedup.ts`): `findingDedupHash` includes `scannerName` → per-scanner. UNCHANGED by this work.
- **CVSS source:** the CVE cache (Prisma model from `phase3_cve_cache`; read its exact name + CVSS field via `grep -n "model Cve" prisma/schema.prisma`). Risk-v2 joins a cluster's `cveId` → cached CVSS.
- **`scannerName` for a Finding** lives on its `scanJob` (`Finding.scanJob.scannerName`) — used for `sourceCount`/`sources`.

---

## File Structure
**New:** `libs/correlation/src/finding-categories.ts` (+ test), `libs/correlation/src/structural-finding-hash.ts` (+ test), `libs/correlation/src/correlate-findings.service.ts` (+ test); `apps/api-gateway/src/app/correlated-findings/` (module, service, resolver, dto) (+ service test); `apps/frontend/src/features/findings/correlated-findings-view.tsx` (+ test); `prisma/migrations/20260613030000_phase7_correlated_findings/migration.sql`; `apps/api-gateway-e2e/src/scenarios/correlation-v2-e2e.spec.ts`.
**Modified:** `prisma/schema.prisma`; `libs/correlation/src/index.ts` (exports); `libs/correlation/src/risk-score.ts` + `recompute-risk-score.ts`; `apps/parser-worker/src/app/parse-job.processor.ts` (+ `app.module.ts` if a provider is added) + its spec; `apps/api-gateway/src/app/app.module.ts`; the frontend findings view + engagement page wiring; `README.md`.

---

## Task 1: CorrelatedFinding model + migration

**Files:** `prisma/schema.prisma`, `prisma/migrations/20260613030000_phase7_correlated_findings/migration.sql`

- [ ] **Step 1:** Add to `prisma/schema.prisma`:
```prisma
enum FindingStatus { OPEN TRIAGED CONFIRMED FALSE_POSITIVE RESOLVED }

model CorrelatedFinding {
  id             String        @id @default(cuid())
  engagementId   String
  assetId        String
  structuralHash String
  category       String?
  title          String
  severity       Severity
  cveId          String?
  status         FindingStatus @default(OPEN)
  sourceCount    Int           @default(0)
  firstSeenAt    DateTime      @default(now())
  lastSeenAt     DateTime      @default(now())

  engagement Engagement @relation(fields: [engagementId], references: [id], onDelete: Cascade)
  asset      Asset      @relation(fields: [assetId], references: [id], onDelete: Cascade)
  findings   Finding[]

  @@unique([assetId, structuralHash])
  @@index([engagementId])
  @@index([assetId])
  @@index([severity])
  @@index([status])
}
```
On `model Finding` add: `correlatedFindingId String?`, `structuralHash String?`, and relation `correlatedFinding CorrelatedFinding? @relation(fields: [correlatedFindingId], references: [id], onDelete: SetNull)`. On `Engagement` and `Asset` add back-relation `correlatedFindings CorrelatedFinding[]`.

- [ ] **Step 2:** `pnpm prisma validate && pnpm prisma generate` → succeed.

- [ ] **Step 3:** Hand-write the migration: `CREATE TYPE "FindingStatus" AS ENUM (...)`; `CREATE TABLE "CorrelatedFinding"` (severity uses the existing `"Severity"` enum; `status "FindingStatus" NOT NULL DEFAULT 'OPEN'`; `sourceCount INTEGER NOT NULL DEFAULT 0`; timestamps `TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`); `ALTER TABLE "Finding" ADD COLUMN "correlatedFindingId" TEXT, ADD COLUMN "structuralHash" TEXT`; unique index `CorrelatedFinding_assetId_structuralHash_key`; the 4 indexes; FKs (CorrelatedFinding→Engagement CASCADE, →Asset CASCADE; Finding→CorrelatedFinding SET NULL) — all `ON UPDATE CASCADE`.

- [ ] **Step 4: Commit** `feat(phase-7): CorrelatedFinding model + migration`.

---

## Task 2: structuralFindingHash + category rules

**Files:** `libs/correlation/src/finding-categories.ts`, `libs/correlation/src/structural-finding-hash.ts`, tests in `libs/correlation/src/__tests__/`, export from `index.ts`.

- [ ] **Step 1: Write failing tests** for `FINDING_CATEGORY_RULES` (`finding-categories.spec.ts`): a `categorize(title, templateId?)` returns the right category for ≥1 positive example per rule and `null` for an unrelated title (e.g. `'SQL injection'` matches no TLS rule). And for `structuralFindingHash` (`structural-finding-hash.spec.ts`):
  - CVE case: two inputs with the same `cveId`+`assetCanonical`+`location` but DIFFERENT `scannerName`/`title` → equal hash.
  - Category case: `{title:'Weak TLS version: tls10', scannerName:'tlsx'}` and `{title:'TLSv1.0 enabled', scannerName:'sslscan'}`, same asset+location → equal hash (both map to `weak-tls-protocol`).
  - Fallback: two inputs, no CVE, titles matching no rule, DIFFERENT scannerName → DIFFERENT hash (never merged).
  - Idempotence/order-independence: same input → same hash regardless of call order.

- [ ] **Step 2:** Run the correlation tests → FAIL (modules missing).

- [ ] **Step 3: Implement** `finding-categories.ts`:
```typescript
export interface FindingCategoryRule { category: string; match: RegExp; }

export const FINDING_CATEGORY_RULES: readonly FindingCategoryRule[] = [
  { category: 'weak-tls-protocol', match: /weak (ssl|tls) (protocol|version)|(ssl|tls)v1\.[01] enabled|weak ssl\/tls protocol/i },
  { category: 'self-signed-cert', match: /self[- ]signed/i },
  { category: 'expired-cert', match: /expired .*certificate/i },
  { category: 'weak-cipher', match: /weak cipher|rc4|export cipher/i },
  { category: 'directory-listing', match: /directory (listing|index)/i },
  { category: 'default-credentials', match: /default (credential|password|login)/i },
  { category: 'exposed-admin-panel', match: /admin (panel|interface|console).{0,20}exposed|exposed admin/i },
  { category: 'missing-security-header', match: /missing .*(security )?header|x-frame-options|strict-transport-security|content-security-policy/i },
  { category: 'open-redirect', match: /open redirect/i },
  { category: 'cors-misconfig', match: /cors (misconfig|misconfiguration)|access-control-allow-origin: \*/i },
  { category: 'exposed-git', match: /\.git (exposed|directory)|exposed \.git/i },
  { category: 'exposed-env-file', match: /\.env (file )?exposed|exposed \.env/i },
];

export function categorize(title: string, templateId?: string | null): string | null {
  const hay = `${title} ${templateId ?? ''}`;
  for (const rule of FINDING_CATEGORY_RULES) {
    if (rule.match.test(hay)) return rule.category;
  }
  return null;
}
```

- [ ] **Step 4: Implement** `structural-finding-hash.ts`:
```typescript
import { createHash } from 'node:crypto';
import { categorize } from './finding-categories';

export interface StructuralFindingHashInput {
  scannerName: string;
  cveId?: string | null;
  assetCanonical: string;
  location?: string | null;
  title: string;
  templateId?: string | null;
}

/** Deterministic, scanner-independent finding signature. See Phase 7 spec §2.2. */
export function structuralFindingHash(i: StructuralFindingHashInput): {
  hash: string;
  category: string | null;
} {
  const loc = i.location ?? '';
  if (i.cveId) {
    return { hash: sha256(`cve|${i.cveId}|${i.assetCanonical}|${loc}`), category: null };
  }
  const category = categorize(i.title, i.templateId);
  if (category) {
    return { hash: sha256(`cat|${category}|${i.assetCanonical}|${loc}`), category };
  }
  return {
    hash: sha256(`raw|${i.scannerName}|${i.assetCanonical}|${loc}|${i.title}`),
    category: null,
  };
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}
```
Export both from `libs/correlation/src/index.ts`.

- [ ] **Step 5:** Run correlation tests → PASS. **Commit** `feat(phase-7): structuralFindingHash + curated category rules`.

---

## Task 3: CorrelateFindingsService + parser-worker wiring

**Files:** `libs/correlation/src/correlate-findings.service.ts` (+ test), `correlation.module.ts` (provide it), `parse-job.processor.ts` (+ spec).

- [ ] **Step 1: Read** `libs/correlation/src/asset-merge.service.ts` (the `dedupFindings` shape: `@Injectable`, constructor `PrismaService`, returns `{merged}`) and how `parse-job.processor.ts` invokes it as a correlation pass + the `withRetryOnSerializationConflict`/`$transaction` pattern.

- [ ] **Step 2: TDD `CorrelateFindingsService`** (mocked Prisma). `correlateFindings(engagementId): Promise<{ clusters: number }>`:
  - loads `prisma.finding.findMany({ where: { asset: { engagementId } }, select: { id, title, location, cveId, templateId, structuralHash, correlatedFindingId, asset: { select: { id, canonicalValue } }, scanJob: { select: { scannerName } } } })`.
  - groups by `(assetId, structuralHash)` (compute via `structuralFindingHash`), `upsert`s `CorrelatedFinding` by the compound key `assetId_structuralHash` (create with `engagementId`, `category`, `title`, `severity`, `cveId`, `sourceCount`, timestamps; update aggregates but NEVER overwrite `status`), and sets each finding's `correlatedFindingId` + `structuralHash`.
  - aggregates: `severity` = max (use a `SEVERITY_ORDER` rank), `sourceCount` = distinct `scanJob.scannerName` count, `cveId` = first non-null, `title` = cveId ?? category ?? first finding title, `firstSeenAt` = min, `lastSeenAt` = max.
  - returns `{ clusters }`.
  Assert (mocked): CVE-keyed findings from 2 scanners → 1 upsert with sourceCount 2; category findings from 2 scanners → 1 cluster; fallback findings → 2 clusters; `status` not in the `update` payload (preserved); each finding linked.

- [ ] **Step 3: Implement** the service. Provide it in `CorrelationModule`. NOTE: severity max via an order map `{INFO:0,LOW:1,MEDIUM:2,HIGH:3,CRITICAL:4}`.

- [ ] **Step 4: Wire into `parse-job.processor.ts`:** add a correlation pass after the existing `dedupFindings` pass (same helper style + `withRetryOnSerializationConflict`), calling `this.correlateFindings.correlateFindings(payload.engagementId)`. Inject `CorrelateFindingsService`. Add a `correlatedFindings` count to `ParseJobResult` + the log line. Update the processor spec (constructor arg + result assertion + a prisma `correlatedFinding.upsert` / `finding.findMany` mock as needed). Run `pnpm nx test parser-worker correlation` → PASS.

- [ ] **Step 5: Commit** `feat(phase-7): CorrelateFindingsService + parser-worker pass`.

---

## Task 4: Risk score v2 (count-once over clusters + CVSS)

**Files:** `libs/correlation/src/risk-score.ts`, `recompute-risk-score.ts`, tests.

- [ ] **Step 1: Read** the CVE cache model: `grep -n "model Cve" prisma/schema.prisma` and note the table + the CVSS numeric field (e.g. `cvssScore`) + key (`cveId`).

- [ ] **Step 2: TDD risk-v2.** Extend `risk-score.spec.ts`: `computeRiskScore` now takes `correlatedFindings: { severity, cveId, status, cvss? }[]` (+ ports unchanged). Assert: the same issue as 3 sources counts once (one cluster) — score strictly less than if it were 3 separate; a cluster with `cvss` uses the CVSS-derived weight (e.g. `cvss` 9.8 outweighs a MEDIUM-bucket); a cluster with no cvss falls back to `SEVERITY_WEIGHT`; `FALSE_POSITIVE` and `RESOLVED` clusters contribute 0; sensitive-port + exposed-admin bonuses unchanged.

- [ ] **Step 3: Implement** the new `computeRiskScore` signature (cluster-based; CVSS weight function, e.g. `cvss` mapped to the same scale as severity weights, fallback to severity bucket; skip excluded statuses). Update `recomputeRiskScoreForAsset` to load `asset.correlatedFindings { severity, cveId, status }` and join each cluster's `cveId` → CVE cache CVSS (one query for the asset's cveIds), then call `computeRiskScore`. Keep the same transaction/throw contract.

- [ ] **Step 4: Wire:** in `parse-job.processor.ts`, ensure `recomputeRiskScoreForAsset` runs AFTER the correlation pass (so clusters exist) for the affected assets. Run `pnpm nx test correlation parser-worker` → PASS.

- [ ] **Step 5: Commit** `feat(phase-7): risk-score v2 (count-once over clusters + CVSS)`.

---

## Task 5: GraphQL correlatedFindings query

**Files:** `apps/api-gateway/src/app/correlated-findings/` (module, service, resolver, dto), `app.module.ts`, service test.

- [ ] **Step 1: Read** `apps/api-gateway/src/app/findings/` (findings.service ownership check + resolver guard + DTO style) and an engagement-scoped service spec. Mirror it.
- [ ] **Step 2: DTO** `CorrelatedFindingObject { id, assetId(ID), structuralHash, category?, title, severity(Severity enum), cveId?, status(FindingStatus enum — registerEnumType once), sourceCount(Int), sources([String!]!), firstSeenAt, lastSeenAt }`. `sources` is resolved from the cluster's findings' `scanJob.scannerName` (a `@ResolveField` or computed in the service).
- [ ] **Step 3: Service** `correlatedFindings(userId, engagementId, {severity?, status?, search?, limit?, offset?})`: ownership check IDENTICAL to findings.service; `prisma.correlatedFinding.findMany({ where: { engagementId, ...filters }, orderBy: [{severity:'desc'},{lastSeenAt:'desc'}], include findings→scanJob.scannerName for sources, take/skip })`. TDD with mocked Prisma incl. ownership-denied.
- [ ] **Step 4: Resolver** guarded; `@Query(() => [CorrelatedFindingObject]) correlatedFindings(...)`. Module wired into `app.module.ts`. `pnpm nx test api-gateway` → PASS.
- [ ] **Step 5: Commit** `feat(phase-7): GraphQL correlatedFindings query`.

---

## Task 6: setFindingStatus mutation

- [ ] **Step 1: TDD** the service `setStatus(userId, correlatedFindingId, status)`: verifies the cluster's engagement is owned by the user (load cluster→engagement.ownerId, else NotFoundError), `prisma.correlatedFinding.update({ where:{id}, data:{status} })`, returns the updated cluster.
- [ ] **Step 2: Implement** + add `@Mutation(() => CorrelatedFindingObject) setFindingStatus(@Args('id', {type:()=>ID}) id, @Args('status', {type:()=>FindingStatus}) status, @CurrentUser() user)`. `pnpm nx test api-gateway` → PASS.
- [ ] **Step 3: Commit** `feat(phase-7): setFindingStatus triage mutation`.

---

## Task 7: Frontend correlated-findings view

- [ ] **Step 1: Read** the existing `findings-table.tsx` + an engagement tab (e.g. assets tab) + `lib/graphql/queries.ts`.
- [ ] **Step 2:** Add `CORRELATED_FINDINGS_QUERY` (`correlatedFindings(engagementId){ id title severity cveId status sourceCount sources lastSeenAt findings { id scannerName: ... } }` — select the fields the row needs) + `SET_FINDING_STATUS` mutation to `queries.ts`.
- [ ] **Step 3: TDD + implement** `correlated-findings-view.tsx`: a table of clusters (title, severity, CVE, sources badge `sourceCount`, status dropdown wired to `setFindingStatus`), each row expandable to show its raw source findings. Loading/error/empty states like the sibling views. Wire it into the engagement page findings area (replace or tab alongside the raw findings table — match the existing tab pattern; keep the raw `findings-table` available if it's already a tab). Test via MockedProvider: clusters render, sources badge shows count, status dropdown calls the mutation.
- [ ] **Step 4:** `pnpm nx test frontend && pnpm nx run frontend:type-check` → PASS. **Commit** `feat(phase-7): frontend correlated-findings view + triage`.

---

## Task 8: e2e + README

- [ ] **Step 1: e2e** `correlation-v2-e2e.spec.ts` (opt-in `E2E_RUN_CORRELATION` + base creds, mirror the recon e2e gate). With a live stack: seed/produce findings from ≥2 scanners that share a CVE or category on one asset → assert `correlatedFindings` returns a cluster with `sourceCount >= 2` and `sources.length >= 2`; call `setFindingStatus(..., FALSE_POSITIVE)` → assert the asset risk score drops (count-once + exclusion). Type-check the e2e project. (If producing real multi-source findings in CI is impractical, gate it opt-in and document the manual setup.)
- [ ] **Step 2: README** — add a "Correlation v2" section: cross-scanner correlated findings, the structural signature (CVE→category→fallback), risk-v2 count-once + CVSS, triage statuses, the `correlatedFindings` query + `setFindingStatus` mutation.
- [ ] **Step 3: Commit** `test(phase-7): correlation-v2 e2e (opt-in) + docs`.

---

## Final verification
```bash
pnpm prisma validate
pnpm nx run-many -t test --projects=correlation,parser-worker,api-gateway,frontend
pnpm lint
```

## Self-Review notes (resolved)
- **Spec coverage:** §2.1 model → T1; §2.2 signature → T2; §2.3 service → T3; §2.4 risk-v2 → T4; §2.5 surface → T5/T6/T7; §6 tests across all; e2e → T8.
- **Determinism/safety:** fallback per-scanner signature means unknowns never merge (T2 test asserts it).
- **status preserved across re-runs:** T3 asserts `status` absent from the cluster `update` payload.
- **count-once risk:** T4 asserts 3 sources = 1 contribution; FALSE_POSITIVE/RESOLVED excluded.
- **No-local-DB:** migration hand-written; `prisma validate`/`generate` verify; `migrate deploy` in CI.
- **Deferred (spec §7/D5):** reports keep using raw findings; cross-asset correlation out of scope.
