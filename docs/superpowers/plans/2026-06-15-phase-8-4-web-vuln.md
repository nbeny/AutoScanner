# Phase 8.4 — Active Web-Vuln Scanners Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 3 active web-vuln scanners — `xss-scan` (dalfox), `sqli-scan` (sqlmap), `cmdi-scan` (commix) — each mapping output onto the existing `Finding` entity. No Prisma changes. `xss-scan` reuses the public dalfox image. A `vuln-active` template chains them.

**Architecture:** Each scanner is a `ScannerDefinition` in `libs/scanners/<tool>` auto-registered in `AllScannersModule`, with a tolerant parser in `libs/parsers/src/<tool>-<fmt>` registered in `ParsersModule`. Output persisted by the existing `FindingPersister`. Each scanner takes a `level` input (`detect` default | `aggressive`) keeping the default safe (no data exfil, no shell). `target` is shell-quoted.

**Tech Stack:** NestJS, Nx, Zod, Docker, Jest. Spec: `docs/superpowers/specs/2026-06-15-phase-8-4-web-vuln-design.md`. Pattern ref: Phase 8.3 (`libs/scanners/snmp-recon`, `libs/parsers/src/snmp-text`, `parsers.module.ts`), and `nuclei` (`libs/scanners/nuclei`, `libs/parsers/src/nuclei-json` — JSON to Finding model).

---

## Reference (read once)
- Scanner lib scaffold: `libs/scanners/snmp-recon/` (copy + rename). Files per lib: `package.json`, `project.json`, `jest.config.ts`, `tsconfig*.json`, `src/index.ts`, `src/<tool>.module.ts`, `src/<tool>.scanner.ts`, `src/__tests__/<tool>.scanner.spec.ts`.
- Module shape (`src/<tool>.module.ts`): imports `ScannerSdkModule`, registers the scanner in `onModuleInit` guarded by `registry.has(...)` — see `libs/scanners/snmp-recon/src/snmp-recon.module.ts`.
- Parser: `libs/parsers/src/<name>/` (`<name>.parser.ts` + `index.ts` re-export) + registration in `libs/parsers/src/parsers.module.ts` (import + providers + exports + ctor param + onModuleInit register call) + barrel `libs/parsers/src/index.ts`.
- Types `libs/parsers/src/types.ts`: `NormalizedFinding = { scannerName, title, severity, location?, description? }`; `Severity = 'CRITICAL'|'HIGH'|'MEDIUM'|'LOW'|'INFO'`; `emptyNormalizedOutput()`. Tolerant parser model: `libs/parsers/src/snmp-text/snmp-text.parser.ts` (try/catch returns `emptyNormalizedOutput()`); JSON/JSONL Finding model: `libs/parsers/src/nuclei-json/nuclei-json.parser.ts`.
- Registration: `libs/scanners/all/src/all-scanners.module.ts` (+ `all-scanners.module.spec.ts`). Template: `libs/templates/src/builtins/service-recon.ts` + `index.ts` (`BUILTIN_TEMPLATES`) + `builtins.spec.ts`. Dockerfiles: house style `docker/scanners/snmp-recon/Dockerfile` (non-root uid 10001, `ca-certificates`, `ENTRYPOINT []`, no secrets).
- `ScannerCategory.VULN_SCAN`, `WEB_ENUM`, `API_SECURITY` exist in `libs/scanner-sdk/src/types.ts`.

**External-tool caveat (as 8.3):** dalfox/sqlmap/commix output is version-dependent. Each task gives a concrete build cmd + representative fixture + tolerant parser; **verify the real output at impl time and adjust the fixture/parser**, keeping parsers tolerant (never throw, return `emptyNormalizedOutput()`).

---

## Task 1: `xss-scan` scanner (reuses dalfox image) + `dalfox-json` parser

**Files:**
- Create lib: `libs/scanners/xss-scan/` (copy `libs/scanners/snmp-recon/`)
- Create parser: `libs/parsers/src/dalfox-json/dalfox-json.parser.ts`, `libs/parsers/src/dalfox-json/index.ts`
- Test: `libs/scanners/xss-scan/src/__tests__/xss-scan.scanner.spec.ts`, `libs/parsers/src/__tests__/dalfox-json.parser.spec.ts`
- Modify: `tsconfig.base.json` (path alias), `libs/parsers/src/parsers.module.ts`, `libs/parsers/src/index.ts`

- [ ] **Step 1: Scaffold** `libs/scanners/xss-scan/` by copying `libs/scanners/snmp-recon/`. Rename in all files: `snmp-recon` to `xss-scan`, `SnmpRecon` to `XssScan`, project `scanners-snmp-recon` to `scanners-xss-scan`, alias `@autoscanner/scanners-snmp-recon` to `@autoscanner/scanners-xss-scan` (add the alias to `tsconfig.base.json` `compilerOptions.paths`, value `["libs/scanners/xss-scan/src/index.ts"]`). Delete the copied spec body (rewritten in Step 2). Verify no leftovers: `grep -rni snmp libs/scanners/xss-scan` returns none.

