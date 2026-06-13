import { Injectable } from '@nestjs/common';
import { NotFoundError } from '@autoscanner/common';
import { PrismaService } from '@autoscanner/database';

import { TlsCertificateObject } from './dto/tls-certificate.object';

@Injectable()
export class TlsService {
  constructor(private readonly prisma: PrismaService) {}

  async tlsCertificates(userId: string, engagementId: string): Promise<TlsCertificateObject[]> {
    const engagement = await this.prisma.engagement.findFirst({
      where: { id: engagementId, ownerId: userId, deletedAt: null },
      select: { id: true },
    });
    if (!engagement) throw new NotFoundError('Engagement', engagementId);

    return this.prisma.tlsCertificate.findMany({
      where: { engagementId },
      orderBy: { lastSeenAt: 'desc' },
    });
  }
}
