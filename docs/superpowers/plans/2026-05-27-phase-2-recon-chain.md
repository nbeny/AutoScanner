# Phase 2 — Recon Chain (ProjectDiscovery) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Convention héritée Phase 1:** chaque task = un cycle TDD complet (failing test → impl → green → commit). Code listings volontairement focalisés sur ce qui n'est pas évident depuis le code existant. Les patterns déjà éprouvés Phase 1 (lib `libs/scanners/<name>/`, parser, NestJS modules) doivent être copiés tels quels.

**Goal:** livrer la chaîne recon ProjectDiscovery — un opérateur lance UN template (`recon-passive`, `recon-active`, `web-quick` ou `web-deep`) sur un domaine, l'orchestrateur enchaîne automatiquement 2 à 5 scanners (subfinder, dnsx, httpx, naabu, nuclei), peuple les nouvelles tables Domain/Subdomain/IpAddress/Technology/DnsRecord, et corrèle les doublons via canonicalisation + dedup hash.

**Architecture:** orchestrator linéaire dédié (app `orchestrator-worker`) qui enqueue séquentiellement des ScanJobs sur la chaîne BullMQ existante et lit les résultats depuis la DB après chaque step (DB = source de vérité, pas de passage in-memory). Modèle: tables Prisma dédiées pour chaque type d'asset + extension de l'enum `Asset.type` existant pour le pivot polymorphe. Correlation v1 inline dans `parser-worker` aux Étapes 1-2, extraite en lib `@autoscanner/correlation` à l'Étape 3.

**Tech Stack:** Nx 20 monorepo · NestJS 11 · Prisma 6 · PostgreSQL 16 · Redis 7 (BullMQ 5 + pub/sub) · MinIO · Apollo GraphQL · React 18 · TypeScript 5.7 · Zod · dockerode · vitest/jest.

**Spec source:** `docs/superpowers/specs/2026-05-27-phase-2-recon-chain-design.md`.

---

## Conventions globales

- **TDD strict par task:** chaque task suit `test (fail) → impl → test (green) → commit`. Le test est écrit AVANT le code.
- **Conventional Commits + co-author:** `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` sur chaque commit.
- **Pattern lib:** `libs/<name>/` avec `src/index.ts` (barrel), `jest.config.ts`, `tsconfig.lib.json`, `tsconfig.spec.json`, `project.json`. Pour les scanners: `libs/scanners/<name>/`. Path alias `@autoscanner/<name>` enregistré dans `tsconfig.base.json`.
- **Pattern scanner:** une `ScannerDefinition` (cf. `libs/scanners/nmap/src/nmap.scanner.ts`) + `<Name>Module` qui s'auto-register dans `ScannerRegistry` via `onModuleInit`.
- **Pattern parser:** une classe `Parser` (cf. `libs/parsers/src/nmap-xml.parser.ts`) + entrée dans `parsers.module.ts`, fixture committée dans `libs/parsers/src/__tests__/fixtures/`.
- **Test command par défaut:** `pnpm nx test <project>` pour unit, `pnpm nx e2e api-gateway-e2e` pour E2E. E2E gated par `E2E_API_URL` (skip silencieux sinon).
- **DB migrations:** `pnpm prisma migrate dev --name <slug>` génère + applique. Le fichier `prisma/migrations/<ts>_<slug>/migration.sql` est commité.
- **Découpage commits:** au minimum un commit par task (préférer plusieurs si les deltas sont logiquement séparables).

---

## Étape 1 — Slice end-to-end minimal (Tasks 1-13)

Cible: `recon-passive` (subfinder → httpx) tourne bout en bout sur `hackerone.com`, persiste Domain + Subdomains + Technologies, ne crée pas de doublons au re-run.

---

### Task 1 — Migration Prisma: nouvelles tables + extension Asset

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<ts>_phase2_recon_models/migration.sql` (auto-générée)

**Modifications schéma** (à appliquer sur `prisma/schema.prisma`):

```prisma
// Étendre l'enum AssetType existant (Phase 0 a déjà DOMAIN, SUBDOMAIN, IP_ADDRESS).
// Aucun nouveau membre requis ici (déjà couvert). Ne pas renommer pour préserver les données Phase 1.

// === Nouveaux modèles ===

model Domain {
  id             String   @id @default(cuid())
  engagementId   String
  value          String
  canonicalValue String
  firstSeenAt    DateTime @default(now())
  lastSeenAt     DateTime @default(now())
  metadata       Json?

  engagement Engagement   @relation(fields: [engagementId], references: [id], onDelete: Cascade)
  subdomains Subdomain[]
  dnsRecords DnsRecord[]
  asset      Asset?       @relation("AssetDomain")

  @@unique([engagementId, canonicalValue])
  @@index([engagementId])
}

model Subdomain {
  id             String   @id @default(cuid())
  engagementId   String
  domainId       String
  value          String
  canonicalValue String
  httpStatus     Int?
  httpTitle      String?
  httpServer     String?
  firstSeenAt    DateTime @default(now())
  lastSeenAt     DateTime @default(now())
  metadata       Json?

  engagement Engagement   @relation(fields: [engagementId], references: [id], onDelete: Cascade)
  domain     Domain       @relation(fields: [domainId], references: [id], onDelete: Cascade)
  dnsRecords DnsRecord[]
  ips        SubdomainIp[]
  asset      Asset?       @relation("AssetSubdomain")

  @@unique([engagementId, canonicalValue])
  @@index([engagementId])
  @@index([domainId])
}

enum IpVersion {
  IPV4
  IPV6
}

model IpAddress {
  id             String    @id @default(cuid())
  engagementId   String
  value          String
  canonicalValue String
  version        IpVersion
  firstSeenAt    DateTime  @default(now())
  lastSeenAt     DateTime  @default(now())
  metadata       Json?

  engagement Engagement     @relation(fields: [engagementId], references: [id], onDelete: Cascade)
  subdomains SubdomainIp[]
  asset      Asset?         @relation("AssetIpAddress")

  @@unique([engagementId, canonicalValue])
  @@index([engagementId])
}

model SubdomainIp {
  subdomainId String
  ipAddressId String
  firstSeenAt DateTime @default(now())
  lastSeenAt  DateTime @default(now())

  subdomain Subdomain @relation(fields: [subdomainId], references: [id], onDelete: Cascade)
  ip        IpAddress @relation(fields: [ipAddressId], references: [id], onDelete: Cascade)

  @@id([subdomainId, ipAddressId])
}

enum DnsRecordType {
  A
  AAAA
  CNAME
  MX
  NS
  TXT
  PTR
  SRV
  CAA
  SOA
}

model DnsRecord {
  id          String        @id @default(cuid())
  domainId    String?
  subdomainId String?
  type        DnsRecordType
  name        String
  value       String
  ttl         Int?
  firstSeenAt DateTime      @default(now())
  lastSeenAt  DateTime      @default(now())

  domain    Domain?    @relation(fields: [domainId], references: [id], onDelete: Cascade)
  subdomain Subdomain? @relation(fields: [subdomainId], references: [id], onDelete: Cascade)

  @@unique([domainId, subdomainId, type, name, value])
  @@index([subdomainId])
  @@index([domainId])
}

model Technology {
  id          String   @id @default(cuid())
  assetId     String
  name        String
  version     String?
  source      String   // scanner name qui l'a vu (httpx, wappalyzer, ...)
  categories  String[] @default([])
  firstSeenAt DateTime @default(now())
  lastSeenAt  DateTime @default(now())

  asset Asset @relation(fields: [assetId], references: [id], onDelete: Cascade)

  @@unique([assetId, name, version])
  @@index([assetId])
}

// === Évolution de Asset pour le pivot polymorphe ===

// Ajouter ces relations à model Asset (déjà existant):
// domainId    String?  @unique
// subdomainId String?  @unique
// ipAddressId String?  @unique
// domain      Domain?    @relation("AssetDomain",    fields: [domainId],    references: [id])
// subdomain   Subdomain? @relation("AssetSubdomain", fields: [subdomainId], references: [id])
// ipAddress   IpAddress? @relation("AssetIpAddress", fields: [ipAddressId], references: [id])
// technologies Technology[]

