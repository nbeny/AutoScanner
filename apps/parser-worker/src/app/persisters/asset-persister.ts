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

// Phase 2 simplification: take everything after the first dot, with an apex-domain guard
// (single-dot hosts like `hackerone.com` resolve to themselves rather than `com`).
// Caller passes an already-canonicalized SUBDOMAIN value; result must still be wrapped
// with canonicalize(..., { type: 'DOMAIN' }) before persisting.
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
    // No-external-tx path keeps the existing P2002 retry: parser-worker concurrency=4
    // can race on the partial unique index; loser retries the whole tx and falls
    // back to the update branch.
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

    // A DOMAIN asset must point at a Domain row: the `asset_polymorphic_fk_check`
    // constraint requires `domainId IS NOT NULL` for type=DOMAIN (mirroring how the
    // SUBDOMAIN chain links `subdomainId`). Creating the pivot without it raises
    // Postgres 23514 and the parse job fails. URL/NETWORK keep all three FKs null,
    // which the same constraint allows.
    const domainId =
      type === 'DOMAIN'
        ? (
            await tx.domain.upsert({
              where: { engagementId_canonicalValue: { engagementId, canonicalValue } },
              create: { engagementId, value: asset.value, canonicalValue },
              update: { lastSeenAt: new Date() },
              select: { id: true },
            })
          ).id
        : null;

    const created = await tx.asset.create({
      data: { engagementId, type, value: asset.value, canonicalValue, domainId },
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
