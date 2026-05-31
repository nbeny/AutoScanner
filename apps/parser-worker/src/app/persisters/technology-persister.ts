import { Injectable } from '@nestjs/common';
import { PrismaService } from '@autoscanner/database';
import type { NormalizedTechnology } from '@autoscanner/parsers';
import type { Prisma } from '@prisma/client';

@Injectable()
export class TechnologyPersister {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Upsert semantics for Technology rows:
   *
   * - `source` is **sticky to the first detector**: set on create from
   *   `scannerName`, never overwritten on update. Rationale: it captures
   *   provenance (who first found this tech on this asset), so a later run of
   *   a different scanner shouldn't rewrite that history. Phase 3+ may
   *   introduce a `sources: String[]` column to track all detectors.
   * - `categories` is **union-merged** on update: a httpx detection of
   *   ['cms'] followed by a nuclei detection of ['cdn'] yields ['cms','cdn'],
   *   not ['cdn']. Last-writer-wins would silently lose information from the
   *   earlier scanner. Order is preserved (existing first, new appended) so
   *   the array is stable across reorderings of incoming detections.
   * - `lastSeenAt` is bumped on every detection.
   *
   * Why findFirst+create/update instead of prisma.upsert: Technology has a
   * nullable `version` column in the composite unique key. Postgres treats
   * NULLs as distinct in unique indexes, so prisma.upsert via the
   * (assetId, name, version) key fails when version is undefined. Same
   * pattern as ServicePersister.
   */
  async upsert(
    assetId: string,
    tech: NormalizedTechnology,
    scannerName: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    const existing = await client.technology.findFirst({
      where: {
        assetId,
        name: tech.name,
        version: tech.version ?? null,
      },
      select: { id: true, categories: true },
    });
    if (existing) {
      const mergedCategories = tech.categories?.length
        ? Array.from(new Set([...existing.categories, ...tech.categories]))
        : undefined;
      await client.technology.update({
        where: { id: existing.id },
        data: {
          lastSeenAt: new Date(),
          categories: mergedCategories,
        },
      });
      return;
    }
    await client.technology.create({
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
