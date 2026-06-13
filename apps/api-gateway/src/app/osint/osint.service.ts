import { Injectable } from '@nestjs/common';
import { NotFoundError } from '@autoscanner/common';
import { PrismaService } from '@autoscanner/database';

import { EmailObject } from './dto/email.object';
import { OrgMetadataObject } from './dto/org-metadata.object';

@Injectable()
export class OsintService {
  constructor(private readonly prisma: PrismaService) {}

  async emails(userId: string, engagementId: string): Promise<EmailObject[]> {
    const engagement = await this.prisma.engagement.findFirst({
      where: { id: engagementId, ownerId: userId, deletedAt: null },
      select: { id: true },
    });
    if (!engagement) throw new NotFoundError('Engagement', engagementId);

    return this.prisma.email.findMany({
      where: { engagementId },
      orderBy: { lastSeenAt: 'desc' },
    });
  }

  async orgMetadata(userId: string, engagementId: string): Promise<OrgMetadataObject[]> {
    const engagement = await this.prisma.engagement.findFirst({
      where: { id: engagementId, ownerId: userId, deletedAt: null },
      select: { id: true },
    });
    if (!engagement) throw new NotFoundError('Engagement', engagementId);

    return this.prisma.orgMetadata.findMany({
      where: { engagementId },
      orderBy: { lastSeenAt: 'desc' },
    });
  }
}
