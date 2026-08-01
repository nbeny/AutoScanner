import { Injectable } from '@nestjs/common';
import { PrismaService } from '@autoscanner/database';
import type { NormalizedOrgMetadata, ParserContext } from '@autoscanner/parsers';
import { Prisma } from '@prisma/client';

@Injectable()
export class OrgMetadataPersister {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(
    items: NormalizedOrgMetadata[],
    ctx: ParserContext,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.prisma;
    let count = 0;

    for (const item of items) {
      await client.orgMetadata.upsert({
        where: {
          engagementId_kind_source: {
            engagementId: ctx.engagementId,
            kind: item.kind,
            source: ctx.scannerName,
          },
        },
        create: {
          engagementId: ctx.engagementId,
          kind: item.kind,
          data: item.data as Prisma.InputJsonValue,
          source: ctx.scannerName,
        },
        update: {
          data: item.data as Prisma.InputJsonValue,
          lastSeenAt: new Date(),
        },
      });

      count++;
    }

    return count;
  }
}
