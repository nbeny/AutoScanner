import { Injectable } from '@nestjs/common';
import { PrismaService } from '@autoscanner/database';
import type { Prisma } from '@prisma/client';
import type { NormalizedAsset } from '@autoscanner/parsers';

import { canonicalize } from '@autoscanner/correlation';

@Injectable()
export class IpAddressPersister {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Upsert an IpAddress row and its linked Asset pivot for a normalized IP asset.
   *
   * Responsibility boundary: this persister owns the IP_ADDRESS path end-to-end
   * (IpAddress row + Asset row with ipAddressId set). The AssetPersister skips
   * assets whose mapped type is IP_ADDRESS so there is no double-persistence.
   *
   * IP version heuristic: presence of `:` → IPV6; otherwise → IPV4.
   * Phase 4 will replace this with ipaddr.js for proper validation.
   *
   * Transaction model: if `tx` is provided, use it as-is (orchestrator owns the
   * outer transaction). Otherwise open our own `$transaction` to keep the
   * IpAddress + Asset writes atomic when called standalone.
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
