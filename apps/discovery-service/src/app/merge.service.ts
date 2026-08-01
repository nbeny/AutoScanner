import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@autoscanner/database';

interface DuplicateGroup {
  canonicalValue: string;
  ids: string[];
}

/**
 * Deduplicates Subdomain / IpAddress rows within an engagement.
 *
 * Ownership note — this is the ONE place discovery-service writes `Asset`, and it is
 * deliberate: the losing rows can only be deleted once every `Asset.subdomainId` /
 * `Asset.ipAddressId` pointing at them has been repointed, and those two steps must commit
 * together or an Asset is left referencing a deleted row. Splitting it across a service call
 * would open exactly that window. The write is confined to repointing the pivot columns —
 * discovery-service never creates, deletes or otherwise mutates Asset.
 *
 * Moved out of `libs/correlation`'s AssetMergeService (which ran inside parser-worker) so
 * the row lifecycle of the deduplicated tables lives with the service that owns them.
 */
@Injectable()
export class MergeService {
  private readonly logger = new Logger(MergeService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Merge duplicate Subdomain rows sharing a canonicalValue. The winner is the earliest
   * `firstSeenAt`; children are repointed to it and the losers hard-deleted.
   */
  async mergeSubdomains(engagementId: string): Promise<{ merged: number }> {
    const dupes: DuplicateGroup[] = await this.prisma.$queryRaw<DuplicateGroup[]>`
      SELECT "canonicalValue", array_agg(id ORDER BY "firstSeenAt") AS ids
      FROM "Subdomain"
      WHERE "engagementId" = ${engagementId}
      GROUP BY "canonicalValue"
      HAVING count(*) > 1
    `;
    if (dupes.length === 0) return { merged: 0 };

    let merged = 0;
    // Per-group try/catch: an expected P2002 from the `Asset.subdomainId` unique index on
    // one group must not short-circuit the remaining groups. Concurrent workers racing on
    // the same engagement are benign — repoint+delete of already-merged rows is a no-op.
    for (const group of dupes) {
      const [keep, ...drop] = group.ids;
      if (drop.length === 0) continue;

      try {
        await this.prisma.$transaction([
          this.prisma.asset.updateMany({
            where: { subdomainId: { in: drop } },
            data: { subdomainId: keep },
          }),
          this.prisma.dnsRecord.updateMany({
            where: { subdomainId: { in: drop } },
            data: { subdomainId: keep },
          }),
          this.prisma.subdomainIp.updateMany({
            where: { subdomainId: { in: drop } },
            data: { subdomainId: keep },
          }),
          this.prisma.subdomain.deleteMany({ where: { id: { in: drop } } }),
        ]);
        merged += drop.length;
      } catch (err) {
        const code = (err as { code?: string }).code;
        this.logger.warn(
          `merge group '${group.canonicalValue}' failed (engagement=${engagementId}, code=${code ?? 'unknown'}): ${err instanceof Error ? err.message : String(err)}`,
        );
        // Continue — partial success beats total failure for a hygiene pass.
      }
    }
    return { merged };
  }

  /** Same contract as {@link mergeSubdomains}, for duplicate IpAddress rows. */
  async mergeIpAddresses(engagementId: string): Promise<{ merged: number }> {
    const dupes: DuplicateGroup[] = await this.prisma.$queryRaw<DuplicateGroup[]>`
      SELECT "canonicalValue", array_agg(id ORDER BY "firstSeenAt") AS ids
      FROM "IpAddress"
      WHERE "engagementId" = ${engagementId}
      GROUP BY "canonicalValue"
      HAVING count(*) > 1
    `;
    if (dupes.length === 0) return { merged: 0 };

    let merged = 0;
    for (const group of dupes) {
      const [keep, ...drop] = group.ids;
      if (drop.length === 0) continue;

      try {
        await this.prisma.$transaction([
          this.prisma.asset.updateMany({
            where: { ipAddressId: { in: drop } },
            data: { ipAddressId: keep },
          }),
          this.prisma.subdomainIp.updateMany({
            where: { ipAddressId: { in: drop } },
            data: { ipAddressId: keep },
          }),
          this.prisma.ipAddress.deleteMany({ where: { id: { in: drop } } }),
        ]);
        merged += drop.length;
      } catch (err) {
        const code = (err as { code?: string }).code;
        this.logger.warn(
          `IpAddress merge group '${group.canonicalValue}' failed (engagement=${engagementId}, code=${code ?? 'unknown'}): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return { merged };
  }
}
