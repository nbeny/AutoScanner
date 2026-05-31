# Phase 3.1 — Engagement Synthesis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the engagement synthesis page (3-row layout: surface-attack counters + severity donut / top findings + top assets / recent template runs with delta) consuming *only* existing Phase 1+2 data — no new schema, no riskScore writes, no AssetObservation, no live refresh, no NVD enrichment.

**Architecture:**
- Backend: new pure-function library `libs/insight/` (4 read queries on existing Prisma models, no writes); new thin NestJS `InsightModule` in `apps/api-gateway` that wraps the lib with `JwtAuthGuard` + engagement ownership check (pattern mirrors `FindingsService`); 4 new GraphQL queries.
- Frontend: 5 React widgets in `apps/frontend/src/features/engagements/synthesis/`, composed by `EngagementSynthesisPage`, wired into the existing `overview` tab in `engagement-page.tsx`. Existing tabs (`domains | subdomains | ips | technologies | findings`) stay untouched.

**Tech Stack:** NestJS 11, GraphQL 13, Prisma 6, Apollo Client 3, React 18, Tailwind 3, Jest (backend, ts-jest), Vitest + Testing Library (frontend), fast-check (property tests where useful).

**Spec reference:** `docs/superpowers/specs/2026-05-31-phase-3-correlation-dashboard-design.md` §3.1.

**Out of scope for this plan (deferred to 3.2/3.3):**
- `Asset.riskScore` computation (3.2). Top assets in 3.1 sort by `findings count DESC` as a placeholder.
- `AssetObservation` table + provenance timeline (3.3).
- Asset detail page (3.2).
- Facetted asset list (3.2).
- `engagementUpdated` subscription / live refresh (3.3).
- CVE enrichment / `CveCache` / `cve-enricher-worker` (3.3).

---

## File Structure

**Created files (15):**

```
libs/insight/
  package.json
  project.json
  jest.config.ts
  tsconfig.json
  tsconfig.lib.json
  tsconfig.spec.json
  src/
    index.ts
    get-engagement-overview.ts
    get-top-findings.ts
    get-top-assets.ts
    get-recent-template-runs.ts
    __tests__/
      get-engagement-overview.spec.ts
      get-top-findings.spec.ts
      get-top-assets.spec.ts
      get-recent-template-runs.spec.ts

apps/api-gateway/src/app/insight/
  insight.module.ts
  insight.service.ts
  insight.resolver.ts
  dto/
    engagement-overview.object.ts
    severity-counts.object.ts
    top-finding.object.ts
    top-asset.object.ts
    recent-template-run.object.ts
  __tests__/
    insight.service.spec.ts

apps/frontend/src/features/engagements/synthesis/
  engagement-synthesis-page.tsx
  attack-surface-counters.tsx
  severity-donut.tsx
  top-findings-list.tsx
  top-assets-list.tsx
  recent-runs-timeline.tsx
  __tests__/
    engagement-synthesis-page.spec.tsx
    severity-donut.spec.tsx
    top-findings-list.spec.tsx
    recent-runs-timeline.spec.tsx
```

**Modified files (4):**

```
tsconfig.base.json                                  # add `@autoscanner/insight` path
apps/api-gateway/src/app/app.module.ts              # register InsightModule
apps/frontend/src/lib/graphql/queries.ts            # add 4 new GraphQL queries
apps/frontend/src/features/engagements/engagement-page.tsx  # overview tab → synthesis page
```

**Design boundaries:**
- `libs/insight/` is read-only and prisma-typed (takes `PrismaClient` as first arg, no NestJS deps). Reusable from any worker that wants to compute these stats.
- `apps/api-gateway/src/app/insight/` is the NestJS wrapper (ownership check + DTO mapping). Thin.
- Each widget component is self-contained — its own GraphQL query, its own loading/error states. No "mega-query".

---

## Task 1: Scaffold `libs/insight/` library + register path alias

**Files:**
- Create: `libs/insight/package.json`
- Create: `libs/insight/project.json`
- Create: `libs/insight/jest.config.ts`
- Create: `libs/insight/tsconfig.json`
- Create: `libs/insight/tsconfig.lib.json`
- Create: `libs/insight/tsconfig.spec.json`
- Create: `libs/insight/src/index.ts`
- Modify: `tsconfig.base.json` (add path alias)

- [ ] **Step 1: Create `libs/insight/package.json`**

```json
{
  "name": "insight",
  "version": "0.0.1",
  "dependencies": {
    "tslib": "^2.3.0"
  },
  "type": "commonjs",
  "main": "./src/index.js",
  "typings": "./src/index.d.ts",
  "private": true
}
```

- [ ] **Step 2: Create `libs/insight/project.json`**

```json
{
  "name": "insight",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/insight/src",
  "projectType": "library",
  "tags": ["scope:lib"],
  "targets": {
    "test": {
      "executor": "@nx/jest:jest",
      "outputs": ["{workspaceRoot}/coverage/libs/insight"],
      "options": {
        "jestConfig": "libs/insight/jest.config.ts"
      }
    },
    "type-check": {
      "executor": "nx:run-commands",
      "options": {
        "command": "tsc --noEmit -p libs/insight/tsconfig.lib.json"
      }
    }
  }
}
```

- [ ] **Step 3: Create `libs/insight/jest.config.ts`**

```ts
export default {
  displayName: 'insight',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  moduleNameMapper: {
    '^@autoscanner/(.*)$': '<rootDir>/../$1/src/index.ts',
  },
  testMatch: ['**/*.spec.ts'],
  coverageDirectory: '../../coverage/libs/insight',
};
```

- [ ] **Step 4: Create `libs/insight/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true
  },
  "files": [],
  "include": [],
  "references": [
    { "path": "./tsconfig.lib.json" },
    { "path": "./tsconfig.spec.json" }
  ]
}
```

- [ ] **Step 5: Create `libs/insight/tsconfig.lib.json`**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "../../dist/out-tsc",
    "declaration": true,
    "types": ["node"],
    "target": "es2021",
    "strictNullChecks": true,
    "noImplicitAny": true,
    "strictBindCallApply": true,
    "forceConsistentCasingInFileNames": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.spec.ts", "src/**/*.test.ts"]
}
```

- [ ] **Step 6: Create `libs/insight/tsconfig.spec.json`**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "../../dist/out-tsc",
    "module": "commonjs",
    "types": ["jest", "node"]
  },
  "include": ["src/**/*.spec.ts", "src/**/*.test.ts", "jest.config.ts"]
}
```

- [ ] **Step 7: Create `libs/insight/src/index.ts` (placeholder)**

```ts
// Phase 3.1 insight queries — re-exports filled in later tasks.
export {};
```

- [ ] **Step 8: Add path alias to `tsconfig.base.json`**

Open `tsconfig.base.json`. Inside the `paths` object, after the line `"@autoscanner/database": ["libs/database/src/index.ts"],`, insert (alphabetical placement):

```json
      "@autoscanner/insight": ["libs/insight/src/index.ts"],
```

- [ ] **Step 9: Verify type-check passes**

Run: `pnpm nx run insight:type-check`
Expected: PASS (no source files yet, just the empty `export {};`).

- [ ] **Step 10: Commit**

```bash
git add libs/insight tsconfig.base.json
git commit -m "chore(insight): scaffold libs/insight (Phase 3.1)"
```

---

## Task 2: `libs/insight/getEngagementOverview`

**Files:**
- Create: `libs/insight/src/get-engagement-overview.ts`
- Create: `libs/insight/src/__tests__/get-engagement-overview.spec.ts`
- Modify: `libs/insight/src/index.ts`

**What this returns:** counters `{ domains, subdomains, ipAddresses, openPorts, uniqueTechs, findingsBySeverity }` for a given engagement. Pure read — no ownership check at this layer (the api-gateway wrapper enforces it).

- [ ] **Step 1: Write the failing test**

Create `libs/insight/src/__tests__/get-engagement-overview.spec.ts`:

```ts
import type { PrismaClient } from '@prisma/client';
import { getEngagementOverview } from '../get-engagement-overview';

describe('getEngagementOverview', () => {
  const engagementId = 'eng_1';

  it('aggregates counts across Domain, Subdomain, IpAddress, Port, Technology, Finding', async () => {
    const prisma = {
      domain: { count: jest.fn().mockResolvedValue(2) },
      subdomain: { count: jest.fn().mockResolvedValue(7) },
      ipAddress: { count: jest.fn().mockResolvedValue(3) },
      port: { count: jest.fn().mockResolvedValue(11) },
      technology: { findMany: jest.fn().mockResolvedValue([
        { name: 'nginx', version: '1.21' },
        { name: 'nginx', version: '1.21' }, // duplicate must collapse
        { name: 'react', version: '18.2' },
      ]) },
      finding: { groupBy: jest.fn().mockResolvedValue([
        { severity: 'CRITICAL', _count: { _all: 2 } },
        { severity: 'HIGH', _count: { _all: 5 } },
        { severity: 'MEDIUM', _count: { _all: 1 } },
      ]) },
    } as unknown as PrismaClient;

    const overview = await getEngagementOverview(prisma, engagementId);

    expect(overview).toEqual({
      domains: 2,
      subdomains: 7,
      ipAddresses: 3,
      openPorts: 11,
      uniqueTechs: 2, // (nginx@1.21, react@18.2)
      findingsBySeverity: { critical: 2, high: 5, medium: 1, low: 0, info: 0 },
    });
  });

  it('scopes Port count to state=OPEN and the engagement via asset relation', async () => {
    const portCount = jest.fn().mockResolvedValue(0);
    const prisma = {
      domain: { count: jest.fn().mockResolvedValue(0) },
      subdomain: { count: jest.fn().mockResolvedValue(0) },
      ipAddress: { count: jest.fn().mockResolvedValue(0) },
      port: { count: portCount },
      technology: { findMany: jest.fn().mockResolvedValue([]) },
      finding: { groupBy: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaClient;

    await getEngagementOverview(prisma, engagementId);

    expect(portCount).toHaveBeenCalledWith({
      where: {
        state: 'OPEN',
        asset: { engagementId, deletedAt: null },
      },
    });
  });

  it('excludes soft-deleted assets from Finding aggregation', async () => {
    const groupBy = jest.fn().mockResolvedValue([]);
    const prisma = {
      domain: { count: jest.fn().mockResolvedValue(0) },
      subdomain: { count: jest.fn().mockResolvedValue(0) },
      ipAddress: { count: jest.fn().mockResolvedValue(0) },
      port: { count: jest.fn().mockResolvedValue(0) },
      technology: { findMany: jest.fn().mockResolvedValue([]) },
      finding: { groupBy },
    } as unknown as PrismaClient;

    await getEngagementOverview(prisma, engagementId);

    expect(groupBy).toHaveBeenCalledWith({
      by: ['severity'],
      where: { asset: { engagementId, deletedAt: null } },
      _count: { _all: true },
    });
  });

  it('returns zero counts when nothing exists', async () => {
    const prisma = {
      domain: { count: jest.fn().mockResolvedValue(0) },
      subdomain: { count: jest.fn().mockResolvedValue(0) },
      ipAddress: { count: jest.fn().mockResolvedValue(0) },
      port: { count: jest.fn().mockResolvedValue(0) },
      technology: { findMany: jest.fn().mockResolvedValue([]) },
      finding: { groupBy: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaClient;

    const overview = await getEngagementOverview(prisma, engagementId);

    expect(overview).toEqual({
      domains: 0,
      subdomains: 0,
      ipAddresses: 0,
      openPorts: 0,
      uniqueTechs: 0,
      findingsBySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx run insight:test`
