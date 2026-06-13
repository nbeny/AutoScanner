import { Injectable } from '@nestjs/common';
import { NotFoundError } from '@autoscanner/common';
import { PrismaService } from '@autoscanner/database';

import { EndpointObject } from './dto/endpoint.object';

export interface EndpointsListOptions {
  subdomainId?: string | null;
  search?: string | null;
  limit?: number;
  offset?: number;
}

@Injectable()
export class EndpointsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    userId: string,
    engagementId: string,
    opts: EndpointsListOptions,
  ): Promise<EndpointObject[]> {
    const engagement = await this.prisma.engagement.findFirst({
      where: { id: engagementId, ownerId: userId, deletedAt: null },
      select: { id: true },
    });
    if (!engagement) throw new NotFoundError('Engagement', engagementId);

    return this.prisma.endpoint.findMany({
      where: {
        engagementId,
        ...(opts.subdomainId ? { subdomainId: opts.subdomainId } : {}),
        ...(opts.search ? { canonicalUrl: { contains: opts.search, mode: 'insensitive' } } : {}),
      },
      orderBy: { lastSeenAt: 'desc' },
      take: opts.limit ?? 100,
      skip: opts.offset ?? 0,
    });
  }

  async count(userId: string, engagementId: string): Promise<number> {
    const engagement = await this.prisma.engagement.findFirst({
      where: { id: engagementId, ownerId: userId, deletedAt: null },
      select: { id: true },
    });
    if (!engagement) throw new NotFoundError('Engagement', engagementId);

    return this.prisma.endpoint.count({ where: { engagementId } });
  }
}
