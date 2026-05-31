# Phase 3.2 — riskScore + Asset List Scorée + Asset Detail — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activate Asset.riskScore writes from parser-worker, expose filtered/sorted assets + facets + asset detail via GraphQL, and ship the frontend asset detail page (4 tabs) + facet panel + riskScore column.

**Architecture:** Pure-function risk score in `libs/correlation/risk-score.ts` (no NestJS deps); a `recomputeRiskScoreForAsset` helper invoked from `parser-worker` persisters in the same `prisma.$transaction`, with retry-once on serialization conflict; new GraphQL inputs/queries (`AssetFilters`, `AssetSort`, `assetFacets`, `asset(id): AssetDetail`); 6 React components under `features/assets/` + 1 route in `app.tsx`.

**Tech Stack:** NestJS 11, @nestjs/graphql 13 (code-first), Prisma 6, Apollo Client 3, React 18, Tailwind 3, Jest 29 (backend), Vitest + Testing Library (frontend).

---

## Authoritative References

- Spec: `docs/superpowers/specs/2026-05-31-phase-3-correlation-dashboard-design.md` §3.2 and §2.2.
- Model plan: `docs/superpowers/plans/2026-05-31-phase-3-1-engagement-synthesis.md`.

## Pre-flight Notes (read once, applies to all tasks)

- `Asset.riskScore Float @default(0)` already exists at `prisma/schema.prisma:138-167`. **No migration in 3.2.**
- Severity enum values: `INFO, LOW, MEDIUM, HIGH, CRITICAL`. There is no `deletedAt` column on `Finding`; sum all rows.
- `Port.state` enum has `OPEN, CLOSED, FILTERED, OPEN_FILTERED, CLOSED_FILTERED, UNFILTERED`. The sensitive-port bonus counts only `state=OPEN`.
- **Naming collision warning:** an `asset(id)` query already exists on `AssetsResolver` (`apps/api-gateway/src/app/assets/assets.resolver.ts`) returning `AssetObject` (Phase 1 type). To avoid breaking the existing frontend query that uses it via `ASSETS_QUERY`, the new query in this phase is named **`assetDetail(id: ID!): AssetDetail!`** rather than `asset(id)`. Spec §3.2 deliverable 5 wording is preserved in spirit: same shape, different name. Update the frontend's `ASSET_DETAIL_QUERY` accordingly.
- Mirror `libs/insight/` for tests (`src/__tests__/*.spec.ts`). `libs/correlation/` already has `src/__tests__/`.
- `pnpm prisma:script <name>` does not exist. Add a `package.json` script `"recompute:risk-scores": "tsx prisma/scripts/recompute-risk-scores.ts"`.

---

## Task 1: Scaffold `libs/correlation/src/risk-score.ts` + index re-export

**Files:**
- Create: `libs/correlation/src/risk-score.ts`
- Modify: `libs/correlation/src/index.ts` (add export)

Per spec §2.2 the file is a pure module. This task creates the empty surface so dependents compile.

- [ ] **Step 1: Create `libs/correlation/src/risk-score.ts` skeleton**

```ts
import type { PortState, Severity } from '@prisma/client';

/** Inputs the risk-score formula consumes. Decoupled from Prisma row shapes
 *  so callers (parser-worker + backfill script) can pass any equivalent
 *  projection. */
export interface RiskScoreInput {
  findings: ReadonlyArray<{ severity: Severity; cveId: string | null }>;
  ports: ReadonlyArray<{
    number: number;
    state: PortState;
    services: ReadonlyArray<{ name: string | null; product: string | null }>;
  }>;
}

export const SENSITIVE_PORTS: ReadonlySet<number> = new Set([
  22, 23, 445, 1433, 3306, 3389, 5432, 5900, 6379,
]);

export const ADMIN_TOKENS: ReadonlyArray<string> = [
  'admin',
  'phpmyadmin',
  'jenkins',
  'kibana',
  'grafana',
  'prometheus',
];

export function computeRiskScore(_input: RiskScoreInput): number {
  // Implemented in Task 2.
  return 0;
}
```

- [ ] **Step 2: Re-export from `libs/correlation/src/index.ts`**

Add to the existing exports (append below `CorrelationModule` line):

```ts
export { computeRiskScore, SENSITIVE_PORTS, ADMIN_TOKENS } from './risk-score';
export type { RiskScoreInput } from './risk-score';
```

- [ ] **Step 3: Type-check**

Run: `pnpm nx run correlation:type-check`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add libs/correlation/src/risk-score.ts libs/correlation/src/index.ts
git commit -m "feat(correlation): scaffold risk-score module"
```

---

## Task 2: Implement `computeRiskScore` (pure function)

**Files:**
- Modify: `libs/correlation/src/risk-score.ts`

Per spec §2.2 the formula is **verbatim**:

```
score(asset) =
    findings_weight     // 10*CRITICAL + 5*HIGH + 2*MEDIUM + 0.5*LOW + 0*INFO  (somme sur findings non-soft-deleted)
  + sensitive_port_bonus // +2 par port parmi {22, 23, 445, 1433, 3306, 3389, 5432, 5900, 6379}
  + exposed_admin_bonus  // +3 si un Service.name|product contient un token parmi {admin, phpmyadmin, jenkins, kibana, grafana, prometheus}
  + cve_bonus            // +1 par finding avec cveId distinct
```

Notes:
- "non-soft-deleted": `Finding` has no `deletedAt` column today; sum all rows the caller passes.
- "+3 si un Service…": single +3 bonus per asset (not per matching service). One match triggers it.
- Sensitive-port bonus: only `state === 'OPEN'`. Each distinct sensitive port number adds +2 once.
- CVE bonus: `+1 × |distinct non-null cveId values|`.

- [ ] **Step 1: Write the failing tests** (full file `libs/correlation/src/__tests__/risk-score.spec.ts`)

```ts
import { computeRiskScore, type RiskScoreInput } from '../risk-score';

const empty: RiskScoreInput = { findings: [], ports: [] };

