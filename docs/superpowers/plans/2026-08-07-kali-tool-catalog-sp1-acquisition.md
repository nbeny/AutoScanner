# Kali Tool Catalog — SP1 (acquisition Docker-first) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a versioned, normalized dataset of Kali tools (description, links, help text, best-effort options) generated offline by introspecting a Kali container, and serve it through GraphQL — the data foundation consumed by SP2 (enriched forms) and SP3 (free runner).

**Architecture:** Pure functions (types, help-parser, normalizer, loader) live under `apps/api-gateway/src/app/tools/kali/` so both the NestJS resolver and a `tsx` host generator import them. Generation is a two-step offline job: a disposable Kali container captures raw introspection to JSONL (`capture.sh`), then a host script (`generate.ts`) normalizes it into `data/kali-tools.json` (committed). The API loads that JSON at boot and exposes `kaliTools` / `kaliTool(binary)` queries; `scannerCatalog` gains a `kaliToolRef` cross-link.

**Tech Stack:** TypeScript, NestJS 11 + `@nestjs/graphql` (code-first `@ObjectType`), Jest, `tsx` for the host script, Docker (kali-rolling) for capture, bash.

**Repo policy note:** the default branch is `main`; create a feature branch before the first commit (`git checkout -b feat/kali-tool-catalog-sp1`). Do not push without the user's consent.

**Spec:** `docs/superpowers/specs/2026-08-07-kali-tool-catalog-sp1-acquisition-design.md`

---

## File Structure

- `apps/api-gateway/src/app/tools/kali/types.ts` — shared TS types (records, options).
- `apps/api-gateway/src/app/tools/kali/parse-help.ts` — `parseHelpOptions()` (pure).
- `apps/api-gateway/src/app/tools/kali/normalize.ts` — `normalizeRecord()` (pure).
- `apps/api-gateway/src/app/tools/kali/load-dataset.ts` — `loadKaliDataset()` (fs read).
- `apps/api-gateway/src/app/tools/kali/scanner-kali-map.ts` — wrapper overrides for `kaliToolRef`.
- `apps/api-gateway/src/app/tools/kali/__tests__/*.spec.ts` — unit tests + fixtures.
- `apps/api-gateway/src/app/tools/dto/kali-tool.object.ts` — GraphQL DTOs.
- `apps/api-gateway/src/app/tools/kali-catalog.service.ts` — list/detail/lookup service.
- `apps/api-gateway/src/app/tools/tools.resolver.ts` — add `kaliTools` / `kaliTool` queries (modify).
- `apps/api-gateway/src/app/tools/scanner-catalog.service.ts` — add `kaliToolRef` (modify).
- `apps/api-gateway/src/app/tools/dto/scanner-catalog.object.ts` — add `kaliToolRef` field (modify).
- `apps/api-gateway/src/app/tools/tools.module.ts` — provide dataset + service (modify).
- `data/kali-tools.json` — committed dataset (seed, then regenerated).
- `tools/kali-catalog/Dockerfile.kali-catalog` — capture image.
- `tools/kali-catalog/capture.sh` — in-container introspection → raw JSONL.
- `tools/kali-catalog/generate.ts` — host: raw JSONL → `data/kali-tools.json`.
- `tools/kali-catalog/run.sh` — orchestrates build+run+generate.
- `tools/kali-catalog/README.md` — regeneration docs.
- `tools/kali-catalog/__fixtures__/raw-sample.jsonl` — fixture for generate test.
- `package.json` — add `kali:catalog` script (modify).

---

## Task 1: Types + help parser

**Files:**
- Create: `apps/api-gateway/src/app/tools/kali/types.ts`
- Create: `apps/api-gateway/src/app/tools/kali/parse-help.ts`
- Test: `apps/api-gateway/src/app/tools/kali/__tests__/parse-help.spec.ts`

- [ ] **Step 1: Create the shared types**

```ts
// apps/api-gateway/src/app/tools/kali/types.ts
export interface KaliToolOption {
  /** Primary flag, e.g. "-sV" or "--rate". */
  flag: string;
  /** Argument placeholder if any, e.g. "<port ranges>", "URL"; null when the flag takes no value. */
  argHint: string | null;
  description: string;
}

export type ParseConfidence = 'high' | 'low' | 'none';

/** One introspected Kali binary (post-normalization) — the committed dataset shape. */
export interface KaliToolRecord {
  package: string;
  binary: string;
  displayName: string;
  description: string;
  homepage: string | null;
  categories: string[];
  helpTextRaw: string | null;
  options: KaliToolOption[];
  parseConfidence: ParseConfidence;
  manAvailable: boolean;
  source: 'kali-docker';
  kaliRelease: string;
  capturedAt: string;
}

/** Raw per-binary capture emitted by capture.sh (pre-normalization). */
export interface RawCapture {
  package: string;
  binary: string;
  description: string;
  homepage: string | null;
  categories: string[];
  helpTextRaw: string | null;
  manAvailable: boolean;
}
```

- [ ] **Step 2: Write the failing parser test**

