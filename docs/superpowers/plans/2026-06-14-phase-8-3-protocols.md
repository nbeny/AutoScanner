# Phase 8.3 — Service / Protocol Scanners Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Add 4 service-probing scanners — `smtp-recon`, `snmp-recon`, `smb-enum`, `api-discovery` — mapping output onto existing `Finding`/`OrgMetadata`/`Endpoint` entities. No Prisma changes. `smtp-recon` reuses the public nmap image.

**Architecture:** Each scanner is a `ScannerDefinition` in `libs/scanners/<tool>` auto-registered in `AllScannersModule`, with a tolerant parser in `libs/parsers/src/<tool>-<fmt>` registered in `ParsersModule`. Output persisted by existing `FindingPersister`/`OrgMetadataPersister`/`EndpointPersister`. A `service-recon` template chains them.

**Tech Stack:** NestJS, Nx, Zod, Docker, `fast-xml-parser` (smtp), Jest. Spec: `docs/superpowers/specs/2026-06-14-phase-8-3-protocols-design.md`. Pattern ref: Phase 8.1/8.2 (`libs/scanners/asnmap`, `libs/parsers/src/asnmap-json`, `parsers.module.ts`).

---

## Reference (read once)
- Scanner lib scaffold: `libs/scanners/asnmap/` (copy + rename). The nmap scanner `libs/scanners/nmap/src/nmap.scanner.ts` (image `instrumentisto/nmap:7.98-r2`, `cmd: ['nmap', ...args, target]` — target as a direct exec arg, no shell).
- Parser: `libs/parsers/src/asnmap-json/` + registration in `libs/parsers/src/parsers.module.ts` (import+providers+exports+ctor+onModuleInit) + barrel `libs/parsers/src/index.ts`. XML parsing example: `libs/parsers/src/nmap-xml.parser.ts` (uses `fast-xml-parser`).
- Types `libs/parsers/src/types.ts`: `NormalizedFinding = { scannerName, title, severity, location?, description? }`, `NormalizedOrgMetadata = { kind, data }` (kind ∈ WHOIS|ASN|ORG|NETBLOCK|CLOUD_BUCKET|OTHER — use `'OTHER'` for service device data), `NormalizedEndpoint = { url, method?, statusCode?, contentLength? }`, `emptyNormalizedOutput()`.
- Registration: `libs/scanners/all/src/all-scanners.module.ts` (+ spec). Template: `libs/templates/src/builtins/web-enrich.ts` + `index.ts` (`BUILTIN_TEMPLATES`). Dockerfiles: `docker/scanners/<tool>/Dockerfile`.

**External-tool caveat (as 8.1/8.2):** snmp/smb/api tool output is version-dependent. Each task gives a concrete build cmd + representative fixture + tolerant parser; **verify the real output at impl time and adjust the fixture/parser**, keeping parsers tolerant (never throw → `emptyNormalizedOutput()`).

---

## Task 1: `smtp-recon` scanner (reuses nmap image) + `smtp-nmap-xml` parser

**Files:** lib `libs/scanners/smtp-recon/`; parser `libs/parsers/src/smtp-nmap-xml/`; tests; `tsconfig.base.json`.

- [ ] **Step 1: Scaffold** `libs/scanners/smtp-recon/` (copy asnmap; rename `asnmap`→`smtp-recon`, `Asnmap`→`SmtpRecon`, project `scanners-asnmap`→`scanners-smtp-recon`; alias `@autoscanner/scanners-smtp-recon`). Verify no `asnmap` leftovers.

- [ ] **Step 2: Failing scanner test** `src/__tests__/smtp-recon.scanner.spec.ts`:
```ts
import { SmtpReconScanner } from '../smtp-recon.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';
const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/tmp' };
describe('SmtpReconScanner', () => {
  it('reuses the nmap image, XML → smtp-nmap-xml, produces Finding/OrgMetadata', () => {
    expect(SmtpReconScanner.name).toBe('smtp-recon');
    expect(SmtpReconScanner.docker.image).toBe('instrumentisto/nmap:7.98-r2');
    expect(SmtpReconScanner.outputs[0]).toEqual({ format: 'XML', capture: 'stdout', parser: 'smtp-nmap-xml' });
    expect(SmtpReconScanner.produces).toEqual(expect.arrayContaining(['Finding', 'OrgMetadata']));
    expect(SmtpReconScanner.requiresCredential).toBeUndefined();
  });
  it('build() runs nmap smtp scripts on 25,465,587 with target as a direct arg (no shell)', () => {
    const { cmd } = SmtpReconScanner.build(SmtpReconScanner.inputSchema.parse({}), 'mail.example.com', ctx);
    expect(cmd[0]).toBe('nmap');
    expect(cmd).toContain('mail.example.com');
    expect(cmd.join(' ')).toContain('--script smtp-commands,smtp-open-relay,smtp-enum-users');
    expect(cmd.join(' ')).toContain('-p 25,465,587');
    expect(cmd).toContain('-oX');
  });
});
```
Run `pnpm nx test scanners-smtp-recon` → FAIL.

