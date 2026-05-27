import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@autoscanner/database';

export interface CanonicalizeOptions {
  type: 'DOMAIN' | 'SUBDOMAIN' | 'IP_ADDRESS';
}

/**
 * Single source of truth for canonicalizing host-like values on the persister side.
 *
 * - DOMAIN/SUBDOMAIN: trim whitespace, lowercase, strip trailing FQDN-root dot.
 *   TODO Phase 4: IDN -> punycode via 'punycode' lib.
 * - IP_ADDRESS: trim + lowercase. IPv4 is already canonical in dotted form; IPv6
 *   compression (e.g. 2001:0db8:0000::1 -> 2001:db8::1) is deferred to Phase 4.
 *
 * Parsers (subfinder-json, httpx-json) keep their inline boundary normalization;
 * this function is invoked by the persister so there's one final form before DB
 * write. Idempotent for repeated application.
 */
export function canonicalize(value: string, opts: CanonicalizeOptions): string {
  if (opts.type === 'DOMAIN' || opts.type === 'SUBDOMAIN') {
    return value.trim().toLowerCase().replace(/\.$/, '');
  }
  if (opts.type === 'IP_ADDRESS') {
    return value.trim().toLowerCase();
  }
  // Default: trim only (URL, NETWORK, EMAIL etc. — caller decides downstream).
  return value.trim();
}

interface DuplicateGroup {
  canonicalValue: string;
  ids: string[];
}

@Injectable()
export class CorrelationService {
  private readonly logger = new Logger(CorrelationService.name);

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
  async mergeSubdomains(engagementId: string): Promise<{ merged: number }> {
    const dupes: DuplicateGroup[] = await this.prisma.$queryRaw<DuplicateGroup[]>`
      SELECT "canonicalValue", array_agg(id ORDER BY "firstSeenAt") AS ids
      FROM "Subdomain"
      WHERE "engagementId" = ${engagementId}
      GROUP BY "canonicalValue"
      HAVING count(*) > 1
    `;

    if (dupes.length === 0) {
      return { merged: 0 };
    }

    let merged = 0;
    // Per-group try/catch: an expected P2002 from the Asset.subdomainId unique
    // (see "Limitation" in the JSDoc above) on one group must not short-circuit
    // the merge for the remaining groups. Concurrent workers racing on the same
    // engagement are also benign here — repoint+delete of already-merged rows
    // is a no-op because their FKs were already moved by the winning worker.
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
        this.logger.debug(
          `merged ${drop.length} duplicates of '${group.canonicalValue}' into ${keep} (engagement=${engagementId})`,
        );
      } catch (err) {
        const code = (err as { code?: string }).code;
        this.logger.warn(
          `merge group '${group.canonicalValue}' failed (engagement=${engagementId}, code=${code ?? 'unknown'}): ${err instanceof Error ? err.message : String(err)}`,
          err instanceof Error ? err.stack : undefined,
        );
        // Continue to next group — partial success is preferable to total failure.
      }
    }

    return { merged };
  }
}
