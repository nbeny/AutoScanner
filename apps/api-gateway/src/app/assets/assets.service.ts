import { Injectable } from '@nestjs/common';
import type { Asset, AssetType } from '@prisma/client';
import { NotFoundError } from '@autoscanner/common';
import { PrismaService } from '@autoscanner/database';

export interface ListAssetsOptions {
  /** Filter by AssetType values. Empty/undefined returns all types. */
  types?: AssetType[];
  /**
   * When false, the `ports` join (and nested `services`) is skipped.
   * Defaults to true so legacy callers preserve their payload shape.
   * The resolver flips this to false when the GraphQL selection set
   * doesn't request `ports`, avoiding a large eager JOIN per row.
   */
  includePorts?: boolean;
  /** When false, the `technologies` join is skipped. See {@link includePorts}. */
  includeTechnologies?: boolean;
}

@Injectable()
export class AssetsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForOwner(
    userId: string,
    engagementId: string,
    opts: ListAssetsOptions = {},
  ): Promise<Asset[]> {
    const engagement = await this.prisma.engagement.findFirst({
      where: { id: engagementId, ownerId: userId, deletedAt: null },
      select: { id: true },
    });
    if (!engagement) throw new NotFoundError('Engagement', engagementId);

    const { types, includePorts = true, includeTechnologies = true } = opts;

    return this.prisma.asset.findMany({
      where: {
        engagementId,
        deletedAt: null,
        ...(types && types.length > 0 ? { type: { in: types } } : {}),
      },
      orderBy: { lastSeenAt: 'desc' },
      include: {
        ...(includePorts ? { ports: { include: { services: true } } } : {}),
        ...(includeTechnologies ? { technologies: true } : {}),
      },
    }) as Promise<Asset[]>;
  }

  async getForOwner(userId: string, id: string): Promise<Asset> {
    const asset = await this.prisma.asset.findFirst({
      where: {
        id,
        deletedAt: null,
        engagement: { ownerId: userId, deletedAt: null },
      },
      include: { ports: { include: { services: true } }, technologies: true },
    });
    if (!asset) throw new NotFoundError('Asset', id);
    return asset as Asset;
  }
}