- [ ] **Step 2: Write the failing scanner test** `libs/scanners/xss-scan/src/__tests__/xss-scan.scanner.spec.ts`:

```ts
import { XssScanScanner } from '../xss-scan.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/tmp' };

describe('XssScanScanner', () => {
  it('reuses the dalfox image, JSON to dalfox-json, produces Finding', () => {
    expect(XssScanScanner.name).toBe('xss-scan');
    expect(XssScanScanner.docker.image).toBe('ghcr.io/hahwul/dalfox:v2.9.4');
    expect(XssScanScanner.outputs[0]).toEqual({ format: 'JSON', capture: 'stdout', parser: 'dalfox-json' });
    expect(XssScanScanner.produces).toEqual(['Finding']);
    expect(XssScanScanner.requiresCredential).toBeUndefined();
  });

  it('build() runs dalfox url with JSON output and quotes the target (detect default)', () => {
    const { cmd } = XssScanScanner.build(XssScanScanner.inputSchema.parse({}), 'https://x.test/?q=1', ctx);
    expect(cmd[0]).toBe('sh');
    expect(cmd[1]).toBe('-lc');
    expect(cmd[2]).toContain('dalfox url');
    expect(cmd[2]).toContain("'https://x.test/?q=1'");
    expect(cmd[2]).toContain('--format json');
    expect(cmd[2]).not.toContain('-b ');
  });

  it('aggressive level enables mining/DOM but still no blind callback', () => {
    const { cmd } = XssScanScanner.build(XssScanScanner.inputSchema.parse({ level: 'aggressive' }), 'https://x.test', ctx);
    expect(cmd[2]).toContain('--mining-dom');
    expect(cmd[2]).not.toContain('-b ');
  });
});
```

Run: `pnpm nx test scanners-xss-scan` -> Expected: FAIL (no `xss-scan.scanner.ts`).

- [ ] **Step 3: Implement** `libs/scanners/xss-scan/src/xss-scan.scanner.ts`:

```ts
import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const XssScanInput = z.object({
  level: z.enum(['detect', 'aggressive']).default('detect'),
});
export type XssScanInputType = z.infer<typeof XssScanInput>;

function shellQuoteSingle(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export const XssScanScanner: ScannerDefinition<XssScanInputType> = {
  name: 'xss-scan',
  displayName: 'XSS scan (dalfox)',
  category: [ScannerCategory.VULN_SCAN, ScannerCategory.WEB_ENUM],
  description:
    'Active reflected/DOM XSS scanning with dalfox. Detection/PoC only by default (no blind-XSS callback). Actively probes the target.',
  inputSchema: XssScanInput,
  docker: {
    image: 'ghcr.io/hahwul/dalfox:v2.9.4',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 600_000,
  },
  build(input, target) {
    const t = shellQuoteSingle(target);
    const extra = input.level === 'aggressive' ? '--mining-dom --deep-domxss' : '';
    // dalfox prints JSON findings to stdout with --format json; no -b (blind) flag means no callback.
    const script = `dalfox url ${t} --format json --no-color --silence ${extra} 2>/dev/null || true`;
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'JSON', capture: 'stdout', parser: 'dalfox-json' }],
  produces: ['Finding'],
};
```

Update `libs/scanners/xss-scan/src/index.ts` (re-export scanner + module) and `src/xss-scan.module.ts` (registers `XssScanScanner`). Run: `pnpm nx test scanners-xss-scan` -> Expected: PASS.

- [ ] **Step 4: Write the failing parser test** `libs/parsers/src/__tests__/dalfox-json.parser.spec.ts`:

```ts
import { DalfoxJsonParser } from '../dalfox-json';
import type { ParserContext } from '../types';

const ctx: ParserContext = { scanJobId: 'j', scannerName: 'xss-scan', target: 'https://x.test', engagementId: 'e' };

describe('DalfoxJsonParser', () => {
  const parser = new DalfoxJsonParser();

  it('emits a HIGH Finding per confirmed XSS PoC (deduped by data)', async () => {
    const json = JSON.stringify([
      { type: 'V', severity: 'High', cwe: 'CWE-79', data: 'https://x.test/?q=<script>', message_str: 'reflected', param: 'q' },
      { type: 'V', severity: 'High', cwe: 'CWE-79', data: 'https://x.test/?q=<script>', message_str: 'reflected', param: 'q' },
      { type: 'G', severity: 'Medium', data: 'https://x.test/?q=grep', message_str: 'grep' },
    ]);
    const out = await parser.parse(json, ctx);
    const xss = out.findings.filter((f) => f.title.toLowerCase().includes('xss'));
    expect(xss).toHaveLength(1);
    expect(xss[0].severity).toBe('HIGH');
    expect(xss[0].location).toBe('https://x.test/?q=<script>');
  });

  it('tolerant of blank/garbage/JSONL', async () => {
    expect((await parser.parse('', ctx)).findings).toHaveLength(0);
    expect((await parser.parse('not json', ctx)).findings).toHaveLength(0);
    const jsonl = '{"type":"V","severity":"High","data":"https://x.test/?a=1","param":"a"}';
    expect((await parser.parse(jsonl, ctx)).findings).toHaveLength(1);
  });
});
```

