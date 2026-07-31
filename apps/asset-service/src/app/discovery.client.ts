import { Injectable } from '@nestjs/common';
import { AppConfigService } from '@autoscanner/config';
import type { DiscoveryEntityRequest, DiscoveryEntityResponse } from '@autoscanner/service-clients';

/**
 * Thin HTTP client to discovery-service.
 *
 * The Asset polymorphic pivot (`domainId`/`subdomainId`/`ipAddressId`) must reference a row
 * owned by discovery-service, so asset-service asks for a get-or-create and links the id it
 * gets back. The two writes are separate transactions on the same database: if the Asset
 * write then fails, the discovery row simply remains — it is legitimate discovery data and
 * the upsert behind it is idempotent.
 */
@Injectable()
export class DiscoveryClient {
  constructor(private readonly cfg: AppConfigService) {}

  async getOrCreateEntity(req: DiscoveryEntityRequest): Promise<DiscoveryEntityResponse> {
    const url = `${this.cfg.env.DISCOVERY_SERVICE_URL}/internal/discovery/entity`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      // Throwing propagates to the caller's parse job, which retries via the Kafka retry
      // topic — the same failure semantics the in-process upsert had.
      throw new Error(
        `discovery-service ${res.status} for ${req.kind} ${req.canonicalValue}: ${body.slice(0, 200)}`,
      );
    }
    return (await res.json()) as DiscoveryEntityResponse;
  }
}