```ts
// apps/api-gateway/src/app/tools/kali/__tests__/parse-help.spec.ts
import { parseHelpOptions } from '../parse-help';

describe('parseHelpOptions', () => {
  it('returns none for empty help', () => {
    expect(parseHelpOptions('')).toEqual({ options: [], confidence: 'none' });
    expect(parseHelpOptions('   \n  ')).toEqual({ options: [], confidence: 'none' });
  });

  it('parses getopt-style options (flag, argHint, description)', () => {
    const help = [
      'Options:',
      '  -h, --help            Show help',
      '  -p <ports>            Only scan these ports',
      '  -sV                   Probe service/version',
    ].join('\n');
    expect(parseHelpOptions(help)).toEqual({
      confidence: 'high',
      options: [
        { flag: '-h', argHint: null, description: 'Show help' },
        { flag: '-p', argHint: '<ports>', description: 'Only scan these ports' },
        { flag: '-sV', argHint: null, description: 'Probe service/version' },
      ],
    });
  });

  it('parses argparse-style ALLCAPS arg hints and long flags', () => {
    const help = [
      'optional arguments:',
      '  -u URL, --url URL     Target URL',
      '  --threads N           Number of threads',
    ].join('\n');
    expect(parseHelpOptions(help)).toEqual({
      confidence: 'low',
      options: [
        { flag: '-u', argHint: 'URL', description: 'Target URL' },
        { flag: '--threads', argHint: null, description: 'Number of threads' },
      ],
    });
  });

  it('picks up a description from the next indented continuation line', () => {
    const help = ['  --rate\n              Requests per second'].join('\n');
    expect(parseHelpOptions(help)).toEqual({
      confidence: 'low',
      options: [{ flag: '--rate', argHint: null, description: 'Requests per second' }],
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm nx test api-gateway --testFile=parse-help.spec.ts`
Expected: FAIL — `Cannot find module '../parse-help'`.

- [ ] **Step 4: Implement the parser**

```ts
// apps/api-gateway/src/app/tools/kali/parse-help.ts
import type { KaliToolOption, ParseConfidence } from './types';

const FLAG_RE = /^\s{1,10}(-{1,2}[A-Za-z0-9][A-Za-z0-9-]*)/;
// Arg placeholder inside the pre-description segment: <...>, [...], or an ALLCAPS token (>=2 chars).
const ARG_RE = /<[^>]+>|\[[^\]]+\]|\b[A-Z][A-Z0-9_]+\b/;

export function parseHelpOptions(help: string): {
  options: KaliToolOption[];
  confidence: ParseConfidence;
} {
  if (!help || !help.trim()) return { options: [], confidence: 'none' };

  const lines = help.split(/\r?\n/);
  const options: KaliToolOption[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fm = line.match(FLAG_RE);
    if (!fm) continue;

    const flag = fm[1];
    const afterFlag = line.slice(fm[0].length);
    // Description starts after the first run of 2+ spaces; everything before is aliases/arg.
    const gap = afterFlag.search(/\s{2,}/);
    const preGap = gap === -1 ? afterFlag : afterFlag.slice(0, gap);
    let description = gap === -1 ? '' : afterFlag.slice(gap).trim();

    const ah = preGap.match(ARG_RE);
    const argHint = ah ? ah[0] : null;

    if (!description && i + 1 < lines.length && /^\s{6,}\S/.test(lines[i + 1])) {
      description = lines[i + 1].trim();
      i++;
    }

    options.push({ flag, argHint, description });
  }

  const confidence: ParseConfidence =
    options.length === 0 ? 'none' : options.length >= 3 ? 'high' : 'low';
  return { options, confidence };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm nx test api-gateway --testFile=parse-help.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/api-gateway/src/app/tools/kali/types.ts apps/api-gateway/src/app/tools/kali/parse-help.ts apps/api-gateway/src/app/tools/kali/__tests__/parse-help.spec.ts
git commit -m "feat(kali-catalog): types + best-effort help-option parser"
```

---

## Task 2: Record normalizer

**Files:**
- Create: `apps/api-gateway/src/app/tools/kali/normalize.ts`
- Test: `apps/api-gateway/src/app/tools/kali/__tests__/normalize.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/api-gateway/src/app/tools/kali/__tests__/normalize.spec.ts
import { normalizeRecord } from '../normalize';
import type { RawCapture } from '../types';

const META = { kaliRelease: '2026.1', capturedAt: '2026-08-07T00:00:00.000Z' };

function raw(over: Partial<RawCapture> = {}): RawCapture {
  return {
    package: 'nmap',
    binary: 'nmap',
    description: 'The Network Mapper',
    homepage: 'https://nmap.org',
    categories: ['information-gathering'],
    helpTextRaw: null,
    manAvailable: false,
    ...over,
  };
}

describe('normalizeRecord', () => {
  it('parses options from help and stamps provenance', () => {
    const rec = normalizeRecord(
      raw({ helpTextRaw: '  -sV                   Probe service/version' }),
      META.kaliRelease,
      META.capturedAt,
    );
    expect(rec.binary).toBe('nmap');
    expect(rec.displayName).toBe('nmap');
    expect(rec.source).toBe('kali-docker');
    expect(rec.kaliRelease).toBe('2026.1');
    expect(rec.capturedAt).toBe(META.capturedAt);
    expect(rec.options).toEqual([
      { flag: '-sV', argHint: null, description: 'Probe service/version' },
    ]);
    expect(rec.parseConfidence).toBe('low');
  });

  it('handles a help-less binary (no options, confidence none)', () => {
    const rec = normalizeRecord(raw({ helpTextRaw: null }), META.kaliRelease, META.capturedAt);
    expect(rec.helpTextRaw).toBeNull();
    expect(rec.options).toEqual([]);
    expect(rec.parseConfidence).toBe('none');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test api-gateway --testFile=normalize.spec.ts`
Expected: FAIL — `Cannot find module '../normalize'`.

- [ ] **Step 3: Implement the normalizer**