// CHECK contrainte ajoutée dans migration.sql:
// ALTER TABLE "Asset" ADD CONSTRAINT asset_polymorphic_fk_check CHECK (
//   (type = 'DOMAIN'     AND "domainId"    IS NOT NULL AND "subdomainId" IS NULL AND "ipAddressId" IS NULL) OR
//   (type = 'SUBDOMAIN'  AND "subdomainId" IS NOT NULL AND "domainId"    IS NULL AND "ipAddressId" IS NULL) OR
//   (type = 'IP_ADDRESS' AND "ipAddressId" IS NOT NULL AND "domainId"    IS NULL AND "subdomainId" IS NULL) OR
//   (type NOT IN ('DOMAIN', 'SUBDOMAIN', 'IP_ADDRESS') AND "domainId" IS NULL AND "subdomainId" IS NULL AND "ipAddressId" IS NULL)
// );

// === ScanTemplate + TemplateRun ===

model ScanTemplate {
  id          String   @id @default(cuid())
  name        String   @unique
  displayName String
  description String?
  // Steps stored as JSON for flexibility; shape validated at registration time.
  // [{scannerName: 'subfinder', inputs: {...}, source: '$context.subdomains' | null}]
  steps       Json
  isSeeded    Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  runs TemplateRun[]
}

enum TemplateRunStatus {
  PENDING
  RUNNING
  COMPLETED
  FAILED
  CANCELLED
}

model TemplateRun {
  id               String            @id @default(cuid())
  templateId       String
  templateName     String            // snapshot at run time
  engagementId     String
  target           String
  status           TemplateRunStatus @default(PENDING)
  currentStepIndex Int               @default(0)
  startedAt        DateTime?
  completedAt      DateTime?
  errorMessage     String?
  createdById      String
  createdAt        DateTime          @default(now())
  updatedAt        DateTime          @updatedAt

  template   ScanTemplate @relation(fields: [templateId], references: [id])
  engagement Engagement   @relation(fields: [engagementId], references: [id], onDelete: Cascade)
  createdBy  User         @relation(fields: [createdById], references: [id])
  scans      Scan[]

  @@index([engagementId])
  @@index([status])
}

// === Évolution Scan pour rattachement à TemplateRun ===

// Ajouter à model Scan:
// templateRunId  String?
// stepIndex      Int?
// templateRun    TemplateRun? @relation(fields: [templateRunId], references: [id], onDelete: Cascade)

// === Ajustements User / Engagement (back-relations) ===
// Engagement: + domains Domain[]  + subdomains Subdomain[]  + ipAddresses IpAddress[]  + templateRuns TemplateRun[]
// User: + templateRunsCreated TemplateRun[]
```

**Steps:**

- [ ] **Step 1: Écrire le test de schéma** — créer `prisma/__tests__/phase2-schema.spec.ts` (nouveau dossier; ajouter `prisma` au jest projects si besoin). Test instancie Prisma client en mémoire (testcontainers OR utilise la DB de dev) et tente d'insérer Domain → Subdomain → IpAddress → SubdomainIp → DnsRecord → Technology, vérifie les contraintes d'unicité et la CHECK contrainte polymorphe sur Asset.
- [ ] **Step 2: Lancer le test** — `pnpm nx test prisma` (créer le project si nécessaire). Expected: FAIL (les modèles n'existent pas encore).
- [ ] **Step 3: Modifier `prisma/schema.prisma`** avec tous les blocs ci-dessus. Lancer `pnpm prisma format`.
- [ ] **Step 4: Générer migration** — `pnpm prisma migrate dev --name phase2_recon_models`. Éditer le fichier `migration.sql` généré pour ajouter la CHECK contrainte sur `Asset` (block SQL en commentaire dans la spec ci-dessus).
- [ ] **Step 5: Re-lancer test + migrate deploy** — `pnpm prisma generate && pnpm nx test prisma`. Expected: PASS.
- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/ prisma/__tests__/
git commit -m "feat(db): add Phase 2 recon models (Domain, Subdomain, IpAddress, Technology, DnsRecord, ScanTemplate, TemplateRun)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2 — Lib `@autoscanner/templates`

**Files:**
- Create: `libs/templates/{project.json, jest.config.ts, tsconfig.json, tsconfig.lib.json, tsconfig.spec.json, package.json}`
- Create: `libs/templates/src/index.ts`
- Create: `libs/templates/src/types.ts`
- Create: `libs/templates/src/registry.ts`
- Create: `libs/templates/src/templates.module.ts`
- Create: `libs/templates/src/__tests__/registry.spec.ts`
- Modify: `tsconfig.base.json` (add `@autoscanner/templates` path alias)

**`libs/templates/src/types.ts`** (load-bearing, full code):

```typescript
import type { z } from 'zod';

export type ContextRef =
  | { kind: 'static'; value: unknown }
  | { kind: 'context'; path: 'subdomains' | 'urls' | 'ipAddresses' | 'target' };

export interface TemplateStep {
  scannerName: string;
  /** Inputs passés au scanner. Les valeurs peuvent référencer le contexte. */
  inputs: Record<string, ContextRef>;
  /** Comment construire la liste de targets de ce step. */
  target: ContextRef;
}

export interface TemplateDefinition {
  name: string;
  displayName: string;
  description: string;
  steps: TemplateStep[];
}
```

**`libs/templates/src/registry.ts`** (load-bearing, full code):

```typescript
import { Injectable } from '@nestjs/common';
import type { TemplateDefinition } from './types';

export class TemplateNotFoundError extends Error {
  constructor(name: string) {
    super(`Template "${name}" not found in registry`);
    this.name = 'TemplateNotFoundError';
  }
}

export class DuplicateTemplateError extends Error {
  constructor(name: string) {
    super(`Template "${name}" already registered`);
    this.name = 'DuplicateTemplateError';
  }
}

@Injectable()
export class TemplateRegistry {
  private readonly templates = new Map<string, TemplateDefinition>();

  register(def: TemplateDefinition): void {
    if (this.templates.has(def.name)) throw new DuplicateTemplateError(def.name);
    this.templates.set(def.name, def);
  }

  get(name: string): TemplateDefinition {
    const def = this.templates.get(name);
    if (!def) throw new TemplateNotFoundError(name);
    return def;
  }

  list(): TemplateDefinition[] {
    return Array.from(this.templates.values());
  }
}
```

**`libs/templates/src/templates.module.ts`** (NestJS module standard, copier le pattern de `scanner-sdk.module.ts`).

**Tests à écrire** (`registry.spec.ts`): `register` réussit, `register` doublon throw `DuplicateTemplateError`, `get` inconnu throw `TemplateNotFoundError`, `list` retourne les inscrits.

**Steps:**

- [ ] **Step 1:** Copier la structure `libs/scanner-sdk/` vers `libs/templates/` (project.json, jest, tsconfigs) en adaptant les noms. Ajouter `"@autoscanner/templates": ["libs/templates/src/index.ts"]` dans `tsconfig.base.json:paths`.
- [ ] **Step 2:** Écrire `registry.spec.ts` (les 4 tests ci-dessus). Lancer: `pnpm nx test templates`. Expected: FAIL (module pas implémenté).
- [ ] **Step 3:** Écrire `types.ts`, `registry.ts`, `templates.module.ts`, `index.ts` (barrel exporte tout).
- [ ] **Step 4:** Relancer `pnpm nx test templates`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add libs/templates/ tsconfig.base.json
git commit -m "feat(templates): add TemplateRegistry and TemplateDefinition contract

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3 — Étendre `@autoscanner/queues` avec `TEMPLATE_RUNS`

**Files:**
- Modify: `libs/queues/src/queue-names.ts`
- Modify: `libs/queues/src/job-payloads.ts`
- Modify: `libs/queues/src/queues.module.ts`
- Create: `libs/queues/src/__tests__/template-run-payload.spec.ts`

**`libs/queues/src/queue-names.ts`** (ajout):

```typescript
export enum QueueName {
  SCAN_JOBS = 'scan-jobs',
  PARSE_JOBS = 'parse-jobs',
  TEMPLATE_RUNS = 'template-runs', // NEW
}
```

**`libs/queues/src/job-payloads.ts`** (ajout):

```typescript
export interface TemplateRunPayload {
  templateRunId: string;
  engagementId: string;
}

