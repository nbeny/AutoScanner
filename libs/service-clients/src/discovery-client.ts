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

  /** Discovery-row hygiene passes; see MergeService for why they also repoint Asset FKs. */
  async mergeSubdomains(engagementId: string): Promise<{ merged: number }> {
    return this.post<{ merged: number }>('/internal/discovery/merge/subdomains', { engagementId });
  }

  async mergeIpAddresses(engagementId: string): Promise<{ merged: number }> {
    return this.post<{ merged: number }>('/internal/discovery/merge/ip-addresses', {
      engagementId,
    });
  }

  async parseBatch(req: DiscoveryParseBatchRequest): Promise<DiscoveryParseBatchResponse> {
    return this.post<DiscoveryParseBatchResponse>('/internal/discovery/parse-batch', req);
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.cfg.env.DISCOVERY_SERVICE_URL}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`discovery-service ${res.status} on ${path}: ${text.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  }
}