```ts
// apps/api-gateway/src/app/tools/kali/normalize.ts
import { parseHelpOptions } from './parse-help';
import type { KaliToolRecord, RawCapture } from './types';

export function normalizeRecord(
  raw: RawCapture,
  kaliRelease: string,
  capturedAt: string,
): KaliToolRecord {
  const parsed = raw.helpTextRaw
    ? parseHelpOptions(raw.helpTextRaw)
    : { options: [], confidence: 'none' as const };

  return {
    package: raw.package,
    binary: raw.binary,
    displayName: raw.binary,
    description: raw.description ?? '',
    homepage: raw.homepage ?? null,
    categories: raw.categories ?? [],
    helpTextRaw: raw.helpTextRaw ?? null,
    options: parsed.options,
    parseConfidence: parsed.confidence,
    manAvailable: raw.manAvailable ?? false,
    source: 'kali-docker',
    kaliRelease,
    capturedAt,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test api-gateway --testFile=normalize.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api-gateway/src/app/tools/kali/normalize.ts apps/api-gateway/src/app/tools/kali/__tests__/normalize.spec.ts
git commit -m "feat(kali-catalog): raw capture -> record normalizer"
```

---

## Task 3: Dataset loader + committed seed dataset

**Files:**
- Create: `apps/api-gateway/src/app/tools/kali/load-dataset.ts`
- Create: `data/kali-tools.json` (seed)
- Test: `apps/api-gateway/src/app/tools/kali/__tests__/load-dataset.spec.ts`

- [ ] **Step 1: Create the seed dataset** (3 real, hand-verified tools so the API works before the full offline run)

```json
[
  {
    "package": "nmap",
    "binary": "nmap",
    "displayName": "nmap",
    "description": "The Network Mapper - a security scanner",
    "homepage": "https://nmap.org",
    "categories": ["information-gathering"],
    "helpTextRaw": "Nmap ( https://nmap.org )\nUsage: nmap [Scan Type(s)] [Options] {target}\n  -sV                   Probe open ports to determine service/version info\n  -p <port ranges>      Only scan specified ports",
    "options": [
      { "flag": "-sV", "argHint": null, "description": "Probe open ports to determine service/version info" },
      { "flag": "-p", "argHint": "<port ranges>", "description": "Only scan specified ports" }
    ],
    "parseConfidence": "low",
    "manAvailable": true,
    "source": "kali-docker",
    "kaliRelease": "seed",
    "capturedAt": "2026-08-07T00:00:00.000Z"
  },
  {
    "package": "ffuf",
    "binary": "ffuf",
    "displayName": "ffuf",
    "description": "Fast web fuzzer written in Go",
    "homepage": "https://github.com/ffuf/ffuf",
    "categories": ["web-applications"],
    "helpTextRaw": "Fuzz Faster U Fool\n  -u                    Target URL\n  -w                    Wordlist file path",
    "options": [
      { "flag": "-u", "argHint": null, "description": "Target URL" },
      { "flag": "-w", "argHint": null, "description": "Wordlist file path" }
    ],
    "parseConfidence": "low",
    "manAvailable": false,
    "source": "kali-docker",
    "kaliRelease": "seed",
    "capturedAt": "2026-08-07T00:00:00.000Z"
  },
  {
    "package": "nikto",
    "binary": "nikto",
    "displayName": "nikto",
    "description": "Web server scanner",
    "homepage": "https://cirt.net/Nikto2",
    "categories": ["web-applications"],
    "helpTextRaw": null,
    "options": [],
    "parseConfidence": "none",
    "manAvailable": true,
    "source": "kali-docker",
    "kaliRelease": "seed",
    "capturedAt": "2026-08-07T00:00:00.000Z"
  }
]
```

- [ ] **Step 2: Write the failing loader test**

```ts
// apps/api-gateway/src/app/tools/kali/__tests__/load-dataset.spec.ts
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadKaliDataset } from '../load-dataset';

describe('loadKaliDataset', () => {
  it('returns [] when the file is missing (API must still boot)', () => {
    expect(loadKaliDataset(join(tmpdir(), 'does-not-exist-kali.json'))).toEqual([]);
  });

  it('reads and parses a dataset file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kali-'));
    const file = join(dir, 'kali-tools.json');
    writeFileSync(
      file,
      JSON.stringify([{ package: 'nmap', binary: 'nmap', displayName: 'nmap' }]),
    );
    try {
      const rows = loadKaliDataset(file);
      expect(rows).toHaveLength(1);
      expect(rows[0].binary).toBe('nmap');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm nx test api-gateway --testFile=load-dataset.spec.ts`
Expected: FAIL — `Cannot find module '../load-dataset'`.

- [ ] **Step 4: Implement the loader**

```ts
// apps/api-gateway/src/app/tools/kali/load-dataset.ts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { KaliToolRecord } from './types';

/** Default committed dataset path, resolved from the repo root at runtime. */
export const DEFAULT_KALI_DATASET_PATH =
  process.env['KALI_TOOLS_DATASET'] ?? join(process.cwd(), 'data', 'kali-tools.json');

/**
 * Reads the committed Kali dataset. Returns [] when the file is missing or
 * unreadable so the API boots even before the offline generation job has run.
 */
export function loadKaliDataset(path: string = DEFAULT_KALI_DATASET_PATH): KaliToolRecord[] {
  try {
    if (!existsSync(path)) return [];
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    return Array.isArray(parsed) ? (parsed as KaliToolRecord[]) : [];
  } catch {
    return [];
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm nx test api-gateway --testFile=load-dataset.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/api-gateway/src/app/tools/kali/load-dataset.ts apps/api-gateway/src/app/tools/kali/__tests__/load-dataset.spec.ts data/kali-tools.json
git commit -m "feat(kali-catalog): dataset loader + seed data/kali-tools.json"
```

---

## Task 4: GraphQL DTOs + KaliCatalogService

**Files:**
- Create: `apps/api-gateway/src/app/tools/dto/kali-tool.object.ts`
- Create: `apps/api-gateway/src/app/tools/kali-catalog.service.ts`
- Test: `apps/api-gateway/src/app/tools/__tests__/kali-catalog.service.spec.ts`

- [ ] **Step 1: Create the DTOs**

