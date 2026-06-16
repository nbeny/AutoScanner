# Phase 8.7b — Offline CPE→CVE Match Engine + Discovery Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve `cpe → applicable CVEs` offline from the local NVD mirror (8.7a) — evaluating version ranges + AND/OR/negate node logic — and wire the 8.6 `CveDiscoveryProcessor` to it (live-API fallback only until the mirror is synced).

**Architecture:** Two pure modules in `libs/cve` (`compareCpeVersions`, `cpe-matcher`), a worker-level `CpeCveResolver` service (mirror-first via Prisma, live fallback via `NvdClient`), and a one-line swap in `CveDiscoveryProcessor` (`nvd.findCvesByCpe` → `resolver.resolve`). Everything downstream (CpeCveCache, finding creation, enrichment, risk recompute) is unchanged.

**Tech Stack:** TypeScript, NestJS, Prisma, Jest, `@autoscanner/cve`. Spec: `docs/superpowers/specs/2026-06-16-phase-8-7b-offline-cpe-match-design.md`. Refs: 8.7a models `NvdCve`/`NvdConfigNode`/`NvdCpeMatch`/`NvdSyncState` (`prisma/schema.prisma`); 8.6 `CveDiscoveryProcessor` (`apps/cve-enricher-worker/src/app/cve-discovery.processor.ts`) + `NvdClient.findCvesByCpe → CpeCveMatch[]` (`libs/cve/src/nvd-client.ts`).

---

## Reference (read once)
- **`CpeCveMatch`** (`libs/cve/src/nvd-client.ts`, exported via `@autoscanner/cve`): `{ cveId: string; cvssScore: number | null }` — the resolver returns this exact shape (so the discovery processor is untouched downstream).
- **Discovery call site** `apps/cve-enricher-worker/src/app/cve-discovery.processor.ts` ~line 58-74: on `CpeCveCache` miss it does `matches = await this.nvd.findCvesByCpe(cpe)`. That single call becomes `matches = await this.resolver.resolve(cpe)`. Ctor currently injects `PrismaService`, `NvdClient`, `@InjectQueue(CVE_DISCOVERY)`, `@InjectQueue(CVE_ENRICHMENT)`, events publisher — you ADD `CpeCveResolver`.
- **Schema** `prisma/schema.prisma`: `NvdCpeMatch { criteria, vulnerable, cpeVendor, cpeProduct, versionStartIncluding?, versionStartExcluding?, versionEndIncluding?, versionEndExcluding?, node→NvdConfigNode }`; `NvdConfigNode { operator (NvdConfigOperator AND|OR), negate, cveId }`; `NvdCve { cveId, cvssV3Score }`; `NvdSyncState { id:'singleton', fullSyncCompletedAt? }`.
- **Worker app** `apps/cve-enricher-worker/src/app/app.module.ts` — add `CpeCveResolver` to `providers`. `cve-discovery.processor.spec.ts` shows the DI/mock style to mirror.
- **libs/cve layout** `libs/cve/src/` (`index.ts` does `export * from './...'` per file) — add `export * from './cpe-version'` and `export * from './cpe-matcher'`.

---

## Task 1: `compareCpeVersions` version comparator

**Files:** Create `libs/cve/src/cpe-version.ts`; test `libs/cve/src/__tests__/cpe-version.spec.ts`; modify `libs/cve/src/index.ts`.

- [ ] **Step 1: Write the failing test** `libs/cve/src/__tests__/cpe-version.spec.ts`:

```ts
import { compareCpeVersions } from '../cpe-version';

describe('compareCpeVersions', () => {
  const cases: Array<[string, string, number]> = [
    ['1.0.0', '1.0.0', 0],
    ['1.0', '1.0.0', 0],        // trailing-zero padding equal
    ['2.0', '2.0.1', -1],       // shorter prefix is lower
    ['1.2', '1.10', -1],        // numeric segments compared numerically
    ['1.10', '1.2', 1],
    ['1.0.1', '1.0.1a', -1],    // revision letter suffix is higher
    ['1.0.1a', '1.0.1', 1],
    ['2.0-rc1', '2.0', -1],     // known pre-release tag is lower than the release
    ['2.0', '2.0-rc1', 1],
    ['1.0.0', '2.0.0', -1],
    ['10.0', '9.0', 1],
  ];
  it.each(cases)('compare(%s, %s) === %d', (a, b, expected) => {
    expect(Math.sign(compareCpeVersions(a, b))).toBe(expected);
  });
});
```

