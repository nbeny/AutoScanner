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

/**
 * Type-aware DNS record value normalisation.
 *
 * The DnsRecord unique key includes `value`, so two runs producing the same
 * record under different casings must collapse to one row. Lowercasing
 * everything (the original Phase 2 approach) is wrong for case-sensitive
 * record types — SPF tokens in TXT, DKIM base64 bodies, CAA tag values, and
 * SOA RNAME/MNAME all carry semantically meaningful case that must be
 * preserved.
 *
 * - A / AAAA → canonicalise as IP_ADDRESS (RFC 5952 compression for IPv6;
 *   dotted-decimal for IPv4). This collapses `2001:DB8::1` and
 *   `2001:0db8:0000::0001` onto the same value.
 * - CNAME / NS / PTR → canonicalise as SUBDOMAIN (lowercase + strip trailing
 *   FQDN dot; punycode IDN). Hostname-valued, DNS is case-insensitive on names.
 * - MX / SRV → lowercase + strip trailing dot. These are technically
 *   `<priority> <target>` (MX) and `<priority> <weight> <port> <target>` (SRV),
 *   but the numeric prefix is case-invariant, so whole-string lowercasing is
 *   safe and keeps the helper simple. Today's dnsx parser emits only the
 *   target component for MX, so the prefix path is defensive.
 * - TXT / CAA / SOA → trim only. Preserves case for SPF/DKIM/CAA/SOA payloads.
 */
function normalizeRecordValue(type: PrismaDnsRecordType, raw: string): string {
  const trimmed = raw.trim();
  switch (type) {
    case 'A':
    case 'AAAA':
      return canonicalize(trimmed, { type: 'IP_ADDRESS' });
    case 'CNAME':
    case 'NS':
    case 'PTR':
      return canonicalize(trimmed, { type: 'SUBDOMAIN' });
    case 'MX':
    case 'SRV':
      return trimmed.toLowerCase().replace(/\.$/, '');
    case 'TXT':
    case 'CAA':
    case 'SOA':
      return trimmed;
  }
}

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
    const value = normalizeRecordValue(type, record.value);

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
