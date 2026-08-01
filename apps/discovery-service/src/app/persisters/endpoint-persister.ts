import { Injectable } from '@nestjs/common';
import { PrismaService } from '@autoscanner/database';
import type { NormalizedEndpoint, ParserContext } from '@autoscanner/parsers';
import type { Prisma } from '@prisma/client';
import { canonicalizeUrl } from '@autoscanner/correlation';

@Injectable()
export class EndpointPersister {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(
    endpoints: NormalizedEndpoint[],
    ctx: ParserContext,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.prisma;
    let count = 0;

    for (const e of endpoints) {
      const canonicalUrl = canonicalizeUrl(e.url);

      let host: string;
      try {
        host = new URL(canonicalUrl).hostname;
        if (!host) throw new Error('empty hostname');
      } catch {
        // Unparseable URL — skip this endpoint
        continue;
      }

      const method = e.method ?? 'GET';

      const subdomain = await client.subdomain.findFirst({
        where: { engagementId: ctx.engagementId, canonicalValue: host },
        select: { id: true },
      });
      const subdomainId = subdomain?.id ?? null;

      await client.endpoint.upsert({
        where: {
          engagementId_canonicalUrl_method: {
            engagementId: ctx.engagementId,
            canonicalUrl,
            method,
          },
        },
        create: {
          engagementId: ctx.engagementId,
          subdomainId,
          url: e.url,
          canonicalUrl,
          method,
          statusCode: e.statusCode ?? null,
          contentLength: e.contentLength ?? null,
          source: ctx.scannerName,
        },
        update: {
          lastSeenAt: new Date(),
          statusCode: e.statusCode ?? null,
          contentLength: e.contentLength ?? null,
          subdomainId,
        },
      });

      count++;
    }

    return count;
  }
}
