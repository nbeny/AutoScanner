# Phase 6.1 — DNS / Passive Subdomain Recon — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four passive DNS/subdomain recon scanners (`findomain`, `amass`, `assetfinder`, `puredns`) plus a shared text parser and a `recon-passive-deep` template, so a single template run fans subdomain discovery across multiple sources that the correlation engine merges into one asset set.

**Architecture:** Reuse the Phase 2 pattern verbatim — each tool is a `libs/scanners/<name>` lib exposing a `ScannerDefinition`, registered in `ScannerRegistry`; outputs flow through a parser (`libs/parsers`) into the existing `PersistService` + correlation engine. No new Prisma tables. A new aggregator module (`@autoscanner/scanners-all`) registers every scanner in all three consumers (api-gateway, scan-worker, orchestrator-worker) — fixing a latent gap where scan-worker and api-gateway only registered `nmap`.

**Tech Stack:** Nx 20 · NestJS 11 · Prisma 6 · BullMQ 5 · Zod · Jest · Docker (dockerode runner) · TypeScript 5.7.

---

## Context the engineer must know

**The scanner pipeline (Phase 1/2):**
1. `runScan` (api-gateway, single scanner) or `runTemplate` (orchestrator-worker, multi-step) creates a `ScanJob` row and enqueues a `ScanJobPayload` on the `SCAN_JOBS` BullMQ queue.
2. `scan-worker` (`apps/scan-worker/src/app/scan-job.processor.ts`) consumes `SCAN_JOBS`, calls `registry.get(scannerName)` → `scanner.build(input, target, ctx)` → runs the container via the docker-runner, captures the configured stream, uploads raw output to MinIO, and enqueues a `ParseJobPayload` on `PARSE_JOBS` with `parserName = scanner.outputs[0].parser`.
3. `parser-worker` consumes `PARSE_JOBS`, looks up the parser in `ParserRegistry`, parses the raw output into a `NormalizedOutput`, and persists via the persisters + correlation engine.

**Registry registration is per-process.** `ScannerRegistry` is a `@Global` singleton **inside each app**, populated by each scanner module's `onModuleInit`. A scanner only works in a process whose `AppModule` imports that scanner's module. Today:
- `orchestrator-worker` imports subfinder/httpx/dnsx/naabu/nuclei (Phase 2) — but NOT nmap.
- `scan-worker` imports **only** `NmapScannerModule` → any non-nmap `SCAN_JOB` throws `Scanner "<name>" not found`.
- `api-gateway` `ScansModule` imports **only** `NmapScannerModule` → standalone `runScan` for any non-nmap scanner throws.

Task 1 fixes this with a single aggregator module imported everywhere, so the new scanners (and the existing Phase 2 ones) are runnable standalone AND in templates.

**Target fan-out (`apps/orchestrator-worker/src/app/step-executor.service.ts`):** a step resolves `step.target` to a list of strings via `ContextBuilder`, then creates **one `ScanJob` per target**. So a step with `target: { kind:'context', path:'subdomains' }` runs the scanner once per discovered subdomain (each `build()` gets a single `target` string). A step with `path:'target'` runs once against the root domain.

**Multi-source provenance:** the correlation engine writes one `AssetObservation` row per (asset, scanner). `AssetDetailObject.scannerSources: [String!]` (already in the GraphQL schema, `apps/api-gateway/src/app/assets/dto/asset-detail.object.ts`) exposes the distinct scanner names that observed an asset. The e2e asserts multi-source merge through this field — no schema change needed.

**Deviation from the spec, surfaced here:** spec §4.3 says `puredns` populates `IpAddress`. To keep the parser uniform (shared `hostlines-text`), this plan has `puredns` emit only `SUBDOMAIN` assets (validated/brute-forced hostnames); IP resolution stays the job of the `dnsx` step already present in `recon-passive-deep`. This is a deliberate simplification for 6.1; revisit if per-tool IP attribution becomes necessary.

---

## File Structure

**New scanner libs** (each mirrors `libs/scanners/subfinder/`):
- `libs/scanners/findomain/` — `@autoscanner/scanners-findomain`
- `libs/scanners/amass/` — `@autoscanner/scanners-amass`
- `libs/scanners/assetfinder/` — `@autoscanner/scanners-assetfinder`
- `libs/scanners/puredns/` — `@autoscanner/scanners-puredns`

Each contains: `project.json`, `package.json`, `tsconfig.json`, `tsconfig.lib.json`, `tsconfig.spec.json`, `jest.config.ts`, `src/index.ts`, `src/<name>.scanner.ts`, `src/<name>.module.ts`, `src/__tests__/<name>.scanner.spec.ts`.

**New aggregator lib:**
- `libs/scanners/all/` — `@autoscanner/scanners-all`, exports `AllScannersModule` importing every scanner module.

**New shared parser:**
- `libs/parsers/src/hostlines-text/hostlines-text.parser.ts` + `index.ts` + `libs/parsers/src/__tests__/hostlines-text.parser.spec.ts` + fixture `libs/parsers/src/__tests__/fixtures/hostlines-sample.txt`.

**New template:**
- `libs/templates/src/builtins/recon-passive-deep.ts`.

**New Docker build files** (tools without a pinnable official image):
- `docker/scanners/assetfinder/Dockerfile`
- `docker/scanners/puredns/Dockerfile`, `docker/scanners/puredns/resolvers.txt`, `docker/scanners/puredns/wordlist.txt`
- `tools/scanners/build-images.sh` (builds the custom images, tags them).

**New e2e:**
- `apps/api-gateway-e2e/src/scenarios/recon-passive-deep-e2e.spec.ts`.

**Modified files:**
- `tsconfig.base.json` — add 5 path mappings.
- `apps/scan-worker/src/app/app.module.ts` — import `AllScannersModule` (drop the lone `NmapScannerModule`).
- `apps/api-gateway/src/app/scans/scans.module.ts` — import `AllScannersModule`.
- `apps/orchestrator-worker/src/app/app.module.ts` — import `AllScannersModule` (replace the 5 individual imports).
- `libs/parsers/src/parsers.module.ts` + `libs/parsers/src/index.ts` — register `HostlinesTextParser`.
- `libs/templates/src/builtins/index.ts` — add `ReconPassiveDeep` to `BUILTIN_TEMPLATES`.
- `package.json` — add `scanners:build` script.
- `.github/workflows/ci.yml` — build custom images + pre-pull registry images before e2e.
- `README.md` — Phase 6.1 section.

---

## Task 1: Aggregator module + fix scanner registration everywhere

**Files:**
- Create: `libs/scanners/all/project.json`, `package.json`, `tsconfig.json`, `tsconfig.lib.json`, `tsconfig.spec.json`, `jest.config.ts`, `src/index.ts`, `src/all-scanners.module.ts`, `src/__tests__/all-scanners.module.spec.ts`
- Modify: `tsconfig.base.json` (add `@autoscanner/scanners-all` path)
- Modify: `apps/scan-worker/src/app/app.module.ts`
- Modify: `apps/api-gateway/src/app/scans/scans.module.ts`
- Modify: `apps/orchestrator-worker/src/app/app.module.ts`

