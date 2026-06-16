# Phase 8.7a — NVD Offline Mirror: Data Layer + Sync Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mirror the full NVD dataset locally — every CVE plus its CPE-applicability configuration tree (AND/OR/negate + version ranges) — kept current by a dedicated worker running bulk + incremental sync. No matching/integration (that is 8.7b).

**Architecture:** New Prisma tables `NvdCve`/`NvdConfigNode`/`NvdCpeMatch`/`NvdSyncState`. `NvdClient` gains `fetchCvePage(...)` (NVD 2.0 paged query incl. `configurations`). A new dedicated `nvd-sync-worker` app runs an `NvdSyncProcessor` on a new `NVD_SYNC` queue (full=resumable bulk, incremental=lastMod windows), triggered by BullMQ repeatable cron jobs registered at boot + manual enqueue.

**Tech Stack:** NestJS + BullMQ (`WorkerHost`, repeatable jobs), Prisma (4 models + enum + migration), Nx, Jest, `@autoscanner/cve` (`NvdClient`, `cvssToSeverity`, rate limiter). Spec: `docs/superpowers/specs/2026-06-16-phase-8-7a-nvd-offline-mirror-design.md`. Scaffold refs: app `apps/cve-enricher-worker/` (copy structure), queue wiring `libs/queues/src/{queue-names,job-payloads,queues.module}.ts`, NVD `libs/cve/src/nvd-client.ts`.

---

## Reference (read once)
- **NVD 2.0 API** `https://services.nvd.nist.gov/rest/json/cves/2.0`. Paged: `?resultsPerPage=2000&startIndex=N`; incremental: `&lastModStartDate=<ISO>&lastModEndDate=<ISO>` (≤120-day window). Response: `{ totalResults, resultsPerPage, startIndex, vulnerabilities: [{ cve: { id, published, lastModified, descriptions, metrics, configurations } }] }`. `configurations: [{ operator?, negate?, nodes: [{ operator: 'AND'|'OR', negate?, cpeMatch: [{ vulnerable, criteria, matchCriteriaId, versionStartIncluding?, versionStartExcluding?, versionEndIncluding?, versionEndExcluding? }] }] }]`.
- **NvdClient** `libs/cve/src/nvd-client.ts`: `NvdResponse` (vulnerabilities[].cve with metrics — extend with `configurations`), `findCvesByCpe` (model for paging + rate limiter + 429/`NvdRateLimitedError`), private `extractCvssMetric`/`backoffMs`/`sleep`/`acquire`. `cvssToSeverity` in `@autoscanner/cve`.
- **Worker scaffold** `apps/cve-enricher-worker/`: `project.json` (build=webpack-cli, type-check=tsc -p tsconfig.app.json, test=jest; tags `["scope:app"]`), `webpack.config.js`, `tsconfig*.json`, `jest.config.ts`, `src/main.ts` (`NestFactory.createApplicationContext(AppModule)` headless), `src/app/app.module.ts` (imports `AppConfigModule`, `AppLoggingModule`, `PrismaModule`, `QueuesModule`; providers incl. the `NvdClient` `useFactory` reading `NVD_API_KEY` → `TokenBucketRateLimiter`).
- **Queues** `libs/queues/src/queue-names.ts` (`QueueName` const), `job-payloads.ts` (`QueuePayloadMap`), `queues.module.ts` (`BullModule.registerQueue({ name: ... }, ...)` — add the new queue here so all apps share it). BullMQ repeatable: `queue.add(name, data, { repeat: { pattern: '<cron>' }, jobId: '<stable>' })`.
- **Prisma** `prisma/schema.prisma`: `enum Severity`, `CveCache`/`CpeCveCache` (style refs). Migrations `prisma/migrations/<UTCts>_<name>/migration.sql`.

**External caveat:** NVD response/`configurations` shape is stable but verify field names against a live sample at impl time; keep the parser tolerant (missing `configurations` → no nodes; unknown operator → skip). Mock NVD in ALL tests (never hit the network).

---

## Task 1: Prisma models + enum + migration

