# Phase 8.1 — Passive Attack-Surface v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add 5 passive recon scanners (`asnmap`, `cloud-enum`, `github-subdomains`, `trufflehog`, `securitytrails`) that map their output onto existing entities (`Subdomain`/`DnsRecord`/`Finding`/`OrgMetadata`), plus a template that chains them — so operators discover ASN/IP ranges, exposed cloud buckets, GitHub-leaked subdomains & secrets, and passive DNS, with no new Prisma models.

**Architecture:** Each scanner is a `ScannerDefinition` (Docker-sandboxed) in `libs/scanners/<tool>`, auto-registered in `AllScannersModule`; each has a parser in `libs/parsers/src/<tool>-<fmt>` registered in `ParsersModule`; output is persisted by the existing parser-worker persisters. Two scanners need an API key resolved by the existing `requiresCredential` mechanism (new `ApiProvider` enum values `GITHUB`/`SECURITYTRAILS`). One enum value `CLOUD_BUCKET` is added for cloud-bucket org-metadata.

**Tech Stack:** NestJS, Nx, Zod, Prisma (Postgres enums), Docker, Jest. Spec: `docs/superpowers/specs/2026-06-14-phase-8-1-passive-surface-design.md`.

---

## Reference patterns (read these once before starting)
- **Scanner lib (no-cred, curl-based):** `libs/scanners/crtsh/` — `src/crtsh.scanner.ts`, `src/crtsh.module.ts`, `src/index.ts`, `src/__tests__/crtsh.scanner.spec.ts`, `project.json`, `package.json`, `jest.config.ts`, `tsconfig*.json`.
- **Scanner lib (with credential):** `libs/scanners/shodan/src/shodan.scanner.ts` — shows `requiresCredential` + `credentialEnvVar` + a `sh -lc` build script with `shellQuoteSingle`.
- **Parser:** `libs/parsers/src/crtsh-json/crtsh-json.parser.ts` (emits `out.assets`), `libs/parsers/src/theharvester-text/theharvester-text.parser.ts` (regex-over-text). Registry wiring in `libs/parsers/src/parsers.module.ts`. Types in `libs/parsers/src/types.ts` (`NormalizedOutput`, `emptyNormalizedOutput`).
- **Registration:** `libs/scanners/all/src/all-scanners.module.ts` (scanner modules list). `tsconfig.base.json` `paths` (alias per lib).
- **Dockerfiles:** `docker/scanners/<tool>/Dockerfile` (e.g. `crtsh`, `shodan`).
- **Persister mapping (no change needed):** `apps/parser-worker/src/app/persisters/org-metadata-persister.ts` passes `item.kind` straight to Prisma; `finding-persister.ts`, `dns-record-persister.ts`, `subdomain-ip-persister.ts`/`asset-persister.ts` handle the rest.
- **Template:** `libs/templates/src/builtins/osint-passive.ts` + `recon-passive.ts` (step shape: `{ scannerName, inputs, target }`); registered in `libs/templates/src/builtins/index.ts`.

**Important external-tool note:** the exact CLI flags and output of third-party tools vary by version. Each scanner task below gives a concrete build command + a representative fixture + a tolerant parser. **During implementation, run the tool once (or read its `--help`) to confirm the real output shape, and adjust the fixture + parser accordingly** — the parser must be tolerant (never throw; return `emptyNormalizedOutput()` on unparseable input), exactly like `crtsh-json`/`theharvester-text`.

---

## Task 1: Prisma enum deltas + parser union + migration

**Files:**
- Modify: `prisma/schema.prisma` (enums `OrgMetadataKind`, `ApiProvider`)
- Modify: `libs/parsers/src/types.ts` (`NormalizedOrgMetadata.kind` union)
- Create: `prisma/migrations/20260614030000_phase8_passive_surface/migration.sql`

- [ ] **Step 1: Add enum values in `prisma/schema.prisma`.** Change `enum OrgMetadataKind { WHOIS ASN ORG NETBLOCK OTHER }` to include `CLOUD_BUCKET` (after `NETBLOCK`), and `enum ApiProvider { SHODAN CENSYS }` to add `GITHUB` and `SECURITYTRAILS`:

```prisma
enum OrgMetadataKind {
  WHOIS
  ASN
  ORG
  NETBLOCK
  CLOUD_BUCKET
  OTHER
}

enum ApiProvider {
  SHODAN
  CENSYS
  GITHUB
  SECURITYTRAILS
}
```

- [ ] **Step 2: Update the parser TS union** in `libs/parsers/src/types.ts` — `NormalizedOrgMetadata.kind` currently `'WHOIS' | 'ASN' | 'ORG' | 'NETBLOCK' | 'OTHER'`; add `'CLOUD_BUCKET'`:

```ts
export interface NormalizedOrgMetadata {
  kind: 'WHOIS' | 'ASN' | 'ORG' | 'NETBLOCK' | 'CLOUD_BUCKET' | 'OTHER';
  data: unknown;
}
```

- [ ] **Step 3: Hand-write the migration** (no local Postgres). Postgres `ALTER TYPE ... ADD VALUE` cannot run inside a transaction, so the file must avoid the implicit migration transaction — Prisma honors a leading `-- AlterEnum` block; mirror how prior enum migrations look if any exist, otherwise use this (each `ADD VALUE` on its own statement):

`prisma/migrations/20260614030000_phase8_passive_surface/migration.sql`:
```sql
-- AlterEnum
ALTER TYPE "OrgMetadataKind" ADD VALUE IF NOT EXISTS 'CLOUD_BUCKET';

-- AlterEnum
ALTER TYPE "ApiProvider" ADD VALUE IF NOT EXISTS 'GITHUB';

-- AlterEnum
ALTER TYPE "ApiProvider" ADD VALUE IF NOT EXISTS 'SECURITYTRAILS';
```