Run `pnpm nx test cve --testPathPattern=cpe-version` → FAIL.

- [ ] **Step 2: Implement** `libs/cve/src/cpe-version.ts`:

```ts
const PRERELEASE = new Set(['rc', 'alpha', 'beta', 'pre', 'preview', 'dev', 'snapshot', 'm']);

interface Segment {
  num: number | null; // numeric value, or null if non-numeric
  text: string; // lowercased raw segment
}

function splitVersion(v: string): Segment[] {
  // split on . - _ + and also at digit↔letter boundaries (e.g. "1.0.1a" → 1,0,1,a)
  const rough = v
    .toLowerCase()
    .replace(/([0-9])([a-z])/g, '$1.$2')
    .replace(/([a-z])([0-9])/g, '$1.$2')
    .split(/[.\-_+]/)
    .filter((s) => s.length > 0);
  return rough.map((s) => {
    const n = /^[0-9]+$/.test(s) ? Number(s) : null;
    return { num: n, text: s };
  });
}

function compareSegment(a: Segment | undefined, b: Segment | undefined): number {
  // padding: missing segment behaves like a release "0"/empty.
  if (!a && !b) return 0;
  // A missing segment vs a pre-release tag: the side WITH the pre-release tag is lower.
  if (!a) return b && b.num === null && PRERELEASE.has(b.text) ? 1 : b && (b.num ?? 1) === 0 ? 0 : -1;
  if (!b) return a.num === null && PRERELEASE.has(a.text) ? -1 : (a.num ?? 1) === 0 ? 0 : 1;
  if (a.num !== null && b.num !== null) return a.num === b.num ? 0 : a.num < b.num ? -1 : 1;
  // a pre-release tag is always lower than a numeric/normal segment on the other side
  const aPre = a.num === null && PRERELEASE.has(a.text);
  const bPre = b.num === null && PRERELEASE.has(b.text);
  if (aPre && !bPre) return -1;
  if (bPre && !aPre) return 1;
  // numeric vs non-numeric (non-prerelease, e.g. revision letter): numeric is lower
  if (a.num !== null && b.num === null) return -1;
  if (a.num === null && b.num !== null) return 1;
  return a.text < b.text ? -1 : a.text > b.text ? 1 : 0;
}

export function compareCpeVersions(a: string, b: string): -1 | 0 | 1 {
  const sa = splitVersion(a);
  const sb = splitVersion(b);
  const len = Math.max(sa.length, sb.length);
  for (let i = 0; i < len; i += 1) {
    const c = compareSegment(sa[i], sb[i]);
    if (c !== 0) return c < 0 ? -1 : 1;
  }
  return 0;
}
```

Run `pnpm nx test cve --testPathPattern=cpe-version` → PASS. If a specific case still fails, adjust `compareSegment` to satisfy the table (the table is the contract). Add `export * from './cpe-version';` to `libs/cve/src/index.ts`.

- [ ] **Step 3: Verify + commit.** `pnpm nx run-many -t type-check,test -p cve` → green.
```bash
git add libs/cve/src/cpe-version.ts libs/cve/src/__tests__/cpe-version.spec.ts libs/cve/src/index.ts
git commit -m "feat(phase-8.7b): compareCpeVersions segment-based version comparator"
```

---

## Task 2: `cpe-matcher` (pure applicability engine)

**Files:** Create `libs/cve/src/cpe-matcher.ts`; test `libs/cve/src/__tests__/cpe-matcher.spec.ts`; modify `libs/cve/src/index.ts`.

- [ ] **Step 1: Write the failing test** `libs/cve/src/__tests__/cpe-matcher.spec.ts`:

