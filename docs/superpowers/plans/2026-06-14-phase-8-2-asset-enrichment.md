# Phase 8.2 — Asset Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Add 4 active-but-light enrichment scanners — `favicon` (mmh3 hash), `wafw00f` (WAF), `cdncheck` (CDN), `js-recon` (endpoints+secrets in JS) — mapping output onto existing `Technology`/`Endpoint`/`Finding` entities. No Prisma/enum/migration changes.

**Architecture:** Each scanner is a `ScannerDefinition` in `libs/scanners/<tool>` auto-registered in `AllScannersModule`, with a parser in `libs/parsers/src/<tool>-<fmt>` registered in `ParsersModule`. Output persisted by the existing `TechnologyPersister`/`EndpointPersister`/`FindingPersister`. `favicon` reuses the existing `projectdiscovery/httpx:v1.9.0` image (no new Dockerfile). A `web-enrich` template chains all four.

**Tech Stack:** NestJS, Nx, Zod, Docker, Jest. Spec: `docs/superpowers/specs/2026-06-14-phase-8-2-asset-enrichment-design.md`. **Pattern reference: Phase 8.1** (`libs/scanners/asnmap`, `libs/scanners/crtsh`, `libs/parsers/src/asnmap-json`, `libs/parsers/src/parsers.module.ts`).

---

## Reference patterns (read once)
- Scanner lib scaffold: `libs/scanners/asnmap/` (copy it, rename). httpx-style stdin scanner: `libs/scanners/httpx/src/httpx.scanner.ts` (image `projectdiscovery/httpx:v1.9.0`, `cmd: ['httpx', ...args], stdin: target`, no shell). Shell+credential style: `libs/scanners/shodan`.
- Parser: `libs/parsers/src/asnmap-json/` + registration in `libs/parsers/src/parsers.module.ts` (import + providers + exports + ctor param + onModuleInit). Barrel: add `export * from './<tool>-<fmt>'` to `libs/parsers/src/index.ts`.
- Types `libs/parsers/src/types.ts`: `NormalizedTechnology = { assetValue, name, version?, categories? }`, `NormalizedEndpoint = { url, method?, statusCode?, contentLength? }`, `NormalizedFinding = { scannerName, title, severity, location?, description? }`, `emptyNormalizedOutput()`.
- Registration: `libs/scanners/all/src/all-scanners.module.ts`. Template: `libs/templates/src/builtins/osint-passive-deep.ts` (just added) + `index.ts` (`BUILTIN_TEMPLATES`). `tsconfig.base.json` paths.
- Dockerfiles: `docker/scanners/<tool>/Dockerfile` (`crtsh`=alpine+curl, a Go-tool one, a Python one).

**External-tool caveat (as in 8.1):** confirm each tool's real CLI flags + output during implementation and adjust the fixture/parser; keep parsers tolerant (never throw; `emptyNormalizedOutput()` on bad input).

---

## Task 1: `favicon` scanner + `favicon-json` parser (reuses httpx image)

**Files:** lib `libs/scanners/favicon/`; parser `libs/parsers/src/favicon-json/`; tests; `tsconfig.base.json`.

- [ ] **Step 1: Scaffold** `libs/scanners/favicon/` by copying `libs/scanners/asnmap/`; rename `asnmap`→`favicon`, `Asnmap`→`Favicon`, project `scanners-asnmap`→`scanners-favicon`. Add alias `"@autoscanner/scanners-favicon": ["libs/scanners/favicon/src/index.ts"]`. Verify zero `asnmap` leftovers.