- [ ] **Step 4: Regenerate the client.** Run: `pnpm prisma generate` — Expected: success (no DB needed).
- [ ] **Step 5: Type-check.** Run: `pnpm nx run-many -t type-check -p database,parsers` — Expected: PASS.
- [ ] **Step 6: Commit.**
```bash
git add prisma/schema.prisma libs/parsers/src/types.ts prisma/migrations/20260614030000_phase8_passive_surface
git commit -m "feat(phase-8.1): enum deltas (CLOUD_BUCKET, GITHUB, SECURITYTRAILS) + parser union"
```

---

## Task 2: `asnmap` scanner + parser (exemplar — full vertical slice)

**Files:**
- Create lib `libs/scanners/asnmap/` (scaffold by copying `libs/scanners/crtsh/` — see Step 1)
- Create parser `libs/parsers/src/asnmap-json/asnmap-json.parser.ts` + `index.ts`
- Create tests `libs/scanners/asnmap/src/__tests__/asnmap.scanner.spec.ts`, `libs/parsers/src/__tests__/asnmap-json.parser.spec.ts`
- Modify: `tsconfig.base.json` (path alias)

- [ ] **Step 1: Scaffold the lib by copying crtsh.** Copy every file under `libs/scanners/crtsh/` to `libs/scanners/asnmap/`, then in the copied files replace `crtsh`→`asnmap` and `Crtsh`→`Asnmap` (filenames: `crtsh.scanner.ts`→`asnmap.scanner.ts`, `crtsh.module.ts`→`asnmap.module.ts`; and inside `project.json`, `package.json`, `jest.config.ts`, `tsconfig*.json`, `src/index.ts`, `src/*.module.ts` rename the project name/paths/coverage dir `scanners-crtsh`→`scanners-asnmap`). Add the alias to `tsconfig.base.json` `compilerOptions.paths` mirroring the crtsh entry: `"@autoscanner/scanners-asnmap": ["libs/scanners/asnmap/src/index.ts"]`.

- [ ] **Step 2: Write the failing scanner test** `libs/scanners/asnmap/src/__tests__/asnmap.scanner.spec.ts`:

```ts
import { AsnmapScanner } from '../asnmap.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/tmp' };

describe('AsnmapScanner', () => {
  it('declares name, docker image, JSONL output → asnmap-json parser, produces OrgMetadata', () => {
    expect(AsnmapScanner.name).toBe('asnmap');
    expect(AsnmapScanner.docker.image).toBe('autoscanner/asnmap:1.0');
    expect(AsnmapScanner.outputs[0]).toEqual({ format: 'JSONL', capture: 'stdout', parser: 'asnmap-json' });
    expect(AsnmapScanner.produces).toEqual(expect.arrayContaining(['OrgMetadata']));
    expect(AsnmapScanner.requiresCredential).toBeUndefined();
  });

  it('build() runs asnmap -d <target> with JSON+silent, shell-quoting the target', () => {
    const { cmd } = AsnmapScanner.build(AsnmapScanner.inputSchema.parse({}), 'example.com', ctx);
    expect(cmd[0]).toBe('sh');
    expect(cmd[1]).toBe('-lc');
    expect(cmd[2]).toContain('asnmap');
    expect(cmd[2]).toContain("-d 'example.com'");
    expect(cmd[2]).toContain('-json');
  });

  it('build() neutralises shell metacharacters in target', () => {
    const { cmd } = AsnmapScanner.build(AsnmapScanner.inputSchema.parse({}), "a.com; rm -rf /", ctx);
    expect(cmd[2]).toContain("'a.com; rm -rf /'");
  });
});
```

- [ ] **Step 3: Run it, verify it fails.** Run: `pnpm nx test scanners-asnmap` — Expected: FAIL (cannot find `../asnmap.scanner` until you replace the copied crtsh content).

- [ ] **Step 4: Implement `libs/scanners/asnmap/src/asnmap.scanner.ts`:**

```ts
import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const AsnmapInput = z.object({});
export type AsnmapInputType = z.infer<typeof AsnmapInput>;

// Single-quote + escape embedded quotes so the target is shell-injection safe.
function shellQuoteSingle(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export const AsnmapScanner: ScannerDefinition<AsnmapInputType> = {
  name: 'asnmap',
  displayName: 'asnmap (ASN/CIDR)',
  category: [ScannerCategory.PASSIVE_RECON, ScannerCategory.NETWORK_DISCOVERY],
  description:
    'Passive ASN and CIDR range discovery for an organisation/domain via asnmap. ' +
    'Queries public BGP/ASN data — does not touch the target.',
  inputSchema: AsnmapInput,
  docker: {
    image: 'autoscanner/asnmap:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 256,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 120_000,
  },
  build(_input, target) {
    // -d <domain> resolves the org's ASN(s) and emits one JSON object per line.
    // `|| true` keeps exit 0 on "no result" so the job completes (not FAILED).
    const script = `asnmap -d ${shellQuoteSingle(target)} -json -silent || true`;
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'JSONL', capture: 'stdout', parser: 'asnmap-json' }],
  produces: ['OrgMetadata'],
};
```

Ensure `src/index.ts` exports it (`export * from './asnmap.scanner'; export * from './asnmap.module';`) and `src/asnmap.module.ts` registers `AsnmapScanner` (copy of crtsh.module with names replaced).

- [ ] **Step 5: Run the scanner test, verify PASS.** Run: `pnpm nx test scanners-asnmap` — Expected: PASS.

- [ ] **Step 6: Write the failing parser test** `libs/parsers/src/__tests__/asnmap-json.parser.spec.ts`:

```ts
import { AsnmapJsonParser } from '../asnmap-json';
import type { ParserContext } from '../types';

const ctx: ParserContext = { scanJobId: 'j', scannerName: 'asnmap', target: 'example.com', engagementId: 'e' };

describe('AsnmapJsonParser', () => {
  const parser = new AsnmapJsonParser();

  it('parses JSONL into one ASN OrgMetadata with collected CIDRs', async () => {
    // Representative asnmap -json output (one JSON object per line). VERIFY against the real tool.
    const input = [
      JSON.stringify({ as_number: 'AS15169', as_name: 'GOOGLE', as_country: 'US', as_range: ['8.8.8.0/24'] }),
      JSON.stringify({ as_number: 'AS15169', as_name: 'GOOGLE', as_country: 'US', as_range: ['8.34.208.0/20'] }),
    ].join('\n');
    const out = await parser.parse(input, ctx);
    expect(out.orgMetadata).toHaveLength(1);
    expect(out.orgMetadata[0].kind).toBe('ASN');
    const data = out.orgMetadata[0].data as { asn: string; cidrs: string[] };
    expect(data.asn).toBe('AS15169');
    expect(data.cidrs).toEqual(expect.arrayContaining(['8.8.8.0/24', '8.34.208.0/20']));
  });

  it('returns empty output on blank/garbage input', async () => {
    expect((await parser.parse('', ctx)).orgMetadata).toHaveLength(0);
    expect((await parser.parse('not json\n{bad', ctx)).orgMetadata).toHaveLength(0);
  });
});
```

- [ ] **Step 7: Run it, verify it fails.** Run: `pnpm nx test parsers --testPathPattern=asnmap-json` — Expected: FAIL (module missing).

- [ ] **Step 8: Implement `libs/parsers/src/asnmap-json/asnmap-json.parser.ts`** (+ `index.ts` re-exporting it):

```ts
import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

interface AsnmapRecord {
  as_number?: string;
  as_name?: string;
  as_country?: string;
  as_range?: string[] | string;
}

@Injectable()
export class AsnmapJsonParser implements Parser {
  readonly name = 'asnmap-json';
  readonly formats: RawOutputFormat[] = ['JSONL'];

  async parse(input: Buffer | string, _ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');
    if (!text.trim()) return out;

    // Group CIDRs by ASN across all JSONL lines.
    const byAsn = new Map<string, { asn: string; name?: string; country?: string; cidrs: Set<string> }>();
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let rec: AsnmapRecord;
      try {
        rec = JSON.parse(trimmed) as AsnmapRecord;
      } catch {
        continue; // tolerate non-JSON lines
      }
      const asn = typeof rec.as_number === 'string' ? rec.as_number : undefined;
      if (!asn) continue;
      const entry = byAsn.get(asn) ?? { asn, name: rec.as_name, country: rec.as_country, cidrs: new Set<string>() };
      const ranges = Array.isArray(rec.as_range) ? rec.as_range : rec.as_range ? [rec.as_range] : [];
      for (const r of ranges) if (typeof r === 'string' && r) entry.cidrs.add(r);
      byAsn.set(asn, entry);
    }

    for (const e of byAsn.values()) {
      out.orgMetadata.push({
        kind: 'ASN',
        data: { asn: e.asn, name: e.name, country: e.country, cidrs: Array.from(e.cidrs) },
      });
    }
    return out;
  }
}
```

- [ ] **Step 9: Register the parser** in `libs/parsers/src/parsers.module.ts` — add `import { AsnmapJsonParser } from './asnmap-json';`, add it to `providers`, `exports`, the constructor (`private readonly asnmapJson: AsnmapJsonParser`), and `onModuleInit` (`this.registry.register(this.asnmapJson);`).

- [ ] **Step 10: Run parser tests, verify PASS.** Run: `pnpm nx test parsers --testPathPattern=asnmap-json` — Expected: PASS. Then `pnpm nx run-many -t type-check -p scanners-asnmap,parsers` — PASS.

- [ ] **Step 11: Commit.**
```bash
git add libs/scanners/asnmap libs/parsers/src/asnmap-json libs/parsers/src/__tests__/asnmap-json.parser.spec.ts libs/parsers/src/parsers.module.ts tsconfig.base.json
git commit -m "feat(phase-8.1): asnmap scanner + asnmap-json parser (ASN/CIDR → OrgMetadata)"
```

---

## Task 3: `cloud-enum` scanner + parser

**Files:** lib `libs/scanners/cloud-enum/` (scaffold from crtsh, name `scanners-cloud-enum`, alias `@autoscanner/scanners-cloud-enum`); parser `libs/parsers/src/cloud-enum-text/`; tests.

> **Verify the real tool first:** `cloud_enum -k <keyword>` (initstring/cloud_enum) checks AWS/Azure/GCP and prints lines like `OPEN S3 BUCKET: http://<name>.s3.amazonaws.com/` and `Protected ...`. Confirm flags/format and adjust the fixture/parser.

- [ ] **Step 1: Scaffold** the lib (copy crtsh → cloud-enum; rename `crtsh`/`Crtsh`→`cloudEnum`/`CloudEnum`, class `CloudEnumScanner`; add alias). 
- [ ] **Step 2: Scanner test** `src/__tests__/cloud-enum.scanner.spec.ts`:

```ts
import { CloudEnumScanner } from '../cloud-enum.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';
const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/tmp' };
describe('CloudEnumScanner', () => {
  it('declares name/image/output/produces, no credential', () => {
    expect(CloudEnumScanner.name).toBe('cloud-enum');
    expect(CloudEnumScanner.docker.image).toBe('autoscanner/cloud-enum:1.0');
    expect(CloudEnumScanner.outputs[0]).toEqual({ format: 'TEXT', capture: 'stdout', parser: 'cloud-enum-text' });
    expect(CloudEnumScanner.produces).toEqual(expect.arrayContaining(['OrgMetadata', 'Finding']));
    expect(CloudEnumScanner.requiresCredential).toBeUndefined();
  });
  it('build() derives a keyword from the target (apex label) and quotes it', () => {
    const { cmd } = CloudEnumScanner.build(CloudEnumScanner.inputSchema.parse({}), 'example.com', ctx);
    expect(cmd[2]).toContain("-k 'example'");
  });
});
```

- [ ] **Step 3:** Run → FAIL. 
- [ ] **Step 4: Implement `cloud-enum.scanner.ts`:**

```ts
import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const CloudEnumInput = z.object({});
export type CloudEnumInputType = z.infer<typeof CloudEnumInput>;
function shellQuoteSingle(s: string): string { return `'${s.replace(/'/g, "'\\''")}'`; }
// Keyword = first DNS label of the target (e.g. example.com → example). Permutation
// engine inside cloud_enum expands it across S3/Azure/GCS naming schemes.
function keywordFromTarget(target: string): string {
  const label = target.trim().toLowerCase().replace(/^\*\./, '').split('.')[0] ?? target;
  return label;
}