**Files:** Modify `prisma/schema.prisma`; create `prisma/migrations/20260616010000_phase8_7a_nvd_mirror/migration.sql`.

- [ ] **Step 1: Add the models + enum** to `prisma/schema.prisma` (place near `CveCache`). Use exactly:

```prisma
enum NvdConfigOperator {
  AND
  OR
}

model NvdCve {
  cveId        String          @id
  cvssV3Score  Float?
  cvssV3Vector String?
  severity     Severity?
  summary      String?
  publishedAt  DateTime?
  lastModified DateTime?
  syncedAt     DateTime        @default(now())
  nodes        NvdConfigNode[]

  @@index([lastModified])
}

model NvdConfigNode {
  id       String            @id @default(cuid())
  cveId    String
  operator NvdConfigOperator
  negate   Boolean           @default(false)
  cve      NvdCve            @relation(fields: [cveId], references: [cveId], onDelete: Cascade)
  matches  NvdCpeMatch[]

  @@index([cveId])
}

model NvdCpeMatch {
  id                    String        @id @default(cuid())
  nodeId                String
  criteria              String
  vulnerable            Boolean
  cpeVendor             String
  cpeProduct            String
  versionStartIncluding String?
  versionStartExcluding String?
  versionEndIncluding   String?
  versionEndExcluding   String?
  node                  NvdConfigNode @relation(fields: [nodeId], references: [id], onDelete: Cascade)

  @@index([cpeVendor, cpeProduct])
  @@index([nodeId])
}

model NvdSyncState {
  id                  String    @id @default("singleton")
  lastModEndDate      DateTime?
  fullSyncCompletedAt DateTime?
  lastFullSyncAt      DateTime?
  lastStartIndex      Int       @default(0)
  totalCves           Int       @default(0)
  updatedAt           DateTime  @updatedAt
}
```

- [ ] **Step 2: Author the migration** `prisma/migrations/20260616010000_phase8_7a_nvd_mirror/migration.sql`. If a local Postgres is up, run `pnpm prisma:migrate:dev --name phase8_7a_nvd_mirror`. If no DB, hand-write the SQL (read a recent CreateTable migration for the dialect):

```sql
-- CreateEnum
CREATE TYPE "NvdConfigOperator" AS ENUM ('AND', 'OR');

-- CreateTable
CREATE TABLE "NvdCve" (
    "cveId" TEXT NOT NULL,
    "cvssV3Score" DOUBLE PRECISION,
    "cvssV3Vector" TEXT,
    "severity" "Severity",
    "summary" TEXT,
    "publishedAt" TIMESTAMP(3),
    "lastModified" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NvdCve_pkey" PRIMARY KEY ("cveId")
);

-- CreateTable
CREATE TABLE "NvdConfigNode" (
    "id" TEXT NOT NULL,
    "cveId" TEXT NOT NULL,
    "operator" "NvdConfigOperator" NOT NULL,
    "negate" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "NvdConfigNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NvdCpeMatch" (
    "id" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "criteria" TEXT NOT NULL,
    "vulnerable" BOOLEAN NOT NULL,
    "cpeVendor" TEXT NOT NULL,
    "cpeProduct" TEXT NOT NULL,
    "versionStartIncluding" TEXT,
    "versionStartExcluding" TEXT,
    "versionEndIncluding" TEXT,
    "versionEndExcluding" TEXT,
    CONSTRAINT "NvdCpeMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NvdSyncState" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "lastModEndDate" TIMESTAMP(3),
    "fullSyncCompletedAt" TIMESTAMP(3),
    "lastFullSyncAt" TIMESTAMP(3),
    "lastStartIndex" INTEGER NOT NULL DEFAULT 0,
    "totalCves" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NvdSyncState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NvdCve_lastModified_idx" ON "NvdCve"("lastModified");
CREATE INDEX "NvdConfigNode_cveId_idx" ON "NvdConfigNode"("cveId");
CREATE INDEX "NvdCpeMatch_cpeVendor_cpeProduct_idx" ON "NvdCpeMatch"("cpeVendor", "cpeProduct");
CREATE INDEX "NvdCpeMatch_nodeId_idx" ON "NvdCpeMatch"("nodeId");

-- AddForeignKey
ALTER TABLE "NvdConfigNode" ADD CONSTRAINT "NvdConfigNode_cveId_fkey" FOREIGN KEY ("cveId") REFERENCES "NvdCve"("cveId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NvdCpeMatch" ADD CONSTRAINT "NvdCpeMatch_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "NvdConfigNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

Confirm `20260616010000` sorts after the latest existing migration (`ls prisma/migrations`); bump if needed.

- [ ] **Step 3: Validate + commit.** `pnpm prisma validate` && `pnpm prisma generate`. Then:
```bash
git add prisma/schema.prisma prisma/migrations/20260616010000_phase8_7a_nvd_mirror
git commit -m "feat(phase-8.7a): NvdCve/NvdConfigNode/NvdCpeMatch/NvdSyncState models + migration"
```

---

## Task 2: `NvdClient.fetchCvePage` (+ configurations typing)

**Files:** Modify `libs/cve/src/nvd-client.ts` (+ export new types from `libs/cve/src/index.ts`); test `libs/cve/src/__tests__/nvd-client-page.spec.ts`.

- [ ] **Step 1: Write the failing test** `libs/cve/src/__tests__/nvd-client-page.spec.ts`:

```ts
import { NvdClient } from '../nvd-client';
import { TokenBucketRateLimiter } from '../rate-limiter';