- [ ] **Step 2: Failing scanner test** `src/__tests__/favicon.scanner.spec.ts`:
```ts
import { FaviconScanner } from '../favicon.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';
const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/tmp' };
describe('FaviconScanner', () => {
  it('reuses the httpx image, passes target via stdin, JSONL → favicon-json, produces Technology', () => {
    expect(FaviconScanner.name).toBe('favicon');
    expect(FaviconScanner.docker.image).toBe('projectdiscovery/httpx:v1.9.0');
    expect(FaviconScanner.outputs[0]).toEqual({ format: 'JSONL', capture: 'stdout', parser: 'favicon-json' });
    expect(FaviconScanner.produces).toEqual(expect.arrayContaining(['Technology']));
    expect(FaviconScanner.requiresCredential).toBeUndefined();
  });
  it('build() runs httpx -favicon with target on stdin (no shell interpolation)', () => {
    const { cmd, stdin } = FaviconScanner.build(FaviconScanner.inputSchema.parse({}), 'example.com', ctx);
    expect(cmd).toEqual(['httpx', '-favicon', '-json', '-silent', '-nc']);
    expect(stdin).toBe('example.com');
  });
});
```
Run `pnpm nx test scanners-favicon` → FAIL.

- [ ] **Step 3: Implement** `libs/scanners/favicon/src/favicon.scanner.ts`:
```ts
import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const FaviconInput = z.object({});
export type FaviconInputType = z.infer<typeof FaviconInput>;

export const FaviconScanner: ScannerDefinition<FaviconInputType> = {
  name: 'favicon',
  displayName: 'Favicon hash (httpx)',
  category: [ScannerCategory.WEB_FINGERPRINT],
  description:
    'Computes the mmh3 favicon hash of a web host (httpx -favicon) for technology fingerprinting and pivoting. Actively probes the target.',
  inputSchema: FaviconInput,
  docker: {
    image: 'projectdiscovery/httpx:v1.9.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 300_000,
  },
  build(_input, target) {
    return { cmd: ['httpx', '-favicon', '-json', '-silent', '-nc'], stdin: target };
  },
  outputs: [{ format: 'JSONL', capture: 'stdout', parser: 'favicon-json' }],
  produces: ['Technology'],
};
```
Update `index.ts` + `favicon.module.ts`. Run `pnpm nx test scanners-favicon` → PASS.

- [ ] **Step 4: Failing parser test** `libs/parsers/src/__tests__/favicon-json.parser.spec.ts`:
```ts
import { FaviconJsonParser } from '../favicon-json';
import type { ParserContext } from '../types';
const ctx: ParserContext = { scanJobId: 'j', scannerName: 'favicon', target: 'example.com', engagementId: 'e' };
describe('FaviconJsonParser', () => {
  const parser = new FaviconJsonParser();
  it('emits a favicon-hash Technology per host with a non-empty favicon field', async () => {
    const input = [
      JSON.stringify({ host: 'example.com', url: 'https://example.com', favicon: '-1234567890' }),
      JSON.stringify({ host: 'no-favicon.com', url: 'https://no-favicon.com' }),
    ].join('\n');
    const out = await parser.parse(input, ctx);
    expect(out.technologies).toHaveLength(1);
    expect(out.technologies[0]).toEqual(
      expect.objectContaining({ assetValue: 'example.com', name: 'favicon-hash:-1234567890', categories: ['favicon'] }),
    );
  });
  it('returns empty on blank/garbage', async () => {
    expect((await parser.parse('', ctx)).technologies).toHaveLength(0);
    expect((await parser.parse('not json', ctx)).technologies).toHaveLength(0);
  });
});
```
Run `pnpm nx test parsers --testPathPattern=favicon-json` → FAIL.