```ts
import { parseCpe, cpeMatchApplies, evaluateNode, cveApplies } from '../cpe-matcher';
import type { ConfigNode, MatchCriterion } from '../cpe-matcher';

const target = parseCpe('cpe:2.3:a:openssl:openssl:1.0.1:*:*:*:*:*:*:*');
const m = (over: Partial<MatchCriterion> = {}): MatchCriterion => ({
  criteria: 'cpe:2.3:a:openssl:openssl:*:*:*:*:*:*:*:*', vulnerable: true, ...over,
});

describe('parseCpe', () => {
  it('extracts vendor/product/version', () => {
    expect(target).toEqual({ vendor: 'openssl', product: 'openssl', version: '1.0.1' });
  });
});

describe('cpeMatchApplies', () => {
  it('exact pinned version matches', () => {
    expect(cpeMatchApplies(target, m({ criteria: 'cpe:2.3:a:openssl:openssl:1.0.1:*:*:*:*:*:*:*' }))).toBe(true);
  });
  it('range start/end (incl/excl) applies', () => {
    expect(cpeMatchApplies(target, m({ versionStartIncluding: '1.0.0', versionEndExcluding: '1.0.2' }))).toBe(true);
    expect(cpeMatchApplies(target, m({ versionStartExcluding: '1.0.1' }))).toBe(false); // 1.0.1 not > 1.0.1
    expect(cpeMatchApplies(target, m({ versionEndIncluding: '1.0.0' }))).toBe(false);   // 1.0.1 not <= 1.0.0
  });
  it('different vendor/product never applies', () => {
    expect(cpeMatchApplies(target, m({ criteria: 'cpe:2.3:a:other:thing:*:*:*:*:*:*:*:*' }))).toBe(false);
  });
  it('target with no concrete version + bounds → not applicable (conservative)', () => {
    const star = parseCpe('cpe:2.3:a:openssl:openssl:*:*:*:*:*:*:*:*');
    expect(cpeMatchApplies(star, m({ versionEndExcluding: '2.0' }))).toBe(false);
  });
});

describe('evaluateNode + cveApplies', () => {
  it('OR node matches if any vulnerable match applies', () => {
    const node: ConfigNode = { operator: 'OR', negate: false, matches: [m({ versionEndIncluding: '0.9' }), m({ versionStartIncluding: '1.0.0', versionEndExcluding: '1.0.2' })] };
    expect(evaluateNode(node, target)).toBe(true);
  });
  it('AND node cross-product → not applicable', () => {
    const node: ConfigNode = { operator: 'AND', negate: false, matches: [m(), m({ criteria: 'cpe:2.3:o:linux:linux_kernel:*:*:*:*:*:*:*:*' })] };
    expect(evaluateNode(node, target)).toBe(false);
  });
  it('negate inverts', () => {
    const node: ConfigNode = { operator: 'OR', negate: true, matches: [m()] };
    expect(evaluateNode(node, target)).toBe(false);
  });
  it('cveApplies is true if any node applies', () => {
    expect(cveApplies([{ operator: 'OR', negate: false, matches: [m({ versionEndIncluding: '0.1' })] }, { operator: 'OR', negate: false, matches: [m()] }], target)).toBe(true);
  });
});
```

Run `pnpm nx test cve --testPathPattern=cpe-matcher` → FAIL.

- [ ] **Step 2: Implement** `libs/cve/src/cpe-matcher.ts`:

