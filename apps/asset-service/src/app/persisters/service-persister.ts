import { Injectable } from '@nestjs/common';
import { PrismaService } from '@autoscanner/database';
import type { Prisma } from '@prisma/client';
import type { NormalizedService } from '@autoscanner/parsers';

@Injectable()
export class ServicePersister {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(
    portId: string,
    svc: NormalizedService,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    const existing = await client.service.findFirst({
      where: {
        portId,
        name: svc.name ?? null,
        product: svc.product ?? null,
        version: svc.version ?? null,
      },
      select: { id: true },
    });
    if (existing) {
      await client.service.update({
        where: { id: existing.id },
        data: { lastSeenAt: new Date(), banner: svc.extraInfo ?? undefined, cpe: svc.cpe ?? [] },
      });
      return;
    }
    await client.service.create({
      data: {
        portId,
        name: svc.name,
        product: svc.product,
        version: svc.version,
        banner: svc.extraInfo,
        cpe: svc.cpe ?? [],
      },
    });
  }
}