function res(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => '', headers: { get: () => null } } as unknown as Response;
}
const limiter = () => new TokenBucketRateLimiter({ capacity: 100, refillIntervalMs: 1000 });
const cveEntry = {
  cve: {
    id: 'CVE-2024-1', published: '2024-01-01T00:00:00', lastModified: '2024-02-01T00:00:00',
    descriptions: [{ lang: 'en', value: 'desc' }],
    metrics: { cvssMetricV31: [{ cvssData: { baseScore: 7.5, vectorString: 'AV:N' } }] },
    configurations: [
      { nodes: [
        { operator: 'OR', cpeMatch: [
          { vulnerable: true, criteria: 'cpe:2.3:a:vendor:prod:*:*:*:*:*:*:*:*', versionStartIncluding: '1.0', versionEndExcluding: '2.0' },
        ] },
      ] },
    ],
  },
};

describe('NvdClient.fetchCvePage', () => {
  it('parses a page incl. configurations into NvdFullCve[]', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(res({ totalResults: 1, resultsPerPage: 2000, startIndex: 0, vulnerabilities: [cveEntry] }));
    const c = new NvdClient({ apiKey: undefined, rateLimiter: limiter(), fetchImpl });
    const out = await c.fetchCvePage({ startIndex: 0, resultsPerPage: 2000 });
    expect(out.totalResults).toBe(1);
    expect(out.cves[0].cveId).toBe('CVE-2024-1');
    expect(out.cves[0].cvssV3Score).toBe(7.5);
    expect(out.cves[0].nodes).toHaveLength(1);
    expect(out.cves[0].nodes[0].operator).toBe('OR');
    expect(out.cves[0].nodes[0].cpeMatch[0]).toMatchObject({
      vulnerable: true, criteria: 'cpe:2.3:a:vendor:prod:*:*:*:*:*:*:*:*',
      versionStartIncluding: '1.0', versionEndExcluding: '2.0',
    });
  });

  it('includes lastMod window params in the URL when given', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(res({ totalResults: 0, resultsPerPage: 2000, startIndex: 0, vulnerabilities: [] }));
    const c = new NvdClient({ apiKey: undefined, rateLimiter: limiter(), fetchImpl });
    await c.fetchCvePage({ startIndex: 0, resultsPerPage: 2000, lastModStartDate: '2024-01-01T00:00:00.000Z', lastModEndDate: '2024-02-01T00:00:00.000Z' });
    const url = String(fetchImpl.mock.calls[0][0]);
    expect(url).toContain('lastModStartDate=');
    expect(url).toContain('lastModEndDate=');
  });

  it('tolerates a CVE with no configurations (nodes=[])', async () => {
    const noConf = { cve: { ...cveEntry.cve, configurations: undefined } };
    const fetchImpl = jest.fn().mockResolvedValue(res({ totalResults: 1, resultsPerPage: 2000, startIndex: 0, vulnerabilities: [noConf] }));
    const c = new NvdClient({ apiKey: undefined, rateLimiter: limiter(), fetchImpl });
    const out = await c.fetchCvePage({ startIndex: 0, resultsPerPage: 2000 });
    expect(out.cves[0].nodes).toEqual([]);
  });
});
```

Run `pnpm nx test cve --testPathPattern=nvd-client-page` → FAIL.

- [ ] **Step 2: Implement.** In `libs/cve/src/nvd-client.ts` add exported types + the method:

```ts
export interface NvdCpeMatchData {
  vulnerable: boolean;
  criteria: string;
  versionStartIncluding?: string;
  versionStartExcluding?: string;
  versionEndIncluding?: string;
  versionEndExcluding?: string;
}
export interface NvdConfigNodeData {
  operator: 'AND' | 'OR';
  negate: boolean;
  cpeMatch: NvdCpeMatchData[];
}
export interface NvdFullCve {
  cveId: string;
  cvssV3Score: number | null;
  cvssV3Vector: string | null;
  summary: string | null;
  publishedAt: Date | null;
  lastModified: Date | null;
  nodes: NvdConfigNodeData[];
}
export interface FetchCvePageParams {
  startIndex: number;
  resultsPerPage: number;
  lastModStartDate?: string;
  lastModEndDate?: string;
}
export interface NvdCvePage {
  totalResults: number;
  cves: NvdFullCve[];
}
```

Extend the internal NVD vulnerability type to include `configurations?: Array<{ nodes?: Array<{ operator?: string; negate?: boolean; cpeMatch?: Array<{ vulnerable?: boolean; criteria?: string; versionStartIncluding?: string; versionStartExcluding?: string; versionEndIncluding?: string; versionEndExcluding?: string }> }> }>`. Add a private `parseConfigurations(configs)` → `NvdConfigNodeData[]` (flatten every `configurations[].nodes[]` into a node; `operator` defaults `'OR'` if missing/unknown; `negate` defaults false; map each `cpeMatch` with `vulnerable: Boolean(...)` and string version fields). Add `fetchCvePage(params)`:

```ts
async fetchCvePage(params: FetchCvePageParams): Promise<NvdCvePage> {
  const q = new URLSearchParams({
    resultsPerPage: String(params.resultsPerPage),
    startIndex: String(params.startIndex),
  });
  if (params.lastModStartDate) q.set('lastModStartDate', params.lastModStartDate);
  if (params.lastModEndDate) q.set('lastModEndDate', params.lastModEndDate);
  const body = await this.getCveListPage(`${NVD_URL}?${q.toString()}`); // reuse the existing private page getter from findCvesByCpe (acquire+retry+429+null-on-404)
  if (!body) return { totalResults: 0, cves: [] };
  const cves = (body.vulnerabilities ?? []).map((v) => ({
    cveId: v.cve.id,
    cvssV3Score: this.extractCvssScore(v.cve.metrics),
    cvssV3Vector: this.extractCvssMetric(v.cve.metrics)?.vectorString ?? null,
    summary: v.cve.descriptions?.find((d) => d.lang === 'en')?.value ?? null,
    publishedAt: v.cve.published ? new Date(v.cve.published) : null,
    lastModified: v.cve.lastModified ? new Date(v.cve.lastModified) : null,
    nodes: this.parseConfigurations(v.cve.configurations),
  }));
  return { totalResults: body.totalResults ?? cves.length, cves };
}
```

Reuse the private `getCveListPage`, `extractCvssScore`, `extractCvssMetric` added/used by `findCvesByCpe` (Phase 8.6). If `getCveListPage`'s typed return doesn't expose `configurations`/`descriptions`/`metrics`, widen its response interface (it's the list-response type) — do NOT change `fetchCve`. Export the new types from `libs/cve/src/index.ts` (already `export * from './nvd-client'`). Run `pnpm nx test cve` → all pass.

- [ ] **Step 3: Verify + commit.** `pnpm nx run-many -t type-check,test -p cve` → green.
```bash
git add libs/cve
git commit -m "feat(phase-8.7a): NvdClient.fetchCvePage (paged NVD incl. configurations)"
```

---

## Task 3: `NVD_SYNC` queue + payload

**Files:** Modify `libs/queues/src/queue-names.ts`, `libs/queues/src/job-payloads.ts`, `libs/queues/src/queues.module.ts`; test `libs/queues/src/__tests__/nvd-sync.spec.ts`.

- [ ] **Step 1: Write the failing test** `libs/queues/src/__tests__/nvd-sync.spec.ts`:

```ts
import { QueueName } from '../queue-names';
import type { NvdSyncPayload, QueuePayloadMap } from '../job-payloads';

