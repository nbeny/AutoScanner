# Phase 8.5 — OpenVAS / Greenbone Network Vuln Scanning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add active network/host vulnerability scanning via Greenbone/OpenVAS `openvasd`: a persistent Greenbone scanner stack (docker-compose) plus a thin ephemeral `openvas-scan` client `ScannerDefinition` that drives `openvasd`'s HTTP API and maps verified results onto the existing `Finding` entity (CVE + CVSS→severity).

**Architecture:** Greenbone scanner-subset runs as an always-on compose stack on a named docker network (`autoscanner-greenbone`). The `openvas-scan` client container joins that network (`docker.network: { name }`, already supported by `docker-runner`), reads an `OPENVAS` operator credential as `OPENVASD_API_KEY`, and runs an entrypoint that does the openvasd scan lifecycle (create→start→poll→results) emitting JSON to stdout. A tolerant `openvasd-json` parser turns results into `Finding`s. The scan-worker is unchanged.

**Tech Stack:** NestJS, Nx, Zod, Docker/compose, Prisma (one enum + migration), Jest, `@autoscanner/cve` (`cvssToSeverity`). Spec: `docs/superpowers/specs/2026-06-15-phase-8-5-openvas-network-vuln-design.md`. Pattern refs: credential scanner `libs/scanners/shodan` (`requiresCredential`/`credentialEnvVar`), tolerant parser `libs/parsers/src/snmp-text`, registration `libs/scanners/all/src/all-scanners.module.ts`, template `libs/templates/src/builtins/service-recon.ts`, migration dirs `prisma/migrations/*`.

---

## Reference (read once)
- **SDK** `libs/scanner-sdk/src/types.ts`: `ScannerDockerSpec.network: 'bridge' | 'host' | 'none'` (TOO NARROW — widened in T2); `requiresCredential?: 'SHODAN' | 'CENSYS' | 'GITHUB' | 'SECURITYTRAILS'` (extended in T2); `credentialEnvVar?: string`. `ScannerOutput`, `ScannerDefinition`, `BuildResult { cmd, env?, binds?, stdin? }`.
- **docker-runner** `libs/docker-runner/src/types.ts`: `RunSpec.network` ALREADY accepts `'bridge' | 'host' | 'none' | { name: string }`. The scan-worker passes `network: scanner.docker.network` straight through (`apps/scan-worker/src/app/scan-job.processor.ts:118`), so widening the SDK type is the only blocker to a named network.
- **Credential injection** (`scan-job.processor.ts:82-110`): when `scanner.requiresCredential` is set, the worker looks up `apiCredential` by `{ ownerId, provider }` where `provider === scanner.requiresCredential` (a Prisma `ApiProvider` value), decrypts, and injects it into env var `scanner.credentialEnvVar ?? '<PROVIDER>_API_KEY'`. So `requiresCredential: 'OPENVAS'` REQUIRES `ApiProvider.OPENVAS` in Prisma (T2).
- **Prisma** `prisma/schema.prisma:520` `enum ApiProvider { SHODAN CENSYS GITHUB SECURITYTRAILS }`. Migrations live in `prisma/migrations/<UTCtimestamp>_<name>/migration.sql`; apply with `pnpm prisma:migrate:dev`.
- **CVSS→severity** `libs/cve/src/cvss-to-severity.ts`: `cvssToSeverity(score: number | null | undefined): Severity | null` (>=9 CRITICAL, >=7 HIGH, >=4 MEDIUM, else LOW). Alias `@autoscanner/cve`.
- **Parser types** `libs/parsers/src/types.ts`: `NormalizedFinding = { scannerName, title, severity, location?, description?, cveId? }` (confirm `cveId` field name at impl — adjust if different); `Severity = 'CRITICAL'|'HIGH'|'MEDIUM'|'LOW'|'INFO'`; `emptyNormalizedOutput()`.
- **Scaffold sources:** scanner lib `libs/scanners/shodan/` (credential scanner); parser `libs/parsers/src/snmp-text/`; registration `libs/scanners/all/`; template `libs/templates/src/builtins/service-recon.ts`.

