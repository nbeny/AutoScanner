import { Injectable } from '@nestjs/common';
import { PrismaService } from '@autoscanner/database';
import type {
  AssetType as NormalizedAssetType,
  NormalizedAsset,
  NormalizedHttpProbe,
} from '@autoscanner/parsers';

import { canonicalize } from '@autoscanner/correlation';

const ASSET_TYPE_MAP: Record<
  NormalizedAssetType,
  'DOMAIN' | 'SUBDOMAIN' | 'IP_ADDRESS' | 'URL' | 'NETWORK' | null
> = {
  IP: 'IP_ADDRESS',
  DOMAIN: 'DOMAIN',
  SUBDOMAIN: 'SUBDOMAIN',
  URL: 'URL',
  NETBLOCK: 'NETWORK',
  EMAIL: null,
};

// TODO Phase 4: use psl lib for proper Public Suffix List handling.
// Phase 2 simplification: take everything after the first dot, with an apex-domain guard
// (single-dot hosts like `hackerone.com` resolve to themselves rather than `com`).
// Pre-condition: caller passes an already-canonicalized SUBDOMAIN value. The result
// must still be wrapped with canonicalize(..., { type: 'DOMAIN' }) before persisting.
function deriveParentDomain(host: string): string {
  const dotCount = (host.match(/\./g) ?? []).length;
  if (dotCount <= 1) return host;
  const firstDot = host.indexOf('.');
  return host.slice(firstDot + 1);
}

@Injectable()
export class AssetPersister {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(
    engagementId: string,
    asset: NormalizedAsset,
    httpProbe?: NormalizedHttpProbe,
  ): Promise<string | null> {
    const type = ASSET_TYPE_MAP[asset.type];
    if (!type) return null;

    // SUBDOMAIN assets require recon-chain upserts (Domain + Subdomain rows) and
    // a SUBDOMAIN pivot Asset that sets subdomainId (CHECK constraint enforces this).
    if (type === 'SUBDOMAIN') {
      return this.upsertSubdomainChain(engagementId, asset, httpProbe);
    }

    // type ∈ { DOMAIN, IP_ADDRESS, URL, NETWORK }. We canonicalize DOMAIN and
    // IP_ADDRESS with the matching canonicalize() variant; URL and NETWORK
    // fall through to a trim-only default (lowercase would mangle URL paths).
    const canonicalValue =
      type === 'DOMAIN'
        ? canonicalize(asset.value, { type: 'DOMAIN' })
        : type === 'IP_ADDRESS'
          ? canonicalize(asset.value, { type: 'IP_ADDRESS' })
          : asset.value.trim();
    const existing = await this.prisma.asset.findFirst({
      where: { engagementId, type, canonicalValue, deletedAt: null },
      select: { id: true },
    });
    if (existing) {
      await this.prisma.asset.update({
        where: { id: existing.id },
        data: { lastSeenAt: new Date() },
      });
      return existing.id;
    }
    const created = await this.prisma.asset.create({
      data: { engagementId, type, value: asset.value, canonicalValue },
      select: { id: true },
    });
    return created.id;
  }

  private async upsertSubdomainChain(
    engagementId: string,
    asset: NormalizedAsset,
    httpProbe?: NormalizedHttpProbe,
  ): Promise<string> {
    const canonicalValue = canonicalize(asset.value, { type: 'SUBDOMAIN' });
    const parentDomain = canonicalize(deriveParentDomain(canonicalValue), { type: 'DOMAIN' });

    return this.prisma.$transaction(async (tx) => {
      const domain = await tx.domain.upsert({
        where: {
          engagementId_canonicalValue: { engagementId, canonicalValue: parentDomain },
        },
        create: { engagementId, value: parentDomain, canonicalValue: parentDomain },
        update: { lastSeenAt: new Date() },
        select: { id: true },
      });

      const subdomain = await tx.subdomain.upsert({
        where: {
          engagementId_canonicalValue: { engagementId, canonicalValue },
        },
        create: {
          engagementId,
          domainId: domain.id,
          value: asset.value,
          canonicalValue,
        },
        update: { lastSeenAt: new Date(), domainId: domain.id },
        select: { id: true },
      });

      // Apply httpx-derived HTTP fields onto the Subdomain row inside the same
      // transaction so the row is consistent end-to-end. Partial probes are
      // safe: Prisma treats `undefined` as "don't write this column," so a
      // second httpx run that lacks a title won't clobber an existing one.
      if (
        httpProbe &&
        (httpProbe.status !== undefined ||
          httpProbe.title !== undefined ||
          httpProbe.server !== undefined)
      ) {
        await tx.subdomain.update({
          where: { id: subdomain.id },
          data: {
            httpStatus: httpProbe.status,
            httpTitle: httpProbe.title,
            httpServer: httpProbe.server,
          },
        });
      }

      const existingAsset = await tx.asset.findFirst({
        where: {
          engagementId,
          type: 'SUBDOMAIN',
          canonicalValue,
          subdomainId: subdomain.id,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (existingAsset) {
        await tx.asset.update({
          where: { id: existingAsset.id },
          data: { lastSeenAt: new Date() },
        });
        return existingAsset.id;
      }

      const created = await tx.asset.create({
        data: {
          engagementId,
          type: 'SUBDOMAIN',
          value: asset.value,
          canonicalValue,
          subdomainId: subdomain.id,
        },
        select: { id: true },
      });
      return created.id;
    });
  }
}