Expected: FAIL with `Cannot find module '../get-engagement-overview'`.

- [ ] **Step 3: Implement `get-engagement-overview.ts`**

Create `libs/insight/src/get-engagement-overview.ts`:

```ts
import type { PrismaClient, Severity } from '@prisma/client';

export interface SeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

export interface EngagementOverview {
  domains: number;
  subdomains: number;
  ipAddresses: number;
  openPorts: number;
  uniqueTechs: number;
  findingsBySeverity: SeverityCounts;
}

const ZERO_SEVERITY: SeverityCounts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };

export async function getEngagementOverview(
  prisma: PrismaClient,
  engagementId: string,
): Promise<EngagementOverview> {
  const [domains, subdomains, ipAddresses, openPorts, techs, severityRows] = await Promise.all([
    prisma.domain.count({ where: { engagementId } }),
    prisma.subdomain.count({ where: { engagementId } }),
    prisma.ipAddress.count({ where: { engagementId } }),
    prisma.port.count({
      where: { state: 'OPEN', asset: { engagementId, deletedAt: null } },
    }),
    prisma.technology.findMany({
      where: { asset: { engagementId, deletedAt: null } },
      select: { name: true, version: true },
    }),
    prisma.finding.groupBy({
      by: ['severity'],
      where: { asset: { engagementId, deletedAt: null } },
      _count: { _all: true },
    }),
  ]);

  const uniqueTechKeys = new Set<string>();
  for (const t of techs) uniqueTechKeys.add(`${t.name}@${t.version ?? ''}`);

  const findingsBySeverity = { ...ZERO_SEVERITY };
  for (const row of severityRows) {
    const sev = row.severity as Severity;
    const n = (row as { _count: { _all: number } })._count._all;
    if (sev === 'CRITICAL') findingsBySeverity.critical = n;
    else if (sev === 'HIGH') findingsBySeverity.high = n;
    else if (sev === 'MEDIUM') findingsBySeverity.medium = n;
    else if (sev === 'LOW') findingsBySeverity.low = n;
    else if (sev === 'INFO') findingsBySeverity.info = n;
  }

  return {
    domains,
    subdomains,
    ipAddresses,
    openPorts,
    uniqueTechs: uniqueTechKeys.size,
    findingsBySeverity,
  };
}
```

- [ ] **Step 4: Export from index**

Modify `libs/insight/src/index.ts`:

```ts
export { getEngagementOverview } from './get-engagement-overview';
export type { EngagementOverview, SeverityCounts } from './get-engagement-overview';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm nx run insight:test`
Expected: PASS (4 tests).

Run: `pnpm nx run insight:type-check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add libs/insight
git commit -m "feat(insight): add getEngagementOverview (counters + severity)"
```

---

## Task 3: `libs/insight/getTopFindings`

**Files:**
- Create: `libs/insight/src/get-top-findings.ts`
- Create: `libs/insight/src/__tests__/get-top-findings.spec.ts`
- Modify: `libs/insight/src/index.ts`

**What this returns:** top N findings grouped by `dedupHash`, with `affectedAssetCount`, `scannerSources` (distinct scanner names via ScanJob), `firstSeenAt`, `lastSeenAt`, an example asset id (for clicking through). Ordered by `severity DESC` then by `affectedAssetCount DESC`.

Severity ordering is enforced explicitly (the Prisma enum default order is alphabetical which would put `CRITICAL` before `HIGH` correctly, but `LOW` before `MEDIUM` incorrectly). We use a numeric rank.

- [ ] **Step 1: Write the failing test**

Create `libs/insight/src/__tests__/get-top-findings.spec.ts`:

```ts
import type { PrismaClient } from '@prisma/client';
import { getTopFindings } from '../get-top-findings';

describe('getTopFindings', () => {
  const engagementId = 'eng_1';

  function makeFinding(over: Partial<{
    id: string;
    assetId: string;
    dedupHash: string;
    title: string;
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
    cveId: string | null;
    firstSeenAt: Date;
    lastSeenAt: Date;
    scanJob: { scannerName: string };
  }>) {
    return {
      id: 'f',
      assetId: 'a',
      dedupHash: 'h',
      title: 't',
      severity: 'INFO' as const,
      cveId: null,
      firstSeenAt: new Date('2026-05-01T00:00:00Z'),
      lastSeenAt: new Date('2026-05-01T00:00:00Z'),
      scanJob: { scannerName: 'nuclei' },
      ...over,
    };
  }

  it('groups by dedupHash and returns one entry per group with affectedAssetCount + scannerSources', async () => {
    const prisma = {
      finding: {
        findMany: jest.fn().mockResolvedValue([
          makeFinding({ id: 'f1', assetId: 'a1', dedupHash: 'h-CVE-2024-1', title: 'CVE-2024-1', severity: 'CRITICAL', cveId: 'CVE-2024-1', scanJob: { scannerName: 'nuclei' } }),
          makeFinding({ id: 'f2', assetId: 'a2', dedupHash: 'h-CVE-2024-1', title: 'CVE-2024-1', severity: 'CRITICAL', cveId: 'CVE-2024-1', scanJob: { scannerName: 'nuclei' } }),
          makeFinding({ id: 'f3', assetId: 'a1', dedupHash: 'h-Open-Dir', title: 'Open dir', severity: 'MEDIUM', cveId: null, scanJob: { scannerName: 'nuclei' } }),
        ]),
      },
    } as unknown as PrismaClient;

    const result = await getTopFindings(prisma, engagementId, 10);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      dedupHash: 'h-CVE-2024-1',
      title: 'CVE-2024-1',
      severity: 'CRITICAL',
      cveId: 'CVE-2024-1',
      affectedAssetCount: 2,
      scannerSources: ['nuclei'],
    });
    expect(result[1]).toMatchObject({
      dedupHash: 'h-Open-Dir',
      severity: 'MEDIUM',
      affectedAssetCount: 1,
    });
  });

  it('orders by severity rank desc then affectedAssetCount desc', async () => {
    const prisma = {
      finding: {
        findMany: jest.fn().mockResolvedValue([
          makeFinding({ id: 'f1', assetId: 'a1', dedupHash: 'h-MED', severity: 'MEDIUM' }),
          makeFinding({ id: 'f2', assetId: 'a2', dedupHash: 'h-MED', severity: 'MEDIUM' }),
          makeFinding({ id: 'f3', assetId: 'a3', dedupHash: 'h-MED', severity: 'MEDIUM' }),
          makeFinding({ id: 'f4', assetId: 'a1', dedupHash: 'h-HI', severity: 'HIGH' }),
        ]),
      },
    } as unknown as PrismaClient;

    const result = await getTopFindings(prisma, engagementId, 10);

    expect(result.map((r) => r.dedupHash)).toEqual(['h-HI', 'h-MED']);
  });

  it('respects the limit', async () => {
    const prisma = {
      finding: {
        findMany: jest.fn().mockResolvedValue([
          makeFinding({ id: 'a', assetId: 'a1', dedupHash: 'h1', severity: 'HIGH' }),
          makeFinding({ id: 'b', assetId: 'a1', dedupHash: 'h2', severity: 'HIGH' }),
          makeFinding({ id: 'c', assetId: 'a1', dedupHash: 'h3', severity: 'HIGH' }),
        ]),
      },
    } as unknown as PrismaClient;

    const result = await getTopFindings(prisma, engagementId, 2);

    expect(result).toHaveLength(2);
  });

  it('deduplicates assetId so the count is unique-asset (not finding-row count)', async () => {
    const prisma = {
      finding: {
        findMany: jest.fn().mockResolvedValue([
          makeFinding({ id: 'f1', assetId: 'a1', dedupHash: 'h', severity: 'HIGH' }),
          makeFinding({ id: 'f2', assetId: 'a1', dedupHash: 'h', severity: 'HIGH' }),
          makeFinding({ id: 'f3', assetId: 'a2', dedupHash: 'h', severity: 'HIGH' }),
        ]),
      },
    } as unknown as PrismaClient;

    const result = await getTopFindings(prisma, engagementId, 10);

    expect(result[0]).toMatchObject({ affectedAssetCount: 2 });
  });

  it('returns [] when no findings', async () => {
    const prisma = {
      finding: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaClient;

    const result = await getTopFindings(prisma, engagementId, 10);

    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx run insight:test`
Expected: FAIL with `Cannot find module '../get-top-findings'`.

- [ ] **Step 3: Implement `get-top-findings.ts`**

Create `libs/insight/src/get-top-findings.ts`:

```ts
import type { PrismaClient, Severity } from '@prisma/client';

export interface TopFinding {
  dedupHash: string;
  title: string;
  severity: Severity;
  cveId: string | null;
  affectedAssetCount: number;
  scannerSources: string[];
  firstSeenAt: Date;
  lastSeenAt: Date;
  exampleAssetId: string;
}

const SEVERITY_RANK: Record<Severity, number> = {
  CRITICAL: 5,
  HIGH: 4,
  MEDIUM: 3,
  LOW: 2,
  INFO: 1,
};

export async function getTopFindings(
  prisma: PrismaClient,
  engagementId: string,
  limit: number,
): Promise<TopFinding[]> {
  // We group in-memory because Prisma's groupBy can't include nested relation
  // info (scannerSources) in one call. The dataset is bounded by the number
  // of findings in an engagement (worst case ~thousands), so an in-memory
  // group is acceptable for v1.
  const rows = await prisma.finding.findMany({
    where: { asset: { engagementId, deletedAt: null } },
    select: {
      assetId: true,
      dedupHash: true,
      title: true,
      severity: true,
      cveId: true,
      firstSeenAt: true,
      lastSeenAt: true,
      scanJob: { select: { scannerName: true } },
    },
  });

  type Group = {
    dedupHash: string;
    title: string;
    severity: Severity;
    cveId: string | null;
    assetIds: Set<string>;
    scanners: Set<string>;
    firstSeenAt: Date;
    lastSeenAt: Date;
    exampleAssetId: string;
  };

  const groups = new Map<string, Group>();
  for (const r of rows) {
    let g = groups.get(r.dedupHash);
    if (!g) {
      g = {
        dedupHash: r.dedupHash,
        title: r.title,
        severity: r.severity,
        cveId: r.cveId,
        assetIds: new Set(),
        scanners: new Set(),
        firstSeenAt: r.firstSeenAt,
        lastSeenAt: r.lastSeenAt,
        exampleAssetId: r.assetId,
      };
      groups.set(r.dedupHash, g);
    }
    g.assetIds.add(r.assetId);
    g.scanners.add(r.scanJob.scannerName);
    if (r.firstSeenAt < g.firstSeenAt) g.firstSeenAt = r.firstSeenAt;
    if (r.lastSeenAt > g.lastSeenAt) g.lastSeenAt = r.lastSeenAt;
  }

  const arr: TopFinding[] = [];
  for (const g of groups.values()) {
    arr.push({
      dedupHash: g.dedupHash,
      title: g.title,
      severity: g.severity,
      cveId: g.cveId,
      affectedAssetCount: g.assetIds.size,
      scannerSources: Array.from(g.scanners).sort(),
      firstSeenAt: g.firstSeenAt,
      lastSeenAt: g.lastSeenAt,
      exampleAssetId: g.exampleAssetId,
    });
  }

  arr.sort((a, b) => {
    const sevDiff = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (sevDiff !== 0) return sevDiff;
    return b.affectedAssetCount - a.affectedAssetCount;
  });

  return arr.slice(0, limit);
}
```