```ts
import { compareCpeVersions } from './cpe-version';

export interface ParsedCpe {
  vendor: string;
  product: string;
  version: string; // '*' or '-' means not pinned
}
export interface MatchCriterion {
  criteria: string;
  vulnerable: boolean;
  versionStartIncluding?: string | null;
  versionStartExcluding?: string | null;
  versionEndIncluding?: string | null;
  versionEndExcluding?: string | null;
}
export interface ConfigNode {
  operator: 'AND' | 'OR';
  negate: boolean;
  matches: MatchCriterion[];
}

export function parseCpe(cpe: string): ParsedCpe {
  const parts = cpe.split(':');
  return { vendor: parts[3] ?? '*', product: parts[4] ?? '*', version: parts[5] ?? '*' };
}

function isConcrete(v: string | undefined): boolean {
  return !!v && v !== '*' && v !== '-';
}

function hasBounds(m: MatchCriterion): boolean {
  return !!(m.versionStartIncluding || m.versionStartExcluding || m.versionEndIncluding || m.versionEndExcluding);
}

export function cpeMatchApplies(target: ParsedCpe, m: MatchCriterion): boolean {
  const crit = parseCpe(m.criteria);
  if (crit.vendor !== target.vendor || crit.product !== target.product) return false;
  // criterion pins a concrete version → exact compare (target must have a concrete version)
  if (isConcrete(crit.version)) {
    return isConcrete(target.version) && compareCpeVersions(target.version, crit.version) === 0;
  }
  // criterion is version-range (or wildcard). Need a concrete target version to place it.
  if (!isConcrete(target.version)) return !hasBounds(m); // wildcard-vs-wildcard with no bounds = applies; bounds+wildcard target = conservative false
  const tv = target.version;
  if (m.versionStartIncluding && compareCpeVersions(tv, m.versionStartIncluding) < 0) return false;
  if (m.versionStartExcluding && compareCpeVersions(tv, m.versionStartExcluding) <= 0) return false;
  if (m.versionEndIncluding && compareCpeVersions(tv, m.versionEndIncluding) > 0) return false;
  if (m.versionEndExcluding && compareCpeVersions(tv, m.versionEndExcluding) >= 0) return false;
  return true;
}

export function evaluateNode(node: ConfigNode, target: ParsedCpe): boolean {
  const vuln = node.matches.filter((m) => m.vulnerable);
  let result: boolean;
  if (node.operator === 'AND') {
    // conservative: every vulnerable condition must be on our product AND apply.
    // a vulnerable condition on a different product can't be confirmed from one CPE → false.
    result =
      vuln.length > 0 &&
      vuln.every((m) => {
        const crit = parseCpe(m.criteria);
        if (crit.vendor !== target.vendor || crit.product !== target.product) return false;
        return cpeMatchApplies(target, m);
      });
  } else {
    result = vuln.some((m) => cpeMatchApplies(target, m));
  }
  return node.negate ? !result : result;
}

export function cveApplies(nodes: ConfigNode[], target: ParsedCpe): boolean {
  return nodes.some((n) => evaluateNode(n, target));
}
```

Run `pnpm nx test cve --testPathPattern=cpe-matcher` → PASS. Add `export * from './cpe-matcher';` to `libs/cve/src/index.ts`.

- [ ] **Step 3: Verify + commit.** `pnpm nx run-many -t type-check,test -p cve` → green.
```bash
git add libs/cve/src/cpe-matcher.ts libs/cve/src/__tests__/cpe-matcher.spec.ts libs/cve/src/index.ts
git commit -m "feat(phase-8.7b): cpe-matcher (parse + version-range + AND/OR/negate applicability)"
```

---

## Task 3: `CpeCveResolver` (mirror-first, live fallback)

**Files:** Create `apps/cve-enricher-worker/src/app/cpe-cve-resolver.service.ts`; modify `apps/cve-enricher-worker/src/app/app.module.ts` (providers); test `apps/cve-enricher-worker/src/app/__tests__/cpe-cve-resolver.service.spec.ts`.

- [ ] **Step 1: Write the failing test** `cpe-cve-resolver.service.spec.ts`. Mock `PrismaService` (`nvdSyncState.findUnique`, `nvdCpeMatch.findMany`, `nvdCve.findMany`) + `NvdClient` (`findCvesByCpe`). Cases:

