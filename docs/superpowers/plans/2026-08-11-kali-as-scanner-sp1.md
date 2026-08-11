# Kali-as-Scanner SP1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn every Kali catalog tool into a registered scanner so the whole 852-tool dataset appears in `scannerCatalog` and runs through the normal `runScan` pipeline (single `kali-toolbox` container, raw output, zero findings), replacing the 120 structured scanners as the registered set.

**Architecture:** A pure factory `buildKaliScanners(dataset)` maps each `KaliToolRecord` to a generic `ScannerDefinition` (name = binary, `kali-toolbox` image, generic Zod input, argv-only `build()`, `raw` parser, no `produces`). A NestJS module registers them into the per-process `ScannerRegistry`. `AllScannersModule` is reduced to import only that module. A trivial `raw` parser returns an empty `NormalizedOutput` so `parser-worker` finalizes the scan without special-casing.

**Tech Stack:** TypeScript, NestJS 11, Nx 20, Zod, Jest.

---

## Design notes (read once before starting)

- **Registration pattern** (mirror `libs/scanners/whois/src/whois.module.ts`): a module injects `ScannerRegistry` and registers in `onModuleInit`, guarded by `registry.has()`.
- **Registry is per-process.** `AllScannersModule` is imported by api-gateway, scan-worker, and orchestrator-worker, so the factory + dataset load must live in a lib (not an app). The lib carries its own dataset loader + minimal record type.
- **`args` is a freeform string**, tokenized argv-safe at build time (no shell). Target placement: `{{target}}` token substitution, else append target last.
- **Collisions / dedup:** `registry.register` throws on duplicate names; the factory dedups by binary and the module guards with `has()`.
- **Structured scanners are NOT deleted in SP1** — they simply stop being imported by `AllScannersModule` (physical deletion is SP4). Templates + AutoHunt that reference structured scanners will break until SP3; that is expected and out of scope here.
- **Out of scope:** presets/examples (SP2), template/AutoHunt migration (SP3), deleting findings libs + Prisma schema (SP4), catalog/search UI for 852 entries (SP3).

---

## File structure

- Create `libs/scanners/kali-generated/` (new Nx lib, alias `@autoscanner/scanners-kali-generated`):
  - `src/types.ts` — minimal `KaliToolRecord`.
  - `src/load-dataset.ts` — `loadKaliDataset()` (repo-root JSON reader).
  - `src/tokenize-args.ts` — `tokenizeArgs()`.
  - `src/kali-scanner-input.ts` — generic Zod schema.
  - `src/kali-scanner-factory.ts` — category map, caps map, `buildKaliScanner`, `buildKaliScanners`.
  - `src/kali-generated.module.ts` — `KaliGeneratedScannersModule`.
  - `src/index.ts` — barrel.
  - `src/*.spec.ts` — unit tests.
- Modify `libs/scanner-sdk/src/types.ts:3-30` — add 5 `ScannerCategory` values.
- Create `libs/parsers/src/raw/raw.parser.ts` + `src/raw/index.ts`; modify `libs/parsers/src/index.ts`, `libs/parsers/src/parsers.module.ts`.
- Modify `libs/scanners/all/src/all-scanners.module.ts` — import only `KaliGeneratedScannersModule`.
- Modify `tsconfig.base.json` — add the path alias.

---

## Task 1: Add `ScannerCategory` values for the Kali taxonomy

**Files:**
- Modify: `libs/scanner-sdk/src/types.ts:3-30`
- Test: `libs/scanner-sdk/src/__tests__/scanner-category.spec.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `libs/scanner-sdk/src/__tests__/scanner-category.spec.ts`:

```ts
import { ScannerCategory } from '../types';

