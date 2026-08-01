import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@autoscanner/database';

interface DuplicateFindingGroup {
  dedupHash: string;
  ids: string[];
}

@Injectable()
/**
 * Cross-asset Finding dedup.
 *
 * The Subdomain/IpAddress merge passes that used to live here moved to discovery-service in
 * SP1a, so this class no longer writes Asset or any discovery table. Finding dedup stays
 * here until SP2 moves findings out of parser-worker.
 */
export class AssetMergeService {
  private readonly logger = new Logger(AssetMergeService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * After persistence, merge duplicate Subdomain rows that share the same
   * canonicalValue within an engagement. The "winner" row is the one with the
   * earliest `firstSeenAt`; child rows (Asset, DnsRecord, SubdomainIp) are
   * repointed to it, then the losing rows are hard-deleted.
   *
   * Defensive net for Phase 2: today the `@@unique([engagementId, canonicalValue])`
   * constraint on Subdomain already prevents the duplicates this method targets,
   * so in steady state it's a no-op. It will become load-bearing in Phase 3+
   * when scanners may bypass uniqueness via raw SQL imports, manual data entry,
   * or schema migrations that temporarily relax constraints.
   *
   * Limitation: `Asset.subdomainId` is `@unique` (1:1). If two duplicate Subdomain
   * rows each have a linked Asset, the `asset.updateMany` repoint will violate
   * the unique constraint. We surface that as an error — the processor's try/catch
   * logs it as a warning and the BullMQ job still reports success (persistence
   * already completed). Phase 3+ correlation will handle the multi-Asset case.
   */
  /**
   * After persistence, dedupe Finding rows that share the same `dedupHash`
   * across **different** assets within an engagement.
   *
   * The Finding unique constraint is `@@unique([assetId, dedupHash])`, not
   * `@@unique([dedupHash])`. So the per-asset upsert path is collision-free,
   * but two findings on *different* asset rows can still share the same hash —
   * typically when canonicalisation drifts (e.g. nuclei resolved the URL to one
   * host casing while a prior run resolved it to another, both inserting
   * separate Asset rows). This pass repairs those drift cases.
   *
   * Strategy: pick the row with earliest `firstSeenAt` as winner, hard-delete
   * the losers. Finding has no children that need repointing (the schema only
   * relates Finding back up to Asset and ScanJob).
   *
   * Per-group try/catch isolates errors so one bad group doesn't short-circuit
   * the rest. Best-effort like the other merges.
   */
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
