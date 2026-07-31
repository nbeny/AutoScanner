import { Injectable } from '@nestjs/common';
import { PrismaService } from '@autoscanner/database';
import type { Prisma } from '@prisma/client';
import type {
  AssetType as NormalizedAssetType,
  NormalizedAsset,
  NormalizedHttpProbe,
} from '@autoscanner/parsers';

import { canonicalize } from '@autoscanner/correlation';

import { DiscoveryClient } from '../discovery.client';

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

/** Which pivot FK each asset type must carry (`asset_polymorphic_fk_check`). */
const PIVOT_COLUMN = {
  DOMAIN: 'domainId',
  SUBDOMAIN: 'subdomainId',
  IP_ADDRESS: 'ipAddressId',
} as const;

type PivotType = keyof typeof PIVOT_COLUMN;

@Injectable()
export class AssetPersister {
  constructor(
    private readonly prisma: PrismaService,
    private readonly discovery: DiscoveryClient,
  ) {}

  async upsert(
    engagementId: string,
    asset: NormalizedAsset,
    httpProbe?: NormalizedHttpProbe,
    tx?: Prisma.TransactionClient,
  ): Promise<string | null> {
    const type = ASSET_TYPE_MAP[asset.type];
    if (!type) return null;

    if (tx) return this.upsertInTx(tx, engagementId, type, asset, httpProbe);

    // No-external-tx path keeps the P2002 retry: concurrent batches can race on the
    // partial unique index `(engagementId, type, canonicalValue) WHERE deletedAt IS NULL`;
    // the loser retries and falls back to the update branch.
    const attempt = () =>
      this.prisma.$transaction((innerTx) =>
        this.upsertInTx(innerTx, engagementId, type, asset, httpProbe),
      );
    try {
      return await attempt();
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') return attempt();
      throw err;
    }
  }

  private async upsertInTx(
    tx: Prisma.TransactionClient,
    engagementId: string,
    type: 'DOMAIN' | 'SUBDOMAIN' | 'IP_ADDRESS' | 'URL' | 'NETWORK',
    asset: NormalizedAsset,
    httpProbe?: NormalizedHttpProbe,
  ): Promise<string> {
    const canonicalValue = this.canonicalFor(type, asset.value);

    const existing = await tx.asset.findFirst({
      where: { engagementId, type, canonicalValue, deletedAt: null },
      select: { id: true },
    });
    if (existing) {
      await tx.asset.update({ where: { id: existing.id }, data: { lastSeenAt: new Date() } });
      return existing.id;
    }

    // DOMAIN/SUBDOMAIN/IP_ADDRESS assets must point at a discovery-owned row; URL and
    // NETWORK keep all three pivot FKs null, which the constraint allows.
    const pivot = this.isPivotType(type)
      ? await this.discovery.getOrCreateEntity({
          engagementId,
          kind: type,
          value: asset.value,
          canonicalValue,
          ...(type === 'SUBDOMAIN' && httpProbe
            ? {
                httpProbe: {
                  status: httpProbe.status,
                  title: httpProbe.title,
                  server: httpProbe.server,
                },
              }
            : {}),
        })
      : null;

    const created = await tx.asset.create({
      data: {
        engagementId,
        type,
        value: asset.value,
        canonicalValue,
        ...(pivot ? { [PIVOT_COLUMN[type as PivotType]]: pivot.id } : {}),
      },
      select: { id: true },
    });
    return created.id;
  }

  private isPivotType(type: string): type is PivotType {
    return type === 'DOMAIN' || type === 'SUBDOMAIN' || type === 'IP_ADDRESS';
  }

  private canonicalFor(type: string, value: string): string {
    if (type === 'DOMAIN') return canonicalize(value, { type: 'DOMAIN' });
    if (type === 'SUBDOMAIN') return canonicalize(value, { type: 'SUBDOMAIN' });
    if (type === 'IP_ADDRESS') return canonicalize(value, { type: 'IP_ADDRESS' });
    return value.trim();
  }
}