```ts
it('mirror not synced → falls back to live findCvesByCpe, no NvdCpeMatch query', async () => {
  prisma.nvdSyncState.findUnique.mockResolvedValue({ id: 'singleton', fullSyncCompletedAt: null });
  nvd.findCvesByCpe.mockResolvedValue([{ cveId: 'CVE-LIVE', cvssScore: 5 }]);
  const out = await resolver.resolve('cpe:2.3:a:openssl:openssl:1.0.1:*:*:*:*:*:*:*');
  expect(out).toEqual([{ cveId: 'CVE-LIVE', cvssScore: 5 }]);
  expect(prisma.nvdCpeMatch.findMany).not.toHaveBeenCalled();
});

it('mirror synced → matches offline, does NOT call live', async () => {
  prisma.nvdSyncState.findUnique.mockResolvedValue({ id: 'singleton', fullSyncCompletedAt: new Date() });
  prisma.nvdCpeMatch.findMany.mockResolvedValue([
    { criteria: 'cpe:2.3:a:openssl:openssl:*:*:*:*:*:*:*:*', vulnerable: true, versionStartIncluding: '1.0.0', versionEndExcluding: '1.0.2', versionStartExcluding: null, versionEndIncluding: null, node: { operator: 'OR', negate: false, cveId: 'CVE-2014-0160' } },
    { criteria: 'cpe:2.3:a:openssl:openssl:*:*:*:*:*:*:*:*', vulnerable: true, versionEndIncluding: '0.9', versionStartIncluding: null, versionStartExcluding: null, versionEndExcluding: null, node: { operator: 'OR', negate: false, cveId: 'CVE-OLD' } },
  ]);
  prisma.nvdCve.findMany.mockResolvedValue([{ cveId: 'CVE-2014-0160', cvssV3Score: 9.4 }]);
  const out = await resolver.resolve('cpe:2.3:a:openssl:openssl:1.0.1:*:*:*:*:*:*:*');
  expect(out).toEqual([{ cveId: 'CVE-2014-0160', cvssScore: 9.4 }]); // CVE-OLD excluded (1.0.1 > 0.9)
  expect(nvd.findCvesByCpe).not.toHaveBeenCalled();
  expect(prisma.nvdCpeMatch.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { cpeVendor: 'openssl', cpeProduct: 'openssl' } }));
});

it('mirror synced + zero rows → [] (no live fallback)', async () => {
  prisma.nvdSyncState.findUnique.mockResolvedValue({ id: 'singleton', fullSyncCompletedAt: new Date() });
  prisma.nvdCpeMatch.findMany.mockResolvedValue([]);
  const out = await resolver.resolve('cpe:2.3:a:x:y:1.0:*:*:*:*:*:*:*');
  expect(out).toEqual([]);
  expect(nvd.findCvesByCpe).not.toHaveBeenCalled();
});
```

Run `pnpm nx test cve-enricher-worker --testPathPattern=cpe-cve-resolver` → FAIL.