- [ ] **Step 1: Scaffold the aggregator lib config files**

Create `libs/scanners/all/project.json`:

```json
{
  "name": "scanners-all",
  "$schema": "../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/scanners/all/src",
  "projectType": "library",
  "tags": ["scope:scanner"],
  "targets": {
    "test": {
      "executor": "@nx/jest:jest",
      "outputs": ["{workspaceRoot}/coverage/libs/scanners/all"],
      "options": {
        "jestConfig": "libs/scanners/all/jest.config.ts"
      }
    },
    "type-check": {
      "executor": "nx:run-commands",
      "options": {
        "command": "tsc --noEmit -p libs/scanners/all/tsconfig.lib.json"
      }
    }
  }
}
```

Create `libs/scanners/all/package.json`:

```json
{
  "name": "scanners-all",
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

Create `libs/scanners/all/tsconfig.json` (copy of `libs/scanners/subfinder/tsconfig.json`):

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true
  },
  "files": [],
  "include": [],
  "references": [{ "path": "./tsconfig.lib.json" }, { "path": "./tsconfig.spec.json" }]
}
```

Create `libs/scanners/all/tsconfig.lib.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "../../../dist/out-tsc",
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

Create `libs/scanners/all/tsconfig.spec.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "../../../dist/out-tsc",
    "module": "commonjs",
    "types": ["jest", "node"]
  },
  "include": ["src/**/*.spec.ts", "src/**/*.test.ts", "jest.config.ts"]
}
```

Create `libs/scanners/all/jest.config.ts`:

```typescript
export default {
  displayName: 'scanners-all',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  moduleNameMapper: {
    '^@autoscanner/(.*)$': '<rootDir>/../../$1/src/index.ts',
  },
  testMatch: ['**/*.spec.ts'],
  coverageDirectory: '../../../coverage/libs/scanners/all',
};
```

- [ ] **Step 2: Add the tsconfig path mapping**

In `tsconfig.base.json`, in `compilerOptions.paths`, add (keep the list alphabetically grouped with the other `scanners-*` entries, just before `@autoscanner/scanners-dnsx`):

```json
      "@autoscanner/scanners-all": ["libs/scanners/all/src/index.ts"],
```

- [ ] **Step 3: Write the failing aggregator module test**

Create `libs/scanners/all/src/__tests__/all-scanners.module.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { AllScannersModule } from '../all-scanners.module';

describe('AllScannersModule', () => {
  it('registers every Phase 1/2 scanner in the ScannerRegistry', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ScannerSdkModule, AllScannersModule],
    }).compile();
    await moduleRef.init();

    const registry = moduleRef.get(ScannerRegistry);
    for (const name of ['nmap', 'subfinder', 'httpx', 'dnsx', 'naabu', 'nuclei']) {
      expect(registry.has(name)).toBe(true);
    }
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm nx test scanners-all`
Expected: FAIL — `Cannot find module '../all-scanners.module'`.

- [ ] **Step 5: Implement the aggregator module + index**

Create `libs/scanners/all/src/all-scanners.module.ts`:

```typescript
import { Module } from '@nestjs/common';

import { ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { NmapScannerModule } from '@autoscanner/scanners-nmap';
import { SubfinderScannerModule } from '@autoscanner/scanners-subfinder';
import { HttpxScannerModule } from '@autoscanner/scanners-httpx';
import { DnsxScannerModule } from '@autoscanner/scanners-dnsx';
import { NaabuScannerModule } from '@autoscanner/scanners-naabu';
import { NucleiScannerModule } from '@autoscanner/scanners-nuclei';

/**
 * Single import that registers every concrete scanner in the per-process
 * `ScannerRegistry`. Imported by api-gateway (ScansModule), scan-worker, and
 * orchestrator-worker so a scanner is runnable standalone AND in a template
 * without each app maintaining its own scanner import list.
 *
 * Each scanner module guards its `registry.register` with `has()` so importing
 * this module is idempotent across module re-inits (tests, hot reload).
 */
const SCANNER_MODULES = [
  NmapScannerModule,
  SubfinderScannerModule,
  HttpxScannerModule,
  DnsxScannerModule,
  NaabuScannerModule,
  NucleiScannerModule,
];

@Module({
  imports: [ScannerSdkModule, ...SCANNER_MODULES],
  exports: [...SCANNER_MODULES],
})
export class AllScannersModule {}
```

Create `libs/scanners/all/src/index.ts`:

```typescript
export * from './all-scanners.module';
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm nx test scanners-all`
Expected: PASS.

- [ ] **Step 7: Wire the aggregator into the three consumers**

In `apps/scan-worker/src/app/app.module.ts`, replace the `NmapScannerModule` import line with:

```typescript
import { AllScannersModule } from '@autoscanner/scanners-all';
```

and in the `imports` array replace `NmapScannerModule` with `AllScannersModule`.

In `apps/api-gateway/src/app/scans/scans.module.ts`, replace the `NmapScannerModule` import with:

```typescript
import { AllScannersModule } from '@autoscanner/scanners-all';
```

and in the `imports` array replace `NmapScannerModule` with `AllScannersModule`.

In `apps/orchestrator-worker/src/app/app.module.ts`, replace the five individual scanner imports (`SubfinderScannerModule`, `HttpxScannerModule`, `DnsxScannerModule`, `NaabuScannerModule`, `NucleiScannerModule`) with the single:

```typescript
import { AllScannersModule } from '@autoscanner/scanners-all';
```

and in the `imports` array replace those five entries (and the explanatory comment) with `AllScannersModule`.

- [ ] **Step 8: Verify everything still type-checks and the existing scan-worker test passes**

Run: `pnpm nx test scan-worker && pnpm nx run scanners-all:type-check`
Expected: PASS (the existing `scan-job.processor.spec.ts` still resolves `nmap` from the registry via `AllScannersModule`).

- [ ] **Step 9: Commit**

```bash
git add libs/scanners/all tsconfig.base.json apps/scan-worker/src/app/app.module.ts apps/api-gateway/src/app/scans/scans.module.ts apps/orchestrator-worker/src/app/app.module.ts
git commit -m "feat(phase-6.1): AllScannersModule registers every scanner in all consumers"
```

---

## Task 2: Shared `hostlines-text` parser

The four new tools all emit newline-delimited hostnames on stdout. One parser serves all of them, mirroring the canonicalisation `SubfinderJsonParser` does (`lowercase`, strip trailing dot).

**Files:**
- Create: `libs/parsers/src/hostlines-text/hostlines-text.parser.ts`, `libs/parsers/src/hostlines-text/index.ts`
- Create: `libs/parsers/src/__tests__/fixtures/hostlines-sample.txt`
- Create: `libs/parsers/src/__tests__/hostlines-text.parser.spec.ts`
- Modify: `libs/parsers/src/parsers.module.ts`, `libs/parsers/src/index.ts`

- [ ] **Step 1: Create the fixture**

Create `libs/parsers/src/__tests__/fixtures/hostlines-sample.txt`:

```text
www.hackerone.com
api.hackerone.com

API.Hackerone.com
docs.hackerone.com.
# comment line should be ignored
support.hackerone.com
www.hackerone.com
```

- [ ] **Step 2: Write the failing parser test**

Create `libs/parsers/src/__tests__/hostlines-text.parser.spec.ts`:

```typescript
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HostlinesTextParser } from '../hostlines-text/hostlines-text.parser';
import type { ParserContext } from '../types';