export const CloudEnumScanner: ScannerDefinition<CloudEnumInputType> = {
  name: 'cloud-enum',
  displayName: 'cloud_enum (S3/Azure/GCS)',
  category: [ScannerCategory.CLOUD, ScannerCategory.OSINT],
  description:
    'Passive enumeration of public cloud storage (S3/Azure/GCS) from the target keyword. ' +
    'Touches cloud provider endpoints, not the target.',
  inputSchema: CloudEnumInput,
  docker: {
    image: 'autoscanner/cloud-enum:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 300_000,
  },
  build(_input, target) {
    const kw = keywordFromTarget(target);
    const script = `cloud_enum -k ${shellQuoteSingle(kw)} --disable-azure --quickscan 2>/dev/null || true`;
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'cloud-enum-text' }],
  produces: ['OrgMetadata', 'Finding'],
};
```

> The exact flags (`--quickscan`, `--disable-azure`) depend on the installed cloud_enum version — verify and adjust; keep the keyword-quoting.

- [ ] **Step 5:** Run scanner test → PASS.
- [ ] **Step 6: Parser test** `libs/parsers/src/__tests__/cloud-enum-text.parser.spec.ts`:

```ts
import { CloudEnumTextParser } from '../cloud-enum-text';
import type { ParserContext } from '../types';
const ctx: ParserContext = { scanJobId: 'j', scannerName: 'cloud-enum', target: 'example.com', engagementId: 'e' };
describe('CloudEnumTextParser', () => {
  const parser = new CloudEnumTextParser();
  it('extracts buckets → one CLOUD_BUCKET OrgMetadata + a Finding per open bucket', async () => {
    const input = [
      'OPEN S3 BUCKET: http://example-assets.s3.amazonaws.com/',
      'Protected S3 Bucket: http://example-private.s3.amazonaws.com/',
    ].join('\n');
    const out = await parser.parse(input, ctx);
    expect(out.orgMetadata).toHaveLength(1);
    expect(out.orgMetadata[0].kind).toBe('CLOUD_BUCKET');
    const data = out.orgMetadata[0].data as { buckets: { url: string; access: string }[] };
    expect(data.buckets.length).toBe(2);
    // Only the OPEN bucket yields a Finding.
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0].severity).toBe('HIGH');
    expect(out.findings[0].location).toContain('example-assets');
  });
  it('returns empty on blank input', async () => {
    expect((await parser.parse('', ctx)).orgMetadata).toHaveLength(0);
  });
});
```

- [ ] **Step 7:** Run → FAIL.
- [ ] **Step 8: Implement `cloud-enum-text.parser.ts`** (+ index). Tolerant line scan; OPEN/public → Finding HIGH, protected/exists → metadata only:

```ts
import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

const URL_RE = /https?:\/\/[^\s)]+/i;

@Injectable()
export class CloudEnumTextParser implements Parser {
  readonly name = 'cloud-enum-text';
  readonly formats: RawOutputFormat[] = ['TEXT'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');
    if (!text.trim()) return out;

    const buckets: { url: string; access: string }[] = [];
    for (const line of text.split('\n')) {
      const m = line.match(URL_RE);
      if (!m) continue;
      const lower = line.toLowerCase();
      const isOpen = lower.includes('open');
      const access = isOpen ? 'open' : 'protected';
      const url = m[0].replace(/\/+$/, '');
      if (buckets.some((b) => b.url === url)) continue;
      buckets.push({ url, access });
      if (isOpen) {
        out.findings.push({
          scannerName: ctx.scannerName,
          title: 'Publicly accessible cloud storage bucket',
          severity: 'HIGH',
          location: url,
          description: 'cloud_enum reported this bucket as OPEN (publicly listable/readable).',
        });
      }
    }
    if (buckets.length > 0) out.orgMetadata.push({ kind: 'CLOUD_BUCKET', data: { buckets } });
    return out;
  }
}
```

- [ ] **Step 9:** Register `CloudEnumTextParser` in `parsers.module.ts` (providers/exports/ctor/onModuleInit).
- [ ] **Step 10:** Run parser test → PASS; `type-check -p scanners-cloud-enum,parsers` → PASS.
- [ ] **Step 11: Commit.** `feat(phase-8.1): cloud-enum scanner + parser (buckets → OrgMetadata/Finding)`

---

## Task 4: `github-subdomains` scanner + parser (GITHUB credential)

**Files:** lib `libs/scanners/github-subdomains/`; parser `libs/parsers/src/github-subdomains-text/` (a simple host-lines parser — note `hostlines-text` already exists and emits subdomains; **prefer reusing `hostlines-text`** if its output matches one-host-per-line. Decide in Step 4).

> **Verify the tool:** `github-subdomains -d <domain> -t <token>` prints one subdomain per line.

- [ ] **Step 1: Scaffold** lib (copy crtsh → github-subdomains; class `GithubSubdomainsScanner`; alias `@autoscanner/scanners-github-subdomains`).
- [ ] **Step 2: Scanner test** `src/__tests__/github-subdomains.scanner.spec.ts`:

```ts
import { GithubSubdomainsScanner } from '../github-subdomains.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';
const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/tmp' };
describe('GithubSubdomainsScanner', () => {
  it('requires the GITHUB credential injected as GITHUB_TOKEN; outputs host lines', () => {
    expect(GithubSubdomainsScanner.name).toBe('github-subdomains');
    expect(GithubSubdomainsScanner.requiresCredential).toBe('GITHUB');
    expect(GithubSubdomainsScanner.credentialEnvVar).toBe('GITHUB_TOKEN');
    expect(GithubSubdomainsScanner.outputs[0].parser).toBe('hostlines-text');
    expect(GithubSubdomainsScanner.produces).toEqual(expect.arrayContaining(['Subdomain']));
  });
  it('build() passes the token env var and quotes the domain', () => {
    const { cmd } = GithubSubdomainsScanner.build(GithubSubdomainsScanner.inputSchema.parse({}), 'example.com', ctx);
    expect(cmd[2]).toContain('"$GITHUB_TOKEN"');
    expect(cmd[2]).toContain("-d 'example.com'");
  });
});
```

- [ ] **Step 3:** Run → FAIL.
- [ ] **Step 4: Implement `github-subdomains.scanner.ts`** — reuse the existing `hostlines-text` parser (emits one `SUBDOMAIN` asset per non-empty line; confirm by reading `libs/parsers/src/hostlines-text/`). If its output shape matches, set `parser: 'hostlines-text'` and **add no new parser**:

```ts
import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const GithubSubdomainsInput = z.object({});
export type GithubSubdomainsInputType = z.infer<typeof GithubSubdomainsInput>;
function shellQuoteSingle(s: string): string { return `'${s.replace(/'/g, "'\\''")}'`; }

