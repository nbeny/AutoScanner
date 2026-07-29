import { Injectable } from '@nestjs/common';
import { PrismaService } from '@autoscanner/database';
import type { NormalizedBreachExposure, ParserContext } from '@autoscanner/parsers';
import type { Prisma } from '@prisma/client';

@Injectable()
export class BreachExposurePersister {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(
    exposures: NormalizedBreachExposure[],
    ctx: ParserContext,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.prisma;
    let count = 0;

    for (const e of exposures) {
      const seed = e.seed.trim();
      const breachName = e.breachName.trim();
      if (!seed || !breachName) continue;

      // Best-effort link to a known Email row in this engagement.
      const email = await client.email.findFirst({
        where: { engagementId: ctx.engagementId, address: seed },
        select: { id: true },
      });

      await client.breachExposure.upsert({
        where: {
          engagementId_seed_breachName_source: {
            engagementId: ctx.engagementId,
            seed,
            breachName,
            source: e.source,
          },
        },
        create: {
          engagementId: ctx.engagementId,
          emailId: email?.id ?? null,
          seed,
          breachName,
          breachDate: e.breachDate ? new Date(e.breachDate) : null,
          dataClasses: e.dataClasses,
          passwordExposed: e.passwordExposed,
          severity: e.severity,
          source: e.source,
          raw: (e.raw ?? undefined) as Prisma.InputJsonValue | undefined,
        },
        update: {
          lastSeenAt: new Date(),
          // refresh enrichment fields, but do not touch any operator-owned columns
          dataClasses: e.dataClasses,
          passwordExposed: e.passwordExposed,
          severity: e.severity,
          emailId: email?.id ?? undefined,
        },
      });
      count++;
    }
    return count;
  }
}