describe('computeRiskScore', () => {
  it('returns 0 for an asset with no findings and no ports', () => {
    expect(computeRiskScore(empty)).toBe(0);
  });

  it('weights findings: CRITICAL=10, HIGH=5, MEDIUM=2, LOW=0.5, INFO=0', () => {
    const score = computeRiskScore({
      ports: [],
      findings: [
        { severity: 'CRITICAL', cveId: null },
        { severity: 'HIGH', cveId: null },
        { severity: 'MEDIUM', cveId: null },
        { severity: 'LOW', cveId: null },
        { severity: 'INFO', cveId: null },
      ],
    });
    expect(score).toBe(10 + 5 + 2 + 0.5 + 0);
  });

  it('adds +2 per distinct OPEN sensitive port (22, 23, 445, 1433, 3306, 3389, 5432, 5900, 6379)', () => {
    const ports = [22, 3389, 6379].map((number) => ({
      number,
      state: 'OPEN' as const,
      services: [],
    }));
    expect(computeRiskScore({ findings: [], ports })).toBe(6);
  });

  it('does NOT count sensitive port bonus when the port is not OPEN', () => {
    expect(
      computeRiskScore({
        findings: [],
        ports: [{ number: 22, state: 'FILTERED', services: [] }],
      }),
    ).toBe(0);
  });

  it('does NOT count non-sensitive ports', () => {
    expect(
      computeRiskScore({
        findings: [],
        ports: [{ number: 80, state: 'OPEN', services: [] }],
      }),
    ).toBe(0);
  });

  it('adds +3 once when a Service.name or Service.product contains an admin token', () => {
    const score = computeRiskScore({
      findings: [],
      ports: [
        {
          number: 8080,
          state: 'OPEN',
          services: [{ name: null, product: 'Jenkins LTS 2.426' }],
        },
      ],
    });
    expect(score).toBe(3);
  });

  it('admin token match is case-insensitive', () => {
    const score = computeRiskScore({
      findings: [],
      ports: [
        {
          number: 3000,
          state: 'OPEN',
          services: [{ name: 'GRAFANA', product: null }],
        },
      ],
    });
    expect(score).toBe(3);
  });

  it('admin bonus is a one-shot +3 even with multiple matching services', () => {
    const score = computeRiskScore({
      findings: [],
      ports: [
        {
          number: 3000,
          state: 'OPEN',
          services: [
            { name: 'grafana', product: null },
            { name: 'phpmyadmin', product: 'admin-panel' },
          ],
        },
      ],
    });
    expect(score).toBe(3);
  });

  it('adds +1 per distinct non-null cveId', () => {
    const score = computeRiskScore({
      ports: [],
      findings: [
        { severity: 'INFO', cveId: 'CVE-2024-0001' },
        { severity: 'INFO', cveId: 'CVE-2024-0002' },
        { severity: 'INFO', cveId: 'CVE-2024-0001' }, // duplicate -> ignored
        { severity: 'INFO', cveId: null },
      ],
    });
    expect(score).toBe(2);
  });

  it('combined: 1 CRITICAL + 1 HIGH + sensitive port 22 + grafana service + 1 distinct CVE = 10+5+2+3+1 = 21', () => {
    const score = computeRiskScore({
      findings: [
        { severity: 'CRITICAL', cveId: 'CVE-2024-9999' },
        { severity: 'HIGH', cveId: null },
      ],
      ports: [
        { number: 22, state: 'OPEN', services: [{ name: 'ssh', product: null }] },
        { number: 3000, state: 'OPEN', services: [{ name: 'grafana', product: null }] },
      ],
    });
    expect(score).toBe(21);
  });

  it('is idempotent: same input produces same output', () => {
    const input: RiskScoreInput = {
      findings: [{ severity: 'HIGH', cveId: 'CVE-2024-1' }],
      ports: [{ number: 22, state: 'OPEN', services: [] }],
    };
    expect(computeRiskScore(input)).toBe(computeRiskScore(input));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm nx test correlation -t "computeRiskScore"`
Expected: FAIL — the stub returns 0 for every case so the weighted, port, admin, cve, and combined cases all fail.

- [ ] **Step 3: Implement `computeRiskScore` in `libs/correlation/src/risk-score.ts`**

Replace the stub body. Full updated file:

```ts
import type { PortState, Severity } from '@prisma/client';

export interface RiskScoreInput {
  findings: ReadonlyArray<{ severity: Severity; cveId: string | null }>;
  ports: ReadonlyArray<{
    number: number;
    state: PortState;
    services: ReadonlyArray<{ name: string | null; product: string | null }>;
  }>;
}

export const SENSITIVE_PORTS: ReadonlySet<number> = new Set([
  22, 23, 445, 1433, 3306, 3389, 5432, 5900, 6379,
]);

export const ADMIN_TOKENS: ReadonlyArray<string> = [
  'admin',
  'phpmyadmin',
  'jenkins',
  'kibana',
  'grafana',
  'prometheus',
];

const SEVERITY_WEIGHT: Record<Severity, number> = {
  CRITICAL: 10,
  HIGH: 5,
  MEDIUM: 2,
  LOW: 0.5,
  INFO: 0,
};

function findingsWeight(findings: RiskScoreInput['findings']): number {
  let total = 0;
  for (const f of findings) total += SEVERITY_WEIGHT[f.severity];
  return total;
}

function sensitivePortBonus(ports: RiskScoreInput['ports']): number {
  const matched = new Set<number>();
  for (const p of ports) {
    if (p.state === 'OPEN' && SENSITIVE_PORTS.has(p.number)) matched.add(p.number);
  }
  return matched.size * 2;
}

function exposedAdminBonus(ports: RiskScoreInput['ports']): number {
  for (const p of ports) {
    for (const s of p.services) {
      const hay = `${(s.name ?? '').toLowerCase()} ${(s.product ?? '').toLowerCase()}`;
      for (const tok of ADMIN_TOKENS) {
        if (hay.includes(tok)) return 3;
      }
    }
  }
  return 0;
}

function cveBonus(findings: RiskScoreInput['findings']): number {
  const seen = new Set<string>();
  for (const f of findings) if (f.cveId) seen.add(f.cveId);
  return seen.size;
}

export function computeRiskScore(input: RiskScoreInput): number {
  return (
    findingsWeight(input.findings) +
    sensitivePortBonus(input.ports) +
    exposedAdminBonus(input.ports) +
    cveBonus(input.findings)
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm nx test correlation -t "computeRiskScore"`
Expected: PASS — all 10 cases green.

- [ ] **Step 5: Commit**

```bash
git add libs/correlation/src/risk-score.ts libs/correlation/src/__tests__/risk-score.spec.ts
git commit -m "feat(correlation): implement computeRiskScore pure function per spec §2.2"
```

---

## Task 3: `recomputeRiskScoreForAsset` helper (read-modify-write)

**Files:**
- Create: `libs/correlation/src/recompute-risk-score.ts`
- Modify: `libs/correlation/src/index.ts` (add export)

Per spec §3.2 deliverable 2 the helper is called inside the same transaction as the persister upsert. Signature accepts a `PrismaClient | Prisma.TransactionClient` so it composes with `prisma.$transaction(async (tx) => …)`.

- [ ] **Step 1: Write the failing test** (`libs/correlation/src/__tests__/recompute-risk-score.spec.ts`)

```ts
import type { PrismaClient } from '@prisma/client';
import { recomputeRiskScoreForAsset } from '../recompute-risk-score';

describe('recomputeRiskScoreForAsset', () => {
  it('throws when the asset is not found', async () => {
    const prisma = {
      asset: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
    } as unknown as PrismaClient;

    await expect(recomputeRiskScoreForAsset(prisma, 'missing')).rejects.toThrow(
      /Asset not found: missing/,
    );
    expect((prisma.asset as unknown as { update: jest.Mock }).update).not.toHaveBeenCalled();
  });

  it('writes the computed score back to Asset.riskScore', async () => {
    const prisma = {
      asset: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'a1',
          findings: [{ severity: 'CRITICAL', cveId: 'CVE-2024-1' }],
          ports: [{ number: 22, state: 'OPEN', services: [{ name: 'ssh', product: null }] }],
        }),
        update: jest.fn().mockResolvedValue({ id: 'a1' }),
      },
    } as unknown as PrismaClient;

    const score = await recomputeRiskScoreForAsset(prisma, 'a1');

    expect(score).toBe(10 + 2 + 1); // crit + sensitive port + cve
    expect(
      (prisma.asset as unknown as { update: jest.Mock }).update,
    ).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { riskScore: 13 },
    });
  });

  it('queries findings (severity, cveId) and ports.services (name, product) and ports.state/number', () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: 'a1',
      findings: [],
      ports: [],
    });
    const prisma = {
      asset: { findUnique, update: jest.fn().mockResolvedValue({ id: 'a1' }) },
    } as unknown as PrismaClient;

    return recomputeRiskScoreForAsset(prisma, 'a1').then(() => {
      expect(findUnique).toHaveBeenCalledWith({
        where: { id: 'a1' },
        select: {
          id: true,
          findings: { select: { severity: true, cveId: true } },
          ports: {
            select: {
              number: true,
              state: true,
              services: { select: { name: true, product: true } },
            },
          },
        },
      });
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm nx test correlation -t "recomputeRiskScoreForAsset"`
Expected: FAIL — module does not exist yet.

- [ ] **Step 3: Implement `libs/correlation/src/recompute-risk-score.ts`**

```ts
import type { Prisma, PrismaClient } from '@prisma/client';
import { computeRiskScore } from './risk-score';

export type PrismaLike = PrismaClient | Prisma.TransactionClient;

/**
 * Recompute Asset.riskScore using the formula in `libs/correlation/risk-score.ts`.
 * Read-modify-write. Caller is expected to wrap this in the same transaction as
 * the persister upsert (see parser-worker for the retry-on-P2034 pattern).
 *
 * Throws if the asset id is unknown. Does not soft-delete-check (callers in
 * parser-worker are always operating on the asset they just upserted; the
 * backfill script filters `deletedAt = null` before iterating).
 */
export async function recomputeRiskScoreForAsset(
  prisma: PrismaLike,
  assetId: string,
): Promise<number> {
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    select: {
      id: true,
      findings: { select: { severity: true, cveId: true } },
      ports: {
        select: {
          number: true,
          state: true,
          services: { select: { name: true, product: true } },
        },
      },
    },
  });
  if (!asset) throw new Error(`Asset not found: ${assetId}`);

  const score = computeRiskScore({
    findings: asset.findings,
    ports: asset.ports,
  });

  await prisma.asset.update({
    where: { id: assetId },
    data: { riskScore: score },
  });

  return score;
}
```

Add to `libs/correlation/src/index.ts`:

```ts
export { recomputeRiskScoreForAsset } from './recompute-risk-score';
export type { PrismaLike } from './recompute-risk-score';
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm nx test correlation -t "recomputeRiskScoreForAsset"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add libs/correlation/src/recompute-risk-score.ts libs/correlation/src/__tests__/recompute-risk-score.spec.ts libs/correlation/src/index.ts
git commit -m "feat(correlation): add recomputeRiskScoreForAsset helper"
```

---

## Task 4: Refactor `FindingPersister` to accept optional `tx` and recompute riskScore transactionally

**Files:**
- Modify: `apps/parser-worker/src/app/persisters/finding-persister.ts`
- Modify: `apps/parser-worker/src/app/parse-job.processor.ts:194-235`
- Test: `apps/parser-worker/src/app/__tests__/finding-persister.spec.ts`

Per spec §3.2 deliverable 2: "Transactionnel + retry une fois sur conflit." Wrap `findingPersister.upsert(...)` + `recomputeRiskScoreForAsset(tx, assetId)` in `prisma.$transaction`. On Prisma `P2034` retry once; on second failure rethrow.

- [ ] **Step 1: Write the failing test (`apps/parser-worker/src/app/__tests__/finding-persister.spec.ts`)**

```ts
import { Prisma } from '@prisma/client';
import { FindingPersister } from '../persisters/finding-persister';

describe('FindingPersister.upsert', () => {
  it('uses the injected tx client when provided', async () => {
    const tx = {
      finding: { upsert: jest.fn().mockResolvedValue({ id: 'f1' }) },
    };
    const prisma = { finding: { upsert: jest.fn() } } as never;
    const persister = new FindingPersister(prisma);

    await persister.upsert(
      'job1',
      'asset1',
      {
        scannerName: 'nuclei',
        templateId: 'tpl',
        title: 'A finding',
        severity: 'HIGH',
        location: 'https://x',
        cveId: null,
        evidence: {},
      } as never,
      'x',
      tx as unknown as Prisma.TransactionClient,
    );

    expect(tx.finding.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.finding.upsert).not.toHaveBeenCalled();
  });

  it('falls back to this.prisma when no tx is passed', async () => {
    const prisma = { finding: { upsert: jest.fn().mockResolvedValue({ id: 'f1' }) } } as never;
    const persister = new FindingPersister(prisma);

    await persister.upsert(
      'job1',
      'asset1',
      {
        scannerName: 'nuclei',
        templateId: 'tpl',
        title: 't',
        severity: 'LOW',
        location: 'https://x',
        cveId: null,
        evidence: {},
      } as never,
      'x',
    );

    expect((prisma as { finding: { upsert: jest.Mock } }).finding.upsert).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm nx test parser-worker -t "FindingPersister"`
Expected: FAIL — `upsert` signature does not accept `tx`.

- [ ] **Step 3: Refactor the persister (`apps/parser-worker/src/app/persisters/finding-persister.ts`)**

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@autoscanner/database';
import { findingDedupHash } from '@autoscanner/correlation';
import type { NormalizedFinding } from '@autoscanner/parsers';
import type { Prisma } from '@prisma/client';

@Injectable()
export class FindingPersister {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(
    scanJobId: string,
    assetId: string,
    finding: NormalizedFinding,
    assetCanonical: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const sig = finding.cveId ?? finding.templateId ?? finding.title;
    const dedupHash = findingDedupHash({
      scannerName: finding.scannerName,
      templateId: finding.templateId,
      assetCanonical,
      location: finding.location,
      signature: sig,
    });

    const now = new Date();
    const client = tx ?? this.prisma;
    await client.finding.upsert({
      where: { assetId_dedupHash: { assetId, dedupHash } },
      create: {
        assetId,
        scanJobId,
        dedupHash,
        title: finding.title,
        severity: finding.severity,
        location: finding.location,
        cveId: finding.cveId,
        templateId: finding.templateId,
        evidence: finding.evidence as never,
        firstSeenAt: now,
        lastSeenAt: now,
      },
      update: { lastSeenAt: now },
    });
  }
}
```

- [ ] **Step 4: Wire the call site in `parse-job.processor.ts`**

Locate the `for (const finding of out.findings)` loop (currently lines 194-235). Replace the single line `await this.findingPersister.upsert(...)` with a transactional call + retry helper. Add this private method on the class:

```ts
private async withRetryOnSerializationConflict<T>(
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034') {
      this.logger.warn('P2034 serialization conflict; retrying once');
      return await fn();
    }
    throw err;
  }
}
```

Add `import { Prisma } from '@prisma/client';` and `import { recomputeRiskScoreForAsset } from '@autoscanner/correlation';` to the imports.

Replace the finding upsert site:

```ts
await this.withRetryOnSerializationConflict(() =>
  this.prisma.$transaction(async (tx) => {
    await this.findingPersister.upsert(
      payload.scanJobId,
      assetId!,
      finding,
      canonicalHost ?? '',
      tx,
    );
    await recomputeRiskScoreForAsset(tx, assetId!);
  }),
);
findingsPersisted++;
```

- [ ] **Step 5: Run the test to verify it passes + parse-job integration tests**

Run: `pnpm nx test parser-worker`
Expected: PASS — persister unit test + existing parse-job tests.

- [ ] **Step 6: Commit**

```bash
git add apps/parser-worker/src/app/persisters/finding-persister.ts apps/parser-worker/src/app/parse-job.processor.ts apps/parser-worker/src/app/__tests__/finding-persister.spec.ts
git commit -m "feat(parser-worker): recompute riskScore on Finding upsert (tx + P2034 retry)"
```

---

## Task 5: Refactor `PortPersister` + wire recompute

**Files:**
- Modify: `apps/parser-worker/src/app/persisters/port-persister.ts`
- Modify: `apps/parser-worker/src/app/parse-job.processor.ts` (port loop)
- Test: `apps/parser-worker/src/app/__tests__/port-persister.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import type { Prisma } from '@prisma/client';
import { PortPersister } from '../persisters/port-persister';

describe('PortPersister.upsert', () => {
  it('uses tx when provided and returns the port id', async () => {
    const tx = {
      port: { upsert: jest.fn().mockResolvedValue({ id: 'p1' }) },
    };
    const persister = new PortPersister({ port: { upsert: jest.fn() } } as never);
    const id = await persister.upsert(
      'a1',
      { number: 22, protocol: 'TCP', state: 'OPEN' } as never,
      tx as unknown as Prisma.TransactionClient,
    );
    expect(id).toBe('p1');
    expect(tx.port.upsert).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run** — `pnpm nx test parser-worker -t "PortPersister"` — Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@autoscanner/database';
import type { NormalizedPort } from '@autoscanner/parsers';
import type { Prisma } from '@prisma/client';

@Injectable()
export class PortPersister {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(
    assetId: string,
    port: NormalizedPort,
    tx?: Prisma.TransactionClient,
  ): Promise<string> {
    const client = tx ?? this.prisma;
    const row = await client.port.upsert({
      where: {
        assetId_number_protocol: { assetId, number: port.number, protocol: port.protocol },
      },
      create: { assetId, number: port.number, protocol: port.protocol, state: port.state },
      update: { state: port.state, lastSeenAt: new Date() },
      select: { id: true },
    });
    return row.id;
  }
}
```

Wire the parse-job port loop:

```ts
for (const port of out.ports) {
  const assetId = assetIdByValue.get(port.assetValue.toLowerCase());
  if (!assetId) continue;
  const portId = await this.withRetryOnSerializationConflict(() =>
    this.prisma.$transaction(async (tx) => {
      const id = await this.portPersister.upsert(assetId, port, tx);
      await recomputeRiskScoreForAsset(tx, assetId);
      return id;
    }),
  );
  portIdByKey.set(portKey(port), portId);
  portsPersisted++;
}
```

- [ ] **Step 4: Run** — `pnpm nx test parser-worker` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/parser-worker/src/app/persisters/port-persister.ts apps/parser-worker/src/app/parse-job.processor.ts apps/parser-worker/src/app/__tests__/port-persister.spec.ts
git commit -m "feat(parser-worker): recompute riskScore on Port upsert (tx + retry)"
```

---

## Task 6: Refactor `ServicePersister` + wire recompute (look up port.assetId)

**Files:**
- Modify: `apps/parser-worker/src/app/persisters/service-persister.ts`
- Modify: `apps/parser-worker/src/app/parse-job.processor.ts` (service loop)
- Test: `apps/parser-worker/src/app/__tests__/service-persister.spec.ts`

The service-persister doesn't know `assetId`. The caller must resolve `port.assetId` inside the transaction and pass it to `recomputeRiskScoreForAsset`.

- [ ] **Step 1: Write the failing test**

```ts
import type { Prisma } from '@prisma/client';
import { ServicePersister } from '../persisters/service-persister';

describe('ServicePersister.upsert', () => {
  it('uses tx when provided (existing service path)', async () => {
    const tx = {
      service: {
        findFirst: jest.fn().mockResolvedValue({ id: 's1' }),
        update: jest.fn().mockResolvedValue({ id: 's1' }),
        create: jest.fn(),
      },
    };
    const persister = new ServicePersister({ service: {} } as never);

    await persister.upsert(
      'p1',
      { name: 'http', product: null, version: null, extraInfo: null, cpe: [] } as never,
      tx as unknown as Prisma.TransactionClient,
    );

    expect(tx.service.update).toHaveBeenCalledTimes(1);
    expect(tx.service.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run** — Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@autoscanner/database';
import type { NormalizedService } from '@autoscanner/parsers';
import type { Prisma } from '@prisma/client';

@Injectable()
export class ServicePersister {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(
    portId: string,
    svc: NormalizedService,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    const existing = await client.service.findFirst({
      where: {
        portId,
        name: svc.name ?? null,
        product: svc.product ?? null,
        version: svc.version ?? null,
      },
      select: { id: true },
    });
    if (existing) {
      await client.service.update({
        where: { id: existing.id },
        data: { lastSeenAt: new Date(), banner: svc.extraInfo ?? undefined, cpe: svc.cpe ?? [] },
      });
      return;
    }
    await client.service.create({
      data: {
        portId,
        name: svc.name,
        product: svc.product,
        version: svc.version,
        banner: svc.extraInfo,
        cpe: svc.cpe ?? [],
      },
    });
  }
}
```

Wire the parse-job service loop:

```ts
for (const svc of out.services) {
  const portId = portIdByKey.get(
    portKey({ assetValue: svc.assetValue, number: svc.portNumber, protocol: svc.protocol }),
  );
  if (!portId) continue;
  await this.withRetryOnSerializationConflict(() =>
    this.prisma.$transaction(async (tx) => {
      await this.servicePersister.upsert(portId, svc, tx);
      const port = await tx.port.findUnique({
        where: { id: portId },
        select: { assetId: true },
      });
      if (port) await recomputeRiskScoreForAsset(tx, port.assetId);
    }),
  );
  servicesPersisted++;
}
```

- [ ] **Step 4: Run** — `pnpm nx test parser-worker` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/parser-worker/src/app/persisters/service-persister.ts apps/parser-worker/src/app/parse-job.processor.ts apps/parser-worker/src/app/__tests__/service-persister.spec.ts
git commit -m "feat(parser-worker): recompute riskScore on Service upsert (tx + retry)"
```

---

## Task 7: Backfill script `prisma/scripts/recompute-risk-scores.ts`

**Files:**
- Create: `prisma/scripts/recompute-risk-scores.ts`
- Modify: `package.json` (scripts)

Per spec §3.2 deliverable 3 the backfill must be runnable manually post-deploy. Accept optional engagementId argv; iterate live assets in batches of 200.

- [ ] **Step 1: Create the script**

```ts
import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
loadEnv();

import { PrismaClient } from '@prisma/client';
import { recomputeRiskScoreForAsset } from '@autoscanner/correlation';

const BATCH = 200;

async function main(): Promise<void> {
  const engagementId = process.argv[2] ?? null;
  const prisma = new PrismaClient();

  // eslint-disable-next-line no-console
  console.log(
    `[recompute] starting${engagementId ? ` for engagement ${engagementId}` : ' for ALL engagements'}`,
  );

  let cursor: string | undefined;
  let processed = 0;
  for (;;) {
    const rows = await prisma.asset.findMany({
      where: { deletedAt: null, ...(engagementId ? { engagementId } : {}) },
      select: { id: true },
      take: BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { id: 'asc' },
    });
    if (rows.length === 0) break;
    for (const row of rows) {
      await recomputeRiskScoreForAsset(prisma, row.id);
      processed++;
    }
    cursor = rows[rows.length - 1]!.id;
    // eslint-disable-next-line no-console
    console.log(`[recompute] processed ${processed}`);
  }

  // eslint-disable-next-line no-console
  console.log(`[recompute] done, ${processed} assets updated`);
  await prisma.$disconnect();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Add npm script to `package.json`**

Insert under existing `"seed"` script:

```json
"recompute:risk-scores": "tsx prisma/scripts/recompute-risk-scores.ts"
```

- [ ] **Step 3: Smoke type-check**

Run: `pnpm tsc --noEmit prisma/scripts/recompute-risk-scores.ts`
Expected: PASS (no type errors).

- [ ] **Step 4: Commit**

```bash
git add prisma/scripts/recompute-risk-scores.ts package.json
git commit -m "feat(prisma): add recompute-risk-scores backfill script"
```

Usage: `pnpm recompute:risk-scores <engagementId>` or `pnpm recompute:risk-scores` for all.

---

## Task 8: Loosen `riskScore: 0` test assertions to `>= 0`

**Files:**
- Modify: `apps/api-gateway/src/app/assets/__tests__/unified-assets.service.spec.ts`

Per spec §3.2 "Régression à corriger". Grep verified only one spec file uses `riskScore`. The fixture row at line 38 (`riskScore: 0`) is *input* to the mocked `$queryRaw` — it stays as-is. There is no assertion `expect(...riskScore).toBe(0)` in the file, only `expect(result).toBe(fixture);` (reference equality). No change required there.

If a future spec does add a `riskScore` assertion, loosen to `expect.any(Number)` or `>= 0`.

- [ ] **Step 1: Grep again to confirm no `expect(... riskScore ...).toBe(0)` survives**

```bash
git grep -nE "riskScore.*toBe\(0\)|toBe\(0\).*riskScore" -- '*.spec.ts' '*.spec.tsx'
```
Expected output: empty.

- [ ] **Step 2: No-op commit if no changes are needed**

Skip the commit step if no diff. Otherwise relax with a one-line change.

---

## Task 9: Add `AssetSort` enum + `AssetFilters` input

**Files:**
- Create: `apps/api-gateway/src/app/assets/dto/asset-sort.enum.ts`
- Create: `apps/api-gateway/src/app/assets/dto/asset-filters.input.ts`

Per spec §3.2 deliverable 4. **Severity-has interpretation:** `severityHas: [Severity!]` means "asset has at least one finding with severity ∈ list". Empty array or null = no filter.

- [ ] **Step 1: Create `asset-sort.enum.ts`**

```ts
import { registerEnumType } from '@nestjs/graphql';

export enum AssetSort {
  RISK_SCORE = 'RISK_SCORE',
  FIRST_SEEN_AT = 'FIRST_SEEN_AT',
  LAST_SEEN_AT = 'LAST_SEEN_AT',
  CANONICAL_VALUE = 'CANONICAL_VALUE',
}

registerEnumType(AssetSort, { name: 'AssetSort' });
```

- [ ] **Step 2: Create `asset-filters.input.ts`**

```ts
import { Field, InputType, Int } from '@nestjs/graphql';
import { IsArray, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

import { Severity } from '../../findings/dto/severity.enum';

@InputType()
export class PortRangeInput {
  @Field(() => Int)
  @IsInt()
  @Min(1)
  @Max(65535)
  from!: number;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  @Max(65535)
  to!: number;
}

@InputType()
export class AssetFilters {
  /** Asset is kept when at least one of its findings has severity in this list.
   *  null or empty = no filter on severity. */
  @Field(() => [Severity], { nullable: true })
  @IsOptional()
  @IsArray()
  severityHas?: Severity[] | null;

  /** Asset is kept when at least one OPEN port number falls in any of these
   *  inclusive ranges. null or empty = no filter on ports. */
  @Field(() => [PortRangeInput], { nullable: true })
  @IsOptional()
  @IsArray()
  @Type(() => PortRangeInput)
  portRanges?: PortRangeInput[] | null;

  /** Asset is kept when at least one Technology.name matches any of these
   *  (case-insensitive exact match). null or empty = no filter. */
  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  techNames?: string[] | null;

  /** Asset is kept when at least one scanner that produced it (via Finding or
   *  Technology source) appears in this list. null or empty = no filter. */
  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scannerSources?: string[] | null;
}
```

- [ ] **Step 3: Verify the gateway boots**

Run: `pnpm nx run api-gateway:type-check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api-gateway/src/app/assets/dto/asset-sort.enum.ts apps/api-gateway/src/app/assets/dto/asset-filters.input.ts
git commit -m "feat(api-gateway): add AssetSort enum and AssetFilters input"
```

---

## Task 10: Extend `unifiedAssets` resolver + service with `filters` and `sort`

**Files:**
- Modify: `apps/api-gateway/src/app/assets/unified-assets.resolver.ts`
- Modify: `apps/api-gateway/src/app/assets/unified-assets.service.ts`
- Test: `apps/api-gateway/src/app/assets/__tests__/unified-assets.service.spec.ts`

Per spec §3.2 deliverable 4: default sort = `RISK_SCORE DESC`. Back-compat: omitted args keep behaviour.

- [ ] **Step 1: Write the failing test (append to existing spec)**

```ts
import { AssetSort } from '../dto/asset-sort.enum';

describe('UnifiedAssetsService — filters + sort', () => {
  let prisma: jest.Mocked<PrismaService>;
  let svc: UnifiedAssetsService;
  beforeEach(() => {
    prisma = {
      engagement: { findFirst: jest.fn().mockResolvedValue({ id: 'eng_1' }) },
      $queryRaw: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<PrismaService>;
    svc = new UnifiedAssetsService(prisma);
  });

  it('defaults to RISK_SCORE DESC when sort is undefined', async () => {
    await svc.list('user_1', 'eng_1', {});
    const sqlArg = (prisma.$queryRaw as jest.Mock).mock.calls[0][0];
    const stringified = sqlArg.strings.join(' ');
    expect(stringified).toContain('"riskScore" DESC');
  });

  it('sorts by FIRST_SEEN_AT when requested', async () => {
    await svc.list('user_1', 'eng_1', { sort: AssetSort.FIRST_SEEN_AT });
    const sqlArg = (prisma.$queryRaw as jest.Mock).mock.calls[0][0];
    expect(sqlArg.strings.join(' ')).toContain('"firstSeenAt" DESC');
  });

  it('applies severityHas as EXISTS subquery on Finding', async () => {
    await svc.list('user_1', 'eng_1', { filters: { severityHas: ['CRITICAL', 'HIGH'] } });
    const sqlArg = (prisma.$queryRaw as jest.Mock).mock.calls[0][0];
    expect(sqlArg.strings.join(' ')).toMatch(/EXISTS[\s\S]+"Finding"/);
  });
});
```

- [ ] **Step 2: Run** — Expected: FAIL.

- [ ] **Step 3: Extend service**

In `unified-assets.service.ts`:

```ts
import { AssetSort } from './dto/asset-sort.enum';
import { AssetFilters } from './dto/asset-filters.input';

export interface UnifiedAssetsListOptions {
  kinds?: AssetType[] | null;
  search?: string | null;
  limit?: number | null;
  offset?: number | null;
  filters?: AssetFilters | null;
  sort?: AssetSort | null;
}

// inside list(), after kinds/search clauses:
const filters = opts.filters ?? null;

const severityClause =
  filters?.severityHas && filters.severityHas.length > 0
    ? Prisma.sql`AND EXISTS (
        SELECT 1 FROM "Finding" f
        WHERE f."assetId" = asset_unified_view.id
          AND f."severity"::text = ANY(${filters.severityHas.map(String)}::text[])
      )`
    : Prisma.empty;

const portClause =
  filters?.portRanges && filters.portRanges.length > 0
    ? Prisma.sql`AND EXISTS (
        SELECT 1 FROM "Port" p
        WHERE p."assetId" = asset_unified_view.id
          AND p."state" = 'OPEN'
          AND (${Prisma.join(
            filters.portRanges.map(
              (r) => Prisma.sql`(p."number" BETWEEN ${r.from} AND ${r.to})`,
            ),
            ' OR ',
          )})
      )`
    : Prisma.empty;

const techClause =
  filters?.techNames && filters.techNames.length > 0
    ? Prisma.sql`AND EXISTS (
        SELECT 1 FROM "Technology" t
        WHERE t."assetId" = asset_unified_view.id
          AND lower(t."name") = ANY(${filters.techNames.map((n) => n.toLowerCase())}::text[])
      )`
    : Prisma.empty;

const scannerClause =
  filters?.scannerSources && filters.scannerSources.length > 0
    ? Prisma.sql`AND (
        EXISTS (
          SELECT 1 FROM "Finding" f
          JOIN "ScanJob" j ON j.id = f."scanJobId"
          WHERE f."assetId" = asset_unified_view.id
            AND j."scannerName" = ANY(${filters.scannerSources}::text[])
        )
        OR EXISTS (
          SELECT 1 FROM "Technology" t
          WHERE t."assetId" = asset_unified_view.id
            AND t."source" = ANY(${filters.scannerSources}::text[])
        )
      )`
    : Prisma.empty;

const sort = opts.sort ?? AssetSort.RISK_SCORE;
const orderBy =
  sort === AssetSort.RISK_SCORE
    ? Prisma.sql`ORDER BY "riskScore" DESC, id ASC`
    : sort === AssetSort.FIRST_SEEN_AT
    ? Prisma.sql`ORDER BY "firstSeenAt" DESC, id ASC`
    : sort === AssetSort.LAST_SEEN_AT
    ? Prisma.sql`ORDER BY "lastSeenAt" DESC, id ASC`
    : Prisma.sql`ORDER BY "canonicalValue" ASC, id ASC`;

return this.prisma.$queryRaw<UnifiedAssetObject[]>`
  SELECT id, "engagementId", kind, "canonicalValue", "displayName",
         "firstSeenAt", "lastSeenAt", "riskScore", attrs
  FROM asset_unified_view
  WHERE "engagementId" = ${engagementId}
    ${kindsClause}
    ${searchClause}
    ${severityClause}
    ${portClause}
    ${techClause}
    ${scannerClause}
  ${orderBy}
  LIMIT ${limit} OFFSET ${offset}
`;
```

Extend resolver:

```ts
@Query(() => [UnifiedAssetObject])
unifiedAssets(
  @CurrentUser() user: User,
  @Args('engagementId', { type: () => ID }) engagementId: string,
  @Args('kinds', { type: () => [AssetType], nullable: true }) kinds?: AssetType[] | null,
  @Args('search', { type: () => String, nullable: true }) search?: string | null,
  @Args('limit', { type: () => Int, defaultValue: 100 }) limit?: number,
  @Args('offset', { type: () => Int, defaultValue: 0 }) offset?: number,
  @Args('filters', { type: () => AssetFilters, nullable: true }) filters?: AssetFilters | null,
  @Args('sort', { type: () => AssetSort, nullable: true }) sort?: AssetSort | null,
): Promise<UnifiedAssetObject[]> {
  return this.svc.list(user.id, engagementId, { kinds, search, limit, offset, filters, sort });
}
```

- [ ] **Step 4: Run** — `pnpm nx test api-gateway -t "UnifiedAssetsService"` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api-gateway/src/app/assets
git commit -m "feat(api-gateway): extend unifiedAssets with filters + sort"
```

---

## Task 11: `AssetFacets` ObjectType + `assetFacets` query

**Files:**
- Create: `apps/api-gateway/src/app/assets/dto/asset-facets.object.ts`
- Modify: `apps/api-gateway/src/app/assets/unified-assets.resolver.ts`
- Modify: `apps/api-gateway/src/app/assets/unified-assets.service.ts`
- Test: append to `__tests__/unified-assets.service.spec.ts`

Per spec §3.2 deliverable 4: "Nouvelle query `assetFacets(engagementId, filters)`."

- [ ] **Step 1: Create the ObjectType**

```ts
import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class KindCount {
  @Field(() => String) kind!: string;
  @Field(() => Int) count!: number;
}

@ObjectType()
export class SeverityCount {
  @Field(() => String) severity!: string;
  @Field(() => Int) count!: number;
}

@ObjectType()
export class TechCount {
  @Field(() => String) name!: string;
  @Field(() => Int) count!: number;
}

@ObjectType('AssetFacets')
export class AssetFacetsObject {
  @Field(() => [KindCount])
  kindCounts!: KindCount[];

  @Field(() => [SeverityCount])
  severityCounts!: SeverityCount[];

  @Field(() => [TechCount])
  topTechs!: TechCount[];

  @Field(() => [String])
  scannerSources!: string[];
}
```

- [ ] **Step 2: Write the failing test**

```ts
describe('UnifiedAssetsService.facets', () => {
  it('returns kindCounts, severityCounts, topTechs, scannerSources', async () => {
    const prisma = {
      engagement: { findFirst: jest.fn().mockResolvedValue({ id: 'eng_1' }) },
      asset: { groupBy: jest.fn().mockResolvedValue([{ type: 'DOMAIN', _count: { _all: 3 } }]) },
      finding: { groupBy: jest.fn().mockResolvedValue([{ severity: 'HIGH', _count: { _all: 2 } }]) },
      technology: { groupBy: jest.fn().mockResolvedValue([{ name: 'nginx', _count: { _all: 4 } }]) },
      scanJob: { findMany: jest.fn().mockResolvedValue([{ scannerName: 'nuclei' }]) },
    } as never;
    const svc = new UnifiedAssetsService(prisma);
    const facets = await svc.facets('user_1', 'eng_1', null);
    expect(facets.kindCounts).toEqual([{ kind: 'DOMAIN', count: 3 }]);
    expect(facets.severityCounts).toEqual([{ severity: 'HIGH', count: 2 }]);
    expect(facets.topTechs[0]).toEqual({ name: 'nginx', count: 4 });
    expect(facets.scannerSources).toContain('nuclei');
  });
});
```

- [ ] **Step 3: Implement on the service**

```ts
async facets(
  userId: string,
  engagementId: string,
  _filters: AssetFilters | null,
): Promise<AssetFacetsObject> {
  const engagement = await this.prisma.engagement.findFirst({
    where: { id: engagementId, ownerId: userId, deletedAt: null },
    select: { id: true },
  });
  if (!engagement) throw new NotFoundError('Engagement', engagementId);

  const [kindRows, sevRows, techRows, scanners] = await Promise.all([
    this.prisma.asset.groupBy({
      by: ['type'],
      where: { engagementId, deletedAt: null },
      _count: { _all: true },
    }),
    this.prisma.finding.groupBy({
      by: ['severity'],
      where: { asset: { engagementId, deletedAt: null } },
      _count: { _all: true },
    }),
    this.prisma.technology.groupBy({
      by: ['name'],
      where: { asset: { engagementId, deletedAt: null } },
      _count: { _all: true },
      orderBy: { _count: { name: 'desc' } },
      take: 20,
    }),
    this.prisma.scanJob.findMany({
      where: { scan: { engagementId } },
      select: { scannerName: true },
      distinct: ['scannerName'],
    }),
  ]);

  return {
    kindCounts: kindRows.map((r) => ({ kind: r.type, count: r._count._all })),
    severityCounts: sevRows.map((r) => ({ severity: r.severity, count: r._count._all })),
    topTechs: techRows.map((r) => ({ name: r.name, count: r._count._all })),
    scannerSources: scanners.map((s) => s.scannerName),
  };
}
```

Extend resolver:

```ts
@Query(() => AssetFacetsObject)
assetFacets(
  @CurrentUser() user: User,
  @Args('engagementId', { type: () => ID }) engagementId: string,
  @Args('filters', { type: () => AssetFilters, nullable: true }) filters?: AssetFilters | null,
): Promise<AssetFacetsObject> {
  return this.svc.facets(user.id, engagementId, filters ?? null);
}
```

Register the new types in `assets.module.ts` (just `import './dto/asset-facets.object';`).

- [ ] **Step 4: Run** — `pnpm nx test api-gateway -t "facets"` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api-gateway/src/app/assets
git commit -m "feat(api-gateway): add assetFacets query"
```

---

## Task 12: `AssetDetail` ObjectType + `assetDetail(id)` query

**Files:**
- Create: `apps/api-gateway/src/app/assets/dto/asset-detail.object.ts`
- Modify: `apps/api-gateway/src/app/assets/unified-assets.resolver.ts`
- Modify: `apps/api-gateway/src/app/assets/unified-assets.service.ts`
- Test: append to `__tests__/unified-assets.service.spec.ts`

Per spec §3.2 deliverable 5. **Naming:** `assetDetail(id)` (not `asset(id)`) to avoid colliding with `AssetsResolver.asset(id)`.

`observations: []` empty literal in 3.2 (Phase 3.3 will replace it).

- [ ] **Step 1: Create the ObjectType**

```ts
import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';

import { AssetType } from './asset-type.enum';
import { Severity } from '../../findings/dto/severity.enum';

@ObjectType()
export class PortDetail {
  @Field(() => ID) id!: string;
  @Field(() => Int) number!: number;
  @Field(() => String) protocol!: string;
  @Field(() => String) state!: string;
  @Field(() => Date) lastSeenAt!: Date;
}

@ObjectType()
export class ServiceDetail {
  @Field(() => ID) id!: string;
  @Field(() => String, { nullable: true }) name!: string | null;
  @Field(() => String, { nullable: true }) product!: string | null;
  @Field(() => String, { nullable: true }) version!: string | null;
}

@ObjectType()
export class TechnologyDetail {
  @Field(() => ID) id!: string;
  @Field(() => String) name!: string;
  @Field(() => String, { nullable: true }) version!: string | null;
  @Field(() => String) source!: string;
}

@ObjectType()
export class DnsRecordDetail {
  @Field(() => ID) id!: string;
  @Field(() => String) type!: string;
  @Field(() => String) name!: string;
  @Field(() => String) value!: string;
}

@ObjectType()
export class FindingDetail {
  @Field(() => ID) id!: string;
  @Field(() => String) title!: string;
  @Field(() => Severity) severity!: Severity;
  @Field(() => String, { nullable: true }) location!: string | null;
  @Field(() => String, { nullable: true }) cveId!: string | null;
  @Field(() => String, { nullable: true }) templateId!: string | null;
  @Field(() => Date) firstSeenAt!: Date;
  @Field(() => Date) lastSeenAt!: Date;
}

@ObjectType('AssetObservationDetail')
export class AssetObservationDetail {
  @Field(() => ID) id!: string;
  @Field(() => String) kind!: string;
  @Field(() => String) scannerName!: string;
  @Field(() => Date) ts!: Date;
  @Field(() => GraphQLJSON, { nullable: true }) payload?: unknown;
}

@ObjectType('AssetDetail')
export class AssetDetailObject {
  @Field(() => ID) id!: string;
  @Field(() => AssetType) kind!: AssetType;
  @Field(() => String) canonicalValue!: string;
  @Field(() => Float) riskScore!: number;
  @Field(() => Date) firstSeenAt!: Date;
  @Field(() => Date) lastSeenAt!: Date;

  @Field(() => [PortDetail]) ports!: PortDetail[];
  @Field(() => [ServiceDetail]) services!: ServiceDetail[];
  @Field(() => [TechnologyDetail]) technologies!: TechnologyDetail[];
  @Field(() => [DnsRecordDetail]) dnsRecords!: DnsRecordDetail[];
  @Field(() => [FindingDetail]) findings!: FindingDetail[];

  @Field(() => [String]) ipAddresses!: string[];
  @Field(() => [String]) subdomains!: string[];

  /** Phase 3.2: always empty []. Phase 3.3 will populate from AssetObservation. */
  @Field(() => [AssetObservationDetail]) observations!: AssetObservationDetail[];

  @Field(() => [String]) scannerSources!: string[];
}
```

- [ ] **Step 2: Write the failing test**

```ts
describe('UnifiedAssetsService.detail', () => {
  it('throws ForbiddenException when the engagement is not owned', async () => {
    const prisma = {
      asset: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'a1',
          engagement: { ownerId: 'other_user' },
        }),
      },
    } as never;
    const svc = new UnifiedAssetsService(prisma);
    await expect(svc.detail('me', 'a1')).rejects.toThrow(/Forbidden|forbidden/i);
  });

  it('returns asset detail with empty observations array', async () => {
    const prisma = {
      asset: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'a1',
          type: 'SUBDOMAIN',
          canonicalValue: 'api.example.com',
          riskScore: 12.5,
          firstSeenAt: new Date('2026-05-01'),
          lastSeenAt: new Date('2026-05-02'),
          engagement: { ownerId: 'me' },
          ports: [],
          findings: [],
          technologies: [],
          subdomain: { dnsRecords: [], ips: [] },
          ipAddress: null,
          domain: null,
        }),
      },
      scanJob: { findMany: jest.fn().mockResolvedValue([]) },
    } as never;
    const svc = new UnifiedAssetsService(prisma);
    const detail = await svc.detail('me', 'a1');
    expect(detail.id).toBe('a1');
    expect(detail.observations).toEqual([]);
    expect(detail.riskScore).toBe(12.5);
  });
});
```

- [ ] **Step 3: Implement on the service**

```ts
import { ForbiddenException } from '@nestjs/common';

async detail(userId: string, assetId: string): Promise<AssetDetailObject> {
  const a = await this.prisma.asset.findFirst({
    where: { id: assetId, deletedAt: null },
    include: {
      engagement: { select: { ownerId: true } },
      ports: { include: { services: true } },
      findings: true,
      technologies: true,
      subdomain: { include: { dnsRecords: true, ips: { include: { ip: true } } } },
      domain: { include: { dnsRecords: true } },
      ipAddress: { include: { subdomains: { include: { subdomain: true } } } },
    },
  });
  if (!a) throw new NotFoundError('Asset', assetId);
  if (a.engagement.ownerId !== userId) {
    throw new ForbiddenException('asset belongs to another user');
  }

  const scanners = await this.prisma.scanJob.findMany({
    where: { findings: { some: { assetId } } },
    select: { scannerName: true },
    distinct: ['scannerName'],
  });

  const ports = a.ports.map((p) => ({
    id: p.id,
    number: p.number,
    protocol: p.protocol,
    state: p.state,
    lastSeenAt: p.lastSeenAt,
  }));
  const services = a.ports.flatMap((p) =>
    p.services.map((s) => ({
      id: s.id,
      name: s.name,
      product: s.product,
      version: s.version,
    })),
  );
  const dnsRecords = (a.subdomain?.dnsRecords ?? a.domain?.dnsRecords ?? []).map((r) => ({
    id: r.id,
    type: r.type,
    name: r.name,
    value: r.value,
  }));

  return {
    id: a.id,
    kind: a.type,
    canonicalValue: a.canonicalValue,
    riskScore: a.riskScore,
    firstSeenAt: a.firstSeenAt,
    lastSeenAt: a.lastSeenAt,
    ports,
    services,
    technologies: a.technologies.map((t) => ({
      id: t.id,
      name: t.name,
      version: t.version,
      source: t.source,
    })),
    dnsRecords,
    findings: a.findings.map((f) => ({
      id: f.id,
      title: f.title,
      severity: f.severity,
      location: f.location,
      cveId: f.cveId,
      templateId: f.templateId,
      firstSeenAt: f.firstSeenAt,
      lastSeenAt: f.lastSeenAt,
    })),
    ipAddresses: a.subdomain?.ips.map((j) => j.ip.canonicalValue) ?? [],
    subdomains: a.ipAddress?.subdomains.map((j) => j.subdomain.canonicalValue) ?? [],
    observations: [],
    scannerSources: scanners.map((s) => s.scannerName),
  };
}
```

Extend resolver:

```ts
@Query(() => AssetDetailObject)
assetDetail(
  @CurrentUser() user: User,
  @Args('id', { type: () => ID }) id: string,
): Promise<AssetDetailObject> {
  return this.svc.detail(user.id, id);
}
```

Register types in `assets.module.ts`: `import './dto/asset-detail.object';`.

- [ ] **Step 4: Run** — `pnpm nx test api-gateway -t "detail"` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api-gateway/src/app/assets
git commit -m "feat(api-gateway): add assetDetail query and AssetDetail object"
```

---

## Task 13: Frontend GraphQL queries — `UNIFIED_ASSETS_SCORED`, `ASSET_FACETS`, `ASSET_DETAIL`

**Files:**
- Modify: `apps/frontend/src/lib/graphql/queries.ts`

- [ ] **Step 1: Append the queries**

```ts
export const UNIFIED_ASSETS_SCORED_QUERY = gql`
  query UnifiedAssetsScored(
    $engagementId: ID!
    $kinds: [AssetType!]
    $search: String
    $limit: Int = 100
    $offset: Int = 0
    $filters: AssetFilters
    $sort: AssetSort
  ) {
    unifiedAssets(
      engagementId: $engagementId
      kinds: $kinds
      search: $search
      limit: $limit
      offset: $offset
      filters: $filters
      sort: $sort
    ) {
      id
      kind
      canonicalValue
      displayName
      firstSeenAt
      lastSeenAt
      riskScore
    }
  }
`;

export const ASSET_FACETS_QUERY = gql`
  query AssetFacets($engagementId: ID!, $filters: AssetFilters) {
    assetFacets(engagementId: $engagementId, filters: $filters) {
      kindCounts { kind count }
      severityCounts { severity count }
      topTechs { name count }
      scannerSources
    }
  }
`;

export const ASSET_DETAIL_QUERY = gql`
  query AssetDetail($id: ID!) {
    assetDetail(id: $id) {
      id
      kind
      canonicalValue
      riskScore
      firstSeenAt
      lastSeenAt
      ports { id number protocol state lastSeenAt }
      services { id name product version }
      technologies { id name version source }
      dnsRecords { id type name value }
      findings { id title severity location cveId templateId firstSeenAt lastSeenAt }
      ipAddresses
      subdomains
      scannerSources
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
git commit -m "feat(frontend): add scored assets + facets + assetDetail queries"
```

---

## Task 14: Scored assets list + facet panel in engagement assets tab

**Files:**
- Create: `apps/frontend/src/features/engagements/engagement-assets-facets.tsx`
- Modify: `apps/frontend/src/features/engagements/engagement-assets-tab.tsx`

Per spec §3.2 deliverable 6: riskScore column triable DESC default + left facet panel.

- [ ] **Step 1: Create the facets panel component**

```tsx
import { useQuery } from '@apollo/client';
import { ASSET_FACETS_QUERY } from '../../lib/graphql/queries';

export interface AssetFiltersState {
  severityHas: string[];
  techNames: string[];
  scannerSources: string[];
}

interface FacetsData {
  assetFacets: {
    kindCounts: { kind: string; count: number }[];
    severityCounts: { severity: string; count: number }[];
    topTechs: { name: string; count: number }[];
    scannerSources: string[];
  };
}

export function EngagementAssetsFacets({
  engagementId,
  state,
  onChange,
}: {
  engagementId: string;
  state: AssetFiltersState;
  onChange: (next: AssetFiltersState) => void;
}) {
  const { data, loading } = useQuery<FacetsData>(ASSET_FACETS_QUERY, {
    variables: { engagementId },
  });

  if (loading) return <aside className="text-slate-400 text-sm">Loading facets…</aside>;
  const facets = data?.assetFacets;
  if (!facets) return null;

  const toggle = (key: keyof AssetFiltersState, value: string) => {
    const cur = state[key];
    const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
    onChange({ ...state, [key]: next });
  };

  return (
    <aside className="w-56 space-y-4 text-sm" aria-label="facets">
      <FacetGroup title="Severity">
        {facets.severityCounts.map((s) => (
          <FacetRow
            key={s.severity}
            label={s.severity}
            count={s.count}
            active={state.severityHas.includes(s.severity)}
            onClick={() => toggle('severityHas', s.severity)}
          />
        ))}
      </FacetGroup>
      <FacetGroup title="Top techs">
        {facets.topTechs.map((t) => (
          <FacetRow
            key={t.name}
            label={t.name}
            count={t.count}
            active={state.techNames.includes(t.name)}
            onClick={() => toggle('techNames', t.name)}
          />
        ))}
      </FacetGroup>
      <FacetGroup title="Scanners">
        {facets.scannerSources.map((s) => (
          <FacetRow
            key={s}
            label={s}
            count={null}
            active={state.scannerSources.includes(s)}
            onClick={() => toggle('scannerSources', s)}
          />
        ))}
      </FacetGroup>
    </aside>
  );
}

function FacetGroup(props: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs uppercase text-slate-500 mb-1">{props.title}</h4>
      <div className="space-y-1">{props.children}</div>
    </div>
  );
}

function FacetRow(props: {
  label: string;
  count: number | null;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={
        'w-full flex justify-between px-2 py-1 rounded ' +
        (props.active ? 'bg-indigo-700 text-white' : 'hover:bg-slate-800 text-slate-300')
      }
    >
      <span>{props.label}</span>
      {props.count !== null ? <span className="text-slate-400">{props.count}</span> : null}
    </button>
  );
}
```

- [ ] **Step 2: Rewrite `engagement-assets-tab.tsx` to use the scored query + facets**

Add a new variant for `AssetsScoredPanel` (use it as the default when no `kind` is provided, or extend per-kind):

```tsx
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@apollo/client';
import {
  UNIFIED_ASSETS_SCORED_QUERY,
} from '../../lib/graphql/queries';
import { EngagementAssetsFacets, type AssetFiltersState } from './engagement-assets-facets';

type AssetSort = 'RISK_SCORE' | 'FIRST_SEEN_AT' | 'LAST_SEEN_AT' | 'CANONICAL_VALUE';

interface Row {
  id: string;
  kind: string;
  canonicalValue: string;
  displayName: string;
  firstSeenAt: string;
  lastSeenAt: string;
  riskScore: number;
}

export function ScoredAssetsPanel({ engagementId }: { engagementId: string }) {
  const navigate = useNavigate();
  const [sort, setSort] = useState<AssetSort>('RISK_SCORE');
  const [filters, setFilters] = useState<AssetFiltersState>({
    severityHas: [],
    techNames: [],
    scannerSources: [],
  });

  const { data, loading, error } = useQuery<{ unifiedAssets: Row[] }>(
    UNIFIED_ASSETS_SCORED_QUERY,
    {
      variables: {
        engagementId,
        sort,
        filters: {
          severityHas: filters.severityHas.length ? filters.severityHas : null,
          techNames: filters.techNames.length ? filters.techNames : null,
          scannerSources: filters.scannerSources.length ? filters.scannerSources : null,
        },
      },
    },
  );

  return (
    <div className="flex gap-6">
      <EngagementAssetsFacets engagementId={engagementId} state={filters} onChange={setFilters} />
      <div className="flex-1">
        {loading ? <p className="text-slate-400 text-sm">Loading…</p> : null}
        {error ? <p className="text-red-400 text-sm" role="alert">{error.message}</p> : null}
        <table className="w-full text-sm">
          <thead className="text-left text-slate-400">
            <tr>
              <th className="py-2">Kind</th>
              <th>Value</th>
              <th
                onClick={() => setSort('RISK_SCORE')}
                className="cursor-pointer"
                aria-sort={sort === 'RISK_SCORE' ? 'descending' : 'none'}
              >
                Risk
              </th>
              <th onClick={() => setSort('LAST_SEEN_AT')} className="cursor-pointer">Last seen</th>
            </tr>
          </thead>
          <tbody>
            {(data?.unifiedAssets ?? []).map((r) => (
              <tr
                key={r.id}
                onClick={() => navigate(`/engagements/${engagementId}/assets/${r.id}`)}
                className="border-t border-slate-800 hover:bg-slate-900 cursor-pointer"
              >
                <td className="py-2 text-[10px] uppercase">{r.kind}</td>
                <td className="font-mono">{r.canonicalValue}</td>
                <td className="font-mono">{r.riskScore.toFixed(1)}</td>
                <td className="text-xs text-slate-400">{r.lastSeenAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

Keep the existing `EngagementAssetsTab` per-kind exports for now (used by the per-kind tabs); ship `ScoredAssetsPanel` as the new "Assets" landing inside the existing tab system or as a new tab. **Implementer decision:** simplest path is to expose `ScoredAssetsPanel` from `engagement-assets-tab.tsx` and wire it into `engagement-page.tsx` under a new tab key `assets` (between `overview` and the existing per-kind tabs).

- [ ] **Step 3: Run frontend tests**

Run: `pnpm nx test frontend`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/features/engagements/engagement-assets-tab.tsx apps/frontend/src/features/engagements/engagement-assets-facets.tsx
git commit -m "feat(frontend): scored assets list + facets panel"
```

---

## Task 15: `features/assets/asset-header.tsx`

**Files:**
- Create: `apps/frontend/src/features/assets/asset-header.tsx`

Per spec §3.2 deliverable 6: header = canonicalValue + kind icon + riskScore badge + scanner sources + dates.

```tsx
interface Props {
  kind: string;
  canonicalValue: string;
  riskScore: number;
  firstSeenAt: string;
  lastSeenAt: string;
  scannerSources: string[];
}

const KIND_ICON: Record<string, string> = {
  DOMAIN: '🌐',
  SUBDOMAIN: '🔗',
  IP_ADDRESS: '🖥',
};

export function AssetHeader(p: Props) {
  const badge =
    p.riskScore >= 20 ? 'bg-red-700' : p.riskScore >= 10 ? 'bg-orange-600' : 'bg-slate-700';
  return (
    <header className="bg-slate-900 rounded p-4 flex items-center gap-4">
      <span className="text-2xl">{KIND_ICON[p.kind] ?? '•'}</span>
      <h1 className="font-mono text-lg text-slate-100 flex-1 truncate">{p.canonicalValue}</h1>
      <span className={`px-2 py-1 rounded text-sm text-white ${badge}`}>
        risk {p.riskScore.toFixed(1)}
      </span>
      <div className="text-xs text-slate-400">
        first {p.firstSeenAt.slice(0, 10)} · last {p.lastSeenAt.slice(0, 10)}
      </div>
      <div className="flex gap-1">
        {p.scannerSources.map((s) => (
          <span key={s} className="text-[10px] bg-slate-800 rounded px-1.5 py-0.5">
            {s}
          </span>
        ))}
      </div>
    </header>
  );
}
```

- [ ] **Step 1: Create the file** (paste exactly).
- [ ] **Step 2:** Run `pnpm nx run frontend:type-check`. Expected: PASS.
- [ ] **Step 3: Commit** — `git add apps/frontend/src/features/assets/asset-header.tsx && git commit -m "feat(frontend): AssetHeader component"`.

---

## Task 16: `features/assets/asset-network-tab.tsx`

**Files:**
- Create: `apps/frontend/src/features/assets/asset-network-tab.tsx`

```tsx
interface Port { id: string; number: number; protocol: string; state: string; lastSeenAt: string; }
interface Service { id: string; name: string | null; product: string | null; version: string | null; }

export function AssetNetworkTab(props: {
  kind: string;
  ports: Port[];
  services: Service[];
  ipAddresses: string[];
  subdomains: string[];
}) {
  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-sm font-semibold mb-2">Ports</h3>
        <table className="w-full text-sm">
          <thead className="text-left text-slate-400">
            <tr><th className="py-1">Port</th><th>Proto</th><th>State</th><th>Last seen</th></tr>
          </thead>
          <tbody>
            {props.ports.map((p) => (
              <tr key={p.id} className="border-t border-slate-800">
                <td className="py-1 font-mono">{p.number}</td>
                <td>{p.protocol}</td>
                <td>{p.state}</td>
                <td className="text-xs text-slate-400">{p.lastSeenAt.slice(0, 16).replace('T', ' ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h3 className="text-sm font-semibold mb-2">Services</h3>
        <ul className="space-y-1 text-sm">
          {props.services.map((s) => (
            <li key={s.id} className="font-mono">
              {s.name ?? '—'} {s.product ? `· ${s.product}` : ''} {s.version ? `· ${s.version}` : ''}
            </li>
          ))}
        </ul>
      </section>

      {props.kind === 'SUBDOMAIN' && props.ipAddresses.length > 0 ? (
        <section>
          <h3 className="text-sm font-semibold mb-2">Resolved IPs</h3>
          <ul className="font-mono text-sm space-y-1">
            {props.ipAddresses.map((ip) => <li key={ip}>{ip}</li>)}
          </ul>
        </section>
      ) : null}

      {props.kind === 'IP_ADDRESS' && props.subdomains.length > 0 ? (
        <section>
          <h3 className="text-sm font-semibold mb-2">Subdomains pointing here</h3>
          <ul className="font-mono text-sm space-y-1">
            {props.subdomains.map((s) => <li key={s}>{s}</li>)}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 1-3:** Create, type-check, commit.

---

## Task 17: `features/assets/asset-tech-tab.tsx`

**Files:**
- Create: `apps/frontend/src/features/assets/asset-tech-tab.tsx`

```tsx
interface Tech { id: string; name: string; version: string | null; source: string; }
interface Dns { id: string; type: string; name: string; value: string; }

export function AssetTechTab(props: { technologies: Tech[]; dnsRecords: Dns[] }) {
  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-sm font-semibold mb-2">Technologies</h3>
        <table className="w-full text-sm">
          <thead className="text-left text-slate-400">
            <tr><th className="py-1">Name</th><th>Version</th><th>Source</th></tr>
          </thead>
          <tbody>
            {props.technologies.map((t) => (
              <tr key={t.id} className="border-t border-slate-800">
                <td className="py-1 font-mono">{t.name}</td>
                <td className="font-mono">{t.version ?? '—'}</td>
                <td className="text-xs text-slate-400">{t.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section>
        <h3 className="text-sm font-semibold mb-2">DNS records</h3>
        <table className="w-full text-sm">
          <thead className="text-left text-slate-400">
            <tr><th className="py-1">Type</th><th>Name</th><th>Value</th></tr>
          </thead>
          <tbody>
            {props.dnsRecords.map((r) => (
              <tr key={r.id} className="border-t border-slate-800">
                <td className="py-1">{r.type}</td>
                <td className="font-mono">{r.name}</td>
                <td className="font-mono">{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
```

- [ ] **Step 1-3:** Create, type-check, commit.

---

## Task 18: `features/assets/asset-findings-tab.tsx`

**Files:**
- Create: `apps/frontend/src/features/assets/asset-findings-tab.tsx`

CVE info column reserved for Phase 3.3, shown as `—`.

```tsx
interface Finding {
  id: string; title: string; severity: string; location: string | null;
  cveId: string | null; templateId: string | null;
  firstSeenAt: string; lastSeenAt: string;
}

const SEV_COLOR: Record<string, string> = {
  CRITICAL: 'bg-red-700', HIGH: 'bg-orange-600', MEDIUM: 'bg-yellow-600',
  LOW: 'bg-slate-600', INFO: 'bg-slate-700',
};

export function AssetFindingsTab({ findings }: { findings: Finding[] }) {
  if (findings.length === 0)
    return <p className="text-slate-500 text-sm">No findings yet.</p>;
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-slate-400">
        <tr><th className="py-2">Sev</th><th>Title</th><th>CVE</th><th>Location</th><th>CVE info</th></tr>
      </thead>
      <tbody>
        {findings.map((f) => (
          <tr key={f.id} className="border-t border-slate-800">
            <td className="py-2">
              <span className={`text-[10px] text-white px-1.5 py-0.5 rounded ${SEV_COLOR[f.severity]}`}>
                {f.severity}
              </span>
            </td>
            <td>{f.title}</td>
            <td className="font-mono text-xs">{f.cveId ?? '—'}</td>
            <td className="font-mono text-xs truncate max-w-xs">{f.location ?? '—'}</td>
            <td className="text-slate-500 text-xs">—</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 1-3:** Create, type-check, commit.

---

## Task 19: `features/assets/asset-provenance-tab.tsx` (placeholder)

**Files:**
- Create: `apps/frontend/src/features/assets/asset-provenance-tab.tsx`

```tsx
export function AssetProvenanceTab() {
  return (
    <div className="rounded border border-slate-800 bg-slate-900 p-6 text-slate-400 text-sm">
      Activé en Phase 3.3 — la timeline d'observations (AssetObservation) sera disponible
      après la prochaine étape.
    </div>
  );
}
```

- [ ] **Step 1-3:** Create, type-check, commit.

---

## Task 20: `features/assets/asset-detail-page.tsx` (4-tab composer)

**Files:**
- Create: `apps/frontend/src/features/assets/asset-detail-page.tsx`

```tsx
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@apollo/client';
import { ASSET_DETAIL_QUERY } from '../../lib/graphql/queries';
import { AssetHeader } from './asset-header';
import { AssetNetworkTab } from './asset-network-tab';
import { AssetTechTab } from './asset-tech-tab';
import { AssetFindingsTab } from './asset-findings-tab';
import { AssetProvenanceTab } from './asset-provenance-tab';

type Tab = 'provenance' | 'network' | 'tech' | 'findings';
const TABS: { key: Tab; label: string }[] = [
  { key: 'provenance', label: 'Provenance' },
  { key: 'network', label: 'Réseau' },
  { key: 'tech', label: 'Tech & DNS' },
  { key: 'findings', label: 'Findings' },
];

export function AssetDetailPage() {
  const { assetId } = useParams<{ engagementId: string; assetId: string }>();
  const [tab, setTab] = useState<Tab>('network');
  const { data, loading, error } = useQuery(ASSET_DETAIL_QUERY, {
    variables: { id: assetId },
    skip: !assetId,
  });

  if (!assetId) return <p className="p-8">Missing asset id.</p>;
  if (loading) return <p className="p-8 text-slate-400">Loading asset…</p>;
  if (error) return <p className="p-8 text-red-400" role="alert">{error.message}</p>;
  const a = data?.assetDetail;
  if (!a) return <p className="p-8">Asset not found.</p>;

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <AssetHeader
        kind={a.kind}
        canonicalValue={a.canonicalValue}
        riskScore={a.riskScore}
        firstSeenAt={a.firstSeenAt}
        lastSeenAt={a.lastSeenAt}
        scannerSources={a.scannerSources}
      />

      <nav className="flex gap-2 border-b border-slate-800">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-current={tab === t.key ? 'page' : undefined}
            className={
              'px-3 py-2 text-sm border-b-2 -mb-px ' +
              (tab === t.key
                ? 'border-indigo-400 text-indigo-300'
                : 'border-transparent text-slate-400 hover:text-slate-200')
            }
          >
            {t.label}
          </button>
        ))}
      </nav>

      <section>
        {tab === 'provenance' ? <AssetProvenanceTab /> : null}
        {tab === 'network' ? (
          <AssetNetworkTab
            kind={a.kind}
            ports={a.ports}
            services={a.services}
            ipAddresses={a.ipAddresses}
            subdomains={a.subdomains}
          />
        ) : null}
        {tab === 'tech' ? <AssetTechTab technologies={a.technologies} dnsRecords={a.dnsRecords} /> : null}
        {tab === 'findings' ? <AssetFindingsTab findings={a.findings} /> : null}
      </section>
    </div>
  );
}
```

- [ ] **Step 1-3:** Create, type-check, commit.

---

## Task 21: Add `/engagements/:engagementId/assets/:assetId` route

**Files:**
- Modify: `apps/frontend/src/app.tsx`

- [ ] **Step 1: Add the import + route**

Add `import { AssetDetailPage } from './features/assets/asset-detail-page';`

Insert before the `<Route path="*"` fallback:

```tsx
<Route
  path="/engagements/:engagementId/assets/:assetId"
  element={
    <RequireAuth>
      <AssetDetailPage />
    </RequireAuth>
  }
/>
```

- [ ] **Step 2:** Type-check + commit.

```bash
git add apps/frontend/src/app.tsx
git commit -m "feat(frontend): register asset-detail route"
```

---

## Task 22: Wire `top-assets-list.tsx` to navigate to the new route

**Files:**
- Modify: `apps/frontend/src/features/engagements/synthesis/top-assets-list.tsx`

- [ ] **Step 1: Replace the `<li>` element with a clickable row**

Add at top:

```tsx
import { useNavigate, useParams } from 'react-router-dom';
```

Inside the component:

```tsx
const navigate = useNavigate();
```

Change each `<li>` to a button-style row:

```tsx
<li
  key={a.id}
  onClick={() => navigate(`/engagements/${engagementId}/assets/${a.id}`)}
  className="border-t border-slate-800 pt-2 first:border-t-0 first:pt-0 flex items-center gap-3 cursor-pointer hover:bg-slate-800/40 rounded px-1"
>
```

Keep the rest of the row content unchanged.

- [ ] **Step 2:** Type-check + run synthesis tests `pnpm nx test frontend -t "top"`. Expected: PASS (existing assertions on label/count are unaffected).

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/features/engagements/synthesis/top-assets-list.tsx
git commit -m "feat(frontend): top-assets row navigates to asset detail"
```

---

## Task 23: Cross-cutting validation

**Files:** none.

- [ ] **Step 1: Lint, type-check, full test suite**

Run each, expect PASS:

```bash
pnpm format:check
pnpm nx run-many -t type-check
pnpm nx run-many -t lint
pnpm nx run-many -t test
```

- [ ] **Step 2: Smoke-boot api-gateway and `curl` the new query**

```bash
pnpm nx serve api-gateway &
# wait for the GraphQL playground to come up
curl -sX POST http://localhost:3000/graphql \
  -H 'content-type: application/json' \
  -d '{"query":"{ __type(name: \"AssetDetail\") { name fields { name } } }"}'
```

Expected: response includes `AssetDetail` with the fields declared in Task 12 (id, kind, canonicalValue, riskScore, ports, services, technologies, dnsRecords, findings, ipAddresses, subdomains, observations, scannerSources, firstSeenAt, lastSeenAt).

- [ ] **Step 3: Acceptance per spec §3.2**

- Run a `web-quick` against a seed engagement.
- Confirm top-assets row in synthesis page navigates to asset detail.
- Confirm asset detail Findings tab lists the right findings.
- Confirm `pnpm recompute:risk-scores <engagementId>` runs without error and the riskScore values match `computeRiskScore` for sampled assets.

- [ ] **Step 4: Final clean-up commit (only if any fixups)**

---

## Self-Review

- [ ] Spec coverage: every deliverable in spec §3.2 (riskScore lib, recompute hook, backfill script, extended `unifiedAssets` with filters/sort, `assetFacets`, `assetDetail`, 6 React components, route, top-assets click-through) has at least one task.
- [ ] Placeholder scan: no "TBD"/"fill in later"/"similar to TaskN" cross-references survive.
- [ ] Type consistency: `AssetFilters`, `AssetSort`, `AssetDetail`, `AssetFacets`, `recomputeRiskScoreForAsset` spelled identically across tasks.

---

## Plan Summary (200 words)

The plan has **23 tasks** organised as: 3 tasks scaffolding the pure `computeRiskScore` library and its recompute helper with full TDD coverage; 3 tasks refactoring the parser-worker persisters (finding, port, service) to accept an optional `Prisma.TransactionClient`, with the call sites in `parse-job.processor.ts` wrapped in `prisma.$transaction(...)` plus a `P2034` retry-once helper; 1 task for the `tsx`-based backfill script (`pnpm recompute:risk-scores [engagementId]`); 1 task to grep/loosen `riskScore: 0` assertions (confirmed only one spec file is affected, no assertion currently locks the value); 4 tasks extending the api-gateway with `AssetSort`, `AssetFilters`, `AssetFacets`, `AssetDetail`; 8 tasks for the frontend (queries, scored list with facets, 6 components, route, top-assets click-through); 1 cross-cutting validation task.

**Judgment calls flagged:**
- Renamed the new query from `asset(id)` to **`assetDetail(id)`** to avoid colliding with the existing `AssetsResolver.asset(id)` used by `ASSETS_QUERY` in Phase 1/2.
- Interpreted `severityHas` as "asset has at least one finding with severity ∈ list" (EXISTS subquery), not "every finding".
- Interpreted `exposed_admin_bonus` as a one-shot +3 per asset (not per service).
- Defaulted `pnpm recompute:risk-scores` to all engagements when no arg is passed.

**Note on plan persistence:** This conversation runs in read-only planning mode; the Write tool is not available, so the markdown above is delivered as the assistant message for the parent agent to persist to `docs/superpowers/plans/2026-05-31-phase-3-2-risk-score-and-asset-detail.md`.