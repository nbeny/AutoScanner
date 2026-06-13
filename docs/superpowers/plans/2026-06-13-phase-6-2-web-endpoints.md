# Phase 6.2 — Web / Content / Endpoints — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Steps use checkbox (`- [ ]`) tracking.

**Goal:** Discover web endpoints (crawled, archived, and brute-forced) and persist them as a new `Endpoint` entity, surfaced via GraphQL and a frontend tab, driven by a `web-content` template.

**Architecture:** Same scanner-sdk/parser/orchestrator/persister pattern as Phase 6.1. Adds one Prisma table (`Endpoint`), a URL canonicaliser, an `endpoints[]` channel on `NormalizedOutput`, an `EndpointPersister`, a GraphQL `endpoints` query, a frontend Endpoints tab, three scanners (`katana`, `gau`, `ffuf`), and the `web-content` template. Builds on Phase 6.1 (`AllScannersModule`, custom-image build pipeline).

**Tech Stack:** Nx · NestJS · Prisma 6 · BullMQ · Apollo GraphQL · React + Apollo · Zod · Jest · Docker.

---

## Refined design (6.2) — decisions locked

**Why this is the spec:** §5.1 of `docs/superpowers/specs/2026-06-13-phase-6-recon-tooling-expansion-design.md` sketched 6.2. The decisions below refine that sketch to implementation-ready depth.