- [ ] **Step 5: Implement** `libs/parsers/src/favicon-json/favicon-json.parser.ts` (+ index.ts):
```ts
import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

interface HttpxRecord { host?: string; input?: string; url?: string; favicon?: string }

function hostOf(rec: HttpxRecord, fallback: string): string {
  return (rec.host ?? rec.input ?? rec.url ?? fallback).toLowerCase();
}

@Injectable()
export class FaviconJsonParser implements Parser {
  readonly name = 'favicon-json';
  readonly formats: RawOutputFormat[] = ['JSONL'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');
    if (!text.trim()) return out;
    const seen = new Set<string>();
    for (const line of text.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      let rec: HttpxRecord;
      try {
        rec = JSON.parse(t) as HttpxRecord;
      } catch {
        continue;
      }
      const fav = typeof rec.favicon === 'string' ? rec.favicon.trim() : '';
      if (!fav || fav === '0') continue;
      const host = hostOf(rec, ctx.target);
      const key = `${host}|${fav}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.technologies.push({ assetValue: host, name: `favicon-hash:${fav}`, categories: ['favicon'] });
    }
    return out;
  }
}
```

- [ ] **Step 6: Register** `FaviconJsonParser` in `parsers.module.ts` (import+providers+exports+ctor `faviconJson`+onModuleInit) and add `export * from './favicon-json'` to `libs/parsers/src/index.ts`. Run `pnpm nx test parsers --testPathPattern=favicon-json` → PASS.

- [ ] **Step 7: Verify + commit.** `pnpm nx run-many -t type-check,test -p scanners-favicon,parsers` → green. `grep -rni asnmap libs/scanners/favicon` → none.
```
git commit -m "feat(phase-8.2): favicon scanner (httpx -favicon) + parser → Technology"
```

---

## Task 2: `wafw00f` scanner + parser → Technology

**Files:** lib `libs/scanners/wafw00f/`; parser `libs/parsers/src/wafw00f-json/`; tests.

> **Verify tool:** `wafw00f <url> -f json -o /dev/stdout` prints a JSON array of `{ url, detected, firewall, manufacturer }`. Adjust fixture/parser to the installed version.

- [ ] **Step 1: Scaffold** `libs/scanners/wafw00f/` (copy asnmap; `Wafw00f`/`scanners-wafw00f`; alias). Verify no `asnmap` leftovers.
- [ ] **Step 2: Failing scanner test** asserting: name `wafw00f`, image `autoscanner/wafw00f:1.0`, output `{format:'JSON',capture:'stdout',parser:'wafw00f-json'}`, produces `['Technology']`, no credential; and `build()` produces `cmd[0]==='sh'`, `cmd[2]` contains `wafw00f` + `'example.com'` (shell-quoted) + `-f json`.
- [ ] **Step 3: Implement** `wafw00f.scanner.ts`:
```ts
import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';
const Wafw00fInput = z.object({});
export type Wafw00fInputType = z.infer<typeof Wafw00fInput>;
function shellQuoteSingle(s: string): string { return `'${s.replace(/'/g, "'\\''")}'`; }
export const Wafw00fScanner: ScannerDefinition<Wafw00fInputType> = {
  name: 'wafw00f',
  displayName: 'wafw00f (WAF detection)',
  category: [ScannerCategory.WEB_FINGERPRINT],
  description: 'Detects the Web Application Firewall in front of a host. Actively probes the target.',
  inputSchema: Wafw00fInput,
  docker: { image: 'autoscanner/wafw00f:1.0', network: 'bridge', capabilities: [], readonlyRootfs: true, memoryLimitMb: 512, cpuQuota: 1_000_000, defaultTimeoutMs: 180_000 },
  build(_input, target) {
    const script = `wafw00f ${shellQuoteSingle(target)} -f json -o /dev/stdout 2>/dev/null || true`;
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'JSON', capture: 'stdout', parser: 'wafw00f-json' }],
  produces: ['Technology'],
};
```
- [ ] **Step 4: Failing parser test** `wafw00f-json.parser.spec.ts`:
```ts
import { Wafw00fJsonParser } from '../wafw00f-json';
import type { ParserContext } from '../types';
const ctx: ParserContext = { scanJobId: 'j', scannerName: 'wafw00f', target: 'example.com', engagementId: 'e' };
describe('Wafw00fJsonParser', () => {
  const parser = new Wafw00fJsonParser();
  it('emits a WAF Technology for each detected firewall', async () => {
    const input = JSON.stringify([{ url: 'https://example.com', detected: true, firewall: 'Cloudflare', manufacturer: 'Cloudflare' }]);
    const out = await parser.parse(input, ctx);
    expect(out.technologies).toHaveLength(1);
    expect(out.technologies[0]).toEqual(expect.objectContaining({ assetValue: 'example.com', name: 'WAF: Cloudflare', categories: ['waf'] }));
  });
  it('emits nothing when not detected, and is tolerant of blank/garbage', async () => {
    expect((await parser.parse(JSON.stringify([{ url: 'https://x', detected: false, firewall: 'None' }]), ctx)).technologies).toHaveLength(0);
    expect((await parser.parse('', ctx)).technologies).toHaveLength(0);
    expect((await parser.parse('not json', ctx)).technologies).toHaveLength(0);
  });
});
```
- [ ] **Step 5: Implement** `wafw00f-json.parser.ts` (+ index): parse JSON (array OR single object → normalize to array); for each entry with `detected === true` and a `firewall` that isn't falsy/`'None'/'Generic'`, push `{ assetValue: hostFromUrlOrCtx, name: 'WAF: '+firewall, categories: ['waf'] }`. Derive `assetValue` from the entry's `url` hostname (fallback `ctx.target`). Tolerant try/catch.
- [ ] **Step 6: Register** in `parsers.module.ts` + `index.ts` barrel.
- [ ] **Step 7: Verify + commit.** `feat(phase-8.2): wafw00f scanner + parser (WAF → Technology)`

---

## Task 3: `cdncheck` scanner + parser → Technology

**Files:** lib `libs/scanners/cdncheck/`; parser `libs/parsers/src/cdncheck-json/`; tests.

> **Verify tool:** `echo <host> | cdncheck -json -silent` prints JSONL `{ input, cdn (bool), cdn_name, waf, waf_name, cloud, cloud_name }`. Adjust.

- [ ] **Step 1: Scaffold** `libs/scanners/cdncheck/` (copy asnmap; `Cdncheck`/`scanners-cdncheck`; alias).
- [ ] **Step 2: Failing scanner test:** name `cdncheck`, image `autoscanner/cdncheck:1.0`, output `{format:'JSONL',capture:'stdout',parser:'cdncheck-json'}`, produces `['Technology']`, no cred; `build()` → `sh -lc` with `echo '<target>' | cdncheck -json`.
- [ ] **Step 3: Implement** `cdncheck.scanner.ts` (same shape as wafw00f but):
```ts
  name: 'cdncheck', displayName: 'cdncheck (CDN/cloud)',
  category: [ScannerCategory.WEB_FINGERPRINT, ScannerCategory.NETWORK_DISCOVERY],
  description: 'Identifies whether a host/IP is behind a CDN, WAF or cloud provider (ProjectDiscovery cdncheck).',
  docker image 'autoscanner/cdncheck:1.0' (mem 256, timeout 120_000),
  build: const script = `echo ${shellQuoteSingle(target)} | cdncheck -json -silent 2>/dev/null || true`; return { cmd: ['sh','-lc',script] };
  outputs: [{ format: 'JSONL', capture: 'stdout', parser: 'cdncheck-json' }], produces: ['Technology'],
