import { Injectable } from '@nestjs/common';
import { PrismaService } from '@autoscanner/database';
import { canonicalize } from '@autoscanner/correlation';
import type { DiscoveryEntityRequest, DiscoveryEntityResponse } from '@autoscanner/service-clients';

// Take everything after the first dot, with an apex-domain guard (single-dot hosts
// like `hackerone.com` resolve to themselves rather than `com`). Ported from the old
// AssetPersister SUBDOMAIN chain — discovery-service is now the single writer of
// Domain/Subdomain, so the parent-domain derivation lives here.
function deriveParentDomain(host: string): string {
  const dotCount = (host.match(/\./g) ?? []).length;
  if (dotCount <= 1) return host;
  const firstDot = host.indexOf('.');
  return host.slice(firstDot + 1);
}

@Injectable()
export class DiscoveryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get-or-create a discovery entity (Domain / Subdomain / IpAddress) keyed by
   * `engagementId + canonicalValue`, returning the row id and its kind. This is the
   * single-writer entry point used by asset-service to resolve the Asset polymorphic
   * pivot without writing discovery rows itself.
   */
  async getOrCreateEntity(req: DiscoveryEntityRequest): Promise<DiscoveryEntityResponse> {
    const { engagementId, kind, value, canonicalValue } = req;

    switch (kind) {
      case 'DOMAIN': {
        const domain = await this.prisma.domain.upsert({
          where: { engagementId_canonicalValue: { engagementId, canonicalValue } },
          create: { engagementId, value, canonicalValue },
          update: { lastSeenAt: new Date() },
          select: { id: true },
        });
        return { id: domain.id, kind };
      }

      case 'SUBDOMAIN': {
        // A Subdomain requires a parent Domain (non-nullable FK); derive + upsert it first.
        const parentDomain = canonicalize(deriveParentDomain(canonicalValue), { type: 'DOMAIN' });
        const domain = await this.prisma.domain.upsert({
          where: { engagementId_canonicalValue: { engagementId, canonicalValue: parentDomain } },
          create: { engagementId, value: parentDomain, canonicalValue: parentDomain },
          update: { lastSeenAt: new Date() },
          select: { id: true },
        });
        const subdomain = await this.prisma.subdomain.upsert({
          where: { engagementId_canonicalValue: { engagementId, canonicalValue } },
          create: { engagementId, domainId: domain.id, value, canonicalValue },
          update: { lastSeenAt: new Date(), domainId: domain.id },
          select: { id: true },
        });
        return { id: subdomain.id, kind };
      }

      case 'IP_ADDRESS': {
        // IP version heuristic: presence of `:` → IPV6; otherwise → IPV4.
        const version = canonicalValue.includes(':') ? 'IPV6' : 'IPV4';
        const ip = await this.prisma.ipAddress.upsert({
          where: { engagementId_canonicalValue: { engagementId, canonicalValue } },
          create: { engagementId, value, canonicalValue, version },
          update: { lastSeenAt: new Date() },
          select: { id: true },
        });
        return { id: ip.id, kind };
      }

      default: {
        const exhaustive: never = kind;
        throw new Error(`Unsupported discovery kind: ${String(exhaustive)}`);
      }
    }
  }
}
