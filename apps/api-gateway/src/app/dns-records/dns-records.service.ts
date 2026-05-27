import { Injectable } from '@nestjs/common';
import type { DnsRecord } from '@prisma/client';
import { NotFoundError } from '@autoscanner/common';
import { PrismaService } from '@autoscanner/database';

@Injectable()
export class DnsRecordsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForOwner(userId: string, engagementId: string): Promise<DnsRecord[]> {
    const engagement = await this.prisma.engagement.findFirst({
      where: { id: engagementId, ownerId: userId, deletedAt: null },
      select: { id: true },
    });
    if (!engagement) throw new NotFoundError('Engagement', engagementId);

    return this.prisma.dnsRecord.findMany({
      where: {
        OR: [{ subdomain: { engagementId } }, { domain: { engagementId } }],
      },
      orderBy: { lastSeenAt: 'desc' },
    }) as Promise<DnsRecord[]>;
  }
}