1. **Tools:** `katana` (PD official image, active crawl), `gau` (passive — archived URLs from Wayback/commoncrawl/OTX; custom image), `ffuf` (active directory fuzzing; custom image bundling a small content wordlist). **`gobuster` is dropped** — `ffuf` covers directory brute-forcing; adding gobuster is redundant (YAGNI).
2. **`Endpoint` table** (new): `id, engagementId, subdomainId?, url, canonicalUrl, method (default GET), statusCode?, contentLength?, source, firstSeenAt, lastSeenAt, metadata?`. Merge key: `@@unique([engagementId, canonicalUrl, method])`. Endpoints link to a `Subdomain` by host when one exists (nullable FK).
3. **URL canonicalisation** (`canonicalizeUrl` in `libs/correlation/src/canonical.ts`): lowercase scheme + host, drop default ports (`:80` for http, `:443` for https), strip fragment (`#...`), collapse an empty path to `/`, preserve path + sorted query string. This is the merge key basis.
4. **`NormalizedOutput.endpoints`**: new `NormalizedEndpoint { url, method?, statusCode?, contentLength? }[]` channel. `emptyNormalizedOutput()` seeds `endpoints: []`. Existing parsers are unaffected (they just don't populate it).
5. **`EndpointPersister`** (parser-worker): for each `NormalizedEndpoint`, canonicalise, resolve `subdomainId` by matching the URL host to an existing `Subdomain.canonicalValue` in the engagement (nullable if none), upsert by `(engagementId, canonicalUrl, method)` refreshing `lastSeenAt`/`statusCode`/`contentLength`. Endpoints are NOT `Asset`s, so they do not go through `AssetMergeService`/`AssetObservation`; provenance is the `source` column.
6. **GraphQL:** `endpoints(engagementId, subdomainId?, search?, limit?, offset?)` returning `[EndpointObject]` + `endpointCount(engagementId)`. New resolver/service in `apps/api-gateway/src/app/endpoints/` (mirrors the assets module).
7. **Frontend:** an **Endpoints** tab on the engagement page (mirrors `engagement-assets-tab.tsx`), a paginated table (URL, method, status, length, source, lastSeen).
8. **Context wiring:** `katana`/`gau` target the discovered hosts (`path:'subdomains'`); `ffuf` constructs `https://<host>/FUZZ` from each host. The orchestrator fans one ScanJob per host (existing behaviour).
9. **Template `web-content`:** `httpx → katana → gau → ffuf` (httpx first so hosts are probed; the three endpoint tools then run over `subdomains`).
10. **Migration:** hand-written SQL under `prisma/migrations/20260613000000_phase6_2_endpoints/migration.sql` (no local Postgres; `migrate dev` runs in CI/dev). `prisma validate` + `prisma generate` verify the schema locally.

**Acceptance (env-gated `web-content-e2e`, opt-in `E2E_RUN_WEB_CONTENT`):** running `web-content` on a target persists ≥1 `Endpoint` from ≥2 distinct `source`s; re-run inserts 0 duplicates (lastSeenAt refreshed).

---

## File Structure

**New:**
- `libs/scanners/katana/`, `libs/scanners/gau/`, `libs/scanners/ffuf/` — scanner libs (`@autoscanner/scanners-{katana,gau,ffuf}`).
- `docker/scanners/gau/Dockerfile`, `docker/scanners/ffuf/Dockerfile` (+ `ffuf` `wordlist.txt`).
- `libs/parsers/src/katana-json/`, `libs/parsers/src/gau-text/`, `libs/parsers/src/ffuf-json/`.
- `apps/parser-worker/src/app/persisters/endpoint-persister.ts`.
- `apps/api-gateway/src/app/endpoints/` (module, resolver, service, dto).
- `apps/frontend/src/features/engagements/engagement-endpoints-tab.tsx` (+ test).
- `libs/templates/src/builtins/web-content.ts`.
- `prisma/migrations/20260613000000_phase6_2_endpoints/migration.sql`.
- `apps/api-gateway-e2e/src/scenarios/web-content-e2e.spec.ts`.

**Modified:** `prisma/schema.prisma` (Endpoint model + relations), `libs/parsers/src/types.ts` (NormalizedEndpoint + endpoints channel), `libs/parsers/src/parsers.module.ts` + `index.ts` (register 3 parsers), `libs/scanners/all/src/all-scanners.module.ts` (+ spec), `tsconfig.base.json` (3 paths), `tools/scanners/build-images.sh` (gau + ffuf), `apps/parser-worker/src/app/parse-job.processor.ts` + `app.module.ts` (EndpointPersister), `libs/templates/src/builtins/index.ts`, `apps/api-gateway/src/app/app.module.ts` (EndpointsModule), frontend engagement page (tab), `.github/workflows/ci.yml`, `README.md`.

---

## Task 1: Endpoint model + migration + Prisma client

**Files:** `prisma/schema.prisma`, `prisma/migrations/20260613000000_phase6_2_endpoints/migration.sql`

- [ ] **Step 1: Add the `Endpoint` model** to `prisma/schema.prisma` (place it after the `Subdomain`/`IpAddress`/`SubdomainIp` block, before `Technology`):

```prisma
model Endpoint {
  id            String   @id @default(cuid())
  engagementId  String
  subdomainId   String?
  url           String
  canonicalUrl  String
  method        String   @default("GET")
  statusCode    Int?
  contentLength Int?
  source        String
  firstSeenAt   DateTime @default(now())
  lastSeenAt    DateTime @default(now())
  metadata      Json?

  engagement Engagement @relation(fields: [engagementId], references: [id], onDelete: Cascade)
  subdomain  Subdomain? @relation(fields: [subdomainId], references: [id], onDelete: SetNull)

  @@unique([engagementId, canonicalUrl, method])
  @@index([engagementId])
  @@index([subdomainId])
}
```

- [ ] **Step 2: Add the back-relations.** On `model Engagement` add `endpoints Endpoint[]`. On `model Subdomain` add `endpoints Endpoint[]`. (Find each model; add the relation field alongside the existing relation fields.)

- [ ] **Step 3: Validate + generate (no DB needed):**

Run: `pnpm prisma validate && pnpm prisma generate`
Expected: "The schema at prisma/schema.prisma is valid" and client generated. (If `prisma validate` complains about a missing relation field on Subdomain/Engagement, fix until valid.)

- [ ] **Step 4: Hand-write the migration** `prisma/migrations/20260613000000_phase6_2_endpoints/migration.sql` (mirror the column types used by the Phase 2 migration; `migrate dev` is not available without a DB so we author SQL directly):

```sql
-- CreateTable
CREATE TABLE "Endpoint" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "subdomainId" TEXT,
    "url" TEXT NOT NULL,
    "canonicalUrl" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'GET',
    "statusCode" INTEGER,
    "contentLength" INTEGER,
    "source" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "Endpoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Endpoint_engagementId_canonicalUrl_method_key" ON "Endpoint"("engagementId", "canonicalUrl", "method");

-- CreateIndex
CREATE INDEX "Endpoint_engagementId_idx" ON "Endpoint"("engagementId");

-- CreateIndex
CREATE INDEX "Endpoint_subdomainId_idx" ON "Endpoint"("subdomainId");

-- AddForeignKey
ALTER TABLE "Endpoint" ADD CONSTRAINT "Endpoint_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Endpoint" ADD CONSTRAINT "Endpoint_subdomainId_fkey" FOREIGN KEY ("subdomainId") REFERENCES "Subdomain"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 5: Commit:**
```bash
git add prisma/schema.prisma prisma/migrations/20260613000000_phase6_2_endpoints
git commit -m "feat(phase-6.2): Endpoint model + migration"
```

---

## Task 2: URL canonicaliser + NormalizedEndpoint channel

**Files:** `libs/correlation/src/canonical.ts` (+ its test), `libs/parsers/src/types.ts`

- [ ] **Step 1: Read** `libs/correlation/src/canonical.ts` and its test (`libs/correlation/src/__tests__` or co-located) to match the existing canonicalisation style (the file already has host/IP canonicalisers).

- [ ] **Step 2: Write a failing test** for `canonicalizeUrl` in the correlation lib's test file. Assert:
  - `canonicalizeUrl('HTTP://Example.com:80/Path?b=2&a=1#frag')` === `'http://example.com/Path?a=1&b=2'`
  - `canonicalizeUrl('https://Example.com:443')` === `'https://example.com/'`
  - `canonicalizeUrl('https://example.com/a/')` === `'https://example.com/a/'` (trailing slash preserved)
  - `canonicalizeUrl('example.com/x')` === `'https://example.com/x'` (no scheme → assume https)
  - invalid input returns the trimmed lowercased original (no throw).

- [ ] **Step 3: Implement `canonicalizeUrl`** using the WHATWG `URL` parser. Lowercase scheme + hostname, drop the port if it's the scheme default, strip the hash, set pathname to `/` when empty, sort query params by key. Prepend `https://` when no scheme is present. Wrap in try/catch returning the trimmed lowercased input on parse failure. Export it from `libs/correlation/src/index.ts`.

- [ ] **Step 4:** Run the correlation test → PASS.

- [ ] **Step 5: Add the endpoint channel** to `libs/parsers/src/types.ts`:
  - Add interface `NormalizedEndpoint { url: string; method?: string; statusCode?: number; contentLength?: number; }`.
  - Add `endpoints: NormalizedEndpoint[];` to the `NormalizedOutput` interface.
  - Add `endpoints: [],` to the object returned by `emptyNormalizedOutput()`.

- [ ] **Step 6:** Run `pnpm nx test parsers && pnpm nx test correlation` → both PASS (existing parsers still compile/construct NormalizedOutput via the helper).

- [ ] **Step 7: Commit:**
```bash
git add libs/correlation/src libs/parsers/src/types.ts
git commit -m "feat(phase-6.2): canonicalizeUrl + NormalizedEndpoint channel"
```

---

## Task 3: katana scanner + parser

**Files:** `libs/scanners/katana/` (lib), `libs/parsers/src/katana-json/`, registrations.

- [ ] **Step 1: Scaffold** `libs/scanners/katana/` from the Phase 6.1 findomain lib pattern (six config files, names `scanners-katana`, single generic moduleNameMapper). Add tsconfig.base path `@autoscanner/scanners-katana`.

- [ ] **Step 2: TDD the scanner.** Test asserts: name `katana`, displayName `Katana`, image `projectdiscovery/katana:latest`, category `[WEB_ENUM]` (+ maybe `WEB_FINGERPRINT`), outputs[0] `{format:'JSONL', capture:'stdout', parser:'katana-json'}`, produces contains `'Asset'` (Endpoint isn't a ProducedEntity yet — see Step 2a), and `build({}, 'example.com')` cmd === `['katana','-u','example.com','-jsonl','-silent','-d','3']` (depth 3 default via input).
  - **Step 2a:** Add `'Endpoint'` to the `ProducedEntity` union in `libs/scanner-sdk/src/types.ts` (it currently lists Asset/Subdomain/.../DnsRecord). Then `produces: ['Endpoint']`.
  - Input schema: `{ depth: z.number().int().min(1).max(10).default(3) }`. build: `['katana','-u',target,'-jsonl','-silent','-d',String(input.depth)]`.

- [ ] **Step 3: Implement** the scanner + module + index (findomain pattern). docker: bridge, readonlyRootfs true, memoryLimitMb 1024, defaultTimeoutMs 600_000.

- [ ] **Step 4: TDD the `katana-json` parser** (`libs/parsers/src/katana-json/`). katana `-jsonl` emits one JSON object per line: `{"timestamp":"...","request":{"method":"GET","endpoint":"https://example.com/x"},"response":{"status_code":200,"content_length":123}}`. Parser maps each line to `out.endpoints.push({ url: request.endpoint, method: request.method ?? 'GET', statusCode: response?.status_code, contentLength: response?.content_length })`. Tolerant: skip malformed lines, skip entries without `request.endpoint`. Fixture with 3 lines incl. one malformed. Register in `parsers.module.ts` + `index.ts`.

- [ ] **Step 5: Register** katana in `AllScannersModule` (+ aggregator spec name `'katana'`).

- [ ] **Step 6:** `pnpm nx test scanners-katana parsers scanners-all` → PASS.

- [ ] **Step 7: Commit:** `feat(phase-6.2): add katana scanner + katana-json parser`

---

## Task 4: gau scanner + parser (custom image)

- [ ] **Step 1: Dockerfile** `docker/scanners/gau/Dockerfile` (two-stage golang build of `github.com/lc/gau/v2/cmd/gau@latest`, final alpine with `ca-certificates` + non-root user 10001, `ENTRYPOINT []`). Add `docker build -t autoscanner/gau:1.0 ...` to `tools/scanners/build-images.sh`.

- [ ] **Step 2: Scaffold** `libs/scanners/gau/` (scanners-gau). tsconfig.base path.

- [ ] **Step 3: TDD the scanner.** name `gau`, image `autoscanner/gau:1.0`, category `[WEB_ENUM, PASSIVE_RECON]`, outputs `{format:'TEXT', capture:'stdout', parser:'urllines-text'}`, produces `['Endpoint']`. build: `['gau','--subs',target]` (input `{ subs: z.boolean().default(true) }` controlling `--subs`). defaultTimeoutMs 600_000.

- [ ] **Step 4: Shared `urllines-text` parser** (`libs/parsers/src/urllines-text/`) — one URL per line → `out.endpoints.push({ url: line, method: 'GET' })` (skip blanks/comments, dedupe per run). Mirrors `hostlines-text`. Register. (Used by gau; reusable later.)

- [ ] **Step 5: Register** gau in AllScannersModule (+ spec). Build the image best-effort (skip if no Docker engine).

- [ ] **Step 6:** Tests PASS. **Commit:** `feat(phase-6.2): add gau scanner + urllines-text parser + custom image`

---

## Task 5: ffuf scanner + parser (custom image, bundled wordlist)

- [ ] **Step 1: Dockerfile** `docker/scanners/ffuf/Dockerfile` (golang build `github.com/ffuf/ffuf/v2@latest`, final alpine with ca-certificates + non-root user + bundled `/etc/ffuf/content.txt` wordlist copied from `docker/scanners/ffuf/wordlist.txt`). Create `docker/scanners/ffuf/wordlist.txt` with ~25 common paths (admin, login, api, robots.txt, .git, backup, uploads, config, test, dev, .env, wp-admin, dashboard, static, assets, js, css, images, old, tmp, server-status, health, metrics, swagger, openapi.json). Add `autoscanner/ffuf:1.0` to build-images.sh.

- [ ] **Step 2: Scaffold** `libs/scanners/ffuf/` (scanners-ffuf). tsconfig.base path.

- [ ] **Step 3: TDD the scanner.** name `ffuf`, image `autoscanner/ffuf:1.0`, category `[WEB_ENUM]`, outputs `{format:'JSON', capture:'stdout', parser:'ffuf-json'}`, produces `['Endpoint']`. Input `{ wordlist: z.string().default('/etc/ffuf/content.txt'), matchCodes: z.string().default('200,204,301,302,307,401,403') }`. build(input, target): the orchestrator passes a host; construct `https://<target>/FUZZ`:
  ```
  cmd: ['ffuf','-u',`https://${target}/FUZZ`,'-w',input.wordlist,'-mc',input.matchCodes,'-of','json','-o','/dev/stdout','-s']
  ```
  (`-s` silent, `-of json -o /dev/stdout` writes JSON to stdout.) defaultTimeoutMs 600_000, memoryLimitMb 1024.

- [ ] **Step 4: TDD `ffuf-json` parser** (`libs/parsers/src/ffuf-json/`). ffuf JSON: `{"results":[{"url":"https://example.com/admin","status":200,"length":345,"input":{"FUZZ":"admin"}}, ...]}`. Parser: `JSON.parse` whole body, for each `results[]` push `{ url: r.url, method: 'GET', statusCode: r.status, contentLength: r.length }`. Tolerant: if body isn't valid JSON or `results` missing, return empty. Fixture committed. Register.

- [ ] **Step 5: Register** ffuf in AllScannersModule (+ spec). Build image best-effort.

- [ ] **Step 6:** Tests PASS. **Commit:** `feat(phase-6.2): add ffuf scanner + ffuf-json parser + custom image`

---

## Task 6: EndpointPersister + parse-job wiring

**Files:** `apps/parser-worker/src/app/persisters/endpoint-persister.ts`, `parse-job.processor.ts`, `app.module.ts`

- [ ] **Step 1: Read** an existing persister (`subdomain-ip-persister.ts` or `technology-persister.ts`) + how `parse-job.processor.ts` injects persisters and iterates `out.*`, to match the pattern (PrismaService injection, upsert style, returning a count).

- [ ] **Step 2: TDD `EndpointPersister`** with a mocked PrismaService (follow the existing persister test style if one exists; otherwise unit-test the canonicalisation + subdomain-host resolution logic). Behaviour: for each `NormalizedEndpoint`, compute `canonicalUrl = canonicalizeUrl(e.url)`, derive host from the URL, look up `Subdomain` by `(engagementId, canonicalValue=host)` for the nullable `subdomainId`, then `prisma.endpoint.upsert({ where: { engagementId_canonicalUrl_method: {...} }, create: {...}, update: { lastSeenAt: now, statusCode, contentLength } })`. `source = ctx.scannerName`. Returns count persisted.

- [ ] **Step 3: Wire** `EndpointPersister` into `parse-job.processor.ts` (inject it; after the existing persisters, call `await this.endpointPersister.persist(out.endpoints, ctx, tx?)` consistent with how other persisters receive the normalized slice + context) and add it to the parser-worker `app.module.ts` providers. Add `endpointsPersisted` to `ParseJobResult`.

- [ ] **Step 4:** `pnpm nx test parser-worker` → PASS. **Commit:** `feat(phase-6.2): EndpointPersister + parse-job wiring`

---

## Task 7: GraphQL endpoints query

**Files:** `apps/api-gateway/src/app/endpoints/` (module, service, resolver, dto), `app.module.ts`

- [ ] **Step 1: Read** `apps/api-gateway/src/app/assets/unified-assets.{service,resolver}.ts` + `unified-asset.dto.ts` + how `assets.module.ts` is wired into `app.module.ts`, to mirror the structure (JwtAuthGuard, CurrentUser, engagement-scoped query, pagination).

- [ ] **Step 2: `EndpointObject` DTO** (`endpoints/dto/endpoint.object.ts`): `@ObjectType('Endpoint')` with `id, engagementId, url, canonicalUrl, method, statusCode?(Int,nullable), contentLength?(Int,nullable), source, firstSeenAt, lastSeenAt`.

- [ ] **Step 3: `EndpointsService`** (`endpoints/endpoints.service.ts`): `list(userId, engagementId, {subdomainId?, search?, limit=100, offset=0})` → verifies engagement ownership (copy the ownership check used by UnifiedAssetsService), queries `prisma.endpoint.findMany` filtered by engagementId (+ optional subdomainId, + `canonicalUrl contains search`), ordered by `lastSeenAt desc`, paginated. `count(userId, engagementId)`.

- [ ] **Step 4: `EndpointsResolver`**: `@Query(() => [EndpointObject]) endpoints(...)` + `@Query(() => Int) endpointCount(...)`, both `@UseGuards(JwtAuthGuard)` with `@CurrentUser`.

- [ ] **Step 5: `EndpointsModule`** providing resolver+service; import it in `apps/api-gateway/src/app/app.module.ts`.

- [ ] **Step 6: Test** the service with a mocked Prisma (ownership enforced, filters applied) following the assets service test style. `pnpm nx test api-gateway` → PASS. **Commit:** `feat(phase-6.2): GraphQL endpoints query`

---

## Task 8: web-content template

- [ ] **Step 1: TDD** `libs/templates/src/__tests__/web-content.spec.ts`: registered in BUILTIN_TEMPLATES; steps === `['httpx','katana','gau','ffuf']`; httpx target `subdomains` (techDetect true), katana/gau/ffuf target `subdomains`.

- [ ] **Step 2: Implement** `libs/templates/src/builtins/web-content.ts`:
```typescript
import type { TemplateDefinition } from '../types';

export const WebContent: TemplateDefinition = {
  name: 'web-content',
  displayName: 'Web Content Discovery',
  description: 'HTTP fingerprint then crawl (katana), archived URLs (gau), and directory fuzzing (ffuf).',
  steps: [
    { scannerName: 'httpx', inputs: { techDetect: { kind: 'static', value: true } }, target: { kind: 'context', path: 'subdomains' } },
    { scannerName: 'katana', inputs: {}, target: { kind: 'context', path: 'subdomains' } },
    { scannerName: 'gau', inputs: {}, target: { kind: 'context', path: 'subdomains' } },
    { scannerName: 'ffuf', inputs: {}, target: { kind: 'context', path: 'subdomains' } },
  ],
};
```
Add to `BUILTIN_TEMPLATES` + export list in `builtins/index.ts`. Update `builtins.spec.ts` count.

- [ ] **Step 3:** `pnpm nx test templates` → PASS. **Commit:** `feat(phase-6.2): web-content template`

---

## Task 9: Frontend Endpoints tab

**Files:** `apps/frontend/src/features/engagements/engagement-endpoints-tab.tsx` (+ test), engagement page tab wiring.

- [ ] **Step 1: Read** `apps/frontend/src/features/engagements/engagement-assets-tab.tsx` and `engagement-page.tsx` to mirror the tab pattern (Apollo `useQuery`, the GraphQL document location, table styling, how tabs are registered on the engagement page).

- [ ] **Step 2: TDD** a component test (`__tests__/engagement-endpoints-tab.spec.tsx`) using the existing frontend test setup (MockedProvider) asserting the table renders endpoints from a mocked `endpoints` query (URL, method, status columns).

- [ ] **Step 3: Implement** `engagement-endpoints-tab.tsx`: an Apollo query for `endpoints(engagementId)` rendering a paginated table (URL, method, status, length, source, lastSeen). Add an "Endpoints" tab entry to the engagement page next to the Assets tab.

- [ ] **Step 4:** `pnpm nx test frontend` → PASS. **Commit:** `feat(phase-6.2): frontend Endpoints tab`

---

## Task 10: e2e + CI + README

- [ ] **Step 1: e2e** `apps/api-gateway-e2e/src/scenarios/web-content-e2e.spec.ts` — double opt-in (base creds + `E2E_RUN_WEB_CONTENT`), own `E2E_WEB_CONTENT_TIMEOUT_MS` (default 900000). Runs `web-content`, asserts ≥1 Endpoint from ≥2 sources (query `endpoints(engagementId)` + group by `source`), idempotent re-run. Add an `endpointsByEngagement` helper to `helpers/queries.ts`. Mirror the structure + opt-in gate of `recon-passive-deep-e2e.spec.ts`. Type-check via `tsc -p apps/api-gateway-e2e/tsconfig.spec.json --noEmit`.

- [ ] **Step 2: CI** — `pnpm scanners:build` already builds all custom images (now incl. gau, ffuf). No new CI step required beyond what 6.1 added; confirm the build step in the `recon-passive-e2e` job still passes with the added images.

- [ ] **Step 3: README** — add the three tools + `web-content` template + Endpoints tab to a Phase 6.2 subsection.

- [ ] **Step 4: Commit:** `test(phase-6.2): web-content e2e; docs + ci`

---

## Final verification
```bash
pnpm prisma validate
pnpm nx run-many -t test --projects=scanners-katana,scanners-gau,scanners-ffuf,scanners-all,parsers,correlation,templates,parser-worker,api-gateway,frontend
pnpm nx run-many -t type-check --projects=scanners-katana,scanners-gau,scanners-ffuf
pnpm lint
```
All green. Endpoint persistence + GraphQL + UI + template + e2e cover §5.1.

---

## Self-Review notes
- **Surfaced deviation:** `gobuster` dropped (ffuf covers dir fuzzing) — documented in Refined Design §1.
- **Endpoint is not an Asset:** it bypasses AssetMerge/Observation; provenance via `source` + the unique-key upsert. Multi-source proof in e2e is "≥2 distinct `source` values", not scannerSources.
- **No-local-DB constraint:** migration SQL is hand-written; `prisma validate`/`generate` verify the schema; `migrate deploy` + e2e run in CI.
- **`ProducedEntity` gains `'Endpoint'`** (Task 3 Step 2a) — a scanner-sdk type change consumed by the three new scanners.
