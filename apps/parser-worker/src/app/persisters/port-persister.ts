import { Injectable } from '@nestjs/common';
import { PrismaService } from '@autoscanner/database';
import type { NormalizedPort } from '@autoscanner/parsers';

@Injectable()
export class PortPersister {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(assetId: string, port: NormalizedPort): Promise<string> {
    const row = await this.prisma.port.upsert({
      where: {
        assetId_number_protocol: { assetId, number: port.number, protocol: port.protocol },
      },
      create: { assetId, number: port.number, protocol: port.protocol, state: port.state },
      update: { state: port.state, lastSeenAt: new Date() },
      select: { id: true },
    });
    return row.id;
  }
}