export const GithubSubdomainsScanner: ScannerDefinition<GithubSubdomainsInputType> = {
  name: 'github-subdomains',
  displayName: 'github-subdomains',
  category: [ScannerCategory.OSINT, ScannerCategory.SUBDOMAIN_ENUM],
  description:
    'Finds subdomains of the target leaked in public GitHub code. Requires a GITHUB_TOKEN credential.',
  inputSchema: GithubSubdomainsInput,
  requiresCredential: 'GITHUB',
  credentialEnvVar: 'GITHUB_TOKEN',
  docker: {
    image: 'autoscanner/github-subdomains:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 256,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 300_000,
  },
  build(_input, target) {
    const script = `github-subdomains -d ${shellQuoteSingle(target)} -t "$GITHUB_TOKEN" || true`;
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'hostlines-text' }],
  produces: ['Subdomain'],
};
```

> If `hostlines-text` does NOT emit `SUBDOMAIN` assets in the expected shape, create `github-subdomains-text` mirroring `hostlines-text` and point the scanner at it; add a parser test then.

- [ ] **Step 5:** Run scanner test → PASS. (No parser test needed if reusing `hostlines-text`; verify `hostlines-text` has coverage — it does.)
- [ ] **Step 6:** `type-check -p scanners-github-subdomains` → PASS.
- [ ] **Step 7: Commit.** `feat(phase-8.1): github-subdomains scanner (GITHUB) → Subdomain via hostlines-text`

---

## Task 5: `trufflehog` scanner + parser (GITHUB credential → Findings)

**Files:** lib `libs/scanners/trufflehog/`; parser `libs/parsers/src/trufflehog-json/`; tests.

> **Verify the tool:** `trufflehog github --org=<org> --json` (or `git <repo-url> --json`) prints JSONL, one detector result per line with fields like `DetectorName`, `Verified`, `Raw`, `SourceMetadata`. Adjust to the installed version.

- [ ] **Step 1: Scaffold** lib (class `TrufflehogScanner`, alias `@autoscanner/scanners-trufflehog`).
- [ ] **Step 2: Scanner test:**

```ts
import { TrufflehogScanner } from '../trufflehog.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';
const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/tmp' };
describe('TrufflehogScanner', () => {
  it('requires GITHUB token, emits JSONL → trufflehog-json, produces Finding', () => {
    expect(TrufflehogScanner.name).toBe('trufflehog');
    expect(TrufflehogScanner.requiresCredential).toBe('GITHUB');
    expect(TrufflehogScanner.credentialEnvVar).toBe('GITHUB_TOKEN');
    expect(TrufflehogScanner.outputs[0]).toEqual({ format: 'JSONL', capture: 'stdout', parser: 'trufflehog-json' });
    expect(TrufflehogScanner.produces).toEqual(expect.arrayContaining(['Finding']));
  });
  it('build() scans the org derived from the target apex label, with token + --json', () => {
    const { cmd } = TrufflehogScanner.build(TrufflehogScanner.inputSchema.parse({}), 'example.com', ctx);
    expect(cmd[2]).toContain('trufflehog');
    expect(cmd[2]).toContain('--json');
    expect(cmd[2]).toContain('"$GITHUB_TOKEN"');
    expect(cmd[2]).toContain("'example'");
  });
});
```

- [ ] **Step 3:** Run → FAIL.
- [ ] **Step 4: Implement `trufflehog.scanner.ts`:**

```ts
import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const TrufflehogInput = z.object({});
export type TrufflehogInputType = z.infer<typeof TrufflehogInput>;
function shellQuoteSingle(s: string): string { return `'${s.replace(/'/g, "'\\''")}'`; }
function orgFromTarget(target: string): string {
  return target.trim().toLowerCase().replace(/^\*\./, '').split('.')[0] ?? target;
}

export const TrufflehogScanner: ScannerDefinition<TrufflehogInputType> = {
  name: 'trufflehog',
  displayName: 'trufflehog (GitHub secrets)',
  category: [ScannerCategory.OSINT, ScannerCategory.VULN_SCAN],
  description:
    'Scans the org\'s public GitHub repos for leaked secrets. Requires a GITHUB_TOKEN credential.',
  inputSchema: TrufflehogInput,
  requiresCredential: 'GITHUB',
  credentialEnvVar: 'GITHUB_TOKEN',
  docker: {
    image: 'autoscanner/trufflehog:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 1024,
    cpuQuota: 2_000_000,
    defaultTimeoutMs: 600_000,
  },
  build(_input, target) {
    const org = orgFromTarget(target);
    const script = `GITHUB_TOKEN="$GITHUB_TOKEN" trufflehog github --org=${shellQuoteSingle(org)} --json 2>/dev/null || true`;
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'JSONL', capture: 'stdout', parser: 'trufflehog-json' }],
  produces: ['Finding'],
};
```

- [ ] **Step 5:** Run scanner test → PASS.
- [ ] **Step 6: Parser test** `libs/parsers/src/__tests__/trufflehog-json.parser.spec.ts`:

```ts
import { TrufflehogJsonParser } from '../trufflehog-json';
import type { ParserContext } from '../types';
const ctx: ParserContext = { scanJobId: 'j', scannerName: 'trufflehog', target: 'example.com', engagementId: 'e' };
describe('TrufflehogJsonParser', () => {
  const parser = new TrufflehogJsonParser();
  it('maps verified secret → CRITICAL, unverified → HIGH; dedups; location from repo', async () => {
    const input = [
      JSON.stringify({ DetectorName: 'AWS', Verified: true, SourceMetadata: { Data: { Github: { repository: 'https://github.com/example/app', file: 'a.env' } } } }),
      JSON.stringify({ DetectorName: 'Slack', Verified: false, SourceMetadata: { Data: { Github: { repository: 'https://github.com/example/web', file: 'b.js' } } } }),
    ].join('\n');
    const out = await parser.parse(input, ctx);
    expect(out.findings).toHaveLength(2);
    const aws = out.findings.find((f) => f.title.includes('AWS'));
    expect(aws?.severity).toBe('CRITICAL');
    const slack = out.findings.find((f) => f.title.includes('Slack'));
    expect(slack?.severity).toBe('HIGH');
    expect(aws?.location).toContain('github.com/example/app');
  });
  it('returns empty on blank/garbage', async () => {
    expect((await parser.parse('', ctx)).findings).toHaveLength(0);
  });
});
```

- [ ] **Step 7:** Run → FAIL.
- [ ] **Step 8: Implement `trufflehog-json.parser.ts`** (+ index):

```ts
import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, NormalizedFinding, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

