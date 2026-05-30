import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@autoscanner/database';
import type { NormalizedDnsRecord } from '@autoscanner/parsers';

import { canonicalize } from '@autoscanner/correlation';

// DnsRecordType enum values supported by Prisma / the schema.
const VALID_DNS_RECORD_TYPES = new Set([
  'A',
  'AAAA',
  'CNAME',
  'MX',
  'NS',
  'TXT',
  'PTR',
  'SRV',
  'CAA',
  'SOA',
]);

type PrismaDnsRecordType =
  | 'A'
  | 'AAAA'
  | 'CNAME'
  | 'MX'
  | 'NS'
  | 'TXT'
  | 'PTR'
  | 'SRV'
  | 'CAA'
  | 'SOA';

@Injectable()
export class DnsRecordPersister {
  private readonly logger = new Logger(DnsRecordPersister.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Upsert a DnsRecord row, associating it with a Subdomain (preferred) or
   * Domain (fallback) in the given engagement.
   *
   * The `@@unique([domainId, subdomainId, type, name, value])` constraint
   * contains two nullable columns (`domainId`, `subdomainId`). Postgres treats
   * NULLs as distinct in unique indexes, meaning Prisma's generated upsert via
   * the compound key would fail at runtime for nullable columns. We therefore
   * use findFirst + create/update (same approach as TechnologyPersister).
   */
  async upsert(engagementId: string, record: NormalizedDnsRecord): Promise<void> {
    if (!VALID_DNS_RECORD_TYPES.has(record.recordType)) {
      this.logger.warn(
        `Skipping DnsRecord with unknown recordType '${record.recordType}' for host '${record.assetValue}'`,
      );
      return;
    }

    const type = record.recordType as PrismaDnsRecordType;
    const name = canonicalize(record.assetValue, { type: 'SUBDOMAIN' });
    const value = record.value.trim().toLowerCase();

    // Prefer Subdomain lookup, fall back to Domain.
    const subdomain = await this.prisma.subdomain.findFirst({
      where: {
        engagementId,
        canonicalValue: name,
      },
      select: { id: true, domainId: true },
    });

    let subdomainId: string | null = null;
    let domainId: string | null = null;

    if (subdomain) {
      subdomainId = subdomain.id;
      domainId = subdomain.domainId;
    } else {
      // Fall back: look up the Domain directly (e.g. apex domain passed to dnsx).
      const domain = await this.prisma.domain.findFirst({
        where: {
          engagementId,
          canonicalValue: canonicalize(record.assetValue, { type: 'DOMAIN' }),
        },
        select: { id: true },
      });

      if (!domain) {
        this.logger.warn(
          `Skipping DnsRecord: no Subdomain or Domain found for '${record.assetValue}' in engagement ${engagementId}`,
        );
        return;
      }

      domainId = domain.id;
    }

    const existing = await this.prisma.dnsRecord.findFirst({
      where: { domainId, subdomainId, type, name, value },
      select: { id: true },
    });

    if (existing) {
      await this.prisma.dnsRecord.update({
        where: { id: existing.id },
        data: {
          lastSeenAt: new Date(),
          ...(record.ttl !== undefined ? { ttl: record.ttl } : {}),
        },
      });
      return;
    }

    await this.prisma.dnsRecord.create({
      data: {
        domainId,
        subdomainId,
        type,
        name,
        value,
        ttl: record.ttl,
      },
    });
  }
}
