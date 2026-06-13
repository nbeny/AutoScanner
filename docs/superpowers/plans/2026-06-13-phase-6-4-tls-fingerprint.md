# Phase 6.4 — Fingerprint / TLS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Checkbox (`- [ ]`) steps.

**Goal:** Capture TLS certificates (with weak-cert findings) and application fingerprints, via `tlsx` and `whatweb`, persisted as a new `TlsCertificate` entity plus reused `Finding`/`Technology`, driven by a `web-fingerprint` template.

**Architecture:** Same scanner/parser/persister pattern. Adds one Prisma table (`TlsCertificate`), a `tlsCertificates[]` channel on `NormalizedOutput`, a `TlsCertificatePersister`, two scanners (`tlsx`, `whatweb`), parsers (`tlsx-json` → certs+findings, `whatweb-json` → technologies), a GraphQL `tlsCertificates` query + frontend section, and the `web-fingerprint` template. Findings and technologies reuse the existing `NormalizedFinding`/`NormalizedTechnology` channels + `FindingPersister`/`TechnologyPersister`. Builds on 6.1–6.3.

**Tech Stack:** Nx · NestJS · Prisma 6 · BullMQ · Apollo GraphQL · React · Zod · Docker.

---

## Refined design (6.4) — decisions locked

Refines §5.3 of the master spec.

1. **Tools:** `tlsx` (ProjectDiscovery official image, JSONL → `TlsCertificate` + weak-cert `Finding`s), `whatweb` (custom ruby image, JSON → `Technology`). **`sslscan` + `testssl.sh` are deferred** (YAGNI) — `tlsx` already surfaces TLS version, expiry, and self-signed status, which covers the core weak-TLS findings; cipher-suite-level scanning is a follow-up.
2. **`TlsCertificate`** table: `id, engagementId, subdomainId?, host, subjectCn?, subjectAn (String[]), issuerCn?, notBefore?, notAfter?, fingerprintSha256, tlsVersion?, selfSigned (Bool default false), expired (Bool default false), source, firstSeenAt, lastSeenAt`. Merge key `@@unique([engagementId, fingerprintSha256, host])`.
3. **`tlsx-json` parser** emits a `NormalizedTlsCertificate` per line AND `NormalizedFinding`s for issues: expired cert (severity MEDIUM), self-signed (LOW), TLS < 1.2 (MEDIUM). Findings reuse the existing dedup/persister.
4. **`whatweb-json` parser** emits `NormalizedTechnology` per detected plugin (reuses `TechnologyPersister` — links by host to an existing `Subdomain`/`Asset`, same as httpx tech detection).
5. **`NormalizedOutput`** gains `tlsCertificates: NormalizedTlsCertificate[]`. `ProducedEntity` gains `'TlsCertificate'`.
6. **`TlsCertificatePersister`** (parser-worker): upsert by `(engagementId, fingerprintSha256, host)`, resolve `subdomainId` by host (like EndpointPersister), refresh `lastSeenAt`/`notAfter`/flags.
7. **GraphQL:** `tlsCertificates(engagementId)` query (engagement-scoped, guarded — mirror osint/endpoints). Frontend: a **TLS** section on the OSINT/engagement view OR a dedicated tab. Keep minimal: a `tlsCertificates` query + a small tab.
8. **Template `web-fingerprint`:** `httpx → tlsx → whatweb` (httpx probes; tlsx + whatweb run over `subdomains`).
9. **Migration:** hand-written SQL (no local Postgres). `String[]` → Postgres `TEXT[]`.

**Acceptance (opt-in e2e `web-fingerprint-e2e`, gate `E2E_RUN_WEB_FINGERPRINT`):** `web-fingerprint` on a target persists ≥1 `TlsCertificate` (tlsx) and ≥1 `Technology` (whatweb); idempotent re-run.

---

## File Structure
**New libs:** `libs/scanners/tlsx/`, `libs/scanners/whatweb/`.
**New image:** `docker/scanners/whatweb/Dockerfile` (tlsx uses the official `projectdiscovery/tlsx` registry image).
**New parsers:** `libs/parsers/src/tlsx-json/`, `libs/parsers/src/whatweb-json/`.
**New persister:** `apps/parser-worker/src/app/persisters/tls-certificate-persister.ts`.
**New api-gateway:** `apps/api-gateway/src/app/tls/` (tlsCertificates query).
**New frontend:** `engagement-tls-tab.tsx` (+ test).
**New template:** `libs/templates/src/builtins/web-fingerprint.ts`.
**New migration:** `prisma/migrations/20260613020000_phase6_4_tls/migration.sql`.
**New e2e:** `apps/api-gateway-e2e/src/scenarios/web-fingerprint-e2e.spec.ts`.
**Modified:** `prisma/schema.prisma`, `libs/scanner-sdk/src/types.ts` (ProducedEntity), `libs/parsers/src/types.ts`, parsers module/index, `libs/scanners/all`, `tsconfig.base.json`, `tools/scanners/build-images.sh`, parse-job processor + module, templates index, api-gateway app.module, frontend engagement page, `.github/workflows/ci.yml`, `README.md`.