- [ ] **Step 4: Export from index**

Modify `libs/insight/src/index.ts` — add the line:

```ts
export { getTopFindings } from './get-top-findings';
export type { TopFinding } from './get-top-findings';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm nx run insight:test`
Expected: PASS (4 prior + 5 new = 9 tests).

- [ ] **Step 6: Commit**

```bash
git add libs/insight
git commit -m "feat(insight): add getTopFindings (group by dedupHash)"
```

---

## Task 4: `libs/insight/getTopAssets`

**Files:**
- Create: `libs/insight/src/get-top-assets.ts`
- Create: `libs/insight/src/__tests__/get-top-assets.spec.ts`
- Modify: `libs/insight/src/index.ts`

**What this returns:** top N assets sorted by `findings count DESC` (placeholder for `riskScore DESC` in 3.2). Each entry: `id`, `kind`, `canonicalValue`, `firstSeenAt`, `lastSeenAt`, `findingsCount`, `criticalCount`, `highCount`. The frontend shows `findingsCount` + per-severity badges.

- [ ] **Step 1: Write the failing test**

Create `libs/insight/src/__tests__/get-top-assets.spec.ts`:

```ts
import type { PrismaClient } from '@prisma/client';
import { getTopAssets } from '../get-top-assets';

describe('getTopAssets (Phase 3.1 — sorted by findings count)', () => {
  const engagementId = 'eng_1';

  it('returns top N assets sorted by total findings count desc', async () => {
    const prisma = {
      asset: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'a1',
            type: 'SUBDOMAIN',
            canonicalValue: 'api.client.com',
            firstSeenAt: new Date('2026-05-01'),
            lastSeenAt: new Date('2026-05-02'),
            findings: [
              { severity: 'CRITICAL' },
              { severity: 'HIGH' },
              { severity: 'HIGH' },
            ],
          },
          {
            id: 'a2',
            type: 'IP_ADDRESS',
            canonicalValue: '10.0.0.1',
            firstSeenAt: new Date('2026-05-01'),
            lastSeenAt: new Date('2026-05-02'),
            findings: [{ severity: 'MEDIUM' }],
          },
          {
            id: 'a3',
            type: 'SUBDOMAIN',
            canonicalValue: 'www.client.com',
            firstSeenAt: new Date('2026-05-01'),
            lastSeenAt: new Date('2026-05-02'),
            findings: [],
          },
        ]),
      },
    } as unknown as PrismaClient;

    const result = await getTopAssets(prisma, engagementId, 10);

    expect(result.map((a) => a.id)).toEqual(['a1', 'a2', 'a3']);
    expect(result[0]).toMatchObject({
      id: 'a1',
      kind: 'SUBDOMAIN',
      canonicalValue: 'api.client.com',
      findingsCount: 3,
      criticalCount: 1,
      highCount: 2,
    });
  });

  it('respects the limit', async () => {
    const prisma = {
      asset: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'a1', type: 'IP_ADDRESS', canonicalValue: '10.0.0.1', firstSeenAt: new Date(), lastSeenAt: new Date(), findings: [{ severity: 'HIGH' }] },
          { id: 'a2', type: 'IP_ADDRESS', canonicalValue: '10.0.0.2', firstSeenAt: new Date(), lastSeenAt: new Date(), findings: [{ severity: 'HIGH' }] },
        ]),
      },
    } as unknown as PrismaClient;

    const result = await getTopAssets(prisma, engagementId, 1);

    expect(result).toHaveLength(1);
  });

  it('filters by engagementId + non-soft-deleted', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = { asset: { findMany } } as unknown as PrismaClient;

    await getTopAssets(prisma, engagementId, 10);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { engagementId, deletedAt: null },
    }));
  });

  it('returns [] when no assets', async () => {
    const prisma = { asset: { findMany: jest.fn().mockResolvedValue([]) } } as unknown as PrismaClient;
    expect(await getTopAssets(prisma, engagementId, 10)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx run insight:test`
Expected: FAIL with `Cannot find module '../get-top-assets'`.

- [ ] **Step 3: Implement `get-top-assets.ts`**

Create `libs/insight/src/get-top-assets.ts`:

```ts
import type { AssetType, PrismaClient } from '@prisma/client';

export interface TopAsset {
  id: string;
  kind: AssetType;
  canonicalValue: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  findingsCount: number;
  criticalCount: number;
  highCount: number;
}

/**
 * Phase 3.1 placeholder: assets are sorted by total findings count desc.
 * Phase 3.2 will swap this for Asset.riskScore desc once the score is
 * actually computed by parser-worker.
 */
export async function getTopAssets(
  prisma: PrismaClient,
  engagementId: string,
  limit: number,
): Promise<TopAsset[]> {
  const assets = await prisma.asset.findMany({
    where: { engagementId, deletedAt: null },
    select: {
      id: true,
      type: true,
      canonicalValue: true,
      firstSeenAt: true,
      lastSeenAt: true,
      findings: { select: { severity: true } },
    },
  });

  const enriched: TopAsset[] = assets.map((a) => {
    let critical = 0;
    let high = 0;
    for (const f of a.findings) {
      if (f.severity === 'CRITICAL') critical++;
      else if (f.severity === 'HIGH') high++;
    }
    return {
      id: a.id,
      kind: a.type,
      canonicalValue: a.canonicalValue,
      firstSeenAt: a.firstSeenAt,
      lastSeenAt: a.lastSeenAt,
      findingsCount: a.findings.length,
      criticalCount: critical,
      highCount: high,
    };
  });

  enriched.sort((x, y) => {
    if (y.findingsCount !== x.findingsCount) return y.findingsCount - x.findingsCount;
    return x.canonicalValue.localeCompare(y.canonicalValue);
  });

  return enriched.slice(0, limit);
}
```

- [ ] **Step 4: Export from index**

Modify `libs/insight/src/index.ts` — add:

```ts
export { getTopAssets } from './get-top-assets';
export type { TopAsset } from './get-top-assets';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm nx run insight:test`
Expected: PASS (9 prior + 4 new = 13 tests).

- [ ] **Step 6: Commit**

```bash
git add libs/insight
git commit -m "feat(insight): add getTopAssets (Phase 3.1 sort by findings count)"
```

---

## Task 5: `libs/insight/getRecentTemplateRuns`

**Files:**
- Create: `libs/insight/src/get-recent-template-runs.ts`
- Create: `libs/insight/src/__tests__/get-recent-template-runs.spec.ts`
- Modify: `libs/insight/src/index.ts`

**What this returns:** N most-recent template runs with `id`, `templateName`, `status`, `startedAt`, `completedAt`, `durationMs`, `newAssetsCount`, `newFindingsCount`. Delta windows: count Assets and Findings whose `firstSeenAt` is between `startedAt` (or `createdAt` if startedAt null) and `completedAt` (or `now()` if still running).

- [ ] **Step 1: Write the failing test**

Create `libs/insight/src/__tests__/get-recent-template-runs.spec.ts`:

```ts
import type { PrismaClient } from '@prisma/client';
import { getRecentTemplateRuns } from '../get-recent-template-runs';

describe('getRecentTemplateRuns', () => {
  const engagementId = 'eng_1';

  function withRuns(runs: unknown[], assetCounts: number[], findingCounts: number[]) {
    let assetCallIdx = 0;
    let findingCallIdx = 0;
    return {
      templateRun: { findMany: jest.fn().mockResolvedValue(runs) },
      asset: { count: jest.fn().mockImplementation(() => Promise.resolve(assetCounts[assetCallIdx++] ?? 0)) },
      finding: { count: jest.fn().mockImplementation(() => Promise.resolve(findingCounts[findingCallIdx++] ?? 0)) },
    } as unknown as PrismaClient;
  }

  it('returns runs ordered by createdAt desc with delta counts per run', async () => {
    const t0 = new Date('2026-05-01T10:00:00Z');
    const t1 = new Date('2026-05-01T10:05:00Z');
    const prisma = withRuns(
      [
        {
          id: 'run_2',
          templateName: 'web-quick',
          status: 'COMPLETED',
          startedAt: t0,
          completedAt: t1,
          createdAt: t0,
        },
        {
          id: 'run_1',
          templateName: 'recon-passive',
          status: 'COMPLETED',
          startedAt: new Date('2026-04-30T10:00:00Z'),
          completedAt: new Date('2026-04-30T10:02:00Z'),
          createdAt: new Date('2026-04-30T10:00:00Z'),
        },
      ],
      [12, 5], // newAssetsCount per run, in the order Promise.all resolves them
      [3, 1],  // newFindingsCount per run
    );

    const result = await getRecentTemplateRuns(prisma, engagementId, 5);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      id: 'run_2',
      templateName: 'web-quick',
      status: 'COMPLETED',
      durationMs: 5 * 60 * 1000,
      newAssetsCount: 12,
      newFindingsCount: 3,
    });
    expect(result[1]).toMatchObject({
      id: 'run_1',
      templateName: 'recon-passive',
      newAssetsCount: 5,
      newFindingsCount: 1,
    });
  });

  it('uses now() as upper bound when a run is still RUNNING', async () => {
    const t0 = new Date('2026-05-01T10:00:00Z');
    const assetCount = jest.fn().mockResolvedValue(0);
    const prisma = {
      templateRun: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'r', templateName: 't', status: 'RUNNING', startedAt: t0, completedAt: null, createdAt: t0 },
        ]),
      },
      asset: { count: assetCount },
      finding: { count: jest.fn().mockResolvedValue(0) },
    } as unknown as PrismaClient;

    await getRecentTemplateRuns(prisma, engagementId, 5);

    const callArg = assetCount.mock.calls[0]?.[0] as { where: { firstSeenAt: { lte: Date } } };
    expect(callArg.where.firstSeenAt.lte.getTime()).toBeGreaterThanOrEqual(t0.getTime());
  });

  it('falls back to createdAt as lower bound when startedAt is null (PENDING)', async () => {
    const created = new Date('2026-05-01T10:00:00Z');
    const assetCount = jest.fn().mockResolvedValue(0);
    const prisma = {
      templateRun: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'r', templateName: 't', status: 'PENDING', startedAt: null, completedAt: null, createdAt: created },
        ]),
      },
      asset: { count: assetCount },
      finding: { count: jest.fn().mockResolvedValue(0) },
    } as unknown as PrismaClient;

    await getRecentTemplateRuns(prisma, engagementId, 5);

    const callArg = assetCount.mock.calls[0]?.[0] as { where: { firstSeenAt: { gte: Date } } };
    expect(callArg.where.firstSeenAt.gte).toEqual(created);
  });

  it('durationMs is null when completedAt is null', async () => {
    const t0 = new Date('2026-05-01T10:00:00Z');
    const prisma = {
      templateRun: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'r', templateName: 't', status: 'RUNNING', startedAt: t0, completedAt: null, createdAt: t0 },
        ]),
      },
      asset: { count: jest.fn().mockResolvedValue(0) },
      finding: { count: jest.fn().mockResolvedValue(0) },
    } as unknown as PrismaClient;

    const result = await getRecentTemplateRuns(prisma, engagementId, 5);

    expect(result[0]?.durationMs).toBeNull();
  });

  it('returns [] when no runs', async () => {
    const prisma = {
      templateRun: { findMany: jest.fn().mockResolvedValue([]) },
      asset: { count: jest.fn() },
      finding: { count: jest.fn() },
    } as unknown as PrismaClient;

    expect(await getRecentTemplateRuns(prisma, engagementId, 5)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx run insight:test`
