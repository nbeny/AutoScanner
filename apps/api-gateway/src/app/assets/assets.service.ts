import { Injectable } from '@nestjs/common';
import type { Asset } from '@prisma/client';
import { NotFoundError } from '@autoscanner/common';
import { PrismaService } from '@autoscanner/database';

@Injectable()
export class AssetsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForOwner(userId: string, engagementId: string): Promise<Asset[]> {
    const engagement = await this.prisma.engagement.findFirst({
      where: { id: engagementId, ownerId: userId, deletedAt: null },
      select: { id: true },
    });
    if (!engagement) throw new NotFoundError('Engagement', engagementId);

    return this.prisma.asset.findMany({
      where: { engagementId, deletedAt: null },
      orderBy: { lastSeenAt: 'desc' },
      include: { ports: { include: { services: true } } },
    }) as Promise<Asset[]>;
  }

  async getForOwner(userId: string, id: string): Promise<Asset> {
    const asset = await this.prisma.asset.findFirst({
      where: {
        id,
        deletedAt: null,
        engagement: { ownerId: userId, deletedAt: null },
      },
      include: { ports: { include: { services: true } } },
    });
    if (!asset) throw new NotFoundError('Asset', id);
    return asset as Asset;
  }
}