```
- [ ] **Step 4: Failing parser test** `cdncheck-json.parser.spec.ts`:
```ts
import { CdncheckJsonParser } from '../cdncheck-json';
import type { ParserContext } from '../types';
const ctx: ParserContext = { scanJobId: 'j', scannerName: 'cdncheck', target: 'example.com', engagementId: 'e' };
describe('CdncheckJsonParser', () => {
  const parser = new CdncheckJsonParser();
  it('emits a CDN Technology when cdn/cloud/waf is flagged', async () => {
    const input = [
      JSON.stringify({ input: '1.2.3.4', cdn: true, cdn_name: 'cloudflare' }),
      JSON.stringify({ input: '5.6.7.8', cloud: true, cloud_name: 'aws' }),
      JSON.stringify({ input: '9.9.9.9' }),
    ].join('\n');
    const out = await parser.parse(input, ctx);
    const names = out.technologies.map((t) => t.name).sort();
    expect(names).toEqual(['CDN: cloudflare', 'cloud: aws']);
    expect(out.technologies.every((t) => t.categories?.includes('cdn'))).toBe(true);
  });
  it('tolerant of blank/garbage', async () => {
    expect((await parser.parse('', ctx)).technologies).toHaveLength(0);
  });
});
```
- [ ] **Step 5: Implement** `cdncheck-json.parser.ts` (+ index): per JSONL line, if `cdn` → `name: 'CDN: '+cdn_name`; if `cloud` → `name: 'cloud: '+cloud_name`; if `waf` → `name: 'WAF: '+waf_name`; each → Technology `{ assetValue: input, name, categories: ['cdn'] }`. Tolerant.
- [ ] **Step 6: Register** + barrel.
- [ ] **Step 7: Verify + commit.** `feat(phase-8.2): cdncheck scanner + parser (CDN/cloud → Technology)`

---

## Task 4: `js-recon` scanner + parser → Endpoint + Finding

**Files:** lib `libs/scanners/js-recon/`; parser `libs/parsers/src/js-recon-json/`; tests.

> **Verify tool chain:** the Docker image runs a wrapper that finds the host's JS (subjs) and extracts endpoints (linkfinder) + secrets (regex), emitting ONE JSON object: `{ "endpoints": ["/api/users", "https://x/y"], "secrets": [{ "type": "aws_access_key", "match": "AKIA...", "jsUrl": "https://example.com/app.js" }] }`. The wrapper script is owned by the Dockerfile (Task 5); the scanner just invokes it and the parser consumes this shape. **Confirm/adjust the real wrapper output during implementation.**

- [ ] **Step 1: Scaffold** `libs/scanners/js-recon/` (copy asnmap; `JsRecon`/`scanners-js-recon`; alias).
- [ ] **Step 2: Failing scanner test:** name `js-recon`, image `autoscanner/js-recon:1.0`, output `{format:'JSON',capture:'stdout',parser:'js-recon-json'}`, produces `['Endpoint','Finding']`, no cred; `build()` → `sh -lc` invoking the wrapper `js-recon` with the shell-quoted target.
- [ ] **Step 3: Implement** `js-recon.scanner.ts`:
```ts
import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';
const JsReconInput = z.object({});
export type JsReconInputType = z.infer<typeof JsReconInput>;
function shellQuoteSingle(s: string): string { return `'${s.replace(/'/g, "'\\''")}'`; }
export const JsReconScanner: ScannerDefinition<JsReconInputType> = {
  name: 'js-recon',
  displayName: 'JS recon (endpoints + secrets)',
  category: [ScannerCategory.WEB_ENUM, ScannerCategory.VULN_SCAN],
  description: 'Discovers a host JS files, extracts hidden endpoints (linkfinder) and exposed secrets (regex). Actively probes the target.',
  inputSchema: JsReconInput,
  docker: { image: 'autoscanner/js-recon:1.0', network: 'bridge', capabilities: [], readonlyRootfs: true, memoryLimitMb: 768, cpuQuota: 2_000_000, defaultTimeoutMs: 600_000 },
  build(_input, target) {
    // `js-recon` is a wrapper script baked into the image (subjs → fetch JS → linkfinder + secret regex → single JSON).
    const script = `js-recon ${shellQuoteSingle(target)} 2>/dev/null || true`;
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'JSON', capture: 'stdout', parser: 'js-recon-json' }],
  produces: ['Endpoint', 'Finding'],
};
```
- [ ] **Step 4: Failing parser test** `js-recon-json.parser.spec.ts`:
```ts
import { JsReconJsonParser } from '../js-recon-json';
import type { ParserContext } from '../types';
const ctx: ParserContext = { scanJobId: 'j', scannerName: 'js-recon', target: 'example.com', engagementId: 'e' };
describe('JsReconJsonParser', () => {
  const parser = new JsReconJsonParser();
  it('maps endpoints → Endpoint and secrets → Finding (MEDIUM)', async () => {
    const input = JSON.stringify({
      endpoints: ['/api/users', 'https://example.com/admin', '/api/users'],
      secrets: [{ type: 'aws_access_key', match: 'AKIAEXAMPLE', jsUrl: 'https://example.com/app.js' }],
    });
    const out = await parser.parse(input, ctx);
    const urls = out.endpoints.map((e) => e.url).sort();
    expect(urls).toEqual(['/api/users', 'https://example.com/admin']); // deduped
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0]).toEqual(expect.objectContaining({ scannerName: 'js-recon', severity: 'MEDIUM', location: 'https://example.com/app.js' }));
    expect(out.findings[0].title).toContain('aws_access_key');
  });
  it('tolerant of blank/garbage/missing keys', async () => {
    expect((await parser.parse('', ctx)).endpoints).toHaveLength(0);
    expect((await parser.parse('{}', ctx)).findings).toHaveLength(0);
  });
});
```
- [ ] **Step 5: Implement** `js-recon-json.parser.ts` (+ index):
```ts
import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