- [ ] **Step 3: Implement** `libs/scanners/smtp-recon/src/smtp-recon.scanner.ts`:
```ts
import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const SmtpReconInput = z.object({});
export type SmtpReconInputType = z.infer<typeof SmtpReconInput>;

export const SmtpReconScanner: ScannerDefinition<SmtpReconInputType> = {
  name: 'smtp-recon',
  displayName: 'SMTP recon (nmap NSE)',
  category: [ScannerCategory.SMTP],
  description:
    'Probes SMTP services (25/465/587) for capabilities, open-relay and user enumeration via nmap NSE. Actively probes the target.',
  inputSchema: SmtpReconInput,
  docker: {
    image: 'instrumentisto/nmap:7.98-r2',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 300_000,
  },
  build(_input, target) {
    // target is a direct exec arg (no shell), so no shell-injection surface.
    return {
      cmd: [
        'nmap', '-oX', '-', '-Pn', '-p', '25,465,587',
        '--script', 'smtp-commands,smtp-open-relay,smtp-enum-users',
        target,
      ],
    };
  },
  outputs: [{ format: 'XML', capture: 'stdout', parser: 'smtp-nmap-xml' }],
  produces: ['Finding', 'OrgMetadata'],
};
```
(`ScannerCategory.SMTP` exists in the SDK enum — verify; it does.) Update `index.ts` + module. Run `pnpm nx test scanners-smtp-recon` → PASS.

- [ ] **Step 4: Failing parser test** `libs/parsers/src/__tests__/smtp-nmap-xml.parser.spec.ts`:
```ts
import { SmtpNmapXmlParser } from '../smtp-nmap-xml';
import type { ParserContext } from '../types';
const ctx: ParserContext = { scanJobId: 'j', scannerName: 'smtp-recon', target: 'mail.example.com', engagementId: 'e' };
describe('SmtpNmapXmlParser', () => {
  const parser = new SmtpNmapXmlParser();
  it('emits an open-relay Finding (HIGH) and a capabilities OrgMetadata', async () => {
    const xml = `<?xml version="1.0"?><nmaprun><host><address addr="1.2.3.4" addrtype="ipv4"/>
      <ports><port protocol="tcp" portid="25"><state state="open"/>
        <script id="smtp-open-relay" output="Server is an open relay (16/16 tests)"/>
        <script id="smtp-commands" output="mail.example.com, PIPELINING, SIZE 10240000, STARTTLS, 8BITMIME"/>
      </port></ports></host></nmaprun>`;
    const out = await parser.parse(xml, ctx);
    const relay = out.findings.find((f) => f.title.toLowerCase().includes('open relay'));
    expect(relay?.severity).toBe('HIGH');
    expect(out.orgMetadata.some((m) => m.kind === 'OTHER')).toBe(true);
  });
  it('returns empty on blank/garbage', async () => {
    expect((await parser.parse('', ctx)).findings).toHaveLength(0);
    expect((await parser.parse('not xml', ctx)).findings).toHaveLength(0);
  });
});
```
Run `pnpm nx test parsers --testPathPattern=smtp-nmap-xml` → FAIL.