---

## Task 1: TlsCertificate model + migration

- [ ] **Step 1:** Add to `prisma/schema.prisma` (under a `// FINGERPRINT / TLS (Phase 6.4)` header):
```prisma
model TlsCertificate {
  id                String   @id @default(cuid())
  engagementId      String
  subdomainId       String?
  host              String
  subjectCn         String?
  subjectAn         String[]
  issuerCn          String?
  notBefore         DateTime?
  notAfter          DateTime?
  fingerprintSha256 String
  tlsVersion        String?
  selfSigned        Boolean  @default(false)
  expired           Boolean  @default(false)
  source            String
  firstSeenAt       DateTime @default(now())
  lastSeenAt        DateTime @default(now())

  engagement Engagement @relation(fields: [engagementId], references: [id], onDelete: Cascade)
  subdomain  Subdomain? @relation(fields: [subdomainId], references: [id], onDelete: SetNull)

  @@unique([engagementId, fingerprintSha256, host])
  @@index([engagementId])
  @@index([subdomainId])
}
```
Add back-relations: `tlsCertificates TlsCertificate[]` on `Engagement` and on `Subdomain`.

- [ ] **Step 2:** `pnpm prisma validate && pnpm prisma generate` → succeed.

- [ ] **Step 3:** Hand-write `prisma/migrations/20260613020000_phase6_4_tls/migration.sql` (read Phase 2 migration for conventions): `CREATE TABLE "TlsCertificate"` with `"subjectAn" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`, `"selfSigned" BOOLEAN NOT NULL DEFAULT false`, `"expired" BOOLEAN NOT NULL DEFAULT false`, nullable timestamp/text cols, PK; unique index `TlsCertificate_engagementId_fingerprintSha256_host_key`; indexes `TlsCertificate_engagementId_idx`, `TlsCertificate_subdomainId_idx`; FKs to Engagement (CASCADE) + Subdomain (SET NULL).

- [ ] **Step 4: Commit** `feat(phase-6.4): TlsCertificate model + migration`.

---

## Task 2: NormalizedTlsCertificate channel + ProducedEntity

- [ ] **Step 1:** In `libs/parsers/src/types.ts`: add
```typescript
export interface NormalizedTlsCertificate {
  host: string;
  subjectCn?: string;
  subjectAn?: string[];
  issuerCn?: string;
  notBefore?: string;   // ISO string; persister converts to Date
  notAfter?: string;
  fingerprintSha256: string;
  tlsVersion?: string;
  selfSigned?: boolean;
  expired?: boolean;
}
```
Add `tlsCertificates: NormalizedTlsCertificate[]` to `NormalizedOutput`; seed `tlsCertificates: []` in `emptyNormalizedOutput()`.
- [ ] **Step 2:** In `libs/scanner-sdk/src/types.ts`: add `'TlsCertificate'` to `ProducedEntity`.
- [ ] **Step 3:** `pnpm nx test parsers && pnpm nx test scanners-all` → green.
- [ ] **Step 4: Commit** `feat(phase-6.4): tlsCertificates channel + ProducedEntity`.

---

## Task 3: tlsx scanner + tlsx-json parser