- [ ] **Step 2: Implement** `cpe-cve-resolver.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@autoscanner/database';
import { NvdClient, parseCpe, cveApplies, type CpeCveMatch, type ConfigNode, type MatchCriterion } from '@autoscanner/cve';

@Injectable()
export class CpeCveResolver {
  private readonly logger = new Logger(CpeCveResolver.name);
  constructor(private readonly prisma: PrismaService, private readonly nvd: NvdClient) {}

  async resolve(cpe: string): Promise<CpeCveMatch[]> {
    const state = await this.prisma.nvdSyncState.findUnique({ where: { id: 'singleton' } });
    if (!state?.fullSyncCompletedAt) {
      this.logger.debug(`mirror not synced; resolving ${cpe} via live NVD`);
      return this.nvd.findCvesByCpe(cpe);
    }
    const target = parseCpe(cpe);
    const rows = await this.prisma.nvdCpeMatch.findMany({
      where: { cpeVendor: target.vendor, cpeProduct: target.product },
      select: {
        criteria: true, vulnerable: true,
        versionStartIncluding: true, versionStartExcluding: true,
        versionEndIncluding: true, versionEndExcluding: true,
        node: { select: { operator: true, negate: true, cveId: true } },
      },
    });
    // group rows by cveId → list of nodes (each node = the matches sharing the same nodeId — but
    // grouping by cveId+operator+negate is sufficient here since we evaluate per-CVE applicability).
    const byCve = new Map<string, ConfigNode[]>();
    const nodeKey = new Map<string, ConfigNode>(); // dedupe nodes within a cve by (cveId|operator|negate) — coarse but safe for OR-dominant data
    for (const r of rows) {
      const m: MatchCriterion = {
        criteria: r.criteria, vulnerable: r.vulnerable,
        versionStartIncluding: r.versionStartIncluding, versionStartExcluding: r.versionStartExcluding,
        versionEndIncluding: r.versionEndIncluding, versionEndExcluding: r.versionEndExcluding,
      };
      const k = `${r.node.cveId}|${r.node.operator}|${r.node.negate}`;
      let node = nodeKey.get(k);
      if (!node) {
        node = { operator: r.node.operator, negate: r.node.negate, matches: [] };
        nodeKey.set(k, node);
        const list = byCve.get(r.node.cveId) ?? [];
        list.push(node);
        byCve.set(r.node.cveId, list);
      }
      node.matches.push(m);
    }
    const applicable = [...byCve.entries()].filter(([, nodes]) => cveApplies(nodes, target)).map(([cveId]) => cveId);
    if (applicable.length === 0) return [];
    const cves = await this.prisma.nvdCve.findMany({ where: { cveId: { in: applicable } }, select: { cveId: true, cvssV3Score: true } });
    const scoreByCve = new Map(cves.map((c) => [c.cveId, c.cvssV3Score]));
    return applicable.map((cveId) => ({ cveId, cvssScore: scoreByCve.get(cveId) ?? null }));
  }
}
```

Note the grouping caveat: rows are grouped into nodes by `(cveId|operator|negate)` rather than by the true `nodeId` (not selected). This is a safe approximation for OR-dominant NVD data and keeps the query lean; if a future need requires exact per-node grouping, select `node: { select: { id: true, ... } }` and key by `node.id`. (If you prefer exactness now, select `id` and group by it — both pass the tests; pick exact-by-id for "best".) **Implement exact-by-`nodeId`:** select `node: { select: { id: true, operator: true, negate: true, cveId: true } }` and key `nodeKey` by `r.node.id`. Register `CpeCveResolver` in `app.module.ts` providers.