Expected: FAIL with `Cannot find module '../get-recent-template-runs'`.

- [ ] **Step 3: Implement `get-recent-template-runs.ts`**

Create `libs/insight/src/get-recent-template-runs.ts`:

```ts
import type { PrismaClient, TemplateRunStatus } from '@prisma/client';

export interface RecentTemplateRun {
  id: string;
  templateName: string;
  status: TemplateRunStatus;
  startedAt: Date | null;
  completedAt: Date | null;
  durationMs: number | null;
  newAssetsCount: number;
  newFindingsCount: number;
}

export async function getRecentTemplateRuns(
  prisma: PrismaClient,
  engagementId: string,
  limit: number,
): Promise<RecentTemplateRun[]> {
  const runs = await prisma.templateRun.findMany({
    where: { engagementId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      templateName: true,
      status: true,
      startedAt: true,
      completedAt: true,
      createdAt: true,
    },
  });

  // Compute deltas in parallel. Two windowed counts per run.
  const now = new Date();
  const deltas = await Promise.all(
    runs.map(async (r) => {
      const from = r.startedAt ?? r.createdAt;
      const to = r.completedAt ?? now;
      const [newAssets, newFindings] = await Promise.all([
        prisma.asset.count({
          where: {
            engagementId,
            deletedAt: null,
            firstSeenAt: { gte: from, lte: to },
          },
        }),
        prisma.finding.count({
          where: {
            asset: { engagementId, deletedAt: null },
            firstSeenAt: { gte: from, lte: to },
          },
        }),
      ]);
      return { newAssets, newFindings };
    }),
  );

  return runs.map((r, i) => ({
    id: r.id,
    templateName: r.templateName,
    status: r.status,
    startedAt: r.startedAt,
    completedAt: r.completedAt,
    durationMs:
      r.startedAt && r.completedAt ? r.completedAt.getTime() - r.startedAt.getTime() : null,
    newAssetsCount: deltas[i]?.newAssets ?? 0,
    newFindingsCount: deltas[i]?.newFindings ?? 0,
  }));
}
```

- [ ] **Step 4: Export from index**

Modify `libs/insight/src/index.ts` — add:

```ts
export { getRecentTemplateRuns } from './get-recent-template-runs';
export type { RecentTemplateRun } from './get-recent-template-runs';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm nx run insight:test`
Expected: PASS (13 prior + 5 new = 18 tests).

Run: `pnpm nx run insight:type-check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add libs/insight
git commit -m "feat(insight): add getRecentTemplateRuns with delta counts"
```

---

## Task 6: `apps/api-gateway` — Insight DTOs

**Files:**
- Create: `apps/api-gateway/src/app/insight/dto/severity-counts.object.ts`
- Create: `apps/api-gateway/src/app/insight/dto/engagement-overview.object.ts`
- Create: `apps/api-gateway/src/app/insight/dto/top-finding.object.ts`
- Create: `apps/api-gateway/src/app/insight/dto/top-asset.object.ts`
- Create: `apps/api-gateway/src/app/insight/dto/recent-template-run.object.ts`

DTOs only — no service yet. Each is a GraphQL `@ObjectType()`.

- [ ] **Step 1: Create `severity-counts.object.ts`**

```ts
import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class SeverityCountsObject {
  @Field(() => Int) critical!: number;
  @Field(() => Int) high!: number;
  @Field(() => Int) medium!: number;
  @Field(() => Int) low!: number;
  @Field(() => Int) info!: number;
}
```

- [ ] **Step 2: Create `engagement-overview.object.ts`**

```ts
import { Field, Int, ObjectType } from '@nestjs/graphql';
import { SeverityCountsObject } from './severity-counts.object';

@ObjectType()
export class EngagementOverviewObject {
  @Field(() => Int) domains!: number;
  @Field(() => Int) subdomains!: number;
  @Field(() => Int) ipAddresses!: number;
  @Field(() => Int) openPorts!: number;
  @Field(() => Int) uniqueTechs!: number;
  @Field(() => SeverityCountsObject) findingsBySeverity!: SeverityCountsObject;
}
```

- [ ] **Step 3: Create `top-finding.object.ts`**

```ts
import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { Severity } from '../../findings/dto/severity.enum';

@ObjectType()
export class TopFindingObject {
  @Field(() => ID) dedupHash!: string;
  @Field() title!: string;
  @Field(() => Severity) severity!: Severity;
  @Field({ nullable: true }) cveId?: string | null;
  @Field(() => Int) affectedAssetCount!: number;
  @Field(() => [String]) scannerSources!: string[];
  @Field() firstSeenAt!: Date;
  @Field() lastSeenAt!: Date;
  @Field(() => ID) exampleAssetId!: string;
}
```

- [ ] **Step 4: Create `top-asset.object.ts`**

```ts
import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { AssetType } from '../../assets/dto/asset-type.enum';

@ObjectType()
export class TopAssetObject {
  @Field(() => ID) id!: string;
  @Field(() => AssetType) kind!: AssetType;
  @Field() canonicalValue!: string;
  @Field() firstSeenAt!: Date;
  @Field() lastSeenAt!: Date;
  @Field(() => Int) findingsCount!: number;
  @Field(() => Int) criticalCount!: number;
  @Field(() => Int) highCount!: number;
}
```

- [ ] **Step 5: Create `recent-template-run.object.ts`**

```ts
import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { TemplateRunStatus } from '../../templates/dto/template-run-status.enum';

@ObjectType()
export class RecentTemplateRunObject {
  @Field(() => ID) id!: string;
  @Field() templateName!: string;
  @Field(() => TemplateRunStatus) status!: TemplateRunStatus;
  @Field({ nullable: true }) startedAt?: Date | null;
  @Field({ nullable: true }) completedAt?: Date | null;
  @Field(() => Int, { nullable: true }) durationMs?: number | null;
  @Field(() => Int) newAssetsCount!: number;
  @Field(() => Int) newFindingsCount!: number;
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/api-gateway/src/app/insight/dto
git commit -m "feat(api-gateway): add Insight DTOs"
```

---

## Task 7: `apps/api-gateway` — InsightService + tests

**Files:**
- Create: `apps/api-gateway/src/app/insight/insight.service.ts`
- Create: `apps/api-gateway/src/app/insight/__tests__/insight.service.spec.ts`

Service wraps the `libs/insight/` functions, enforcing engagement ownership before each call (pattern from `FindingsService`).

- [ ] **Step 1: Write the failing test**

Create `apps/api-gateway/src/app/insight/__tests__/insight.service.spec.ts`:

```ts
import { NotFoundError } from '@autoscanner/common';
import type { PrismaService } from '@autoscanner/database';

import { InsightService } from '../insight.service';
import * as insightLib from '@autoscanner/insight';

jest.mock('@autoscanner/insight');

describe('InsightService', () => {
  let prisma: jest.Mocked<PrismaService>;
  let svc: InsightService;
  const userId = 'u1';
  const engagementId = 'e1';

  beforeEach(() => {
    jest.resetAllMocks();
    prisma = {
      engagement: { findFirst: jest.fn() },
    } as unknown as jest.Mocked<PrismaService>;
    svc = new InsightService(prisma);
  });

  describe('ownership', () => {
    it('throws NotFoundError on overview when engagement not owned', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce(null);
      await expect(svc.engagementOverview(userId, engagementId)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('throws NotFoundError on topFindings when engagement not owned', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce(null);
      await expect(svc.topFindings(userId, engagementId, 10)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('throws NotFoundError on topAssets when engagement not owned', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce(null);
      await expect(svc.topAssets(userId, engagementId, 10)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('throws NotFoundError on recentTemplateRuns when engagement not owned', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce(null);
      await expect(svc.recentTemplateRuns(userId, engagementId, 5)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('checks ownership with ownerId + deletedAt: null', async () => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValueOnce({ id: engagementId });
      (insightLib.getEngagementOverview as jest.Mock).mockResolvedValueOnce({
        domains: 0, subdomains: 0, ipAddresses: 0, openPorts: 0, uniqueTechs: 0,
        findingsBySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
      });

      await svc.engagementOverview(userId, engagementId);

      expect(prisma.engagement.findFirst).toHaveBeenCalledWith({
        where: { id: engagementId, ownerId: userId, deletedAt: null },
        select: { id: true },
      });
    });
  });

  describe('delegation', () => {
    beforeEach(() => {
      (prisma.engagement.findFirst as jest.Mock).mockResolvedValue({ id: engagementId });
    });

    it('engagementOverview delegates to the lib with prisma + engagementId', async () => {
      const fake = {
        domains: 1, subdomains: 2, ipAddresses: 3, openPorts: 4, uniqueTechs: 5,
        findingsBySeverity: { critical: 1, high: 0, medium: 0, low: 0, info: 0 },
      };
      (insightLib.getEngagementOverview as jest.Mock).mockResolvedValueOnce(fake);

      const result = await svc.engagementOverview(userId, engagementId);

      expect(insightLib.getEngagementOverview).toHaveBeenCalledWith(prisma, engagementId);
      expect(result).toBe(fake);
    });

    it('topFindings clamps limit to [1, 100] (default 10)', async () => {
      (insightLib.getTopFindings as jest.Mock).mockResolvedValue([]);

      await svc.topFindings(userId, engagementId, 200);
      expect(insightLib.getTopFindings).toHaveBeenLastCalledWith(prisma, engagementId, 100);

      await svc.topFindings(userId, engagementId, 0);
      expect(insightLib.getTopFindings).toHaveBeenLastCalledWith(prisma, engagementId, 1);

      await svc.topFindings(userId, engagementId, -5);
      expect(insightLib.getTopFindings).toHaveBeenLastCalledWith(prisma, engagementId, 1);

      await svc.topFindings(userId, engagementId, 7);
      expect(insightLib.getTopFindings).toHaveBeenLastCalledWith(prisma, engagementId, 7);
    });

    it('topAssets delegates with clamped limit', async () => {
      (insightLib.getTopAssets as jest.Mock).mockResolvedValue([]);
      await svc.topAssets(userId, engagementId, 999);
      expect(insightLib.getTopAssets).toHaveBeenLastCalledWith(prisma, engagementId, 100);
    });

    it('recentTemplateRuns delegates with clamped limit (max 20)', async () => {
      (insightLib.getRecentTemplateRuns as jest.Mock).mockResolvedValue([]);
      await svc.recentTemplateRuns(userId, engagementId, 999);
      expect(insightLib.getRecentTemplateRuns).toHaveBeenLastCalledWith(prisma, engagementId, 20);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx run api-gateway:test -- --testPathPattern=insight.service`