describe('NVD_SYNC queue wiring', () => {
  it('exposes the queue name and payload type', () => {
    expect(QueueName.NVD_SYNC).toBe('nvd-sync');
    const p: NvdSyncPayload = { mode: 'incremental' };
    const typed: QueuePayloadMap[typeof QueueName.NVD_SYNC] = p;
    expect(typed.mode).toBe('incremental');
  });
});
```

Run `pnpm nx test queues --testPathPattern=nvd-sync` → FAIL.

- [ ] **Step 2: Wire it.** Add `NVD_SYNC: 'nvd-sync',` to `QueueName` (after `CVE_DISCOVERY`). In `job-payloads.ts` add `export interface NvdSyncPayload { mode: 'full' | 'incremental'; }` and `[QueueName.NVD_SYNC]: NvdSyncPayload;` in `QueuePayloadMap`. In `queues.module.ts` add `{ name: QueueName.NVD_SYNC },` to the `BullModule.registerQueue(...)` list. Run `pnpm nx test queues --testPathPattern=nvd-sync` → PASS and `pnpm nx run-many -t type-check,test -p queues` → PASS.

- [ ] **Step 3: Commit.**
```bash
git add libs/queues
git commit -m "feat(phase-8.7a): NVD_SYNC queue + NvdSyncPayload"
```

---

## Task 4: `nvd-sync-worker` app + `NvdSyncProcessor`

**Files:** Create app `apps/nvd-sync-worker/` (copy `apps/cve-enricher-worker/`); create `apps/nvd-sync-worker/src/app/nvd-sync.processor.ts`; test `apps/nvd-sync-worker/src/app/__tests__/nvd-sync.processor.spec.ts`. Modify root `tsconfig`/nx project graph picks the new app up automatically (Nx infers from project.json).

- [ ] **Step 1: Scaffold the app** by copying `apps/cve-enricher-worker/` to `apps/nvd-sync-worker/`. Rename everywhere `cve-enricher-worker`→`nvd-sync-worker`. Delete the copied processors (`cve-enrichment.processor.ts`, `cve-discovery.processor.ts`) and their tests. Set `src/app/app.module.ts` to import `AppConfigModule`, `AppLoggingModule`, `PrismaModule`, `QueuesModule` and provide `NvdSyncProcessor` + the SAME `NvdClient` `useFactory` block (reading `NVD_API_KEY` → `TokenBucketRateLimiter`) that `cve-enricher-worker` uses (copy it). `src/main.ts` keeps the headless `createApplicationContext(AppModule)` bootstrap, logging `'nvd-sync-worker started'`. Verify `grep -rni "cve-enricher\|enrichment\|discovery" apps/nvd-sync-worker/src` → none. Run `pnpm nx type-check nvd-sync-worker` (will fail until the processor exists — expected).

- [ ] **Step 2: Write the failing processor test** `apps/nvd-sync-worker/src/app/__tests__/nvd-sync.processor.spec.ts`. Mock `PrismaService` (`nvdSyncState.upsert`/`findUnique`/`update`, `nvdCve.upsert`, `nvdConfigNode.deleteMany`/`create`, `$transaction` passthrough), and `NvdClient` (`fetchCvePage`). Cases:

```ts
it('full sync upserts each CVE with its nodes/matches and marks fullSyncCompletedAt', async () => {
  prisma.nvdSyncState.findUnique.mockResolvedValue({ id: 'singleton', fullSyncCompletedAt: null, lastStartIndex: 0, lastModEndDate: null });
  nvd.fetchCvePage.mockResolvedValueOnce({ totalResults: 1, cves: [{
    cveId: 'CVE-2024-1', cvssV3Score: 7.5, cvssV3Vector: 'AV:N', summary: 'd', publishedAt: new Date(), lastModified: new Date(),
    nodes: [{ operator: 'OR', negate: false, cpeMatch: [{ vulnerable: true, criteria: 'cpe:2.3:a:vendor:prod:1.0:*:*:*:*:*:*:*' }] }],
  }] });
  await processor.process(job({ mode: 'full' }));
  expect(nvd.fetchCvePage).toHaveBeenCalled();
  expect(prisma.nvdCve.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { cveId: 'CVE-2024-1' } }));
  // fullSyncCompletedAt set at the end
  expect(prisma.nvdSyncState.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ fullSyncCompletedAt: expect.any(Date) }) }));
});

