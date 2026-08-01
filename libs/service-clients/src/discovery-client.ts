import { Injectable } from '@nestjs/common';
import { AppConfigService } from '@autoscanner/config';

import type { DiscoveryParseBatchRequest, DiscoveryParseBatchResponse } from './dto';

/**
 * HTTP client to discovery-service. Failures throw so the caller's job fails and is retried
 * through the Kafka retry topic — matching the pre-split transaction failure semantics.
 */
@Injectable()
export class DiscoveryClient {
  constructor(private readonly cfg: AppConfigService) {}

  async parseBatch(req: DiscoveryParseBatchRequest): Promise<DiscoveryParseBatchResponse> {
    const res = await fetch(
      `${this.cfg.env.DISCOVERY_SERVICE_URL}/internal/discovery/parse-batch`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(req),
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`discovery-service ${res.status} on parse-batch: ${text.slice(0, 200)}`);
    }
    return (await res.json()) as DiscoveryParseBatchResponse;
  }
}
