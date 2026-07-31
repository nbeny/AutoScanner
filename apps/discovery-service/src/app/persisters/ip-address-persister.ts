import { Injectable } from '@nestjs/common';
import { PrismaService } from '@autoscanner/database';
import type { Prisma } from '@prisma/client';
import type { NormalizedAsset } from '@autoscanner/parsers';

import { canonicalize } from '@autoscanner/correlation';

@Injectable()
export class IpAddressPersister {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Upsert an IpAddress (discovery) row for a normalized IP asset and return its id.
   *
   * Single-writer boundary (SP1a): discovery-service owns the IpAddress table only.
   * The Asset pivot (an Asset row with `ipAddressId` set) is created by asset-service
   * once it has this id — it is NOT written here anymore.
   *
   * IP version heuristic: presence of `:` → IPV6; otherwise → IPV4.
   *
   * Transaction model: if `tx` is provided, use it as-is (caller owns the outer
   * transaction). Otherwise open our own `$transaction`.
   */
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

    return ip.id;
  }
}
