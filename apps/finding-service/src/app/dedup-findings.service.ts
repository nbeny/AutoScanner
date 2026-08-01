import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@autoscanner/database';

interface DuplicateFindingGroup {
  dedupHash: string;
  ids: string[];
}

/**
 * Cross-asset Finding dedup.
 *
 * Moved out of libs/correlation's AssetMergeService in SP2a — its Subdomain/IpAddress half
 * had already gone to discovery-service in SP1a, so nothing was left there once findings
 * moved here. Behaviour is unchanged.
 */
@Injectable()
export class DedupFindingsService {
  private readonly logger = new Logger(DedupFindingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async dedupFindings(engagementId: string): Promise<{ merged: number }> {
    const dupes: DuplicateFindingGroup[] = await this.prisma.$queryRaw<DuplicateFindingGroup[]>`
      SELECT f."dedupHash" as "dedupHash", array_agg(f.id ORDER BY f."firstSeenAt") AS ids
      FROM "Finding" f
      JOIN "Asset" a ON a.id = f."assetId"
      WHERE a."engagementId" = ${engagementId}
      GROUP BY f."dedupHash"
      HAVING count(DISTINCT f."assetId") > 1
    `;

    if (dupes.length === 0) {
      return { merged: 0 };
    }

    let merged = 0;
    for (const group of dupes) {
      const [, ...drop] = group.ids;
      if (drop.length === 0) continue;

      try {
        await this.prisma.finding.deleteMany({ where: { id: { in: drop } } });
        merged += drop.length;
        this.logger.debug(
          `merged ${drop.length} duplicate Finding rows for dedupHash '${group.dedupHash.slice(0, 12)}…' (engagement=${engagementId})`,
        );
      } catch (err) {
        const code = (err as { code?: string }).code;
        this.logger.warn(
          `Finding dedup group '${group.dedupHash.slice(0, 12)}…' failed (engagement=${engagementId}, code=${code ?? 'unknown'}): ${err instanceof Error ? err.message : String(err)}`,
          err instanceof Error ? err.stack : undefined,
        );
      }
    }

    return { merged };
  }
}
