import { Injectable } from '@nestjs/common';
import { PrismaService } from '@autoscanner/database';

@Injectable()
export class SubdomainIpPersister {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Upsert a SubdomainIp join row linking a Subdomain to an IpAddress.
   * The composite PK `(subdomainId, ipAddressId)` makes this a natural upsert.
   */
  async upsert(subdomainId: string, ipAddressId: string): Promise<void> {
    await this.prisma.subdomainIp.upsert({
      where: { subdomainId_ipAddressId: { subdomainId, ipAddressId } },
      create: { subdomainId, ipAddressId },
      update: { lastSeenAt: new Date() },
    });
  }
}
