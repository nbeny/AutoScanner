import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '@autoscanner/database';
import type {
  DiscoveryParseBatchRequest,
  DiscoveryParseBatchResponse,
} from '@autoscanner/service-clients';

import { DnsRecordPersister } from './persisters/dns-record-persister';
import { EndpointPersister } from './persisters/endpoint-persister';
import { EmailPersister } from './persisters/email-persister';
import { IdentityPersister } from './persisters/identity-persister';
import { BreachExposurePersister } from './persisters/breach-exposure-persister';
import { OrgMetadataPersister } from './persisters/org-metadata-persister';
import { TlsCertificatePersister } from './persisters/tls-certificate-persister';
import { SubdomainIpPersister } from './persisters/subdomain-ip-persister';

/**
 * Persists one parser batch's discovery-side entities.
 *
 * Like the asset side, the whole batch runs in a single transaction so a partially applied
 * batch can never be observed. The persisters keep the signatures they had inside
 * parser-worker, so the move stayed mechanical.
 */
@Injectable()
export class DiscoveryBatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dnsRecords: DnsRecordPersister,
    private readonly endpoints: EndpointPersister,
    private readonly emails: EmailPersister,
    private readonly identities: IdentityPersister,
    private readonly breachExposures: BreachExposurePersister,
    private readonly orgMetadata: OrgMetadataPersister,
    private readonly tlsCertificates: TlsCertificatePersister,
    private readonly subdomainIps: SubdomainIpPersister,
  ) {}

  async persist(req: DiscoveryParseBatchRequest): Promise<DiscoveryParseBatchResponse> {
    const ctx = {
      engagementId: req.engagementId,
      scanJobId: req.scanJobId,
      scannerName: req.scannerName,
      target: req.target,
    };

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      let dnsRecordsPersisted = 0;
      for (const record of req.dnsRecords) {
        await this.dnsRecords.upsert(req.engagementId, record as never, tx);
        dnsRecordsPersisted++;
      }

      const endpointsPersisted = req.endpoints.length
        ? await this.endpoints.upsert(req.endpoints as never, ctx as never, tx)
        : 0;
      const emailsPersisted = req.emails.length
        ? await this.emails.upsert(req.emails as never, ctx as never, tx)
        : 0;
      const identitiesPersisted = req.identities.length
        ? await this.identities.upsert(req.identities as never, ctx as never, tx)
        : 0;
      const breachExposuresPersisted = req.breachExposures.length
        ? await this.breachExposures.upsert(req.breachExposures as never, ctx as never, tx)
        : 0;
      const orgMetadataPersisted = req.orgMetadata.length
        ? await this.orgMetadata.upsert(req.orgMetadata as never, ctx as never, tx)
        : 0;
      const tlsCertificatesPersisted = req.tlsCertificates.length
        ? await this.tlsCertificates.upsert(req.tlsCertificates as never, ctx as never, tx)
        : 0;

      // Subdomain <-> IP links: both sides must already exist (they are created by the
      // asset-side pivot resolution earlier in the same parse job). Pairs whose rows are
      // missing are skipped rather than created blind.
      let subdomainIpsPersisted = 0;
      const linkedHosts: string[] = [];
      for (const link of req.subdomainIpLinks) {
        const subdomain = await tx.subdomain.findFirst({
          where: { engagementId: req.engagementId, canonicalValue: link.canonicalHost },
          select: { id: true },
        });
        if (!subdomain) continue;
        const ipAddress = await tx.ipAddress.findFirst({
          where: { engagementId: req.engagementId, canonicalValue: link.canonicalIp },
          select: { id: true },
        });
        if (!ipAddress) continue;

        await this.subdomainIps.upsert(subdomain.id, ipAddress.id, tx);
        subdomainIpsPersisted++;
        linkedHosts.push(link.canonicalHost);
      }

      return {
        dnsRecordsPersisted,
        endpointsPersisted,
        emailsPersisted,
        identitiesPersisted,
        breachExposuresPersisted,
        orgMetadataPersisted,
        tlsCertificatesPersisted,
        subdomainIpsPersisted,
        linkedHosts,
      };
    });
  }
}