interface ThRecord {
  DetectorName?: string;
  Verified?: boolean;
  SourceMetadata?: { Data?: { Github?: { repository?: string; file?: string } } };
}

@Injectable()
export class TrufflehogJsonParser implements Parser {
  readonly name = 'trufflehog-json';
  readonly formats: RawOutputFormat[] = ['JSONL'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');
    if (!text.trim()) return out;

    const seen = new Set<string>();
    for (const line of text.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      let rec: ThRecord;
      try {
        rec = JSON.parse(t) as ThRecord;
      } catch {
        continue;
      }
      const detector = rec.DetectorName;
      if (!detector) continue;
      const gh = rec.SourceMetadata?.Data?.Github;
      const repo = gh?.repository ?? 'unknown-repo';
      const file = gh?.file ?? '';
      const location = file ? `${repo}#${file}` : repo;
      const key = `${detector}|${location}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const finding: NormalizedFinding = {
        scannerName: ctx.scannerName,
        title: `Leaked secret: ${detector}`,
        severity: rec.Verified ? 'CRITICAL' : 'HIGH',
        location,
        description: rec.Verified
          ? `trufflehog VERIFIED a live ${detector} secret in public GitHub.`
          : `trufflehog found an unverified ${detector} secret in public GitHub.`,
      };
      out.findings.push(finding);
    }
    return out;
  }
}
```

- [ ] **Step 9:** Register `TrufflehogJsonParser` in `parsers.module.ts`.
- [ ] **Step 10:** Run parser test → PASS; `type-check -p scanners-trufflehog,parsers` → PASS.
- [ ] **Step 11: Commit.** `feat(phase-8.1): trufflehog scanner + parser (GitHub secrets → Finding)`

---

## Task 6: `securitytrails` scanner + parser (SECURITYTRAILS → Subdomain + DnsRecord)

**Files:** lib `libs/scanners/securitytrails/`; parser `libs/parsers/src/securitytrails-json/`; tests.

> **Verify the API:** SecurityTrails `GET /v1/domain/<domain>/subdomains?apikey=KEY` returns `{ subdomains: [string] }`. We call subdomains (rich, single call). Header auth `APIKEY: <key>`.

- [ ] **Step 1: Scaffold** lib (class `SecuritytrailsScanner`, alias `@autoscanner/scanners-securitytrails`).
- [ ] **Step 2: Scanner test:**

```ts
import { SecuritytrailsScanner } from '../securitytrails.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';
const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/tmp' };
describe('SecuritytrailsScanner', () => {
  it('requires SECURITYTRAILS key as SECURITYTRAILS_API_KEY; JSON → securitytrails-json; produces Subdomain', () => {
    expect(SecuritytrailsScanner.name).toBe('securitytrails');
    expect(SecuritytrailsScanner.requiresCredential).toBe('SECURITYTRAILS');
    expect(SecuritytrailsScanner.credentialEnvVar).toBe('SECURITYTRAILS_API_KEY');
    expect(SecuritytrailsScanner.outputs[0]).toEqual({ format: 'JSON', capture: 'stdout', parser: 'securitytrails-json' });
    expect(SecuritytrailsScanner.produces).toEqual(expect.arrayContaining(['Subdomain']));
  });
  it('build() curls the subdomains endpoint with the APIKEY header and quoted domain', () => {
    const { cmd } = SecuritytrailsScanner.build(SecuritytrailsScanner.inputSchema.parse({}), 'example.com', ctx);
    expect(cmd[2]).toContain('api.securitytrails.com/v1/domain/');
    expect(cmd[2]).toContain('"APIKEY: $SECURITYTRAILS_API_KEY"');
    expect(cmd[2]).toContain("'example.com'");
  });
});
```

- [ ] **Step 3:** Run → FAIL.
- [ ] **Step 4: Implement `securitytrails.scanner.ts`:**

```ts
import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const SecuritytrailsInput = z.object({});
export type SecuritytrailsInputType = z.infer<typeof SecuritytrailsInput>;
function shellQuoteSingle(s: string): string { return `'${s.replace(/'/g, "'\\''")}'`; }

export const SecuritytrailsScanner: ScannerDefinition<SecuritytrailsInputType> = {
  name: 'securitytrails',
  displayName: 'SecurityTrails (passive DNS)',
  category: [ScannerCategory.PASSIVE_RECON, ScannerCategory.DNS],
  description:
    'Passive DNS / subdomain discovery via the SecurityTrails API. Requires a SECURITYTRAILS_API_KEY credential.',
  inputSchema: SecuritytrailsInput,
  requiresCredential: 'SECURITYTRAILS',
  credentialEnvVar: 'SECURITYTRAILS_API_KEY',
  docker: {
    image: 'autoscanner/securitytrails:1.0',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 256,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 120_000,
  },
  build(_input, target) {
    // Wrap the apex domain into the endpoint; the response lists child labels.
    // The parser reconstructs FQDNs as `<label>.<target>`.
    const url = `https://api.securitytrails.com/v1/domain/${shellQuoteSingle(target)}/subdomains?children_only=false`;
    const script = `curl -s -H "APIKEY: $SECURITYTRAILS_API_KEY" -H 'Accept: application/json' ${url} || true`;
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'JSON', capture: 'stdout', parser: 'securitytrails-json' }],
  produces: ['Subdomain'],
};
```

> The parser needs the apex domain to rebuild FQDNs — it reads `ctx.target`.

- [ ] **Step 5:** Run scanner test → PASS.
- [ ] **Step 6: Parser test** `libs/parsers/src/__tests__/securitytrails-json.parser.spec.ts`:

```ts
import { SecuritytrailsJsonParser } from '../securitytrails-json';
import type { ParserContext } from '../types';
const ctx: ParserContext = { scanJobId: 'j', scannerName: 'securitytrails', target: 'example.com', engagementId: 'e' };
describe('SecuritytrailsJsonParser', () => {
  const parser = new SecuritytrailsJsonParser();
  it('rebuilds FQDNs from labels + ctx.target as SUBDOMAIN assets', async () => {
    const input = JSON.stringify({ subdomains: ['www', 'api', 'mail'] });
    const out = await parser.parse(input, ctx);
    const values = out.assets.map((a) => a.value).sort();
    expect(values).toEqual(['api.example.com', 'mail.example.com', 'www.example.com']);
    expect(out.assets.every((a) => a.type === 'SUBDOMAIN')).toBe(true);
  });
  it('returns empty on blank/garbage or non-array subdomains', async () => {
    expect((await parser.parse('', ctx)).assets).toHaveLength(0);
    expect((await parser.parse('{"subdomains":"nope"}', ctx)).assets).toHaveLength(0);
  });
});
```

- [ ] **Step 7:** Run → FAIL.
- [ ] **Step 8: Implement `securitytrails-json.parser.ts`** (+ index):

```ts
import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import type { NormalizedOutput, Parser, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

interface StResponse { subdomains?: unknown }

@Injectable()
export class SecuritytrailsJsonParser implements Parser {
  readonly name = 'securitytrails-json';
  readonly formats: RawOutputFormat[] = ['JSON'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');
    if (!text.trim()) return out;
    let parsed: StResponse;
    try {
      parsed = JSON.parse(text) as StResponse;
    } catch {
      return out;
    }
    const labels = parsed.subdomains;
    if (!Array.isArray(labels)) return out;
    const apex = ctx.target.trim().toLowerCase().replace(/^\*\./, '').replace(/\.$/, '');
    const seen = new Set<string>();
    for (const label of labels) {
      if (typeof label !== 'string' || !label.trim()) continue;
      const fqdn = `${label.trim().toLowerCase()}.${apex}`;
      if (seen.has(fqdn)) continue;
      seen.add(fqdn);
      out.assets.push({ type: 'SUBDOMAIN', value: fqdn });
    }
    return out;
  }
}
```

- [ ] **Step 9:** Register `SecuritytrailsJsonParser` in `parsers.module.ts`.
- [ ] **Step 10:** Run parser test → PASS; `type-check -p scanners-securitytrails,parsers` → PASS.
- [ ] **Step 11: Commit.** `feat(phase-8.1): securitytrails scanner + parser (passive DNS → Subdomain)`

---

## Task 7: Dockerfiles for the 5 scanners

**Files:** `docker/scanners/<tool>/Dockerfile` for `asnmap`, `cloud-enum`, `github-subdomains`, `trufflehog`, `securitytrails`.

Read `docker/scanners/crtsh/Dockerfile` (curl-based) and `docker/scanners/shodan/Dockerfile` (tool install) for the house style (base image, non-root user, ENTRYPOINT). Build each image tagged `autoscanner/<tool>:1.0`.

- [ ] **Step 1:** `docker/scanners/asnmap/Dockerfile` — install asnmap (Go): e.g. `FROM golang:1.22-alpine AS build` + `RUN go install github.com/projectdiscovery/asnmap/cmd/asnmap@latest`, then a slim runtime stage copying the binary + `sh`/`ca-certificates`. (Or `FROM projectdiscovery/asnmap:latest` if acceptable.)
- [ ] **Step 2:** `docker/scanners/cloud-enum/Dockerfile` — `FROM python:3.12-slim`, `pip install` deps + `git clone https://github.com/initstring/cloud_enum`, wrapper so `cloud_enum` is on PATH.
- [ ] **Step 3:** `docker/scanners/github-subdomains/Dockerfile` — Go install `github.com/gwen001/github-subdomains@latest` (slim runtime + ca-certificates).
- [ ] **Step 4:** `docker/scanners/trufflehog/Dockerfile` — `FROM trufflesecurity/trufflehog:latest` (or install the binary) ensuring `sh` is present for the `sh -lc` wrapper.
- [ ] **Step 5:** `docker/scanners/securitytrails/Dockerfile` — curl-based, mirror `docker/scanners/crtsh/Dockerfile` (alpine + curl + ca-certificates).
- [ ] **Step 6:** Build each: `docker build -t autoscanner/<tool>:1.0 docker/scanners/<tool>` (requires Docker; if the dev box has no daemon, this is a deploy-time step — verify the Dockerfile syntax with `docker build --check` or a lint, and note that image builds run in CI/deploy). Commit.
```bash
git add docker/scanners/asnmap docker/scanners/cloud-enum docker/scanners/github-subdomains docker/scanners/trufflehog docker/scanners/securitytrails
git commit -m "feat(phase-8.1): Dockerfiles for the 5 passive scanners"
```

---

## Task 8: Register scanners + parsers + template

**Files:**
- Modify: `libs/scanners/all/src/all-scanners.module.ts`
- Modify: `libs/scanners/all/package.json` / `project.json` deps (add the 5 new scanner libs as dependencies if the project enforces it — check how existing scanner deps are declared)
- Create: `libs/templates/src/builtins/osint-passive-deep.ts`
- Modify: `libs/templates/src/builtins/index.ts`

- [ ] **Step 1: Register the 5 scanner modules** in `all-scanners.module.ts`: add imports for `AsnmapScannerModule`, `CloudEnumScannerModule`, `GithubSubdomainsScannerModule`, `TrufflehogScannerModule`, `SecuritytrailsScannerModule` (from `@autoscanner/scanners-<tool>`), and add them to the `SCANNER_MODULES` array.

- [ ] **Step 2: Verify parsers are already registered** (done in Tasks 2/3/5/6 — `asnmap-json`, `cloud-enum-text`, `trufflehog-json`, `securitytrails-json`; `github-subdomains` reuses `hostlines-text`).

- [ ] **Step 3: Create the template** `libs/templates/src/builtins/osint-passive-deep.ts` (mirror `osint-passive.ts` shape). All steps target the engagement `target`; the credential steps fail individually if the key is missing without blocking the rest:

```ts
import type { TemplateDefinition } from '../types';

export const OsintPassiveDeep: TemplateDefinition = {
  name: 'osint-passive-deep',
  displayName: 'OSINT Passive (deep)',
  description:
    'Deep passive attack-surface: ASN/CIDR (asnmap), cloud buckets (cloud-enum), ' +
    'GitHub-leaked subdomains & secrets (github-subdomains, trufflehog), passive DNS (securitytrails). ' +
    'Credential-backed steps (GitHub, SecurityTrails) are skipped/failed individually if no key is configured.',
  steps: [
    { scannerName: 'asnmap', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'cloud-enum', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'github-subdomains', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'trufflehog', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'securitytrails', inputs: {}, target: { kind: 'context', path: 'target' } },
  ],
};
```

> Confirm the `TemplateDefinition`/`steps` shape against `libs/templates/src/types.ts` and `recon-passive.ts` (e.g. whether `displayName` exists, and the exact `inputs`/`target` schema) and adjust. If the seed (`prisma/seed.ts` `BUILTIN_TEMPLATES`) must list it, add it there too.

- [ ] **Step 4: Export the template** in `libs/templates/src/builtins/index.ts` (add `export * from './osint-passive-deep';` and include `OsintPassiveDeep` in whatever aggregate array `index.ts` exposes — mirror an existing builtin).

- [ ] **Step 5: Type-check + test the wiring.** Run: `pnpm nx run-many -t type-check,test -p scanners-all,templates` — Expected: PASS.

- [ ] **Step 6: Commit.** `feat(phase-8.1): register passive scanners + osint-passive-deep template`

---

## Task 9: e2e (opt-in) + full validation

**Files:**
- Create: `apps/api-gateway-e2e/src/scenarios/recon-passive-v2-e2e.spec.ts`

- [ ] **Step 1: Opt-in e2e** gated by base env + `RECON_PASSIVE_V2_E2E=1` (mirror `apps/api-gateway-e2e/src/scenarios/recon-passive-e2e.spec.ts` if it exists, else `scheduler-graphql-e2e.spec.ts` gating). Scenario: login; `createEngagementWithWildcardScope`; `runTemplate('osint-passive-deep', target)`; poll until the template run completes; assert ≥1 `orgMetadata(engagementId)` row of kind `ASN` (asnmap needs no key, so it's the reliable assertion). Keep credential-backed assertions behind extra env (keys). Type-check only — suite stays skipped without the gate.

```ts
// Header documents required env: E2E_API_URL/E2E_EMAIL/E2E_PASSWORD + RECON_PASSIVE_V2_E2E=1
// (optional) E2E_GITHUB_TOKEN / E2E_SECURITYTRAILS_KEY for the credential steps.
```

- [ ] **Step 2: Full validation.** Run:
```
pnpm nx run-many -t lint,type-check,test -p database,parsers,scanners-asnmap,scanners-cloud-enum,scanners-github-subdomains,scanners-trufflehog,scanners-securitytrails,scanners-all,templates,api-gateway,parser-worker
```
and `npx tsc --project apps/api-gateway-e2e/tsconfig.spec.json --noEmit`, and **builds** (Phase 5 lesson): `pnpm nx run-many -t build -p api-gateway,parser-worker,scan-worker`. All green.

- [ ] **Step 3: Commit.** `test(phase-8.1): recon-passive-v2 e2e (opt-in) + validation`

---

## Validation criteria (spec §1)
- 5 scanners registered + runnable (Tasks 2–6, 8). ✅
- libs + Dockerfiles + parsers + tests (Tasks 2–7). ✅
- Enum deltas + migration (Task 1). ✅
- Credentials GITHUB/SECURITYTRAILS via existing mechanism (Task 1 enum; scanners declare `requiresCredential`). ✅
- Template `osint-passive-deep` (Task 8). ✅
- Data shows in existing tabs (no front change — mapped to existing entities). ✅
- CI green incl. build (Task 9). ✅

## Out of scope (spec §1)
ASN→active-scan operationalisation; first-class `AsnRange`/`CloudBucket` models; extra passive sources; authenticated cloud enum.

## Self-review notes
- **Spec coverage:** every §1 "done" item maps to a task (see criteria above). The 5 scanners, 3 enum values, credential mechanism, template, and tests/e2e are all covered.
- **Type consistency:** parser names (`asnmap-json`, `cloud-enum-text`, `trufflehog-json`, `securitytrails-json`, reused `hostlines-text`) match scanner `outputs[].parser`. `NormalizedOrgMetadata.kind` union extended with `CLOUD_BUCKET` (Task 1) before any parser emits it (Tasks 2/3). `credentialEnvVar` values (`GITHUB_TOKEN`, `SECURITYTRAILS_API_KEY`) match the `$ENV` referenced in each build script.
- **External-tool caveat (flagged):** each tool's exact CLI flags + output are version-dependent; tasks instruct verifying real output and adjusting the fixture/parser, keeping parsers tolerant. This is inherent to third-party tool integration and cannot be fully pinned without running the tools.
- **No new Prisma models;** persisters reused unchanged (OrgMetadata persister passes `kind` through).