```ts
// apps/api-gateway/src/app/tools/dto/kali-tool.object.ts
import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class KaliToolOptionObject {
  @Field() flag!: string;
  @Field(() => String, { nullable: true }) argHint?: string | null;
  @Field() description!: string;
}

@ObjectType()
export class KaliToolSummaryObject {
  @Field() binary!: string;
  @Field() package!: string;
  @Field() displayName!: string;
  @Field() description!: string;
  @Field(() => [String]) categories!: string[];
  @Field() hasHelp!: boolean;
  @Field(() => Int) optionCount!: number;
}

@ObjectType()
export class KaliToolDetailObject extends KaliToolSummaryObject {
  @Field(() => String, { nullable: true }) homepage?: string | null;
  @Field(() => String, { nullable: true }) helpTextRaw?: string | null;
  @Field(() => [KaliToolOptionObject]) options!: KaliToolOptionObject[];
  @Field() parseConfidence!: string;
  @Field() manAvailable!: boolean;
  @Field() kaliRelease!: string;
  @Field() capturedAt!: string;
}
```

- [ ] **Step 2: Write the failing service test**

```ts
// apps/api-gateway/src/app/tools/__tests__/kali-catalog.service.spec.ts
import { KaliCatalogService } from '../kali-catalog.service';
import type { KaliToolRecord } from '../kali/types';

function rec(over: Partial<KaliToolRecord> = {}): KaliToolRecord {
  return {
    package: 'nmap',
    binary: 'nmap',
    displayName: 'nmap',
    description: 'The Network Mapper',
    homepage: 'https://nmap.org',
    categories: ['information-gathering'],
    helpTextRaw: '  -sV   Probe',
    options: [{ flag: '-sV', argHint: null, description: 'Probe' }],
    parseConfidence: 'low',
    manAvailable: true,
    source: 'kali-docker',
    kaliRelease: 'seed',
    capturedAt: '2026-08-07T00:00:00.000Z',
    ...over,
  };
}

describe('KaliCatalogService', () => {
  const svc = new KaliCatalogService([
    rec(),
    rec({ package: 'nikto', binary: 'nikto', helpTextRaw: null, options: [], parseConfidence: 'none', homepage: null }),
  ]);

  it('lists summaries sorted by binary with hasHelp + optionCount', () => {
    const list = svc.list();
    expect(list.map((t) => t.binary)).toEqual(['nikto', 'nmap']);
    const nmap = list.find((t) => t.binary === 'nmap')!;
    expect(nmap).toMatchObject({ hasHelp: true, optionCount: 1, categories: ['information-gathering'] });
    const nikto = list.find((t) => t.binary === 'nikto')!;
    expect(nikto).toMatchObject({ hasHelp: false, optionCount: 0 });
  });

  it('returns full detail for a known binary and null otherwise', () => {
    const detail = svc.detail('nmap');
    expect(detail).toMatchObject({ binary: 'nmap', helpTextRaw: '  -sV   Probe', options: [{ flag: '-sV' }] });
    expect(svc.detail('ghost')).toBeNull();
  });

  it('exposes findByBinary for cross-linking', () => {
    expect(svc.findByBinary('nmap')?.package).toBe('nmap');
    expect(svc.findByBinary('ghost')).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm nx test api-gateway --testFile=kali-catalog.service.spec.ts`
Expected: FAIL — `Cannot find module '../kali-catalog.service'`.

- [ ] **Step 4: Implement the service**

```ts
// apps/api-gateway/src/app/tools/kali-catalog.service.ts
import { Inject, Injectable } from '@nestjs/common';

import { KaliToolDetailObject, KaliToolSummaryObject } from './dto/kali-tool.object';
import type { KaliToolRecord } from './kali/types';

/** DI token for the loaded, immutable Kali dataset. */
export const KALI_DATASET = Symbol('KALI_DATASET');

@Injectable()
export class KaliCatalogService {
  constructor(@Inject(KALI_DATASET) private readonly records: KaliToolRecord[]) {}

  list(): KaliToolSummaryObject[] {
    return this.records
      .map((r) => this.toSummary(r))
      .sort((a, b) => a.binary.localeCompare(b.binary));
  }

  detail(binary: string): KaliToolDetailObject | null {
    const r = this.findByBinary(binary);
    if (!r) return null;
    return {
      ...this.toSummary(r),
      homepage: r.homepage,
      helpTextRaw: r.helpTextRaw,
      options: r.options,
      parseConfidence: r.parseConfidence,
      manAvailable: r.manAvailable,
      kaliRelease: r.kaliRelease,
      capturedAt: r.capturedAt,
    };
  }

  findByBinary(binary: string): KaliToolRecord | null {
    return this.records.find((r) => r.binary === binary) ?? null;
  }

  private toSummary(r: KaliToolRecord): KaliToolSummaryObject {
    return {
      binary: r.binary,
      package: r.package,
      displayName: r.displayName,
      description: r.description,
      categories: r.categories,
      hasHelp: r.helpTextRaw != null,
      optionCount: r.options.length,
    };
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm nx test api-gateway --testFile=kali-catalog.service.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/api-gateway/src/app/tools/dto/kali-tool.object.ts apps/api-gateway/src/app/tools/kali-catalog.service.ts apps/api-gateway/src/app/tools/__tests__/kali-catalog.service.spec.ts
git commit -m "feat(kali-catalog): GraphQL DTOs + list/detail service"
```

---

## Task 5: Resolver queries + module wiring

**Files:**
- Modify: `apps/api-gateway/src/app/tools/tools.resolver.ts`
- Modify: `apps/api-gateway/src/app/tools/tools.module.ts`
- Test: `apps/api-gateway/src/app/tools/__tests__/tools-kali-resolver.spec.ts`

- [ ] **Step 1: Write the failing resolver test** (thin resolver → verify delegation)

