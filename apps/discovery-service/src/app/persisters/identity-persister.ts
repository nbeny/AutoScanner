import { Injectable } from '@nestjs/common';
import { PrismaService } from '@autoscanner/database';
import type { NormalizedIdentity, ParserContext } from '@autoscanner/parsers';
import type { Prisma } from '@prisma/client';

@Injectable()
export class IdentityPersister {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(
    identities: NormalizedIdentity[],
    ctx: ParserContext,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.prisma;
    let count = 0;

    for (const i of identities) {
      const seed = i.seed.trim();
      const service = i.service.trim();
      if (!seed || !service) continue;

      await client.identity.upsert({
        where: {
          engagementId_kind_seed_service: {
            engagementId: ctx.engagementId,
            kind: i.kind,
            seed,
            service,
          },
        },
        create: {
          engagementId: ctx.engagementId,
          kind: i.kind,
          seed,
          service,
          url: i.url ?? null,
          source: i.source || ctx.scannerName,
        },
        update: {
          lastSeenAt: new Date(),
          url: i.url ?? null,
        },
      });

      count++;
    }

    return count;
  }
}