Run: `pnpm nx test parsers --testPathPattern=dalfox-json` -> Expected: FAIL.

- [ ] **Step 5: Implement** `libs/parsers/src/dalfox-json/dalfox-json.parser.ts`:

```ts
import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext, Severity } from '../types';
import { emptyNormalizedOutput } from '../types';

interface DalfoxPoc {
  type?: string; // 'V' = verified vuln, 'G' = grep, 'R' = reflected
  severity?: string;
  cwe?: string;
  data?: string; // the PoC URL
  message_str?: string;
  param?: string;
}

function normalizeSeverity(value: string | undefined): Severity {
  switch ((value ?? '').trim().toLowerCase()) {
    case 'critical':
      return 'CRITICAL';
    case 'high':
      return 'HIGH';
    case 'medium':
      return 'MEDIUM';
    case 'low':
      return 'LOW';
    default:
      return 'HIGH'; // a confirmed XSS PoC defaults to HIGH
  }
}

// Accept either a JSON array or one-JSON-object-per-line (JSONL across versions).
function parsePocs(text: string): DalfoxPoc[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  try {
    const arr = JSON.parse(trimmed);
    if (Array.isArray(arr)) return arr as DalfoxPoc[];
  } catch {
    // fall through to JSONL
  }
  const result: DalfoxPoc[] = [];
  for (const line of trimmed.split('\n')) {
    const l = line.trim();
    if (!l.startsWith('{')) continue;
    try {
      result.push(JSON.parse(l) as DalfoxPoc);
    } catch {
      /* skip bad line */
    }
  }
  return result;
}

@Injectable()
export class DalfoxJsonParser implements Parser {
  readonly name = 'dalfox-json';
  readonly formats: RawOutputFormat[] = ['JSON', 'JSONL'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = Buffer.isBuffer(input) ? input.toString('utf8') : input;

    try {
      const seen = new Set<string>();
      for (const poc of parsePocs(text)) {
        // Only 'V' (verified) and 'R' (reflected) PoCs are real XSS; 'G' (grep) is informational noise.
        if (poc.type !== 'V' && poc.type !== 'R') continue;
        const loc = poc.data ?? ctx.target;
        const key = `${poc.param ?? ''}|${loc}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.findings.push({
          scannerName: ctx.scannerName,
          title: `Reflected/DOM XSS${poc.param ? ` (param: ${poc.param})` : ''}`,
          severity: normalizeSeverity(poc.severity),
          location: loc,
          description: poc.message_str ?? poc.cwe ?? 'XSS PoC confirmed by dalfox',
        });
      }
    } catch {
      return emptyNormalizedOutput();
    }

    return out;
  }
}
```

Plus `libs/parsers/src/dalfox-json/index.ts`: `export * from './dalfox-json.parser';`

- [ ] **Step 6: Register the parser.** In `libs/parsers/src/parsers.module.ts`: add `import { DalfoxJsonParser } from './dalfox-json';`, add `DalfoxJsonParser` to `providers` and `exports`, add `private readonly dalfoxJson: DalfoxJsonParser,` to the constructor, and `this.registry.register(this.dalfoxJson);` in `onModuleInit`. In `libs/parsers/src/index.ts` add `export * from './dalfox-json';`.

Run: `pnpm nx test parsers --testPathPattern=dalfox-json` -> Expected: PASS.

- [ ] **Step 7: Verify + commit.** Run `pnpm nx run-many -t type-check,test -p scanners-xss-scan,parsers` -> green. `grep -rni snmp libs/scanners/xss-scan` -> none.

```bash
git add libs/scanners/xss-scan libs/parsers/src/dalfox-json libs/parsers/src/parsers.module.ts libs/parsers/src/index.ts tsconfig.base.json
git commit -m "feat(phase-8.4): xss-scan scanner (dalfox) + dalfox-json parser"
```

---

## Task 2: `sqli-scan` scanner + `sqlmap-json` parser

**Files:**
- Create lib: `libs/scanners/sqli-scan/` (copy `libs/scanners/snmp-recon/`)
- Create parser: `libs/parsers/src/sqlmap-json/sqlmap-json.parser.ts`, `.../index.ts`
- Test: `libs/scanners/sqli-scan/src/__tests__/sqli-scan.scanner.spec.ts`, `libs/parsers/src/__tests__/sqlmap-json.parser.spec.ts`
- Modify: `tsconfig.base.json`, `libs/parsers/src/parsers.module.ts`, `libs/parsers/src/index.ts`

> **Verify tool at impl:** `sqlmap -u <url> --batch` prints `Parameter: q (GET)` then `Type: ... / Title: ...` blocks to stdout. The `--results-file` is CSV. We parse the human stdout text (most stable across versions); the parser is named `sqlmap-json` to match a possible future JSON; keep it tolerant. Adjust the fixture to the real version output.

- [ ] **Step 1: Scaffold** `libs/scanners/sqli-scan/` by copying `libs/scanners/snmp-recon/`. Rename `snmp-recon` to `sqli-scan`, `SnmpRecon` to `SqliScan`, project `scanners-snmp-recon` to `scanners-sqli-scan`, add alias `@autoscanner/scanners-sqli-scan` value `["libs/scanners/sqli-scan/src/index.ts"]` in `tsconfig.base.json`. `grep -rni snmp libs/scanners/sqli-scan` -> none.

- [ ] **Step 2: Write the failing scanner test** `libs/scanners/sqli-scan/src/__tests__/sqli-scan.scanner.spec.ts`:

```ts
import { SqliScanScanner } from '../sqli-scan.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/tmp' };