describe('ScannerCategory Kali taxonomy additions', () => {
  it('exposes the new categories needed to map the Kali dataset', () => {
    expect(ScannerCategory.EXPLOITATION).toBe('exploitation');
    expect(ScannerCategory.POST_EXPLOITATION).toBe('post-exploitation');
    expect(ScannerCategory.FORENSICS).toBe('forensics');
    expect(ScannerCategory.REVERSE_ENGINEERING).toBe('reverse-engineering');
    expect(ScannerCategory.MISC).toBe('misc');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test scanner-sdk --testFile=scanner-category.spec.ts`
Expected: FAIL — `ScannerCategory.EXPLOITATION` is `undefined`.

- [ ] **Step 3: Add the enum values**

In `libs/scanner-sdk/src/types.ts`, extend the enum (replace the `IMPORT_ONLY` line + closing brace):

```ts
  IMPORT_ONLY = 'import-only',
  EXPLOITATION = 'exploitation',
  POST_EXPLOITATION = 'post-exploitation',
  FORENSICS = 'forensics',
  REVERSE_ENGINEERING = 'reverse-engineering',
  MISC = 'misc',
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test scanner-sdk --testFile=scanner-category.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/scanner-sdk/src/types.ts libs/scanner-sdk/src/__tests__/scanner-category.spec.ts
git commit -m "feat(scanner-sdk): add Kali-taxonomy ScannerCategory values"
```

---

## Task 2: Scaffold the `scanners-kali-generated` lib

**Files:**
- Create: `libs/scanners/kali-generated/{project.json,package.json,jest.config.ts,tsconfig.json,tsconfig.lib.json,tsconfig.spec.json,src/index.ts}`
- Modify: `tsconfig.base.json` (add alias)

- [ ] **Step 1: Copy the whois lib config as a template**

```bash
mkdir -p libs/scanners/kali-generated/src
cp libs/scanners/whois/tsconfig.json libs/scanners/kali-generated/tsconfig.json
cp libs/scanners/whois/tsconfig.lib.json libs/scanners/kali-generated/tsconfig.lib.json
cp libs/scanners/whois/tsconfig.spec.json libs/scanners/kali-generated/tsconfig.spec.json
```

- [ ] **Step 2: Write `project.json`**

Create `libs/scanners/kali-generated/project.json`:

```json
{
  "name": "scanners-kali-generated",
  "$schema": "../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "libs/scanners/kali-generated/src",
  "projectType": "library",
  "tags": ["scope:scanner"],
  "targets": {
    "test": {
      "executor": "@nx/jest:jest",
      "outputs": ["{workspaceRoot}/coverage/libs/scanners/kali-generated"],
      "options": {
        "jestConfig": "libs/scanners/kali-generated/jest.config.ts"
      }
    },
    "type-check": {
      "executor": "nx:run-commands",
      "options": {
        "command": "tsc --noEmit -p libs/scanners/kali-generated/tsconfig.lib.json"
      }
    }
  }
}
```

- [ ] **Step 3: Write `package.json`**

Create `libs/scanners/kali-generated/package.json`:

```json
{
  "name": "scanners-kali-generated",
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

- [ ] **Step 4: Write `jest.config.ts`**

Create `libs/scanners/kali-generated/jest.config.ts`:

```ts
export default {
  displayName: 'scanners-kali-generated',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  moduleNameMapper: {
    '^@autoscanner/(.*)$': '<rootDir>/../../$1/src/index.ts',
  },
  testMatch: ['**/*.spec.ts'],
  coverageDirectory: '../../../coverage/libs/scanners/kali-generated',
};
```

- [ ] **Step 5: Write a placeholder barrel + smoke test**

Create `libs/scanners/kali-generated/src/index.ts`:

```ts
export const KALI_GENERATED_LIB = 'scanners-kali-generated';
```

Create `libs/scanners/kali-generated/src/index.spec.ts`:

```ts
import { KALI_GENERATED_LIB } from './index';

describe('scanners-kali-generated lib', () => {
  it('is wired', () => {
    expect(KALI_GENERATED_LIB).toBe('scanners-kali-generated');
  });
});
```

- [ ] **Step 6: Add the tsconfig path alias**

In `tsconfig.base.json`, add to `compilerOptions.paths` (next to the other `@autoscanner/scanners-*` entries):

```json
      "@autoscanner/scanners-kali-generated": ["libs/scanners/kali-generated/src/index.ts"],
```

- [ ] **Step 7: Run the smoke test to verify the lib builds**

Run: `pnpm nx test scanners-kali-generated --testFile=index.spec.ts`
Expected: PASS (1 test).

- [ ] **Step 8: Commit**

```bash
git add libs/scanners/kali-generated tsconfig.base.json
git commit -m "chore(scanners): scaffold scanners-kali-generated lib"
```

---

## Task 3: Dataset record type + loader

**Files:**
- Create: `libs/scanners/kali-generated/src/types.ts`
- Create: `libs/scanners/kali-generated/src/load-dataset.ts`
- Test: `libs/scanners/kali-generated/src/load-dataset.spec.ts`

- [ ] **Step 1: Write the type**

Create `libs/scanners/kali-generated/src/types.ts`:

```ts
/** Minimal subset of the committed Kali dataset the factory needs. */
export interface KaliToolRecord {
  package: string;
  binary: string;
  displayName: string;
  description: string;
  categories: string[];
  kaliRelease: string;
}
```

- [ ] **Step 2: Write the failing test**

Create `libs/scanners/kali-generated/src/load-dataset.spec.ts`:

```ts
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadKaliDataset } from './load-dataset';

describe('loadKaliDataset', () => {
  it('returns [] when the file is missing', () => {
    expect(loadKaliDataset(join(tmpdir(), 'does-not-exist-xyz.json'))).toEqual([]);
  });

  it('reads an array of records', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kali-ds-'));
    const path = join(dir, 'kali-tools.json');
    writeFileSync(
      path,
      JSON.stringify([
        {
          package: 'nmap',
          binary: 'nmap',
          displayName: 'nmap',
          description: 'Network mapper',
          categories: ['information-gathering'],
          kaliRelease: '2025.1',
        },
      ]),
    );
    const rows = loadKaliDataset(path);
    expect(rows).toHaveLength(1);
    expect(rows[0].binary).toBe('nmap');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm nx test scanners-kali-generated --testFile=load-dataset.spec.ts`
Expected: FAIL — `loadKaliDataset` not found.

- [ ] **Step 4: Write the loader**

Create `libs/scanners/kali-generated/src/load-dataset.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { KaliToolRecord } from './types';

/** Default committed dataset path, resolved from the repo root at runtime. */
export const DEFAULT_KALI_DATASET_PATH =
  process.env['KALI_TOOLS_DATASET'] ?? join(process.cwd(), 'data', 'kali-tools.json');

/**
 * Reads the committed Kali dataset. Returns [] when the file is missing or
 * unreadable so every process boots even before the offline generator has run.
 */
export function loadKaliDataset(
  path: string = DEFAULT_KALI_DATASET_PATH,
): KaliToolRecord[] {
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

Run: `pnpm nx test scanners-kali-generated --testFile=load-dataset.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add libs/scanners/kali-generated/src/types.ts libs/scanners/kali-generated/src/load-dataset.ts libs/scanners/kali-generated/src/load-dataset.spec.ts
git commit -m "feat(scanners-kali-generated): dataset record type + loader"
```

---

## Task 4: `tokenizeArgs` utility

**Files:**
- Create: `libs/scanners/kali-generated/src/tokenize-args.ts`
- Test: `libs/scanners/kali-generated/src/tokenize-args.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/scanners/kali-generated/src/tokenize-args.spec.ts`:

```ts
import { tokenizeArgs } from './tokenize-args';

describe('tokenizeArgs', () => {
  it('returns [] for empty/undefined', () => {
    expect(tokenizeArgs(undefined)).toEqual([]);
    expect(tokenizeArgs('')).toEqual([]);
    expect(tokenizeArgs('   ')).toEqual([]);
  });

  it('splits on whitespace', () => {
    expect(tokenizeArgs('-sV -p 80,443')).toEqual(['-sV', '-p', '80,443']);
  });

  it('honors double and single quotes', () => {
    expect(tokenizeArgs('--header "User-Agent: x y"')).toEqual([
      '--header',
      'User-Agent: x y',
    ]);
    expect(tokenizeArgs("--q 'a b'")).toEqual(['--q', 'a b']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test scanners-kali-generated --testFile=tokenize-args.spec.ts`
Expected: FAIL — `tokenizeArgs` not found.

- [ ] **Step 3: Write the implementation**

Create `libs/scanners/kali-generated/src/tokenize-args.ts`:

```ts
/**
 * Split a freeform argv string into tokens without invoking a shell.
 * Honors single and double quotes; collapses surrounding whitespace.
 */
export function tokenizeArgs(raw: string | undefined): string[] {
  if (!raw) return [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  const tokens: string[] = [];
  for (const match of raw.matchAll(pattern)) {
    tokens.push(match[1] ?? match[2] ?? match[3] ?? '');
  }
  return tokens;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test scanners-kali-generated --testFile=tokenize-args.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add libs/scanners/kali-generated/src/tokenize-args.ts libs/scanners/kali-generated/src/tokenize-args.spec.ts
git commit -m "feat(scanners-kali-generated): argv tokenizer"
```

---

## Task 5: Generic input schema + scanner factory

**Files:**
- Create: `libs/scanners/kali-generated/src/kali-scanner-input.ts`
- Create: `libs/scanners/kali-generated/src/kali-scanner-factory.ts`
- Test: `libs/scanners/kali-generated/src/kali-scanner-factory.spec.ts`

- [ ] **Step 1: Write the generic input schema**

Create `libs/scanners/kali-generated/src/kali-scanner-input.ts`:

```ts
import { z } from 'zod';

/** Shared generic input for every generated Kali scanner. */
export const KaliScannerInput = z.object({
  target: z.string().optional(),
  args: z.string().optional(),
  preset: z.string().optional(),
});

export type KaliScannerInputType = z.infer<typeof KaliScannerInput>;
```

- [ ] **Step 2: Write the failing test**

Create `libs/scanners/kali-generated/src/kali-scanner-factory.spec.ts`:

```ts
import { ScannerCategory } from '@autoscanner/scanner-sdk';
import { KALI_TOOLBOX_IMAGE } from '@autoscanner/common';
import { buildKaliScanner, buildKaliScanners } from './kali-scanner-factory';
import type { KaliToolRecord } from './types';

const rec = (over: Partial<KaliToolRecord> = {}): KaliToolRecord => ({
  package: 'nmap',
  binary: 'nmap',
  displayName: 'nmap',
  description: 'Network mapper',
  categories: ['information-gathering'],
  kaliRelease: '2025.1',
  ...over,
});

describe('buildKaliScanner', () => {
  it('maps a record to a toolbox-backed raw scanner', () => {
    const def = buildKaliScanner(rec());
    expect(def.name).toBe('nmap');
    expect(def.docker.image).toBe(KALI_TOOLBOX_IMAGE);
    expect(def.outputs).toEqual([
      { format: 'TEXT', capture: 'stdout', parser: 'raw' },
    ]);
    expect(def.produces).toEqual([]);
    expect(def.category).toContain(ScannerCategory.PASSIVE_RECON);
  });

  it('grants NET_RAW/NET_ADMIN to raw-socket tools', () => {
    expect(buildKaliScanner(rec({ binary: 'nmap' })).docker.capabilities).toEqual([
      'NET_RAW',
      'NET_ADMIN',
    ]);
    expect(buildKaliScanner(rec({ binary: 'whois' })).docker.capabilities).toEqual([]);
  });

  it('falls back to MISC for unknown categories', () => {
    const def = buildKaliScanner(rec({ binary: 'foo', categories: ['nonexistent-cat'] }));
    expect(def.category).toEqual([ScannerCategory.MISC]);
  });

  it('build(): appends target when no placeholder', () => {
    const def = buildKaliScanner(rec());
    expect(def.build({ args: '-sV' }, 'example.com', {} as never).cmd).toEqual([
      'nmap',
      '-sV',
      'example.com',
    ]);
  });

  it('build(): substitutes the {{target}} placeholder', () => {
    const def = buildKaliScanner(rec());
    expect(
      def.build({ args: '-u {{target}} --json' }, 'https://x', {} as never).cmd,
    ).toEqual(['nmap', '-u', 'https://x', '--json']);
  });

  it('build(): no target and no args yields just the binary', () => {
    const def = buildKaliScanner(rec());
    expect(def.build({}, '', {} as never).cmd).toEqual(['nmap']);
  });
});

describe('buildKaliScanners', () => {
  it('dedups by binary', () => {
    const defs = buildKaliScanners([rec(), rec({ package: 'nmap-dup' })]);
    expect(defs).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm nx test scanners-kali-generated --testFile=kali-scanner-factory.spec.ts`
Expected: FAIL — factory not found.

- [ ] **Step 4: Write the factory**

Create `libs/scanners/kali-generated/src/kali-scanner-factory.ts`:

```ts
import { KALI_TOOLBOX_IMAGE } from '@autoscanner/common';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';
import type { KaliToolRecord } from './types';
import { KaliScannerInput, type KaliScannerInputType } from './kali-scanner-input';
import { tokenizeArgs } from './tokenize-args';

/** Literal token replaced by the run target inside `args`. */
export const TARGET_PLACEHOLDER = '{{target}}';

/** Kali metapackage category slug -> internal ScannerCategory. */
export const KALI_CATEGORY_TO_SCANNER_CATEGORY: Record<string, ScannerCategory> = {
  'information-gathering': ScannerCategory.PASSIVE_RECON,
  web: ScannerCategory.WEB_ENUM,
  vulnerability: ScannerCategory.VULN_SCAN,
  database: ScannerCategory.VULN_SCAN,
  'sniffing-spoofing': ScannerCategory.NETWORK_ANALYSIS,
  identify: ScannerCategory.SERVICE_DETECTION,
  detect: ScannerCategory.VULN_SCAN,
  fuzzing: ScannerCategory.WEB_ENUM,
  forensics: ScannerCategory.FORENSICS,
  'reverse-engineering': ScannerCategory.REVERSE_ENGINEERING,
  passwords: ScannerCategory.PASSWORD,
  wireless: ScannerCategory.WIFI,
  '802-11': ScannerCategory.WIFI,
  exploitation: ScannerCategory.EXPLOITATION,
  'post-exploitation': ScannerCategory.POST_EXPLOITATION,
  'social-engineering': ScannerCategory.OSINT,
  'windows-resources': ScannerCategory.SMB_WINDOWS,
  gpu: ScannerCategory.PASSWORD,
  bluetooth: ScannerCategory.MISC,
  voip: ScannerCategory.MISC,
  sdr: ScannerCategory.MISC,
  rfid: ScannerCategory.MISC,
  hardware: ScannerCategory.MISC,
  'crypto-stego': ScannerCategory.MISC,
  reporting: ScannerCategory.MISC,
  protect: ScannerCategory.MISC,
  recover: ScannerCategory.MISC,
  respond: ScannerCategory.MISC,
  top10: ScannerCategory.MISC,
};

/** Binaries that need raw-socket capabilities inside the hardened toolbox. */
export const KALI_TOOL_CAPS: Record<string, string[]> = {
  nmap: ['NET_RAW', 'NET_ADMIN'],
  masscan: ['NET_RAW', 'NET_ADMIN'],
  'arp-scan': ['NET_RAW', 'NET_ADMIN'],
  hping3: ['NET_RAW', 'NET_ADMIN'],
  fping: ['NET_RAW', 'NET_ADMIN'],
  netdiscover: ['NET_RAW', 'NET_ADMIN'],
  tcpdump: ['NET_RAW', 'NET_ADMIN'],
};

function mapCategories(cats: string[]): ScannerCategory[] {
  const mapped = (cats ?? []).map(
    (c) => KALI_CATEGORY_TO_SCANNER_CATEGORY[c] ?? ScannerCategory.MISC,
  );
  const unique = Array.from(new Set(mapped));
  return unique.length ? unique : [ScannerCategory.MISC];
}

/** Build one generic raw scanner definition from a Kali dataset record. */
export function buildKaliScanner(
  record: KaliToolRecord,
): ScannerDefinition<KaliScannerInputType> {
  const categories = mapCategories(record.categories);
  return {
    name: record.binary,
    displayName: record.displayName || record.binary,
    category: categories,
    primaryCategory: categories[0],
    description: record.description || `Kali tool: ${record.binary}`,
    version: record.kaliRelease,
    inputSchema: KaliScannerInput,
    docker: {
      image: KALI_TOOLBOX_IMAGE,
      network: 'bridge',
      capabilities: KALI_TOOL_CAPS[record.binary] ?? [],
      readonlyRootfs: true,
      memoryLimitMb: 1024,
      cpuQuota: 1_000_000,
      defaultTimeoutMs: 300_000,
    },
    build(input, target) {
      const tokens = tokenizeArgs(input.args);
      const hasPlaceholder = tokens.includes(TARGET_PLACEHOLDER);
      const argv = hasPlaceholder
        ? tokens.map((t) => (t === TARGET_PLACEHOLDER ? target : t))
        : target
          ? [...tokens, target]
          : tokens;
      return { cmd: [record.binary, ...argv] };
    },
    outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'raw' }],
    produces: [],
  };
}

/** Build the full scanner set from the dataset, deduped by binary. */
export function buildKaliScanners(records: KaliToolRecord[]): ScannerDefinition[] {
  const seen = new Set<string>();
  const defs: ScannerDefinition[] = [];
  for (const r of records) {
    if (!r.binary || seen.has(r.binary)) continue;
    seen.add(r.binary);
    defs.push(buildKaliScanner(r) as ScannerDefinition);
  }
  return defs;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm nx test scanners-kali-generated --testFile=kali-scanner-factory.spec.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add libs/scanners/kali-generated/src/kali-scanner-input.ts libs/scanners/kali-generated/src/kali-scanner-factory.ts libs/scanners/kali-generated/src/kali-scanner-factory.spec.ts
git commit -m "feat(scanners-kali-generated): generic input schema + scanner factory"
```

---

## Task 6: `KaliGeneratedScannersModule` + barrel export

**Files:**
- Create: `libs/scanners/kali-generated/src/kali-generated.module.ts`
- Modify: `libs/scanners/kali-generated/src/index.ts`
- Test: `libs/scanners/kali-generated/src/kali-generated.module.spec.ts`

- [ ] **Step 1: Write the module**

Create `libs/scanners/kali-generated/src/kali-generated.module.ts`:

```ts
import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { buildKaliScanners } from './kali-scanner-factory';
import { loadKaliDataset } from './load-dataset';

/**
 * Registers one generic raw scanner per Kali dataset binary into the per-process
 * ScannerRegistry. Idempotent across module re-inits via `registry.has()`.
 */
@Module({ imports: [ScannerSdkModule] })
export class KaliGeneratedScannersModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    for (const def of buildKaliScanners(loadKaliDataset())) {
      if (!this.registry.has(def.name)) {
        this.registry.register(def);
      }
    }
  }
}
```

- [ ] **Step 2: Replace the barrel**

Replace `libs/scanners/kali-generated/src/index.ts` entirely with:

```ts
export * from './types';
export * from './load-dataset';
export * from './tokenize-args';
export * from './kali-scanner-input';
export * from './kali-scanner-factory';
export * from './kali-generated.module';
```

- [ ] **Step 3: Delete the placeholder smoke test**

```bash
rm libs/scanners/kali-generated/src/index.spec.ts
```

(The barrel no longer exports `KALI_GENERATED_LIB`; the smoke test is superseded by the module test below.)

- [ ] **Step 4: Write the failing module test + fixture**

Create `libs/scanners/kali-generated/src/__fixtures__/mini-dataset.json`:

```json
[
  {
    "package": "nmap",
    "binary": "nmap",
    "displayName": "nmap",
    "description": "Network mapper",
    "categories": ["information-gathering"],
    "kaliRelease": "2025.1"
  },
  {
    "package": "whois",
    "binary": "whois",
    "displayName": "whois",
    "description": "WHOIS lookup",
    "categories": ["information-gathering"],
    "kaliRelease": "2025.1"
  }
]
```

Create `libs/scanners/kali-generated/src/kali-generated.module.spec.ts`:

```ts
import { join } from 'node:path';
import { Test } from '@nestjs/testing';
import { ScannerRegistry } from '@autoscanner/scanner-sdk';
import { KaliGeneratedScannersModule } from './kali-generated.module';

describe('KaliGeneratedScannersModule', () => {
  beforeAll(() => {
    process.env['KALI_TOOLS_DATASET'] = join(__dirname, '__fixtures__', 'mini-dataset.json');
  });
  afterAll(() => delete process.env['KALI_TOOLS_DATASET']);

  it('registers generated scanners into the registry', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [KaliGeneratedScannersModule],
    }).compile();
    await moduleRef.init();

    const registry = moduleRef.get(ScannerRegistry);
    expect(registry.has('nmap')).toBe(true);
    expect(registry.get('nmap').docker.image).toContain('kali-toolbox');
    expect(registry.size()).toBe(2);
  });
});
```

- [ ] **Step 5: Run the test**

Run: `pnpm nx test scanners-kali-generated --testFile=kali-generated.module.spec.ts`
Expected: PASS. (If the fixture is not found, confirm `loadKaliDataset` reads the `KALI_TOOLS_DATASET` env var set in `beforeAll`.)

- [ ] **Step 6: Run the whole lib test suite**

Run: `pnpm nx test scanners-kali-generated`
Expected: PASS (load-dataset, tokenize-args, factory, module).

- [ ] **Step 7: Commit**

```bash
git add libs/scanners/kali-generated/src
git commit -m "feat(scanners-kali-generated): registry module + barrel"
```

---

## Task 7: `raw` parser + registration

**Files:**
- Create: `libs/parsers/src/raw/raw.parser.ts`, `libs/parsers/src/raw/index.ts`
- Modify: `libs/parsers/src/index.ts`, `libs/parsers/src/parsers.module.ts`
- Test: `libs/parsers/src/raw/raw.parser.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `libs/parsers/src/raw/raw.parser.spec.ts`:

```ts
import { RawParser } from './raw.parser';
import { emptyNormalizedOutput } from '../types';

describe('RawParser', () => {
  it('is named "raw" and handles TEXT', () => {
    const p = new RawParser();
    expect(p.name).toBe('raw');
    expect(p.formats).toContain('TEXT');
  });

  it('produces zero entities and zero findings', async () => {
    const out = await new RawParser().parse('anything at all', {
      scanJobId: 'j',
      scannerName: 'nmap',
      target: 'example.com',
      engagementId: 'e',
    });
    expect(out).toEqual(emptyNormalizedOutput());
    expect(out.findings).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test parsers --testFile=raw.parser.spec.ts`
Expected: FAIL — `RawParser` not found.

- [ ] **Step 3: Write the parser**

Create `libs/parsers/src/raw/raw.parser.ts`:

```ts
import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import {
  type Parser,
  type ParserContext,
  type NormalizedOutput,
  emptyNormalizedOutput,
} from '../types';

/**
 * No-op parser for raw Kali tool output: the bytes are already stored in MinIO
 * by scan-worker; this exists only so parser-worker can resolve a parser by name
 * and finalize the scan. It produces no normalized entities and no findings.
 */
@Injectable()
export class RawParser implements Parser {
  readonly name = 'raw';
  readonly formats: RawOutputFormat[] = ['TEXT'];

  async parse(_input: Buffer | string, _ctx: ParserContext): Promise<NormalizedOutput> {
    return emptyNormalizedOutput();
  }
}
```

Create `libs/parsers/src/raw/index.ts`:

```ts
export * from './raw.parser';
```

- [ ] **Step 4: Register the parser in `ParsersModule`**

In `libs/parsers/src/parsers.module.ts`:

1. Add the import after the last parser import (after the `IntelxJsonParser` import line):

```ts
import { RawParser } from './raw';
```

2. Add `RawParser` to the `providers` array immediately after `ParserRegistry,`.
3. Add `RawParser` to the `exports` array immediately after `ParserRegistry,`.
4. Add a constructor parameter immediately after `private readonly registry: ParserRegistry,`:

```ts
    private readonly rawParser: RawParser,
```

5. Register it as the first statement in `onModuleInit()`:

```ts
    this.registry.register(this.rawParser);
```

- [ ] **Step 5: Export from the parsers barrel**

In `libs/parsers/src/index.ts`, add:

```ts
export * from './raw';
```

- [ ] **Step 6: Run the parser test + the full parsers suite**

Run: `pnpm nx test parsers --testFile=raw.parser.spec.ts`
Expected: PASS (2 tests).

Run: `pnpm nx test parsers`
Expected: PASS (existing suites green; `raw` registers without collision).

- [ ] **Step 7: Commit**

```bash
git add libs/parsers/src/raw libs/parsers/src/index.ts libs/parsers/src/parsers.module.ts
git commit -m "feat(parsers): raw no-op parser for Kali tool output"
```

---

## Task 8: Wire `AllScannersModule` to the Kali set (drop the 120)

**Files:**
- Modify: `libs/scanners/all/src/all-scanners.module.ts` (full replace)
- Create: `libs/scanners/all/src/all-scanners.module.spec.ts`
- Create: `libs/scanners/all/src/__fixtures__/mini-dataset.json`

- [ ] **Step 1: Write the failing test + fixture**

Create `libs/scanners/all/src/__fixtures__/mini-dataset.json`:

```json
[
  {
    "package": "nmap",
    "binary": "nmap",
    "displayName": "nmap",
    "description": "Network mapper",
    "categories": ["information-gathering"],
    "kaliRelease": "2025.1"
  },
  {
    "package": "whois",
    "binary": "whois",
    "displayName": "whois",
    "description": "WHOIS lookup",
    "categories": ["information-gathering"],
    "kaliRelease": "2025.1"
  }
]
```

Create `libs/scanners/all/src/all-scanners.module.spec.ts`:

```ts
import { join } from 'node:path';
import { Test } from '@nestjs/testing';
import { ScannerRegistry } from '@autoscanner/scanner-sdk';
import { AllScannersModule } from './all-scanners.module';

describe('AllScannersModule (Kali-as-scanner)', () => {
  beforeAll(() => {
    process.env['KALI_TOOLS_DATASET'] = join(__dirname, '__fixtures__', 'mini-dataset.json');
  });
  afterAll(() => delete process.env['KALI_TOOLS_DATASET']);

  it('registers the Kali-generated set and no structured scanners', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AllScannersModule],
    }).compile();
    await moduleRef.init();

    const registry = moduleRef.get(ScannerRegistry);
    expect(registry.has('nmap')).toBe(true);
    // nmap now resolves to the generic Kali def (toolbox image), not the structured one.
    expect(registry.get('nmap').docker.image).toContain('kali-toolbox');
    expect(registry.get('nmap').produces).toEqual([]);
    expect(registry.size()).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test scanners-all --testFile=all-scanners.module.spec.ts`
Expected: FAIL — the current module registers the 120 structured scanners (`registry.size()` is not 2 and `nmap`'s image is `autoscanner/nmap:*`).

- [ ] **Step 3: Replace `AllScannersModule`**

Replace `libs/scanners/all/src/all-scanners.module.ts` entirely with:

```ts
import { Module } from '@nestjs/common';

import { ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { KaliGeneratedScannersModule } from '@autoscanner/scanners-kali-generated';

/**
 * Single import that registers every runnable scanner in the per-process
 * `ScannerRegistry`. As of the Kali-as-scanner pivot (SP1), the registered set
 * is the generated Kali tool catalog (raw output, no findings) — the former
 * structured per-tool scanners are no longer registered. Imported by
 * api-gateway (ScansModule), scan-worker, and orchestrator-worker so a scanner
 * is runnable standalone AND in a template.
 */
@Module({
  imports: [ScannerSdkModule, KaliGeneratedScannersModule],
  exports: [KaliGeneratedScannersModule],
})
export class AllScannersModule {}
```

- [ ] **Step 4: Ensure the lib dep is declared**

Add `@autoscanner/scanners-kali-generated` to `libs/scanners/all/package.json` `dependencies` (so Nx graph + build see it):

```json
  "dependencies": {
    "tslib": "^2.3.0",
    "scanners-kali-generated": "0.0.1"
  },
```

(Match the existing dependency style in that file; if it lists scanner deps by their `scanners-*` package name, follow suit.)

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm nx test scanners-all --testFile=all-scanners.module.spec.ts`
Expected: PASS.

- [ ] **Step 6: Check the api-gateway catalog service**

Run: `pnpm nx test api-gateway --testFile=scanner-catalog.service.spec.ts`
Expected: PASS if such a spec exists. If it fails because a fixture expected a structured scanner (e.g. `nmap` with structured fields), update that expectation to the generic `{target, args, preset}` schema. If no such spec exists, skip.

- [ ] **Step 7: Commit**

```bash
git add libs/scanners/all/src/all-scanners.module.ts libs/scanners/all/src/all-scanners.module.spec.ts libs/scanners/all/src/__fixtures__/mini-dataset.json libs/scanners/all/package.json
git commit -m "feat(scanners-all): register Kali-generated set, drop structured scanners"
```

---

## Task 9: Cross-project verification

**Files:** append one test to `libs/scanners/kali-generated/src/kali-scanner-factory.spec.ts`; otherwise verification only.

- [ ] **Step 1: Type-check the touched projects**

Run: `pnpm nx run-many -t type-check -p scanner-sdk parsers scanners-kali-generated scanners-all api-gateway scan-worker`
Expected: all PASS. Fix any type error surfaced by the generic schema or the new lib.

- [ ] **Step 2: Test the touched projects**

Run: `pnpm nx run-many -t test -p scanner-sdk parsers scanners-kali-generated scanners-all`
Expected: all PASS.

- [ ] **Step 3: Assert the committed dataset yields the full set**

Append to `libs/scanners/kali-generated/src/kali-scanner-factory.spec.ts`:

```ts
describe('buildKaliScanners over the committed dataset', () => {
  it('produces a unique-named def per binary (hundreds of tools)', () => {
    const path = require('node:path').join(process.cwd(), 'data', 'kali-tools.json');
    const fs = require('node:fs');
    if (!fs.existsSync(path)) return; // dataset optional in CI
    const rows = JSON.parse(fs.readFileSync(path, 'utf8'));
    const defs = buildKaliScanners(rows);
    const names = new Set(defs.map((d) => d.name));
    expect(names.size).toBe(defs.length); // no duplicate names
    expect(defs.length).toBeGreaterThan(100);
    for (const d of defs) {
      expect(d.docker.image).toContain('kali-toolbox');
      expect(d.category.length).toBeGreaterThan(0);
    }
  });
});
```

Run: `pnpm nx test scanners-kali-generated --testFile=kali-scanner-factory.spec.ts`
Expected: PASS. Commit:

```bash
git add libs/scanners/kali-generated/src/kali-scanner-factory.spec.ts
git commit -m "test(scanners-kali-generated): assert full dataset yields unique defs"
```

- [ ] **Step 4: Manual smoke (documented, run by operator when infra is up)**

Prereqs: `pnpm dev:up`, `pnpm dev:workers` (scan-worker + parser-worker), `autoscanner/kali-toolbox:1.0` built, api-gateway serving the committed `data/kali-tools.json`.

1. `scannerCatalog` GraphQL query returns hundreds of entries incl. `nmap`, `whois`, `dnsenum`.
2. `runScan(engagementId, scannerName: "whois", target: "example.com", optionsJson: "{}")` → run reaches COMPLETED, raw WHOIS text downloadable from the run detail, zero findings.
3. A raw-socket tool: `runScan(scannerName: "nmap", target: "scanme.nmap.org", optionsJson: "{\"args\":\"-F\"}")` → COMPLETED (or note exit 126 as the documented toolbox limitation).

Record the result in the PR description. This step is not a code change and needs no commit.

---

## Self-review (completed by plan author)

- **Spec coverage:** factory (§1) → Tasks 3-6; raw parser (§2) → Task 7; toolbox execution / no routing dependency (§3) → generated defs target the toolbox image directly (Task 5), so no scan-worker change is needed in SP1; `scannerCatalog` returns the set (§5) → Task 8 + Task 9 Step 3; enum additions → Task 1; known limitation (exit 126) → Task 9 Step 4.3. Every SP1 spec section maps to a task.
- **Placeholder scan:** no TBD/TODO; every code step ships complete code.
- **Type consistency:** `KaliToolRecord`, `KaliScannerInput`/`KaliScannerInputType`, `buildKaliScanner`/`buildKaliScanners`, `KALI_TOOL_CAPS`, `TARGET_PLACEHOLDER`, `RawParser`, `KaliGeneratedScannersModule` are used consistently across tasks; `outputs[].parser === 'raw'` matches `RawParser.name`.
```