**External-tool caveat (as 8.3/8.4):** the exact openvasd HTTP endpoints, results JSON schema, and the precise Greenbone service set are **version-dependent**. Each task gives a concrete shape + tolerant parser/entrypoint; **verify against the running openvasd at impl time and adjust the fixture/entrypoint/parser**, keeping the parser tolerant (never throw → `emptyNormalizedOutput()`).

---

## Task 1: Greenbone scanner stack (compose) + feed-sync docs

**Files:** Create `docker/greenbone/docker-compose.greenbone.yml`, `docker/greenbone/.env.example`, `docker/greenbone/README.md`.

This is infrastructure (no unit tests). Validation is structural: the compose file parses and declares the named network + feed volumes.

- [ ] **Step 1: Author the stack.** Create `docker/greenbone/docker-compose.greenbone.yml` declaring the Greenbone **scanner subset** (verify exact image names/tags against current Greenbone Community Containers at impl — they change): `openvasd` (HTTP API + scan engine), `redis-server` (openvas KB), `notus-scanner` + an MQTT broker, and the feed-data containers/volumes that populate the NASL (`vulnerability-tests`), `notus-data`, and `scap-data` volumes. Requirements the file MUST satisfy:
  - a named external-joinable network `autoscanner-greenbone` (`networks: { autoscanner-greenbone: { name: autoscanner-greenbone } }`);
  - `openvasd` reachable in-network as `http://openvasd:3000` with **API-key auth enabled** (key from `${OPENVASD_API_KEY}` in `.env`);
  - named volumes for each feed dataset;
  - no host port exposure required for openvasd (the client joins the network).

- [ ] **Step 2: `.env.example`** with `OPENVASD_API_KEY=changeme` and any image tag pins, plus a one-line comment that the key must be registered as the operator `OPENVAS` credential in the app.

- [ ] **Step 3: `README.md`** documenting: `docker compose -f docker/greenbone/docker-compose.greenbone.yml up -d`; how the **feed sync** runs (the official feed containers on first boot + a scheduled daily refresh — note the multi-GB size and that the first sync takes a while); how to confirm the feed is loaded before scanning; and the feed-empty guard behavior (T3).

- [ ] **Step 4: Validate + commit.** Run `docker compose -f docker/greenbone/docker-compose.greenbone.yml config -q` (if Docker is available; if not, validate YAML parses via `npx js-yaml docker/greenbone/docker-compose.greenbone.yml` or equivalent and note Docker validation is deferred to an env with Docker). Then:
```bash
git add docker/greenbone
git commit -m "feat(phase-8.5): Greenbone scanner stack (openvasd) compose + feed-sync docs"
```

---

## Task 2: SDK widening + `OPENVAS` credential (Prisma enum + migration)

**Files:** Modify `libs/scanner-sdk/src/types.ts`; add `prisma/schema.prisma` enum value + new migration `prisma/migrations/20260615040000_phase8_5_openvas_provider/migration.sql`; test `libs/scanner-sdk/src/__tests__/openvas-types.spec.ts`.

- [ ] **Step 1: Write the failing SDK type test** `libs/scanner-sdk/src/__tests__/openvas-types.spec.ts` (compile-time shape check expressed as a runtime no-op test):

```ts
import type { ScannerDefinition, ScannerDockerSpec } from '../types';
import { z } from 'zod';

describe('SDK supports named docker network + OPENVAS credential', () => {
  it('accepts a named network in ScannerDockerSpec', () => {
    const docker: ScannerDockerSpec = {
      image: 'x:1',
      network: { name: 'autoscanner-greenbone' },
      capabilities: [],
      readonlyRootfs: true,
      memoryLimitMb: 256,
      cpuQuota: 1_000_000,
      defaultTimeoutMs: 1000,
    };
    expect(typeof docker.network === 'object' ? docker.network.name : docker.network).toBe(
      'autoscanner-greenbone',
    );
  });

  it("accepts requiresCredential: 'OPENVAS'", () => {
    const def: Pick<ScannerDefinition, 'requiresCredential' | 'credentialEnvVar'> = {
      requiresCredential: 'OPENVAS',
      credentialEnvVar: 'OPENVASD_API_KEY',
    };
    expect(def.requiresCredential).toBe('OPENVAS');
    // keep z imported/used so the test file mirrors real scanner files
    expect(z.object({}).parse({})).toEqual({});
  });
});
```

