# Phase 3.3.a — Asset Observation Persistence + Provenance Timeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist an `AssetObservation` row per scanner fact, then surface a real chronological cross-scanner timeline in the Asset Detail Provenance tab.

**Architecture:** Add a single new table (`AssetObservation`) + enum (`ObservationKind`). Refactor the 5 persisters that don't yet accept a `tx?: Prisma.TransactionClient` to match the Phase 3.2 pattern, so the orchestrator (`parse-job.processor.ts`) can wrap each persister upsert AND its corresponding observation write in one transaction. A tiny pure helper (`writeObservation`) in `libs/correlation` keeps the call sites uniform. The existing `AssetObservationDetail` GraphQL type (added in Phase 3.2 T12) is finally backed by real rows. The Provenance tab swaps its placeholder for a chronological list grouped by day, capped at 200 items.

**Tech Stack:** Prisma 6 (`$transaction`, `Prisma.TransactionClient`), NestJS 11, @nestjs/graphql 13, Apollo Client 3, React 18, Tailwind 3, Vitest + Testing Library.

**Scope:** Subset of Phase 3.3. Out of scope (deferred to 3.3.b/3.3.c):
- `CveCache` table, `cve-enricher-worker` app, `cveInfo` query, CVE display in Findings tabs.
- `engagementUpdated` GraphQL subscription, Redis publishers/subscriber, `useSubscription` hooks, heartbeat refresh.
- End-to-end test (`correlation-dashboard-e2e.spec.ts`).

---

## Task 1: Prisma schema + migration for `AssetObservation`

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260531000000_phase3_asset_observation/migration.sql`

- [ ] **Step 1: Add enum + model to `prisma/schema.prisma`**

Append the following just before the closing `Phase 2 (RECON)` section delimiter (or at the file's end). Insert it as a new top-level block after the existing `Finding` model so the file stays grouped by phase:

```prisma
// =====================================================================
// PHASE 3 — CROSS-SCANNER OBSERVATIONS
// =====================================================================

enum ObservationKind {
  DISCOVERED       // asset first appears (subfinder, etc.)
  RESOLVED         // dnsx resolves a subdomain → IPs
  PORT_OPEN        // naabu/nmap sees a port
  SERVICE_DETECTED // nmap -sV fingerprints a service
  TECH_DETECTED    // httpx fingerprints a technology
  HTTP_PROBED      // httpx returns status/title/server
  DNS_RECORD       // dnsx returns A/AAAA/CNAME/MX/NS/TXT/...
  FINDING_RAISED   // nuclei emits a finding
}

model AssetObservation {
  id          String          @id @default(cuid())
  assetId     String
  scanJobId   String
  scannerName String          // denormalised for query speed
  kind        ObservationKind
  observedAt  DateTime        @default(now())
  payload     Json?

  asset   Asset   @relation(fields: [assetId], references: [id], onDelete: Cascade)
  scanJob ScanJob @relation(fields: [scanJobId], references: [id], onDelete: Cascade)

  @@index([assetId, observedAt])
  @@index([scanJobId])
  @@index([kind])
  @@index([scannerName])
}
```

Also add back-relations to `Asset` and `ScanJob`:

In `model Asset { ... }` after the existing relations, add:

```prisma
  observations AssetObservation[]
```

In `model ScanJob { ... }` after the existing `findings Finding[]` line, add:

```prisma
  observations AssetObservation[]
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm exec prisma migrate dev --name phase3_asset_observation --schema prisma/schema.prisma --create-only`

If Postgres is unavailable locally (per auto-memory `Local dev env has no Postgres/Redis`), create the migration file manually under `prisma/migrations/20260531000000_phase3_asset_observation/migration.sql` with the following SQL (taken from the Phase 2 migration pattern):

```sql
-- CreateEnum
CREATE TYPE "ObservationKind" AS ENUM ('DISCOVERED','RESOLVED','PORT_OPEN','SERVICE_DETECTED','TECH_DETECTED','HTTP_PROBED','DNS_RECORD','FINDING_RAISED');