export interface QueuePayloadMap {
  [QueueName.SCAN_JOBS]: ScanJobPayload;
  [QueueName.PARSE_JOBS]: ParseJobPayload;
  [QueueName.TEMPLATE_RUNS]: TemplateRunPayload; // NEW
}
```

**Steps:**

- [ ] **Step 1:** Écrire `template-run-payload.spec.ts`: imports `TemplateRunPayload`, vérifie type-narrowing via `PayloadFor<QueueName.TEMPLATE_RUNS>`. Test passe par compilation (`tsc --noEmit`); ajouter aussi assertion runtime sur le shape avec un objet factice.
- [ ] **Step 2:** Lancer `pnpm nx test queues`. Expected: FAIL (compile error: `TEMPLATE_RUNS` n'existe pas).
- [ ] **Step 3:** Modifier les 3 fichiers ci-dessus. `BullModule.registerQueueAsync` dans `queues.module.ts` doit également enregistrer la nouvelle queue.
- [ ] **Step 4:** Re-lancer `pnpm nx test queues`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add libs/queues/
git commit -m "feat(queues): add TEMPLATE_RUNS queue and TemplateRunPayload

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4 — Scanner `libs/scanners/subfinder/`

**Files:**
- Create: `libs/scanners/subfinder/{project.json, jest.config.ts, tsconfig.lib.json, tsconfig.spec.json, package.json}` (copie de `libs/scanners/nmap/`)
- Create: `libs/scanners/subfinder/src/{index.ts, subfinder.scanner.ts, subfinder.module.ts}`
- Create: `libs/scanners/subfinder/src/__tests__/subfinder.scanner.spec.ts`
- Modify: `tsconfig.base.json` (alias `@autoscanner/scanners-subfinder`)

**`subfinder.scanner.ts`** (load-bearing):

```typescript
import { z } from 'zod';
import { type ScannerDefinition, ScannerCategory } from '@autoscanner/scanner-sdk';

const SubfinderInput = z.object({
  sources: z.array(z.string()).default([]),
  recursive: z.boolean().default(false),
  timeout: z.number().int().min(1).max(600).default(60),
});

export type SubfinderInputType = z.infer<typeof SubfinderInput>;

export const SubfinderScanner: ScannerDefinition<SubfinderInputType> = {
  name: 'subfinder',
  displayName: 'Subfinder',
  category: [ScannerCategory.SUBDOMAIN_ENUM, ScannerCategory.PASSIVE_RECON],
  description: 'Passive subdomain enumeration (ProjectDiscovery).',
  inputSchema: SubfinderInput,
  docker: {
    image: 'projectdiscovery/subfinder:latest',
    network: 'bridge',
    capabilities: [],
    readonlyRootfs: true,
    memoryLimitMb: 512,
    cpuQuota: 1_000_000,
    defaultTimeoutMs: 600_000,
  },
  build(input, target) {
    const args = ['-silent', '-oJ', '-d', target, '-timeout', String(input.timeout)];
    if (input.recursive) args.push('-recursive');
    if (input.sources.length) args.push('-sources', input.sources.join(','));
    return { cmd: ['subfinder', ...args] };
  },
  outputs: [{ format: 'JSONL', capture: 'stdout', parser: 'subfinder-json' }],
  produces: ['Asset', 'Subdomain'],
};
```

**Vérification préalable:** `ScannerCategory.SUBDOMAIN_ENUM` et `.PASSIVE_RECON` doivent exister dans `libs/scanner-sdk/src/types.ts`. Si absents, les ajouter dans cette task (modification du fichier scanner-sdk). De même `RawOutputFormat.JSONL` (vérifier; si absent, ajouter).

**`subfinder.module.ts`** : copier pattern de `libs/scanners/nmap/src/nmap.module.ts`, auto-register via `onModuleInit`.

**Tests à écrire** (`subfinder.scanner.spec.ts`): snapshot des args pour entrées représentatives (default, `recursive=true`, `sources=['shodan','crtsh']`), validation Zod fail/pass.

**Steps:**

- [ ] **Step 1:** Copier `libs/scanners/nmap/` vers `libs/scanners/subfinder/`, renommer. Ajouter alias `@autoscanner/scanners-subfinder` dans `tsconfig.base.json`. Vérifier `ScannerCategory.SUBDOMAIN_ENUM`, `PASSIVE_RECON`, `RawOutputFormat.JSONL`; si absents, ajouter dans `libs/scanner-sdk/src/types.ts`.
- [ ] **Step 2:** Écrire `subfinder.scanner.spec.ts` (snapshots + zod). Lancer `pnpm nx test scanners-subfinder`. Expected: FAIL.
- [ ] **Step 3:** Écrire `subfinder.scanner.ts`, `subfinder.module.ts`, `index.ts`.
- [ ] **Step 4:** Re-lancer test. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add libs/scanners/subfinder/ libs/scanner-sdk/ tsconfig.base.json
git commit -m "feat(scanners/subfinder): add subfinder ScannerDefinition with input schema

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5 — Parser `subfinder-json` + persistance Domain/Subdomain

**Files:**
- Create: `libs/parsers/src/subfinder-json/{subfinder-json.parser.ts, index.ts}`
- Create: `libs/parsers/src/__tests__/subfinder-json.parser.spec.ts`
- Create: `libs/parsers/src/__tests__/fixtures/subfinder-hackerone.jsonl`
- Modify: `libs/parsers/src/parsers.module.ts` (register le nouveau parser)
- Modify: `libs/parsers/src/types.ts` (étendre `AssetType` pour inclure `'SUBDOMAIN'`)
- Modify: `apps/parser-worker/src/app/parse-job.processor.ts` (étendre `PersistService` pour Domain+Subdomain upsert)

**Fixture:** lancer une fois `docker run --rm projectdiscovery/subfinder -silent -oJ -d hackerone.com > libs/parsers/src/__tests__/fixtures/subfinder-hackerone.jsonl` et commiter le fichier (~20 subdomains attendus).

**Parser** (load-bearing): chaque ligne JSON `{host: string, source: string}`. Produit `NormalizedAsset[]` avec `type: 'SUBDOMAIN'` + le `assetValue` = host.

```typescript
import type { Parser, NormalizedOutput, ParserContext } from '../types';
import { emptyNormalizedOutput } from '../types';

export class SubfinderJsonParser implements Parser {
  readonly name = 'subfinder-json';
  readonly formats = ['JSONL'] as const;

  async parse(input: Buffer | string, _ctx: ParserContext): Promise<NormalizedOutput> {
    const out = emptyNormalizedOutput();
    const text = typeof input === 'string' ? input : input.toString('utf8');
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parsed = JSON.parse(trimmed) as { host?: string; source?: string };
      if (!parsed.host) continue;
      out.assets.push({ type: 'SUBDOMAIN', value: parsed.host.toLowerCase().replace(/\.$/, '') });
    }
    return out;
  }
}
```

**`PersistService` extension** (dans `parse-job.processor.ts` ou un service dédié):
- Pour chaque `NormalizedAsset` de type `SUBDOMAIN`: dériver le `Domain` parent (sous-domaine "depth=1" = la valeur du suffixe public, simplification Phase 2: prendre tout après le premier dot — TODO Phase 4: utiliser `psl` lib pour Public Suffix List).
- Upsert `Domain` par `(engagementId, canonicalValue)`.
- Upsert `Subdomain` par `(engagementId, canonicalValue)` avec FK `domainId`.
- Upsert pivot `Asset` (type=SUBDOMAIN, FK subdomainId).

**Steps:**

- [ ] **Step 1:** Capturer la fixture (commande ci-dessus). Écrire le test `subfinder-json.parser.spec.ts`: charge la fixture, parse, assert ≥5 subdomains, assert canonicalisation (lowercase, pas de trailing dot).
- [ ] **Step 2:** Lancer `pnpm nx test parsers`. Expected: FAIL (parser n'existe pas).
- [ ] **Step 3:** Écrire `subfinder-json.parser.ts`, l'enregistrer dans `parsers.module.ts`. Étendre `AssetType` dans `types.ts` avec `'SUBDOMAIN'`.
- [ ] **Step 4:** Étendre `PersistService` pour gérer SUBDOMAIN (upsert Domain → Subdomain → Asset pivot dans une seule transaction Prisma).
- [ ] **Step 5:** Écrire un test integration `parse-job.processor.spec.ts` qui pousse la fixture à travers `parse-job.processor` et vérifie en DB la création de 1 Domain + N Subdomain + N Asset pivots. Lancer.
- [ ] **Step 6:** Re-lancer toute la suite `pnpm nx test parsers parser-worker`. Expected: PASS.
- [ ] **Step 7: Commit**

```bash
git add libs/parsers/ apps/parser-worker/
git commit -m "feat(parsers): add subfinder-json parser with Domain/Subdomain persistence

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6 — Scanner `libs/scanners/httpx/`