- [ ] **Step 1: Scaffold** `libs/scanners/tlsx/` (scanners-tlsx, copy findomain config) + tsconfig.base path.
- [ ] **Step 2: TDD + implement scanner** `libs/scanners/tlsx/src/tlsx.scanner.ts`: name `tlsx`, displayName `tlsx`, category `[ScannerCategory.SSL_TLS]`, image `projectdiscovery/tlsx:latest`, network bridge, readonlyRootfs true, memoryLimitMb 512, cpuQuota 1_000_000, defaultTimeoutMs 300_000, inputSchema `z.object({})`, build → `{ cmd: ['tlsx','-u',target,'-json','-silent','-san','-cn','-so','-ex','-re','-tls-version'], stdin: undefined }` (host as `-u`). outputs `[{format:'JSONL', capture:'stdout', parser:'tlsx-json'}]`, produces `['TlsCertificate','Finding']`. Module + index. Test asserts name/image/outputs/produces + the cmd contains `-u target -json -silent`.
- [ ] **Step 3: TDD + implement `tlsx-json` parser** `libs/parsers/src/tlsx-json/`. Fixture (one JSONL line) e.g.:
```
{"host":"example.com","port":"443","subject_cn":"example.com","subject_an":["example.com","www.example.com"],"issuer_cn":"DigiCert TLS RSA","not_before":"2025-01-01T00:00:00Z","not_after":"2024-01-01T00:00:00Z","fingerprint_hash":{"sha256":"abc123"},"tls_version":"tls10","self_signed":true,"expired":true}
```
Parser (name `tlsx-json`, formats `['JSONL']`): per line (tolerant JSON.parse), push to `out.tlsCertificates` `{host, subjectCn: subject_cn, subjectAn: subject_an, issuerCn: issuer_cn, notBefore: not_before, notAfter: not_after, fingerprintSha256: fingerprint_hash?.sha256 ?? '', tlsVersion: tls_version, selfSigned: !!self_signed, expired: !!expired}` (skip if no host or no sha256). Also push `NormalizedFinding`s (scannerName `'tlsx'`, location host): if `expired` → `{title:'Expired TLS certificate', severity:'MEDIUM'}`; if `self_signed` → `{title:'Self-signed TLS certificate', severity:'LOW'}`; if tls_version is `tls10`/`tls11`/`ssl3` → `{title:'Weak TLS version: <v>', severity:'MEDIUM'}`. Test asserts the cert fields + that the 3 findings are emitted for the fixture. Register parser (4 spots) + index.
- [ ] **Step 4:** Register tlsx in AllScannersModule + spec. `pnpm nx test scanners-tlsx parsers scanners-all` → green.
- [ ] **Step 5: Commit** `feat(phase-6.4): add tlsx scanner + tlsx-json parser`.

---

## Task 4: whatweb scanner + whatweb-json parser (custom image)

- [ ] **Step 1: Dockerfile** `docker/scanners/whatweb/Dockerfile`:
```dockerfile
FROM ruby:3.2-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && git clone --depth 1 https://github.com/urbanadventurer/WhatWeb.git /opt/whatweb \
 && useradd -u 10001 -m scanner
ENV PATH="/opt/whatweb:${PATH}"
USER scanner
WORKDIR /opt/whatweb
ENTRYPOINT []
```
Add `docker build -t autoscanner/whatweb:1.0 "$ROOT/docker/scanners/whatweb"` to build-images.sh + echo.
- [ ] **Step 2: Scaffold** `libs/scanners/whatweb/` (scanners-whatweb) + tsconfig path.
- [ ] **Step 3: TDD + implement scanner**: name `whatweb`, displayName `WhatWeb`, category `[ScannerCategory.WEB_FINGERPRINT]`, image `autoscanner/whatweb:1.0`, network bridge, readonlyRootfs false (whatweb may write temp), memoryLimitMb 512, defaultTimeoutMs 300_000, inputSchema `z.object({})`, build → `{ cmd: ['whatweb','--quiet','--no-errors','--log-json=/dev/stdout', shellSafeTarget] }` — wrap the target so it's a URL: pass `target` directly (whatweb accepts host); to avoid shell issues there's no shell here (exec form, no sh -c) so no escaping needed. outputs `[{format:'JSON', capture:'stdout', parser:'whatweb-json'}]`, produces `['Technology']`. Module + index.
- [ ] **Step 4: TDD + implement `whatweb-json` parser** `libs/parsers/src/whatweb-json/`. whatweb `--log-json` emits a JSON array (or one object per target). Fixture:
```json
[{"target":"https://example.com","plugins":{"nginx":{"version":["1.25"]},"jQuery":{},"HTML5":{}}}]
```
Parser (name `whatweb-json`, formats `['JSON']`): JSON.parse whole body (tolerant); for each entry derive host from `target` (new URL().hostname, fallback to the raw string), for each key in `plugins` push `NormalizedTechnology {assetValue: host, name: pluginName, version: plugins[name].version?.[0]}` to `out.technologies`. Skip the `HTTPServer`/noise? keep all plugins. Test asserts nginx (version 1.25) + jQuery technologies with assetValue example.com. Register (4 spots) + index.
- [ ] **Step 5:** Register whatweb in AllScannersModule + spec. Tests green.
- [ ] **Step 6 (image build best-effort):** skip if no Docker.
- [ ] **Step 7: Commit** `feat(phase-6.4): add whatweb scanner + whatweb-json parser + custom image`.

---

## Task 5: TlsCertificatePersister + parse-job wiring

