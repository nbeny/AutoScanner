import { Injectable } from '@nestjs/common';
import { PrismaService } from '@autoscanner/database';
import type { NormalizedTlsCertificate, ParserContext } from '@autoscanner/parsers';
import type { Prisma } from '@prisma/client';

function toValidDate(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

@Injectable()
export class TlsCertificatePersister {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(
    certs: NormalizedTlsCertificate[],
    ctx: ParserContext,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.prisma;
    let count = 0;

    for (const cert of certs) {
      if (!cert.fingerprintSha256 || !cert.host) continue;

      const host = cert.host.toLowerCase();

      const sub = await client.subdomain.findFirst({
        where: { engagementId: ctx.engagementId, canonicalValue: host },
        select: { id: true },
      });
      const subdomainId = sub?.id ?? null;

      const notBefore = toValidDate(cert.notBefore);
      const notAfter = toValidDate(cert.notAfter);

      await client.tlsCertificate.upsert({
        where: {
          engagementId_fingerprintSha256_host: {
            engagementId: ctx.engagementId,
            fingerprintSha256: cert.fingerprintSha256,
            host,
          },
        },
        create: {
          engagementId: ctx.engagementId,
          subdomainId,
          host,
          subjectCn: cert.subjectCn ?? null,
          subjectAn: cert.subjectAn ?? [],
          issuerCn: cert.issuerCn ?? null,
          notBefore,
          notAfter,
          fingerprintSha256: cert.fingerprintSha256,
          tlsVersion: cert.tlsVersion ?? null,
          selfSigned: cert.selfSigned ?? false,
          expired: cert.expired ?? false,
          source: ctx.scannerName,
        },
        update: {
          lastSeenAt: new Date(),
          // Only refresh notBefore when a valid value is present, so a later
          // scan that omits not_before doesn't null out a known date.
          ...(notBefore ? { notBefore } : {}),
          notAfter,
          tlsVersion: cert.tlsVersion ?? null,
          selfSigned: cert.selfSigned ?? false,
          expired: cert.expired ?? false,
          subdomainId,
        },
      });

      count++;
    }

    return count;
  }
}