```ts
// apps/api-gateway/src/app/tools/__tests__/tools-kali-resolver.spec.ts
import { ToolsResolver } from '../tools.resolver';
import { KaliCatalogService } from '../kali-catalog.service';
import type { KaliToolRecord } from '../kali/types';

const NMAP: KaliToolRecord = {
  package: 'nmap', binary: 'nmap', displayName: 'nmap', description: 'The Network Mapper',
  homepage: 'https://nmap.org', categories: ['information-gathering'],
  helpTextRaw: '  -sV   Probe', options: [{ flag: '-sV', argHint: null, description: 'Probe' }],
  parseConfidence: 'low', manAvailable: true, source: 'kali-docker', kaliRelease: 'seed',
  capturedAt: '2026-08-07T00:00:00.000Z',
};

describe('ToolsResolver (kali queries)', () => {
  const kali = new KaliCatalogService([NMAP]);
  // Other collaborators are unused by these queries.
  const resolver = new ToolsResolver({} as never, {} as never, kali);

  it('kaliTools returns summaries', () => {
    expect(resolver.kaliTools().map((t) => t.binary)).toEqual(['nmap']);
  });

  it('kaliTool returns detail or null', () => {
    expect(resolver.kaliTool('nmap')?.binary).toBe('nmap');
    expect(resolver.kaliTool('ghost')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test api-gateway --testFile=tools-kali-resolver.spec.ts`
Expected: FAIL — `ToolsResolver` constructor takes 2 args / `kaliTools` not a function.

- [ ] **Step 3: Add the queries to the resolver** (add imports + a 3rd constructor arg + 2 queries)

Add these imports at the top of `apps/api-gateway/src/app/tools/tools.resolver.ts`:

```ts
import { KaliToolDetailObject, KaliToolSummaryObject } from './dto/kali-tool.object';
import { KaliCatalogService } from './kali-catalog.service';
```

Change the constructor to add `private readonly kali: KaliCatalogService`:

```ts
  constructor(
    private readonly svc: ToolsService,
    private readonly catalog: ScannerCatalogService,
    private readonly kali: KaliCatalogService,
  ) {}
```

Add these two queries inside the class body:

```ts
  @Query(() => [KaliToolSummaryObject])
  kaliTools(): KaliToolSummaryObject[] {
    return this.kali.list();
  }

  @Query(() => KaliToolDetailObject, { nullable: true })
  kaliTool(@Args('binary') binary: string): KaliToolDetailObject | null {
    return this.kali.detail(binary);
  }
```

- [ ] **Step 4: Wire the module** — replace the body of `apps/api-gateway/src/app/tools/tools.module.ts` with:

```ts
import { Module } from '@nestjs/common';
import { ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { AllScannersModule } from '@autoscanner/scanners-all';

import { AuthModule } from '../auth/auth.module';
import { KALI_DATASET, KaliCatalogService } from './kali-catalog.service';
import { loadKaliDataset } from './kali/load-dataset';
import { ScannerCatalogService } from './scanner-catalog.service';
import { ToolsResolver } from './tools.resolver';
import { ToolsService } from './tools.service';

@Module({
  imports: [AuthModule, ScannerSdkModule, AllScannersModule],
  providers: [
    ToolsService,
    ScannerCatalogService,
    KaliCatalogService,
    ToolsResolver,
    { provide: KALI_DATASET, useFactory: () => loadKaliDataset() },
  ],
})
export class ToolsModule {}
```

- [ ] **Step 5: Run test + build to verify**

Run: `pnpm nx test api-gateway --testFile=tools-kali-resolver.spec.ts`
Expected: PASS (2 tests).
Run: `pnpm nx type-check api-gateway`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api-gateway/src/app/tools/tools.resolver.ts apps/api-gateway/src/app/tools/tools.module.ts apps/api-gateway/src/app/tools/__tests__/tools-kali-resolver.spec.ts
git commit -m "feat(kali-catalog): kaliTools/kaliTool GraphQL queries + module wiring"
```

---

## Task 6: `kaliToolRef` cross-link on scannerCatalog

**Files:**
- Create: `apps/api-gateway/src/app/tools/kali/scanner-kali-map.ts`
- Modify: `apps/api-gateway/src/app/tools/dto/scanner-catalog.object.ts`
- Modify: `apps/api-gateway/src/app/tools/scanner-catalog.service.ts`
- Test: `apps/api-gateway/src/app/tools/__tests__/scanner-catalog.service.spec.ts` (extend existing)

- [ ] **Step 1: Create the wrapper override map**

```ts
// apps/api-gateway/src/app/tools/kali/scanner-kali-map.ts
/**
 * Scanner name -> underlying Kali binary, for the cases where they differ
 * (wrappers / meta-scanners). Derived from the "underlying tool" column of
 * scanner.md. Scanners whose name already equals the binary are resolved by
 * dataset lookup and need no entry here.
 */
export const SCANNER_KALI_OVERRIDES: Record<string, string> = {
  'smb-enum': 'enum4linux-ng',
  'api-discovery': 'kiterunner',
  favicon: 'httpx',
  'js-recon': 'linkfinder',
  'exposed-config': 'nuclei',
  'web-dast': 'nuclei',
  'sqli-scan': 'sqlmap',
  'cmdi-scan': 'commix',
  'xss-scan': 'dalfox',
  'smtp-recon': 'nmap',
};
```

- [ ] **Step 2: Add the DTO field** — in `apps/api-gateway/src/app/tools/dto/scanner-catalog.object.ts`, add to `ScannerCatalogEntryObject` (after `requiresCredential`):

```ts
  @Field(() => String, { nullable: true }) kaliToolRef?: string | null;
