import { Injectable } from '@nestjs/common';
import { AppConfigService } from '@autoscanner/config';

/**
 * HTTP client to risk-engine, the single writer of `Asset.riskScore` (SP2b).
 *
 * Failures throw so the caller's job fails and is re-driven through the Kafka retry topic —
 * except asset-service's post-batch recompute, which treats a risk outage as best-effort (a
 * missed score is recomputed by the next parse/correlate pass).
 */
@Injectable()
export class RiskClient {
  constructor(private readonly cfg: AppConfigService) {}

  async recompute(assetId: string): Promise<{ assetId: string; riskScore: number }> {
    return this.post<{ assetId: string; riskScore: number }>('/internal/risk/recompute', {
      assetId,
    });
  }

  async recomputeBatch(assetIds: string[]): Promise<{ recomputed: number }> {
    return this.post<{ recomputed: number }>('/internal/risk/recompute-batch', { assetIds });
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.cfg.env.RISK_ENGINE_URL}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`risk-engine ${res.status} on ${path}: ${text.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  }
}