describe('SqliScanScanner', () => {
  it('uses custom image, TEXT to sqlmap-json, produces Finding, no cred', () => {
    expect(SqliScanScanner.name).toBe('sqli-scan');
    expect(SqliScanScanner.docker.image).toBe('autoscanner/sqli-scan:1.0');
    expect(SqliScanScanner.outputs[0]).toEqual({ format: 'TEXT', capture: 'stdout', parser: 'sqlmap-json' });
    expect(SqliScanScanner.produces).toEqual(['Finding']);
    expect(SqliScanScanner.requiresCredential).toBeUndefined();
  });

  it('build() runs sqlmap with quoted url, detect defaults (level1/risk1, no --dump)', () => {
    const { cmd } = SqliScanScanner.build(SqliScanScanner.inputSchema.parse({}), 'https://x.test/?id=1', ctx);
    expect(cmd[0]).toBe('sh');
    expect(cmd[2]).toContain('sqlmap');
    expect(cmd[2]).toContain("-u 'https://x.test/?id=1'");
    expect(cmd[2]).toContain('--batch');
    expect(cmd[2]).toContain('--level 1');
    expect(cmd[2]).toContain('--risk 1');
    expect(cmd[2]).not.toContain('--dump');
    expect(cmd[2]).not.toContain('--os-shell');
  });

  it('aggressive raises level/risk but never --dump/--os-shell', () => {
    const { cmd } = SqliScanScanner.build(SqliScanScanner.inputSchema.parse({ level: 'aggressive' }), 'https://x.test', ctx);
    expect(cmd[2]).toContain('--level 3');
    expect(cmd[2]).toContain('--risk 2');
    expect(cmd[2]).not.toContain('--dump');
    expect(cmd[2]).not.toContain('--os-shell');
  });
});
```

Run: `pnpm nx test scanners-sqli-scan` -> Expected: FAIL.

- [ ] **Step 3: Implement** `libs/scanners/sqli-scan/src/sqli-scan.scanner.ts`:

```ts
import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const SqliScanInput = z.object({
  level: z.enum(['detect', 'aggressive']).default('detect'),
});
export type SqliScanInputType = z.infer<typeof SqliScanInput>;

function shellQuoteSingle(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export const SqliScanScanner: ScannerDefinition<SqliScanInputType> = {
  name: 'sqli-scan',
  displayName: 'SQL injection scan (sqlmap)',
  category: [ScannerCategory.VULN_SCAN, ScannerCategory.WEB_ENUM],
  description:
    'Active SQL-injection detection with sqlmap. Detection only by default (no --dump / no shell). Actively probes the target.',
  inputSchema: SqliScanInput,
  docker: {
    image: 'autoscanner/sqli-scan:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: false, // sqlmap writes a session dir under ~/.local/share/sqlmap
    memoryLimitMb: 768,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 600_000,
  },
  build(input, target) {
    const t = shellQuoteSingle(target);
    const depth = input.level === 'aggressive' ? '--level 3 --risk 2' : '--level 1 --risk 1';
    // --batch = non-interactive; no --dump/--os-shell means detection/PoC only.
    const script = `sqlmap -u ${t} --batch ${depth} --technique=BEU --flush-session 2>/dev/null || true`;
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'sqlmap-json' }],
  produces: ['Finding'],
};
```

Update `index.ts` + `sqli-scan.module.ts` (register `SqliScanScanner`). Run: `pnpm nx test scanners-sqli-scan` -> Expected: PASS.

- [ ] **Step 4: Write the failing parser test** `libs/parsers/src/__tests__/sqlmap-json.parser.spec.ts`:

```ts
import { SqlmapJsonParser } from '../sqlmap-json';
import type { ParserContext } from '../types';

const ctx: ParserContext = { scanJobId: 'j', scannerName: 'sqli-scan', target: 'https://x.test/?id=1', engagementId: 'e' };