-- CreateTable
CREATE TABLE "AssetObservation" (
    "id"          TEXT NOT NULL,
    "assetId"     TEXT NOT NULL,
    "scanJobId"   TEXT NOT NULL,
    "scannerName" TEXT NOT NULL,
    "kind"        "ObservationKind" NOT NULL,
    "observedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload"     JSONB,
    CONSTRAINT "AssetObservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssetObservation_assetId_observedAt_idx" ON "AssetObservation" ("assetId","observedAt");
CREATE INDEX "AssetObservation_scanJobId_idx"          ON "AssetObservation" ("scanJobId");
CREATE INDEX "AssetObservation_kind_idx"               ON "AssetObservation" ("kind");
CREATE INDEX "AssetObservation_scannerName_idx"        ON "AssetObservation" ("scannerName");

-- AddForeignKey
ALTER TABLE "AssetObservation"
  ADD CONSTRAINT "AssetObservation_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AssetObservation"
  ADD CONSTRAINT "AssetObservation_scanJobId_fkey"
  FOREIGN KEY ("scanJobId") REFERENCES "ScanJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 3: Generate the Prisma client**

Run: `pnpm exec prisma generate --schema prisma/schema.prisma`
Expected: `Generated Prisma Client (vX.Y.Z) to ./node_modules/.pnpm/.../@prisma/client`.

- [ ] **Step 4: Type-check sanity**

Run: `pnpm exec nx run database:type-check`
Expected: PASS. If it fails because consumers expect new types, that is OK at this point — we'll wire consumers in T3/T4. The point of this step is to confirm `@prisma/client` types compile.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260531000000_phase3_asset_observation/
git commit -m "feat(prisma): add AssetObservation table + ObservationKind enum"
```

---

## Task 2: `writeObservation` helper in `libs/correlation`

**Files:**
- Create: `libs/correlation/src/observation-writer.ts`
- Create: `libs/correlation/src/__tests__/observation-writer.spec.ts`
- Modify: `libs/correlation/src/index.ts`

- [ ] **Step 1: Write the failing test**

`libs/correlation/src/__tests__/observation-writer.spec.ts`:

```ts
import { writeObservation } from '../observation-writer';

describe('writeObservation', () => {
  it('forwards required fields to assetObservation.create on the given tx', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'obs1' });
    const tx = { assetObservation: { create } } as never;
    await writeObservation(tx, {
      assetId: 'a1',
      scanJobId: 'j1',
      scannerName: 'nuclei',
      kind: 'FINDING_RAISED',
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        assetId: 'a1',
        scanJobId: 'j1',
        scannerName: 'nuclei',
        kind: 'FINDING_RAISED',
        payload: undefined,
      },
      select: { id: true },
    });
  });

  it('forwards payload when provided', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'obs2' });
    const tx = { assetObservation: { create } } as never;
    await writeObservation(tx, {
      assetId: 'a1',
      scanJobId: 'j1',
      scannerName: 'nmap',
      kind: 'PORT_OPEN',
      payload: { number: 443, protocol: 'TCP' },
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        assetId: 'a1',
        scanJobId: 'j1',
        scannerName: 'nmap',
        kind: 'PORT_OPEN',
        payload: { number: 443, protocol: 'TCP' },
      },
      select: { id: true },
    });
  });
});
```

- [ ] **Step 2: Run the test to verify failure**

Run: `pnpm exec nx run correlation:test -- --testPathPattern observation-writer`
Expected: FAIL with `Cannot find module '../observation-writer'`.

- [ ] **Step 3: Implement the helper**

`libs/correlation/src/observation-writer.ts`:

```ts
import type { ObservationKind, Prisma, PrismaClient } from '@prisma/client';

export type ObservationWriterClient = PrismaClient | Prisma.TransactionClient;

export interface WriteObservationInput {
  assetId: string;
  scanJobId: string;
  scannerName: string;
  kind: ObservationKind;
  payload?: Prisma.InputJsonValue;
}

/**
 * Pure write helper for AssetObservation rows.
 *
 * Caller is responsible for providing a Prisma client OR a TransactionClient.
 * The orchestrator (parser-worker) is expected to pass a TransactionClient so
 * the observation row lands in the same transaction as the persister upsert
 * that produced it. Returns the new row id.
 */