interface JsReconSecret { type?: string; match?: string; jsUrl?: string }
interface JsReconOutput { endpoints?: unknown; secrets?: unknown }

@Injectable()
export class JsReconJsonParser implements Parser {
  readonly name = 'js-recon-json';
  readonly formats: RawOutputFormat[] = ['JSON'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');
    if (!text.trim()) return out;
    let parsed: JsReconOutput;
    try {
      parsed = JSON.parse(text) as JsReconOutput;
    } catch {
      return out;
    }
    if (Array.isArray(parsed.endpoints)) {
      const seen = new Set<string>();
      for (const ep of parsed.endpoints) {
        if (typeof ep !== 'string' || !ep.trim() || seen.has(ep)) continue;
        seen.add(ep);
        out.endpoints.push({ url: ep });
      }
    }
    if (Array.isArray(parsed.secrets)) {
      for (const s of parsed.secrets as JsReconSecret[]) {
        if (!s || typeof s.type !== 'string') continue;
        out.findings.push({
          scannerName: ctx.scannerName,
          title: `Exposed secret in JS: ${s.type}`,
          severity: 'MEDIUM',
          location: typeof s.jsUrl === 'string' ? s.jsUrl : undefined,
          description: 'js-recon matched a secret pattern in a JavaScript file served by the host.',
        });
      }
    }
    return out;
  }
}
```
- [ ] **Step 6: Register** + barrel.
- [ ] **Step 7: Verify + commit.** `feat(phase-8.2): js-recon scanner + parser (JS endpoints/secrets → Endpoint/Finding)`

---

## Task 5: Dockerfiles (wafw00f, cdncheck, js-recon)

**Files:** `docker/scanners/{wafw00f,cdncheck,js-recon}/Dockerfile`. (favicon reuses `projectdiscovery/httpx:v1.9.0` — no Dockerfile.)

Match house style (read `docker/scanners/crtsh/Dockerfile` + a Go-tool + a Python one): non-root `scanner` user, `ca-certificates`, `sh`, `ENTRYPOINT []`, no baked secrets.

- [ ] **Step 1:** `docker/scanners/wafw00f/Dockerfile` — `FROM python:3.12-slim`; `pip install wafw00f`; ensure `sh`+`ca-certificates`.
- [ ] **Step 2:** `docker/scanners/cdncheck/Dockerfile` — multi-stage Go: `go install github.com/projectdiscovery/cdncheck/cmd/cdncheck@latest`; runtime alpine + ca-certificates + sh.
- [ ] **Step 3:** `docker/scanners/js-recon/Dockerfile` — base with `subjs` (Go: `go install github.com/lc/subjs@latest`), Python `linkfinder` (`git clone https://github.com/GerbenJavado/LinkFinder` + `pip install -r requirements.txt`), `curl`, and a wrapper script `/usr/local/bin/js-recon` that: takes the target host, runs `subjs -u <host>` to list JS URLs (cap to ~50), downloads each (size+time capped via `curl --max-filesize` / `--max-time`), runs LinkFinder to collect endpoints, applies a small secret-regex set (aws key, google api, slack token, generic `api_key=`), and prints ONE JSON `{ "endpoints": [...], "secrets": [{type,match,jsUrl}] }`. **Cap JS count + per-file size** (spec §5). Pin tool versions where the house style pins.
- [ ] **Step 4:** Verify structure (no daemon to build). `ls docker/scanners/{wafw00f,cdncheck,js-recon}/Dockerfile`. Commit `feat(phase-8.2): Dockerfiles for wafw00f, cdncheck, js-recon`.