describe('SqlmapJsonParser', () => {
  const parser = new SqlmapJsonParser();

  it('emits a HIGH Finding per injectable parameter (deduped)', async () => {
    const text = [
      'sqlmap identified the following injection point(s) with a total of 42 HTTP(s) requests:',
      '---',
      'Parameter: id (GET)',
      '    Type: boolean-based blind',
      "    Title: AND boolean-based blind - WHERE or HAVING clause",
      "    Payload: id=1 AND 1=1",
      '',
      '    Type: UNION query',
      '    Title: Generic UNION query (NULL) - 3 columns',
      '---',
      'Parameter: id (GET)',
    ].join('\n');
    const out = await parser.parse(text, ctx);
    const sqli = out.findings.filter((f) => f.title.toLowerCase().includes('sql injection'));
    expect(sqli).toHaveLength(1);
    expect(sqli[0].severity).toBe('HIGH');
    expect(sqli[0].location).toBe('https://x.test/?id=1');
    expect(sqli[0].description).toContain('id');
  });

  it('tolerant of blank/garbage / no-injection output', async () => {
    expect((await parser.parse('', ctx)).findings).toHaveLength(0);
    expect((await parser.parse('all tested parameters do not appear to be injectable', ctx)).findings).toHaveLength(0);
  });
});
```

Run: `pnpm nx test parsers --testPathPattern=sqlmap-json` -> Expected: FAIL.

- [ ] **Step 5: Implement** `libs/parsers/src/sqlmap-json/sqlmap-json.parser.ts`:

```ts
import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

// sqlmap stdout marks each injectable parameter with a 'Parameter: <name> (<METHOD>)' line.
const PARAM_RE = /^Parameter:\s*(.+?)\s*\((GET|POST|COOKIE|URI|[A-Z]+)\)/;