Run `pnpm nx test scanner-sdk` → FAIL (type errors: named network + 'OPENVAS' not assignable).

- [ ] **Step 2: Widen the SDK types** in `libs/scanner-sdk/src/types.ts`:
  - `ScannerDockerSpec.network`: change to `network: 'bridge' | 'host' | 'none' | { name: string };`
  - `requiresCredential`: change to `requiresCredential?: 'SHODAN' | 'CENSYS' | 'GITHUB' | 'SECURITYTRAILS' | 'OPENVAS';`

Run `pnpm nx test scanner-sdk` → PASS.

- [ ] **Step 3: Confirm the worker passes a named network through unchanged.** Read `apps/scan-worker/src/app/scan-job.processor.ts` around line 118: it sets `network: scanner.docker.network` into `RunSpec` (which already accepts `{ name }`), and `user: scanner.docker.network === 'host' ? 'root' : undefined` (an object network is not `'host'`, so `user` stays undefined — correct). No worker code change needed. If a `type-check` of `scan-worker` fails on the widened type, fix the minimal type at the failure site only. Run `pnpm nx run-many -t type-check -p scan-worker` → PASS.

- [ ] **Step 4: Add the Prisma enum value.** In `prisma/schema.prisma`, add `OPENVAS` to `enum ApiProvider` (after `SECURITYTRAILS`).

- [ ] **Step 5: Create the migration** `prisma/migrations/20260615040000_phase8_5_openvas_provider/migration.sql`:

```sql
-- Add OPENVAS to the ApiProvider enum (phase 8.5 openvasd credential).
ALTER TYPE "ApiProvider" ADD VALUE 'OPENVAS';
```

- [ ] **Step 6: Regenerate the client + verify migration is consistent.** Run `pnpm prisma generate`. If a local Postgres is available (`pnpm dev:up`), run `pnpm prisma:migrate:dev --name phase8_5_openvas_provider` to confirm it applies; if no DB is available, run `npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-migrations prisma/migrations --shadow-database-url "$DATABASE_URL"` is NOT possible offline — instead just confirm `pnpm prisma validate` passes and the hand-written SQL matches the enum addition. Note in the commit which validation was run.

- [ ] **Step 7: Commit.**
```bash
git add libs/scanner-sdk prisma/schema.prisma prisma/migrations/20260615040000_phase8_5_openvas_provider
git commit -m "feat(phase-8.5): SDK named-network + OPENVAS credential (ApiProvider enum + migration)"
```

---

## Task 3: `openvas-scan` client image + entrypoint (openvasd lifecycle)

**Files:** Create `docker/scanners/openvas-scan/Dockerfile`, `docker/scanners/openvas-scan/openvas-scan-run.sh`.

The HTTP lifecycle lives in the image entrypoint (keeps the scan-worker and `build()` trivial). Shell-script — validated structurally here and exercised by the opt-in e2e (T6).