Run `pnpm nx test cve-enricher-worker --testPathPattern=cpe-cve-resolver` → PASS. (Adjust the test mock `node` objects to include `id` if you group by id — give each row's node an `id`.)

- [ ] **Step 3: Verify + commit.** `pnpm nx run-many -t type-check,test -p cve,cve-enricher-worker` → green.
```bash
git add apps/cve-enricher-worker/src/app/cpe-cve-resolver.service.ts apps/cve-enricher-worker/src/app/__tests__/cpe-cve-resolver.service.spec.ts apps/cve-enricher-worker/src/app/app.module.ts
git commit -m "feat(phase-8.7b): CpeCveResolver (mirror-first offline match, live fallback)"
```

---

## Task 4: Wire `CveDiscoveryProcessor` to the resolver

**Files:** Modify `apps/cve-enricher-worker/src/app/cve-discovery.processor.ts`; update `apps/cve-enricher-worker/src/app/__tests__/cve-discovery.processor.spec.ts`.

- [ ] **Step 1: Update the processor test** — in `cve-discovery.processor.spec.ts`, replace the `NvdClient` mock usage for the resolution path with a `CpeCveResolver` mock: provide `{ provide: CpeCveResolver, useValue: { resolve: jest.fn() } }` in the test module; change the existing tests that set `nvd.findCvesByCpe.mockResolvedValue(...)` for the discovery path to set `resolver.resolve.mockResolvedValue(...)` instead. (The `NvdRateLimitedError` reschedule test from 8.6 — if it asserted a throw from `findCvesByCpe` — now asserts the same from `resolver.resolve`; keep `NvdClient` injected if still used elsewhere, else drop it.) Run `pnpm nx test cve-enricher-worker --testPathPattern=cve-discovery` → FAIL.

- [ ] **Step 2: Implement.** In `cve-discovery.processor.ts`: add `CpeCveResolver` to the constructor (`private readonly resolver: CpeCveResolver`), import it from `./cpe-cve-resolver.service`. Replace the single cache-miss line `matches = await this.nvd.findCvesByCpe(cpe);` with `matches = await this.resolver.resolve(cpe);`. Leave the `NvdRateLimitedError` catch/reschedule exactly as-is (the resolver propagates it from the live-fallback path; on the mirror path it won't occur — harmless). If `this.nvd` is no longer referenced anywhere in the processor, remove the `NvdClient` injection; if the rate-limit catch still references `NvdRateLimitedError` (an imported class, not `this.nvd`), keep that import. Run `pnpm nx test cve-enricher-worker --testPathPattern=cve-discovery` → PASS.

- [ ] **Step 3: Verify + commit.** `pnpm nx run-many -t type-check,test -p cve-enricher-worker` → green (all worker tests incl. the resolver + discovery suites).
```bash
git add apps/cve-enricher-worker/src/app/cve-discovery.processor.ts apps/cve-enricher-worker/src/app/__tests__/cve-discovery.processor.spec.ts
git commit -m "feat(phase-8.7b): discovery uses CpeCveResolver (offline mirror, live fallback)"
```

---

## Task 5: Full validation

- [ ] **Step 1: Validate.** Run:
```
pnpm nx run-many -t type-check,test -p cve,cve-enricher-worker,parser-worker
pnpm nx run-many -t build -p cve-enricher-worker
```
All green. (If anything fails on a stale Prisma client — the 8.7a models — run `pnpm install` + `pnpm prisma generate` first; env staleness.)

- [ ] **Step 2: Commit (only if validation needed fixups).**
```bash
git add -A && git commit -m "test(phase-8.7b): full validation for offline CPE match + discovery wiring"
```
(If nothing changed, skip.)

---

## Validation criteria (spec §1)
`compareCpeVersions` (T1); `cpe-matcher` parse/applies/node/cve (T2); `CpeCveResolver` mirror-first + live fallback + 0-authoritative (T3); discovery wired to resolver, downstream unchanged (T4); CI incl. build (T5). No Prisma change; no front change.

## Out of scope (spec §1)
Changing 8.7a sync/tables; front "verified vs inferred"; CPE dictionary enrichment; CPE reconstruction for service without a CPE.

## Self-review notes
- **Spec coverage:** §2.1 comparator=T1; §2.2 matcher=T2; §2.3 resolver=T3; §2.4 wiring=T4; §4 tests in each; §1.6 build=T5.
- **Type consistency:** `MatchCriterion`/`ConfigNode`/`ParsedCpe` defined in `cpe-matcher` (T2) consumed by `CpeCveResolver` (T3). `compareCpeVersions` (T1) used by `cpe-matcher` (T2). Resolver returns `CpeCveMatch` (`{cveId,cvssScore}`) — the exact shape the discovery processor already consumes (T4 swap is type-identical). `parseCpe`/`cveApplies` exported from `@autoscanner/cve`.
- **Reuse/DRY:** `compareCpeVersions` shared by matcher; resolver reuses `parseCpe`/`cveApplies`/`NvdClient.findCvesByCpe` (fallback)/the 8.7a tables; discovery's downstream (cache/finding/enrichment/risk) untouched — only the resolution source swapped.
- **Correctness/conservatism:** matcher returns false for cross-product AND, wildcard target + bounds, different vendor/product — no fabricated CVEs. Resolver: mirror-ready gate on `fullSyncCompletedAt`; mirror 0 = `[]` (no live fallback). All tests mock NVD + Prisma (no network/DB).
- **Confirm at impl:** the discovery processor's exact ctor + the line to swap (it's the cache-miss `findCvesByCpe` call); whether `NvdClient` stays injected (only if still referenced); group resolver rows by exact `node.id` (select it). The comparator table in T1 is the contract — tune `compareSegment` until all cases pass.