it('incremental sync queries the lastMod window and advances the cursor', async () => {
  const cursor = new Date('2024-01-01T00:00:00Z');
  prisma.nvdSyncState.findUnique.mockResolvedValue({ id: 'singleton', fullSyncCompletedAt: new Date(), lastModEndDate: cursor, lastStartIndex: 0 });
  nvd.fetchCvePage.mockResolvedValueOnce({ totalResults: 0, cves: [] });
  await processor.process(job({ mode: 'incremental' }));
  const call = nvd.fetchCvePage.mock.calls[0][0];
  expect(call.lastModStartDate).toBeDefined();
  expect(prisma.nvdSyncState.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ lastModEndDate: expect.any(Date) }) }));
});

it('parses cpeVendor/cpeProduct from criteria', async () => {
  // assert the created NvdCpeMatch carries cpeVendor='vendor', cpeProduct='prod'
  // (inspect the nested create payload passed to prisma.nvdCve.upsert / node create)
});
```

Run `pnpm nx test nvd-sync-worker --testPathPattern=nvd-sync` → FAIL.

- [ ] **Step 3: Implement** `nvd-sync.processor.ts` — `@Processor(QueueName.NVD_SYNC)` extends `WorkerHost`. Ctor injects `PrismaService`, `NvdClient`. Constants: `const PAGE = 2000; const MAX_WINDOW_MS = 120 * 86_400_000;`. Helpers:
  - `private parseVendorProduct(criteria: string): { cpeVendor: string; cpeProduct: string }` — split `criteria` on `:`; for `cpe:2.3:<part>:<vendor>:<product>:...` return parts[3]/parts[4] (default `'*'` if absent).
  - `private async upsertCve(cve: NvdFullCve): Promise<void>` — in a `prisma.$transaction`: `nvdConfigNode.deleteMany({ where: { cveId: cve.cveId } })` (cascade removes matches), then `nvdCve.upsert({ where: { cveId }, create/update: { cvssV3Score, cvssV3Vector, severity: cvssToSeverity(cve.cvssV3Score), summary, publishedAt, lastModified, syncedAt: new Date() } })`, then for each node `nvdConfigNode.create({ data: { cveId, operator, negate, matches: { create: node.cpeMatch.map((m) => ({ criteria: m.criteria, vulnerable: m.vulnerable, ...this.parseVendorProduct(m.criteria), versionStartIncluding: m.versionStartIncluding, versionStartExcluding: m.versionStartExcluding, versionEndIncluding: m.versionEndIncluding, versionEndExcluding: m.versionEndExcluding }) ) } } })`.
  - `process(job)`: read `state = await prisma.nvdSyncState.upsert({ where: { id: 'singleton' }, create: { id: 'singleton' }, update: {} })`. If `job.data.mode === 'full' || !state.fullSyncCompletedAt` → full loop from `state.lastStartIndex`: `page = await nvd.fetchCvePage({ startIndex, resultsPerPage: PAGE })`; for each cve `await this.upsertCve(cve)`; `startIndex += page.cves.length`; persist `nvdSyncState.update({ where:{id:'singleton'}, data:{ lastStartIndex: startIndex, totalCves: page.totalResults } })` every page; break when `startIndex >= totalResults` or empty page; at end `nvdSyncState.update({ data: { fullSyncCompletedAt: new Date(), lastFullSyncAt: new Date(), lastModEndDate: new Date(), lastStartIndex: 0 } })`. Else incremental: `start = state.lastModEndDate ?? <30d ago>`, `end = now`; chunk `[start,end]` into ≤`MAX_WINDOW_MS` windows; for each window paginate `fetchCvePage({ startIndex, resultsPerPage: PAGE, lastModStartDate: win.start.toISOString(), lastModEndDate: win.end.toISOString() })`, upsert each cve; finally `nvdSyncState.update({ data: { lastModEndDate: end } })`. Let `NvdRateLimitedError` propagate (BullMQ retry) — or reschedule with delay (mirror 8.6 if a queue is injected; not required here, propagation is acceptable). Register `NvdSyncProcessor` in `app.module.ts` providers (already done in Step 1). Run `pnpm nx test nvd-sync-worker --testPathPattern=nvd-sync` → PASS.

- [ ] **Step 4: Verify + commit.** `pnpm nx run-many -t type-check,test -p nvd-sync-worker` → green. `grep -rni "enrich\|discovery" apps/nvd-sync-worker/src` → none.
```bash
git add apps/nvd-sync-worker
git commit -m "feat(phase-8.7a): nvd-sync-worker app + NvdSyncProcessor (full/incremental, resumable)"
```

---

## Task 5: Repeatable cron trigger + manual enqueue

**Files:** Create `apps/nvd-sync-worker/src/app/nvd-sync.scheduler.ts` (an `OnApplicationBootstrap` provider); modify `apps/nvd-sync-worker/src/app/app.module.ts`; test `apps/nvd-sync-worker/src/app/__tests__/nvd-sync.scheduler.spec.ts`.

- [ ] **Step 1: Write the failing test** asserting the scheduler registers two repeatable jobs on bootstrap:

```ts
it('registers incremental (daily) and full (weekly) repeatable jobs on bootstrap', async () => {
  const queue = { add: jest.fn().mockResolvedValue({}) };
  const scheduler = new NvdSyncScheduler(queue as never);
  await scheduler.onApplicationBootstrap();
  const calls = queue.add.mock.calls;
  // incremental daily
  expect(calls).toContainEqual([
    'nvd-sync', { mode: 'incremental' },
    expect.objectContaining({ repeat: expect.objectContaining({ pattern: expect.any(String) }), jobId: 'nvd-sync-incremental' }),
  ]);
  // full weekly
  expect(calls).toContainEqual([
    'nvd-sync', { mode: 'full' },
    expect.objectContaining({ repeat: expect.objectContaining({ pattern: expect.any(String) }), jobId: 'nvd-sync-full' }),
  ]);
});
```

Run `pnpm nx test nvd-sync-worker --testPathPattern=nvd-sync.scheduler` → FAIL.

- [ ] **Step 2: Implement** `nvd-sync.scheduler.ts`:

```ts
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { QueueName, type NvdSyncPayload } from '@autoscanner/queues';