- [ ] **Step 1: Entrypoint** `docker/scanners/openvas-scan/openvas-scan-run.sh` — a POSIX `sh` script using `curl` + `jq` that:
  1. reads `OPENVASD_URL` (default `http://openvasd:3000`), `OPENVASD_API_KEY` (from injected credential), and the target as `$1`;
  2. **feed guard:** GET the openvasd health/feed status; if the feed is not ready, print a JSON error object to stderr and `exit 1` (fail loud, never a false "0 vulns") — verify the exact health endpoint at impl;
  3. `POST $OPENVASD_URL/scans` with header `X-API-KEY: $OPENVASD_API_KEY` and a JSON body selecting the target host and a sane VT set → capture `scanId` from the response;
  4. `POST $OPENVASD_URL/scans/$scanId` `{"action":"start"}`;
  5. poll `GET $OPENVASD_URL/scans/$scanId/status` until terminal (`succeeded`/`failed`/`stopped`) with a bounded loop (sleep interval + max iterations < container timeout);
  6. `GET $OPENVASD_URL/scans/$scanId/results` → print the raw JSON to **stdout**;
  7. `DELETE $OPENVASD_URL/scans/$scanId` (best-effort cleanup);
  8. the target is interpolated only inside a `jq --arg` (no shell-built JSON) so there is no injection surface.
  Verify exact endpoint paths/verbs + the start/status/results JSON shapes against the running openvasd at impl and adjust.

- [ ] **Step 2: Dockerfile** `docker/scanners/openvas-scan/Dockerfile` (house style — non-root uid 10001, `ca-certificates`, `ENTRYPOINT []`):

```dockerfile
# openvas-scan: thin client that drives the openvasd HTTP API and prints the
# scan results JSON to stdout. Joins the 'autoscanner-greenbone' network.
FROM debian:bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl jq ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && useradd -u 10001 -m scanner
COPY openvas-scan-run.sh /usr/local/bin/openvas-scan-run
RUN chmod +x /usr/local/bin/openvas-scan-run
USER scanner
ENTRYPOINT []
```

- [ ] **Step 3: Validate + commit.** `sh -n docker/scanners/openvas-scan/openvas-scan-run.sh` (syntax check) and `ls docker/scanners/openvas-scan/Dockerfile`. (Optional, if Docker available: `docker build -t autoscanner/openvas-scan:1.0 docker/scanners/openvas-scan`.) Then:
```bash
git add docker/scanners/openvas-scan
git commit -m "feat(phase-8.5): openvas-scan client image + openvasd lifecycle entrypoint"
```

---

## Task 4: `openvas-scan` ScannerDefinition + `openvasd-json` parser

**Files:** Create lib `libs/scanners/openvas-scan/` (copy `libs/scanners/shodan/`); parser `libs/parsers/src/openvasd-json/openvasd-json.parser.ts` + `index.ts`; tests `libs/scanners/openvas-scan/src/__tests__/openvas-scan.scanner.spec.ts` + `libs/parsers/src/__tests__/openvasd-json.parser.spec.ts`; modify `tsconfig.base.json`, `libs/parsers/src/parsers.module.ts`, `libs/parsers/src/index.ts`, `libs/parsers/package.json` (add `@autoscanner/cve` dep).

- [ ] **Step 1: Scaffold** `libs/scanners/openvas-scan/` by copying `libs/scanners/shodan/`. Rename `shodan`→`openvas-scan`, `Shodan`→`OpenvasScan`, project `scanners-shodan`→`scanners-openvas-scan`, add alias `@autoscanner/scanners-openvas-scan` value `["libs/scanners/openvas-scan/src/index.ts"]` in `tsconfig.base.json`. `grep -rni shodan libs/scanners/openvas-scan` → none.

- [ ] **Step 2: Write the failing scanner test** `libs/scanners/openvas-scan/src/__tests__/openvas-scan.scanner.spec.ts`:

```ts
import { OpenvasScanScanner } from '../openvas-scan.scanner';
import type { BuildContext } from '@autoscanner/scanner-sdk';

const ctx: BuildContext = { scanJobId: 'j', engagementId: 'e', scratchDir: '/tmp' };

describe('OpenvasScanScanner', () => {
  it('joins the greenbone network, needs OPENVAS cred, JSON → openvasd-json, produces Finding', () => {
    expect(OpenvasScanScanner.name).toBe('openvas-scan');
    expect(OpenvasScanScanner.docker.network).toEqual({ name: 'autoscanner-greenbone' });
    expect(OpenvasScanScanner.requiresCredential).toBe('OPENVAS');
    expect(OpenvasScanScanner.credentialEnvVar).toBe('OPENVASD_API_KEY');
    expect(OpenvasScanScanner.outputs[0]).toEqual({ format: 'JSON', capture: 'stdout', parser: 'openvasd-json' });
    expect(OpenvasScanScanner.produces).toEqual(['Finding']);
  });

  it('build() passes the target to the image entrypoint and sets OPENVASD_URL', () => {
    const { cmd, env } = OpenvasScanScanner.build(OpenvasScanScanner.inputSchema.parse({}), 'scanme.test', ctx);
    expect(cmd).toEqual(['openvas-scan-run', 'scanme.test']);
    expect(env?.OPENVASD_URL).toBe('http://openvasd:3000');
  });
});
```

Run `pnpm nx test scanners-openvas-scan` → FAIL.

- [ ] **Step 3: Implement** `libs/scanners/openvas-scan/src/openvas-scan.scanner.ts`:

```ts
import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

export const OpenvasScanScanner: ScannerDefinition<Record<string, never>> = {
  name: 'openvas-scan',
  displayName: 'Network vuln scan (OpenVAS/openvasd)',
  category: [ScannerCategory.VULN_SCAN, ScannerCategory.NETWORK_ANALYSIS],
  description:
    'Active network/host vulnerability scanning via Greenbone openvasd (verified NVT checks, CVE-tagged). ' +
    'Requires an OPENVAS API-key credential and the running greenbone stack. Actively probes the target.',
  inputSchema: z.object({}),
  requiresCredential: 'OPENVAS',
  credentialEnvVar: 'OPENVASD_API_KEY',
  docker: {
    image: 'autoscanner/openvas-scan:1.0',
    network: { name: 'autoscanner-greenbone' },
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 256,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 1_800_000, // network vuln scans are long (up to ~30 min)
  },
  build(_input, target) {
    // The HTTP lifecycle lives in the image entrypoint. Pass the target as a
    // direct exec arg (no shell), so there is no shell-injection surface.
    // OPENVASD_API_KEY is injected by scan-worker from the OPENVAS credential.
    return {
      cmd: ['openvas-scan-run', target],
      env: { OPENVASD_URL: 'http://openvasd:3000' },
    };
  },
  outputs: [{ format: 'JSON', capture: 'stdout', parser: 'openvasd-json' }],
  produces: ['Finding'],
};
```

Verify `ScannerCategory.NETWORK_ANALYSIS` exists (it does — `libs/scanner-sdk/src/types.ts`). Update `index.ts` + `openvas-scan.module.ts` (register `OpenvasScanScanner`). Run `pnpm nx test scanners-openvas-scan` → PASS.

- [ ] **Step 4: Write the failing parser test** `libs/parsers/src/__tests__/openvasd-json.parser.spec.ts`:

```ts
import { OpenvasdJsonParser } from '../openvasd-json';
import type { ParserContext } from '../types';

const ctx: ParserContext = { scanJobId: 'j', scannerName: 'openvas-scan', target: '10.0.0.5', engagementId: 'e' };

describe('OpenvasdJsonParser', () => {
  const parser = new OpenvasdJsonParser();

  it('maps an alarm result to a Finding with CVSS-derived severity + CVE', async () => {
    // Representative openvasd results JSON (verify real shape at impl).
    const json = JSON.stringify([
      {
        type: 'alarm',
        ip_address: '10.0.0.5',
        hostname: 'host.test',
        oid: '1.3.6.1.4.1.25623.1.0.123456',
        port: '443/tcp',
        message: 'OpenSSL Heartbleed',
        severity: 9.4,
        refs: [{ type: 'cve', id: 'CVE-2014-0160' }],
      },
      { type: 'host_detail', ip_address: '10.0.0.5', message: 'OS: Linux' }, // non-alarm → ignored
    ]);
    const out = await parser.parse(json, ctx);
    expect(out.findings).toHaveLength(1);
    expect(out.findings[0].severity).toBe('CRITICAL');
    expect(out.findings[0].location).toContain('443/tcp');
    expect(out.findings[0].cveId).toBe('CVE-2014-0160');
    expect(out.findings[0].title).toContain('Heartbleed');
  });

  it('tolerant of blank/garbage / no-alarm output', async () => {
    expect((await parser.parse('', ctx)).findings).toHaveLength(0);
    expect((await parser.parse('not json', ctx)).findings).toHaveLength(0);
    expect((await parser.parse('[]', ctx)).findings).toHaveLength(0);
  });
});
```