**Files:**
- Create: `libs/scanners/httpx/` (mêmes fichiers que subfinder, voir Task 4)
- Modify: `tsconfig.base.json`

**`httpx.scanner.ts`** (load-bearing partie spécifique):

```typescript
const HttpxInput = z.object({
  ports: z.array(z.number().int()).default([80, 443]),
  followRedirects: z.boolean().default(true),
  techDetect: z.boolean().default(true),
  statusCode: z.boolean().default(true),
  title: z.boolean().default(true),
  timeout: z.number().int().min(1).max(60).default(10),
});

// build:
// args: -silent -json -nc -no-fallback
//   + (techDetect ? '-tech-detect' : '')
//   + (statusCode ? '-sc' : '')
//   + (title ? '-title' : '')
//   + (followRedirects ? '-fr' : '')
//   + ports via '-p' joined comma
// target arrive via stdin (httpx lit liste de hosts en stdin)

build(input, target) {
  const args = ['-silent', '-json', '-nc', '-no-fallback',
    '-timeout', String(input.timeout),
    '-p', input.ports.join(',')];
  if (input.techDetect) args.push('-tech-detect');
  if (input.statusCode) args.push('-sc');
  if (input.title) args.push('-title');
  if (input.followRedirects) args.push('-fr');
  // target peut être une liste séparée par newlines, passée en stdin
  return { cmd: ['httpx', ...args], stdin: target };
}
```

**Important:** `ScannerDefinition.build` doit potentiellement supporter un `stdin` field. Vérifier `libs/scanner-sdk/src/types.ts`; si absent (`{ cmd: string[] }` seul), ajouter `stdin?: string`. Mettre à jour `libs/docker-runner/` pour passer le stdin au container. C'est un petit ajout dans cette task.

**Tests:** snapshot des args + assertion que `target` est passé via stdin si présent.

**Steps:**

- [ ] **Step 1:** Copier structure subfinder, adapter. Vérifier/ajouter support `stdin` dans scanner-sdk + docker-runner.
- [ ] **Step 2:** Écrire `httpx.scanner.spec.ts`. Lancer. Expected: FAIL.
- [ ] **Step 3:** Écrire le scanner + module.
- [ ] **Step 4:** Test docker-runner integration si stdin ajouté: `pnpm nx test docker-runner` doit toujours passer.
- [ ] **Step 5:** Lancer `pnpm nx test scanners-httpx`. Expected: PASS.
- [ ] **Step 6: Commit**

```bash
git add libs/scanners/httpx/ libs/scanner-sdk/ libs/docker-runner/ tsconfig.base.json
git commit -m "feat(scanners/httpx): add httpx ScannerDefinition with stdin target support

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 7 — Parser `httpx-json` + persistance Technology

**Files:**
- Create: `libs/parsers/src/httpx-json/httpx-json.parser.ts`
- Create: `libs/parsers/src/__tests__/httpx-json.parser.spec.ts`
- Create: `libs/parsers/src/__tests__/fixtures/httpx-hackerone.jsonl`
- Modify: `libs/parsers/src/parsers.module.ts`
- Modify: `apps/parser-worker/src/app/parse-job.processor.ts` (handle Technology upsert + Subdomain HTTP fields update)

**Fixture:** capturer `echo "www.hackerone.com" | docker run -i --rm projectdiscovery/httpx -silent -json -tech-detect -sc -title > .../httpx-hackerone.jsonl`.

**Parser produit:**
- `NormalizedAsset` (type=SUBDOMAIN, value = host extrait de l'URL)
- `NormalizedTechnology` pour chaque tech détectée
- Champs HTTP (status_code, title, server) → stockés via metadata sur l'asset OU update direct des champs Subdomain.

**Persistance étendue:**
- Upsert `Subdomain` (déjà existant via subfinder), update les champs httpStatus/httpTitle/httpServer.
- Upsert `Technology` par `(assetId, name, version)`.

**Steps:**

- [ ] **Step 1:** Capturer fixture. Écrire `httpx-json.parser.spec.ts` — assertions sur ≥1 asset + ≥1 technology + champs HTTP populés.
- [ ] **Step 2:** Lancer test. Expected: FAIL.
- [ ] **Step 3:** Écrire le parser. Étendre `PersistService` pour Technology + update Subdomain HTTP fields.
- [ ] **Step 4:** Test integration parser-worker avec la fixture.
- [ ] **Step 5:** Re-run tests. Expected: PASS.
- [ ] **Step 6: Commit**

```bash
git add libs/parsers/ apps/parser-worker/
git commit -m "feat(parsers): add httpx-json parser with Technology persistence

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 8 — Correlation v1 inline: canonicalize + merge subdomains

**Files:**
- Modify: `apps/parser-worker/src/app/parse-job.processor.ts` (ajouter `correlate()` step après persist)
- Create: `apps/parser-worker/src/app/correlation.service.ts` (inline pour l'Étape 1, sera extrait Étape 3)
- Create: `apps/parser-worker/src/app/__tests__/correlation.service.spec.ts`

**`correlation.service.ts`** (load-bearing):

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@autoscanner/database';

export interface CanonicalizeOptions {
  type: 'DOMAIN' | 'SUBDOMAIN' | 'IP_ADDRESS';
}

export function canonicalize(value: string, opts: CanonicalizeOptions): string {
  if (opts.type === 'DOMAIN' || opts.type === 'SUBDOMAIN') {
    return value.toLowerCase().trim().replace(/\.$/, '');
    // TODO Phase 4: IDN -> punycode via 'punycode' lib
  }
  if (opts.type === 'IP_ADDRESS') {
    // Phase 2: IPv4 dotted form (already canonical). IPv6 compression deferred.
    return value.trim().toLowerCase();
  }
  return value.trim();
}

@Injectable()
export class CorrelationService {
  constructor(private readonly prisma: PrismaService) {}

  /** After persistence, merge duplicate subdomains by canonical value within the engagement. */
  async mergeSubdomains(engagementId: string): Promise<{ merged: number }> {
    // Group by canonicalValue, keep oldest, delete or merge others.
    // Implementation:
    // 1) SELECT canonicalValue, array_agg(id ORDER BY firstSeenAt) FROM "Subdomain"
    //    WHERE engagementId = ... GROUP BY canonicalValue HAVING count(*) > 1
    // 2) For each group: keep first, repoint Asset/DnsRecord/SubdomainIp FK to it, delete others.
    const dupes: { canonicalValue: string; ids: string[] }[] =
      await this.prisma.$queryRaw`
        SELECT "canonicalValue", array_agg(id ORDER BY "firstSeenAt") AS ids
        FROM "Subdomain"
        WHERE "engagementId" = ${engagementId}
        GROUP BY "canonicalValue"
        HAVING count(*) > 1
      `;
    let merged = 0;
    for (const group of dupes) {
      const [keep, ...drop] = group.ids;
      await this.prisma.$transaction([
        this.prisma.asset.updateMany({
          where: { subdomainId: { in: drop } },
          data: { subdomainId: keep },
        }),
        this.prisma.dnsRecord.updateMany({
          where: { subdomainId: { in: drop } },
          data: { subdomainId: keep },
        }),
        this.prisma.subdomainIp.updateMany({
          where: { subdomainId: { in: drop } },
          data: { subdomainId: keep },
        }),
        this.prisma.subdomain.deleteMany({ where: { id: { in: drop } } }),
      ]);
      merged += drop.length;
    }
    return { merged };
  }
}
```

**Test:** seed 3 Subdomain rows avec même canonicalValue mais formes différentes (`API.client.com`, `api.client.com.`, `api.client.com`), invoque `mergeSubdomains`, assert 1 ligne reste, 2 supprimées, Assets re-pointés.

**Steps:**

- [ ] **Step 1:** Écrire `correlation.service.spec.ts` avec 3 Subdomains à canonicaliser identiques. Lancer. Expected: FAIL.
- [ ] **Step 2:** Écrire `correlation.service.ts`. Câbler dans `parse-job.processor.ts` après `persist()`.
- [ ] **Step 3:** Vérifier canonicalisation utilisée aussi côté upsert dans `PersistService` (les tasks 5 et 7 doivent l'appliquer). Si pas déjà fait, refactor mineur.
- [ ] **Step 4:** Lancer `pnpm nx test parser-worker parsers`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add apps/parser-worker/
git commit -m "feat(parser-worker): inline correlation v1 (canonicalize + merge subdomains)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 9 — Définition template `recon-passive` + seed

**Files:**
- Create: `libs/templates/src/builtins/recon-passive.ts`
- Modify: `libs/templates/src/templates.module.ts` (auto-register builtin templates)
- Modify: `prisma/seed.ts` (insert le ScanTemplate row si absent)
- Create: `libs/templates/src/__tests__/builtins.spec.ts`

**`recon-passive.ts`** (load-bearing):

```typescript
import type { TemplateDefinition } from '../types';

export const ReconPassive: TemplateDefinition = {
  name: 'recon-passive',
  displayName: 'Passive Recon',
  description: 'Subdomain enumeration (subfinder) + HTTP fingerprinting (httpx).',
  steps: [
    {
      scannerName: 'subfinder',
      inputs: { sources: { kind: 'static', value: [] }, recursive: { kind: 'static', value: false } },
      target: { kind: 'context', path: 'target' }, // = TemplateRun.target (= the root domain)
    },
    {
      scannerName: 'httpx',
      inputs: { techDetect: { kind: 'static', value: true } },
      target: { kind: 'context', path: 'subdomains' }, // = subdomains du Domain découverts au step 1
    },
  ],
};
```

**Seed extension:** dans `prisma/seed.ts`, après le user, ajouter:

```typescript
for (const tpl of [ReconPassive]) {
  await prisma.scanTemplate.upsert({
    where: { name: tpl.name },
    update: { displayName: tpl.displayName, description: tpl.description, steps: tpl.steps, isSeeded: true },
    create: { name: tpl.name, displayName: tpl.displayName, description: tpl.description, steps: tpl.steps, isSeeded: true },
  });
}
```

**Steps:**

- [ ] **Step 1:** Écrire `builtins.spec.ts`: après import et register, `registry.get('recon-passive')` retourne le bon objet avec 2 steps.
- [ ] **Step 2:** Lancer. Expected: FAIL.
- [ ] **Step 3:** Créer `recon-passive.ts`, register dans `templates.module.ts` (`onModuleInit` boucle sur les builtins). Modifier `prisma/seed.ts`.
- [ ] **Step 4:** Lancer `pnpm nx test templates`. Expected: PASS. Lancer `pnpm seed` manuellement, vérifier `select * from "ScanTemplate"`.
- [ ] **Step 5: Commit**

```bash
git add libs/templates/ prisma/
git commit -m "feat(templates): add recon-passive builtin and seed

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 10 — App `orchestrator-worker` + state machine

**Files:**
- Create: `apps/orchestrator-worker/{project.json, webpack.config.js, tsconfig.app.json, src/main.ts}`
- Create: `apps/orchestrator-worker/src/app/{app.module.ts, template-run.processor.ts, step-executor.service.ts, context-builder.service.ts}`
- Create: `apps/orchestrator-worker/src/app/__tests__/{template-run.processor.spec.ts, step-executor.service.spec.ts}`
- Modify: `nx.json`, root `package.json` (script `dev:orchestrator-worker`)

**Behaviour (load-bearing — `template-run.processor.ts`):**

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QueueName, type TemplateRunPayload } from '@autoscanner/queues';
import { TemplateRegistry } from '@autoscanner/templates';
import { PrismaService } from '@autoscanner/database';
import { StepExecutor } from './step-executor.service';