- [ ] **Step 5: Implement** `libs/parsers/src/smtp-nmap-xml/smtp-nmap-xml.parser.ts` (+ index.ts). Use `fast-xml-parser` like `nmap-xml.parser.ts` (read it for the parser config). Walk `nmaprun.host[].ports.port[]`, collect each `<script>` by `id`; normalize the XML library's single-vs-array shapes defensively (helper to coerce to array). For `smtp-open-relay` whose `output` contains "open relay" → `Finding { scannerName: ctx.scannerName, title: 'SMTP open relay', severity: 'HIGH', location: <host:port>, description: <output> }`. For `smtp-commands` → `OrgMetadata { kind: 'OTHER', data: { smtpCapabilities: <output>, host } }`. For `smtp-enum-users` with users → `Finding { title: 'SMTP user enumeration', severity: 'LOW', ... }`. Wrap parsing in try/catch → `emptyNormalizedOutput()`.

- [ ] **Step 6: Register** `SmtpNmapXmlParser` in `parsers.module.ts` + barrel. Run `pnpm nx test parsers --testPathPattern=smtp-nmap-xml` → PASS.

- [ ] **Step 7: Verify + commit.** `pnpm nx run-many -t type-check,test -p scanners-smtp-recon,parsers` → green. `grep -rni asnmap libs/scanners/smtp-recon` → none. Commit `feat(phase-8.3): smtp-recon scanner (nmap NSE) + smtp-nmap-xml parser`.

---

## Task 2: `snmp-recon` scanner + `snmp-text` parser

**Files:** lib `libs/scanners/snmp-recon/`; parser `libs/parsers/src/snmp-text/`; tests.

> **Verify tools:** `onesixtyone <host> <communities>` prints `<ip> [community] <sysDescr>` for hits; `snmpwalk -v2c -c public <host>` dumps OIDs. Adjust fixture/parser.

- [ ] **Step 1: Scaffold** `libs/scanners/snmp-recon/` (copy asnmap; `SnmpRecon`/`scanners-snmp-recon`; alias). No `asnmap` leftovers.
- [ ] **Step 2: Failing scanner test:** name `snmp-recon`, image `autoscanner/snmp-recon:1.0`, output `{format:'TEXT',capture:'stdout',parser:'snmp-text'}`, produces `['Finding','OrgMetadata']`, no cred; `build()` → `sh -lc` with `onesixtyone` + the shell-quoted target.
- [ ] **Step 3: Implement** `snmp-recon.scanner.ts`:
```ts
import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';
const SnmpReconInput = z.object({});
export type SnmpReconInputType = z.infer<typeof SnmpReconInput>;
function shellQuoteSingle(s: string): string { return `'${s.replace(/'/g, "'\\''")}'`; }
export const SnmpReconScanner: ScannerDefinition<SnmpReconInputType> = {
  name: 'snmp-recon',
  displayName: 'SNMP recon',
  category: [ScannerCategory.SNMP],
  description: 'Checks SNMP (161/udp) for readable public/common community strings and device info. Read-only enumeration.',
  inputSchema: SnmpReconInput,
  docker: { image: 'autoscanner/snmp-recon:1.0', network: 'bridge', capabilities: [], readonlyRootfs: true, memoryLimitMb: 256, cpuQuota: 1_000_000, defaultTimeoutMs: 180_000 },
  build(_input, target) {
    const t = shellQuoteSingle(target);
    // onesixtyone tries a community list; snmpwalk grabs sysDescr if 'public' works.
    const script = `onesixtyone ${t} public private community manager 2>/dev/null; snmpwalk -v2c -c public -t 2 ${t} 1.3.6.1.2.1.1 2>/dev/null || true`;
    return { cmd: ['sh', '-lc', script] };
  },
  outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'snmp-text' }],
  produces: ['Finding', 'OrgMetadata'],
};
```
- [ ] **Step 4: Failing parser test** `snmp-text.parser.spec.ts`:
```ts
import { SnmpTextParser } from '../snmp-text';
import type { ParserContext } from '../types';
const ctx: ParserContext = { scanJobId: 'j', scannerName: 'snmp-recon', target: '10.0.0.1', engagementId: 'e' };
describe('SnmpTextParser', () => {
  const parser = new SnmpTextParser();
  it('emits a MEDIUM Finding for a readable community + OrgMetadata for sysDescr', async () => {
    const text = [
      '10.0.0.1 [public] Linux router 5.10 #1 SMP',
      'iso.3.6.1.2.1.1.1.0 = STRING: "Linux router 5.10 #1 SMP x86_64"',
    ].join('\n');
    const out = await parser.parse(text, ctx);
    expect(out.findings.some((f) => f.severity === 'MEDIUM' && /community/i.test(f.title))).toBe(true);
    expect(out.orgMetadata.some((m) => m.kind === 'OTHER')).toBe(true);
  });
  it('tolerant of blank/garbage', async () => {
    expect((await parser.parse('', ctx)).findings).toHaveLength(0);
  });
});
```
- [ ] **Step 5: Implement** `snmp-text.parser.ts` (+ index): scan lines; a line matching `\[(\w+)\]` (onesixtyone hit) → `Finding { title: 'Readable SNMP community: <community>', severity: 'MEDIUM', location: ctx.target, description }` (dedup by community); a `STRING:` sysDescr line → `OrgMetadata { kind: 'OTHER', data: { snmpSysDescr: <value> } }`. Tolerant.
- [ ] **Step 6: Register** + barrel.
- [ ] **Step 7: Verify + commit.** `feat(phase-8.3): snmp-recon scanner + snmp-text parser`

---

## Task 3: `smb-enum` scanner + `smb-text` parser

**Files:** lib `libs/scanners/smb-enum/`; parser `libs/parsers/src/smb-text/`; tests.

> **Verify tool:** `enum4linux-ng -A <host>` prints sections (Shares, OS, Users, "Allowing session…"). Adjust fixture/parser.

- [ ] **Step 1: Scaffold** `libs/scanners/smb-enum/` (`SmbEnum`/`scanners-smb-enum`; alias).
- [ ] **Step 2: Failing scanner test:** name `smb-enum`, image `autoscanner/smb-enum:1.0`, output `{format:'TEXT',capture:'stdout',parser:'smb-text'}`, produces `['Finding','OrgMetadata']`, no cred; `build()` → `sh -lc` `enum4linux-ng -A '<target>'`.
- [ ] **Step 3: Implement** `smb-enum.scanner.ts` (mirror snmp-recon shape):
```ts
  name: 'smb-enum', displayName: 'SMB / Windows enum',
  category: [ScannerCategory.SMB_WINDOWS],
  description: 'Anonymous SMB/Windows enumeration (shares, OS, users, null session) via enum4linux-ng. Read-only.',
  image 'autoscanner/smb-enum:1.0' (mem 512, timeout 300_000),
  build: const t = shellQuoteSingle(target); script = `enum4linux-ng -A ${t} 2>/dev/null || true`; return { cmd: ['sh','-lc',script] };
  outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'smb-text' }], produces: ['Finding','OrgMetadata'],