```

- [ ] **Step 3: Extend the existing service test** — add this block inside the `describe('ScannerCatalogService', ...)` in `apps/api-gateway/src/app/tools/__tests__/scanner-catalog.service.spec.ts`. It requires the constructor to accept a `KaliCatalogService`; update the existing `new ScannerCatalogService(registry)` call in that file to `new ScannerCatalogService(registry, kali)` where `kali` is defined as below.

```ts
  it('sets kaliToolRef from dataset match, override, or null', () => {
    const registry = new ScannerRegistry();
    registry.register(makeDef('nmap'));                 // dataset has "nmap"
    registry.register(makeDef('smb-enum'));             // override -> enum4linux-ng (in dataset)
    registry.register(makeDef('shodan', { inputSchema: z.object({}) })); // not a Kali binary

    const kali = new KaliCatalogService([
      { package: 'nmap', binary: 'nmap', displayName: 'nmap', description: '', homepage: null,
        categories: [], helpTextRaw: null, options: [], parseConfidence: 'none', manAvailable: false,
        source: 'kali-docker', kaliRelease: 'seed', capturedAt: 't' },
      { package: 'enum4linux-ng', binary: 'enum4linux-ng', displayName: 'enum4linux-ng', description: '',
        homepage: null, categories: [], helpTextRaw: null, options: [], parseConfidence: 'none',
        manAvailable: false, source: 'kali-docker', kaliRelease: 'seed', capturedAt: 't' },
    ]);

    const catalog = new ScannerCatalogService(registry, kali).catalog();
    const byName = (n: string) => catalog.find((c) => c.name === n)!;
    expect(byName('nmap').kaliToolRef).toBe('nmap');
    expect(byName('smb-enum').kaliToolRef).toBe('enum4linux-ng');
    expect(byName('shodan').kaliToolRef).toBeNull();
  });
```

Add the required import at the top of that spec file:

```ts
import { KaliCatalogService } from '../kali-catalog.service';
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm nx test api-gateway --testFile=scanner-catalog.service.spec.ts`
Expected: FAIL — `ScannerCatalogService` takes 1 arg / `kaliToolRef` undefined.

- [ ] **Step 5: Implement the cross-link** — replace the body of `apps/api-gateway/src/app/tools/scanner-catalog.service.ts` with:

```ts
import { Inject, Injectable } from '@nestjs/common';
import { describeScannerInput, ScannerRegistry } from '@autoscanner/scanner-sdk';

import { ScannerCatalogEntryObject } from './dto/scanner-catalog.object';
import { KaliCatalogService } from './kali-catalog.service';
import { SCANNER_KALI_OVERRIDES } from './kali/scanner-kali-map';

/**
 * Exposes the live scanner registry (~120 scanners) and each scanner's option
 * fields (from its Zod inputSchema). Also resolves a `kaliToolRef` linking a
 * scanner to its underlying Kali binary (override map first, else a dataset
 * match on the scanner name, else null). Registry-only; no DB, no secrets.
 */
@Injectable()
export class ScannerCatalogService {
  constructor(
    @Inject(ScannerRegistry) private readonly registry: ScannerRegistry,
    private readonly kali: KaliCatalogService,
  ) {}