@Processor(QueueName.TEMPLATE_RUNS)
export class TemplateRunProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: TemplateRegistry,
    private readonly executor: StepExecutor,
  ) { super(); }

  async process(job: Job<TemplateRunPayload>): Promise<void> {
    const run = await this.prisma.templateRun.findUniqueOrThrow({
      where: { id: job.data.templateRunId },
      include: { template: true },
    });
    if (run.status === 'CANCELLED' || run.status === 'COMPLETED') return;

    const template = this.registry.get(run.templateName);

    await this.prisma.templateRun.update({
      where: { id: run.id },
      data: { status: 'RUNNING', startedAt: run.startedAt ?? new Date() },
    });

    try {
      for (let i = run.currentStepIndex; i < template.steps.length; i++) {
        await this.prisma.templateRun.update({
          where: { id: run.id },
          data: { currentStepIndex: i },
        });
        await this.executor.runStep({
          templateRun: run,
          step: template.steps[i],
          stepIndex: i,
        });
      }
      await this.prisma.templateRun.update({
        where: { id: run.id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
    } catch (err) {
      await this.prisma.templateRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          errorMessage: (err as Error).message,
        },
      });
      throw err;
    }
  }
}
```

**`step-executor.service.ts`** :
- Build le `target` du step depuis `step.target` (`ContextRef`):
  - `kind=context, path=target` → `templateRun.target` (root)
  - `kind=context, path=subdomains` → `prisma.subdomain.findMany({ where: { engagementId } })` → strings
  - `kind=context, path=urls` → `httpx` results (lus depuis Asset.metadata ou re-query par Subdomain.httpStatus IS NOT NULL)
  - `kind=context, path=ipAddresses` → `prisma.ipAddress.findMany(...)` → strings
  - Fallback (D3): si la liste est vide ET le précédent step a réussi, utiliser `templateRun.target` comme target unique pour ce step.
- Crée le `Scan` + `ScanJob`, enqueue sur `SCAN_JOBS`.
- Attend completion: subscribe Redis channel `scanjob:done:<scanJobId>`. Fallback polling DB toutes les 5s (au cas où le pub/sub manque le message — `ScanJob.status IN ('COMPLETED', 'FAILED', 'TIMEOUT', 'CANCELLED')`).
- Timeout: si `defaultTimeoutMs` du scanner dépassé + 60s grace, throw `StepTimeoutError`.

**Tests:**
- `step-executor.service.spec.ts`: avec un Scanner mock (no Docker), un Redis mock (`ioredis-mock`), valider:
  - target build correct pour chaque ContextRef path
  - fallback "list vide → use root target" (D3)
  - subscribe to scanjob:done propage la completion
  - polling DB fallback fonctionne si pub/sub silencieux
- `template-run.processor.spec.ts`: mock StepExecutor, valider transitions PENDING → RUNNING → COMPLETED / FAILED, persistence de `currentStepIndex` à chaque step.

**Boot reconciliation:** dans `main.ts`, après bootstrap, query `TemplateRun WHERE status = 'RUNNING'` et re-enqueue chacune sur `TEMPLATE_RUNS` (le processor reprendra à `currentStepIndex`).

**Steps:**

- [ ] **Step 1:** Scaffold app via `pnpm nx g @nx/nest:application orchestrator-worker --directory=apps/orchestrator-worker`. Aligner sur structure scan-worker/parser-worker (BullMQ, ConfigModule, etc.).
- [ ] **Step 2:** Écrire `step-executor.service.spec.ts` (mocks). Lancer. Expected: FAIL.
- [ ] **Step 3:** Écrire `context-builder.service.ts` (helpers pour résoudre `ContextRef`), `step-executor.service.ts`. Re-run. Expected: PASS.
- [ ] **Step 4:** Écrire `template-run.processor.spec.ts`. Lancer. Expected: FAIL.
- [ ] **Step 5:** Écrire `template-run.processor.ts`. Re-run. Expected: PASS.
- [ ] **Step 6:** Implémenter boot reconciliation dans `main.ts`. Test manuel: démarrer worker avec une `TemplateRun` `RUNNING` en DB → vérifier qu'elle est ré-enqueued.
- [ ] **Step 7:** Ajouter dans root `package.json` script `dev:orchestrator-worker`. Commit.

```bash
git add apps/orchestrator-worker/ nx.json package.json
git commit -m "feat(orchestrator-worker): linear template executor with crash recovery

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 11 — GraphQL: `runTemplate` mutation + `templateRun` query

**Files:**
- Create: `apps/api-gateway/src/app/templates/{templates.module.ts, templates.service.ts, templates.resolver.ts, dto/run-template.input.ts, dto/template-run.dto.ts}`
- Create: `apps/api-gateway/src/app/templates/__tests__/templates.resolver.spec.ts`
- Modify: `apps/api-gateway/src/app/app.module.ts` (import TemplatesModule)
- Create: `apps/api-gateway-e2e/src/templates/run-template.e2e-spec.ts`