@Injectable()
export class SqlmapJsonParser implements Parser {
  readonly name = 'sqlmap-json';
  readonly formats: RawOutputFormat[] = ['TEXT', 'JSON'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = Buffer.isBuffer(input) ? input.toString('utf8') : input;
    if (!text.trim()) return out;

    try {
      const seen = new Set<string>();
      for (const line of text.split('\n')) {
        const m = line.trim().match(PARAM_RE);
        if (!m) continue;
        const param = m[1];
        const method = m[2];
        const key = `${param}|${method}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.findings.push({
          scannerName: ctx.scannerName,
          title: `SQL injection (param: ${param}, ${method})`,
          severity: 'HIGH',
          location: ctx.target,
          description: `sqlmap confirmed an injectable parameter '${param}' via ${method}.`,
        });
      }
    } catch {
      return emptyNormalizedOutput();
    }

    return out;
  }
}
```

Plus `libs/parsers/src/sqlmap-json/index.ts`: `export * from './sqlmap-json.parser';`

- [ ] **Step 6: Register the parser** in `parsers.module.ts` (import + `providers` + `exports` + ctor `private readonly sqlmapJson: SqlmapJsonParser,` + `this.registry.register(this.sqlmapJson);`) + barrel `index.ts` (`export * from './sqlmap-json';`).

Run: `pnpm nx test parsers --testPathPattern=sqlmap-json` -> Expected: PASS.

- [ ] **Step 7: Verify + commit.** `pnpm nx run-many -t type-check,test -p scanners-sqli-scan,parsers` -> green.

```bash
git add libs/scanners/sqli-scan libs/parsers/src/sqlmap-json libs/parsers/src/parsers.module.ts libs/parsers/src/index.ts tsconfig.base.json
git commit -m "feat(phase-8.4): sqli-scan scanner (sqlmap) + sqlmap-json parser"
```

---

## Task 3: `cmdi-scan` scanner + `commix-text` parser

**Files:**
- Create lib: `libs/scanners/cmdi-scan/` (copy `libs/scanners/snmp-recon/`)
- Create parser: `libs/parsers/src/commix-text/commix-text.parser.ts`, `.../index.ts`
- Test: `libs/scanners/cmdi-scan/src/__tests__/cmdi-scan.scanner.spec.ts`, `libs/parsers/src/__tests__/commix-text.parser.spec.ts`
- Modify: `tsconfig.base.json`, `libs/parsers/src/parsers.module.ts`, `libs/parsers/src/index.ts`

> **Verify tool at impl:** `commix --url=<url> --batch` prints lines like `(!) The (GET) 'id' parameter is vulnerable to ... command injection`. Adjust fixture/parser to the real version.

- [ ] **Step 1: Scaffold** `libs/scanners/cmdi-scan/` by copying `libs/scanners/snmp-recon/`. Rename `snmp-recon` to `cmdi-scan`, `SnmpRecon` to `CmdiScan`, project `scanners-snmp-recon` to `scanners-cmdi-scan`, add alias `@autoscanner/scanners-cmdi-scan` value `["libs/scanners/cmdi-scan/src/index.ts"]`. `grep -rni snmp libs/scanners/cmdi-scan` -> none.

- [ ] **Step 2: Write the failing scanner test** `libs/scanners/cmdi-scan/src/__tests__/cmdi-scan.scanner.spec.ts`:

```ts
import { CmdiScanScanner } from '../cmdi-scan.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/tmp' };

describe('CmdiScanScanner', () => {
  it('uses custom image, TEXT to commix-text, produces Finding, no cred', () => {
    expect(CmdiScanScanner.name).toBe('cmdi-scan');
    expect(CmdiScanScanner.docker.image).toBe('autoscanner/cmdi-scan:1.0');
    expect(CmdiScanScanner.outputs[0]).toEqual({ format: 'TEXT', capture: 'stdout', parser: 'commix-text' });
    expect(CmdiScanScanner.produces).toEqual(['Finding']);
    expect(CmdiScanScanner.requiresCredential).toBeUndefined();
  });

  it('build() runs commix with quoted url, detection only (no --os-cmd / shell)', () => {
    const { cmd } = CmdiScanScanner.build(CmdiScanScanner.inputSchema.parse({}), 'https://x.test/?id=1', ctx);
    expect(cmd[0]).toBe('sh');
    expect(cmd[2]).toContain('commix');
    expect(cmd[2]).toContain("--url='https://x.test/?id=1'");
    expect(cmd[2]).toContain('--batch');
    expect(cmd[2]).not.toContain('--os-cmd');
  });

  it('aggressive raises --level 2 but stays detection-only', () => {
    const { cmd } = CmdiScanScanner.build(CmdiScanScanner.inputSchema.parse({ level: 'aggressive' }), 'https://x.test', ctx);
    expect(cmd[2]).toContain('--level 2');
    expect(cmd[2]).not.toContain('--os-cmd');
  });
});
```

Run: `pnpm nx test scanners-cmdi-scan` -> Expected: FAIL.

- [ ] **Step 3: Implement** `libs/scanners/cmdi-scan/src/cmdi-scan.scanner.ts`:

```ts
import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const CmdiScanInput = z.object({
  level: z.enum(['detect', 'aggressive']).default('detect'),
});
export type CmdiScanInputType = z.infer<typeof CmdiScanInput>;

function shellQuoteSingle(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export const CmdiScanScanner: ScannerDefinition<CmdiScanInputType> = {
  name: 'cmdi-scan',
  displayName: 'Command injection scan (commix)',
  category: [ScannerCategory.VULN_SCAN, ScannerCategory.WEB_ENUM],
  description:
    'Active OS command-injection detection with commix. Detection only (no --os-cmd / no shell). Actively probes the target.',
  inputSchema: CmdiScanInput,
  docker: {
    image: 'autoscanner/cmdi-scan:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: false, // commix writes an output/session dir
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 600_000,
  },
  build(input, target) {
    const t = shellQuoteSingle(target);
    const depth = input.level === 'aggressive' ? '--level 2' : '--level 1';
    // --batch = non-interactive; no --os-cmd/--os-shell means detection only.
    const script = `commix --url=${t} --batch ${depth} 2>/dev/null || true`;
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'commix-text' }],
  produces: ['Finding'],
};
```

Update `index.ts` + `cmdi-scan.module.ts` (register `CmdiScanScanner`). Run: `pnpm nx test scanners-cmdi-scan` -> Expected: PASS.

- [ ] **Step 4: Write the failing parser test** `libs/parsers/src/__tests__/commix-text.parser.spec.ts`:

```ts
import { CommixTextParser } from '../commix-text';
import type { ParserContext } from '../types';

const ctx: ParserContext = { scanJobId: 'j', scannerName: 'cmdi-scan', target: 'https://x.test/?id=1', engagementId: 'e' };

describe('CommixTextParser', () => {
  const parser = new CommixTextParser();

  it('emits a CRITICAL Finding per vulnerable parameter (deduped)', async () => {
    const text = [
      "(*) Testing the (GET) 'id' parameter for OS command injection.",
      "(!) The (GET) 'id' parameter is vulnerable to results-based command injection technique.",
      "(!) The (GET) 'id' parameter is vulnerable to results-based command injection technique.",
    ].join('\n');
    const out = await parser.parse(text, ctx);
    const cmdi = out.findings.filter((f) => /command injection/i.test(f.title));
    expect(cmdi).toHaveLength(1);
    expect(cmdi[0].severity).toBe('CRITICAL');
    expect(cmdi[0].location).toBe('https://x.test/?id=1');
  });

  it('tolerant of blank/garbage / not-vulnerable output', async () => {
    expect((await parser.parse('', ctx)).findings).toHaveLength(0);
    expect((await parser.parse("(x) No parameter is injectable", ctx)).findings).toHaveLength(0);
  });
});
```

Run: `pnpm nx test parsers --testPathPattern=commix-text` -> Expected: FAIL.

- [ ] **Step 5: Implement** `libs/parsers/src/commix-text/commix-text.parser.ts`:

```ts
import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

// commix marks a hit with: (!) The (GET) 'id' parameter is vulnerable to ... command injection
const VULN_RE = /The\s*\((GET|POST|COOKIE|[A-Z]+)\)\s*'([^']+)'\s*parameter is vulnerable to.*command injection/i;

@Injectable()
export class CommixTextParser implements Parser {
  readonly name = 'commix-text';
  readonly formats: RawOutputFormat[] = ['TEXT'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = Buffer.isBuffer(input) ? input.toString('utf8') : input;
    if (!text.trim()) return out;

    try {
      const seen = new Set<string>();
      for (const line of text.split('\n')) {
        const m = line.trim().match(VULN_RE);
        if (!m) continue;
        const method = m[1];
        const param = m[2];
        const key = `${param}|${method}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.findings.push({
          scannerName: ctx.scannerName,
          title: `OS command injection (param: ${param}, ${method})`,
          severity: 'CRITICAL',
          location: ctx.target,
          description: `commix confirmed OS command injection in parameter '${param}' via ${method}.`,
        });
      }
    } catch {
      return emptyNormalizedOutput();
    }

    return out;
  }
}
```

Plus `libs/parsers/src/commix-text/index.ts`: `export * from './commix-text.parser';`

- [ ] **Step 6: Register the parser** in `parsers.module.ts` (import + `providers` + `exports` + ctor `private readonly commixText: CommixTextParser,` + `this.registry.register(this.commixText);`) + barrel `index.ts` (`export * from './commix-text';`).

Run: `pnpm nx test parsers --testPathPattern=commix-text` -> Expected: PASS.

- [ ] **Step 7: Verify + commit.** `pnpm nx run-many -t type-check,test -p scanners-cmdi-scan,parsers` -> green.

```bash
git add libs/scanners/cmdi-scan libs/parsers/src/commix-text libs/parsers/src/parsers.module.ts libs/parsers/src/index.ts tsconfig.base.json
git commit -m "feat(phase-8.4): cmdi-scan scanner (commix) + commix-text parser"
```

---

## Task 4: Dockerfiles (sqli-scan, cmdi-scan)

**Files:** `docker/scanners/sqli-scan/Dockerfile`, `docker/scanners/cmdi-scan/Dockerfile`. (`xss-scan` reuses `ghcr.io/hahwul/dalfox:v2.9.4` — no Dockerfile.)

House style: non-root user uid 10001, `ca-certificates`, `sh`, `ENTRYPOINT []`, no secrets (read `docker/scanners/snmp-recon/Dockerfile`).

- [ ] **Step 1:** Create `docker/scanners/sqli-scan/Dockerfile`:

```dockerfile
# sqli-scan: SQL injection detection using sqlmap (Python).
FROM python:3.12-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && git clone --depth 1 https://github.com/sqlmapproject/sqlmap.git /opt/sqlmap \
 && ln -s /opt/sqlmap/sqlmap.py /usr/local/bin/sqlmap \
 && adduser --disabled-password --gecos '' --uid 10001 scanner