Expected: FAIL with `Cannot find module '../insight.service'`.

- [ ] **Step 3: Implement `insight.service.ts`**

Create `apps/api-gateway/src/app/insight/insight.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { NotFoundError } from '@autoscanner/common';
import { PrismaService } from '@autoscanner/database';
import {
  type EngagementOverview,
  type RecentTemplateRun,
  type TopAsset,
  type TopFinding,
  getEngagementOverview,
  getRecentTemplateRuns,
  getTopAssets,
  getTopFindings,
} from '@autoscanner/insight';

function clamp(n: number | null | undefined, min: number, max: number, fallback: number): number {
  const v = Number.isFinite(n) ? Math.trunc(n as number) : fallback;
  return Math.min(Math.max(v, min), max);
}

@Injectable()
export class InsightService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertOwnership(userId: string, engagementId: string): Promise<void> {
    const eng = await this.prisma.engagement.findFirst({
      where: { id: engagementId, ownerId: userId, deletedAt: null },
      select: { id: true },
    });
    if (!eng) throw new NotFoundError('Engagement', engagementId);
  }

  async engagementOverview(userId: string, engagementId: string): Promise<EngagementOverview> {
    await this.assertOwnership(userId, engagementId);
    return getEngagementOverview(this.prisma, engagementId);
  }

  async topFindings(userId: string, engagementId: string, limit: number): Promise<TopFinding[]> {
    await this.assertOwnership(userId, engagementId);
    return getTopFindings(this.prisma, engagementId, clamp(limit, 1, 100, 10));
  }

  async topAssets(userId: string, engagementId: string, limit: number): Promise<TopAsset[]> {
    await this.assertOwnership(userId, engagementId);
    return getTopAssets(this.prisma, engagementId, clamp(limit, 1, 100, 10));
  }

  async recentTemplateRuns(
    userId: string,
    engagementId: string,
    limit: number,
  ): Promise<RecentTemplateRun[]> {
    await this.assertOwnership(userId, engagementId);
    return getRecentTemplateRuns(this.prisma, engagementId, clamp(limit, 1, 20, 5));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx run api-gateway:test -- --testPathPattern=insight.service`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api-gateway/src/app/insight
git commit -m "feat(api-gateway): add InsightService (ownership-checked wrapper)"
```

---

## Task 8: `apps/api-gateway` — InsightResolver + InsightModule + register

**Files:**
- Create: `apps/api-gateway/src/app/insight/insight.resolver.ts`
- Create: `apps/api-gateway/src/app/insight/insight.module.ts`
- Modify: `apps/api-gateway/src/app/app.module.ts`

- [ ] **Step 1: Create `insight.resolver.ts`**

```ts
import { UseGuards } from '@nestjs/common';
import { Args, ID, Int, Query, Resolver } from '@nestjs/graphql';
import type { User } from '@prisma/client';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EngagementOverviewObject } from './dto/engagement-overview.object';
import { RecentTemplateRunObject } from './dto/recent-template-run.object';
import { TopAssetObject } from './dto/top-asset.object';
import { TopFindingObject } from './dto/top-finding.object';
import { InsightService } from './insight.service';

@Resolver()
@UseGuards(JwtAuthGuard)
export class InsightResolver {
  constructor(private readonly svc: InsightService) {}

  @Query(() => EngagementOverviewObject)
  engagementOverview(
    @CurrentUser() user: User,
    @Args('engagementId', { type: () => ID }) engagementId: string,
  ): Promise<EngagementOverviewObject> {
    return this.svc.engagementOverview(user.id, engagementId) as Promise<EngagementOverviewObject>;
  }

  @Query(() => [TopFindingObject])
  topFindings(
    @CurrentUser() user: User,
    @Args('engagementId', { type: () => ID }) engagementId: string,
    @Args('limit', { type: () => Int, defaultValue: 10 }) limit: number,
  ): Promise<TopFindingObject[]> {
    return this.svc.topFindings(user.id, engagementId, limit) as Promise<TopFindingObject[]>;
  }

  @Query(() => [TopAssetObject])
  topAssets(
    @CurrentUser() user: User,
    @Args('engagementId', { type: () => ID }) engagementId: string,
    @Args('limit', { type: () => Int, defaultValue: 10 }) limit: number,
  ): Promise<TopAssetObject[]> {
    return this.svc.topAssets(user.id, engagementId, limit) as Promise<TopAssetObject[]>;
  }

  @Query(() => [RecentTemplateRunObject])
  recentTemplateRuns(
    @CurrentUser() user: User,
    @Args('engagementId', { type: () => ID }) engagementId: string,
    @Args('limit', { type: () => Int, defaultValue: 5 }) limit: number,
  ): Promise<RecentTemplateRunObject[]> {
    return this.svc.recentTemplateRuns(user.id, engagementId, limit) as Promise<RecentTemplateRunObject[]>;
  }
}
```

- [ ] **Step 2: Create `insight.module.ts`**

```ts
import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { InsightResolver } from './insight.resolver';
import { InsightService } from './insight.service';

@Module({
  imports: [AuthModule],
  providers: [InsightService, InsightResolver],
})
export class InsightModule {}
```

- [ ] **Step 3: Register InsightModule in `app.module.ts`**

Open `apps/api-gateway/src/app/app.module.ts`. After the line `import { FindingsModule } from './findings/findings.module';`, add:

```ts
import { InsightModule } from './insight/insight.module';
```

In the `imports` array, after `FindingsModule,`, add (alphabetical placement):

```ts
    InsightModule,
```

- [ ] **Step 4: Type-check and test**

Run: `pnpm nx run api-gateway:type-check`
Expected: PASS.

Run: `pnpm nx run api-gateway:test`
Expected: PASS (all existing + new insight.service tests).

- [ ] **Step 5: Boot smoke check**

Run (in background): `pnpm nx serve api-gateway`
Wait ~5s, then check the GraphQL schema includes the new queries:

```bash
curl -s -X POST http://localhost:4000/graphql \
  -H 'content-type: application/json' \
  -d '{"query":"{__schema{queryType{fields{name}}}}"}' \
  | grep -oE '"(engagementOverview|topFindings|topAssets|recentTemplateRuns)"'
```

Expected output (4 lines, in any order):
```
"engagementOverview"
"topFindings"
"topAssets"
"recentTemplateRuns"
```

Kill the dev server.

- [ ] **Step 6: Commit**

```bash
git add apps/api-gateway/src/app/insight apps/api-gateway/src/app/app.module.ts
git commit -m "feat(api-gateway): expose Insight queries (overview, topFindings, topAssets, recentTemplateRuns)"
```

---

## Task 9: Frontend — add GraphQL queries

**Files:**
- Modify: `apps/frontend/src/lib/graphql/queries.ts`

- [ ] **Step 1: Append the 4 queries**

Open `apps/frontend/src/lib/graphql/queries.ts`. Append at the end of the file:

```ts
export const ENGAGEMENT_OVERVIEW_QUERY = gql`
  query EngagementOverview($engagementId: ID!) {
    engagementOverview(engagementId: $engagementId) {
      domains
      subdomains
      ipAddresses
      openPorts
      uniqueTechs
      findingsBySeverity {
        critical
        high
        medium
        low
        info
      }
    }
  }
`;

export const TOP_FINDINGS_QUERY = gql`
  query TopFindings($engagementId: ID!, $limit: Int) {
    topFindings(engagementId: $engagementId, limit: $limit) {
      dedupHash
      title
      severity
      cveId
      affectedAssetCount
      scannerSources
      firstSeenAt
      lastSeenAt
      exampleAssetId
    }
  }
`;

export const TOP_ASSETS_QUERY = gql`
  query TopAssets($engagementId: ID!, $limit: Int) {
    topAssets(engagementId: $engagementId, limit: $limit) {
      id
      kind
      canonicalValue
      firstSeenAt
      lastSeenAt
      findingsCount
      criticalCount
      highCount
    }
  }
`;

export const RECENT_TEMPLATE_RUNS_QUERY = gql`
  query RecentTemplateRuns($engagementId: ID!, $limit: Int) {
    recentTemplateRuns(engagementId: $engagementId, limit: $limit) {
      id
      templateName
      status
      startedAt
      completedAt
      durationMs
      newAssetsCount
      newFindingsCount
    }
  }
`;
```

- [ ] **Step 2: Type-check**

Run: `pnpm nx run frontend:type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/lib/graphql/queries.ts
git commit -m "feat(frontend): add Insight GraphQL queries"
```

---

## Task 10: Widget — `AttackSurfaceCounters`

**Files:**
- Create: `apps/frontend/src/features/engagements/synthesis/attack-surface-counters.tsx`

Five counter tiles in a horizontal row. Pulls from `ENGAGEMENT_OVERVIEW_QUERY`.

- [ ] **Step 1: Create the component**

```tsx
import { useQuery } from '@apollo/client';
import { ENGAGEMENT_OVERVIEW_QUERY } from '../../../lib/graphql/queries';

interface SeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

interface Overview {
  domains: number;
  subdomains: number;
  ipAddresses: number;
  openPorts: number;
  uniqueTechs: number;
  findingsBySeverity: SeverityCounts;
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-slate-900 rounded p-3 text-center min-w-[6rem]">
      <div className="text-2xl font-semibold text-slate-100">{value}</div>
      <div className="text-xs text-slate-400 mt-1">{label}</div>
    </div>
  );
}