export async function writeObservation(
  client: ObservationWriterClient,
  input: WriteObservationInput,
): Promise<string> {
  const row = await client.assetObservation.create({
    data: {
      assetId: input.assetId,
      scanJobId: input.scanJobId,
      scannerName: input.scannerName,
      kind: input.kind,
      payload: input.payload,
    },
    select: { id: true },
  });
  return row.id;
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `pnpm exec nx run correlation:test -- --testPathPattern observation-writer`
Expected: PASS (2 tests).

- [ ] **Step 5: Export from the barrel**

Modify `libs/correlation/src/index.ts` — append:

```ts
export { writeObservation } from './observation-writer';
export type { WriteObservationInput, ObservationWriterClient } from './observation-writer';
```

- [ ] **Step 6: Re-run full correlation suite**

Run: `pnpm exec nx run correlation:test`
Expected: all existing tests + 2 new ones PASS.

- [ ] **Step 7: Commit**

```bash
git add libs/correlation/src/observation-writer.ts libs/correlation/src/__tests__/observation-writer.spec.ts libs/correlation/src/index.ts
git commit -m "feat(correlation): add writeObservation helper"
```

---

## Task 3: Refactor 5 persisters to accept optional `tx?`

Pattern follows Phase 3.2 T4-T6 (port/service/finding): add `tx?: Prisma.TransactionClient` last parameter, use `tx ?? this.prisma` for single-statement persisters. For `asset-persister` and `ip-address-persister` (which open their own `$transaction` today), keep an internal `$transaction` ONLY when no `tx` is provided; otherwise run the body directly against the passed `tx`.

**Files:**
- Modify: `apps/parser-worker/src/app/persisters/asset-persister.ts`
- Modify: `apps/parser-worker/src/app/persisters/ip-address-persister.ts`
- Modify: `apps/parser-worker/src/app/persisters/technology-persister.ts`
- Modify: `apps/parser-worker/src/app/persisters/dns-record-persister.ts`
- Modify: `apps/parser-worker/src/app/persisters/subdomain-ip-persister.ts`

- [ ] **Step 1: Refactor `subdomain-ip-persister.ts` (smallest, warm-up)**

Replace the whole file with:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@autoscanner/database';
import type { Prisma } from '@prisma/client';

@Injectable()
export class SubdomainIpPersister {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Upsert a SubdomainIp join row linking a Subdomain to an IpAddress.
   * The composite PK `(subdomainId, ipAddressId)` makes this a natural upsert.
   */
  async upsert(
    subdomainId: string,
    ipAddressId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.subdomainIp.upsert({
      where: { subdomainId_ipAddressId: { subdomainId, ipAddressId } },
      create: { subdomainId, ipAddressId },
      update: { lastSeenAt: new Date() },
    });
  }
}
```

- [ ] **Step 2: Refactor `technology-persister.ts`**

Add `Prisma` import and `tx?` parameter; replace `this.prisma` with `client` throughout. Replace the file body with:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@autoscanner/database';
import type { Prisma } from '@prisma/client';
import type { NormalizedTechnology } from '@autoscanner/parsers';

@Injectable()
export class TechnologyPersister {
  constructor(private readonly prisma: PrismaService) {}

  // (Doc-comment from the existing file is preserved unchanged below the signature.)
  async upsert(
    assetId: string,
    tech: NormalizedTechnology,
    scannerName: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    const existing = await client.technology.findFirst({
      where: {
        assetId,
        name: tech.name,
        version: tech.version ?? null,
      },
      select: { id: true, categories: true },
    });
    if (existing) {
      const mergedCategories = tech.categories?.length
        ? Array.from(new Set([...existing.categories, ...tech.categories]))
        : undefined;
      await client.technology.update({
        where: { id: existing.id },
        data: {
          lastSeenAt: new Date(),
          categories: mergedCategories,
        },
      });
      return;
    }
    await client.technology.create({
      data: {
        assetId,
        name: tech.name,
        version: tech.version,
        source: scannerName,
        categories: tech.categories ?? undefined,
      },
    });
  }
}
```

(Keep the existing JSDoc block above the method — only the signature + body change.)

- [ ] **Step 3: Refactor `dns-record-persister.ts`**

Add `Prisma` import, add `tx?` last parameter, replace every `this.prisma.X` with `client.X` inside the method body. The body has 4 prisma calls: `subdomain.findFirst`, `domain.findFirst`, `dnsRecord.findFirst`, `dnsRecord.update`/`create`. Header stays:

```ts
import type { Prisma } from '@prisma/client';
```

Signature:

```ts
async upsert(
  engagementId: string,
  record: NormalizedDnsRecord,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  if (!VALID_DNS_RECORD_TYPES.has(record.recordType)) {
    this.logger.warn(
      `Skipping DnsRecord with unknown recordType '${record.recordType}' for host '${record.assetValue}'`,
    );
    return;
  }

  const client = tx ?? this.prisma;
  // ... rest unchanged, but replace `this.prisma.subdomain.findFirst`, etc. with `client.subdomain.findFirst`
```

Be sure every of the 4 prisma calls is rewritten to use `client`.

- [ ] **Step 4: Refactor `ip-address-persister.ts`**

This one opens its own `$transaction`. The refactor must keep that behaviour when no external `tx` is provided, but skip the wrapping when `tx` is provided (Prisma forbids nested transactions). Extract the body into a private async helper that takes a `TransactionClient` and call it accordingly.

Replace the file with:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@autoscanner/database';
import type { Prisma } from '@prisma/client';
import type { NormalizedAsset } from '@autoscanner/parsers';

import { canonicalize } from '@autoscanner/correlation';

@Injectable()
export class IpAddressPersister {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(
    engagementId: string,
    asset: NormalizedAsset,
    tx?: Prisma.TransactionClient,
  ): Promise<string | null> {
    if (asset.type !== 'IP') return null;
    if (tx) return this.upsertInTx(tx, engagementId, asset);
    return this.prisma.$transaction((innerTx) => this.upsertInTx(innerTx, engagementId, asset));
  }

  private async upsertInTx(
    tx: Prisma.TransactionClient,
    engagementId: string,
    asset: NormalizedAsset,
  ): Promise<string> {
    const canonicalValue = canonicalize(asset.value, { type: 'IP_ADDRESS' });
    const version = canonicalValue.includes(':') ? 'IPV6' : 'IPV4';

    const ip = await tx.ipAddress.upsert({
      where: { engagementId_canonicalValue: { engagementId, canonicalValue } },
      create: { engagementId, value: asset.value, canonicalValue, version },
      update: { lastSeenAt: new Date() },
      select: { id: true },
    });

    const existingAsset = await tx.asset.findFirst({
      where: {
        engagementId,
        type: 'IP_ADDRESS',
        canonicalValue,
        ipAddressId: ip.id,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (existingAsset) {
      await tx.asset.update({
        where: { id: existingAsset.id },
        data: { lastSeenAt: new Date() },
      });
      return existingAsset.id;
    }

    const created = await tx.asset.create({
      data: {
        engagementId,
        type: 'IP_ADDRESS',
        value: asset.value,
        canonicalValue,
        ipAddressId: ip.id,
      },
      select: { id: true },
    });
    return created.id;
  }
}
```

Note the return type: `Promise<string | null>` only on the public method (the early `null` return for non-IP assets). The private helper is `Promise<string>`.

- [ ] **Step 5: Refactor `asset-persister.ts`**

Same pattern as ip-address-persister: extract the body of `upsert` (non-IP path) and `upsertSubdomainChain` into private helpers that take a `TransactionClient`. Wrap the call in a `$transaction` only when no external `tx` is provided.

This file has more code; replace it with:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@autoscanner/database';
import type { Prisma } from '@prisma/client';
import type {
  AssetType as NormalizedAssetType,
  NormalizedAsset,
  NormalizedHttpProbe,
} from '@autoscanner/parsers';

import { canonicalize } from '@autoscanner/correlation';

const ASSET_TYPE_MAP: Record<
  NormalizedAssetType,
  'DOMAIN' | 'SUBDOMAIN' | 'IP_ADDRESS' | 'URL' | 'NETWORK' | null
> = {
  IP: 'IP_ADDRESS',
  DOMAIN: 'DOMAIN',
  SUBDOMAIN: 'SUBDOMAIN',
  URL: 'URL',
  NETBLOCK: 'NETWORK',
  EMAIL: null,
};

function deriveParentDomain(host: string): string {
  const dotCount = (host.match(/\./g) ?? []).length;
  if (dotCount <= 1) return host;
  const firstDot = host.indexOf('.');
  return host.slice(firstDot + 1);
}

@Injectable()
export class AssetPersister {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(
    engagementId: string,
    asset: NormalizedAsset,
    httpProbe?: NormalizedHttpProbe,
    tx?: Prisma.TransactionClient,
  ): Promise<string | null> {
    const type = ASSET_TYPE_MAP[asset.type];
    if (!type) return null;

    if (type === 'SUBDOMAIN') {
      if (tx) return this.upsertSubdomainChainInTx(tx, engagementId, asset, httpProbe);
      return this.prisma.$transaction((innerTx) =>
        this.upsertSubdomainChainInTx(innerTx, engagementId, asset, httpProbe),
      );
    }

    if (tx) return this.upsertSimpleInTx(tx, engagementId, type, asset);
    // Outside-tx flow keeps the existing P2002 retry semantics: a winner+loser
    // race on the partial unique index produces P2002 on the loser; retry the
    // whole tx so the loser falls back to the update branch.
    const attempt = () =>
      this.prisma.$transaction((innerTx) =>
        this.upsertSimpleInTx(innerTx, engagementId, type, asset),
      );
    try {
      return await attempt();
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') return attempt();
      throw err;
    }
  }

  private async upsertSimpleInTx(
    tx: Prisma.TransactionClient,
    engagementId: string,
    type: 'DOMAIN' | 'IP_ADDRESS' | 'URL' | 'NETWORK',
    asset: NormalizedAsset,
  ): Promise<string> {
    const canonicalValue =
      type === 'DOMAIN'
        ? canonicalize(asset.value, { type: 'DOMAIN' })
        : type === 'IP_ADDRESS'
          ? canonicalize(asset.value, { type: 'IP_ADDRESS' })
          : asset.value.trim();

    const existing = await tx.asset.findFirst({
      where: { engagementId, type, canonicalValue, deletedAt: null },
      select: { id: true },
    });
    if (existing) {
      await tx.asset.update({
        where: { id: existing.id },
        data: { lastSeenAt: new Date() },
      });
      return existing.id;
    }
    const created = await tx.asset.create({
      data: { engagementId, type, value: asset.value, canonicalValue },
      select: { id: true },
    });
    return created.id;
  }

  private async upsertSubdomainChainInTx(
    tx: Prisma.TransactionClient,
    engagementId: string,
    asset: NormalizedAsset,
    httpProbe?: NormalizedHttpProbe,
  ): Promise<string> {
    const canonicalValue = canonicalize(asset.value, { type: 'SUBDOMAIN' });
    const parentDomain = canonicalize(deriveParentDomain(canonicalValue), { type: 'DOMAIN' });

    const domain = await tx.domain.upsert({
      where: {
        engagementId_canonicalValue: { engagementId, canonicalValue: parentDomain },
      },
      create: { engagementId, value: parentDomain, canonicalValue: parentDomain },
      update: { lastSeenAt: new Date() },
      select: { id: true },
    });

    const subdomain = await tx.subdomain.upsert({
      where: { engagementId_canonicalValue: { engagementId, canonicalValue } },
      create: {
        engagementId,
        domainId: domain.id,
        value: asset.value,
        canonicalValue,
      },
      update: { lastSeenAt: new Date(), domainId: domain.id },
      select: { id: true },
    });

    if (
      httpProbe &&
      (httpProbe.status !== undefined ||
        httpProbe.title !== undefined ||
        httpProbe.server !== undefined)
    ) {
      await tx.subdomain.update({
        where: { id: subdomain.id },
        data: {
          httpStatus: httpProbe.status,
          httpTitle: httpProbe.title,
          httpServer: httpProbe.server,
        },
      });
    }

    const existingAsset = await tx.asset.findFirst({
      where: {
        engagementId,
        type: 'SUBDOMAIN',
        canonicalValue,
        subdomainId: subdomain.id,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (existingAsset) {
      await tx.asset.update({
        where: { id: existingAsset.id },
        data: { lastSeenAt: new Date() },
      });
      return existingAsset.id;
    }

    const created = await tx.asset.create({
      data: {
        engagementId,
        type: 'SUBDOMAIN',
        value: asset.value,
        canonicalValue,
        subdomainId: subdomain.id,
      },
      select: { id: true },
    });
    return created.id;
  }
}
```

- [ ] **Step 6: Run parser-worker unit tests to confirm no regression**

Run: `pnpm exec nx run parser-worker:test`
Expected: PASS (existing tests still green — none of them assert tx behaviour explicitly).

- [ ] **Step 7: Type-check**

Run: `pnpm exec nx run parser-worker:type-check`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/parser-worker/src/app/persisters/asset-persister.ts apps/parser-worker/src/app/persisters/ip-address-persister.ts apps/parser-worker/src/app/persisters/technology-persister.ts apps/parser-worker/src/app/persisters/dns-record-persister.ts apps/parser-worker/src/app/persisters/subdomain-ip-persister.ts
git commit -m "refactor(parser-worker): all persisters accept optional tx param"
```

---

## Task 4: Wire `writeObservation` into `parse-job.processor.ts`

Goal: every persister call site that produces a fact also writes the corresponding observation, in the same transaction. Mapping per spec §8.3.

**Files:**
- Modify: `apps/parser-worker/src/app/parse-job.processor.ts`

- [ ] **Step 1: Import `writeObservation` and `ObservationKind`**

At the top of the file (around lines 1–30), add:

```ts
import { writeObservation } from '@autoscanner/correlation';
import type { ObservationKind } from '@prisma/client';
```

(`recomputeRiskScoreForAsset` is already imported — leave that line alone.)

- [ ] **Step 2: Wrap non-IP asset upsert + emit DISCOVERED**

Replace the loop at lines ~158-165 (non-IP assets) with a `$transaction` that also writes a `DISCOVERED` observation:

```ts
for (const asset of out.assets) {
  if (asset.type === 'IP') continue;
  const probe = httpProbeByValue.get(asset.value.toLowerCase());
  const id = await this.withRetryOnSerializationConflict(() =>
    this.prisma.$transaction(async (tx) => {
      const upsertedId = await this.assetPersister.upsert(
        payload.engagementId,
        asset,
        probe,
        tx,
      );
      if (!upsertedId) return null;
      await writeObservation(tx, {
        assetId: upsertedId,
        scanJobId: payload.scanJobId,
        scannerName: payload.scannerName,
        kind: 'DISCOVERED',
        payload: { assetValue: asset.value, assetType: asset.type },
      });
      // httpx-emitted probe → HTTP_PROBED on the same asset.
      if (probe && (probe.status !== undefined || probe.title !== undefined || probe.server !== undefined)) {
        await writeObservation(tx, {
          assetId: upsertedId,
          scanJobId: payload.scanJobId,
          scannerName: payload.scannerName,
          kind: 'HTTP_PROBED',
          payload: { status: probe.status, title: probe.title, server: probe.server },
        });
      }
      return upsertedId;
    }),
  );
  if (!id) continue;
  assetIdByValue.set(asset.value.toLowerCase(), id);
  assetsPersisted++;
}
```

- [ ] **Step 3: Wrap IP asset upsert + emit DISCOVERED**

Replace the loop at lines ~170-181 (IP assets):

```ts
const ipAssetIdByValue = new Map<string, string>();
let ipAddressesPersisted = 0;
for (const asset of out.assets) {
  if (asset.type !== 'IP') continue;
  const id = await this.withRetryOnSerializationConflict(() =>
    this.prisma.$transaction(async (tx) => {
      const upsertedId = await this.ipAddressPersister.upsert(
        payload.engagementId,
        asset,
        tx,
      );
      if (!upsertedId) return null;
      await writeObservation(tx, {
        assetId: upsertedId,
        scanJobId: payload.scanJobId,
        scannerName: payload.scannerName,
        kind: 'DISCOVERED',
        payload: { assetValue: asset.value, assetType: 'IP' },
      });
      return upsertedId;
    }),
  );
  if (!id) continue;
  const canonicalIpKey = canonicalize(asset.value, { type: 'IP_ADDRESS' });
  ipAssetIdByValue.set(canonicalIpKey, id);
  assetIdByValue.set(asset.value.toLowerCase(), id);
  ipAddressesPersisted++;
}
```

- [ ] **Step 4: Inject PORT_OPEN inside the existing port tx**

The port loop already opens a `$transaction` (lines ~185-197). Add a `writeObservation` call inside it:

```ts
for (const port of out.ports) {
  const assetId = assetIdByValue.get(port.assetValue.toLowerCase());
  if (!assetId) continue;
  const id = await this.withRetryOnSerializationConflict(() =>
    this.prisma.$transaction(async (tx) => {
      const portId = await this.portPersister.upsert(assetId, port, tx);
      await writeObservation(tx, {
        assetId,
        scanJobId: payload.scanJobId,
        scannerName: payload.scannerName,
        kind: 'PORT_OPEN',
        payload: { number: port.number, protocol: port.protocol, state: port.state },
      });
      await recomputeRiskScoreForAsset(tx, assetId);
      return portId;
    }),
  );
  portIdByKey.set(portKey(port), id);
  portsPersisted++;
}
```

- [ ] **Step 5: Inject SERVICE_DETECTED inside the existing service tx**

Service loop at ~199-216:

```ts
let servicesPersisted = 0;
for (const svc of out.services) {
  const portId = portIdByKey.get(
    portKey({ assetValue: svc.assetValue, number: svc.portNumber, protocol: svc.protocol }),
  );
  if (!portId) continue;
  await this.withRetryOnSerializationConflict(() =>
    this.prisma.$transaction(async (tx) => {
      await this.servicePersister.upsert(portId, svc, tx);
      const port = await tx.port.findUnique({
        where: { id: portId },
        select: { assetId: true },
      });
      if (port) {
        await writeObservation(tx, {
          assetId: port.assetId,
          scanJobId: payload.scanJobId,
          scannerName: payload.scannerName,
          kind: 'SERVICE_DETECTED',
          payload: {
            portNumber: svc.portNumber,
            protocol: svc.protocol,
            name: svc.name,
            product: svc.product,
            version: svc.version,
          },
        });
        await recomputeRiskScoreForAsset(tx, port.assetId);
      }
    }),
  );
  servicesPersisted++;
}
```

- [ ] **Step 6: Wrap technology upsert + emit TECH_DETECTED**

Tech loop at ~218-224:

```ts
let technologiesPersisted = 0;
for (const tech of out.technologies) {
  const assetId = assetIdByValue.get(tech.assetValue.toLowerCase());
  if (!assetId) continue;
  await this.withRetryOnSerializationConflict(() =>
    this.prisma.$transaction(async (tx) => {
      await this.technologyPersister.upsert(assetId, tech, payload.scannerName, tx);
      await writeObservation(tx, {
        assetId,
        scanJobId: payload.scanJobId,
        scannerName: payload.scannerName,
        kind: 'TECH_DETECTED',
        payload: { name: tech.name, version: tech.version, categories: tech.categories },
      });
    }),
  );
  technologiesPersisted++;
}
```

- [ ] **Step 7: Inject FINDING_RAISED inside the existing finding tx**

Finding loop at ~265-277:

```ts
await this.withRetryOnSerializationConflict(() =>
  this.prisma.$transaction(async (tx) => {
    await this.findingPersister.upsert(
      payload.scanJobId,
      assetId!,
      finding,
      canonicalHost ?? '',
      tx,
    );
    await writeObservation(tx, {
      assetId: assetId!,
      scanJobId: payload.scanJobId,
      scannerName: payload.scannerName,
      kind: 'FINDING_RAISED',
      payload: {
        title: finding.title,
        severity: finding.severity,
        cveId: finding.cveId,
        templateId: finding.templateId,
        location: finding.location,
      },
    });
    await recomputeRiskScoreForAsset(tx, assetId!);
  }),
);
```

- [ ] **Step 8: Wrap DnsRecord upsert + emit DNS_RECORD**

Outside the existing transactions, the DNS loop has no $transaction today. Add one. Note: emitting an observation requires resolving an `assetId`. For DNS records the natural anchor is the Asset of the Subdomain (or Domain fallback). Resolve via the existing `assetIdByValue` map first; if missing, look up by canonical host in the engagement (live assets only).

Replace lines ~281-285:

```ts
let dnsRecordsPersisted = 0;
for (const record of out.dnsRecords) {
  await this.withRetryOnSerializationConflict(() =>
    this.prisma.$transaction(async (tx) => {
      await this.dnsRecordPersister.upsert(payload.engagementId, record, tx);
      const canonicalHost = canonicalize(record.assetValue, { type: 'SUBDOMAIN' });
      let observationAssetId = assetIdByValue.get(canonicalHost);
      if (!observationAssetId) {
        const fallback = await tx.asset.findFirst({
          where: {
            engagementId: payload.engagementId,
            canonicalValue: canonicalHost,
            deletedAt: null,
          },
          select: { id: true },
        });
        observationAssetId = fallback?.id;
      }
      if (observationAssetId) {
        await writeObservation(tx, {
          assetId: observationAssetId,
          scanJobId: payload.scanJobId,
          scannerName: payload.scannerName,
          kind: 'DNS_RECORD',
          payload: {
            recordType: record.recordType,
            name: record.assetValue,
            value: record.value,
            ttl: record.ttl,
          },
        });
      }
    }),
  );
  dnsRecordsPersisted++;
}
```

- [ ] **Step 9: Wrap SubdomainIp upsert + emit RESOLVED**

The SubdomainIp loop (~289-312) resolves A/AAAA records to link Subdomain↔IpAddress. The matching observation is `RESOLVED` on the Subdomain's Asset.

Replace the entire loop body inside the existing `for (const record of out.dnsRecords)`:

```ts
let subdomainIpsPersisted = 0;
for (const record of out.dnsRecords) {
  if (record.recordType !== 'A' && record.recordType !== 'AAAA') continue;
  const canonicalIp = canonicalize(record.value, { type: 'IP_ADDRESS' });
  if (!ipAssetIdByValue.has(canonicalIp)) continue;

  const canonicalHost = canonicalize(record.assetValue, { type: 'SUBDOMAIN' });

  await this.withRetryOnSerializationConflict(() =>
    this.prisma.$transaction(async (tx) => {
      const subdomain = await tx.subdomain.findFirst({
        where: { engagementId: payload.engagementId, canonicalValue: canonicalHost },
        select: { id: true },
      });
      if (!subdomain) return;

      const ipAddress = await tx.ipAddress.findFirst({
        where: { engagementId: payload.engagementId, canonicalValue: canonicalIp },
        select: { id: true },
      });
      if (!ipAddress) return;

      await this.subdomainIpPersister.upsert(subdomain.id, ipAddress.id, tx);

      const subdomainAssetId = assetIdByValue.get(canonicalHost);
      if (subdomainAssetId) {
        await writeObservation(tx, {
          assetId: subdomainAssetId,
          scanJobId: payload.scanJobId,
          scannerName: payload.scannerName,
          kind: 'RESOLVED',
          payload: { ip: canonicalIp },
        });
      }
    }),
  );
  subdomainIpsPersisted++;
}
```

- [ ] **Step 10: Type-check + run parser-worker tests**

Run: `pnpm exec nx run parser-worker:type-check && pnpm exec nx run parser-worker:test`
Expected: both PASS. Existing tests don't assert observation rows; if any of them mocks `prisma.$transaction` with a callback that doesn't expose `assetObservation`, fix the mock (extend it with `assetObservation: { create: jest.fn().mockResolvedValue({ id: 'obs' }) }`).

- [ ] **Step 11: Commit**

```bash
git add apps/parser-worker/src/app/parse-job.processor.ts
git commit -m "feat(parser-worker): emit AssetObservation rows per persisted fact"
```

---

## Task 5: Backend — `assetDetail.observations` returns real rows

**Files:**
- Modify: `apps/api-gateway/src/app/assets/unified-assets.service.ts`
- Modify: `apps/api-gateway/src/app/assets/__tests__/unified-assets.service.spec.ts` (if existing)

- [ ] **Step 1: Locate `detail()` in `unified-assets.service.ts`**

Grep for the method:

Run: `pnpm exec nx exec --no-cloud --no-output -- echo skip`  (no-op; this step is a navigation prompt)

Open `apps/api-gateway/src/app/assets/unified-assets.service.ts` and find `async detail(`.

- [ ] **Step 2: Replace the `observations: []` literal**

Inside the `detail()` method, after the Prisma `findUnique` (or include path) but before the `return`, add an observations fetch capped at 200:

```ts
const observations = await this.prisma.assetObservation.findMany({
  where: { assetId },
  orderBy: { observedAt: 'desc' },
  take: 200,
  select: {
    id: true,
    kind: true,
    scannerName: true,
    observedAt: true,
    payload: true,
  },
});
```

Replace the `observations: []` literal in the return object with:

```ts
observations: observations.map((o) => ({
  id: o.id,
  kind: o.kind,
  scannerName: o.scannerName,
  ts: o.observedAt,
  payload: o.payload as unknown,
})),
```

(`ts` is the field name on `AssetObservationDetail` — see `apps/api-gateway/src/app/assets/dto/asset-detail.object.ts:57`.)

- [ ] **Step 3: Update or add a test for the new fetch**

If `unified-assets.service.spec.ts` exists and tests `detail()`, extend the test to mock `prisma.assetObservation.findMany` to return a sample row and assert the mapped output. Otherwise, add a small focused test:

```ts
it('detail() includes the latest observations (max 200, desc by observedAt)', async () => {
  const findMany = jest.fn().mockResolvedValue([
    { id: 'o1', kind: 'DISCOVERED', scannerName: 'subfinder', observedAt: new Date('2026-01-02'), payload: null },
    { id: 'o2', kind: 'PORT_OPEN', scannerName: 'naabu', observedAt: new Date('2026-01-01'), payload: { number: 443 } },
  ]);
  // ... wire findMany into the prisma mock for assetObservation.
  const out = await service.detail('ownerUserId', 'assetId');
  expect(findMany).toHaveBeenCalledWith(
    expect.objectContaining({ where: { assetId: 'assetId' }, take: 200 }),
  );
  expect(out.observations).toHaveLength(2);
  expect(out.observations[0].kind).toBe('DISCOVERED');
  expect(out.observations[0].ts).toEqual(new Date('2026-01-02'));
});
```

(Adapt to the existing mock style in that spec file.)

- [ ] **Step 4: Run api-gateway tests + type-check**

Run: `pnpm exec nx run api-gateway:type-check && pnpm exec nx run api-gateway:test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api-gateway/src/app/assets/unified-assets.service.ts apps/api-gateway/src/app/assets/__tests__/unified-assets.service.spec.ts
git commit -m "feat(api-gateway): assetDetail.observations returns real rows"
```

---

## Task 6: Frontend — extend `ASSET_DETAIL_QUERY` to fetch observations

**Files:**
- Modify: `apps/frontend/src/lib/graphql/queries.ts`
- Modify: `apps/frontend/src/features/assets/asset-detail-page.tsx` (if needed for type plumbing)

- [ ] **Step 1: Find `ASSET_DETAIL_QUERY` in `queries.ts`**

Run: `pnpm exec grep -n "ASSET_DETAIL_QUERY" apps/frontend/src/lib/graphql/queries.ts` if needed.

- [ ] **Step 2: Add the `observations` selection**

Inside the `assetDetail(id: $assetId) { ... }` block of `ASSET_DETAIL_QUERY`, append (before the closing `}`):

```graphql
    observations {
      id
      kind
      scannerName
      ts
      payload
    }
```

(`payload` is a `GraphQLJSON` scalar — Apollo will surface it as `unknown`/`any` on the client. That's fine for the Provenance tab.)

- [ ] **Step 3: Run frontend type-check + tests**

Run: `pnpm exec nx run frontend:type-check && pnpm exec nx run frontend:test`
Expected: PASS. If a snapshot of `asset-detail-page` includes the GraphQL document text, update the snapshot.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/lib/graphql/queries.ts
git commit -m "feat(frontend): fetch observations in ASSET_DETAIL_QUERY"
```

---

## Task 7: Frontend — rewrite `AssetProvenanceTab` with real timeline

**Files:**
- Modify: `apps/frontend/src/features/assets/asset-provenance-tab.tsx`
- Create: `apps/frontend/src/features/assets/__tests__/asset-provenance-tab.spec.tsx`

- [ ] **Step 1: Write the failing test**

`apps/frontend/src/features/assets/__tests__/asset-provenance-tab.spec.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { AssetProvenanceTab } from '../asset-provenance-tab';

const sample = [
  {
    id: 'o1',
    kind: 'DISCOVERED',
    scannerName: 'subfinder',
    ts: '2026-05-30T10:00:00.000Z',
    payload: null,
  },
  {
    id: 'o2',
    kind: 'PORT_OPEN',
    scannerName: 'naabu',
    ts: '2026-05-30T11:30:00.000Z',
    payload: { number: 443, protocol: 'TCP' },
  },
  {
    id: 'o3',
    kind: 'FINDING_RAISED',
    scannerName: 'nuclei',
    ts: '2026-05-31T09:15:00.000Z',
    payload: { title: 'Outdated Apache', severity: 'HIGH' },
  },
];

describe('AssetProvenanceTab', () => {
  it('renders an empty-state when no observations are present', () => {
    render(<AssetProvenanceTab observations={[]} />);
    expect(screen.getByText(/Aucune observation/i)).toBeInTheDocument();
  });

  it('renders a row per observation with kind, scanner badge, and ts', () => {
    render(<AssetProvenanceTab observations={sample} />);
    expect(screen.getByText('DISCOVERED')).toBeInTheDocument();
    expect(screen.getByText('PORT_OPEN')).toBeInTheDocument();
    expect(screen.getByText('FINDING_RAISED')).toBeInTheDocument();
    expect(screen.getByText('subfinder')).toBeInTheDocument();
    expect(screen.getByText('naabu')).toBeInTheDocument();
    expect(screen.getByText('nuclei')).toBeInTheDocument();
  });

  it('groups observations by day (descending)', () => {
    render(<AssetProvenanceTab observations={sample} />);
    const headings = screen.getAllByRole('heading', { level: 3 });
    expect(headings).toHaveLength(2);
    expect(headings[0]).toHaveTextContent('2026-05-31');
    expect(headings[1]).toHaveTextContent('2026-05-30');
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm exec nx run frontend:test -- --run asset-provenance-tab`
Expected: FAIL — current placeholder renders the deferred message, none of the assertions match.

- [ ] **Step 3: Replace `asset-provenance-tab.tsx` body**

Replace the file contents with:

```tsx
import { useMemo } from 'react';

export interface AssetProvenanceObservation {
  id: string;
  kind: string;
  scannerName: string;
  ts: string; // ISO date string from GraphQL
  payload?: unknown;
}

export interface AssetProvenanceTabProps {
  observations: AssetProvenanceObservation[];
}

const KIND_BADGE: Record<string, string> = {
  DISCOVERED: 'bg-blue-100 text-blue-800',
  RESOLVED: 'bg-indigo-100 text-indigo-800',
  PORT_OPEN: 'bg-emerald-100 text-emerald-800',
  SERVICE_DETECTED: 'bg-teal-100 text-teal-800',
  TECH_DETECTED: 'bg-purple-100 text-purple-800',
  HTTP_PROBED: 'bg-cyan-100 text-cyan-800',
  DNS_RECORD: 'bg-amber-100 text-amber-800',
  FINDING_RAISED: 'bg-rose-100 text-rose-800',
};

function dayKey(iso: string): string {
  return iso.slice(0, 10); // YYYY-MM-DD
}

function timeOfDay(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function AssetProvenanceTab({ observations }: AssetProvenanceTabProps) {
  const grouped = useMemo(() => {
    const map = new Map<string, AssetProvenanceObservation[]>();
    for (const o of observations) {
      const k = dayKey(o.ts);
      const bucket = map.get(k);
      if (bucket) bucket.push(o);
      else map.set(k, [o]);
    }
    // Sort each bucket desc by ts.
    for (const list of map.values()) list.sort((a, b) => b.ts.localeCompare(a.ts));
    // Return entries sorted by day desc.
    return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a));
  }, [observations]);

  if (observations.length === 0) {
    return (
      <div className="rounded border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
        Aucune observation enregistrée pour cet asset.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {grouped.map(([day, items]) => (
        <section key={day}>
          <h3 className="mb-2 text-sm font-semibold text-slate-700">{day}</h3>
          <ul className="space-y-2">
            {items.map((o) => (
              <li
                key={o.id}
                className="flex items-start gap-3 rounded border border-slate-200 bg-white p-3"
              >
                <span className="w-16 shrink-0 text-xs text-slate-500">{timeOfDay(o.ts)}</span>
                <span
                  className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${
                    KIND_BADGE[o.kind] ?? 'bg-slate-100 text-slate-800'
                  }`}
                >
                  {o.kind}
                </span>
                <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                  {o.scannerName}
                </span>
                {o.payload !== null && o.payload !== undefined ? (
                  <pre className="ml-auto max-w-[60%] overflow-x-auto rounded bg-slate-50 p-2 text-xs text-slate-600">
                    {JSON.stringify(o.payload, null, 2)}
                  </pre>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {observations.length >= 200 ? (
        <p className="text-xs text-slate-500">
          Affichage des 200 observations les plus récentes. Cap UI — Phase 3.3.a.
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Wire `AssetProvenanceTab` to receive `observations` prop**

Open `apps/frontend/src/features/assets/asset-detail-page.tsx`. Find where `AssetProvenanceTab` is rendered. Replace `<AssetProvenanceTab />` with `<AssetProvenanceTab observations={asset.observations} />` (the `asset.observations` field is now populated by `ASSET_DETAIL_QUERY`).

If `AssetDetailPage` previously did not declare an `observations` field on its local type, no extra work is needed — `useQuery` returns the GraphQL response shape directly.

- [ ] **Step 5: Run frontend tests**

Run: `pnpm exec nx run frontend:test -- --run asset-provenance-tab`
Expected: PASS (3 tests).

- [ ] **Step 6: Run full frontend test suite + type-check**

Run: `pnpm exec nx run frontend:type-check && pnpm exec nx run frontend:test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/assets/asset-provenance-tab.tsx apps/frontend/src/features/assets/__tests__/asset-provenance-tab.spec.tsx apps/frontend/src/features/assets/asset-detail-page.tsx
git commit -m "feat(frontend): AssetProvenanceTab renders real chronological timeline"
```

---

## Task 8: Cross-cutting validation

**Files:** (no edits — verification only)

- [ ] **Step 1: Format**

Run: `pnpm exec nx format:write`
Expected: 0 unformatted files (or formats and exits clean).

- [ ] **Step 2: Type-check all touched workspaces**

Run: `pnpm exec nx run-many --target=type-check --projects=correlation,parser-worker,api-gateway,frontend`
Expected: PASS for all four.

- [ ] **Step 3: Lint all touched workspaces**

Run: `pnpm exec nx run-many --target=lint --projects=correlation,parser-worker,api-gateway,frontend`
Expected: PASS.

- [ ] **Step 4: Test all touched workspaces**

Run: `pnpm exec nx run-many --target=test --projects=correlation,parser-worker,api-gateway,frontend`
Expected: PASS.

- [ ] **Step 5: Confirm no schema drift**

Run: `pnpm exec prisma format --schema prisma/schema.prisma`
Expected: file is already formatted (no diff).

- [ ] **Step 6: Final commit (only if formatting or schema reformat introduced changes)**

```bash
git status
# if anything changed:
git add -p
git commit -m "chore(phase-3.3.a): final formatting pass"
```

If nothing changed, skip this commit.

---

## Done criteria (Phase 3.3.a)

- `prisma migrate dev` produces an empty diff (schema is in sync).
- `pnpm exec nx run parser-worker:test` runs the parser-worker integration tests green; running a single parser fixture writes ≥1 `AssetObservation` per persisted entity (manual smoke).
- `assetDetail.observations` returns up to 200 rows ordered desc by `observedAt`.
- `/engagements/:eid/assets/:aid` Provenance tab shows a chronological timeline grouped by day; empty-state when no observations.
- All four projects (`correlation`, `parser-worker`, `api-gateway`, `frontend`) pass `type-check`, `lint`, `test`.

## Manual acceptance (optional, requires `pnpm dev:up`)

1. `pnpm dev:up` — bring up Postgres + Redis.
2. `pnpm exec prisma migrate deploy --schema prisma/schema.prisma`.
3. Run `pnpm dev` (or the equivalent that boots api-gateway + parser-worker + frontend).
4. Trigger `web-quick` on a fresh engagement.
5. Open an asset detail page — Provenance tab should show entries for subfinder (DISCOVERED), naabu (PORT_OPEN), httpx (HTTP_PROBED/TECH_DETECTED), and nuclei (FINDING_RAISED) when each scanner contributed.

## Out of scope (deferred to 3.3.b / 3.3.c)

- `CveCache` table + `cve-enricher-worker` app + `cveInfo` query + CVSS display.
- `engagementUpdated` subscription + Redis pub/sub + `useSubscription` + heartbeat.
- E2E test `correlation-dashboard-e2e.spec.ts`.