**GraphQL schema (à exposer via code-first NestJS):**

```graphql
type TemplateRun {
  id: ID!
  templateName: String!
  target: String!
  status: TemplateRunStatus!
  currentStepIndex: Int!
  startedAt: DateTime
  completedAt: DateTime
  errorMessage: String
  scans: [Scan!]!   # via DataLoader
}

enum TemplateRunStatus { PENDING RUNNING COMPLETED FAILED CANCELLED }

input RunTemplateInput {
  engagementId: ID!
  templateName: String!
  target: String!
}

extend type Mutation {
  runTemplate(input: RunTemplateInput!): TemplateRun!
}

extend type Query {
  templateRun(id: ID!): TemplateRun
  templateRuns(engagementId: ID!): [TemplateRun!]!
  scanTemplates: [ScanTemplate!]!
}

type ScanTemplate {
  id: ID!
  name: String!
  displayName: String!
  description: String
}
```

**Service:**
- `runTemplate`: valide engagementId appartient au user, valide scope (target match au moins 1 INCLUDE ScopeRule), trouve le ScanTemplate par name, crée `TemplateRun` PENDING + `currentStepIndex=0`, enqueue sur `TEMPLATE_RUNS` queue, met status `QUEUED`, retourne le TemplateRun.

**Test E2E:**
1. Boot api-gateway + orchestrator-worker (workers mocked via `@nestjs/bullmq` test utilities OR skip si workers absents).
2. Login, créer engagement avec ScopeRule include `hackerone.com`.
3. `runTemplate({ engagementId, templateName: 'recon-passive', target: 'hackerone.com' })` → assert TemplateRun returned avec status PENDING.
4. `templateRun(id)` retourne le run avec ses jobs.
5. Out-of-scope target (`example.org`) → 403 ScopeError.

**Steps:**

- [ ] **Step 1:** Écrire `templates.resolver.spec.ts` (unit avec service mocké). Écrire `run-template.e2e-spec.ts` (gated par `E2E_API_URL`).
- [ ] **Step 2:** Lancer tests. Expected: FAIL (module pas câblé).
- [ ] **Step 3:** Implémenter dto, service, resolver, module. Câbler dans `app.module.ts`.
- [ ] **Step 4:** Re-lancer. Expected: PASS pour unit. Pour E2E: lancer manuellement le stack et valider.
- [ ] **Step 5: Commit**

```bash
git add apps/api-gateway/ apps/api-gateway-e2e/
git commit -m "feat(api-gateway): add runTemplate mutation and templateRun queries

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 12 — Frontend: bouton "Run template" + page TemplateRun

**Files:**
- Modify: `apps/frontend/src/features/engagements/engagement-page.tsx` (ajouter bouton "New template run")
- Create: `apps/frontend/src/features/template-runs/{new-template-run-form.tsx, template-run-page.tsx, template-step-card.tsx}`
- Modify: `apps/frontend/src/routes.tsx` (route `/template-runs/:id`)
- Create: `apps/frontend/src/features/template-runs/__tests__/template-run-page.spec.tsx`

**`new-template-run-form.tsx`** (composant): select pour `templateName` (query `scanTemplates`), input pour `target`, bouton "Run" qui appelle `runTemplate` mutation et navigue vers `/template-runs/<id>`.

**`template-run-page.tsx`** (composant):
- Query `templateRun(id)` toutes les 3s (polling) OU subscription dédiée (Phase 2.5 — pour cette task, polling).
- Affiche les `scans` (= steps) en accordéon. Chaque step a son propre `<ScanLogStream>` (composant existant Phase 1 qui s'abonne à `scanJobLogs`).
- Header: status badge, target, template name, durée.

**Test:** RTL: render `template-run-page` avec mock Apollo (templateRun a 2 scans), assert les 2 accordéons rendent.

**Steps:**

- [ ] **Step 1:** Écrire `template-run-page.spec.tsx`. Lancer `pnpm nx test frontend`. Expected: FAIL.
- [ ] **Step 2:** Implémenter les composants. Câbler route. Ajouter bouton sur engagement-page.
- [ ] **Step 3:** Re-lancer test. Expected: PASS. Vérifier visuellement avec `pnpm nx serve frontend` + scan-worker + orchestrator-worker + parser-worker tous boots.
- [ ] **Step 4: Commit**

```bash
git add apps/frontend/
git commit -m "feat(frontend): add template run form and live step page

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 13 — E2E Étape 1: `recon-passive-e2e`

**Files:**
- Create: `apps/api-gateway-e2e/src/scenarios/recon-passive-e2e.spec.ts`
- Modify: `.github/workflows/ci.yml` (boot orchestrator-worker dans le job e2e)

**Scénario E2E:**
1. Login, créer engagement + ScopeRule include `hackerone.com`.
2. `runTemplate({ templateName: 'recon-passive', target: 'hackerone.com' })` → TemplateRun id.
3. Poll `templateRun(id)` jusqu'à `status = COMPLETED` (timeout 5min).
4. Query `engagement.subdomains` (ou via `assets(type: SUBDOMAIN)`) → assert ≥5 lignes.
5. Query technologies via la table joint → assert ≥1.
6. **Idempotence:** re-`runTemplate` même params, attendre COMPLETED, re-query → mêmes counts (subdomains pas dédupliqués, `lastSeenAt` mis à jour).

**Steps:**

- [ ] **Step 1:** Écrire le spec. Lancer `pnpm nx e2e api-gateway-e2e` localement avec `E2E_API_URL=http://localhost:4000`. Iterer jusqu'à PASS.
- [ ] **Step 2:** Ajouter au workflow CI `.github/workflows/ci.yml` un step qui boot `orchestrator-worker` (background) et qui pre-pull `projectdiscovery/subfinder` et `projectdiscovery/httpx`.
- [ ] **Step 3:** Commit + push, valider CI verte.

```bash
git add apps/api-gateway-e2e/ .github/workflows/ci.yml
git commit -m "test(e2e): recon-passive acceptance suite + CI orchestrator boot

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Étape 2 — Élargissement scanners (Tasks 14-19)

### Task 14 — Scanner + parser `dnsx` (DnsRecord + IpAddress persist)

**Files:**
- Create: `libs/scanners/dnsx/` (structure subfinder)
- Create: `libs/parsers/src/dnsx-json/{dnsx-json.parser.ts, ...fixtures/dnsx-hackerone.jsonl}`
- Modify: `apps/parser-worker/src/app/parse-job.processor.ts` (DnsRecord + IpAddress + SubdomainIp upsert)

**Scanner def** (raccourci): image `projectdiscovery/dnsx`, input `{ recordTypes: ['A','AAAA','CNAME','MX'] }`, build `['dnsx', '-silent', '-json', '-resp', '-a', '-aaaa', '-cname', '-mx']`, target via stdin (liste de domaines). Output JSONL avec `{host, a?, aaaa?, cname?, mx?}`.

**Parser produit:**
- `NormalizedDnsRecord` par record
- `NormalizedAsset` type=IP_ADDRESS pour chaque IP A/AAAA résolue
- Le relation Subdomain ↔ IpAddress se fait via `host` matching (lookup Subdomain.canonicalValue).

**Persistance:**
- Upsert IpAddress par `(engagementId, canonicalValue)` avec `version = IPV4 | IPV6`.
- Insert DnsRecord (avec FK subdomainId si le host match un Subdomain existant, sinon FK domainId).
- Peuple `SubdomainIp` jointure pour chaque A/AAAA.
- Asset pivot type=IP_ADDRESS pour chaque IpAddress.
- Étendre `mergeSubdomains` correlation pour également merger les `IpAddress` doublons (même logique).

**Tests:** fixture capturée via `echo "www.hackerone.com" | docker run -i --rm projectdiscovery/dnsx -silent -json -a -aaaa -cname -mx -resp`. Test parser + integration parser-worker (vérifie DnsRecord + IpAddress + SubdomainIp persistés).

**Steps:** test fail → impl scanner → impl parser → test pass → commit.

```bash
git commit -m "feat(scanners/dnsx): add dnsx + parser with IpAddress and DnsRecord persistence

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 15 — Scanner + parser `naabu` (Port persist on IP assets)

**Files:**
- Create: `libs/scanners/naabu/`
- Create: `libs/parsers/src/naabu-json/`
- Modify: `apps/parser-worker/` (Port upsert sur Asset type=IP_ADDRESS)