USER scanner
ENTRYPOINT []
```

- [ ] **Step 2:** Create `docker/scanners/cmdi-scan/Dockerfile`:

```dockerfile
# cmdi-scan: OS command-injection detection using commix (Python).
FROM python:3.12-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && git clone --depth 1 https://github.com/commixproject/commix.git /opt/commix \
 && ln -s /opt/commix/commix.py /usr/local/bin/commix \
 && adduser --disabled-password --gecos '' --uid 10001 scanner
USER scanner
ENTRYPOINT []
```

- [ ] **Step 3:** Verify: `ls docker/scanners/sqli-scan/Dockerfile docker/scanners/cmdi-scan/Dockerfile`. (Optional local build if Docker available: `docker build -t autoscanner/sqli-scan:1.0 docker/scanners/sqli-scan` — confirm `sqlmap --version` and `commix --version` run as uid 10001; adjust the `ln`/entry if the binary name differs.)

```bash
git add docker/scanners/sqli-scan docker/scanners/cmdi-scan
git commit -m "feat(phase-8.4): Dockerfiles for sqli-scan, cmdi-scan"
```

---

## Task 5: Register scanners + `vuln-active` template

**Files:** `libs/scanners/all/src/all-scanners.module.ts` (+ `all-scanners.module.spec.ts`); `libs/templates/src/builtins/vuln-active.ts`; `libs/templates/src/builtins/index.ts`; `libs/templates/src/builtins/builtins.spec.ts`.

- [ ] **Step 1:** In `libs/scanners/all/src/all-scanners.module.ts` add three imports after the existing scanner imports:

```ts
import { XssScanScannerModule } from '@autoscanner/scanners-xss-scan';
import { SqliScanScannerModule } from '@autoscanner/scanners-sqli-scan';
import { CmdiScanScannerModule } from '@autoscanner/scanners-cmdi-scan';
```

and add `XssScanScannerModule`, `SqliScanScannerModule`, `CmdiScanScannerModule` to the `SCANNER_MODULES` array. Update `all-scanners.module.spec.ts` to assert the 3 new scanner names (`xss-scan`, `sqli-scan`, `cmdi-scan`) are registered (follow the existing assertion pattern for `smtp-recon`/`snmp-recon`).

Run: `pnpm nx test scanners-all` -> Expected: PASS.

- [ ] **Step 2:** Create `libs/templates/src/builtins/vuln-active.ts`:

```ts
import type { TemplateDefinition } from '../types';

/**
 * Phase 8.4 — active web-vulnerability template chaining the 3 injection
 * scanners against the target URL. Detection/PoC only (level=detect default).
 */