```
- [ ] **Step 4: Failing parser test** `smb-text.parser.spec.ts`:
```ts
import { SmbTextParser } from '../smb-text';
import type { ParserContext } from '../types';
const ctx: ParserContext = { scanJobId: 'j', scannerName: 'smb-enum', target: '10.0.0.5', engagementId: 'e' };
describe('SmbTextParser', () => {
  const parser = new SmbTextParser();
  it('emits a null-session Finding and OS OrgMetadata', async () => {
    const text = [
      '[+] Server allows session using username \'\', password \'\'',
      'OS: Windows Server 2019',
      'Sharename: ADMIN$  Type: Disk',
    ].join('\n');
    const out = await parser.parse(text, ctx);
    expect(out.findings.some((f) => /null session|anonymous/i.test(f.title))).toBe(true);
    expect(out.orgMetadata.some((m) => m.kind === 'OTHER')).toBe(true);
  });
  it('tolerant of blank/garbage', async () => {
    expect((await parser.parse('', ctx)).findings).toHaveLength(0);
  });
});
```
- [ ] **Step 5: Implement** `smb-text.parser.ts` (+ index): a line matching `session using username ''` / `allows sessions using a NULL` / `null session` (case-insensitive) → `Finding { title: 'SMB null session allowed', severity: 'MEDIUM', location: ctx.target }`; collect `OS:` line + `Sharename:` lines → `OrgMetadata { kind: 'OTHER', data: { os?, shares: string[] } }` (only push metadata if something collected). Tolerant.
- [ ] **Step 6: Register** + barrel.
- [ ] **Step 7: Verify + commit.** `feat(phase-8.3): smb-enum scanner + smb-text parser`

---

## Task 4: `api-discovery` scanner + `kiterunner-text` parser

**Files:** lib `libs/scanners/api-discovery/`; parser `libs/parsers/src/kiterunner-text/`; tests.

> **Verify tool:** `kr scan <url> -w <routes.kite> -x 20 -j 100 -o text` prints lines like `GET     200 [  1234,   45,  6] https://host/api/v1/users 0cf6841b...`. Adjust.