---

## Task 6: Register scanners + `web-enrich` template

**Files:** `libs/scanners/all/src/all-scanners.module.ts`; `libs/templates/src/builtins/web-enrich.ts`; `libs/templates/src/builtins/index.ts`; relevant tests.

- [ ] **Step 1:** Add the 4 module imports (`FaviconScannerModule`, `Wafw00fScannerModule`, `CdncheckScannerModule`, `JsReconScannerModule` — verify exact exported names) to `SCANNER_MODULES` in `all-scanners.module.ts`. Update `all-scanners.module.spec.ts` to assert the 4 new names in the registry-has loop.
- [ ] **Step 2:** Create `libs/templates/src/builtins/web-enrich.ts` (mirror `osint-passive-deep.ts` shape exactly — `name: 'web-enrich'`, `displayName`, `description`, `steps` each `{ scannerName, inputs: {}, target: { kind: 'context', path: 'target' } }` for `favicon`, `wafw00f`, `cdncheck`, `js-recon`). Match the real `TemplateDefinition`/step type from `libs/templates/src/types.ts`.
- [ ] **Step 3:** Export it in `libs/templates/src/builtins/index.ts` (`export * from './web-enrich'`) + add `WebEnrich` to `BUILTIN_TEMPLATES`. Update `builtins.spec.ts` (length + membership + `registry.get('web-enrich')`).
- [ ] **Step 4:** `pnpm nx run-many -t type-check,test -p scanners-all,templates` → green. Commit `feat(phase-8.2): register enrichment scanners + web-enrich template`.