const FIXTURE = readFileSync(join(__dirname, 'fixtures', 'hostlines-sample.txt'), 'utf8');

const ctx: ParserContext = {
  scanJobId: 'job_1',
  scannerName: 'findomain',
  target: 'hackerone.com',
  engagementId: 'eng_1',
};

describe('HostlinesTextParser', () => {
  const parser = new HostlinesTextParser();

  it('declares name and supported formats', () => {
    expect(parser.name).toBe('hostlines-text');
    expect(parser.formats).toEqual(['TEXT']);
  });

  it('parses newline-delimited hostnames into SUBDOMAIN assets', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    const values = out.assets.map((a) => a.value);
    expect(values).toContain('www.hackerone.com');
    expect(values).toContain('api.hackerone.com');
    expect(values).toContain('docs.hackerone.com');
    expect(values).toContain('support.hackerone.com');
    for (const a of out.assets) expect(a.type).toBe('SUBDOMAIN');
  });

  it('lowercases, strips trailing dots, skips blanks/comments, and dedupes', async () => {
    const out = await parser.parse(FIXTURE, ctx);
    const values = out.assets.map((a) => a.value);
    // API.Hackerone.com + www.hackerone.com (twice) collapse to one each
    expect(values.filter((v) => v === 'www.hackerone.com')).toHaveLength(1);
    expect(values.filter((v) => v === 'api.hackerone.com')).toHaveLength(1);
    // no comment line, no empty string, no trailing dot
    expect(values).not.toContain('');
    expect(values.some((v) => v.startsWith('#'))).toBe(false);
    expect(values.some((v) => v.endsWith('.'))).toBe(false);
  });

  it('returns an empty output for empty input', async () => {
    const out = await parser.parse('', ctx);
    expect(out.assets).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm nx test parsers -- --testPathPattern hostlines-text`
Expected: FAIL — `Cannot find module '../hostlines-text/hostlines-text.parser'`.

- [ ] **Step 4: Implement the parser**

Create `libs/parsers/src/hostlines-text/hostlines-text.parser.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

/**
 * Shared parser for tools that emit one hostname per stdout line
 * (findomain, amass passive, assetfinder, puredns). Canonicalises each host
 * (trim, lowercase, strip trailing dot), drops blanks and `#` comments, and
 * dedupes within a single run. Correlation handles cross-run / cross-scanner
 * merge downstream.
 */
@Injectable()
export class HostlinesTextParser implements Parser {
  readonly name = 'hostlines-text';
  readonly formats: RawOutputFormat[] = ['TEXT'];

  async parse(input: Buffer | string, _ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');
    const seen = new Set<string>();

    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const host = trimmed.toLowerCase().replace(/\.$/, '');
      if (!host || seen.has(host)) continue;
      seen.add(host);
      out.assets.push({ type: 'SUBDOMAIN', value: host });
    }

    return out;
  }
}
```

Create `libs/parsers/src/hostlines-text/index.ts`:

```typescript
export * from './hostlines-text.parser';
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm nx test parsers -- --testPathPattern hostlines-text`
Expected: PASS.

- [ ] **Step 6: Register the parser**

In `libs/parsers/src/index.ts`, add after the `subfinder-json` export line:

```typescript
export * from './hostlines-text';
```

In `libs/parsers/src/parsers.module.ts`:
- add the import: `import { HostlinesTextParser } from './hostlines-text';`
- add `HostlinesTextParser` to both the `providers` and `exports` arrays;
- add `private readonly hostlinesText: HostlinesTextParser,` to the constructor;
- add `this.registry.register(this.hostlinesText);` in `onModuleInit`.

- [ ] **Step 7: Run the full parsers suite**

Run: `pnpm nx test parsers`
Expected: PASS (all parser specs green, including the registry spec).

- [ ] **Step 8: Commit**

```bash
git add libs/parsers/src/hostlines-text libs/parsers/src/__tests__/hostlines-text.parser.spec.ts libs/parsers/src/__tests__/fixtures/hostlines-sample.txt libs/parsers/src/index.ts libs/parsers/src/parsers.module.ts
git commit -m "feat(phase-6.1): shared hostlines-text parser for plain-host scanners"
```

---

## Task 3: findomain scanner

**Files:**
- Create: `libs/scanners/findomain/{project.json,package.json,tsconfig.json,tsconfig.lib.json,tsconfig.spec.json,jest.config.ts}`
- Create: `libs/scanners/findomain/src/{index.ts,findomain.scanner.ts,findomain.module.ts}`
- Create: `libs/scanners/findomain/src/__tests__/findomain.scanner.spec.ts`
- Modify: `tsconfig.base.json`, `libs/scanners/all/src/all-scanners.module.ts`

- [ ] **Step 1: Scaffold the lib config files**

Create the six config files by copying `libs/scanners/subfinder/`'s equivalents, replacing every `subfinder` with `findomain`. Concretely:

`libs/scanners/findomain/project.json` — same as subfinder's with `"name": "scanners-findomain"`, `"sourceRoot": "libs/scanners/findomain/src"`, coverage/jestConfig/type-check paths swapped to `findomain`.

`libs/scanners/findomain/package.json` — same as subfinder's with `"name": "scanners-findomain"`.

`libs/scanners/findomain/tsconfig.json`, `tsconfig.lib.json`, `tsconfig.spec.json` — byte-identical to subfinder's (they use relative paths only).

`libs/scanners/findomain/jest.config.ts` — same as subfinder's with `displayName: 'scanners-findomain'` and `coverageDirectory: '../../../coverage/libs/scanners/findomain'`.

- [ ] **Step 2: Add the tsconfig path mapping**

In `tsconfig.base.json` `paths`, add next to the other scanner entries:

```json
      "@autoscanner/scanners-findomain": ["libs/scanners/findomain/src/index.ts"],
```

- [ ] **Step 3: Write the failing scanner test**

Create `libs/scanners/findomain/src/__tests__/findomain.scanner.spec.ts`:

```typescript
import { FindomainScanner } from '../findomain.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'job_1', engagementId: 'eng_1', scratchDir: '/tmp/scratch' };

describe('FindomainScanner', () => {
  it('declares name, docker, outputs, produces', () => {
    expect(FindomainScanner.name).toBe('findomain');
    expect(FindomainScanner.displayName).toBe('Findomain');
    expect(FindomainScanner.docker.image).toBe('edu4rdshl/findomain:9.0.4');
    expect(FindomainScanner.docker.network).toBe('bridge');
    expect(FindomainScanner.docker.readonlyRootfs).toBe(true);
    expect(FindomainScanner.outputs[0]).toEqual({
      format: 'TEXT',
      capture: 'stdout',
      parser: 'hostlines-text',
    });
    expect(FindomainScanner.produces).toContain('Subdomain');
  });

  it('inputSchema applies defaults', () => {
    expect(FindomainScanner.inputSchema.parse({})).toEqual({});
  });

  it('build() emits findomain quiet stdout for the target domain', () => {
    const input = FindomainScanner.inputSchema.parse({});
    const { cmd } = FindomainScanner.build(input, 'example.com', ctx);
    expect(cmd).toEqual(['findomain', '--target', 'example.com', '--quiet']);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm nx test scanners-findomain`
Expected: FAIL — `Cannot find module '../findomain.scanner'`.

- [ ] **Step 5: Implement the scanner + module + index**

Create `libs/scanners/findomain/src/findomain.scanner.ts`:

```typescript
import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const FindomainInput = z.object({});

export type FindomainInputType = z.infer<typeof FindomainInput>;

export const FindomainScanner: ScannerDefinition<FindomainInputType> = {
  name: 'findomain',
  displayName: 'Findomain',
  category: [ScannerCategory.SUBDOMAIN_ENUM, ScannerCategory.PASSIVE_RECON],
  description: 'Fast passive subdomain enumeration (findomain).',
  inputSchema: FindomainInput,
  docker: {
    // Pinned. If this tag 404s, pick the latest stable from
    // https://github.com/Findomain/Findomain/releases and update here + CI.
    image: 'edu4rdshl/findomain:9.0.4',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 600_000,
  },
  build(_input, target) {
    return { cmd: ['findomain', '--target', target, '--quiet'] };
  },
  outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'hostlines-text' }],
  produces: ['Asset', 'Subdomain'],
};
```

Create `libs/scanners/findomain/src/findomain.module.ts` (copy subfinder's module, swap names):

```typescript
import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { FindomainScanner } from './findomain.scanner';

@Module({ imports: [ScannerSdkModule] })
export class FindomainScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(FindomainScanner.name)) {
      this.registry.register(FindomainScanner);
    }
  }
}
```

Create `libs/scanners/findomain/src/index.ts`:

```typescript
export * from './findomain.scanner';
export * from './findomain.module';
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm nx test scanners-findomain`
Expected: PASS.

- [ ] **Step 7: Register in the aggregator**

In `libs/scanners/all/src/all-scanners.module.ts`:
- add `import { FindomainScannerModule } from '@autoscanner/scanners-findomain';`
- add `FindomainScannerModule` to the `SCANNER_MODULES` array.

Then in `libs/scanners/all/src/__tests__/all-scanners.module.spec.ts`, add `'findomain'` to the names array asserted present, and run `pnpm nx test scanners-all` → PASS.

- [ ] **Step 8: Commit**

```bash
git add libs/scanners/findomain libs/scanners/all/src/all-scanners.module.ts libs/scanners/all/src/__tests__/all-scanners.module.spec.ts tsconfig.base.json
git commit -m "feat(phase-6.1): add findomain scanner"
```

---

## Task 4: amass scanner (passive)

**Files:** same shape as Task 3, for `amass`.
- Create lib `libs/scanners/amass/` (config files by copying subfinder's, swapping `amass`).
- Modify: `tsconfig.base.json`, `libs/scanners/all/src/all-scanners.module.ts` + its spec.

- [ ] **Step 1: Scaffold config files** — copy subfinder's six config files into `libs/scanners/amass/`, replacing `subfinder` → `amass` (name `scanners-amass`, coverage/jest paths).

- [ ] **Step 2: tsconfig path** — add to `tsconfig.base.json` `paths`:

```json
      "@autoscanner/scanners-amass": ["libs/scanners/amass/src/index.ts"],
```

- [ ] **Step 3: Write the failing scanner test**

Create `libs/scanners/amass/src/__tests__/amass.scanner.spec.ts`:

```typescript
import { AmassScanner } from '../amass.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'job_1', engagementId: 'eng_1', scratchDir: '/tmp/scratch' };

describe('AmassScanner', () => {
  it('declares name, docker, outputs, produces', () => {
    expect(AmassScanner.name).toBe('amass');
    expect(AmassScanner.displayName).toBe('Amass (passive)');
    expect(AmassScanner.docker.image).toBe('caffix/amass:v4.2.0');
    expect(AmassScanner.outputs[0]).toEqual({
      format: 'TEXT',
      capture: 'stdout',
      parser: 'hostlines-text',
    });
    expect(AmassScanner.produces).toContain('Subdomain');
  });

  it('inputSchema applies the default timeout (minutes)', () => {
    expect(AmassScanner.inputSchema.parse({})).toEqual({ timeoutMinutes: 5 });
  });

  it('build() runs amass enum in passive mode with -timeout in minutes', () => {
    const input = AmassScanner.inputSchema.parse({});
    const { cmd } = AmassScanner.build(input, 'example.com', ctx);
    expect(cmd).toEqual([
      'amass', 'enum', '-passive', '-d', 'example.com', '-nocolor', '-timeout', '5',
    ]);
  });

  it('rejects out-of-range timeout', () => {
    expect(() => AmassScanner.inputSchema.parse({ timeoutMinutes: 0 })).toThrow();
    expect(() => AmassScanner.inputSchema.parse({ timeoutMinutes: 61 })).toThrow();
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm nx test scanners-amass`
Expected: FAIL — `Cannot find module '../amass.scanner'`.

- [ ] **Step 5: Implement scanner + module + index**

Create `libs/scanners/amass/src/amass.scanner.ts`:

```typescript
import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const AmassInput = z.object({
  // amass -timeout is in MINUTES. Capped to keep passive runs bounded.
  timeoutMinutes: z.number().int().min(1).max(60).default(5),
});

export type AmassInputType = z.infer<typeof AmassInput>;

export const AmassScanner: ScannerDefinition<AmassInputType> = {
  name: 'amass',
  displayName: 'Amass (passive)',
  category: [ScannerCategory.SUBDOMAIN_ENUM, ScannerCategory.PASSIVE_RECON],
  description: 'OWASP Amass subdomain enumeration, passive mode only.',
  inputSchema: AmassInput,
  docker: {
    image: 'caffix/amass:v4.2.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 1024,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 900_000,
  },
  build(input, target) {
    return {
      cmd: [
        'amass', 'enum', '-passive', '-d', target,
        '-nocolor', '-timeout', String(input.timeoutMinutes),
      ],
    };
  },
  outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'hostlines-text' }],
  produces: ['Asset', 'Subdomain'],
};
```

> Note: amass v4 `enum` prints discovered names to stdout (one per line); operational logs go to stderr (captured separately, not parsed). `memoryLimitMb`/`defaultTimeoutMs` are higher than subfinder's because amass is heavier even in passive mode.

Create `libs/scanners/amass/src/amass.module.ts` (copy findomain's module, swap `Findomain`→`Amass`, `findomain`→`amass`).

Create `libs/scanners/amass/src/index.ts`:

```typescript
export * from './amass.scanner';
export * from './amass.module';
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm nx test scanners-amass`
Expected: PASS.

- [ ] **Step 7: Register in the aggregator** — add the import + `AmassScannerModule` to `SCANNER_MODULES`, add `'amass'` to the aggregator spec's names array, run `pnpm nx test scanners-all` → PASS.

- [ ] **Step 8: Commit**

```bash
git add libs/scanners/amass libs/scanners/all tsconfig.base.json
git commit -m "feat(phase-6.1): add amass passive scanner"
```

---

## Task 5: assetfinder scanner (custom image)

`assetfinder` has no maintained official image, so we build one.

**Files:**
- Create: `docker/scanners/assetfinder/Dockerfile`
- Create: `tools/scanners/build-images.sh`
- Create lib `libs/scanners/assetfinder/` (config + src as in Task 3)
- Modify: `tsconfig.base.json`, `libs/scanners/all/src/all-scanners.module.ts` + spec, `package.json`

- [ ] **Step 1: Write the Dockerfile**

Create `docker/scanners/assetfinder/Dockerfile`:

```dockerfile
# Builds a minimal image carrying the assetfinder binary.
FROM golang:1.22-alpine AS build
RUN apk add --no-cache git \
 && go install github.com/tomnomnom/assetfinder@latest

FROM alpine:3.20
RUN adduser -D -u 10001 scanner
COPY --from=build /go/bin/assetfinder /usr/local/bin/assetfinder
USER scanner
ENTRYPOINT []
```

- [ ] **Step 2: Write the image build script**

Create `tools/scanners/build-images.sh`:

```bash
#!/usr/bin/env bash
# Builds the custom scanner images that have no pinnable upstream image.
# Run once locally before scanning, and in CI before the e2e job.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

docker build -t autoscanner/assetfinder:1.0 "$ROOT/docker/scanners/assetfinder"
docker build -t autoscanner/puredns:1.0 "$ROOT/docker/scanners/puredns"

echo "Built: autoscanner/assetfinder:1.0, autoscanner/puredns:1.0"
```

Make it executable and add a script to `package.json` `scripts`:

```json
    "scanners:build": "bash tools/scanners/build-images.sh",
```

Run: `chmod +x tools/scanners/build-images.sh`

- [ ] **Step 3: Scaffold the lib config files** — copy subfinder's six config files into `libs/scanners/assetfinder/`, replacing `subfinder` → `assetfinder` (name `scanners-assetfinder`).

- [ ] **Step 4: tsconfig path** — add to `tsconfig.base.json` `paths`:

```json
      "@autoscanner/scanners-assetfinder": ["libs/scanners/assetfinder/src/index.ts"],
```

- [ ] **Step 5: Write the failing scanner test**

Create `libs/scanners/assetfinder/src/__tests__/assetfinder.scanner.spec.ts`:

```typescript
import { AssetfinderScanner } from '../assetfinder.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'job_1', engagementId: 'eng_1', scratchDir: '/tmp/scratch' };

describe('AssetfinderScanner', () => {
  it('declares name, docker, outputs, produces', () => {
    expect(AssetfinderScanner.name).toBe('assetfinder');
    expect(AssetfinderScanner.displayName).toBe('Assetfinder');
    expect(AssetfinderScanner.docker.image).toBe('autoscanner/assetfinder:1.0');
    expect(AssetfinderScanner.outputs[0]).toEqual({
      format: 'TEXT',
      capture: 'stdout',
      parser: 'hostlines-text',
    });
    expect(AssetfinderScanner.produces).toContain('Subdomain');
  });

  it('build() runs assetfinder with --subs-only for the target', () => {
    const input = AssetfinderScanner.inputSchema.parse({});
    const { cmd } = AssetfinderScanner.build(input, 'example.com', ctx);
    expect(cmd).toEqual(['assetfinder', '--subs-only', 'example.com']);
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `pnpm nx test scanners-assetfinder`
Expected: FAIL — `Cannot find module '../assetfinder.scanner'`.

- [ ] **Step 7: Implement scanner + module + index**

Create `libs/scanners/assetfinder/src/assetfinder.scanner.ts`:

```typescript
import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const AssetfinderInput = z.object({});

export type AssetfinderInputType = z.infer<typeof AssetfinderInput>;

export const AssetfinderScanner: ScannerDefinition<AssetfinderInputType> = {
  name: 'assetfinder',
  displayName: 'Assetfinder',
  category: [ScannerCategory.SUBDOMAIN_ENUM, ScannerCategory.PASSIVE_RECON],
  description: 'Passive subdomain discovery (assetfinder). Custom-built image.',
  inputSchema: AssetfinderInput,
  docker: {
    // Built locally via tools/scanners/build-images.sh — not on a registry.
    image: 'autoscanner/assetfinder:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 300_000,
  },
  build(_input, target) {
    return { cmd: ['assetfinder', '--subs-only', target] };
  },
  outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'hostlines-text' }],
  produces: ['Asset', 'Subdomain'],
};
```

Create `libs/scanners/assetfinder/src/assetfinder.module.ts` (copy findomain's module, swap names) and `src/index.ts` (export scanner + module).

- [ ] **Step 8: Run the test to verify it passes**

Run: `pnpm nx test scanners-assetfinder`
Expected: PASS.

- [ ] **Step 9: Register in the aggregator** — add import + `AssetfinderScannerModule` to `SCANNER_MODULES`, add `'assetfinder'` to aggregator spec, `pnpm nx test scanners-all` → PASS.

- [ ] **Step 10: Build the image and smoke-test it**

Run: `pnpm scanners:build && docker run --rm autoscanner/assetfinder:1.0 assetfinder --subs-only example.com`
Expected: prints a few `*.example.com` lines (network permitting) and exits 0.

- [ ] **Step 11: Commit**

```bash
git add libs/scanners/assetfinder libs/scanners/all docker/scanners/assetfinder tools/scanners/build-images.sh package.json tsconfig.base.json
git commit -m "feat(phase-6.1): add assetfinder scanner + custom image"
```

---

## Task 6: puredns scanner (custom image, brute + resolve)

`puredns` needs `massdns`, a resolvers list, and a wordlist. We bundle small defaults into the image; both are overridable by input. In `recon-passive-deep` puredns runs in **bruteforce** mode against the root domain (genuinely additive); standalone it can also resolve a piped host list.

**Files:**
- Create: `docker/scanners/puredns/Dockerfile`, `docker/scanners/puredns/resolvers.txt`, `docker/scanners/puredns/wordlist.txt`
- Create lib `libs/scanners/puredns/`
- Modify: `tsconfig.base.json`, `libs/scanners/all/src/all-scanners.module.ts` + spec

- [ ] **Step 1: Write the bundled resolvers + wordlist**

Create `docker/scanners/puredns/resolvers.txt`:

```text
1.1.1.1
1.0.0.1
8.8.8.8
8.8.4.4
9.9.9.9
```

Create `docker/scanners/puredns/wordlist.txt` (small default — keeps brute-force fast and deterministic; operators override via input for deeper runs):

```text
www
mail
api
dev
staging
test
admin
portal
vpn
blog
app
m
ftp
ns1
ns2
webmail
remote
secure
support
docs
```

- [ ] **Step 2: Write the Dockerfile**

Create `docker/scanners/puredns/Dockerfile`:

```dockerfile
# Builds an image carrying massdns + puredns and bundled defaults.
FROM golang:1.22-bookworm AS gobuild
RUN go install github.com/d3mondev/puredns/v2@latest

FROM debian:bookworm-slim AS massdns
RUN apt-get update \
 && apt-get install -y --no-install-recommends git gcc make libc6-dev ca-certificates \
 && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 https://github.com/blechschmidt/massdns.git /src/massdns \
 && make -C /src/massdns

FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && useradd -u 10001 -m scanner
COPY --from=gobuild /go/bin/puredns /usr/local/bin/puredns
COPY --from=massdns /src/massdns/bin/massdns /usr/local/bin/massdns
COPY resolvers.txt /etc/puredns/resolvers.txt
COPY wordlist.txt /etc/puredns/wordlist.txt
USER scanner
ENTRYPOINT []
```

- [ ] **Step 3: tsconfig path** — add to `tsconfig.base.json` `paths`:

```json
      "@autoscanner/scanners-puredns": ["libs/scanners/puredns/src/index.ts"],
```

- [ ] **Step 4: Scaffold the lib config files** — copy subfinder's six config files into `libs/scanners/puredns/`, replacing `subfinder` → `puredns`.

- [ ] **Step 5: Write the failing scanner test**

Create `libs/scanners/puredns/src/__tests__/puredns.scanner.spec.ts`:

```typescript
import { PurednsScanner } from '../puredns.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'job_1', engagementId: 'eng_1', scratchDir: '/tmp/scratch' };

describe('PurednsScanner', () => {
  it('declares name, docker, outputs, produces', () => {
    expect(PurednsScanner.name).toBe('puredns');
    expect(PurednsScanner.displayName).toBe('puredns');
    expect(PurednsScanner.docker.image).toBe('autoscanner/puredns:1.0');
    expect(PurednsScanner.outputs[0]).toEqual({
      format: 'TEXT',
      capture: 'stdout',
      parser: 'hostlines-text',
    });
    expect(PurednsScanner.produces).toContain('Subdomain');
  });

  it('inputSchema defaults to bruteforce with the bundled wordlist', () => {
    expect(PurednsScanner.inputSchema.parse({})).toEqual({
      mode: 'bruteforce',
      wordlist: '/etc/puredns/wordlist.txt',
    });
  });

  it('build() in bruteforce mode runs against the target domain with bundled lists', () => {
    const input = PurednsScanner.inputSchema.parse({});
    const built = PurednsScanner.build(input, 'example.com', ctx);
    expect(built.cmd).toEqual([
      'puredns', 'bruteforce', '/etc/puredns/wordlist.txt', 'example.com',
      '--resolvers', '/etc/puredns/resolvers.txt', '--quiet',
    ]);
    expect(built.stdin).toBeUndefined();
  });

  it('build() in resolve mode reads the target list from stdin', () => {
    const input = PurednsScanner.inputSchema.parse({ mode: 'resolve' });
    const built = PurednsScanner.build(input, 'sub.example.com', ctx);
    expect(built.cmd).toEqual([
      'puredns', 'resolve', '--resolvers', '/etc/puredns/resolvers.txt', '--quiet',
    ]);
    expect(built.stdin).toBe('sub.example.com');
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `pnpm nx test scanners-puredns`
Expected: FAIL — `Cannot find module '../puredns.scanner'`.

- [ ] **Step 7: Implement scanner + module + index**

Create `libs/scanners/puredns/src/puredns.scanner.ts`:

```typescript
import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const RESOLVERS = '/etc/puredns/resolvers.txt';

const PurednsInput = z.object({
  // `bruteforce`: enumerate <wordlist>.<target> (active, additive — default in
  // recon-passive-deep). `resolve`: validate a piped host list from stdin.
  mode: z.enum(['bruteforce', 'resolve']).default('bruteforce'),
  wordlist: z.string().default('/etc/puredns/wordlist.txt'),
});

export type PurednsInputType = z.infer<typeof PurednsInput>;

export const PurednsScanner: ScannerDefinition<PurednsInputType> = {
  name: 'puredns',
  displayName: 'puredns',
  category: [ScannerCategory.SUBDOMAIN_ENUM, ScannerCategory.DNS],
  description: 'DNS brute-force / mass-resolve via massdns (puredns). Custom-built image.',
  inputSchema: PurednsInput,
  docker: {
    image: 'autoscanner/puredns:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 1024,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 900_000,
  },
  build(input, target) {
    if (input.mode === 'resolve') {
      return {
        cmd: ['puredns', 'resolve', '--resolvers', RESOLVERS, '--quiet'],
        stdin: target,
      };
    }
    return {
      cmd: [
        'puredns', 'bruteforce', input.wordlist, target,
        '--resolvers', RESOLVERS, '--quiet',
      ],
    };
  },
  outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'hostlines-text' }],
  produces: ['Asset', 'Subdomain'],
};
```

Create `libs/scanners/puredns/src/puredns.module.ts` (copy findomain's module, swap names) and `src/index.ts`.

- [ ] **Step 8: Run the test to verify it passes**

Run: `pnpm nx test scanners-puredns`
Expected: PASS.

- [ ] **Step 9: Register in the aggregator** — add import + `PurednsScannerModule` to `SCANNER_MODULES`, add `'puredns'` to aggregator spec, `pnpm nx test scanners-all` → PASS.

- [ ] **Step 10: Build the image and smoke-test it**

Run: `pnpm scanners:build && docker run --rm autoscanner/puredns:1.0 puredns bruteforce /etc/puredns/wordlist.txt example.com --resolvers /etc/puredns/resolvers.txt --quiet`
Expected: prints any resolving `*.example.com` hosts and exits 0.

- [ ] **Step 11: Commit**

```bash
git add libs/scanners/puredns libs/scanners/all docker/scanners/puredns tsconfig.base.json
git commit -m "feat(phase-6.1): add puredns scanner + custom image"
```

---

## Task 7: `recon-passive-deep` template

**Files:**
- Create: `libs/templates/src/builtins/recon-passive-deep.ts`
- Modify: `libs/templates/src/builtins/index.ts`
- Create: `libs/templates/src/__tests__/recon-passive-deep.spec.ts` (if `libs/templates/src/__tests__/` does not exist, create it)

- [ ] **Step 1: Write the failing template test**

Create `libs/templates/src/__tests__/recon-passive-deep.spec.ts`:

```typescript
import { BUILTIN_TEMPLATES } from '../builtins';
import { ReconPassiveDeep } from '../builtins/recon-passive-deep';

describe('recon-passive-deep template', () => {
  it('is registered in BUILTIN_TEMPLATES', () => {
    expect(BUILTIN_TEMPLATES.map((t) => t.name)).toContain('recon-passive-deep');
  });

  it('fans four passive sources off the root target then resolves + fingerprints', () => {
    expect(ReconPassiveDeep.name).toBe('recon-passive-deep');
    const scanners = ReconPassiveDeep.steps.map((s) => s.scannerName);
    expect(scanners).toEqual([
      'subfinder', 'assetfinder', 'findomain', 'amass', 'puredns', 'dnsx', 'httpx',
    ]);
  });

  it('runs the four enumerators + puredns against the root target', () => {
    for (const name of ['subfinder', 'assetfinder', 'findomain', 'amass', 'puredns']) {
      const step = ReconPassiveDeep.steps.find((s) => s.scannerName === name)!;
      expect(step.target).toEqual({ kind: 'context', path: 'target' });
    }
  });

  it('resolves + fingerprints over the discovered subdomain set', () => {
    for (const name of ['dnsx', 'httpx']) {
      const step = ReconPassiveDeep.steps.find((s) => s.scannerName === name)!;
      expect(step.target).toEqual({ kind: 'context', path: 'subdomains' });
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm nx test templates -- --testPathPattern recon-passive-deep`
Expected: FAIL — `Cannot find module '../builtins/recon-passive-deep'`.

- [ ] **Step 3: Implement the template**

Create `libs/templates/src/builtins/recon-passive-deep.ts`:

```typescript
import type { TemplateDefinition } from '../types';

/**
 * Phase 6.1 — broad passive subdomain discovery.
 *
 * Four enumerators (subfinder, assetfinder, findomain, amass-passive) plus a
 * puredns brute-force all run against the root `target`; the correlation
 * engine merges their findings into one Subdomain set (multi-source provenance
 * via AssetObservation). `dnsx` then resolves the union and `httpx`
 * fingerprints it. Steps are linear (Phase 2 execution model); the passive
 * tools are cheap so sequential cost is acceptable.
 */
export const ReconPassiveDeep: TemplateDefinition = {
  name: 'recon-passive-deep',
  displayName: 'Passive Recon (deep)',
  description:
    'Multi-source passive subdomain enumeration (subfinder, assetfinder, findomain, amass) + puredns brute-force, then DNS resolution and HTTP fingerprinting.',
  steps: [
    { scannerName: 'subfinder', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'assetfinder', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'findomain', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'amass', inputs: {}, target: { kind: 'context', path: 'target' } },
    {
      scannerName: 'puredns',
      inputs: { mode: { kind: 'static', value: 'bruteforce' } },
      target: { kind: 'context', path: 'target' },
    },
    { scannerName: 'dnsx', inputs: {}, target: { kind: 'context', path: 'subdomains' } },
    {
      scannerName: 'httpx',
      inputs: { techDetect: { kind: 'static', value: true } },
      target: { kind: 'context', path: 'subdomains' },
    },
  ],
};
```

- [ ] **Step 4: Register in BUILTIN_TEMPLATES**

In `libs/templates/src/builtins/index.ts`:
- add `import { ReconPassiveDeep } from './recon-passive-deep';`
- add `ReconPassiveDeep` to the `export { ... }` line;
- add `ReconPassiveDeep` to the `BUILTIN_TEMPLATES` array (after `ReconActive`).

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm nx test templates`
Expected: PASS.

- [ ] **Step 6: Seed it (verification only — seed reads BUILTIN_TEMPLATES)**

`prisma/seed.ts` `seedBuiltinTemplates` upserts every entry of `BUILTIN_TEMPLATES`, so no seed code change is needed. With the dev stack up (`pnpm dev:up`), run `pnpm seed` and confirm the log line `[seed] upserted scan template: recon-passive-deep`. (Skip if no local Postgres — CI seeds before e2e.)

- [ ] **Step 7: Commit**

```bash
git add libs/templates/src/builtins/recon-passive-deep.ts libs/templates/src/builtins/index.ts libs/templates/src/__tests__/recon-passive-deep.spec.ts
git commit -m "feat(phase-6.1): add recon-passive-deep template"
```

---

## Task 8: `recon-passive-deep-e2e` acceptance scenario

Mirrors `recon-passive-e2e.spec.ts`, adding the multi-source assertion via `assetDetail(id).scannerSources`. Env-gated: skips unless `E2E_API_URL` + `E2E_EMAIL` + `E2E_PASSWORD` are set.

**Files:**
- Create: `apps/api-gateway-e2e/src/scenarios/recon-passive-deep-e2e.spec.ts`
- Modify: `apps/api-gateway-e2e/src/helpers/queries.ts` (add a `assetScannerSources` helper)
- Modify: `apps/api-gateway-e2e/src/helpers/index.ts` (export the new helper)

- [ ] **Step 1: Add the GraphQL helper**

In `apps/api-gateway-e2e/src/helpers/queries.ts`, add (follow the existing `graphql-request` style used by `queryAssetsFull` in the same file):

```typescript
/**
 * Returns the distinct scanner names that observed a given asset
 * (AssetDetail.scannerSources). Used to prove multi-source merge.
 */
export async function assetScannerSources(
  gql: GraphQLClient,
  assetId: string,
): Promise<string[]> {
  const query = /* GraphQL */ `
    query AssetSources($id: ID!) {
      assetDetail(id: $id) {
        id
        scannerSources
      }
    }
  `;
  const data = await gql.request<{ assetDetail: { id: string; scannerSources: string[] } }>(
    query,
    { id: assetId },
  );
  return data.assetDetail.scannerSources;
}
```

- [ ] **Step 2: Export the helper**

In `apps/api-gateway-e2e/src/helpers/index.ts`, ensure `assetScannerSources` is exported (if the file re-exports `./queries` with `export *`, no change is needed; otherwise add it explicitly).

- [ ] **Step 3: Write the e2e scenario**

Create `apps/api-gateway-e2e/src/scenarios/recon-passive-deep-e2e.spec.ts`:

```typescript
/**
 * Phase 6.1 acceptance: recon-passive-deep template end-to-end.
 *
 * Opt-in: skips unless E2E_API_URL + E2E_EMAIL + E2E_PASSWORD are set.
 * Assumes the full stack is running (api-gateway + scan-worker +
 * parser-worker + orchestrator-worker + Docker daemon) with the four new
 * scanner images available: edu4rdshl/findomain, caffix/amass,
 * autoscanner/assetfinder:1.0, autoscanner/puredns:1.0 (run
 * `pnpm scanners:build` + pre-pull the registry images first).
 *
 * Required env: E2E_API_URL, E2E_EMAIL, E2E_PASSWORD
 * Optional: E2E_TEMPLATE_TARGET (default hackerone.com),
 *           E2E_TEMPLATE_TIMEOUT_MS (default 600000),
 *           E2E_SUBDOMAIN_MIN_COUNT (default 5),
 *           E2E_MIN_DISTINCT_SOURCES (default 3)
 */

import type { GraphQLClient } from 'graphql-request';
import {
  assertCanonicalOverlap,
  assertLastSeenRefreshed,
  assertWithinPercent,
  assetScannerSources,
  authedGqlClient,
  createEngagementWithWildcardScope,
  describeOrSkipE2E,
  filterAssetsByType,
  pollTemplateRun,
  queryAssetsFull,
  readBaseEnv,
  restLogin,
  runTemplate,
} from '../helpers';

const env = readBaseEnv();
const target = process.env['E2E_TEMPLATE_TARGET'] ?? 'hackerone.com';
const templateName = 'recon-passive-deep';
const templateTimeoutMs = Number(process.env['E2E_TEMPLATE_TIMEOUT_MS'] ?? 600_000);
const subdomainMinCount = Number(process.env['E2E_SUBDOMAIN_MIN_COUNT'] ?? 5);
const minDistinctSources = Number(process.env['E2E_MIN_DISTINCT_SOURCES'] ?? 3);

describeOrSkipE2E(env)('Phase 6.1 — recon-passive-deep end-to-end', () => {
  let gql: GraphQLClient;
  let engagementId: string;

  beforeAll(async () => {
    const auth = await restLogin(env.apiUrl!, env.email!, env.password!);
    gql = authedGqlClient(env.apiUrl!, auth.accessToken);
    const { engagementId: id } = await createEngagementWithWildcardScope(gql, {
      namePrefix: 'e2e-recon-deep',
      clientName: 'e2e-client',
      target,
    });
    engagementId = id;
  }, 60_000);

  it(
    'discovers subdomains from >=3 sources, merges them, and is idempotent',
    async () => {
      // ---- First run -----------------------------------------------------
      const firstRun = await runTemplate(gql, { engagementId, templateName, target });
      const firstTerminal = await pollTemplateRun(gql, firstRun.id, templateTimeoutMs);
      expect(firstTerminal.status).toBe('COMPLETED');

      const firstAssets = await queryAssetsFull(gql, engagementId);
      const firstSubdomains = filterAssetsByType(firstAssets, 'SUBDOMAIN');
      expect(firstSubdomains.length).toBeGreaterThanOrEqual(subdomainMinCount);

      // ---- Multi-source assertions --------------------------------------
      const sourceSets = await Promise.all(
        firstSubdomains.map((s) => assetScannerSources(gql, s.id)),
      );
      const distinctSources = new Set(sourceSets.flat());
      expect(distinctSources.size).toBeGreaterThanOrEqual(minDistinctSources);
      // At least one subdomain was seen by >=2 sources (proves merge, not just union).
      expect(sourceSets.some((set) => set.length >= 2)).toBe(true);

      // ---- Second run (idempotence) -------------------------------------
      const secondRun = await runTemplate(gql, { engagementId, templateName, target });
      expect(secondRun.id).not.toBe(firstRun.id);
      const secondTerminal = await pollTemplateRun(gql, secondRun.id, templateTimeoutMs);
      expect(secondTerminal.status).toBe('COMPLETED');

      const secondAssets = await queryAssetsFull(gql, engagementId);
      const secondSubdomains = filterAssetsByType(secondAssets, 'SUBDOMAIN');

      assertWithinPercent(firstSubdomains.length, secondSubdomains.length, 'SUBDOMAIN');
      assertCanonicalOverlap(firstSubdomains, secondSubdomains);
      assertLastSeenRefreshed(firstSubdomains, secondSubdomains);
    },
    templateTimeoutMs * 2 + 60_000,
  );
});
```

- [ ] **Step 4: Type-check the e2e project**

Run: `pnpm nx run api-gateway-e2e:lint` (or `tsc -p apps/api-gateway-e2e/tsconfig.json --noEmit` if no lint target)
Expected: PASS — confirms all imported helpers exist and types line up. (The suite itself skips without the live-stack env vars; that's expected.)

- [ ] **Step 5: (Optional, requires live stack) run the suite**

With the full stack up and images built/pulled:

```bash
E2E_API_URL=http://localhost:4000 E2E_EMAIL=<op> E2E_PASSWORD=<pw> \
E2E_TEMPLATE_TARGET=hackerone.com pnpm nx e2e api-gateway-e2e
```
Expected: the `recon-passive-deep` test passes; without the env vars it skips.

- [ ] **Step 6: Commit**

```bash
git add apps/api-gateway-e2e/src/scenarios/recon-passive-deep-e2e.spec.ts apps/api-gateway-e2e/src/helpers/queries.ts apps/api-gateway-e2e/src/helpers/index.ts
git commit -m "test(phase-6.1): recon-passive-deep e2e with multi-source assertions"
```

---

## Task 9: CI image wiring + README

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`

- [ ] **Step 1: Build custom images + pre-pull registry images in CI**

In `.github/workflows/ci.yml`, in the job that runs the e2e suite (the one with Postgres/Redis/MinIO services), add a step BEFORE the e2e step that builds the custom images and pre-pulls the registry ones. Match the existing step indentation/style:

```yaml
      - name: Build + pull scanner images
        run: |
          pnpm scanners:build
          docker pull edu4rdshl/findomain:9.0.4
          docker pull caffix/amass:v4.2.0
```

(If the e2e currently runs without `E2E_TARGET` and therefore skips, leave that gating as-is — this step is cheap and readies the images for when the e2e is enabled.)

- [ ] **Step 2: Document Phase 6.1 in the README**

In `README.md`, add a `## Phase 6.1 — broad passive recon` section after the existing phase sections. Include:
- the four new scanners and the `recon-passive-deep` template;
- the custom-image build step: `pnpm scanners:build` (needed before running `assetfinder`/`puredns` locally or in CI);
- a CLI example: `node dist/apps/cli/main.js template run -e <id> --template recon-passive-deep --target client.com` (if the `template run` CLI command exists; otherwise show the `runTemplate` GraphQL mutation);
- a note that `amass` runs passive-only and `puredns` brute-forces with a small bundled wordlist (override via scanner input).

Write the section in the same terse, example-driven style as the existing Phase 1 section.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml README.md
git commit -m "ci(phase-6.1): build/pull scanner images; docs: phase 6.1 section"
```

---

## Final verification

- [ ] **Run the full affected test + type-check sweep**

```bash
pnpm nx run-many -t test --projects=scanners-all,scanners-findomain,scanners-amass,scanners-assetfinder,scanners-puredns,parsers,templates
pnpm nx run-many -t type-check --projects=scanners-all,scanners-findomain,scanners-amass,scanners-assetfinder,scanners-puredns
pnpm nx test scan-worker
pnpm lint
```
Expected: all PASS. This proves the new libs build, the parser/template tests pass, and the registration refactor didn't break scan-worker.

- [ ] **Confirm the docs/spec acceptance is met**

Cross-check against spec §4.7: with a live stack, `recon-passive-deep` yields subdomains from ≥3 sources (asserted via `scannerSources`), ≥1 asset has ≥2 sources, and a re-run inserts 0 new subdomains with `lastSeenAt` refreshed. The env-gated e2e encodes exactly these.

---

## Self-Review notes (resolved)

- **Spec coverage:** §4.2 tools → Tasks 3-6; §4.3 (no new tables) → honoured, parser reuses `SUBDOMAIN`; §4.4 parsers → Task 2 shared parser; §4.5 correlation merge → exercised by the e2e multi-source assertion (Task 8); §4.6 template → Task 7; §4.7 acceptance → Task 8; §4.8 custom images → Tasks 5-6 + 9.
- **Surfaced deviation:** §4.3 says puredns populates `IpAddress`; this plan defers IP attribution to the `dnsx` step and has puredns emit only `SUBDOMAIN` (documented in "Context" above).
- **Surfaced pre-existing bug:** scan-worker + api-gateway only registered `nmap`; Task 1 fixes this so the feature (and existing Phase 2 scanners) actually run standalone and in templates.
- **Type consistency:** parser name `hostlines-text` and scanner `outputs[].parser` match across Tasks 2-6; template scanner names match the registered scanner `name`s; `scannerSources` field name matches `AssetDetailObject`.