Run `pnpm nx test parsers --testPathPattern=openvasd-json` → FAIL.

- [ ] **Step 5: Implement** `libs/parsers/src/openvasd-json/openvasd-json.parser.ts`:

```ts
import { Injectable } from '@nestjs/common';
import type { RawOutputFormat } from '@autoscanner/scanner-sdk';
import { cvssToSeverity } from '@autoscanner/cve';
import type { NormalizedFinding, NormalizedOutput, Parser, ParserContext, Severity } from '../types';
import { emptyNormalizedOutput } from '../types';

interface OpenvasdRef {
  type?: string;
  id?: string;
}
interface OpenvasdResult {
  type?: string; // 'alarm' = a vulnerability hit; others (host_detail/log/error) are informational
  ip_address?: string;
  hostname?: string;
  oid?: string;
  port?: string;
  message?: string;
  severity?: number; // CVSS base score
  refs?: OpenvasdRef[];
}

const CVE_RE = /CVE-\d{4}-\d{4,}/i;

function firstCve(result: OpenvasdResult): string | undefined {
  for (const ref of result.refs ?? []) {
    if (typeof ref?.id === 'string') {
      const m = ref.id.match(CVE_RE);
      if (m) return m[0].toUpperCase();
    }
  }
  // fall back to scanning the message text
  const fromMsg = typeof result.message === 'string' ? result.message.match(CVE_RE) : null;
  return fromMsg ? fromMsg[0].toUpperCase() : undefined;
}

@Injectable()
export class OpenvasdJsonParser implements Parser {
  readonly name = 'openvasd-json';
  readonly formats: RawOutputFormat[] = ['JSON'];

  async parse(input: Buffer | string, ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = Buffer.isBuffer(input) ? input.toString('utf8') : input;
    if (!text.trim()) return out;

    let results: OpenvasdResult[];
    try {
      const parsed: unknown = JSON.parse(text);
      results = Array.isArray(parsed) ? (parsed as OpenvasdResult[]) : [];
    } catch {
      return emptyNormalizedOutput();
    }

    try {
      for (const r of results) {
        if (!r || typeof r !== 'object') continue;
        if (r.type !== 'alarm') continue; // only real vuln hits become Findings
        const severity: Severity = cvssToSeverity(r.severity) ?? 'INFO';
        const host = r.hostname ?? r.ip_address ?? ctx.target;
        const finding: NormalizedFinding = {
          scannerName: ctx.scannerName,
          title: r.message ?? `OpenVAS NVT ${r.oid ?? ''}`.trim(),
          severity,
          location: r.port ? `${host}:${r.port}` : host,
          description: r.oid ? `NVT ${r.oid}` : undefined,
        };
        const cve = firstCve(r);
        if (cve) finding.cveId = cve;
        out.findings.push(finding);
      }
    } catch {
      return emptyNormalizedOutput();
    }

    return out;
  }
}
```

