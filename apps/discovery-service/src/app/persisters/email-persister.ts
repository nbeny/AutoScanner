import { Injectable } from '@nestjs/common';
import { PrismaService } from '@autoscanner/database';
import type { NormalizedEmail, ParserContext } from '@autoscanner/parsers';
import type { Prisma } from '@prisma/client';

@Injectable()
export class EmailPersister {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(
    emails: NormalizedEmail[],
    ctx: ParserContext,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.prisma;
    let count = 0;

    for (const e of emails) {
      const address = e.address.trim().toLowerCase();
      if (!address) continue;

      await client.email.upsert({
        where: {
          engagementId_address: {
            engagementId: ctx.engagementId,
            address,
          },
        },
        create: {
          engagementId: ctx.engagementId,
          address,
          source: ctx.scannerName,
        },
        update: {
          lastSeenAt: new Date(),
        },
      });

      count++;
    }

    return count;
  }
}
