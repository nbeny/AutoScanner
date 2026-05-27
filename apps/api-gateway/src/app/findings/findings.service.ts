import { Injectable } from '@nestjs/common';
import type { Finding, Severity } from '@prisma/client';
import { NotFoundError } from '@autoscanner/common';
import { PrismaService } from '@autoscanner/database';

@Injectable()
export class FindingsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForOwner(
    userId: string,
    engagementId: string,
    severities?: Severity[] | null,
  ): Promise<Finding[]> {
    const engagement = await this.prisma.engagement.findFirst({
      where: { id: engagementId, ownerId: userId, deletedAt: null },
      select: { id: true },
    });
    if (!engagement) throw new NotFoundError('Engagement', engagementId);

    return this.prisma.finding.findMany({
      where: {
        asset: { engagementId, deletedAt: null },
        ...(severities != null ? { severity: { in: severities } } : {}),
      },
      orderBy: [{ severity: 'desc' }, { lastSeenAt: 'desc' }],
    }) as Promise<Finding[]>;
  }
}