Plus `libs/parsers/src/openvasd-json/index.ts`: `export * from './openvasd-json.parser';`. Confirm `NormalizedFinding` actually has a `cveId` field (read `types.ts`); if the field is named differently (e.g. `cve`), use the real name in both parser and test. Add `"@autoscanner/cve": "workspace:*"` (or the repo's convention) to `libs/parsers/package.json` dependencies so the import resolves.

- [ ] **Step 6: Register the parser** in `libs/parsers/src/parsers.module.ts` (import + `providers` + `exports` + ctor `private readonly openvasdJson: OpenvasdJsonParser,` + `this.registry.register(this.openvasdJson);`) + barrel `libs/parsers/src/index.ts` (`export * from './openvasd-json';`). Run `pnpm nx test parsers --testPathPattern=openvasd-json` → PASS.

- [ ] **Step 7: Verify + commit.** `pnpm nx run-many -t type-check,test -p scanners-openvas-scan,parsers` → green. `grep -rni shodan libs/scanners/openvas-scan` → none. Then:
```bash
git add libs/scanners/openvas-scan libs/parsers/src/openvasd-json libs/parsers/src/parsers.module.ts libs/parsers/src/index.ts libs/parsers/package.json tsconfig.base.json
git commit -m "feat(phase-8.5): openvas-scan scanner + tolerant openvasd-json parser"
```

---

## Task 5: Register scanner + `network-vuln` template

**Files:** `libs/scanners/all/src/all-scanners.module.ts` (+ `all-scanners.module.spec.ts`); `libs/templates/src/builtins/network-vuln.ts`; `libs/templates/src/builtins/index.ts`; `libs/templates/src/builtins/builtins.spec.ts`.

- [ ] **Step 1:** In `libs/scanners/all/src/all-scanners.module.ts` add `import { OpenvasScanScannerModule } from '@autoscanner/scanners-openvas-scan';` and add `OpenvasScanScannerModule` to `SCANNER_MODULES`. Update `all-scanners.module.spec.ts` to assert `openvas-scan` is registered (follow the existing membership-assertion pattern). Run `pnpm nx test scanners-all` → PASS.

- [ ] **Step 2:** Create `libs/templates/src/builtins/network-vuln.ts`:

```ts
import type { TemplateDefinition } from '../types';

/**
 * Phase 8.5 — active network vulnerability template. Runs the OpenVAS/openvasd
 * scanner against the target host. Requires the greenbone stack + OPENVAS credential.
 */
export const NetworkVuln: TemplateDefinition = {
  name: 'network-vuln',
  displayName: 'Network Vuln (OpenVAS)',
  description:
    'Active network/host vulnerability scanning via Greenbone openvasd: verified NVT checks, ' +
    'CVE-tagged Findings with CVSS-derived severity. Requires the greenbone stack and an OPENVAS ' +
    'API-key credential. Intrusive - engagement scope only.',
  steps: [{ scannerName: 'openvas-scan', inputs: {}, target: { kind: 'context', path: 'target' } }],
};
```

Confirm `TemplateDefinition`/step `target` shape against `libs/templates/src/types.ts` + `service-recon.ts`; match the real types.

- [ ] **Step 3:** In `libs/templates/src/builtins/index.ts` add `export * from './network-vuln';` + add `NetworkVuln` to `BUILTIN_TEMPLATES`. Update `libs/templates/src/__tests__/builtins.spec.ts` (bump expected count by 1; assert `network-vuln` membership + `registry.get('network-vuln')` resolves — mirror the `service-recon`/`vuln-active` assertions). Run `pnpm nx test templates` → PASS.

- [ ] **Step 4: Verify + commit.** `pnpm nx run-many -t type-check,test -p scanners-all,templates` → green.
```bash
git add libs/scanners/all libs/templates/src/builtins libs/templates/src/__tests__
git commit -m "feat(phase-8.5): register openvas-scan + network-vuln template"
```

---

## Task 6: e2e (opt-in) + full validation

**Files:** `apps/api-gateway-e2e/src/scenarios/network-vuln-e2e.spec.ts`.

- [ ] **Step 1:** Create an opt-in e2e gated by the base env + `OPENVAS_E2E=1` (mirror `apps/api-gateway-e2e/src/scenarios/vuln-active-e2e.spec.ts` — copy its skip-guard + login/`createEngagementWithWildcardScope`/`runTemplate`/`pollTemplateRun` helpers). Scenario: requires the greenbone stack running + an `OPENVAS` credential configured + a feed-loaded openvasd; log in; create engagement with wildcard scope; `runTemplate('network-vuln', target)`; `pollTemplateRun` until terminal; **assert the run reaches `COMPLETED`** (per-scanner findings depend on the target → log Finding counts as soft signals; no hard per-finding assertion). The suite stays skipped without the gate. Document the required env (greenbone up, `OPENVAS` cred, target) in the file header.

- [ ] **Step 2: Full validation.** Run:
```
pnpm nx run-many -t type-check,test -p scanner-sdk,scanners-openvas-scan,scanners-all,templates,parsers,scan-worker,api-gateway,parser-worker
```
then type-check the e2e suite and build the workers:
```
npx tsc --project apps/api-gateway-e2e/tsconfig.spec.json --noEmit
pnpm nx run-many -t build -p api-gateway,parser-worker,scan-worker
```
All green. (If api-gateway/parser-worker fail on stale Prisma client/deps, run `pnpm install` + `pnpm prisma generate` first — env staleness, not a code defect.)

- [ ] **Step 3: Commit.**
```bash
git add apps/api-gateway-e2e/src/scenarios/network-vuln-e2e.spec.ts
git commit -m "test(phase-8.5): network-vuln e2e (opt-in OPENVAS_E2E) + validation"
```

---

## Validation criteria (spec §1)
Greenbone scanner stack compose + feed-sync docs (T1); SDK named-network + `OPENVAS` credential + Prisma enum/migration (T2); `openvas-scan` client image + openvasd-lifecycle entrypoint with feed-empty guard (T3); `openvas-scan` ScannerDefinition (joins named network, requires OPENVAS cred) + tolerant `openvasd-json` parser mapping results → `Finding` with CVE + CVSS→severity (T4); registered + `network-vuln` template (T5); opt-in e2e + CI incl. build (T6). Findings land in the existing tab (no front change).

## Out of scope (spec §1)
CPE→CVE correlation (→ 8.6); GMP/gvmd/gsa management layer; authenticated/credentialed scans; full offline NVD mirror.

## Self-review notes
- **Spec coverage:** stack §2 = T1; credential/SDK/Prisma §2 = T2; client lifecycle §2 = T3; scanner+parser+mapping §2/§3 = T4; register+template = T5; e2e+CI §4 = T6; feed-empty guard §5 = T3 Step 1.2; CVE+CVSS→severity §3 = T4 parser (`cvssToSeverity`, CVE regex).
- **Type consistency:** `OpenvasScanScanner` / `OpenvasScanScannerModule` / `OpenvasdJsonParser` / `NetworkVuln` used identically across scaffold (T4), registration (T5), parser registration (T4 Step 6). Parser name `openvasd-json` = scanner `outputs[].parser`. `requiresCredential: 'OPENVAS'` (T4) matches the SDK union + Prisma enum (T2) — the worker resolves the credential by this exact string.
- **Tolerance:** `openvasd-json` wraps JSON.parse + the loop in try/catch → `emptyNormalizedOutput()`; ignores non-`alarm` results; null-guards each element; blank/garbage/`[]` → 0 findings.
- **Security:** target passed as a direct exec arg to the entrypoint (no shell); entrypoint builds JSON via `jq --arg` (no shell-built JSON); API key from encrypted operator credential, injected as env, never in `build()`/logs; client joins a dedicated network, openvasd not host-exposed.
- **External-tool caveat:** openvasd endpoints/results schema + Greenbone service set are version-dependent — verify the real openvasd at impl and adjust the entrypoint (T3), the parser fixture/field mapping (T4), and the compose service set (T1). Confirm `NormalizedFinding.cveId` field name in `types.ts` before relying on it.
- **Infra-only tasks (T1, T3)** have no unit tests by nature; they are validated structurally (`compose config`, `sh -n`) and exercised by the opt-in e2e (T6). All logic-bearing units (T2 types, T4 parser/scanner, T5 template/registration) follow TDD.