- [ ] **Step 1: Scaffold** `libs/scanners/api-discovery/` (`ApiDiscovery`/`scanners-api-discovery`; alias).
- [ ] **Step 2: Failing scanner test:** name `api-discovery`, image `autoscanner/api-discovery:1.0`, output `{format:'TEXT',capture:'stdout',parser:'kiterunner-text'}`, produces `['Endpoint']`, no cred; `build()` → `sh -lc` `kr scan '<target>' ...`.
- [ ] **Step 3: Implement** `api-discovery.scanner.ts`:
```ts
  name: 'api-discovery', displayName: 'API discovery (kiterunner)',
  category: [ScannerCategory.API_SECURITY, ScannerCategory.WEB_ENUM],
  description: 'Brute-forces hidden API routes with an API wordlist (kiterunner). Actively probes the target.',
  image 'autoscanner/api-discovery:1.0' (mem 768, timeout 600_000),
  build: const t = shellQuoteSingle(target); script = `kr scan ${t} -w /wordlists/routes-small.kite -x 10 -j 50 --fail-status-codes 400,404 2>/dev/null || true`; return { cmd: ['sh','-lc',script] };
  outputs: [{ format: 'TEXT', capture: 'stdout', parser: 'kiterunner-text' }], produces: ['Endpoint'],
```
- [ ] **Step 4: Failing parser test** `kiterunner-text.parser.spec.ts`:
```ts
import { KiterunnerTextParser } from '../kiterunner-text';
import type { ParserContext } from '../types';
const ctx: ParserContext = { scanJobId: 'j', scannerName: 'api-discovery', target: 'https://api.example.com', engagementId: 'e' };
describe('KiterunnerTextParser', () => {
  const parser = new KiterunnerTextParser();
  it('extracts discovered API routes as Endpoints (deduped) with method + status', async () => {
    const text = [
      'GET     200 [  1234,   45,  6] https://api.example.com/api/v1/users 0cf6841b',
      'POST    401 [    12,    2,  1] https://api.example.com/api/v1/login abcd',
      'GET     200 [  1234,   45,  6] https://api.example.com/api/v1/users 0cf6841b',
    ].join('\n');
    const out = await parser.parse(text, ctx);
    const urls = out.endpoints.map((e) => e.url).sort();
    expect(urls).toEqual(['https://api.example.com/api/v1/login', 'https://api.example.com/api/v1/users']);
    const users = out.endpoints.find((e) => e.url.endsWith('/users'));
    expect(users?.method).toBe('GET');
    expect(users?.statusCode).toBe(200);
  });
  it('tolerant of blank/garbage', async () => {
    expect((await parser.parse('', ctx)).endpoints).toHaveLength(0);
  });
});
```
- [ ] **Step 5: Implement** `kiterunner-text.parser.ts` (+ index): per line, regex `^(\w+)\s+(\d{3})\s+\[[^\]]*\]\s+(https?:\/\/\S+)` → `{ method, statusCode: Number, url }`; dedup by url; `out.endpoints.push({ url, method, statusCode })`. Tolerant.
- [ ] **Step 6: Register** + barrel.
- [ ] **Step 7: Verify + commit.** `feat(phase-8.3): api-discovery scanner + kiterunner-text parser`

---

## Task 5: Dockerfiles (snmp-recon, smb-enum, api-discovery)

**Files:** `docker/scanners/{snmp-recon,smb-enum,api-discovery}/Dockerfile`. (smtp-recon reuses `instrumentisto/nmap:7.98-r2` — no Dockerfile.)