const DAILY_2AM = '0 2 * * *';      // incremental every day at 02:00
const WEEKLY_SUN_3AM = '0 3 * * 0'; // full re-sync weekly, Sunday 03:00

@Injectable()
export class NvdSyncScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(NvdSyncScheduler.name);
  constructor(@InjectQueue(QueueName.NVD_SYNC) private readonly queue: Queue<NvdSyncPayload>) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.add('nvd-sync', { mode: 'incremental' }, { repeat: { pattern: DAILY_2AM }, jobId: 'nvd-sync-incremental' });
    await this.queue.add('nvd-sync', { mode: 'full' }, { repeat: { pattern: WEEKLY_SUN_3AM }, jobId: 'nvd-sync-full' });
    this.logger.log('registered NVD_SYNC repeatable jobs (incremental daily, full weekly)');
  }
}
```

Register `NvdSyncScheduler` in `app.module.ts` providers (it needs `@InjectQueue(QueueName.NVD_SYNC)` — `QueuesModule` already registers that queue, but ensure the worker's `app.module.ts` imports `QueuesModule`). Run `pnpm nx test nvd-sync-worker --testPathPattern=nvd-sync.scheduler` → PASS.

(Manual trigger is just enqueuing `{ mode }` onto `NVD_SYNC` from anywhere — no extra code; document it in the commit body.)

- [ ] **Step 3: Verify + commit.** `pnpm nx run-many -t type-check,test -p nvd-sync-worker` → green.
```bash
git add apps/nvd-sync-worker
git commit -m "feat(phase-8.7a): register NVD_SYNC repeatable cron jobs at boot"
```

---

## Task 6: Full validation

- [ ] **Step 1: Validate.** Run:
```
pnpm nx run-many -t type-check,test -p cve,queues,nvd-sync-worker
pnpm nx run-many -t build -p nvd-sync-worker
```
All green. (If anything fails on a stale Prisma client — the new models — run `pnpm install` + `pnpm prisma generate` first; env staleness, not a defect.)

- [ ] **Step 2: Commit (only if validation needed fixups).**
```bash
git add -A && git commit -m "test(phase-8.7a): full validation for NVD offline mirror data layer"
```
(If nothing changed, skip.)

---

## Validation criteria (spec §1)
4 models + enum + migration (T1); `fetchCvePage` parsing configurations (T2); `NVD_SYNC` queue/payload (T3); dedicated `nvd-sync-worker` with full(resumable)+incremental `NvdSyncProcessor` (T4); repeatable cron trigger + manual enqueue (T5); CI incl. worker build (T6). No matching/integration (8.7b). No front change.

## Out of scope (spec §1)
Offline version-range/AND-OR match engine; wiring `findCvesByCpe`/discovery to the mirror; front "verified vs inferred" — all in 8.7b.

## Self-review notes
- **Spec coverage:** §1.1 models=T1; §1.2 fetchCvePage=T2; §1.3 worker+processor=T4; §1.4 cron trigger=T5; §2 data model=T1; §3 flow (full resumable via lastStartIndex, incremental lastMod windows, replace-on-upsert) =T4; §1.5 tests in each; §1.6 build=T6.
- **Type consistency:** `NvdFullCve`/`NvdConfigNodeData`/`NvdCpeMatchData`/`NvdCvePage`/`FetchCvePageParams` (T2) consumed by `NvdSyncProcessor` (T4). `NvdSyncPayload {mode}` (T3) used by processor (T4) + scheduler (T5). Model field names (T1) match the prisma calls in T4 (`nvdCve.upsert`, `nvdConfigNode.create`/`deleteMany`, `nvdCpeMatch` nested create, `nvdSyncState` singleton).
- **Reuse:** `NvdClient` private `getCveListPage`/`extractCvssScore`/`extractCvssMetric` + rate limiter (from 8.6), `cvssToSeverity`, the worker scaffold + `NvdClient` provider factory from `cve-enricher-worker`, the queue wiring pattern. Nothing reimplemented.
- **Resumability/idempotency:** `lastStartIndex` persisted per page; `nvdSyncState` singleton; `upsertCve` = delete-nodes + upsert-cve + recreate-nodes in a tx (re-run converges, no dup). NVD mocked in all tests.
- **Confirm at impl:** the exact NVD `configurations` field names + whether `getCveListPage`'s response type needs widening for `configurations`/`descriptions`; that `cvssToSeverity` accepts `cvssV3Score`; the migration sorts last; Nx auto-discovers the new app (no manual workspace registration needed beyond project.json).
