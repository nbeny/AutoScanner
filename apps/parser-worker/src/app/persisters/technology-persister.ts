import { Injectable } from '@nestjs/common';
import { PrismaService } from '@autoscanner/database';
import type { NormalizedTechnology } from '@autoscanner/parsers';

@Injectable()
export class TechnologyPersister {
  constructor(private readonly prisma: PrismaService) {}

  // Technology has a nullable `version` column in its composite unique index.
  // Postgres treats NULLs as distinct in unique indexes, so prisma.upsert via
  // the (assetId, name, version) compound key fails when version is undefined.
  // We use findFirst + create/update instead (mirroring upsertService).
  async upsert(assetId: string, tech: NormalizedTechnology, scannerName: string): Promise<void> {
    const existing = await this.prisma.technology.findFirst({
      where: {
        assetId,
        name: tech.name,
        version: tech.version ?? null,
      },
      select: { id: true },
    });
    if (existing) {
      await this.prisma.technology.update({
        where: { id: existing.id },
        data: {
          lastSeenAt: new Date(),
          categories: tech.categories ?? undefined,
        },
      });
      return;
    }
    await this.prisma.technology.create({
      data: {
        assetId,
        name: tech.name,
        version: tech.version,
        source: scannerName,
        categories: tech.categories ?? undefined,
      },
    });
  }
}
