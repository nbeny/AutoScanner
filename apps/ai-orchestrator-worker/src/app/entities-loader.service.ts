import { Injectable } from '@nestjs/common';
import { PrismaService } from '@autoscanner/database';
import type { ResolvableEntities } from '@autoscanner/chain-engine';

/**
 * Charge depuis la DB les entités résolvables par le moteur de chaînes, avec
 * les champs lus par les filtres. `cdn.behind` est DÉRIVÉ de la `Technology`
 * "CDN: …" (catégorie 'cdn') que cdncheck attache à l'asset de l'IP — pas de
 * colonne dédiée (voir "écart vs spec"). IP sans asset ⇒ `cdn` undefined
 * ⇒ `notBehindCdn` fail-open la garde.
 */
@Injectable()
export class ResolvableEntitiesLoader {
  constructor(private readonly prisma: PrismaService) {}

  async load(engagementId: string): Promise<ResolvableEntities> {
    const [subs, ips, endpoints, emails] = await Promise.all([
      this.prisma.subdomain.findMany({
        where: { engagementId },
        select: { canonicalValue: true, httpStatus: true },
      }),
      this.prisma.ipAddress.findMany({ where: { engagementId }, select: { value: true } }),
      this.prisma.endpoint.findMany({
        where: { engagementId },
        select: { canonicalUrl: true, statusCode: true },
      }),
      this.prisma.email.findMany({ where: { engagementId }, select: { address: true } }),
    ]);

    // Dérivation CDN : assets dont value = une IP, avec leurs technologies.
    const ipValues = ips.map((i) => i.value);
    const assets =
      ipValues.length > 0
        ? await this.prisma.asset.findMany({
            where: { engagementId, value: { in: ipValues } },
            select: { value: true, technologies: { select: { name: true, categories: true } } },
          })
        : [];
    const cdnByValue = new Map<string, boolean>();
    for (const a of assets) {
      const behind = a.technologies.some(
        (t) =>
          t.categories.includes('cdn') || t.name.startsWith('CDN:') || t.name.startsWith('cloud:'),
      );
      cdnByValue.set(a.value, behind);
    }

    return {
      subdomains: subs.map((s) => ({ canonicalValue: s.canonicalValue, httpStatus: s.httpStatus })),
      ipAddresses: ips.map((i) => ({
        value: i.value,
        cdn: cdnByValue.has(i.value) ? { behind: cdnByValue.get(i.value)! } : undefined,
      })),
      urls: endpoints.map((e) => ({ canonicalUrl: e.canonicalUrl, statusCode: e.statusCode })),
      endpoints: endpoints.map((e) => ({ canonicalUrl: e.canonicalUrl, statusCode: e.statusCode })),
      emails: emails.map((e) => ({ address: e.address })),
    };
  }
}