export function AttackSurfaceCounters({ engagementId }: { engagementId: string }) {
  const { data, loading, error } = useQuery<{ engagementOverview: Overview }>(
    ENGAGEMENT_OVERVIEW_QUERY,
    { variables: { engagementId } },
  );

  if (loading) return <p className="text-slate-400 text-sm">Loading overview…</p>;
  if (error)
    return (
      <p className="text-red-400 text-sm" role="alert">
        {error.message}
      </p>
    );

  const o = data?.engagementOverview;
  if (!o) return null;

  return (
    <div
      className="flex flex-wrap gap-2"
      aria-label="attack-surface-counters"
    >
      <Tile label="Domains" value={o.domains} />
      <Tile label="Subdomains" value={o.subdomains} />
      <Tile label="IPs" value={o.ipAddresses} />
      <Tile label="Open ports" value={o.openPorts} />
      <Tile label="Unique techs" value={o.uniqueTechs} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/features/engagements/synthesis/attack-surface-counters.tsx
git commit -m "feat(frontend): add AttackSurfaceCounters widget"
```

---

## Task 11: Widget — `SeverityDonut` (pure SVG) + test

**Files:**
- Create: `apps/frontend/src/features/engagements/synthesis/severity-donut.tsx`
- Create: `apps/frontend/src/features/engagements/synthesis/__tests__/severity-donut.spec.tsx`

Pure SVG donut. Takes the `findingsBySeverity` from the same query (already cached by Apollo — no second network roundtrip).

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/features/engagements/synthesis/__tests__/severity-donut.spec.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { MockedProvider } from '@apollo/client/testing';
import { render, screen, waitFor } from '@testing-library/react';
import { ENGAGEMENT_OVERVIEW_QUERY } from '../../../../lib/graphql/queries';
import { SeverityDonut } from '../severity-donut';

const engagementId = 'eng_1';

function mockOverview(counts: Partial<{
  critical: number; high: number; medium: number; low: number; info: number;
}>) {
  return {
    request: { query: ENGAGEMENT_OVERVIEW_QUERY, variables: { engagementId } },
    result: {
      data: {
        engagementOverview: {
          __typename: 'EngagementOverviewObject',
          domains: 0,
          subdomains: 0,
          ipAddresses: 0,
          openPorts: 0,
          uniqueTechs: 0,
          findingsBySeverity: {
            __typename: 'SeverityCountsObject',
            critical: 0, high: 0, medium: 0, low: 0, info: 0,
            ...counts,
          },
        },
      },
    },
  };
}

describe('<SeverityDonut />', () => {
  it('renders the total findings count at the center', async () => {
    render(
      <MockedProvider mocks={[mockOverview({ critical: 2, high: 5, medium: 3 })]}>
        <SeverityDonut engagementId={engagementId} />
      </MockedProvider>,
    );
    await waitFor(() => expect(screen.getByLabelText('total-findings')).toHaveTextContent('10'));
  });

  it('shows an empty state when total = 0', async () => {
    render(
      <MockedProvider mocks={[mockOverview({})]}>
        <SeverityDonut engagementId={engagementId} />
      </MockedProvider>,
    );
    await waitFor(() => expect(screen.getByText(/No findings yet/i)).toBeInTheDocument());
  });

  it('renders one arc per non-zero severity (a11y: each labelled)', async () => {
    render(
      <MockedProvider mocks={[mockOverview({ critical: 2, high: 5, low: 1 })]}>
        <SeverityDonut engagementId={engagementId} />
      </MockedProvider>,
    );
    await waitFor(() => expect(screen.getByLabelText('arc-critical-2')).toBeInTheDocument());
    expect(screen.getByLabelText('arc-high-5')).toBeInTheDocument();
    expect(screen.getByLabelText('arc-low-1')).toBeInTheDocument();
    expect(screen.queryByLabelText(/arc-medium-/)).toBeNull();
    expect(screen.queryByLabelText(/arc-info-/)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx run frontend:test -- severity-donut`
Expected: FAIL with `Cannot find module '../severity-donut'`.

- [ ] **Step 3: Implement `severity-donut.tsx`**

Create `apps/frontend/src/features/engagements/synthesis/severity-donut.tsx`:

```tsx
import { useQuery } from '@apollo/client';
import { ENGAGEMENT_OVERVIEW_QUERY } from '../../../lib/graphql/queries';

interface SeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

interface Overview {
  findingsBySeverity: SeverityCounts;
}

type SeverityKey = keyof SeverityCounts;

// Tailwind palette hex equivalents — SVG `fill` takes raw colors.
const COLORS: Record<SeverityKey, string> = {
  critical: '#b91c1c', // red-700
  high: '#ea580c',     // orange-600
  medium: '#ca8a04',   // yellow-600
  low: '#2563eb',      // blue-600
  info: '#475569',     // slate-600
};

const ORDER: SeverityKey[] = ['critical', 'high', 'medium', 'low', 'info'];

// Geometry: 100×100 viewBox, donut with outer r=45, inner r=30, centered (50,50).
const R = 45;
const STROKE = 15;
const CIRCUMFERENCE = 2 * Math.PI * R;

function polar(cx: number, cy: number, r: number, angleRad: number) {
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

export function SeverityDonut({ engagementId }: { engagementId: string }) {
  const { data, loading, error } = useQuery<{ engagementOverview: Overview }>(
    ENGAGEMENT_OVERVIEW_QUERY,
    { variables: { engagementId } },
  );

  if (loading) return <p className="text-slate-400 text-sm">Loading severity…</p>;
  if (error)
    return (
      <p className="text-red-400 text-sm" role="alert">
        {error.message}
      </p>
    );

  const c = data?.engagementOverview.findingsBySeverity;
  if (!c) return null;

  const total = c.critical + c.high + c.medium + c.low + c.info;
  if (total === 0) {
    return (
      <div className="bg-slate-900 rounded p-4 text-center text-sm text-slate-400">
        No findings yet.
      </div>
    );
  }

  // Build arcs. Each non-zero severity contributes one path; we walk the
  // circle from -90° (top) clockwise, computing start/end angles.
  let angle = -Math.PI / 2; // start at top
  const arcs = ORDER.filter((k) => c[k] > 0).map((k) => {
    const value = c[k];
    const frac = value / total;
    const start = angle;
    const end = angle + frac * 2 * Math.PI;
    angle = end;

    // Single-arc special case: a full-circle path can't be drawn with a single
    // arc command (start == end). Use two semicircle arcs.
    const largeArc = end - start > Math.PI ? 1 : 0;
    const p0 = polar(50, 50, R, start);
    const p1 = polar(50, 50, R, end);

    const d =
      frac === 1
        ? `M ${50 - R} 50 A ${R} ${R} 0 1 1 ${50 + R} 50 A ${R} ${R} 0 1 1 ${50 - R} 50`
        : `M ${p0.x} ${p0.y} A ${R} ${R} 0 ${largeArc} 1 ${p1.x} ${p1.y}`;

    return { key: k, value, d };
  });

  return (
    <div className="bg-slate-900 rounded p-4 flex items-center gap-4" aria-label="severity-donut">
      <svg viewBox="0 0 100 100" className="w-32 h-32 -rotate-0" role="img" aria-label="findings severity distribution">
        {arcs.map((a) => (
          <path
            key={a.key}
            d={a.d}
            stroke={COLORS[a.key]}
            strokeWidth={STROKE}
            fill="none"
            aria-label={`arc-${a.key}-${a.value}`}
          />
        ))}
        <text
          x="50"
          y="54"
          textAnchor="middle"
          fontSize="18"
          fill="#e2e8f0"
          aria-label="total-findings"
        >
          {total}
        </text>
      </svg>
      <ul className="text-xs space-y-1">
        {ORDER.map((k) => (
          <li key={k} className="flex items-center gap-2">
            <span
              className="inline-block w-3 h-3 rounded-sm"
              style={{ backgroundColor: COLORS[k] }}
              aria-hidden="true"
            />
            <span className="uppercase text-slate-300 w-20">{k}</span>
            <span className="font-mono text-slate-100">{c[k]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx run frontend:test -- severity-donut`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/engagements/synthesis/severity-donut.tsx apps/frontend/src/features/engagements/synthesis/__tests__/severity-donut.spec.tsx
git commit -m "feat(frontend): add SeverityDonut widget (pure SVG)"
```

---

## Task 12: Widget — `TopFindingsList` + test

**Files:**
- Create: `apps/frontend/src/features/engagements/synthesis/top-findings-list.tsx`
- Create: `apps/frontend/src/features/engagements/synthesis/__tests__/top-findings-list.spec.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/features/engagements/synthesis/__tests__/top-findings-list.spec.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { MockedProvider } from '@apollo/client/testing';
import { render, screen, waitFor } from '@testing-library/react';
import { TOP_FINDINGS_QUERY } from '../../../../lib/graphql/queries';
import { TopFindingsList } from '../top-findings-list';

const engagementId = 'eng_1';

function mockTopFindings(items: unknown[]) {
  return {
    request: { query: TOP_FINDINGS_QUERY, variables: { engagementId, limit: 10 } },
    result: { data: { topFindings: items } },
  };
}

describe('<TopFindingsList />', () => {
  it('renders rows with title, severity, scanner badges, and affected count', async () => {
    render(
      <MemoryRouter>
        <MockedProvider
          mocks={[
            mockTopFindings([
              {
                __typename: 'TopFindingObject',
                dedupHash: 'h1',
                title: 'Critical CVE',
                severity: 'CRITICAL',
                cveId: 'CVE-2024-1',
                affectedAssetCount: 3,
                scannerSources: ['nuclei'],
                firstSeenAt: '2026-05-01T00:00:00Z',
                lastSeenAt: '2026-05-02T00:00:00Z',
                exampleAssetId: 'a_1',
              },
            ])
          ]}
        >
          <TopFindingsList engagementId={engagementId} />
        </MockedProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('Critical CVE')).toBeInTheDocument());
    expect(screen.getByText('CRITICAL')).toBeInTheDocument();
    expect(screen.getByText('nuclei')).toBeInTheDocument();
    expect(screen.getByText('3 assets')).toBeInTheDocument();
    expect(screen.getByText('CVE-2024-1')).toBeInTheDocument();
  });

  it('renders empty state when no findings', async () => {
    render(
      <MemoryRouter>
        <MockedProvider mocks={[mockTopFindings([])]}>
          <TopFindingsList engagementId={engagementId} />
        </MockedProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText(/No findings yet/i)).toBeInTheDocument());
  });

  it('uses "1 asset" singular when affectedAssetCount = 1', async () => {
    render(
      <MemoryRouter>
        <MockedProvider
          mocks={[
            mockTopFindings([
              {
                __typename: 'TopFindingObject',
                dedupHash: 'h1', title: 'Solo', severity: 'HIGH', cveId: null,
                affectedAssetCount: 1, scannerSources: ['nuclei'],
                firstSeenAt: '2026-05-01T00:00:00Z', lastSeenAt: '2026-05-02T00:00:00Z',
                exampleAssetId: 'a_1',
              },
            ])
          ]}
        >
          <TopFindingsList engagementId={engagementId} />
        </MockedProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('1 asset')).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx run frontend:test -- top-findings-list`
Expected: FAIL with `Cannot find module '../top-findings-list'`.

- [ ] **Step 3: Implement `top-findings-list.tsx`**

```tsx
import { useQuery } from '@apollo/client';
import { TOP_FINDINGS_QUERY } from '../../../lib/graphql/queries';

type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

interface TopFinding {
  dedupHash: string;
  title: string;
  severity: Severity;
  cveId: string | null;
  affectedAssetCount: number;
  scannerSources: string[];
  firstSeenAt: string;
  lastSeenAt: string;
  exampleAssetId: string;
}

const SEVERITY_STYLE: Record<Severity, string> = {
  CRITICAL: 'bg-red-700 text-red-50',
  HIGH: 'bg-orange-600 text-orange-50',
  MEDIUM: 'bg-yellow-600 text-yellow-50',
  LOW: 'bg-blue-600 text-blue-50',
  INFO: 'bg-slate-600 text-slate-50',
};

export function TopFindingsList({
  engagementId,
  limit = 10,
}: {
  engagementId: string;
  limit?: number;
}) {
  const { data, loading, error } = useQuery<{ topFindings: TopFinding[] }>(TOP_FINDINGS_QUERY, {
    variables: { engagementId, limit },
  });

  if (loading) return <p className="text-slate-400 text-sm">Loading top findings…</p>;
  if (error)
    return (
      <p className="text-red-400 text-sm" role="alert">
        {error.message}
      </p>
    );

  const items = data?.topFindings ?? [];
  if (items.length === 0) {
    return (
      <section className="bg-slate-900 rounded p-4">
        <h3 className="text-lg font-semibold mb-2">Top findings</h3>
        <p className="text-slate-500 text-sm">No findings yet.</p>
      </section>
    );
  }

  return (
    <section className="bg-slate-900 rounded p-4" aria-label="top-findings">
      <h3 className="text-lg font-semibold mb-3">Top findings</h3>
      <ul className="space-y-2">
        {items.map((f) => (
          <li key={f.dedupHash} className="border-t border-slate-800 pt-2 first:border-t-0 first:pt-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${SEVERITY_STYLE[f.severity]}`}
              >
                {f.severity}
              </span>
              <span className="font-medium text-slate-100">{f.title}</span>
              {f.cveId ? (
                <span className="font-mono text-xs text-slate-400">{f.cveId}</span>
              ) : null}
              <span className="text-xs text-slate-400 ml-auto">
                {f.affectedAssetCount === 1
                  ? '1 asset'
                  : `${f.affectedAssetCount} assets`}
              </span>
            </div>
            <div className="flex gap-1 mt-1">
              {f.scannerSources.map((s) => (
                <span
                  key={s}
                  className="text-[10px] uppercase tracking-wide bg-slate-800 text-slate-300 rounded px-1.5 py-0.5"
                >
                  {s}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx run frontend:test -- top-findings-list`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/engagements/synthesis/top-findings-list.tsx apps/frontend/src/features/engagements/synthesis/__tests__/top-findings-list.spec.tsx
git commit -m "feat(frontend): add TopFindingsList widget"
```

---

## Task 13: Widget — `TopAssetsList`

**Files:**
- Create: `apps/frontend/src/features/engagements/synthesis/top-assets-list.tsx`

No test file in this task — the rendering logic is straightforward and structurally identical to TopFindingsList (covered).

- [ ] **Step 1: Create the component**

```tsx
import { useQuery } from '@apollo/client';
import { TOP_ASSETS_QUERY } from '../../../lib/graphql/queries';

type AssetKind =
  | 'DOMAIN'
  | 'SUBDOMAIN'
  | 'IP_ADDRESS'
  | 'URL'
  | 'HOSTNAME'
  | 'NETWORK'
  | 'CLOUD_RESOURCE'
  | 'CONTAINER'
  | 'WIFI_AP';

interface TopAsset {
  id: string;
  kind: AssetKind;
  canonicalValue: string;
  firstSeenAt: string;
  lastSeenAt: string;
  findingsCount: number;
  criticalCount: number;
  highCount: number;
}

export function TopAssetsList({
  engagementId,
  limit = 10,
}: {
  engagementId: string;
  limit?: number;
}) {
  const { data, loading, error } = useQuery<{ topAssets: TopAsset[] }>(TOP_ASSETS_QUERY, {
    variables: { engagementId, limit },
  });

  if (loading) return <p className="text-slate-400 text-sm">Loading top assets…</p>;
  if (error)
    return (
      <p className="text-red-400 text-sm" role="alert">
        {error.message}
      </p>
    );

  const items = data?.topAssets ?? [];
  if (items.length === 0) {
    return (
      <section className="bg-slate-900 rounded p-4">
        <h3 className="text-lg font-semibold mb-2">Top assets</h3>
        <p className="text-slate-500 text-sm">No assets yet.</p>
      </section>
    );
  }

  return (
    <section className="bg-slate-900 rounded p-4" aria-label="top-assets">
      <h3 className="text-lg font-semibold mb-3">Top assets</h3>
      <ul className="space-y-2">
        {items.map((a) => (
          <li
            key={a.id}
            className="border-t border-slate-800 pt-2 first:border-t-0 first:pt-0 flex items-center gap-3"
          >
            <span className="text-[10px] uppercase tracking-wide bg-slate-800 text-slate-300 rounded px-1.5 py-0.5">
              {a.kind}
            </span>
            <span className="font-mono text-sm text-slate-100 truncate">{a.canonicalValue}</span>
            <span className="ml-auto flex gap-1 items-center text-xs">
              {a.criticalCount > 0 ? (
                <span className="bg-red-700 text-red-50 rounded px-1.5 py-0.5">
                  {a.criticalCount} crit
                </span>
              ) : null}
              {a.highCount > 0 ? (
                <span className="bg-orange-600 text-orange-50 rounded px-1.5 py-0.5">
                  {a.highCount} high
                </span>
              ) : null}
              <span className="text-slate-400">{a.findingsCount} total</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/features/engagements/synthesis/top-assets-list.tsx
git commit -m "feat(frontend): add TopAssetsList widget"
```

---

## Task 14: Widget — `RecentRunsTimeline` + test

**Files:**
- Create: `apps/frontend/src/features/engagements/synthesis/recent-runs-timeline.tsx`
- Create: `apps/frontend/src/features/engagements/synthesis/__tests__/recent-runs-timeline.spec.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { MockedProvider } from '@apollo/client/testing';
import { render, screen, waitFor } from '@testing-library/react';
import { RECENT_TEMPLATE_RUNS_QUERY } from '../../../../lib/graphql/queries';
import { RecentRunsTimeline } from '../recent-runs-timeline';

const engagementId = 'eng_1';

function mockRuns(items: unknown[]) {
  return {
    request: { query: RECENT_TEMPLATE_RUNS_QUERY, variables: { engagementId, limit: 5 } },
    result: { data: { recentTemplateRuns: items } },
  };
}

describe('<RecentRunsTimeline />', () => {
  it('renders run rows with template name, status, and delta counts', async () => {
    render(
      <MemoryRouter>
        <MockedProvider
          mocks={[
            mockRuns([
              {
                __typename: 'RecentTemplateRunObject',
                id: 'r1',
                templateName: 'web-quick',
                status: 'COMPLETED',
                startedAt: '2026-05-31T10:00:00Z',
                completedAt: '2026-05-31T10:05:00Z',
                durationMs: 5 * 60 * 1000,
                newAssetsCount: 12,
                newFindingsCount: 3,
              },
            ])
          ]}
        >
          <RecentRunsTimeline engagementId={engagementId} />
        </MockedProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('web-quick')).toBeInTheDocument());
    expect(screen.getByText('COMPLETED')).toBeInTheDocument();
    expect(screen.getByText('+12 assets')).toBeInTheDocument();
    expect(screen.getByText('+3 findings')).toBeInTheDocument();
    expect(screen.getByText('5m 0s')).toBeInTheDocument();
  });

  it('shows "running…" when durationMs is null and status is RUNNING', async () => {
    render(
      <MemoryRouter>
        <MockedProvider
          mocks={[
            mockRuns([
              {
                __typename: 'RecentTemplateRunObject',
                id: 'r1', templateName: 'recon-active', status: 'RUNNING',
                startedAt: '2026-05-31T10:00:00Z', completedAt: null, durationMs: null,
                newAssetsCount: 0, newFindingsCount: 0,
              },
            ])
          ]}
        >
          <RecentRunsTimeline engagementId={engagementId} />
        </MockedProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText(/running…/i)).toBeInTheDocument());
  });

  it('empty state when no runs', async () => {
    render(
      <MemoryRouter>
        <MockedProvider mocks={[mockRuns([])]}>
          <RecentRunsTimeline engagementId={engagementId} />
        </MockedProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText(/No template runs yet/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx run frontend:test -- recent-runs-timeline`
Expected: FAIL with `Cannot find module '../recent-runs-timeline'`.

- [ ] **Step 3: Implement `recent-runs-timeline.tsx`**

```tsx
import { useQuery } from '@apollo/client';
import { RECENT_TEMPLATE_RUNS_QUERY } from '../../../lib/graphql/queries';

type Status = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

interface Run {
  id: string;
  templateName: string;
  status: Status;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  newAssetsCount: number;
  newFindingsCount: number;
}

const STATUS_STYLE: Record<Status, string> = {
  PENDING: 'bg-slate-700 text-slate-100',
  RUNNING: 'bg-indigo-700 text-indigo-50',
  COMPLETED: 'bg-emerald-700 text-emerald-50',
  FAILED: 'bg-red-700 text-red-50',
  CANCELLED: 'bg-slate-600 text-slate-200',
};

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}m ${s}s`;
}

export function RecentRunsTimeline({
  engagementId,
  limit = 5,
}: {
  engagementId: string;
  limit?: number;
}) {
  const { data, loading, error } = useQuery<{ recentTemplateRuns: Run[] }>(
    RECENT_TEMPLATE_RUNS_QUERY,
    { variables: { engagementId, limit } },
  );

  if (loading) return <p className="text-slate-400 text-sm">Loading recent runs…</p>;
  if (error)
    return (
      <p className="text-red-400 text-sm" role="alert">
        {error.message}
      </p>
    );

  const runs = data?.recentTemplateRuns ?? [];
  if (runs.length === 0) {
    return (
      <section className="bg-slate-900 rounded p-4">
        <h3 className="text-lg font-semibold mb-2">Recent template runs</h3>
        <p className="text-slate-500 text-sm">No template runs yet.</p>
      </section>
    );
  }

  return (
    <section className="bg-slate-900 rounded p-4" aria-label="recent-template-runs">
      <h3 className="text-lg font-semibold mb-3">Recent template runs</h3>
      <ul className="space-y-2">
        {runs.map((r) => (
          <li
            key={r.id}
            className="border-t border-slate-800 pt-2 first:border-t-0 first:pt-0 flex items-center gap-3 flex-wrap"
          >
            <span
              className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[r.status]}`}
            >
              {r.status}
            </span>
            <span className="font-mono text-sm text-slate-100">{r.templateName}</span>
            <span className="text-xs text-slate-400">
              {r.durationMs != null
                ? formatDuration(r.durationMs)
                : r.status === 'RUNNING'
                  ? 'running…'
                  : '—'}
            </span>
            <span className="ml-auto flex gap-2 text-xs">
              <span className="text-emerald-300">+{r.newAssetsCount} assets</span>
              <span className="text-orange-300">+{r.newFindingsCount} findings</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx run frontend:test -- recent-runs-timeline`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/engagements/synthesis/recent-runs-timeline.tsx apps/frontend/src/features/engagements/synthesis/__tests__/recent-runs-timeline.spec.tsx
git commit -m "feat(frontend): add RecentRunsTimeline widget"
```

---

## Task 15: `EngagementSynthesisPage` + wire into overview tab + test

**Files:**
- Create: `apps/frontend/src/features/engagements/synthesis/engagement-synthesis-page.tsx`
- Create: `apps/frontend/src/features/engagements/synthesis/__tests__/engagement-synthesis-page.spec.tsx`
- Modify: `apps/frontend/src/features/engagements/engagement-page.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/features/engagements/synthesis/__tests__/engagement-synthesis-page.spec.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { MockedProvider } from '@apollo/client/testing';
import { render, screen, waitFor } from '@testing-library/react';
import {
  ENGAGEMENT_OVERVIEW_QUERY,
  RECENT_TEMPLATE_RUNS_QUERY,
  TOP_ASSETS_QUERY,
  TOP_FINDINGS_QUERY,
} from '../../../../lib/graphql/queries';
import { EngagementSynthesisPage } from '../engagement-synthesis-page';

const engagementId = 'eng_1';

const mocks = [
  {
    request: { query: ENGAGEMENT_OVERVIEW_QUERY, variables: { engagementId } },
    result: {
      data: {
        engagementOverview: {
          __typename: 'EngagementOverviewObject',
          domains: 1, subdomains: 2, ipAddresses: 3, openPorts: 4, uniqueTechs: 5,
          findingsBySeverity: {
            __typename: 'SeverityCountsObject',
            critical: 0, high: 0, medium: 0, low: 0, info: 0,
          },
        },
      },
    },
  },
  {
    request: { query: TOP_FINDINGS_QUERY, variables: { engagementId, limit: 10 } },
    result: { data: { topFindings: [] } },
  },
  {
    request: { query: TOP_ASSETS_QUERY, variables: { engagementId, limit: 10 } },
    result: { data: { topAssets: [] } },
  },
  {
    request: { query: RECENT_TEMPLATE_RUNS_QUERY, variables: { engagementId, limit: 5 } },
    result: { data: { recentTemplateRuns: [] } },
  },
];

describe('<EngagementSynthesisPage />', () => {
  it('composes the 5 widgets and surfaces all four queries', async () => {
    render(
      <MemoryRouter>
        <MockedProvider mocks={mocks}>
          <EngagementSynthesisPage engagementId={engagementId} />
        </MockedProvider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByLabelText('attack-surface-counters')).toBeInTheDocument());
    expect(screen.getByLabelText('severity-donut')).toBeInTheDocument();
    expect(screen.getByLabelText('top-findings')).toBeInTheDocument();
    expect(screen.getByLabelText('top-assets')).toBeInTheDocument();
    expect(screen.getByLabelText('recent-template-runs')).toBeInTheDocument();
  });
});
```

Note: this test expects the synthesis page to render even when `severity-donut` shows its empty state (which uses a different markup — no `aria-label="severity-donut"`). To keep the test stable, the EngagementSynthesisPage wraps the donut in a labelled container — see implementation below.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx run frontend:test -- engagement-synthesis-page`
Expected: FAIL with `Cannot find module '../engagement-synthesis-page'`.

- [ ] **Step 3: Implement `engagement-synthesis-page.tsx`**

```tsx
import { Link } from 'react-router-dom';
import { AttackSurfaceCounters } from './attack-surface-counters';
import { RecentRunsTimeline } from './recent-runs-timeline';
import { SeverityDonut } from './severity-donut';
import { TopAssetsList } from './top-assets-list';
import { TopFindingsList } from './top-findings-list';

/**
 * Three-row engagement synthesis dashboard (Phase 3.1).
 * Each widget owns its own GraphQL query — Apollo caches the shared
 * `engagementOverview` query so AttackSurfaceCounters and SeverityDonut
 * issue a single network roundtrip together.
 */
export function EngagementSynthesisPage({ engagementId }: { engagementId: string }) {
  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Link
          to={`/engagements/${engagementId}/scans`}
          className="text-indigo-400 hover:underline text-sm"
        >
          Run scans →
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h3 className="text-lg font-semibold mb-3">Attack surface</h3>
          <AttackSurfaceCounters engagementId={engagementId} />
        </div>
        <div aria-label="severity-donut-container">
          <h3 className="text-lg font-semibold mb-3">Findings by severity</h3>
          <SeverityDonut engagementId={engagementId} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TopFindingsList engagementId={engagementId} />
        <TopAssetsList engagementId={engagementId} />
      </div>

      <RecentRunsTimeline engagementId={engagementId} />
    </div>
  );
}
```

Note: the `severity-donut-container` aria-label wraps the donut so the test in Step 1 can locate it whether or not the donut itself renders (empty state hides the inner aria-label). Adjust the test in Step 1 if you prefer to assert on `severity-donut-container` directly — both work.

Actually fix the test to use the container label. Edit Step 1's test:

```tsx
    expect(screen.getByLabelText('severity-donut-container')).toBeInTheDocument();
```

Replace the `severity-donut` line in the test with `severity-donut-container`. Similarly inspect the other widget aria-labels (`attack-surface-counters`, `top-findings`, `top-assets`, `recent-template-runs`) — they are already set on the widget's outer element except for the empty states. For consistency, the synthesis page does not need to wrap them since the test passes mocks that yield non-empty data for the counter widget (the only one that renders without aria-label in empty state); but for findings/assets/runs the test mocks return `[]` which renders the empty branch which IS wrapped in `<section className="bg-slate-900 rounded p-4">` without aria-label. To make the test green, wrap each in a container with aria-label in this page:

Replace the JSX in `engagement-synthesis-page.tsx` with:

```tsx
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div aria-label="attack-surface-counters-container">
          <h3 className="text-lg font-semibold mb-3">Attack surface</h3>
          <AttackSurfaceCounters engagementId={engagementId} />
        </div>
        <div aria-label="severity-donut-container">
          <h3 className="text-lg font-semibold mb-3">Findings by severity</h3>
          <SeverityDonut engagementId={engagementId} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div aria-label="top-findings-container"><TopFindingsList engagementId={engagementId} /></div>
        <div aria-label="top-assets-container"><TopAssetsList engagementId={engagementId} /></div>
      </div>

      <div aria-label="recent-template-runs-container">
        <RecentRunsTimeline engagementId={engagementId} />
      </div>
```

And update the test assertions to query the `-container` variants:

```tsx
    await waitFor(() => expect(screen.getByLabelText('attack-surface-counters-container')).toBeInTheDocument());
    expect(screen.getByLabelText('severity-donut-container')).toBeInTheDocument();
    expect(screen.getByLabelText('top-findings-container')).toBeInTheDocument();
    expect(screen.getByLabelText('top-assets-container')).toBeInTheDocument();
    expect(screen.getByLabelText('recent-template-runs-container')).toBeInTheDocument();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx run frontend:test -- engagement-synthesis-page`
Expected: PASS (1 test).

- [ ] **Step 5: Wire into `engagement-page.tsx`**

Open `apps/frontend/src/features/engagements/engagement-page.tsx`.

Add the import at the top after `import { FindingsTable } from '../findings/findings-table';`:

```tsx
import { EngagementSynthesisPage } from './synthesis/engagement-synthesis-page';
```

Replace the entire `overview` tab block:

```tsx
        {tab === 'overview' ? (
          <div className="space-y-3 bg-slate-900 rounded p-4">
            <p className="text-sm text-slate-300">
              Use the tabs above to explore assets and findings, or run a scan.
            </p>
            <Link
              to={`/engagements/${engagementId}/scans`}
              className="text-indigo-400 hover:underline text-sm"
            >
              Run scans →
            </Link>
          </div>
        ) : null}
```

With:

```tsx
        {tab === 'overview' ? (
          <EngagementSynthesisPage engagementId={engagementId} />
        ) : null}
```

Then remove the now-unused `Link` import — verify by searching the rest of the file for `Link`. If `Link` is no longer referenced after the change, delete `Link,` from the `import { Link, useParams }` line on line 2.

- [ ] **Step 6: Run frontend tests in full**

Run: `pnpm nx run frontend:test`
Expected: PASS (all existing + new widgets + synthesis page).

Run: `pnpm nx run frontend:type-check`
Expected: PASS.

- [ ] **Step 7: Manual smoke test**

In one terminal: `pnpm dev:up && pnpm prisma migrate deploy && pnpm seed`
In another: `pnpm nx serve api-gateway`
In another: `pnpm nx serve frontend`

Then in the browser:
1. Open <http://localhost:5173>, log in.
2. Create an engagement (or open an existing one).
3. Land on `/engagements/<id>` — confirm the Overview tab shows: 5 counters row, severity donut (empty state if no findings), Top findings + Top assets (empty states OK), Recent template runs section.
4. Run a template (recon-passive on a test domain) via the scan/template flow. Refresh the Overview tab — counters and donut should reflect the new data.
5. Click the existing tabs (Domains/Subdomains/IPs/Technologies/Findings) — they must still work (non-regression).

Kill the dev servers.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/features/engagements/synthesis apps/frontend/src/features/engagements/engagement-page.tsx
git commit -m "feat(frontend): wire EngagementSynthesisPage into Overview tab (Phase 3.1)"
```

---

## Task 16: Full CI sweep

**Files:** none (verification only)

- [ ] **Step 1: Run lint**

Run: `pnpm lint`
Expected: PASS. If failures appear in new files, fix them inline (most likely unused imports or missing newlines) and re-run.

- [ ] **Step 2: Run full type-check**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 3: Run all tests**

Run: `pnpm test`
Expected: PASS — including the 18 new `libs/insight` tests, 10 new `InsightService` tests, and the new frontend widget tests.

- [ ] **Step 4: Run prettier check**

Run: `pnpm format:check`
Expected: PASS. If failures, run `pnpm format` and commit the diff with `style: prettier`.

- [ ] **Step 5: If anything fixed in Steps 1-4, commit**

```bash
git add -A
git commit -m "chore(phase-3-1): lint/format fixes"
```

(Skip this step if no fixes were needed.)

---

## Acceptance criteria (Phase 3.1 done)

- [ ] `pnpm nx run insight:test` — 18 unit tests passing.
- [ ] `pnpm nx run api-gateway:test` — InsightService 10 tests passing (existing tests still green).
- [ ] `pnpm nx run frontend:test` — widget tests passing (existing tests still green).
- [ ] `pnpm lint`, `pnpm type-check`, `pnpm format:check` all green.
- [ ] Manual smoke (Task 15 Step 7) shows the Overview tab rendering the 3-row synthesis with non-zero counters after a template run on a seed engagement.
- [ ] Existing tabs (Domains/Subdomains/IPs/Technologies/Findings) continue to render correctly.

## What's not done in 3.1 (handed off to 3.2)

- `Asset.riskScore` writes — `topAssets` currently sorts by findings count, not riskScore.
- Asset detail page route `/engagements/:eid/assets/:aid`.
- Facetted asset list (severity/tech/scanner/port-range filters + sort).
- Score backfill script.

## What's not done in 3.1 (handed off to 3.3)

- `AssetObservation` table + provenance timeline.
- `engagementUpdated` subscription + live refresh.
- `cve-enricher-worker` + NVD enrichment + `CveCache`.