  catalog(): ScannerCatalogEntryObject[] {
    return this.registry
      .list()
      .map((scanner) => ({
        name: scanner.name,
        displayName: scanner.displayName,
        description: scanner.description,
        categories: scanner.category,
        requiresCredential: scanner.requiresCredential ?? null,
        kaliToolRef: this.resolveKaliToolRef(scanner.name),
        fields: describeScannerInput(scanner.inputSchema),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  private resolveKaliToolRef(scannerName: string): string | null {
    const binary = SCANNER_KALI_OVERRIDES[scannerName] ?? scannerName;
    return this.kali.findByBinary(binary) ? binary : null;
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm nx test api-gateway --testFile=scanner-catalog.service.spec.ts`
Expected: PASS (existing test + new one).

- [ ] **Step 7: Commit**

```bash
git add apps/api-gateway/src/app/tools/kali/scanner-kali-map.ts apps/api-gateway/src/app/tools/dto/scanner-catalog.object.ts apps/api-gateway/src/app/tools/scanner-catalog.service.ts apps/api-gateway/src/app/tools/__tests__/scanner-catalog.service.spec.ts
git commit -m "feat(kali-catalog): kaliToolRef cross-link on scannerCatalog"
```

---

## Task 7: Raw-JSONL → dataset transform + host generator CLI

**Files:**
- Create: `apps/api-gateway/src/app/tools/kali/generate-transform.ts` (pure, in-project so jest resolves it)
- Create: `apps/api-gateway/src/app/tools/kali/__tests__/__fixtures__/raw-sample.jsonl`
- Create: `tools/kali-catalog/generate.ts` (thin CLI importing the transform)
- Test: `apps/api-gateway/src/app/tools/kali/__tests__/generate-transform.spec.ts`

The pure transform lives **inside the app tree** (so the jest test imports it locally — no cross-project TS import). `generate.ts` is a thin `tsx` CLI that imports that transform and does file I/O.

- [ ] **Step 1: Create the fixture** (in the test folder — a local relative path, no fragile depth)

```
{"package":"nmap","binary":"nmap","description":"The Network Mapper","homepage":"https://nmap.org","categories":["information-gathering"],"helpTextRaw":"  -sV   Probe service/version","manAvailable":true}
{"package":"nikto","binary":"nikto","description":"Web server scanner","homepage":null,"categories":["web-applications"],"helpTextRaw":null,"manAvailable":true}
```

- [ ] **Step 2: Write the failing transform test**

```ts
// apps/api-gateway/src/app/tools/kali/__tests__/generate-transform.spec.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { rawLinesToDataset } from '../generate-transform';

describe('rawLinesToDataset', () => {
  it('normalizes each raw JSONL line and stamps release/capturedAt', () => {
    const jsonl = readFileSync(join(__dirname, '__fixtures__/raw-sample.jsonl'), 'utf8');
    const ds = rawLinesToDataset(jsonl, '2026.1', '2026-08-07T00:00:00.000Z');
    expect(ds).toHaveLength(2);
    expect(ds[0]).toMatchObject({ binary: 'nmap', kaliRelease: '2026.1', source: 'kali-docker' });
    expect(ds[0].options).toEqual([{ flag: '-sV', argHint: null, description: 'Probe service/version' }]);
    expect(ds[1]).toMatchObject({ binary: 'nikto', parseConfidence: 'none', options: [] });
  });

  it('skips blank lines', () => {
    expect(rawLinesToDataset('\n\n', '2026.1', 't')).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm nx test api-gateway --testFile=generate-transform.spec.ts`
Expected: FAIL — `Cannot find module '../generate-transform'`.

- [ ] **Step 4: Implement the pure transform (in-project)**

```ts
// apps/api-gateway/src/app/tools/kali/generate-transform.ts
import { normalizeRecord } from './normalize';
import type { KaliToolRecord, RawCapture } from './types';

/** Pure transform: raw JSONL text -> normalized dataset. */
export function rawLinesToDataset(
  jsonl: string,
  kaliRelease: string,
  capturedAt: string,
): KaliToolRecord[] {
  return jsonl
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => normalizeRecord(JSON.parse(l) as RawCapture, kaliRelease, capturedAt));
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm nx test api-gateway --testFile=generate-transform.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Create the host CLI** (imports the in-project transform; run via `tsx`)

```ts
// tools/kali-catalog/generate.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { rawLinesToDataset } from '../../apps/api-gateway/src/app/tools/kali/generate-transform';

// usage: tsx tools/kali-catalog/generate.ts <raw.jsonl> <kaliRelease>
const [rawPath, release] = process.argv.slice(2);
if (!rawPath || !release) {
  console.error('usage: tsx tools/kali-catalog/generate.ts <raw.jsonl> <kaliRelease>');
  process.exit(1);
}
const capturedAt = new Date().toISOString();
const ds = rawLinesToDataset(readFileSync(rawPath, 'utf8'), release, capturedAt);
const out = join(process.cwd(), 'data', 'kali-tools.json');
writeFileSync(out, JSON.stringify(ds, null, 2));
const withHelp = ds.filter((r) => r.helpTextRaw != null).length;
console.log(
  `Wrote ${ds.length} tools to ${out} (${withHelp} with help, ${ds.length - withHelp} help-less)`,
);
```

- [ ] **Step 7: Commit**

```bash
git add apps/api-gateway/src/app/tools/kali/generate-transform.ts apps/api-gateway/src/app/tools/kali/__tests__/generate-transform.spec.ts apps/api-gateway/src/app/tools/kali/__tests__/__fixtures__/raw-sample.jsonl tools/kali-catalog/generate.ts
git commit -m "feat(kali-catalog): raw JSONL -> dataset transform + host generator CLI"
```

---

## Task 8: Capture container + orchestration + docs (offline infra)

No unit tests — this is the disposable generation harness. It is exercised by running the full offline job manually. Keep it small and defensive.

**Files:**
- Create: `tools/kali-catalog/Dockerfile.kali-catalog`
- Create: `tools/kali-catalog/capture.sh`
- Create: `tools/kali-catalog/run.sh`
- Create: `tools/kali-catalog/README.md`
- Modify: `package.json` (add `kali:catalog` script)

- [ ] **Step 1: Dockerfile**

```dockerfile
# tools/kali-catalog/Dockerfile.kali-catalog
FROM kalilinux/kali-rolling

# Which tool set to install. Default: kali-linux-large (most offensive tools,
# no desktop). Override with --build-arg KALI_META=kali-linux-everything for max coverage.
ARG KALI_META=kali-linux-large

RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      ${KALI_META} man-db jq coreutils \
 && rm -rf /var/lib/apt/lists/*

COPY capture.sh /usr/local/bin/capture.sh
RUN chmod +x /usr/local/bin/capture.sh

ENTRYPOINT ["/usr/local/bin/capture.sh"]
```

- [ ] **Step 2: Capture script** (emits one RawCapture JSON per line to stdout)

```bash
#!/usr/bin/env bash
# tools/kali-catalog/capture.sh
# Introspect installed Kali tool packages -> RawCapture JSONL on stdout.
# Guardrails: no network (run the container with --network none), per-invocation
# timeout, output cap, closed stdin. Best-effort: binaries without clean help
# are emitted with helpTextRaw=null.
set -uo pipefail

HELP_TIMEOUT="${HELP_TIMEOUT:-5}"
HELP_MAX_BYTES="${HELP_MAX_BYTES:-65536}"

# Binaries known to hang / have side effects — never executed.
EXCLUDE_RE='^(bash|sh|dash|zsh|python[0-9.]*|perl|ruby|msfconsole|msfdb|postgres|mysql|service|systemctl|nc|ncat|telnet|ftp|ssh|screen|tmux|vi|vim|nano|less|more|man)$'

emit_help() {
  local bin="$1"
  local out
  for flag in --help -h help; do
    out="$(timeout "${HELP_TIMEOUT}" "$bin" "$flag" </dev/null 2>&1 | head -c "${HELP_MAX_BYTES}")"
    if [ -n "$out" ]; then printf '%s' "$out"; return 0; fi
  done
  return 1
}

# List installed kali-tools-* metapackages and, for each, its category + member tools.
for meta in $(dpkg-query -W -f='${Package}\n' 'kali-tools-*' 2>/dev/null); do
  category="${meta#kali-tools-}"
  # Packages depended on by this metapackage:
  for pkg in $(apt-cache depends "$meta" 2>/dev/null | awk '/Depends:/ {print $2}'); do
    # Package metadata
    desc="$(apt-cache show "$pkg" 2>/dev/null | awk -F': ' '/^Description(-en)?:/ {print $2; exit}')"
    homepage="$(apt-cache show "$pkg" 2>/dev/null | awk -F': ' '/^Homepage:/ {print $2; exit}')"
    # Executable binaries this package installs
    for path in $(dpkg -L "$pkg" 2>/dev/null | grep -E '^/usr/(bin|sbin)/' ); do
      [ -x "$path" ] || continue
      bin="$(basename "$path")"
      echo "$bin" | grep -qE "$EXCLUDE_RE" && continue
      help="$(emit_help "$bin" || true)"
      man_ok="false"; man "$bin" >/dev/null 2>&1 && man_ok="true"
      jq -cn \
        --arg package "$pkg" --arg binary "$bin" --arg description "$desc" \
        --arg homepage "$homepage" --arg category "$category" \
        --arg help "$help" --argjson man "$man_ok" \
        '{package:$package, binary:$binary, description:$description,
          homepage: ($homepage|select(.!="")//null),
          categories: [$category],
          helpTextRaw: ($help|select(.!="")//null),
          manAvailable: $man}'
    done
  done
done
```

- [ ] **Step 3: Orchestration wrapper**

```bash
#!/usr/bin/env bash
# tools/kali-catalog/run.sh — build the capture image, run it (no network),
# then normalize the raw JSONL into data/kali-tools.json.
set -euo pipefail

KALI_META="${KALI_META:-kali-linux-large}"
RELEASE="${KALI_RELEASE:-$(date +%Y.%m)}"
OUT_RAW="$(mktemp)"

echo "Building capture image (KALI_META=${KALI_META}) — this is large and slow..."
docker build --build-arg "KALI_META=${KALI_META}" \
  -f tools/kali-catalog/Dockerfile.kali-catalog -t autoscanner/kali-catalog:latest \
  tools/kali-catalog

echo "Capturing tool introspection (isolated, no network)..."
docker run --rm --network none autoscanner/kali-catalog:latest > "${OUT_RAW}"

echo "Normalizing -> data/kali-tools.json ..."
pnpm tsx tools/kali-catalog/generate.ts "${OUT_RAW}" "${RELEASE}"
rm -f "${OUT_RAW}"
```

- [ ] **Step 4: README**

```markdown
# Kali tool catalog generator (SP1)

Generates `data/kali-tools.json` by introspecting a disposable Kali container.
Offline job — run it locally when you want to (re)build the dataset; the JSON is
committed and consumed by the API at runtime.

## Run

    pnpm kali:catalog                     # default: kali-linux-large
    KALI_META=kali-linux-everything pnpm kali:catalog   # max coverage (huge)

## What it does

1. Builds `Dockerfile.kali-catalog` (installs the chosen tool metapackage).
2. Runs `capture.sh` in the container **with no network**, emitting one
   RawCapture JSON per binary (description, homepage, category, help text, man).
3. `generate.ts` normalizes that into `data/kali-tools.json` and prints a
   coverage summary (tools with help vs help-less).

## Guardrails

Per-binary `--help` runs under a `timeout` (`HELP_TIMEOUT`, default 5s), output
capped (`HELP_MAX_BYTES`, default 64KB), stdin closed, and a known-bad binary
exclude list. The image is disposable; regenerate per Kali release.

## Caveats

Option parsing is best-effort (`parseConfidence`); `helpTextRaw` is the source of
truth and always kept when captured. Binaries with no clean help are recorded
with `helpTextRaw: null`.
```

- [ ] **Step 5: Add the pnpm script** — in `package.json` `scripts`, after the `scanners:build` line, add:

```json
    "kali:catalog": "bash tools/kali-catalog/run.sh",
```

- [ ] **Step 6: Make scripts executable + commit**

```bash
chmod +x tools/kali-catalog/capture.sh tools/kali-catalog/run.sh
git add tools/kali-catalog/Dockerfile.kali-catalog tools/kali-catalog/capture.sh tools/kali-catalog/run.sh tools/kali-catalog/README.md package.json
git commit -m "feat(kali-catalog): offline capture container + orchestration + docs"
```

- [ ] **Step 7: (Manual, optional) Full generation smoke** — when ready, run `pnpm kali:catalog` and confirm `data/kali-tools.json` grows to hundreds of tools and the coverage summary prints. This is a manual op (large image build); not part of CI.

---

## Final verification

- [ ] Run the whole tools suite: `pnpm nx test api-gateway` → all green.
- [ ] `pnpm nx type-check api-gateway` → clean.
- [ ] `pnpm nx build api-gateway` → builds (dataset loads at boot; missing file tolerated).
- [ ] Manual GraphQL check (optional): boot api-gateway, query `{ kaliTools { binary description } }` → returns the seed tools; `{ scannerCatalog { name kaliToolRef } }` → `nmap` has `kaliToolRef: "nmap"`.

---

## Self-review notes (author)

- **Spec coverage:** §1 flux → Tasks 7–8; §2 générateur → Task 8; §3 GraphQL → Tasks 4–5; §4 modèle → Task 1; §5 parseur → Task 1; §6 tests → each task's TDD; §7 rollout/caveats → Task 8 README + seed (Task 3). Cross-link `kaliToolRef` → Task 6.
- **Open questions from spec** (dataset size split/gzip; exclude list) — deferred: the exclude list is seeded in `capture.sh` (Task 8) and refined empirically at first full run; dataset-size split is only needed if the full JSON proves too large (revisit after Task 8 Step 7).
- **Type consistency:** `KaliToolRecord` / `RawCapture` / `KaliToolOption` used identically across Tasks 1–7; `KALI_DATASET` token defined in Task 4, consumed in Task 5; `findByBinary` defined in Task 4, used in Task 6.