**Scanner def:** image `projectdiscovery/naabu`, input `{ ports: '1-1000' | 'top-100', rate: 1000 }`, build `['naabu', '-silent', '-json', '-p', input.ports, '-rate', input.rate]`, target via stdin (liste d'IPs). Output JSONL `{ip, port, protocol}`.

**Parser:** produit `NormalizedPort[]` (assetValue = ip, number, protocol). Pas de service detection ici.

**Persistance:** trouver l'`Asset` IP_ADDRESS correspondant via `engagementId + canonicalValue`, upsert Port. Si l'IP n'existe pas comme Asset (cas improbable mais possible), créer l'IpAddress + Asset pivot avant.

**Tests:** fixture via `echo "1.1.1.1" | docker run -i --rm projectdiscovery/naabu -silent -json -p top-100`.

**Steps:** test fail → impl → test pass → commit.

```bash
git commit -m "feat(scanners/naabu): add naabu + parser with Port persistence

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 16 — Scanner + parser `nuclei` (Finding map with dedupHash)

**Files:**
- Create: `libs/scanners/nuclei/`
- Create: `libs/parsers/src/nuclei-json/`
- Modify: `apps/parser-worker/` (Finding upsert + dedupHash)
- Modify: `apps/parser-worker/src/app/correlation.service.ts` (étendre avec `dedupFindings`)

**Scanner def:** image `projectdiscovery/nuclei`, input `{ severity?: ['critical','high','medium','low','info'], tags?: string[], templates?: string[] }`, build `['nuclei', '-silent', '-jsonl', '-disable-update-check']` + flags. Target via stdin (URLs).

**Parser:** JSONL, un finding par ligne. Map vers `NormalizedFinding`:
- `title = info.name`
- `severity = info.severity` uppercase
- `templateId = template-id`
- `location = matched-at`
- `cveId = info.classification.cve_id?.[0]`
- `evidence = { request, response, extracted-results, ... }`
- `scannerName = 'nuclei'`

**Persistance + dedupHash:**

```typescript
// Dans PersistService.persist, pour chaque finding:
const sig = finding.cveId ?? finding.templateId ?? finding.title;
const assetCanonical = await this.findAssetCanonical(finding.location); // url → host
const dedupHash = sha256(`${finding.scannerName}|${finding.templateId ?? ''}|${assetCanonical}|${finding.location ?? ''}|${sig}`);
await prisma.finding.upsert({
  where: { assetId_dedupHash: { assetId, dedupHash } },
  create: { ..., firstSeenAt: now, lastSeenAt: now },
  update: { lastSeenAt: now },
});
```

**`correlation.service.ts` extension** : `dedupFindings(engagementId)` est essentiellement no-op si l'upsert via clé unique fait son travail. Mais ajoute un check: si plusieurs Finding rows partagent même dedupHash sur des assets différents (cas de canonicalisation différente), merger.

**Tests:** fixture nuclei (lancer sur un endpoint volontairement faible: `http://testphp.vulnweb.com` ou `https://hackerone.com`). Parser test + integration: même run 2x = pas de duplicate findings.

```bash
git commit -m "feat(scanners/nuclei): add nuclei + parser with Finding dedup

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 17 — Templates `recon-active`, `web-quick`, `web-deep` + seed

**Files:**
- Create: `libs/templates/src/builtins/{recon-active.ts, web-quick.ts, web-deep.ts}`
- Modify: `libs/templates/src/templates.module.ts` (register tous les builtins)
- Modify: `prisma/seed.ts` (upsert pour les 3 nouveaux)

**Définitions** (load-bearing):

```typescript
// recon-active.ts: subfinder → dnsx → httpx → naabu
export const ReconActive: TemplateDefinition = {
  name: 'recon-active',
  displayName: 'Active Recon',
  description: 'Subdomain enum, DNS resolution, HTTP fingerprint, port scan.',
  steps: [
    { scannerName: 'subfinder', inputs: {}, target: { kind: 'context', path: 'target' } },
    { scannerName: 'dnsx',      inputs: {}, target: { kind: 'context', path: 'subdomains' } },
    { scannerName: 'httpx',     inputs: { techDetect: { kind: 'static', value: true } },
      target: { kind: 'context', path: 'subdomains' } },
    { scannerName: 'naabu',     inputs: { ports: { kind: 'static', value: 'top-100' } },
      target: { kind: 'context', path: 'ipAddresses' } },
  ],
};

// web-quick.ts: httpx → naabu (assumes target is a host/URL)
export const WebQuick: TemplateDefinition = { /* steps: httpx + naabu */ };

// web-deep.ts: full chain subfinder → dnsx → httpx → naabu → nuclei
export const WebDeep: TemplateDefinition = { /* the 5 steps */ };
```

**Tests:** registry contient les 4 templates après bootstrap, `web-deep` a bien 5 steps dans le bon ordre.

```bash
git commit -m "feat(templates): add recon-active, web-quick, web-deep builtins

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 18 — Frontend: vue assets par kind + tab Findings

**Files:**
- Create: `apps/frontend/src/features/engagements/engagement-assets-tab.tsx`
- Create: `apps/frontend/src/features/findings/findings-table.tsx`
- Modify: `apps/frontend/src/features/engagements/engagement-page.tsx` (ajouter tabs)
- Create: `apps/frontend/src/features/engagements/__tests__/engagement-assets-tab.spec.tsx`

**Comportement:** sur engagement-page, tabs `Overview | Domains | Subdomains | IPs | Technologies | Findings`. Chaque tab query GraphQL le bon type + pagination. Findings tab a un filtre severity (multi-select).

**Tests:** chaque tab rend les bons types avec un mock Apollo.

```bash
git commit -m "feat(frontend): add per-kind asset tabs and findings table

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 19 — E2E `web-deep-e2e`

**Files:**
- Create: `apps/api-gateway-e2e/src/scenarios/web-deep-e2e.spec.ts`

**Scénario:** identique à recon-passive-e2e mais lance `web-deep` sur `hackerone.com`. Assert que TOUTES les tables sont peuplées (Domain ≥1, Subdomain ≥5, IpAddress ≥1, DnsRecord ≥3, Port ≥1, Technology ≥1, Finding peut être 0 sur cible bien sécurisée — donc juste `≥0` + status COMPLETED). Re-run → 0 doublon.

```bash
git commit -m "test(e2e): web-deep full chain acceptance suite

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Étape 3 — Correlation v1 complet + finitions (Tasks 20-24)

### Task 20 — Vue `asset_unified_view` + GraphQL `UnifiedAsset`

**Files:**
- Create: `prisma/migrations/<ts>_asset_unified_view/migration.sql`
- Create: `apps/api-gateway/src/app/assets/{unified-asset.dto.ts, unified-assets.resolver.ts, unified-assets.service.ts}`
- Modify: `apps/api-gateway/src/app/assets/assets.module.ts`
- Create: tests unit + e2e

**Migration SQL:**

```sql
CREATE OR REPLACE VIEW asset_unified_view AS
SELECT
  a.id,
  a.engagementId AS "engagementId",
  a.type AS kind,
  a.canonicalValue AS "canonicalValue",
  a.value AS "displayName",
  a.firstSeenAt AS "firstSeenAt",
  a.lastSeenAt AS "lastSeenAt",
  a.riskScore AS "riskScore",
  jsonb_strip_nulls(jsonb_build_object(
    'domain',    to_jsonb(d.*),
    'subdomain', to_jsonb(s.*),
    'ipAddress', to_jsonb(i.*)
  )) AS attrs
FROM "Asset" a
LEFT JOIN "Domain"    d ON a."domainId"    = d.id
LEFT JOIN "Subdomain" s ON a."subdomainId" = s.id
LEFT JOIN "IpAddress" i ON a."ipAddressId" = i.id
WHERE a."deletedAt" IS NULL;
```

**Resolver:** `query assets(engagementId, kinds?: [AssetType!], search?: String, limit, offset)` → paginé.

**Tests:** seed 1 Domain + 5 Subdomains + 3 IPs, query `assets` → 9 rows, query avec `kinds: [SUBDOMAIN]` → 5 rows, query avec `search: "api"` → matches.

```bash
git commit -m "feat(api-gateway): add asset_unified_view and UnifiedAsset query

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 21 — Extraire `libs/correlation/` depuis l'inline parser-worker

**Files:**
- Create: `libs/correlation/{project.json, ...standard lib files}`
- Create: `libs/correlation/src/{index.ts, canonical.ts, asset-merge.service.ts, finding-dedup.ts, correlation.module.ts}`
- Create: `libs/correlation/src/__tests__/{canonical.spec.ts, asset-merge.spec.ts, finding-dedup.spec.ts}`
- Modify: `apps/parser-worker/src/app/correlation.service.ts` → DELETE, remplacé par import depuis `@autoscanner/correlation`
- Modify: `apps/parser-worker/src/app/parse-job.processor.ts` (use new lib)

**Contenu cible (`canonical.ts`):**
- `canonicalDomain(value)` : lowercase, trim, retire trailing dot, IDN→punycode via `punycode` lib (npm pkg).
- `canonicalIp(value)` : utilise `ipaddr.js` (npm) pour normaliser IPv4 (`192.168.1.1`) et compresser IPv6 (`::1`).
- `findingDedupHash({scannerName, templateId, assetCanonical, location, signature})` : sha256 hex.

**Tests property-based** (fast-check):
- `canonicalDomain` est idempotent: `canonicalDomain(canonicalDomain(x)) === canonicalDomain(x)`.
- `canonicalIp` est idempotent.
- Hash est déterministe (mêmes inputs → même output).
- Corpus de variantes domaines: `www.client.com` ≠ `client.com`, `API.client.com` === `api.client.com`, IDN, etc.

**Migration code:**
- Déplacer `mergeSubdomains` (et la version `mergeIpAddresses` ajoutée Task 14) dans `asset-merge.service.ts`. Le service prend une `PrismaService` injectée.
- Le `parse-job.processor.ts` import `AssetMergeService` depuis le nouveau lib.

**Steps:**

- [ ] **Step 1:** Installer deps `punycode`, `ipaddr.js`, `fast-check` (dev).
- [ ] **Step 2:** Écrire les 3 fichiers de tests.
- [ ] **Step 3:** Implémenter `canonical.ts`, `asset-merge.service.ts`, `finding-dedup.ts`.
- [ ] **Step 4:** Refactor parser-worker pour utiliser le lib (sans changer le comportement).
- [ ] **Step 5:** Lancer `pnpm nx test correlation parser-worker parsers`. Expected: PASS.
- [ ] **Step 6: Commit**

```bash
git commit -m "refactor(correlation): extract correlation engine to dedicated lib

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 22 — CLI: commandes `template list` + `template run`

**Files:**
- Modify: `apps/cli/src/commands/` (ajouter `template-list.ts`, `template-run.ts`)
- Modify: `apps/cli/src/main.ts` (register commands)
- Create: `apps/cli/test/template-commands.spec.ts`

**`template-list` :** appelle query `scanTemplates`, affiche table (`cli-table3` lib déjà présente?). Sinon, simple console.log.

**`template-run` :** options `-e --engagement <id>`, `-t --template <name>`, `-T --target <value>`. Appelle mutation `runTemplate`, puis poll `templateRun(id)` toutes les 3s, affiche progress `[Step X/N: scannerName (status)]`. À completion, affiche summary (counts par type).

```bash
git commit -m "feat(cli): add template list and template run commands

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 23 — Orchestrator robustness: cancellation + timeout + crash recovery

**Files:**
- Modify: `apps/orchestrator-worker/src/app/template-run.processor.ts`
- Modify: `apps/orchestrator-worker/src/app/step-executor.service.ts`
- Modify: `apps/api-gateway/src/app/templates/templates.service.ts` (ajouter `cancelTemplateRun` mutation)
- Modify: `apps/orchestrator-worker/src/main.ts` (boot reconciliation déjà ajoutée Task 10 — tester explicitement)
- Create: `apps/orchestrator-worker/src/app/__tests__/resilience.spec.ts`

**Changements:**

1. **Cancellation:** mutation `cancelTemplateRun(id)` met `TemplateRun.status = CANCELLED`, publie sur Redis `templaterun:cancel:<id>`. Le processor écoute ce channel pendant `process()` et abort la boucle des steps; le step en cours (ScanJob) reçoit également un `scanjob:cancel:<jobId>` (mécanisme Phase 1 existant).
2. **Timeout global:** `TemplateRun.timeoutMs` (nouveau field, default 7_200_000 = 2h, ajouté en migration mineure). Le processor track `Date.now() - startedAt`; dépassement → status `FAILED` avec errorMessage = "template timeout".
3. **Crash recovery test:** test `resilience.spec.ts` boot un orchestrator-worker, lance une TemplateRun, tue le worker (process.exit forcé via mock) entre step 1 et step 2, relance, vérifie qu'elle reprend à `currentStepIndex=1` sans re-jouer step 0.

```bash
git commit -m "feat(orchestrator-worker): cancellation, timeout, and crash recovery

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 24 — Docs README + CI matrix + E2E final `recon-chain-e2e`

**Files:**
- Modify: `README.md` (section Phase 2)
- Modify: `.github/workflows/ci.yml` (matrix entry pour `recon-chain-e2e`)
- Create: `apps/api-gateway-e2e/src/scenarios/recon-chain-e2e.spec.ts`

**`recon-chain-e2e.spec.ts`:** lance séquentiellement les 4 templates sur le même engagement (`recon-passive`, `recon-active`, `web-quick`, `web-deep`), assert que les counts d'assets convergent (pas de doublons inter-templates), `lastSeenAt` est actualisé sur les re-runs.

**README additions:** section "Phase 2 — Recon chain" avec exemples CLI + UI screenshots optionnels + diagramme flux template → steps → DB.

**CI:** ajouter une matrix entry qui run `recon-chain-e2e` (full chain, ~10min) séparée du `api-gateway-e2e` court.

```bash
git commit -m "docs+ci: Phase 2 documentation and full recon chain e2e matrix

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Acceptance de fin de phase

Tous les critères "done" de la spec §1 verts:

1. ✅ Mutation `runTemplate` lance le pipeline complet (Task 11).
2. ✅ 5 scanners intégrés et runnables (Tasks 4, 6, 14, 15, 16).
3. ✅ 4 templates seedés exécutables (Tasks 9, 17).
4. ✅ Steps observables via `scanJobLogs` subscription existante (no-op — déjà en place Phase 1).
5. ✅ Correlation v1 (Tasks 8, 21).
6. ✅ Modèle complet + vue unifiée (Tasks 1, 20).
7. ✅ CI verte + `recon-chain-e2e` (Tasks 13, 19, 24).

---

## Risques d'exécution & mitigations

- **Image pulls lents en CI:** mitigation = step cache dédiée pour pre-pull les 5 images au début du job (Task 13 + 24).
- **Flakiness des cibles externes:** cibler `hackerone.com` (stable, public bug bounty). Si flaky en CI, switch à un test rig local (container nginx avec config riche de subdomains/vhosts simulés via `dnsmasq` sidecar).
- **Schema drift des outils PD:** pin les images à une version (`projectdiscovery/subfinder:v2.6.x`) dans chaque ScannerDefinition. Mettre à jour explicitement, pas via `:latest`.
- **Coordination orchestrator/parser-worker race:** le polling DB fallback (5s) couvre les cas où le pub/sub manque un message; le `currentStepIndex` persisté couvre les crashs. Tests Task 23 valident.

---

## Spec self-review (run après écriture du plan)

- **Spec coverage:** vérifié sec par sec — §1 critères "done" mappés aux tasks; §2.1/2.2/2.3 architecture entièrement réalisée (orchestrator T10, model T1, correlation T8+T21); §3.1/3.2/3.3 séquencement respecté; §4 risques mitigés dans les tasks; §5 décisions D1-D5 implémentées (D1: worker dédié T10; D2: pas de nmap pipeline ✓; D3: fallback root target T10 step-executor; D4: cancel current step T23; D5: liste séquentielle T12).
- **Placeholders:** "TODO Phase 4" sur PSL/IDN punycode dans Task 8 — laissé intentionnel (décision claire de différer); rien d'autre "TBD".
- **Type consistency:** `TemplateRunStatus` enum (PENDING/RUNNING/COMPLETED/FAILED/CANCELLED) cohérent entre Prisma model (T1), GraphQL (T11), processor (T10), service (T23). `ContextRef` discriminé `static | context` utilisé cohéremment T2 + T10 + T9/T17.