export const VulnActive: TemplateDefinition = {
  name: 'vuln-active',
  displayName: 'Active Web Vuln',
  description:
    'Active web-vulnerability scanning: reflected/DOM XSS (dalfox), SQL injection (sqlmap), ' +
    'and OS command injection (commix). Detection/PoC only by default. Maps results onto Finding entities. ' +
    'No API key required. Intrusive — engagement scope only.',
  steps: [
    { scannerName: 'xss-scan', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'sqli-scan', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'cmdi-scan', inputs: {}, target: { kind: 'context', path: 'target' } },
  ],
};
```

- [ ] **Step 3:** In `libs/templates/src/builtins/index.ts` add `export * from './vuln-active';` and add `VulnActive` to the `BUILTIN_TEMPLATES` array (follow how `ServiceRecon` is exported/added). Update `builtins.spec.ts`: bump the expected template count by 1, assert `vuln-active` membership, and assert `registry.get('vuln-active')` resolves (mirror the `service-recon` assertions).

Run: `pnpm nx test templates` -> Expected: PASS.

- [ ] **Step 4: Verify + commit.** `pnpm nx run-many -t type-check,test -p scanners-all,templates` -> green.

```bash
git add libs/scanners/all libs/templates/src/builtins
git commit -m "feat(phase-8.4): register vuln scanners + vuln-active template"
```

---

## Task 6: e2e (opt-in) + full validation

**Files:** `apps/api-gateway-e2e/src/scenarios/vuln-active-e2e.spec.ts`.

- [ ] **Step 1:** Create an opt-in e2e gated by the base env + `VULN_ACTIVE_E2E=1` (mirror `apps/api-gateway-e2e/src/scenarios/service-recon-e2e.spec.ts` — copy its skip-guard, login, `createEngagementWithWildcardScope`, `runTemplate`, `pollTemplateRun` helpers). Scenario: login; create engagement with wildcard scope; `runTemplate('vuln-active', target)`; `pollTemplateRun` until terminal; **assert** the run reaches `COMPLETED`. Per-scanner results depend on whether the target is actually vulnerable, so log counts of Findings as soft signals; no hard per-scanner assertion. The suite stays skipped without the gate.

- [ ] **Step 2: Full validation.** Run:

```
pnpm nx run-many -t lint,type-check,test -p scanner-sdk,scanners-xss-scan,scanners-sqli-scan,scanners-cmdi-scan,scanners-all,templates,parsers,api-gateway,parser-worker
```

then type-check the e2e suite and build the workers:

```
npx tsc --project apps/api-gateway-e2e/tsconfig.spec.json --noEmit
pnpm nx run-many -t build -p api-gateway,parser-worker,scan-worker
```

Expected: all green.

- [ ] **Step 3: Commit.**

```bash
git add apps/api-gateway-e2e/src/scenarios/vuln-active-e2e.spec.ts
git commit -m "test(phase-8.4): vuln-active e2e (opt-in VULN_ACTIVE_E2E) + validation"
```

---

## Validation criteria (spec §1)
3 scanners registered + runnable (`xss-scan`, `sqli-scan`, `cmdi-scan`); parsers + tests; each exposes `level` (detect default); xss reuses dalfox image; 2 Dockerfiles; `vuln-active` template; Findings in existing tab (no front change); CI green incl. `build`. No Prisma change.

## Out of scope (spec §1)
OpenVAS/network-CVE (-> 8.5); exploitation/data-dump or shell as default; per-endpoint/param fan-out; authenticated scanning; XSStrike (redundant with dalfox).

## Self-review notes
- **Spec coverage:** 3 scanners (§2) = T1–T3; `level` input default-safe (§2) tested in each scanner spec; Dockerfiles (§1.4) = T4; `vuln-active` template (§1.5) = T5; e2e + CI incl. build (§4) = T6. No `Vulnerability`/Prisma model (§1).
- **Parser names** (`dalfox-json`, `sqlmap-json`, `commix-text`) match each scanner's `outputs[].parser`. `NormalizedFinding` fields match `types.ts`; severities are in the `Severity` enum. All parsers wrap in try/catch returning `emptyNormalizedOutput()` and handle blank/garbage.
- **Type consistency:** exported names `XssScanScanner`/`SqliScanScanner`/`CmdiScanScanner` + `*ScannerModule` + parser classes `DalfoxJsonParser`/`SqlmapJsonParser`/`CommixTextParser` used identically across scaffold, registration (T5), and parser registration (T1/T2/T3 Step 6).
- **Safety:** all 3 shell-quote the target; default `level=detect` (no `--dump`/`--os-shell`/`--os-cmd`/blind callback) asserted negatively in tests. `sqli-scan`/`cmdi-scan` set `readonlyRootfs:false` (tools write session dirs).
- **External-tool output is version-dependent** (dalfox/sqlmap/commix) — verify real output + adjust fixture/parser at impl time; keep parsers tolerant. Confirm the dalfox image tag `ghcr.io/hahwul/dalfox:v2.9.4` and the `sqlmap`/`commix` binary names at build (adjust the Dockerfile `ln -s` / scanner cmd if upstream differs).