House style (non-root user uid 10001, ca-certificates, sh, ENTRYPOINT [], no secrets — read `docker/scanners/cdncheck/Dockerfile` etc.):
- [ ] **Step 1:** `snmp-recon` — `FROM debian:bookworm-slim` + `apt-get install -y --no-install-recommends onesixtyone snmp` (snmp provides snmpwalk) `ca-certificates`.
- [ ] **Step 2:** `smb-enum` — `FROM python:3.12-slim` + install enum4linux-ng (`pip install enum4linux-ng` or `git clone` + deps) + `smbclient`/`samba-common-bin` if required by the tool + `ca-certificates`.
- [ ] **Step 3:** `api-discovery` — multi-stage Go: `go install github.com/assetnote/kiterunner/cmd/kite@latest` (binary `kr`/`kite` — confirm the binary name + the `scan` subcommand); runtime + bundle a small API routes wordlist at `/wordlists/routes-small.kite` (download the assetnote `routes-small.kite.tar.gz` at build OR vendor a tiny one) + `ca-certificates`. Keep the wordlist modest (spec §5).
- [ ] **Step 4:** `ls docker/scanners/{snmp-recon,smb-enum,api-discovery}/Dockerfile`. Commit `feat(phase-8.3): Dockerfiles for snmp-recon, smb-enum, api-discovery`.

---

## Task 6: Register + `service-recon` template

**Files:** `libs/scanners/all/src/all-scanners.module.ts` (+ spec); `libs/templates/src/builtins/service-recon.ts`; `index.ts`; `builtins.spec.ts`.

- [ ] **Step 1:** Add the 4 modules (`SmtpReconScannerModule`, `SnmpReconScannerModule`, `SmbEnumScannerModule`, `ApiDiscoveryScannerModule` — verify exact exported names) to `SCANNER_MODULES`. Update `all-scanners.module.spec.ts` to assert the 4 new names.
- [ ] **Step 2:** Create `libs/templates/src/builtins/service-recon.ts` (mirror `web-enrich.ts` shape): `name: 'service-recon'`, `displayName`, `description`, `steps` = the 4 scanners each `{ scannerName, inputs: {}, target: { kind:'context', path:'target' } }`.
- [ ] **Step 3:** Export in `index.ts` (`export * from './service-recon'` + add `ServiceRecon` to `BUILTIN_TEMPLATES`). Update `builtins.spec.ts` (count +1, membership, `registry.get('service-recon')`).
- [ ] **Step 4:** `pnpm nx run-many -t type-check,test -p scanners-all,templates` → green. Commit `feat(phase-8.3): register service scanners + service-recon template`.

---

## Task 7: e2e (opt-in) + full validation

**Files:** `apps/api-gateway-e2e/src/scenarios/service-recon-e2e.spec.ts`.

- [ ] **Step 1:** Opt-in e2e gated by base env + `SERVICE_RECON_E2E=1` (mirror `web-enrich-e2e.spec.ts`). Scenario: login; `createEngagementWithWildcardScope`; `runTemplate('service-recon', target)`; `pollTemplateRun` until terminal; **assert** the run reaches `COMPLETED` (the per-scanner results depend on which services are open on the target → log counts of Findings/Endpoints/OrgMetadata as soft signals, no hard per-scanner assertion). Suite stays skipped without the gate; type-check only.
- [ ] **Step 2: Full validation:**
```
pnpm nx run-many -t lint,type-check,test -p scanner-sdk,scanners-smtp-recon,scanners-snmp-recon,scanners-smb-enum,scanners-api-discovery,scanners-all,templates,api-gateway,parser-worker
```
+ `npx tsc --project apps/api-gateway-e2e/tsconfig.spec.json --noEmit` + `pnpm nx run-many -t build -p api-gateway,parser-worker,scan-worker`. All green.
- [ ] **Step 3:** Commit `test(phase-8.3): service-recon e2e (opt-in) + validation`.

---

## Validation criteria (spec §1)
4 scanners registered + runnable; parsers + tests; smtp reuses nmap image; 3 Dockerfiles; `service-recon` template; data in existing tabs (no front change); CI green incl. build. No Prisma change. ✅

## Out of scope
Auth brute-force/spraying; deep AD; IoT/ICS. Discovery/info only.

## Self-review notes
- Parser names (`smtp-nmap-xml`, `snmp-text`, `smb-text`, `kiterunner-text`) match each scanner's `outputs[].parser`. Entity field names match `types.ts`. All parsers tolerant.
- smtp-recon target is a direct exec arg (no shell); the other 3 shell-quote the target.
- No new Prisma model/enum; OrgMetadata uses `'OTHER'`. smtp reuses `instrumentisto/nmap:7.98-r2` (no Dockerfile).
- External-tool output is version-dependent (snmp/smb/api) — verify + adjust fixture/parser at impl time; keep tolerant.