---

## Task 7: e2e (opt-in) + full validation

**Files:** `apps/api-gateway-e2e/src/scenarios/web-enrich-e2e.spec.ts`.

- [ ] **Step 1:** Opt-in e2e gated by base env + `WEB_ENRICH_E2E=1` (mirror `recon-passive-v2-e2e.spec.ts` from 8.1). Scenario: login; `createEngagementWithWildcardScope`; runTemplate `web-enrich` against a real web host; poll until terminal; **hard-assert** ≥1 `Technology` with a `favicon-hash:` name (favicon needs no key); WAF/CDN/JS as soft logs. Suite stays skipped without the gate; type-check only.
- [ ] **Step 2: Full validation:**
```
pnpm nx run-many -t lint,type-check,test -p parsers,scanner-sdk,scanners-favicon,scanners-wafw00f,scanners-cdncheck,scanners-js-recon,scanners-all,templates,api-gateway,parser-worker
```
+ `npx tsc --project apps/api-gateway-e2e/tsconfig.spec.json --noEmit` + `pnpm nx run-many -t build -p api-gateway,parser-worker,scan-worker`. All green.
- [ ] **Step 3:** Commit `test(phase-8.2): web-enrich e2e (opt-in) + validation`.

---

## Validation criteria (spec §1)
4 scanners registered + runnable (T1–T4, T6); parsers + tests (T1–T4); favicon reuses httpx image (T1); Dockerfiles for the other 3 (T5); `web-enrich` template (T6); data in existing Technology/Endpoint/Finding tabs (no front change); CI green incl. build (T7). **No Prisma/enum/migration.** ✅

## Out of scope
Screenshots (gowitness) → **8.2b** (binary capture). Favicon-hash cross-engagement correlation; advanced JS deobfuscation.

## Self-review notes
- Spec coverage: every §1 item maps to a task. No schema change anywhere (Technology/Endpoint/Finding pre-exist).
- Type consistency: parser names (`favicon-json`, `wafw00f-json`, `cdncheck-json`, `js-recon-json`) match each scanner's `outputs[].parser`. `NormalizedTechnology`/`NormalizedEndpoint`/`NormalizedFinding` field names match `types.ts`. favicon uses stdin (no shellQuoteSingle); the 3 shell scanners quote `target`.
- External-tool caveat flagged per task (wafw00f/cdncheck/js-recon output shapes verified at impl time; js-recon wrapper output is owned by its Dockerfile in T5 and consumed by the T4 parser — keep them in sync).
