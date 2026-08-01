import { Injectable } from '@nestjs/common';
import { AppConfigService } from '@autoscanner/config';

import type { ParseBatchRequest, ParseBatchResponse } from './dto';

/**
 * HTTP client to asset-service.
 *
 * Failures throw so the caller's job fails and is retried through the Kafka retry topic —
 * the same semantics the in-process persisters had when a transaction failed.
 */
@Injectable()
export class AssetClient {
  constructor(private readonly cfg: AppConfigService) {}

  async parseBatch(req: ParseBatchRequest): Promise<ParseBatchResponse> {
    return this.post<ParseBatchResponse>('/internal/assets/parse-batch', req);
  }

  async recomputeRisk(assetId: string): Promise<void> {
    await this.post<{ assetId: string }>(
      `/internal/assets/${encodeURIComponent(assetId)}/recompute-risk`,
      {},
    );
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.cfg.env.ASSET_SERVICE_URL}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`asset-service ${res.status} on ${path}: ${text.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  }
}