- [ ] **Step 1: Read** `endpoint-persister.ts` + the parse-job processor endpoint/email wiring (the `ctx` + `$transaction` + `withRetryOnSerializationConflict` pattern).
- [ ] **Step 2: TDD + implement** `apps/parser-worker/src/app/persisters/tls-certificate-persister.ts` — `@Injectable`, `upsert(certs: NormalizedTlsCertificate[], ctx, tx?): Promise<number>`: for each cert, skip if no `fingerprintSha256` or no `host`; resolve `subdomainId` via `subdomain.findFirst({engagementId, canonicalValue: host.toLowerCase()})`; upsert by `engagementId_fingerprintSha256_host` with create/update setting subjectCn/subjectAn(default [])/issuerCn/notBefore(new Date if present)/notAfter/tlsVersion/selfSigned/expired/source=ctx.scannerName, refresh lastSeenAt on update. Return count. Unit test (mocked Prisma): compound key, host-link, ISO→Date conversion, returns count.
- [ ] **Step 3: Wire** into parse-job.processor.ts (inject, call inside a `$transaction` after endpoints/emails, guarded `if (out.tlsCertificates?.length)`); add `tlsCertificatesPersisted` to `ParseJobResult` + return object + log line; add to app.module providers; update the processor spec's result assertion (add `tlsCertificatesPersisted: 0`) + constructor instantiation.
- [ ] **Step 4:** `pnpm nx test parser-worker` → green. **Commit** `feat(phase-6.4): TlsCertificatePersister + wiring`.

---

## Task 6: web-fingerprint template + GraphQL tlsCertificates query

- [ ] **Step 1: TDD + implement** `libs/templates/src/builtins/web-fingerprint.ts`: steps `['httpx','tlsx','whatweb']`; httpx `inputs:{techDetect:{kind:'static',value:true}}` target subdomains; tlsx + whatweb `inputs:{}` target subdomains. Register in builtins/index + bump builtins.spec count.
- [ ] **Step 2: GraphQL `tls` module** (`apps/api-gateway/src/app/tls/`): `TlsCertificateObject {id, engagementId, host, subjectCn?, subjectAn([String!]!), issuerCn?, notBefore?(Date,nullable), notAfter?(Date,nullable), fingerprintSha256, tlsVersion?, selfSigned, expired, source, firstSeenAt, lastSeenAt}`; service with ownership check (copy osint/endpoints) → `tlsCertificates(engagementId)` findMany orderBy lastSeenAt desc; resolver guarded; module in app.module. TDD service (mocked Prisma + ownership-denied).
- [ ] **Step 3:** `pnpm nx test templates api-gateway` → green. **Commit** `feat(phase-6.4): web-fingerprint template + tlsCertificates GraphQL`.

---

## Task 7: Frontend TLS tab

- [ ] **Step 1: Read** the OSINT/endpoints tab + engagement-page tab pattern.
- [ ] **Step 2: TDD + implement** `engagement-tls-tab.tsx`: query `tlsCertificates(engagementId){id host subjectCn issuerCn notAfter tlsVersion selfSigned expired source}`; render a table (host, subject, issuer, expires, TLS version, flags for self-signed/expired). Add gql doc to queries.ts. Wire a "TLS" tab into engagement-page (TabKey+TABS+branch). Test via MockedProvider.
- [ ] **Step 3:** `pnpm nx test frontend && pnpm nx run frontend:type-check` → green. **Commit** `feat(phase-6.4): frontend TLS tab`.

---

## Task 8: e2e + CI + README

- [ ] **Step 1: e2e** `web-fingerprint-e2e.spec.ts` — double opt-in (`E2E_RUN_WEB_FINGERPRINT`, own `E2E_WEB_FINGERPRINT_TIMEOUT_MS` default 600000). Run `web-fingerprint`, assert ≥1 TlsCertificate (new helper `tlsCertificatesByEngagement`) and ≥1 Technology (existing assets-with-tech). Idempotent re-run. Type-check.
- [ ] **Step 2: CI** — `pnpm scanners:build` now builds whatweb; add `docker pull projectdiscovery/tlsx:latest` only if the e2e ran in CI (it's opt-in, so not required). Confirm + document.
- [ ] **Step 3: README** — `### Phase 6.4 — fingerprint / TLS` subsection: tlsx (registry) + whatweb (custom), `TlsCertificate` entity + weak-cert Findings + Technology, the TLS tab, the `web-fingerprint` template.
- [ ] **Step 4: Commit** `test(phase-6.4): web-fingerprint e2e (opt-in) + docs`.

---

## Final verification
```bash
pnpm prisma validate
pnpm nx run-many -t test --projects=scanners-tlsx,scanners-whatweb,scanners-all,parsers,templates,parser-worker,api-gateway,frontend
pnpm nx run-many -t type-check --projects=scanners-tlsx,scanners-whatweb
pnpm lint
```

## Self-Review notes
- **Deviations:** `sslscan`/`testssl.sh` deferred (tlsx covers cert + TLS-version findings). Documented.
- **Reuse:** findings + technologies reuse existing channels/persisters; only TlsCertificate is new.
- **No-local-DB:** migration hand-written; verified via `prisma validate`/`generate`; applied in CI.
